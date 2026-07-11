# withmini Demo Mode

태블릿 기반 무인 포토부스 데모. 전체 요구사항은 [`docs/withmini_demo_spec.md`](docs/withmini_demo_spec.md)를 참고하세요.
파이프라인 진행 상황은 [`docs/pipeline_status.md`](docs/pipeline_status.md)에서 확인합니다.

## 구조

```
apps/
├─ booth/     # 태블릿 촬영 앱 (kiosk.* 도메인)
├─ admin/     # 관리자 페이지 (admin.* 도메인)
└─ result/    # QR 결과 페이지 (별도 공개 도메인)
packages/
└─ shared/    # 공용 Supabase client, DB 타입, 공용 컴포넌트 자리
supabase/
├─ migrations/  # DB 스키마 (섹션 2) + Storage 버킷 설정 (섹션 3)
└─ functions/   # Edge Functions (TTL 정리 등, infra-agent 담당)
```

세 앱은 각각 별도 Vercel 프로젝트/도메인으로 배포됩니다 (스펙 섹션 1, [`docs/deployment.md`](docs/deployment.md) 참고).
npm workspaces를 사용하지만, 각 앱은 독립적으로 빌드 가능합니다.

## 시작하기

최초 1회, 루트에서 의존성을 설치합니다 (workspace 전체 설치):

```bash
npm install
```

각 앱 폴더에 `.env.example`을 복사해 `.env`를 만들고 Supabase 프로젝트 값을 채웁니다:

```bash
cp apps/booth/.env.example apps/booth/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/result/.env.example apps/result/.env
```

이후 각 앱을 개별적으로 실행합니다 (포트: booth 5173 / admin 5174 / result 5175):

```bash
cd apps/booth && npm run dev
cd apps/admin && npm run dev
cd apps/result && npm run dev
```

또는 루트에서 `npm run dev:booth` / `npm run dev:admin` / `npm run dev:result`.

## DB / Storage

`supabase/migrations/`의 SQL을 Supabase 프로젝트에 순서대로 적용합니다 (Supabase CLI `supabase db push` 또는 SQL Editor에 직접 실행).
스키마(섹션 2)와 Storage 버킷 구조(섹션 3)는 `architect`가 확정한 "변경 불가 계약"입니다. 변경이 필요하면 `docs/withmini_demo_spec.md` 갱신 및 architect 승인을 거쳐야 합니다.
