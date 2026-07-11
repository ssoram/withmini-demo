import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { FrameSlot } from '@withmini/shared'
import { detectTransparentSlots } from '../lib/slotDetection'

/**
 * 스펙 섹션 5.3(고도화) — 프레임 미리보기 이미지 위에 슬롯(네모칸)을 직접 배치하는 비주얼 에디터.
 * 좌표는 항상 이미지 natural 크기 대비 0~1 비율로 다루고 저장한다(compositor.ts 규약과 동일).
 * 외부 라이브러리 없이 순수 마우스 이벤트로 드래그(이동)/리사이즈를 구현한다.
 */
interface SlotEditorProps {
  imageUrl: string | null
  slots: FrameSlot[]
  onSlotsChange: (slots: FrameSlot[]) => void
}

type DragInfo = {
  type: 'move' | 'resize'
  index: number
  startX: number
  startY: number
  startSlot: FrameSlot
}

const MIN_SIZE = 0.03
const DEFAULT_SIZE = 0.3

export default function SlotEditor({ imageUrl, slots, onSlotsChange }: SlotEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detectMessage, setDetectMessage] = useState<string | null>(null)
  const [detectError, setDetectError] = useState<string | null>(null)

  const dragRef = useRef<DragInfo | null>(null)
  const slotsRef = useRef(slots)
  const onSlotsChangeRef = useRef(onSlotsChange)

  useEffect(() => {
    slotsRef.current = slots
  }, [slots])

  useEffect(() => {
    onSlotsChangeRef.current = onSlotsChange
  }, [onSlotsChange])

  // 레거시 데이터(절대 픽셀로 저장된 layout_data)를 이미지 natural 크기를 아는 즉시 0~1 비율로 정규화한다.
  // 이미 비율(모든 값 <= 1)이면 아무것도 하지 않는다 — 조건이 자연히 false가 되어 무한 루프로 이어지지 않는다.
  useEffect(() => {
    if (!naturalSize) return
    const needsConversion = slots.some((s) => s.x > 1 || s.y > 1 || s.width > 1 || s.height > 1)
    if (!needsConversion) return

    const converted = slots.map((s) => {
      if (s.x <= 1 && s.y <= 1 && s.width <= 1 && s.height <= 1) return s
      return {
        x: s.x / naturalSize.width,
        y: s.y / naturalSize.height,
        width: s.width / naturalSize.width,
        height: s.height / naturalSize.height,
        ...(s.rotation !== undefined ? { rotation: s.rotation } : {}),
      }
    })
    onSlotsChangeRef.current(converted)
  }, [naturalSize, slots])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current
    const container = containerRef.current
    if (!drag || !container) return

    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const dx = (e.clientX - drag.startX) / rect.width
    const dy = (e.clientY - drag.startY) / rect.height
    const { startSlot, type, index } = drag

    const next: FrameSlot =
      type === 'move'
        ? {
            ...startSlot,
            x: Math.min(Math.max(0, startSlot.x + dx), 1 - startSlot.width),
            y: Math.min(Math.max(0, startSlot.y + dy), 1 - startSlot.height),
          }
        : {
            ...startSlot,
            width: Math.min(Math.max(MIN_SIZE, startSlot.width + dx), 1 - startSlot.x),
            height: Math.min(Math.max(MIN_SIZE, startSlot.height + dy), 1 - startSlot.y),
          }

    onSlotsChangeRef.current(slotsRef.current.map((s, i) => (i === index ? next : s)))
  }, [])

  const handleMouseUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  function startDrag(e: ReactMouseEvent, index: number, type: 'move' | 'resize') {
    e.preventDefault()
    e.stopPropagation()
    setSelectedIndex(index)
    dragRef.current = { type, index, startX: e.clientX, startY: e.clientY, startSlot: slots[index] }
    // 이전 드래그가 mouseup 없이 끝난 경우(창 밖에서 마우스를 놓는 등)에 대비해 먼저 정리한다.
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleAddSlot() {
    const n = slots.length
    const offset = (n % 5) * 0.06
    const newSlot: FrameSlot = {
      x: Math.min(1 - DEFAULT_SIZE, 0.05 + offset),
      y: Math.min(1 - DEFAULT_SIZE, 0.05 + offset),
      width: DEFAULT_SIZE,
      height: DEFAULT_SIZE,
    }
    onSlotsChange([...slots, newSlot])
    setSelectedIndex(n)
  }

  function handleDeleteSlot(index: number) {
    onSlotsChange(slots.filter((_, i) => i !== index))
    setSelectedIndex(null)
  }

  async function handleAutoDetect() {
    if (!imageUrl) return

    if (slots.length > 0) {
      const ok = window.confirm('기존 슬롯을 지우고 자동 인식 결과로 교체합니다. 계속하시겠습니까?')
      if (!ok) return
    }

    setDetecting(true)
    setDetectMessage(null)
    setDetectError(null)

    try {
      const detected = await detectTransparentSlots(imageUrl)
      if (detected.length === 0) {
        setDetectMessage('투명 영역을 찾지 못했습니다 — 수동으로 추가하세요.')
      } else {
        onSlotsChange(detected)
        setSelectedIndex(null)
        setDetectMessage(`${detected.length}개 칸을 찾았습니다.`)
      }
    } catch (e) {
      // 실패 시 기존 슬롯은 그대로 유지한다(onSlotsChange를 호출하지 않음).
      setDetectError(e instanceof Error ? e.message : String(e))
    } finally {
      setDetecting(false)
    }
  }

  return (
    <div className="slot-editor">
      <div className="slot-editor__toolbar">
        <button type="button" onClick={handleAddSlot} disabled={!imageUrl}>
          칸 추가
        </button>
        <button type="button" onClick={handleAutoDetect} disabled={!imageUrl || detecting}>
          {detecting ? '인식 중...' : '슬롯 자동 인식'}
        </button>
        <span className="hint">슬롯 번호(1, 2, 3…)는 촬영 앱에서 사진을 선택하는 순서와 같습니다.</span>
      </div>
      {detectMessage && <p className="hint">{detectMessage}</p>}
      {detectError && <p className="form-error">{detectError}</p>}

      {!imageUrl ? (
        <p className="notice">먼저 미리보기 이미지를 업로드하면 그 위에 슬롯을 배치할 수 있습니다.</p>
      ) : (
        <div className="slot-editor__canvas" ref={containerRef}>
          <img
            src={imageUrl}
            alt="프레임 미리보기"
            className="slot-editor__image"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget
              setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
            }}
          />
          {slots.map((slot, index) => (
            <div
              key={index}
              className={
                selectedIndex === index ? 'slot-editor__slot slot-editor__slot--selected' : 'slot-editor__slot'
              }
              style={{
                left: `${slot.x * 100}%`,
                top: `${slot.y * 100}%`,
                width: `${slot.width * 100}%`,
                height: `${slot.height * 100}%`,
              }}
              onMouseDown={(e) => startDrag(e, index, 'move')}
            >
              <span className="slot-editor__index">{index + 1}</span>
              <button
                type="button"
                className="slot-editor__delete"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => handleDeleteSlot(index)}
                aria-label={`${index + 1}번 슬롯 삭제`}
              >
                ×
              </button>
              <div
                className="slot-editor__resize-handle"
                onMouseDown={(e) => startDrag(e, index, 'resize')}
              />
            </div>
          ))}
        </div>
      )}

      <p className="hint">현재 슬롯 수: {slots.length}개 (사진 촬영 시 슬롯 수만큼 선택하게 됩니다)</p>
    </div>
  )
}
