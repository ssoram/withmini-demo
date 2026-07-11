# withmini Demo Mode — 개발 스펙 문서

> 이 문서는 Claude Code AI 팀 에이전트가 바로 구현에 착수할 수 있도록 작성된 실행용 스펙입니다.
> 원본 기획 문서(`Withmini_Demo_Mode.md`)를 기반으로 기술 스택, 데이터 모델, 화면별 상세 요구사항, 에이전트 작업 분배까지 포함합니다.

---

## 0. 프로젝트 개요

- **제품명**: withmini Demo Mode
- **목적**: 정식 withmini 서비스 출시 전, 태블릿 기반 무인 포토부스의 핵심 UX(컨셉→프레임→촬영→선택→출력 애니메이션→QR)를 검증하는 MVP
- **향후 확장 방향**: 이번 데모모드 코드베이스는 실제 무인 사진관 사업으로 확장 가능하도록 설계한다. React 컴포넌트/DB 스키마는 재사용을 전제로 하고, 결제·프린터·다지점(매장) 관리 등은 이후 단계에서 "추가"되는 것으로 간주한다. 지금 단계에서 이를 과설계할 필요는 없지만, DB 스키마에 `store_id` 같은 확장 여지는 남겨둔다.

---

## 1. 확정된 기술 스택

| 영역 | 기술 | 비고 |
|---|---|---|
| 태블릿 촬영 앱 | React + Vite | 키오스크 모드(풀스크린)로 태블릿 브라우저에서 실행, `kiosk.*` 도메인. 추후 Electron/Capacitor 래핑 가능 |
| 관리자 페이지 | React + Vite | 별도 도메인(`admin.*`)으로 분리 배포 |
| QR 결과 페이지 | React + Vite (모바일 반응형) | 별도의 짧은 공개 도메인으로 분리 배포, 라우트는 `/:sessionId` 하나뿐 |
| 백엔드/DB/스토리지/인증 | Supabase (PostgreSQL + Storage + Auth) | 관리자 로그인은 Supabase Auth 사용, 여러 관리자 계정 지원 |
| 3D 출력 애니메이션 | Three.js (react-three-fiber + drei 권장) | 사진 출력 연출 |
| 이미지 합성 | Canvas API (클라이언트) 또는 Supabase Edge Function (서버) | MVP는 클라이언트 Canvas 합성으로 시작, 필요시 서버 이전 |
| 배포 | Vercel 프로젝트 3개(booth/admin/result) + Supabase 클라우드 | 앱별로 별도 도메인 연결 (섹션 1 하단 표 참고) |
| 데이터 정리(TTL) | Supabase Edge Function + pg_cron (or 외부 스케줄러) | 24~48시간 경과 데이터 자동 삭제 |

**프로젝트 구조 제안**

> **중요**: 촬영 앱 / 관리자 페이지 / QR 결과 페이지는 반드시 **서로 다른 도메인(서브도메인)으로 분리 배포**한다. 하나의 도메인 아래 라우트로만 나누면, QR로 공개되는 링크와 같은 도메인에서 촬영 시작화면이나 관리자 로그인 화면까지 접근 가능해져 불필요하게 노출된다.

| 용도 | 도메인 예시 | 공개 범위 |
|---|---|---|
| 태블릿 촬영 앱 (Booth) | `kiosk.withmini.app` | 매장 태블릿에서만 사용, URL을 외부에 공유하지 않음 (필요시 IP 제한) |
| 관리자 페이지 (Admin) | `admin.withmini.app` | 로그인 필수, 가능하면 IP 제한 추가 |
| QR 결과 페이지 (Result) | `withmini.link` (짧고 별도인 도메인 권장) | 완전 공개 — 이 도메인에는 `/result/:sessionId` 라우트만 존재 |

코드는 하나의 레포에서 공용 컴포넌트/타입/`supabaseClient`를 공유하는 모노레포 구조로 관리하되, **빌드/배포 산출물은 3개로 분리**하여 각기 다른 도메인에 연결한다.

