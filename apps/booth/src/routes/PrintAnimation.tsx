import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PrintAnimationCanvas from '../components/print-animation/PrintAnimationCanvas'
import { PLACEHOLDER_RESULT_IMAGE } from '../components/print-animation/placeholderTexture'

interface PrintAnimationLocationState {
  sessionId?: string
  resultImageUrl?: string
  [key: string]: unknown
}

/**
 * 스펙 섹션 4.7 — 출력 애니메이션 화면.
 *
 * 결과 이미지 해석 순서:
 *  1) 라우트 state.resultImageUrl (booth-builder가 /generate에서 전달하는 값, 최우선)
 *  2) state.sessionId로 get-session-media Edge Function(fetchSessionMedia) 호출해 signed URL 획득
 *  3) 위 둘 다 없으면 개발/테스트용 플레이스홀더 텍스처
 *
 * 애니메이션이 끝나면(자체 타임라인 종료) onAnimationComplete가 호출되어 자동으로 /qr로 이동한다.
 * 스킵 버튼은 두지 않는다(몰입감 검증 목적, 스펙 4.7).
 */
export default function PrintAnimation() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as PrintAnimationLocationState | null) ?? {}

  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(state.resultImageUrl ?? null)
  const navigatedRef = useRef(false)

  useEffect(() => {
    if (state.resultImageUrl) {
      setResolvedImageUrl(state.resultImageUrl)
      return
    }
    if (!state.sessionId) {
      // 이 라우트에 세션 정보 없이 단독 진입한 경우(개발/테스트) — 플레이스홀더로 대체.
      setResolvedImageUrl(PLACEHOLDER_RESULT_IMAGE)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        // sessions 테이블은 anon SELECT가 막혀 있다(0005_sessions_select_hardening.sql).
        // 이 시점(/generate가 status='completed'로 갱신한 뒤)에는 get-session-media Edge
        // Function을 통해서만 signed URL을 받아올 수 있다 — apps/result/src/lib/getSessionMedia.ts와
        // 동일 계약을 공용 패키지(@withmini/shared)에서 그대로 재사용한다.
        const { fetchSessionMedia } = await import('@withmini/shared')
        const media = await fetchSessionMedia(state.sessionId as string)
        if (cancelled) return
        if (media.status !== 'completed' || !media.resultImageUrl) {
          setResolvedImageUrl(PLACEHOLDER_RESULT_IMAGE)
          return
        }
        setResolvedImageUrl(media.resultImageUrl)
      } catch {
        if (!cancelled) setResolvedImageUrl(PLACEHOLDER_RESULT_IMAGE)
      }
    })()

    return () => {
      cancelled = true
    }
    // state 객체 자체가 매 렌더 새 참조라 sessionId/resultImageUrl만 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionId, state.resultImageUrl])

  /** 애니메이션 종료 콜백 — integrator가 이 콜백 하나만 보고 다음 화면 전환 지점을 알 수 있다. */
  const handleAnimationComplete = useCallback(() => {
    if (navigatedRef.current) return
    navigatedRef.current = true
    navigate('/qr', { state: { ...state, resultImageUrl: resolvedImageUrl } })
  }, [navigate, state, resolvedImageUrl])

  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        overflow: 'hidden',
        position: 'relative',
        background: 'radial-gradient(circle at 50% 38%, #23262e 0%, #101114 70%)',
      }}
    >
      <PrintAnimationCanvas resultImageUrl={resolvedImageUrl} onComplete={handleAnimationComplete} />
      <p
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '6%',
          transform: 'translateX(-50%)',
          margin: 0,
          color: '#f5f5f5',
          fontSize: '1.15rem',
          letterSpacing: '0.02em',
          opacity: 0.85,
          pointerEvents: 'none',
        }}
      >
        사진을 인화하고 있어요...
      </p>
    </main>
  )
}
