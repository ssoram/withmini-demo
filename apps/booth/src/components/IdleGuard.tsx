import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useIdleTimer } from '../hooks/useIdleTimer'
import { useBoothFlow } from '../context/BoothFlowContext'

// 스펙 섹션 4.1: 대기 상태에서 일정 시간(약 60초) 인터랙션 없으면 시작 화면으로 자동 복귀.
const IDLE_TIMEOUT_MS = 60_000

export default function IdleGuard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isBusy, reset } = useBoothFlow()

  const handleIdle = useCallback(() => {
    if (location.pathname === '/') return
    reset()
    navigate('/', { replace: true })
  }, [location.pathname, navigate, reset])

  // 자동 촬영(4.4)·결과 생성(4.6)처럼 시스템이 스스로 진행 중인 화면에서는 idle timeout을 잠시 멈춘다.
  useIdleTimer(IDLE_TIMEOUT_MS, handleIdle, { paused: isBusy })

  return null
}