```
withmini-demo/
├─ apps/
│  ├─ booth/           # kiosk.withmini.app 로 배포
│  │  └─ src/
│  ├─ admin/           # admin.withmini.app 로 배포
│  │  └─ src/
│  └─ result/          # withmini.link 로 배포 (라우트: /:sessionId 하나뿐)
│     └─ src/
├─ packages/
│  └─ shared/          # 공통 컴포넌트, hooks, types, supabaseClient, compositor 로직
├─ supabase/
│  ├─ migrations/     # DB 스키마
│  └─ functions/      # Edge Functions (TTL 삭제 등)
└─ docs/
   └─ withmini_demo_spec.md (본 문서)
```

> pnpm workspace 또는 Turborepo 같은 모노레포 도구 사용을 권장하되, MVP 단계에서는 단순 폴더 분리 + 각 앱 폴더에서 개별 `npm run build`로도 충분하다. 중요한 건 **배포 도메인이 3개로 분리되어 있다는 것**이지, 모노레포 도구 자체는 필수가 아니다.

---

## 2. 데이터 모델 (Supabase / PostgreSQL)

### `admins`
Supabase Auth의 기본 유저 테이블(`auth.users`)을 사용하고, 역할 구분을 위한 프로필 테이블을 둔다.
지금은 본사 인원만 쓰지만, 추후 직원이 늘어나 회사 업무용 관리자 페이지로 확장될 것을 감안해 **처음부터 role 구분을 넣는다.**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK, = auth.users.id) | |
| name | text | 관리자 이름 |
| role | text | `super_admin` \| `staff` (default `staff`) |
| is_active | boolean | 계정 활성/비활성 (퇴사 시 비활성화용, default true) |
| created_at | timestamptz | |

**역할 구분은 지금 단계에서는 컬럼만 만들어두고, 세부 권한(누가 무엇을 할 수 있는지)은 실제로 staff 계정이 생길 때 다시 정한다.**
MVP 단계에서는 `super_admin` 계정만 사용하며, 아래는 나중에 세분화할 항목의 자리표시(placeholder)다.

| 기능 | super_admin | staff |
|---|---|---|
| 컨셉/프레임 관리 | ✅ | (추후 결정) |
| 결과물(세션) 통계 조회 | ✅ | (추후 결정) |
| 세션 수동 삭제 | ✅ | (추후 결정) |
| 관리자 계정 관리 | ✅ | ❌ (staff는 계정 관리 불가 — 이 항목만 우선 확정) |

> RLS 정책도 지금은 "role = super_admin만 전체 허용"으로 단순하게 구현하고, staff 세분화 시점에 정책을 추가한다.

### `admin_audit_logs` (관리자 행동 로그)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| admin_id | uuid (FK → admins.id) | 행동한 관리자 |
| action | text | 예: `frame.create`, `frame.delete`, `concept.update`, `session.delete` |
| target_table | text | 대상 테이블명 |
| target_id | uuid | 대상 row id |
| detail | jsonb | 변경 전/후 값 등 부가 정보 |
| created_at | timestamptz | |

> 직원이 늘어날수록 "누가 언제 무엇을 바꿨는지" 추적이 중요해지므로, staff 도입 이전이라도 테이블은 미리 만들어두고 프레임/컨셉/세션 CRUD 시점에 로그를 남기는 걸 권장한다.

### `concepts` (컨셉)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| name | text | 예: "미니멀 컨셉" |
| is_visible | boolean | 노출 여부 (default true) |
| display_order | int | 정렬 순서 |
| image_url | text \| null | 컨셉 카드 배경 이미지 (Supabase Storage `concept-images` 버킷 경로). 미설정 시 null — 섹션 4.2 참고 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `frames` (프레임)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| concept_id | uuid (FK → concepts.id) | 소속 컨셉 |
| name | text | 프레임 이름 |
| slot_count | int | 프레임 칸 수 (2, 4, 6 등) |
| preview_image_url | text | 미리보기 이미지 (Supabase Storage 경로) |
| layout_data | jsonb | 각 슬롯의 좌표/크기 (합성용) |
| frame_video_url | text \| null | 프레임 전용 영상 콘텐츠 (있는 경우) |
| is_active | boolean | 활성화 여부 (default true) — **초기값은 "일반 프레임"만 true** |
| is_general | boolean | "일반 프레임" 여부 플래그 — 처음엔 이 값이 true인 프레임만 사용자에게 노출 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

