import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoothFlow } from '../context/BoothFlowContext'

// 스펙 섹션 4.1 — 시작 화면. 터치 시작 유도 문구 + CTA 버튼.
export default function Start() {
  const navigate = useNavigate()
  const { reset } = useBoothFlow()

  // 시작 화면에 진입할 때마다(첫 진입, idle timeout 복귀 등) 이전 플로우 상태를 비운다.
  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function start() {
    navigate('/concept')
  }

  return (
    <div className="start-screen" onClick={start}>
      <h1>사진을 찍어볼까요?</h1>
      <p>화면을 터치하면 시작합니다</p>
      <button className="btn-primary" onClick={start}>
        터치하여 시작
      </button>
    </div>
  )
}
