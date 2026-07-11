import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Concept, Frame } from '@withmini/shared'

/** 촬영된(또는 선택된) 사진 한 장. blob은 업로드용, previewUrl은 화면 표시용 objectURL. */
export interface CapturedPhoto {
  blob: Blob
  previewUrl: string
}

interface BoothFlowContextValue {
  concept: Concept | null
  frame: Frame | null
  capturedPhotos: CapturedPhoto[]
  selectedPhotos: CapturedPhoto[]
  /** true인 동안은 idle timeout이 동작하지 않는다 (자동 촬영/업로드 등 시스템이 바쁜 구간). */
  isBusy: boolean
  setConcept: (concept: Concept) => void
  setFrame: (frame: Frame) => void
  setCapturedPhotos: (photos: CapturedPhoto[]) => void
  setSelectedPhotos: (photos: CapturedPhoto[]) => void
  setIsBusy: (busy: boolean) => void
  /** 시작 화면 진입/idle timeout 시 플로우 상태를 전부 초기화한다. */
  reset: () => void
}

const BoothFlowContext = createContext<BoothFlowContextValue | null>(null)

export function BoothFlowProvider({ children }: { children: ReactNode }) {
  const [concept, setConceptState] = useState<Concept | null>(null)
  const [frame, setFrameState] = useState<Frame | null>(null)
  const [capturedPhotos, setCapturedPhotosState] = useState<CapturedPhoto[]>([])
  const [selectedPhotos, setSelectedPhotosState] = useState<CapturedPhoto[]>([])
  const [isBusy, setIsBusy] = useState(false)

  const setConcept = useCallback((next: Concept) => setConceptState(next), [])
  const setFrame = useCallback((next: Frame) => setFrameState(next), [])
  const setCapturedPhotos = useCallback((photos: CapturedPhoto[]) => setCapturedPhotosState(photos), [])
  const setSelectedPhotos = useCallback((photos: CapturedPhoto[]) => setSelectedPhotosState(photos), [])

  const reset = useCallback(() => {
    setCapturedPhotosState((prev) => {
      prev.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
      return []
    })
    setSelectedPhotosState([])
    setConceptState(null)
    setFrameState(null)
    setIsBusy(false)
  }, [])

  const value = useMemo<BoothFlowContextValue>(
    () => ({
      concept,
      frame,
      capturedPhotos,
      selectedPhotos,
      isBusy,
      setConcept,
      setFrame,
      setCapturedPhotos,
      setSelectedPhotos,
      setIsBusy,
      reset,
    }),
    [concept, frame, capturedPhotos, selectedPhotos, isBusy, setConcept, setFrame, setCapturedPhotos, setSelectedPhotos, reset]
  )

  return <BoothFlowContext.Provider value={value}>{children}</BoothFlowContext.Provider>
}

export function useBoothFlow(): BoothFlowContextValue {
  const ctx = useContext(BoothFlowContext)
  if (!ctx) {
    throw new Error('useBoothFlow는 BoothFlowProvider 내부에서만 사용할 수 있습니다.')
  }
  return ctx
}