> 참고: "처음에는 일반 프레임들만 뜨게" 요구사항은 `is_general` 플래그로 구현. 사용자 앱에서는 `is_active = true AND is_general = true` 인 프레임만 조회. 향후 이벤트/시즌 프레임을 추가하면 `is_general = false`로 등록해 별도 노출 로직(예: 프로모션 코드, 특정 기간)을 붙일 수 있다.

### `sessions` (촬영 세션 = 결과물)

> **중요**: 관리자 페이지에서도 개별 사용자의 촬영 결과물(사진)은 조회하지 않는다. `sessions`는 DB/Storage에만 저장되어 있다가 만료 시 자동 삭제되는 구조이며, 관리자는 세션 개수·상태 등 통계성 정보만 확인한다 (섹션 5.4 참고).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | QR 링크에 사용되는 세션 ID |
| concept_id | uuid (FK) | |
| frame_id | uuid (FK) | |
| raw_photo_urls | jsonb | 촬영된 8장 원본 이미지 URL 배열 |
| selected_photo_urls | jsonb | 사용자가 선택한 사진 URL 배열 (슬롯 순서대로) |
| result_image_url | text | 최종 합성 이미지 |
| timelapse_video_url | text \| null | 타임랩스 영상 |
| qr_url | text | QR이 가리키는 결과 페이지 URL |
| created_at | timestamptz | |
| expires_at | timestamptz | `created_at` + 보관시간(기본 24시간, 설정값으로 24~48시간 범위 조정 가능) |
| status | text | `in_progress` \| `completed` \| `expired` \| `deleted` |

### `settings` (운영 설정값)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| key | text (PK) | 예: `retention_hours` |
| value | text | 예: `"24"` (24~48 사이 값으로 관리자가 조정 가능하도록 추후 UI화, MVP는 DB 직접 수정 또는 하드코딩값으로 시작 가능) |
| updated_at | timestamptz | |

### 관리자 결과물 관리 화면은 개별 사진을 보여주지 않고, `sessions` 테이블 기반 통계(개수/상태)만 조회한다.

---

## 3. Supabase Storage 버킷 구조

```
storage/
├─ concept-images/       # 컨셉 카드 배경 이미지 (관리자 업로드)
├─ frame-previews/       # 프레임 미리보기 이미지 (관리자 업로드)
├─ frame-videos/         # 프레임 전용 영상
├─ session-raw/{sessionId}/       # 촬영 원본 8장
├─ session-results/{sessionId}/   # 합성 결과 이미지
└─ session-timelapse/{sessionId}/ # 타임랩스 영상
```
- 모든 세션 관련 버킷은 TTL 정책 적용 (기본 24시간, `settings.retention_hours`로 24~48시간 범위 조정 가능. Edge Function으로 만료 세션 파일 + DB row 정리)
- Storage 정책(RLS): 컨셉/프레임 관련 버킷은 공개 읽기(public read) + 관리자만 쓰기. 세션 관련 버킷은 세션 ID를 아는 사람만 접근 가능하도록 signed URL 방식 권장.

---

## 4. 화면별 상세 요구사항

> 아래 라우트 표기(`/booth/*`, `/result/*`, `/admin/*`)는 이해를 돕기 위한 개념적 경로이며, 실제로는 섹션 1의 구조에 따라 각각 별도 도메인의 앱 내부 라우트다. 예: `/booth/concept` → `kiosk.withmini.app/concept`, `/result/:sessionId` → `withmini.link/:sessionId`, `/admin/frames` → `admin.withmini.app/frames`.

### 4.0 UI/UX 디자인 원칙

일반적인 무인 사진관(인생네컷, 포토이즘, 하루필름 등)과 비슷한 수준의 **심플하고 담백한 UI**를 지향한다. 화려한 커스텀 인터랙션이나 복잡한 화면 구성은 지양한다.

