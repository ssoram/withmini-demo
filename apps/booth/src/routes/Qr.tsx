import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import Screen from '../components/Screen'

// {result 도메인}/{sessionId} 형태의 QR 대상 URL. Generate.tsx가 sessions.qr_url을 저장할 때 쓰는 것과
// 동일한 규칙으로 로컬 계산한다. sessions 테이블은 anon SELECT를 허용하지 않으므로
// (0005_sessions_select_hardening.sql) DB에서 다시 조회하지 않는다.
const RESULT_BASE_URL = import.meta.env.VITE_RESULT_BASE_URL || 'https://withmini.link'

// 스펙 섹션 4.8 — "일정 시간 후 자동으로 시작 화면으로 복귀". 전역 idle timeout(60초, IdleGuard)과는
// 별개로, QR 화면 자체는 손님이 스캔만 하고 자리를 뜨는 화면이라 더 짧은 시간으로 복귀시킨다.
const AUTO_RETURN_MS = 25_000

interface QrLocationState {
  sessionId?: string
  [key: string]: unknown
}

export default function Qr() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as QrLocationState | null) ?? {}
  const sessionId = state.sessionId

  const qrValue = sessionId ? `${RESULT_BASE_URL}/${sessionId}` : null
  const navigatedRef = useRef(false)

  // 이 화면에 세션 정보 없이 단독 진입한 경우(예: 새로고침) — 시작 화면으로 되돌린다.
  useEffect(() => {
    if (!sessionId) {
      navigate('/', { replace: true })
    }
  }, [sessionId, navigate])

  useEffect(() => {
    if (!sessionId) return
    const timer = window.setTimeout(() => {
      if (navigatedRef.current) return
      navigatedRef.current = true
      navigate('/', { replace: true })
    }, AUTO_RETURN_MS)
    return () => window.clearTimeout(timer)
  }, [sessionId, navigate])

  if (!sessionId || !qrValue) return null

  return (
    <Screen title="QR을 스캔해주세요" subtitle="사진과 영상을 휴대폰으로 받아보실 수 있어요">
      <div className="qr-box">
        <QRCodeSVG value={qrValue} size={280} />
      </div>
      <p className="qr-hint">잠시 후 처음 화면으로 돌아갑니다</p>
    </Screen>
  )
}
