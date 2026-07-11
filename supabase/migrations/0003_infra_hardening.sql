-- withmini Demo Mode — infra-agent 보안 강화 마이그레이션
-- docs/withmini_demo_spec.md 섹션 6(TTL), 9(보안 체크리스트) 반영.
-- 0001_init.sql / 0002_storage_buckets.sql의 스키마(테이블 컬럼/타입)는 건드리지 않는다.
-- 이 파일은 RLS/Storage 정책만 추가/교체한다 (CLAUDE.md 섹션 3 — 계약 준수).
--
-- 설계 배경 및 트레이드오프는 docs/infra-security-notes.md에 상세히 남겨둔다. 요약:
--   1. 세션 관련 Storage 버킷(session-raw/session-results/session-timelapse)의 "누구나 select" 정책을
--      제거한다. 공개(비로그인) 클라이언트는 더 이상 이 버킷의 오브젝트를 직접 read할 수 없고,
--      Edge Function `get-session-media`(service_role, RLS 우회)를 통해 발급된 signed URL로만 접근한다.
--   2. booth 앱은 로그인 없이 anon key로 업로드해야 하므로 insert/update(upsert) 자체는 anon에게 열어두되,
--      업로드 경로의 첫 세그먼트({sessionId})가 실제 존재하는, 삭제/만료되지 않은 세션인지 확인하는
--      helper function으로 최소한의 검증을 추가한다 (완전한 소유권 검증은 아님 — 데모모드는 로그인이 없어
--      "이 브라우저가 만든 세션인지"까지는 RLS로 구분할 수 없다는 한계가 있고, 이는 문서화된 잔여 위험이다).
--   3. 관리자(super_admin) 페이지의 "세션 수동 삭제" 기능(admin/src/routes/Sessions.tsx)은 삭제 전
--      파일 목록 확인을 위해 storage.objects를 list(select)해야 하므로, super_admin에게는 read 권한을 유지한다.
--   4. sessions.expires_at을 anon이 임의로 늘려 TTL을 우회하지 못하도록 트리거로 고정한다.
--   5. settings.retention_hours 값이 스펙 범위(24~48시간)를 벗어나지 못하도록 트리거로 검증한다.

-- ---------------------------------------------------------------------------
-- 1. helper functions
-- ---------------------------------------------------------------------------

-- storage.objects.name은 '{sessionId}/{filename}' 형태다. 첫 세그먼트를 uuid로 파싱한다.
-- 형식이 아니면 null을 반환한다(정책에서 false로 평가되어 업로드가 거부된다).
create or replace function public.storage_session_id(path text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(path, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

-- 업로드 대상 세션이 "삭제되지 않고, 아직 만료되지 않은" 상태인지 확인한다.
-- security definer로 만들어 anon 역할이 sessions 테이블 SELECT 정책과 무관하게 이 최소 확인만 할 수 있게 한다.
create or replace function public.session_is_active(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions
    where id = p_session_id
      and status <> 'deleted'
      and expires_at > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. session-raw / session-results / session-timelapse: anon 직접 read 제거,
--    super_admin read 유지(관리자 수동 삭제 시 파일 목록 확인용, 내용 미노출),
--    anon insert/update는 "유효한 세션 경로"로만 범위를 좁힌다.
-- ---------------------------------------------------------------------------

drop policy if exists session_raw_anon_read on storage.objects;
drop policy if exists session_results_anon_read on storage.objects;
drop policy if exists session_timelapse_anon_read on storage.objects;

drop policy if exists session_raw_anon_write on storage.objects;
drop policy if exists session_results_anon_write on storage.objects;
drop policy if exists session_timelapse_anon_write on storage.objects;

create policy session_raw_admin_read
  on storage.objects for select
  using (bucket_id = 'session-raw' and public.is_super_admin());

create policy session_results_admin_read
  on storage.objects for select
  using (bucket_id = 'session-results' and public.is_super_admin());

create policy session_timelapse_admin_read
  on storage.objects for select
  using (bucket_id = 'session-timelapse' and public.is_super_admin());

create policy session_raw_write_active_session
  on storage.objects for insert
  with check (bucket_id = 'session-raw' and public.session_is_active(public.storage_session_id(name)));

create policy session_raw_update_active_session
  on storage.objects for update
  using (bucket_id = 'session-raw' and public.session_is_active(public.storage_session_id(name)))
  with check (bucket_id = 'session-raw' and public.session_is_active(public.storage_session_id(name)));

create policy session_results_write_active_session
  on storage.objects for insert
  with check (bucket_id = 'session-results' and public.session_is_active(public.storage_session_id(name)));

create policy session_results_update_active_session
  on storage.objects for update
  using (bucket_id = 'session-results' and public.session_is_active(public.storage_session_id(name)))
  with check (bucket_id = 'session-results' and public.session_is_active(public.storage_session_id(name)));

create policy session_timelapse_write_active_session
  on storage.objects for insert
  with check (bucket_id = 'session-timelapse' and public.session_is_active(public.storage_session_id(name)));

create policy session_timelapse_update_active_session
  on storage.objects for update
  using (bucket_id = 'session-timelapse' and public.session_is_active(public.storage_session_id(name)))
  with check (bucket_id = 'session-timelapse' and public.session_is_active(public.storage_session_id(name)));

-- session_raw_admin_delete / session_results_admin_delete / session_timelapse_admin_delete는
-- 0002_storage_buckets.sql에서 이미 super_admin으로 스코프되어 있으므로 그대로 유지한다(변경 없음).

-- ---------------------------------------------------------------------------
-- 3. sessions.expires_at 임의 연장 방지
--    anon은 로그인 없이 자기 세션 row를 update할 수 있어야 하므로(스펙 4.4~4.6 촬영 플로우),
--    update 자체는 막지 않되 expires_at 컬럼만 서버가 지킨다. super_admin/service_role만 변경 가능.
-- ---------------------------------------------------------------------------

create or replace function public.sessions_protect_expires_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expires_at is distinct from old.expires_at then
    if not (auth.role() = 'service_role' or public.is_super_admin()) then
      new.expires_at := old.expires_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger sessions_protect_expires_at
  before update on public.sessions
  for each row execute function public.sessions_protect_expires_at();

-- ---------------------------------------------------------------------------
-- 4. settings.retention_hours 범위(24~48시간) 검증 — 스펙 섹션 6.
-- ---------------------------------------------------------------------------

create or replace function public.settings_validate_retention_hours()
returns trigger
language plpgsql
as $$
begin
  if new.key = 'retention_hours' then
    if new.value !~ '^[0-9]+$' or new.value::int < 24 or new.value::int > 48 then
      raise exception 'settings.retention_hours must be an integer between 24 and 48 (got: %)', new.value;
    end if;
  end if;
  return new;
end;
$$;

create trigger settings_validate_retention_hours
  before insert or update on public.settings
  for each row execute function public.settings_validate_retention_hours();