- **화면당 하나의 명확한 액션**: 각 단계(컨셉 선택, 프레임 선택, 촬영 등)는 사용자가 지금 뭘 해야 하는지 한눈에 알 수 있어야 한다. 설명 텍스트는 최소화
- **큰 터치 타겟 / 큰 글씨**: 태블릿을 팔 길이 정도에서 터치하는 상황을 감안해 버튼과 텍스트는 충분히 크게
- **일관된 레이아웃 틀**: 컨셉별로 포인트 컬러나 이미지는 달라져도, 버튼 위치·진행 표시·전체 레이아웃 구조는 모든 화면에서 동일하게 유지 (사용자가 매번 새로 학습하지 않도록)
- **연출은 Three.js 출력 애니메이션(4.7)에 집중**: 나머지 화면(컨셉/프레임 선택, 촬영, 선택)은 불필요한 트랜지션이나 장식 없이 빠르고 즉각적으로 넘어가는 것을 우선한다
- **진행 상태 표시는 단순하게**: 예) "3/8장 촬영 중" 같은 텍스트+간단한 도트 인디케이터 정도면 충분, 복잡한 프로그레스 애니메이션 불필요
- **관리자 페이지도 동일 원칙**: 화려한 대시보드보다는 목록/폼 중심의 실용적인 UI

> Claude Code 에이전트가 UI 구현 시 `frontend-design` 스킬을 참고하되, 데모 목적에 맞게 과한 장식이나 트렌디한 최신 스타일 실험은 자제하고 "이미 검증된 무인 사진관 UX 패턴을 따른다"는 기준으로 판단한다.

### 4.1 시작 화면 (`/booth`)
- 터치 시작 유도 문구 + CTA 버튼
- 대기 상태에서 일정 시간 인터랙션 없으면 자동으로 이 화면으로 복귀 (idle timeout, 예: 60초)

### 4.2 컨셉 선택 (`/booth/concept`)
- `concepts` 테이블에서 `is_visible = true` 인 항목만 `display_order`순 조회
- 카드형 UI로 2개 컨셉 표시, 터치 시 다음 단계 이동
- 각 컨셉 카드는 `concepts.image_url`을 카드 전체 배경으로 깔고, 중앙에 컨셉명(`concepts.name`)을 표시한다. `image_url`이 null이면 배경 없이 컨셉명만 표시(기존 방식으로 폴백)

### 4.3 프레임 선택 (`/booth/frame`)
- 선택된 concept_id 기준으로 `frames` 조회, 조건: `is_active = true AND is_general = true`
- 프레임 미리보기 이미지 + 슬롯 개수 표시
- 프레임 선택 시 `slot_count` 값을 다음 단계(촬영/선택)에 전달

### 4.4 사진 촬영 (`/booth/capture`)
- WebRTC `getUserMedia`로 태블릿 카메라 스트림 접근
- 카운트다운(3-2-1) → 촬영 → 총 8장까지 자동 반복
- 촬영본은 즉시 Supabase Storage `session-raw/{sessionId}/`에 업로드하거나, 메모리에 보관 후 완료 시 일괄 업로드 (MVP는 후자가 구현 단순)
- 촬영 진행 상태 UI(예: 8장 중 3장 완료) 표시

### 4.5 사진 선택 (`/booth/select`)
- 촬영된 8장 썸네일 그리드 표시
- `slot_count`만큼 선택 가능 (예: 4컷이면 정확히 4장), 선택 순서 = 프레임 슬롯 순서
- 선택 완료 시 "다음" 버튼 활성화

### 4.6 결과 생성 (`/booth/generate`)
- 선택된 사진 + 프레임의 `layout_data`(슬롯 좌표)를 사용해 Canvas로 합성
- 합성 결과를 `session-results/{sessionId}/`에 업로드, `sessions.result_image_url` 갱신
- 로딩 스피너 또는 짧은 트랜지션

### 4.7 Three.js 출력 애니메이션 (`/booth/print-animation`)
- react-three-fiber 씬: 포토부스 기계 모델(간단한 형태 가능) → 종이가 슬롯에서 밀려나오는 애니메이션 → 완성된 사진(결과 이미지를 텍스처로 매핑)이 화면에 드러나는 연출
- 애니메이션 총 길이 약 5~8초 권장, 스킵 버튼은 넣지 않음(몰입감 검증 목적)
- 종료 시 자동으로 QR 화면으로 전환

