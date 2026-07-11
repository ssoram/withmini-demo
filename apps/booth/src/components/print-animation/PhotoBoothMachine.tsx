import type { RefObject } from 'react'
import { useMemo } from 'react'
import * as THREE from 'three'
import { BODY_HEIGHT, MACHINE_ACCENT_COLOR, MACHINE_BODY_COLOR, SLOT_Y } from './constants'

interface PhotoBoothMachineProps {
  indicatorMaterialRef: RefObject<THREE.MeshStandardMaterial>
}

/**
 * 간단한 형태의 포토부스 기계 모델 (저폴리곤 박스 조합, 태블릿에서도 가볍게 렌더링).
 *
 * 몸체는 SLOT_Y부터 위로만 존재한다 — 그래서 카드(PhotoCard)가 SLOT_Y보다 아래로 내려오면
 * 몸체에 가려지지 않고 그대로 드러나며, "슬롯에서 종이가 밀려나온다"는 착시를 만든다.
 * (자세한 원리는 PrintBoothScene 주석 참고)
 */
export default function PhotoBoothMachine({ indicatorMaterialRef }: PhotoBoothMachineProps) {
  const bodyGeometry = useMemo(() => new THREE.BoxGeometry(1.7, BODY_HEIGHT, 0.9), [])
  const panelGeometry = useMemo(() => new THREE.BoxGeometry(1.15, 0.55, 0.02), [])
  const slotGeometry = useMemo(() => new THREE.BoxGeometry(1.05, 0.05, 0.06), [])
  const indicatorGeometry = useMemo(() => new THREE.SphereGeometry(0.045, 12, 12), [])

  return (
    <group>
      <mesh geometry={bodyGeometry} position={[0, SLOT_Y + BODY_HEIGHT / 2, 0]}>
        <meshStandardMaterial color={MACHINE_BODY_COLOR} roughness={0.55} metalness={0.15} />
      </mesh>

      {/* 전면 스크린 느낌의 패널 */}
      <mesh geometry={panelGeometry} position={[0, SLOT_Y + BODY_HEIGHT * 0.62, 0.46]}>
        <meshStandardMaterial
          color={MACHINE_ACCENT_COLOR}
          roughness={0.3}
          metalness={0.2}
          emissive={MACHINE_ACCENT_COLOR}
          emissiveIntensity={0.18}
        />
      </mesh>

      {/* 슬롯 입구 */}
      <mesh geometry={slotGeometry} position={[0, SLOT_Y, 0.44]}>
        <meshStandardMaterial color="#111318" roughness={0.9} />
      </mesh>

      {/* 인쇄 진행 상태 표시등 (색상/밝기는 PrintBoothScene에서 매 프레임 갱신) */}
      <mesh geometry={indicatorGeometry} position={[0.6, SLOT_Y + 0.1, 0.46]}>
        <meshStandardMaterial
          ref={indicatorMaterialRef}
          color="#fbbf24"
          emissive="#fbbf24"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  )
}
