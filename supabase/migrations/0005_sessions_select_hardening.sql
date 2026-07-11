-- withmini Demo Mode — sessions 테이블 anon SELECT 제한
-- docs/withmini_demo_spec.md 섹션 9(보안 체크리스트) 반영. 0001_init.sql의 sessions 테이블
-- 컬럼/타입은 건드리지 않는다 — RLS 정책만 교체한다 (CLAUDE.md 섹션 3 — 계약 준수).
--
-- 배경(설계 검토 결과 요약, 상세는 docs/infra-security-notes.md 참고):
--   0001_init.sql이 만든 sessions_select_anon_and_admin(using(true)) 정책은 booth가 로그인 없이
--   자기 세션 row를 읽어야 한다는 가정으로 만든 baseline이었으나, 실제 코드를 전수 조사한 결과
--   booth의 insert/update는 .select()를 체이닝하지 않아 SELECT 권한이 전혀 필요하지 않았고,
--   유일하게 남아있던 anon read 경로(Qr.tsx, PrintAnimation.tsx 폴백)도 로컬 계산값 또는
--   get-session-media Edge Function(service_role)으로 대체 가능함을 확인했다.
--   `using(true)`는 행 단위로 평가되어 쿼리의 WHERE절 모양과 무관하게 전체 세션 id를 나열할 수
--   있게 해줘서, "세션 ID(UUID)로 URL 추측 불가능"이라는 설계 의도를 열거(enumeration)로 무력화하는
--   문제가 있었다. 따라서 anon SELECT는 완전히 제거하고, 관리자(super_admin/staff)만 조회 가능하도록
--   좁힌다. service_role은 RLS를 우회하므로 get-session-media / cleanup-expired-sessions Edge
--   Function은 이 변경과 무관하게 그대로 동작한다. anon INSERT/UPDATE는 booth 촬영 플로우(스펙
--   4.4~4.6)에 필요하므로 그대로 유지한다(0003_infra_hardening.sql의 session_is_active() 검증도 유지).

drop policy if exists sessions_select_anon_and_admin on public.sessions;

create policy sessions_select_admin
  on public.sessions for select
  using (public.is_active_admin());
