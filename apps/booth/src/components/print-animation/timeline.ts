/**
 * 출력 애니메이션 타임라인 (스펙 섹션 4.7: 총 5~8초, 스킵 버튼 없음).
 * 각 단계의 시작/끝 시각(초, Canvas 마운트 시점 기준)을 정의한다.
 *
 * 0.0s ────────────────────────────────────────────────── 7.4s
 * [대기] [표시등 점등] [────── 슬라이드 아웃 ──────] [안착] [현상(reveal)] [정지]
 *  idle   emergeStart   slideStart          slideEnd  settleEnd revealEnd  holdEnd
 */
export const TIMELINE = {
  idleStart: 0,
  /** 표시등이 켜지며 인쇄가 시작됐다는 신호를 준다. */
  emergeStart: 0.8,
  /** 종이가 슬롯에서 실제로 밀려나오기 시작. */
  slideStart: 1.2,
  slideEnd: 4.2,
  /** 카드가 드루핑 각도에서 정면을 향해 안착. */
  settleEnd: 5.4,
  /** 완성된 사진이 서서히 드러남 (폴라로이드 현상 느낌). */
  revealEnd: 6.6,
  /** 완성된 사진을 잠시 보여준 뒤 종료. */
  holdEnd: 7.4,
} as const

/** 애니메이션 총 길이 (스펙 권장 5~8초 범위 내). */
export const TOTAL_DURATION = TIMELINE.holdEnd

/** t(경과초) 기준 [start, end] 구간의 진행률을 0~1로 반환. */
export function phaseProgress(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0
  return Math.min(Math.max((t - start) / (end - start), 0), 1)
}
