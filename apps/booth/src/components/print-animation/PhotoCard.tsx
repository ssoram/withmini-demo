import type { RefObject } from 'react'
import { useMemo } from 'react'
import * as THREE from 'three'
import { CARD_HEIGHT } from './constants'

interface PhotoCardProps {
  groupRef: RefObject<THREE.Group>
  photoMaterialRef: RefObject<THREE.MeshBasicMaterial>
  texture: THREE.Texture | null
  aspect: number
}

/**
 * 슬롯에서 밀려나오는 사진 카드.
 *
 * geometry의 pivot을 카드 "상단 모서리"로 옮겨두었기 때문에, PrintBoothScene에서
 * group.position.y 하나만 바꿔도 카드가 슬롯 위쪽(기계 몸체에 가려짐)에서 아래쪽(드러남)으로
 * 자연스럽게 미끄러져 나오는 것처럼 보인다.
 *
 * 두 장의 평면을 겹쳐 사용한다:
 * - 바탕 종이(항상 보임): 텍스처가 아직 없어도 "종이가 나온다"는 느낌을 준다.
 * - 완성된 사진(오퍼시티 0→1): reveal 단계에서 서서히 드러나며 "현상되는" 연출을 만든다.
 */
export default function PhotoCard({ groupRef, photoMaterialRef, texture, aspect }: PhotoCardProps) {
  const width = CARD_HEIGHT * aspect

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, CARD_HEIGHT)
    geo.translate(0, -CARD_HEIGHT / 2, 0)
    return geo
  }, [width])

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#f5f3ee" roughness={0.85} />
      </mesh>
      <mesh geometry={geometry} position={[0, 0, 0.002]}>
        <meshBasicMaterial
          ref={photoMaterialRef}
          map={texture ?? undefined}
          transparent
          opacity={0}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
