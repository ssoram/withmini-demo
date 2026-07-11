# infra-setup 구현 노트 (TTL / RLS / Storage 정책 / 배포)

이 문서는 `docs/withmini_demo_spec.md` 섹션 6(TTL), 9(보안 체크리스트) 구현을 위해 infra-agent가
추가한 마이그레이션/Edge Function/배포 설정의 설계 근거와 트레이드오프를 기록한다.
스키마(테이블 컬럼/타입)는 변경하지 않았다 — `supabase/migrations/0001_init.sql`,
`0002_storage_buckets.sql`은 architect의 계약 그대로이며, 이 문서가 다루는 내용은
`0003_infra_hardening.sql`, `0004_cron_cleanup_schedule.sql`, `0005_sessions_select_hardening.sql`(파이프라인
완료 후 후속 보안 강화 라운드에서 추가, 3절 참고)과 두 개의 Edge Function이다.

## 1. TTL 정리 — `cleanup-expired-sessions`

- 파일: `supabase/functions/cleanup-expired-sessions/index.ts`
- `settings.retention_hours`(기본 24, 24~48로 클램프)를 읽어 cutoff 시각을 계산하고,
  `status <> 'deleted' AND (expires_at < now() OR created_at < cutoff)` 인 세션을 대상으로 한다.
  - `expires_at`만 보면 관리자가 나중에 보관 기간을 조정해도 이미 만들어진 세션에는 소급 적용되지 않는다.
    `created_at + retention_hours` 기준도 함께 확인해 설정 변경이 기존 세션에도 즉시 반영되게 했다.
- 세 버킷(`session-raw`, `session-results`, `session-timelapse`)에서 `{sessionId}/` 하위 파일을 모두 나열 후 삭제하고,
  이후 `sessions` row를 완전 삭제한다. 통계는 별도 집계 테이블을 만들지 않았다 — 스키마 계약 변경(새 테이블)이
  필요한 결정이라 판단해 임의로 추가하지 않고, 관리자 통계(`/admin/sessions`)는 삭제되기 전 시점까지의
  `sessions` row를 직접 집계하는 현재 구현(admin-builder)으로 충분하다고 보았다. 삭제된 세션까지 포함한
  누적 통계가 필요해지면 별도 태스크로 `architect` 승인 후 집계 테이블을 추가해야 한다.
- 실패한 세션 하나 때문에 전체가 멈추지 않도록 세션 단위로 처리하고 결과를 배열로 반환한다.

**수동 실행 방법 (배포 후)**
```
curl -X POST https://<project-ref>.supabase.co/functions/v1/cleanup-expired-sessions \
  -H "Authorization: Bearer <service_role key>"
```
응답 예: `{ ok: true, retentionHours: 24, candidateCount: 2, deletedCount: 2, results: [...] }`

## 2. 스케줄링

- `supabase/migrations/0004_cron_cleanup_schedule.sql`에 `pg_cron` + `pg_net` 기반 매시간(`0 * * * *`) 스케줄을 작성했다.
- 로컬에 연결된 Supabase 프로젝트가 없어 실제 적용/검증은 하지 못했다. 적용 전 반드시:
  1. `select vault.create_secret('<service_role key>', 'cleanup_function_service_role_key');` 로 키를 Vault에 저장 (레포에는 키를 커밋하지 않는다)
  2. 마이그레이션 파일의 `<project-ref>` 플레이스홀더를 실제 프로젝트 참조로 교체
  3. `supabase db push` 또는 대시보드 SQL Editor에서 적용
- 대안: pg_cron 대신 Vercel Cron(또는 GitHub Actions `schedule`)에서 동일한 엔드포인트를 매시간 POST 해도 된다.
  이 경우 `SUPABASE_SERVICE_ROLE_KEY`는 Vercel 프로젝트의 서버 전용 환경변수(크론 잡 전용, 3개 프론트 프로젝트에는 등록하지 않음)로 저장한다.

## 3. Storage 정책 강화 — signed URL 전용 접근