### 4.8 QR 코드 표시 (`/booth/qr`)
- `sessions.qr_url` (= `{result 도메인}/{sessionId}`, 예: `withmini.link/{sessionId}`)을 QR 코드로 렌더링 (예: `qrcode.react` 라이브러리)
- 일정 시간 후 자동으로 시작 화면으로 복귀

### 4.9 QR 결과 페이지 (`/result/:sessionId`)
- 세션 조회 → `status = expired`면 만료 안내 화면
- 콘텐츠 3종 탭 또는 스크롤 구성:
  1. 최종 사진 (다운로드 버튼)
  2. 타임랩스 영상 (있는 경우, 다운로드/재생)
  3. 프레임 전용 영상 (프레임에 `frame_video_url`이 있는 경우)
- 모바일 브라우저 저장(다운로드) 지원 — `<a download>` 또는 Web Share API

---

## 5. 관리자 페이지 (`/admin`)

### 5.1 인증
- Supabase Auth (이메일/비밀번호) 사용, 여러 관리자 계정 지원
- `/admin` 하위 모든 라우트는 인증 가드 적용
- 로그인 성공 시 `admins.role`을 조회해 프론트에서 메뉴/버튼 노출을 role에 따라 제한 (단, 실제 권한 제어는 반드시 백엔드 RLS로도 강제 — 프론트 숨김만으로는 보안이 되지 않음)
- 계정 추가/비활성화는 super_admin만 가능 (`/admin/staff` 라우트, MVP에서는 후순위 가능)

### 5.2 컨셉 관리 (`/admin/concepts`)
- 목록/추가/이름 수정/노출 토글/삭제 (soft delete 권장: `is_visible=false` 처리 후 실제 삭제는 별도 확인)

### 5.3 프레임 관리 (`/admin/frames`)
- 목록(컨셉별 필터), 등록/수정/삭제
- 활성화/비활성화 토글 (`is_active`)
- **"일반 프레임" 여부 토글 (`is_general`)** — 이 값에 따라 사용자 앱 노출 여부 결정
- 소속 컨셉 지정, 슬롯 수 설정, 미리보기 이미지 업로드
- (선택) 슬롯 좌표(`layout_data`) 편집 — MVP에서는 JSON 직접 입력 또는 간단한 좌표 입력 폼으로 시작, 추후 비주얼 에디터로 고도화 가능

### 5.4 결과물 관리 (`/admin/sessions`)
- **개별 사용자의 촬영 사진/결과 이미지는 관리자도 조회하지 않는다.** (개인정보 보호 원칙 — 촬영 결과물은 사용자 본인만 QR을 통해 확인)
- 관리자 화면에는 통계성 정보만 표시: 총 세션 수, 기간별 촬영 건수, 컨셉/프레임별 이용 현황, 만료 대기/완료 상태 카운트
- 저장 기간(`settings.retention_hours`) 확인 및 조정 (24~48시간 범위)
- 문제 상황(예: 특정 세션 수동 삭제 요청) 발생 시에도 세션 ID로 삭제 처리는 가능하되, 이미지 자체를 화면에 띄우지는 않는다

---

## 6. 데이터 만료(TTL) 처리

- `sessions.expires_at` = `created_at + interval '{settings.retention_hours} hours'` (기본값 24시간, 최대 48시간까지 운영 중 조정 가능하도록 설계. MVP에서는 하드코딩 24시간으로 시작하고 `settings` 테이블 연동은 후순위로 미뤄도 됨)
- Supabase Edge Function `cleanup-expired-sessions`를 만들어:
  1. `expires_at < now()` 이고 `status != 'deleted'`인 세션 조회
  2. 관련 Storage 파일 삭제 (`session-raw`, `session-results`, `session-timelapse`)
  3. `sessions` row를 완전 삭제 (관리자도 개별 결과물을 조회하지 않는 정책이므로, 통계용 카운트만 별도 집계 테이블에 남기고 원본 데이터/이미지는 완전 삭제 권장)
