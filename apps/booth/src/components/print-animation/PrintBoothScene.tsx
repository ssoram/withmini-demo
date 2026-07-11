import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import PhotoBoothMachine from './PhotoBoothMachine'
import PhotoCard from './PhotoCard'
import { useResultTexture } from './useResultTexture'
import { clamp01, easeInOutSine, easeOutBack, easeOutCubic } from './easing'
import { TIMELINE, TOTAL_DURATION, phaseProgress } from './timeline'
import { CAMERA_CENTER_Y, CARD_HEIGHT, DEFAULT_CARD_ASPECT, SLOT_Y } from './constants'

interface PrintBoothSceneProps {
  resultImageUrl: string | null
  onComplete: () => void
}

/** 카드가 슬롯 안에 완전히 숨어 있을 때의 top-edge world Y (기계 몸체 뒤에 가려짐). */
const HIDDEN_Y = SLOT_Y + CARD_HEIGHT
/** 카드가 완전히 빠져나와 슬롯 아래에 걸려있을 때의 top-edge world Y. */
const OUT_Y = SLOT_Y - CARD_HEIGHT * 0.15
/** 종이가 빠져나오며 중력에 눌려 살짝 앞으로 처지는 각도(rad). */
const DROOP_ROTATION_X = -0.32

/**
 * 스펙 4.7 출력 애니메이션의 실제 씬 콘텐츠.
 * 매 프레임 elapsed time(clock.getElapsedTime())만으로 전체 시퀀스를 계산해 그린다 —
 * React state를 프레임마다 갱신하지 않고 three.js 객체(ref)를 직접 mutate해 렌더 비용을 최소화한다.
 */
export default function PrintBoothScene({ resultImageUrl, onComplete }: PrintBoothSceneProps) {
  const { texture } = useResultTexture(resultImageUrl)
  const aspect = useMemo(() => {
    const img = texture?.image as { width?: number; height?: number } | undefined
    if (img?.width && img?.height) return img.width / img.height
    return DEFAULT_CARD_ASPECT
  }, [texture])

  const cardGroupRef = useRef<THREE.Group>(null)
  const photoMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const indicatorMaterialRef = useRef<THREE.MeshStandardMaterial>(null)
  const indicatorPhaseRef = useRef<'processing' | 'done' | null>(null)
  const completedRef = useRef(false)

  const { camera } = useThree()

  useFrame((state) => {
    const t = state.clock.getElapsedTime()

    // 슬라이드 아웃: 슬롯 안(HIDDEN_Y) → 완전히 나온 위치(OUT_Y)
    const slideProgress = phaseProgress(t, TIMELINE.slideStart, TIMELINE.slideEnd)
    const slideT = easeOutCubic(slideProgress)
    const settleProgress = phaseProgress(t, TIMELINE.slideEnd, TIMELINE.settleEnd)
    const settleT = easeOutBack(settleProgress)

    if (cardGroupRef.current) {
      cardGroupRef.current.position.y = THREE.MathUtils.lerp(HIDDEN_Y, OUT_Y, slideT)
      // 슬라이드 중엔 처지는 각도로 기울고, 안착 단계에서 다시 정면으로 세워진다.
      cardGroupRef.current.rotation.x =
        slideProgress < 1
          ? THREE.MathUtils.lerp(0, DROOP_ROTATION_X, slideT)
          : THREE.MathUtils.lerp(DROOP_ROTATION_X, 0, settleT)
    }

    // 현상(reveal): 완성된 사진이 서서히 드러남. 텍스처가 없으면 빈 카드로 남는다.
    const revealProgress = easeInOutSine(phaseProgress(t, TIMELINE.settleEnd, TIMELINE.revealEnd))
    if (photoMaterialRef.current) {
      photoMaterialRef.current.opacity = texture ? revealProgress : 0
    }

    // 상태 표시등: 인쇄 중(주황 점멸) → 완료(초록 점등)
    const printingActive = t < TIMELINE.settleEnd
    const phase: 'processing' | 'done' = printingActive ? 'processing' : 'done'
    if (indicatorMaterialRef.current && indicatorPhaseRef.current !== phase) {
      indicatorPhaseRef.current = phase
      const color = phase === 'processing' ? '#fbbf24' : '#4ade80'
      indicatorMaterialRef.current.color.set(color)
      indicatorMaterialRef.current.emissive.set(color)
    }
    if (indicatorMaterialRef.current) {
      indicatorMaterialRef.current.emissiveIntensity =
        phase === 'processing' ? Math.max(0.4 + Math.sin(t * 8) * 0.3, 0.15) : 0.7
    }

    // 카메라: 아주 미세한 돌리 인 + 살짝의 흔들림으로 정적인 느낌을 덜어낸다.
    const dollyT = easeInOutSine(clamp01(t / TOTAL_DURATION))
    camera.position.x = 0
    camera.position.y = CAMERA_CENTER_Y + Math.sin(t * 0.6) * 0.015
    camera.position.z = THREE.MathUtils.lerp(4.4, 3.9, dollyT)

    if (!completedRef.current && t >= TOTAL_DURATION) {
      completedRef.current = true
      onComplete()
    }
  })

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 3, 4]} intensity={1.1} />
      <directionalLight position={[-2, 1.5, -2]} intensity={0.3} />
      <PhotoBoothMachine indicatorMaterialRef={indicatorMaterialRef} />
      <PhotoCard groupRef={cardGroupRef} photoMaterialRef={photoMaterialRef} texture={texture} aspect={aspect} />
    </>
  )
}