architect가 Phase 0에 남긴 baseline(`0002_storage_buckets.sql`)은 세션 버킷에 대해 `anon` 포함 누구나 읽을 수
있는(`using (bucket_id = '...')`, role 제한 없음) select 정책을 두고 있었다. `0003_infra_hardening.sql`에서 이를 다음처럼 바꿨다.

| 버킷 | 기존(baseline) | 변경 후 |
|---|---|---|
| `frame-previews`, `frame-videos` | 공개 read, super_admin write | **변경 없음** (스펙대로 공개 읽기 유지) |
| `session-raw` / `session-results` / `session-timelapse` | 누구나 read, 누구나 insert | **anon read 제거**. super_admin만 read(목록 확인용, 내용 미노출). anon insert/update는 업로드 경로의 `{sessionId}`가 실제 존재하고 삭제/만료되지 않은 세션일 때만 허용 |

**공개(비로그인) 클라이언트가 세션 결과물을 읽는 유일한 경로는 `get-session-media` Edge Function이다.**
이 함수는 service_role로 동작해 RLS를 우회하고, `sessionId`를 명시적으로 받아 해당 세션이
`status = 'completed'`이고 만료되지 않았을 때만 `createSignedUrl`로 짧은 유효기간(1시간)의 서명 URL을 발급한다.
`raw_photo_urls`/`selected_photo_urls`는 응답에 절대 포함하지 않는다.

### integrator(qr-and-result)에게 필요한 계약

- `result` 앱(`/result/:sessionId`)은 Supabase Storage를 직접 호출하지 말고 이 함수를 호출해야 한다.
  ```ts
  const { data, error } = await supabase.functions.invoke('get-session-media', {
    body: { sessionId },
  })
  // data: { status: 'completed', resultImageUrl, timelapseVideoUrl, frameVideoUrl, expiresAt, signedUrlTtlSeconds }
  // status가 'expired' | 'not_found' | 'in_progress' 등이면 스펙 4.9의 만료/미완료 안내 화면을 보여준다.
  ```
- `sessions.result_image_url` / `sessions.timelapse_video_url` 컬럼에는 **Storage 오브젝트 경로**(예:
  `"{sessionId}/result.jpg"`, `supabase.storage.from('session-results').upload(...)` 호출 후 받는 `data.path` 값)를
  저장하는 것을 규약으로 한다. 버킷이 비공개라 공개 URL(getPublicUrl)은 애초에 열리지 않으므로, booth 쪽에서
  업로드 후 자연스럽게 얻는 경로 문자열을 그대로 저장하면 된다. (`get-session-media`는 혹시 완전한 URL이 저장된
  경우도 버킷명 뒤 경로만 추출하도록 방어적으로 처리해뒀다.)
- `frames.frame_video_url`은 기존과 동일하게 공개 버킷(`frame-videos`)의 공개 URL을 그대로 사용하면 된다 — 서명 불필요.

### 트레이드오프 / 잔여 위험

- booth 앱은 로그인 없이 anon key로 동작해야 하므로, `sessions`/`storage.objects` insert 자체를
  "이 브라우저가 만든 세션인지"까지는 RLS로 구분하지 못한다(Postgres RLS는 행 값만 볼 수 있고 auth가 없으면
  "누가 요청했는지"를 구분할 수 없다). `session_is_active()` 체크로 "존재하고 만료/삭제되지 않은 세션 폴더에만
  업로드 가능"까지는 좁혔지만, 완전한 소유권 검증은 아니다. **[잔여 위험, 유지]** `docs/withmini_demo_spec.md`
  섹션 10에 향후 과제로 명문화되어 있다: 정식 서비스 전환 시 쓰기 경로(INSERT/UPDATE)도 service_role 기반
  Edge Function을 경유하도록 전환하는 것을 고려한다. 완전한 소유권 바인딩이 필요해지면 booth 태블릿마다
  `supabase.auth.signInAnonymously()`로 익명 세션을 발급하고 `sessions.created_by`(신규 컬럼, 스키마 변경 필요 —
  architect 승인 필요)로 묶는 방안도 대안으로 남아 있다.