- 스케줄링: Supabase `pg_cron` (예: 매시간 실행) 또는 외부 크론(Vercel Cron 등)

---

## 7. MVP 범위 재확인

**포함**
- 태블릿 기반 촬영, 컨셉/프레임 선택, 8장 촬영, 슬롯 수만큼 선택, 합성, Three.js 출력 애니메이션, QR 결과 페이지, 관리자 컨셉/프레임/결과물 관리, 24~48시간 TTL (설정 가능)

**제외 (이번 단계에서 만들지 않음)**
- 모바일 앱, 사용자 로그인/계정, 디지털 앨범, AI 미니미, AI 합성, 정식 콜라보 시스템, 결제, 프린터 연동, 다지점 관리

---

## 8. Claude Code 에이전트 파이프라인 설계

단순히 "누가 어느 부분을 만들지" 나누는 것을 넘어서, **에이전트들이 서로의 결과물을 검증하고, 독립적인 작업은 병렬로 진행하고, 통과되면 자동으로 다음 단계로 넘어가는 파이프라인**으로 설계한다.

### 8.1 서브에이전트 구성 (`.claude/agents/*.md`)

| 서브에이전트 | 역할 |
|---|---|
| `architect` | Phase 0 담당. 모노레포 셋업, DB 마이그레이션, 라우팅 스캐폴딩, 배포 설정을 만들고 "이후 에이전트들이 지켜야 할 계약(스키마/폴더 구조)"을 확정 |
| `booth-builder` | 섹션 4.1~4.6 (촬영 플로우) 구현 |
| `animation-builder` | 섹션 4.7 (Three.js 출력 애니메이션) 구현 |
| `admin-builder` | 섹션 5.1~5.4 (관리자 페이지) 구현 |
| `integrator` | 섹션 4.8~4.9 (QR 표시 + 결과 페이지) + 3개 빌더 산출물을 하나의 플로우로 연결 |
| `infra-agent` | 섹션 6, 9 (TTL 정리 함수, RLS 정책, 배포 설정) |
| `qa-reviewer` | 모든 구현 에이전트의 산출물을 스펙 문서 기준으로 검증. 구현은 하지 않고 오직 검토만 함 |

> `qa-reviewer`는 구현 에이전트와 반드시 분리한다. 같은 에이전트가 자기 코드를 검증하면 자기 실수를 못 보고 넘어가는 경우가 많기 때문.

### 8.2 공유 진행상황 파일로 자동 핸드오프

`docs/pipeline_status.md` (또는 `.json`) 파일을 하나 두고, 모든 에이전트가 여기에 상태를 기록/확인하며 움직이게 한다.

| task | owner | status | notes |
|---|---|---|---|
| booth-flow | booth-builder | `IN_REVIEW` | 1차 구현 완료, QA 대기 |
| print-animation | animation-builder | `APPROVED` | QA 통과 |
| admin-page | admin-builder | `CHANGES_REQUESTED` | QA 반려 — 프레임 삭제 시 soft-delete 미적용 |

상태값: `TODO` → `IN_PROGRESS` → `IN_REVIEW` → `APPROVED` (또는 `CHANGES_REQUESTED`로 반려 후 재작업)

**동작 방식**
1. 구현 에이전트(예: `booth-builder`)가 작업을 마치면 상태를 `IN_REVIEW`로 바꾸고 `qa-reviewer`를 호출
2. `qa-reviewer`는 스펙 문서(섹션 4.1~4.6)를 체크리스트 삼아 검증 → 통과 시 `APPROVED`, 문제 있으면 구체적인 수정 요청과 함께 `CHANGES_REQUESTED`로 반려하고 다시 `booth-builder`를 호출
3. 메인 세션(오케스트레이터)은 시작할 때 "`pipeline_status.md`를 계속 확인하면서, 끝난 작업은 자동으로 다음 단계로 넘기고 반려된 작업은 담당 에이전트에게 다시 시켜줘"라고 지시해두면, Claude Code가 이 루프를 스스로 운영한다

### 8.3 병렬/순차 규칙

