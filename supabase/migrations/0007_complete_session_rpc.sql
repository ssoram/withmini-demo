-- withmini Demo Mode — complete_session RPC (긴급 버그 수정)
-- 배경: PostgreSQL은 UPDATE 실행 시 WHERE절로 대상 행을 읽는 단계에서도 SELECT 정책을 요구한다.
-- 0005_sessions_select_hardening.sql에서 anon SELECT 정책을 제거하면서, booth가 촬영 완료 시
-- 수행하던 sessions UPDATE(.eq('id', sessionId))가 PostgREST 기준 204(성공처럼 보임)를 반환하면서도
-- 실제로는 대상 행을 0건 갱신하는 문제가 발생했다(curl로 재현 확인: PATCH 204 이후에도
-- get-session-media가 계속 status='in_progress'를 반환 — 모든 세션이 영원히 완료되지 않음).
--
-- 해결: anon SELECT는 계속 차단한 채로, "촬영 완료 처리"만 허용하는 security definer RPC를 추가한다.
-- RPC는 함수 소유자(테이블 소유자) 권한으로 실행되어 RLS를 우회하므로 SELECT 정책과 무관하게 동작하고,
-- 함수 내부에서 상태 전이 조건(존재 + in_progress + 미만료)을 직접 검증하므로 임의 update보다 오히려
-- 공격면이 좁아진다. 이 참에 anon 대상 update 정책 자체도 제거해 이 RPC 외의 경로로는 anon이 sessions를
-- 갱신할 수 없도록 한다(booth의 세션 생성(INSERT)은 영향 없음, sessions_insert_anon_and_admin 유지).
--
-- 0001_init.sql / 0005_sessions_select_hardening.sql의 sessions 테이블 컬럼/타입은 변경하지 않는다
-- (CLAUDE.md 섹션 3 — 계약 준수, RLS 정책 + RPC 함수만 추가/교체).

-- ---------------------------------------------------------------------------
-- 1. complete_session RPC
--    booth-builder가 이 시그니처로 병렬 작업 중이므로 정확히 아래 그대로 유지한다.
-- ---------------------------------------------------------------------------
create or replace function public.complete_session(
  p_session_id uuid,
  p_raw_photo_urls jsonb,
  p_selected_photo_urls jsonb,
  p_result_image_url text,
  p_qr_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_expires_at timestamptz;
begin
  select status, expires_at
    into v_status, v_expires_at
    from public.sessions
    where id = p_session_id
    for update;

  if not found then
    raise exception 'complete_session: session % not found', p_session_id;
  end if;

  if v_status <> 'in_progress' then
    raise exception 'complete_session: session % is not in_progress (status=%)', p_session_id, v_status;
  end if;

  if v_expires_at is null or v_expires_at <= now() then
    raise exception 'complete_session: session % has expired', p_session_id;
  end if;

  -- expires_at은 건드리지 않는다(0003_infra_hardening.sql의 sessions_protect_expires_at 트리거와도 무관).
  update public.sessions
  set
    raw_photo_urls = p_raw_photo_urls,
    selected_photo_urls = p_selected_photo_urls,
    result_image_url = p_result_image_url,
    qr_url = p_qr_url,
    status = 'completed'
  where id = p_session_id;
end;
$$;

revoke all on function public.complete_session(uuid, jsonb, jsonb, text, text) from public;
grant execute on function public.complete_session(uuid, jsonb, jsonb, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. sessions UPDATE 정책 교체
--    anon용 update 정책은 0005 이후 사실상 전부 no-op(SELECT 정책 부재로 대상 행을 읽지 못해 0건 갱신)였고,
--    이제 완료 처리는 위 RPC로만 이루어지므로 남겨둘 실익이 없다. super_admin 전용으로 좁힌다
--    (세션 수동 정리 등 관리자 작업 대비, 스펙 5.4).
-- ---------------------------------------------------------------------------
drop policy if exists sessions_update_anon_and_admin on public.sessions;

create policy sessions_update_admin
  on public.sessions for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- sessions_insert_anon_and_admin(0001_init.sql)은 그대로 유지한다 — booth의 세션 생성(INSERT)에는
-- 영향이 없다.
