# 배포 설정 (Vercel 3 프로젝트)

스펙 섹션 1에 따라 booth / admin / result는 반드시 서로 다른 도메인으로 분리 배포한다.
하나의 레포에서 3개의 독립된 Vercel 프로젝트를 만들고, 각 프로젝트의 Root Directory를 아래처럼 지정한다.

| Vercel 프로젝트 | Root Directory | 예시 도메인 | 공개 범위 |
|---|---|---|---|
| withmini-booth | `apps/booth` | `kiosk.withmini.app` | 매장 태블릿 전용, 외부 비공개 |
| withmini-admin | `apps/admin` | `admin.withmini.app` | 로그인 필수, 가능하면 IP 제한 |
| withmini-result | `apps/result` | `withmini.link` | 완전 공개 (`/:sessionId` 라우트만 존재) |

## 프로젝트별 Vercel 설정

각 앱 폴더(`apps/booth`, `apps/admin`, `apps/result`)에 `vercel.json`이 있다:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

`rewrites`는 client-side routing(react-router)이 새로고침/직접 URL 접근 시에도 동작하도록 모든 경로를 `index.html`로 보낸다.

Vercel 프로젝트 생성 시:

1. **Root Directory**를 위 표대로 지정 (`apps/booth`, `apps/admin`, `apps/result`).
2. **Install Command**: 모노레포 루트에서 workspace 설치가 필요하므로 `npm install --prefix ../.. ` 대신, Vercel의 "Root Directory" + 기본 Install Command(`npm install`)를 사용하되, Vercel이 자동으로 monorepo를 감지해 루트에서 `npm install`을 실행하고 Root Directory 기준으로 빌드하도록 한다 (Vercel의 기본 monorepo 지원 방식). 문제가 있으면 `Include files outside the root directory`를 활성화한다.
3. **Build Command**: `npm run build` (각 앱의 package.json 기준, `tsc -b && vite build`)
4. **Output Directory**: `dist`
5. **환경변수** (Project Settings → Environment Variables), 각 앱 공통:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - anon key만 등록한다. `service_role` 키는 어떤 프론트 프로젝트에도 등록하지 않는다 (스펙 섹션 9).
6. 각 프로젝트에 위 표의 커스텀 도메인을 연결한다.

## Supabase 쪽 준비

- `supabase/migrations/`의 SQL을 순서대로 적용 (`supabase db push` 또는 SQL Editor).
- Storage 버킷 5개(`frame-previews`, `frame-videos`, `session-raw`, `session-results`, `session-timelapse`)는 `0002_storage_buckets.sql`에 포함되어 있다.
- Edge Function(`cleanup-expired-sessions`)과 `pg_cron` 스케줄은 infra-agent가 별도로 배포한다 (스펙 섹션 6).
