import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Screen from '../components/Screen'
import { useBoothFlow } from '../context/BoothFlowContext'

// 스펙 섹션 4.4 — 사진 촬영. getUserMedia로 카메라 스트림 접근, 3-2-1 카운트다운 후 8장 자동 촬영.
const TOTAL_SHOTS = 8
const COUNTDOWN_SECONDS = 3
const SHOT_INTERVAL_MS = 700

type Phase = 'init' | 'countdown' | 'shooting' | 'error'

export default function Capture() {
  const navigate = useNavigate()
  const { concept, frame, setCapturedPhotos, setIsBusy } = useBoothFlow()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('init')
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [shotsTaken, setShotsTaken] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!concept || !frame) {
      navigate('/frame', { replace: true })
    }
  }, [concept, frame, navigate])

  useEffect(() => {
    if (!concept || !frame) return
    let cancelled = false
    setIsBusy(true)
    setError(null)
    setShotsTaken(0)
    setPhase('init')

    async function run() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          // HTTP(비보안 컨텍스트)나 카메라 API를 지원하지 않는 브라우저에서는 getUserMedia 자체가 없다.
          throw new Error('카메라를 사용할 수 없습니다. HTTPS 주소로 접속했는지 확인해 주세요.')
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const photos: { blob: Blob; previewUrl: string }[] = []
        for (let shot = 0; shot < TOTAL_SHOTS; shot++) {
          for (let c = COUNTDOWN_SECONDS; c >= 1; c--) {
            if (cancelled) return
            setPhase('countdown')
            setCountdown(c)
            await wait(1000)
          }
          if (cancelled) return
          setPhase('shooting')
          const blob = await captureFrame(videoRef.current!)
          photos.push({ blob, previewUrl: URL.createObjectURL(blob) })
          setShotsTaken(photos.length)
          await wait(SHOT_INTERVAL_MS)
        }

        if (cancelled) return
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        setCapturedPhotos(photos)
        setIsBusy(false)
        navigate('/select')
      } catch (err) {
        if (cancelled) return
        setPhase('error')
        setError(describeCameraError(err))
        setIsBusy(false)
      }
    }

    run()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setIsBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept, frame, attempt])

  if (!concept || !frame) return null

  return (
    <Screen
      title="사진 촬영"
      subtitle={phase === 'error' ? undefined : `${shotsTaken}/${TOTAL_SHOTS}장 촬영 중`}
    >
      {phase !== 'error' && (
        <>
          <video ref={videoRef} className="camera-preview" muted playsInline />
          {phase === 'countdown' && <div className="countdown">{countdown}</div>}
          <div className="progress-dots">
            {Array.from({ length: TOTAL_SHOTS }).map((_, i) => (
              <span key={i} className={`progress-dot ${i < shotsTaken ? 'done' : ''}`} />
            ))}
          </div>
        </>
      )}
      {phase === 'error' && (
        <div className="error-box">
          <p>{error}</p>
          <button className="btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </button>
        </div>
      )}
    </Screen>
  )
}

// getUserMedia 실패 원인을 사용자가 알 수 있는 문구로 바꾼다.
function describeCameraError(err: unknown): string {
  if (err instanceof Error && err.message.includes('HTTPS')) {
    // run()에서 이미 사용자 문구로 던진 에러(보안 컨텍스트 아님/API 미지원)는 그대로 사용한다.
    return err.message
  }
  const name = err instanceof DOMException ? err.name : undefined
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '카메라 권한을 허용해 주세요.'
  }
  return '카메라를 사용할 수 없습니다. HTTPS 주소로 접속했는지 확인해 주세요.'
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return Promise.reject(new Error('Canvas 2D context를 생성할 수 없습니다.'))
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('사진 캡처에 실패했습니다.'))),
      'image/jpeg',
      0.92
    )
  })
}
