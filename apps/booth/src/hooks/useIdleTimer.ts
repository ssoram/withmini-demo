import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'wheel'] as const

/**
 * timeoutMs 동안 사용자 입력(pointer/touch/key/wheel)이 없으면 onIdle을 호출한다.
 * paused=true인 동안은 타이머가 동작하지 않는다 (자동 촬영/업로드 등 화면 자체가 진행 중일 때 사용).
 */
export function useIdleTimer(timeoutMs: number, onIdle: () => void, options?: { paused?: boolean }) {
  const paused = options?.paused ?? false
  const timerRef = useRef<number>()
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    function resetTimer() {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
      if (paused) return
      timerRef.current = window.setTimeout(() => onIdleRef.current(), timeoutMs)
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer))
    resetTimer()

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer))
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [timeoutMs, paused])
}