- **병렬 가능** (서로 의존성 없음): Phase 0 완료 직후 → `booth-builder`, `animation-builder`, `admin-builder`, `infra-agent` 4개를 한 번에 동시 실행 요청
- **순차 필요**: `integrator`는 `booth-flow`, `print-animation` 두 항목이 모두 `APPROVED`여야 시작 (QR/결과 페이지가 촬영 플로우 결과물에 의존하기 때문)
- **완료 조건**: `pipeline_status.md`의 모든 task가 `APPROVED`가 되면 파이프라인 종료

### 8.4 완전 자동 vs 안전장치

사람 개입 없이 끝까지 자동으로 돌리는 것도 가능하지만, 방향이 한 번 잘못 잡히면 여러 파일이 틀린 채로 계속 쌓일 수 있다. 아래 정도의 최소 안전장치를 권장한다.

- 같은 task가 `CHANGES_REQUESTED`로 **3회 이상 반려**되면 자동 재시도를 멈추고 사람에게 알리도록 규칙을 넣는다 (무한 반려 루프 방지)
- Phase 전환 시점(예: Phase 1 전체 `APPROVED` → Phase 2 시작)마다 `pipeline_status.md`에 요약을 남겨서, 나중에 어디서 뭐가 있었는지 추적 가능하게 한다

완전 무인 자동화를 원하면 이 규칙도 빼고 진행할 수 있지만, 처음 1~2회는 사람이 `pipeline_status.md`와 QA 반려 사유를 검토하면서 파이프라인이 의도대로 도는지 확인해보는 것을 추천한다.

### 8.5 각 서브에이전트에게 공통으로 줄 것

- 본 스펙 문서 경로(`docs/withmini_demo_spec.md`)를 모든 서브에이전트의 시스템 프롬프트에서 항상 참조하도록 명시
- 섹션 2(데이터 모델)·3(Storage 구조)는 `architect`가 Phase 0에서 확정하는 즉시 "변경 불가 계약"으로 취급. 구현 중 변경이 필요하면 다른 에이전트가 임의로 고치지 말고 반드시 `architect`에게 먼저 확인받도록 지시
- `qa-reviewer`에게는 섹션 4/5의 각 화면 요구사항을 체크리스트로 그대로 넘겨서 "이 스펙에 없는 걸 임의로 판단하지 말고, 스펙 대비 누락/오류만 지적"하도록 범위를 제한

---

## 9. 보안 체크리스트 (데모지만 실사용 전환을 감안해 처음부터 챙길 것)

데모모드는 규모가 작아도, 실제 매장에서 고객 사진(개인정보 성격)을 다루고 이후 실사용으로 이어지므로 아래 항목은 MVP 단계부터 반영한다.