- **[해결됨 — 파이프라인 완료 후 후속 보안 강화 라운드]** `sessions` 테이블 자체의 `select` 정책.
  이 문서 초판에서는 baseline(`using (true)`, anon도 전체 조회 가능)을 booth-flow의 `.insert().select()` /
  `.update().select()` 패턴과의 충돌 우려로 그대로 두었었다. 파이프라인의 6개 task가 모두 `APPROVED`된 뒤
  architect가 실제 코드를 전수 조사한 결과, booth의 insert/update는 `.select()`를 체이닝하지 않아 SELECT
  권한이 애초에 필요 없었고, 유일하게 남아 있던 anon read 경로(`Qr.tsx`의 `qr_url` 재조회, `PrintAnimation.tsx`의
  결과 이미지 폴백 조회)도 로컬 계산값 또는 `get-session-media` Edge Function으로 완전히 대체 가능함을
  확인했다. 검토된 옵션 3가지:
  - (a) 소유권 컬럼(`created_by`) + 세션별 익명 JWT 발급 — 스키마 변경 + 신규 Edge Function 필요, 데모 범위 대비 과함
  - (b) 스키마 변경 없이 anon SELECT 정책 제거 + booth/animation 쪽 코드 소폭 조정 — **채택**
  - (c) booth 쓰기(insert/update)까지 Edge Function 경유로 전환 — 이는 바로 위 "쓰기 오남용" 잔여 위험에 대한
    해법이지 select 열거(enumeration) 문제의 해법은 아니므로 이번 이슈에는 적용하지 않고 향후 과제로만 남김

  (b)안을 채택해 `supabase/migrations/0005_sessions_select_hardening.sql`을 추가했다(0001~0004는 미수정):
  `sessions_select_anon_and_admin`(`using(true)`) 정책을 삭제하고, `is_active_admin()` 기반의
  `sessions_select_admin` 정책으로 교체했다 — 이제 `sessions` 테이블은 인증된 활성 관리자만 SELECT할 수
  있고 anon은 완전히 차단된다(anon INSERT/UPDATE는 촬영 플로우에 필요하므로 그대로 유지, `session_is_active()`
  검증도 유지). 함께 반영된 변경:
  - `docs/withmini_demo_spec.md` 섹션 9에 "`sessions` 테이블 anon SELECT 제한" 항목 추가, 섹션 10에 위
    "쓰기 경로 Edge Function 전환(향후)" 잔여 위험을 명문화
  - `packages/shared/src/getSessionMedia.ts` 신설(`index.ts`에서 `export * from './getSessionMedia'`) —
    `fetchSessionMedia(sessionId)`가 `get-session-media` 호출과 2xx 이외 응답(404/409/410 등) 파싱까지
    캡슐화한 공용 모듈. `apps/result`에 있던 개별 `getSessionMedia.ts`는 삭제하고 이 공용 모듈로 통합했다.
  - `apps/booth/src/routes/Qr.tsx`: 0005 적용 후 어차피 항상 실패했을 `sessions.select('qr_url')` 조회를
    제거하고, `${VITE_RESULT_BASE_URL}/${sessionId}` 로컬 계산값만 사용하도록 정리
  - `apps/booth/src/routes/PrintAnimation.tsx`: 결과 이미지 폴백 조회를 `fetchSessionMedia`(signed URL)
    경로로 교체, `state.resultImageUrl` 우선순위/연출 타이밍은 무변경
  - `apps/result`는 qr-and-result 구현 시점부터 이미 `get-session-media` 계약대로만 동작하고 있었으므로,
    공용 모듈 사용으로 통합한 것 외에는 동작 변경 없음

  이로써 "세션 ID(UUID) 추측 불가능"이라는 설계 전제가 테이블 전체 열거(enumeration)로 무력화되던 문제는
  해소되었다. 실제 사진/영상 바이트는 애초부터 Storage 단에서 잠겨 있었으므로(위 표) 이번 변경 전에도
  직접적인 사진/영상 유출은 없었지만, 모든 세션의 `concept_id`/`frame_id`/`status`/`created_at` 등 메타데이터
  열거는 가능한 상태였고 이번 변경으로 그 경로도 막혔다.
- `sessions.expires_at`은 트리거로 anon의 임의 변경을 막았다(super_admin/service_role만 변경 가능) — TTL 우회 방지.
- `settings.retention_hours`는 트리거로 24~48 정수만 허용한다.

