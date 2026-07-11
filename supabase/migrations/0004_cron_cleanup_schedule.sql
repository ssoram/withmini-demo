-- withmini Demo Mode — cleanup-expired-sessions 스케줄링 (스펙 섹션 6)
-- pg_cron + pg_net을 사용해 매시간 정각에 cleanup-expired-sessions Edge Function을 호출한다.
--
-- 사전 준비(수동, 1회, Supabase 대시보드 SQL Editor 또는 CLI에서 실행 — 이 리포에는 시크릿을 커밋하지 않는다):
--   1) service_role 키를 Vault에 저장:
--        select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY>', 'cleanup_function_service_role_key');
--   2) 아래 project_ref 플레이스홀더를 실제 프로젝트 참조로 교체(또는 environment별로 이 파일을 복사해 사용).
--
-- 로컬에는 연결된 Supabase 프로젝트가 없어 이 마이그레이션은 문법 검토 수준으로 작성되었다.
-- 적용 시 `supabase db push` 또는 대시보드 SQL Editor에서 실행하고, 위 사전 준비를 반드시 먼저 완료할 것.
-- 대안: pg_cron/pg_net 대신 Vercel Cron(또는 GitHub Actions schedule)이 매시간
--   POST https://<project-ref>.supabase.co/functions/v1/cleanup-expired-sessions
--   Authorization: Bearer <service_role key>
-- 를 호출하도록 구성해도 동일한 효과를 낸다 (docs/infra-security-notes.md 참고).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select
  cron.schedule(
    'cleanup-expired-sessions-hourly',
    '0 * * * *',
    $$
    select
      net.http_post(
        url := 'https://<project-ref>.supabase.co/functions/v1/cleanup-expired-sessions',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_function_service_role_key')
        ),
        body := '{}'::jsonb
      );
    $$
  )
where not exists (
  select 1 from cron.job where jobname = 'cleanup-expired-sessions-hourly'
);