| 구분 | 항목 | 설명 |
|---|---|---|
| DB | RLS(Row Level Security) 전 테이블 활성화 | `concepts`, `frames`, `sessions`, `admins`, `admin_audit_logs` 모두 기본적으로 RLS on, 명시적 정책 없으면 접근 차단 |
| DB | role 기반 정책 | super_admin/staff 권한에 따라 UPDATE/DELETE 정책 분리 (섹션 2 표 참고) |
| Storage | signed URL 사용 | 세션 관련 버킷(`session-raw`, `session-results`, `session-timelapse`)은 public이 아닌 signed URL로만 접근, URL 추측으로 타인 결과물 열람 방지 |
| Storage | 버킷별 접근 정책 분리 | 프레임 관련(공개 읽기 가능)과 세션 관련(비공개)을 명확히 분리 |
| DB | `sessions` 테이블 anon SELECT 제한 | `sessions` 테이블은 anon(비로그인) SELECT를 허용하지 않는다. RLS는 행 단위로 평가되어 쿼리 조건과 무관하게 조건 없는 SELECT로 전체 세션 id를 나열(enumeration)할 수 있어, "세션 ID(UUID) 추측 불가능" 전제를 무력화하기 때문이다. 공개 조회(QR 결과 페이지, 출력 애니메이션 화면의 결과 이미지 조회 등)는 반드시 service_role 기반 Edge Function(`get-session-media`)을 통한다. booth의 세션 생성(INSERT)은 이 제한과 무관하게 그대로 동작한다. 관리자 페이지(`sessions` 통계 조회)는 인증된 관리자 전용 SELECT 정책으로 별도 허용한다. |
| DB | `sessions` 완료 처리는 `complete_session` RPC 경유 | PostgreSQL은 UPDATE의 WHERE절이 대상 행을 읽는 단계에서도 SELECT 정책을 요구하므로, anon SELECT가 차단된 상태에서 booth가 직접 `UPDATE ... WHERE id = ...`로 세션을 완료 처리하면 0건 갱신되면서도 성공 응답을 반환하는 문제가 있었다(실사용 중 발견, 0007 마이그레이션으로 수정). 따라서 anon의 직접 `sessions` UPDATE 권한은 제거하고, `complete_session(p_session_id, p_raw_photo_urls, p_selected_photo_urls, p_result_image_url, p_qr_url)` security definer RPC로만 촬영 완료 처리(원본/선택 사진 경로, 결과 이미지, QR URL 반영 및 status를 `completed`로 전이)를 허용한다. RPC 내부에서 대상 세션이 존재하고 `status='in_progress'`이며 미만료 상태일 때만 갱신하도록 검증하므로, 임의 UPDATE를 열어두는 것보다 공격면이 좁다. |
| Auth | 관리자 로그인 브루트포스 방어 | Supabase Auth 기본 rate limit 확인, 필요시 추가 제한 |
| Auth | 세션/토큰 만료 정책 | JWT 만료시간 및 refresh token 정책 검토 |
| Auth | 계정 비활성화 처리 | 퇴사자 계정은 삭제 대신 `is_active=false`로 즉시 접근 차단 |
| 로깅 | 관리자 행동 감사 로그 | `admin_audit_logs`에 CRUD 이력 기록 (섹션 2 참고) |
| 배포 | 도메인 분리 | 촬영앱/관리자/결과페이지를 서로 다른 도메인으로 배포해 공개 노출 범위를 최소화 (섹션 1 참고) |
| 통신 | HTTPS 강제 | 프론트/백엔드 모두 HTTPS만 허용 |
| 비밀정보 | API 키/환경변수 노출 점검 | 클라이언트 번들에 Supabase service_role 키 등 민감 키가 포함되지 않도록 확인 (anon key만 프론트에 노출) |
| 개인정보 | 촬영 데이터 최소 보관 원칙 | 24~48시간 TTL 정책 준수(`settings.retention_hours`), 필요 이상 데이터 장기 보관 금지 |
| 개인정보 | 결과 페이지 접근 제한 | 세션 ID(UUID)를 URL에 사용해 추측 불가능하게 하고, 필요시 만료 후 완전 삭제 |

> 정식 서비스로 전환할 때는 이 체크리스트를 기반으로 별도 보안 점검(펜테스트 또는 코드 리뷰)을 한 번 더 진행하는 것을 권장한다.

---

## 10. 향후 확장 시 고려사항 (지금 구현하지 않음, 설계만 열어둠)

- `sessions`, `frames`에 `store_id` 컬럼을 추가하면 다지점 확장 가능
- 결제 연동 시 `sessions`에 `payment_status`, `amount` 컬럼 추가
- 프린터 연동은 별도 로컬 에이전트(태블릿에 설치된 프린터 드라이버 브리지)가 필요하며, 이번 데모모드 웹앱과는 분리된 레이어로 설계
- booth의 `sessions`/Storage 쓰기(INSERT/UPDATE)는 현재 anon key로 직접 이루어지며, 완전한 소유권 검증(이 브라우저가 만든 세션인지)은 하지 않는 문서화된 잔여 위험이다. 정식 서비스 전환 시 쓰기 경로도 service_role 기반 Edge Function을 경유하도록 전환하는 것을 고려한다.

---

*이 문서는 초안입니다. 실제 개발 착수 전, 프레임 합성 방식(클라이언트 Canvas vs 서버 처리)과 태블릿 카메라 접근 권한(브라우저 vs PWA) 부분은 프로토타입으로 먼저 검증하는 것을 권장합니다.*
