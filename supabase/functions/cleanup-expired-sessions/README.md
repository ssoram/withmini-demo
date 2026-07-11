# cleanup-expired-sessions

infra-agent가 구현 완료 (스펙 섹션 6). 구현 파일: `index.ts`.
설계 근거, 스케줄링 방식, 수동 실행 방법은 `docs/infra-security-notes.md` 1~2절 참고.

요약:
- `expires_at < now()` 이거나(설정 변경 즉시 반영을 위해) `created_at + settings.retention_hours < now()` 인,
  `status != 'deleted'` 세션을 조회한다.
- `session-raw` / `session-results` / `session-timelapse` 버킷의 `{sessionId}/` 하위 파일을 모두 삭제한다.
- `sessions` row를 완전 삭제한다.
- 스케줄: `supabase/migrations/0004_cron_cleanup_schedule.sql` (`pg_cron`, 매시간). 대안으로 Vercel Cron 등 외부
  스케줄러를 이 함수 URL에 POST 하도록 구성해도 된다.