## 4. RLS 전 테이블 점검 (스펙 섹션 9)

0001_init.sql 기준으로 이미 6개 테이블 모두 `enable row level security` 상태이며, 이번 라운드에서 확인한 결과:

- `admins`: anon은 매칭되는 정책이 없어 기본 차단(select는 `id = auth.uid() or is_super_admin()` — anon은 `auth.uid()`가 null이라 항상 false). super_admin만 insert/update/delete.
- `admin_audit_logs`: anon 접근 불가(정책 없음 → 기본 차단). select는 super_admin만, insert는 활성 관리자 본인 행동만.
- `concepts` / `frames`: 공개 read는 노출/활성 조건이 있을 때만, 쓰기는 super_admin만.
- `sessions`: select는 `sessions_select_admin`(`is_active_admin()`)만 허용, anon 차단(0005). insert/update는
  `session_is_active()` 검증을 거친 anon도 가능(촬영 플로우), delete는 super_admin만. expires_at 보호 트리거 추가.
  자세한 배경은 위 3절 "트레이드오프 / 잔여 위험" 참고.
- `settings`: 전체 read 공개(TTL 값 등 클라이언트가 알아야 함), 쓰기는 super_admin만 + 범위 검증 트리거.

role 기반 정책은 스펙 섹션 2/9 지시대로 "super_admin만 전체 허용"으로 단순화되어 있다. staff 세부 권한은
스펙 자체가 "추후 결정" 항목으로 명시했으므로 이번 라운드에서 임의로 만들지 않았다.

## 5. 배포 설정 (Vercel 3 프로젝트)

`docs/deployment.md`(architect 작성)에 이미 3개 프로젝트/도메인 분리, `VITE_SUPABASE_ANON_KEY`만 노출,
`service_role` 키는 어떤 프론트 프로젝트에도 등록하지 않는다는 내용이 명시되어 있어 추가 변경은 하지 않았다.
`service_role` 키가 필요한 곳은 오직 (a) Supabase Edge Function 런타임(자동 주입되는 `SUPABASE_SERVICE_ROLE_KEY`
환경변수, 별도 등록 불필요)과 (b) 크론 트리거(Vault 시크릿 또는 크론 러너 전용 환경변수) 두 곳뿐이며, 둘 다
브라우저에 번들되지 않는다. `apps/*/vercel.json` / `.env.example`에는 anon key만 있는지 재확인했고 이상 없다.

## 6. 확인/미해결 사항 요약

- [x] `cleanup-expired-sessions` 함수 구현 (파일/로직 완성, 실제 프로젝트 미연결로 실행 테스트는 curl 예시로 대체)
- [x] `pg_cron` 스케줄 마이그레이션 작성 + Vault 시크릿 수동 준비 절차 문서화 (대안: Vercel/GitHub Actions cron)
- [x] 세션 버킷 anon read 제거, super_admin read + `get-session-media` 함수로 signed URL 전용 접근 구현
- [x] `sessions.expires_at` 변조 방지 트리거, `settings.retention_hours` 범위 검증 트리거 추가
- [x] `sessions` 테이블 자체의 익명 select 제거(0005_sessions_select_hardening.sql) — 위 3절 "트레이드오프 / 잔여 위험" 참고. 파이프라인 전체 완료 후 booth-flow/qr-and-result 실제 구현을 근거로 안전하게 적용됨을 확인
- [x] booth-builder/integrator가 `result_image_url`/`timelapse_video_url`에 "Storage 경로" 규약을 지키고 `get-session-media`(공용 `fetchSessionMedia`)를 호출하도록 구현했음을 QA 단계에서 확인(pipeline_status.md의 booth-flow/qr-and-result APPROVED 기록 참고)
- [ ] **[잔여 위험, 유지]** booth의 `sessions`/Storage 쓰기(INSERT/UPDATE)는 여전히 anon key로 직접 이루어지며 완전한 소유권 검증은 하지 않는다 — `docs/withmini_demo_spec.md` 섹션 10에 향후 과제로 기록. 정식 서비스 전환 시 쓰기 경로도 Edge Function 경유로 전환하는 것을 권장
