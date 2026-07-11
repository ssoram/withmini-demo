/**
 * 스펙 섹션 4.7 출력 애니메이션 씬에서 쓰는 치수/색상 상수.
 * 단위는 Three.js 월드 유닛(임의 단위, 카메라 거리와 함께 눈대중으로 맞춤).
 */

/** 슬롯 입구의 world Y 좌표. 이 높이 아래로는 기계 몸체 지오메트리가 없어 카드가 자연스럽게 드러난다. */
export const SLOT_Y = 0.4

/** 기계 몸체 높이 (SLOT_Y부터 위로). */
export const BODY_HEIGHT = 1.55

/** 카드(출력된 사진) 세로 길이. 가로 길이는 텍스처 비율(aspect)에 맞춰 계산한다. */
export const CARD_HEIGHT = 1.05

/** 텍스처 로드 전/실패 시 사용하는 기본 카드 가로세로 비율 (세로형 인생네컷 느낌). */
export const DEFAULT_CARD_ASPECT = 0.72

export const MACHINE_BODY_COLOR = '#2a2d34'
export const MACHINE_ACCENT_COLOR = '#3b3f75'

/** 카메라가 정면을 바라볼 때 맞추는 world Y 중심 (씬 구도상 대략적인 중심 높이). */
export const CAMERA_CENTER_Y = 0.5
