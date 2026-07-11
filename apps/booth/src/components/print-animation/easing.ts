/** 0~1 범위로 값을 자른다. */
export function clamp01(t: number): number {
  return Math.min(Math.max(t, 0), 1)
}

/** 감속하며 끝나는 이징 (슬라이드 아웃 등 자연스러운 마무리에 사용). */
export function easeOutCubic(t: number): number {
  const c = clamp01(t)
  return 1 - Math.pow(1 - c, 3)
}

/** 끝에서 살짝 오버슈트 후 안착하는 이징 (카드가 "탁" 자리잡는 연출에 사용). */
export function easeOutBack(t: number): number {
  const c = clamp01(t)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2)
}

/** 시작/끝 모두 부드러운 이징 (오퍼시티 크로스페이드 등에 사용). */
export function easeInOutSine(t: number): number {
  const c = clamp01(t)
  return -(Math.cos(Math.PI * c) - 1) / 2
}
