-- withmini Demo Mode — 초기 스키마
-- docs/withmini_demo_spec.md 섹션 2(데이터 모델)를 그대로 반영한다.
-- 이 마이그레이션이 적용된 이후 스키마는 "변경 불가 계약"으로 취급한다 (CLAUDE.md 섹션 3).
-- 변경이 필요하면 architect 승인 후 이 파일이 아닌 새 마이그레이션 파일을 추가하고,
-- docs/withmini_demo_spec.md / packages/shared/src/types.ts를 함께 갱신한다.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- admins
-- Supabase Auth의 auth.users를 그대로 사용하고, 역할 구분을 위한 프로필 테이블을 둔다.
-- ---------------------------------------------------------------------------
create table public.admins (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  role text not null default 'staff' check (role in ('super_admin', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.admins is '관리자 프로필. id는 auth.users.id와 동일.';

-- ---------------------------------------------------------------------------
-- admin_audit_logs
-- ---------------------------------------------------------------------------
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admins (id) on delete cascade,
  action text not null,
  target_table text not null,
  target_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_admin_id_idx on public.admin_audit_logs (admin_id);
create index admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- concepts
-- ---------------------------------------------------------------------------
create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_visible boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index concepts_is_visible_display_order_idx on public.concepts (is_visible, display_order);

-- ---------------------------------------------------------------------------
-- frames
-- ---------------------------------------------------------------------------
create table public.frames (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts (id) on delete cascade,
  name text not null,
  slot_count int not null check (slot_count > 0),
  preview_image_url text,
  layout_data jsonb,
  frame_video_url text,
  is_active boolean not null default true,
  is_general boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index frames_concept_id_idx on public.frames (concept_id);
create index frames_active_general_idx on public.frames (is_active, is_general);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts (id),
  frame_id uuid not null references public.frames (id),
  raw_photo_urls jsonb not null default '[]'::jsonb,
  selected_photo_urls jsonb not null default '[]'::jsonb,
  result_image_url text,
  timelapse_video_url text,
  qr_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'expired', 'deleted'))
);

create index sessions_status_idx on public.sessions (status);
create index sessions_expires_at_idx on public.sessions (expires_at);
create index sessions_concept_id_idx on public.sessions (concept_id);
create index sessions_frame_id_idx on public.sessions (frame_id);

comment on table public.sessions is '촬영 세션 = 결과물. 관리자 페이지에서도 개별 사진은 조회하지 않는다 (스펙 섹션 5.4).';

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values ('retention_hours', '24');

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신 트리거
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger concepts_set_updated_at
  before update on public.concepts
  for each row execute function public.set_updated_at();

create trigger frames_set_updated_at
  before update on public.frames
  for each row execute function public.set_updated_at();

create function public.settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.settings_set_updated_at();

-- ---------------------------------------------------------------------------
-- 권한 헬퍼 함수
-- security definer로 만들어 admins 테이블 RLS와 순환 참조 없이 role을 확인한다.
-- ---------------------------------------------------------------------------
create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where id = auth.uid()
      and role = 'super_admin'
      and is_active = true
  );
$$;

create function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where id = auth.uid()
      and is_active = true
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS 활성화 (스펙 섹션 9) — 모든 테이블 기본 접근 차단, 명시적 정책만 허용.
-- 아래 정책은 다른 서브에이전트가 막히지 않도록 만든 최소 baseline이다.
-- signed URL 방식 등 세부 보안 강화는 infra-agent(섹션 6, 9)가 최종 정리한다.
-- ---------------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.concepts enable row level security;
alter table public.frames enable row level security;
alter table public.sessions enable row level security;
alter table public.settings enable row level security;

-- admins: 본인 행 조회, super_admin은 전체 조회/관리
create policy admins_select_self_or_super_admin
  on public.admins for select
  using (id = auth.uid() or public.is_super_admin());

create policy admins_insert_super_admin
  on public.admins for insert
  with check (public.is_super_admin());

create policy admins_update_super_admin
  on public.admins for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy admins_delete_super_admin
  on public.admins for delete
  using (public.is_super_admin());

-- admin_audit_logs: 활성 관리자는 자기 행동 기록 가능, super_admin만 조회
create policy admin_audit_logs_insert_active_admin
  on public.admin_audit_logs for insert
  with check (admin_id = auth.uid() and public.is_active_admin());

create policy admin_audit_logs_select_super_admin
  on public.admin_audit_logs for select
  using (public.is_super_admin());

-- concepts: 공개(anon)는 노출된 컨셉만, 관리자는 전체 조회 + super_admin만 쓰기
create policy concepts_select_public
  on public.concepts for select
  using (is_visible = true or public.is_active_admin());

create policy concepts_insert_super_admin
  on public.concepts for insert
  with check (public.is_super_admin());

create policy concepts_update_super_admin
  on public.concepts for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy concepts_delete_super_admin
  on public.concepts for delete
  using (public.is_super_admin());

-- frames: 공개(anon)는 활성+일반 프레임만, 관리자는 전체 조회 + super_admin만 쓰기
create policy frames_select_public
  on public.frames for select
  using ((is_active = true and is_general = true) or public.is_active_admin());

create policy frames_insert_super_admin
  on public.frames for insert
  with check (public.is_super_admin());

create policy frames_update_super_admin
  on public.frames for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy frames_delete_super_admin
  on public.frames for delete
  using (public.is_super_admin());

-- sessions: booth(anon)가 로그인 없이 직접 생성/갱신하는 구조이므로 anon insert/update/select를 허용한다.
-- session id(uuid)는 추측 불가능하다는 전제로 공개 read를 허용하되(스펙 섹션 9),
-- 이는 baseline이며 infra-agent가 Edge Function 경유 방식 등으로 강화를 검토한다.
create policy sessions_select_anon_and_admin
  on public.sessions for select
  using (true);

create policy sessions_insert_anon_and_admin
  on public.sessions for insert
  with check (true);

create policy sessions_update_anon_and_admin
  on public.sessions for update
  using (status <> 'deleted')
  with check (true);

create policy sessions_delete_super_admin
  on public.sessions for delete
  using (public.is_super_admin());

-- settings: 누구나 읽기 가능(TTL 값 등 클라이언트에서 필요), super_admin만 쓰기
create policy settings_select_all
  on public.settings for select
  using (true);

create policy settings_insert_super_admin
  on public.settings for insert
  with check (public.is_super_admin());

create policy settings_update_super_admin
  on public.settings for update
  using (public.is_super_admin())
  with check (public.is_super_admin());
