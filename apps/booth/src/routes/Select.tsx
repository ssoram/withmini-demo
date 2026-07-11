import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Screen from '../components/Screen'
import { useBoothFlow } from '../context/BoothFlowContext'

// 스펙 섹션 4.5 — 사진 선택. 8장 중 slot_count만큼 선택, 선택 순서가 프레임 슬롯 순서.
export default function Select() {
  const navigate = useNavigate()
  const { frame, capturedPhotos, setSelectedPhotos } = useBoothFlow()
  // capturedPhotos의 index를 선택 순서대로 담는다 (order의 위치 = 슬롯 순서).
  const [order, setOrder] = useState<number[]>([])

  useEffect(() => {
    if (!frame || capturedPhotos.length === 0) {
      navigate('/capture', { replace: true })
    }
  }, [frame, capturedPhotos, navigate])

  if (!frame || capturedPhotos.length === 0) return null

  const slotCount = frame.slot_count

  function toggle(index: number) {
    setOrder((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index)
      }
      if (prev.length >= slotCount) return prev
      return [...prev, index]
    })
  }

  function handleNext() {
    setSelectedPhotos(order.map((i) => capturedPhotos[i]))
    navigate('/generate')
  }

  return (
    <Screen
      title="사진을 선택하세요"
      subtitle={`${slotCount}장을 순서대로 선택하세요 (${order.length}/${slotCount})`}
      footer={
        <button className="btn-primary" disabled={order.length !== slotCount} onClick={handleNext}>
          다음
        </button>
      }
    >
      <div className="thumb-grid">
        {capturedPhotos.map((photo, index) => {
          const selectedOrder = order.indexOf(index)
          const isSelected = selectedOrder !== -1
          return (
            <button key={index} className={`thumb ${isSelected ? 'selected' : ''}`} onClick={() => toggle(index)}>
              <img src={photo.previewUrl} alt={`촬영 사진 ${index + 1}`} />
              {isSelected && <span className="thumb-badge">{selectedOrder + 1}</span>}
            </button>
          )
        })}
      </div>
    </Screen>
  )
}
