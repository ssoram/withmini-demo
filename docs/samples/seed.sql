-- withmini Demo Mode — 로컬 테스트용 시드 데이터
-- Supabase 대시보드 → SQL Editor에서 실행 (postgres 권한으로 실행되므로 RLS 영향 없음)

-- 1) 컨셉 2개 (스펙 4.2: 카드형 UI로 2개 컨셉 표시)
insert into public.concepts (name, is_visible, display_order)
values
  ('미니멀 컨셉', true, 1),
  ('시네마 컨셉', true, 2)
on conflict do nothing;

-- 2) 관리자 계정 연결
-- 먼저 대시보드 → Authentication → Users → "Add user"로 이메일/비밀번호 유저를 만들고
-- (Auto Confirm 체크), 생성된 유저의 UUID를 아래에 붙여넣은 뒤 이 블록의 주석을 풀어 실행하세요.
--
-- insert into public.admins (id, name, role, is_active)
-- values ('여기에-auth-유저-UUID', '관리자', 'super_admin', true)
-- on conflict (id) do update set role = 'super_admin', is_active = true;

-- (선택) 3) 프레임을 SQL로 직접 넣고 싶을 때 참고용.
-- 권장 경로는 admin 앱(localhost:5174)의 프레임 관리 화면에서
-- docs/samples/frame-4cut-sample.png 를 업로드해 등록하는 것입니다 (admin 앱 E2E 테스트도 겸함).
-- layout_data는 아래 값을 그대로 사용하세요 (0~1 비율 좌표, frame-4cut-sample.png 기준):
--
-- {"slots":[
--   {"x":0.05,  "y":0.0333, "width":0.425, "height":0.3667},
--   {"x":0.525, "y":0.0333, "width":0.425, "height":0.3667},
--   {"x":0.05,  "y":0.4333, "width":0.425, "height":0.3667},
--   {"x":0.525, "y":0.4333, "width":0.425, "height":0.3667}
-- ]}
