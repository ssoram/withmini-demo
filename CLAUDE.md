# withmini Demo Mode — Claude Code 프로젝트 지침

이 파일은 Claude Code(메인 세션/오케스트레이터)가 이 저장소에서 작업할 때 항상 참고해야 하는 규칙이다.

## 0. 최우선 참고 문서

- **스펙 문서**: `docs/withmini_demo_spec.md` — 모든 기능/데이터모델/화면 요구사항의 단일 출처(source of truth)다. 이 문서와 다르게 구현하지 않는다.
- **진행 상황 파일**: `docs/pipeline_status.md` — 어떤 작업이 어느 상태인지 여기서 확인/갱신한다.

## 1. 이 저장소의 목적

정식 withmini 서비스 이전에 태블릿 기반 무인 포토부스 데모(withmini Demo Mode)를 만든다. 자세한 내용은 스펙 문서 참고. 코드는 아래 3개 앱 + 1개 공용 패키지로 구성된 모노레포다.

```
apps/
├─ booth/     # 태블릿 촬영 앱 (kiosk.* 도메인)
├─ admin/     # 관리자 페이지 (admin.* 도메인)
└─ result/    # QR 결과 페이지 (별도 공개 도메인)
packages/
└─ shared/    # 공용 Supabase client, 타입, 컴포넌트
supabase/
├─ migrations/
└─ functions/
```

## 2. 에이전트 파이프라인 운영 규칙

이 프로젝트는 `.claude/agents/`에 정의된 서브에이전트 팀으로 작업한다 (architect, booth-builder, animation-builder, admin-builder, integrator, infra-agent, qa-reviewer). 각 서브에이전트의 역할은 해당 파일 참고.

**오케스트레이터(메인 세션)는 다음 루프를 스스로 운영한다:**

1. `docs/pipeline_status.md`를 읽어 현재 상태를 파악한다.
2. `TODO` 상태이면서 선행 조건(dependency)이 이미 `APPROVED`인 task는 담당 서브에이전트를 호출해 `IN_PROGRESS`로 바꾸고 작업을 시작시킨다.
3. 서로 의존성이 없는 task는 **한 메시지에서 동시에** 서브에이전트를 호출해 병렬로 진행한다 (자세한 규칙은 스펙 문서 섹션 8.3 참고).
4. 구현 서브에이전트가 작업을 마치면 상태를 `IN_REVIEW`로 바꾸고, 반드시 `qa-reviewer`를 호출해 검증받는다.
5. `qa-reviewer`가 `APPROVED`로 바꾸면 다음 의존 task를 자동으로 시작한다. `CHANGES_REQUESTED`로 반려되면 반려 사유와 함께 담당 서브에이전트를 다시 호출한다.
6. 같은 task가 **3회 이상 반려**되면 자동 재시도를 멈추고 사람에게 상황을 보고한다 (무한 반복 방지).
7. `docs/pipeline_status.md`의 모든 task가 `APPROVED`가 되면 파이프라인을 종료하고 전체 요약을 보고한다.

## 3. 변경 불가 계약

`architect` 서브에이전트가 Phase 0에서 확정한 DB 스키마(스펙 문서 섹션 2)와 Storage 구조(섹션 3)는 "계약"으로 취급한다. 다른 서브에이전트는 임의로 스키마를 바꾸지 않는다. 변경이 꼭 필요하면 먼저 `architect`를 호출해 확인받고, 승인되면 `docs/withmini_demo_spec.md`와 `docs/pipeline_status.md`에 변경 사항을 기록한 뒤 진행한다.

## 4. 공통 원칙 (모든 서브에이전트 적용)

- UI는 스펙 문서 섹션 4.0(UI/UX 디자인 원칙)을 따른다 — 일반적인 무인 사진관 수준의 심플한 UI, 과한 장식 지양.
- 관리자 페이지에서도 사용자 개별 촬영 결과물(사진)은 절대 조회 기능을 만들지 않는다 (스펙 섹션 5.4).
- 보안 체크리스트(스펙 섹션 9)의 해당 항목은 각자 담당 영역에서 구현 시점에 함께 반영한다.
- 스펙에 없는 내용을 임의로 추가/판단하지 말고, 애매하면 `pipeline_status.md`의 notes에 질문을 남기고 사람 또는 `architect`의 확인을 기다린다.
