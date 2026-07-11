import { useEffect, useState } from 'react'
import * as THREE from 'three'

export type TextureLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

/**
 * 결과 이미지 URL을 Three.js 텍스처로 로드한다.
 *
 * drei의 useTexture(suspense 기반) 대신 수동 TextureLoader를 쓰는 이유:
 * result_image_url이 아직 없거나(state 미전달), signed URL이 만료/오류인 경우에도
 * 씬 전체가 Suspense 에러 바운더리로 죽지 않고 "빈 카드" 상태로 우아하게 대체되어야 하기 때문.
 */
export function useResultTexture(url: string | null): {
  texture: THREE.Texture | null
  status: TextureLoadStatus
} {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const [status, setStatus] = useState<TextureLoadStatus>('idle')

  useEffect(() => {
    if (!url) {
      setTexture(null)
      setStatus('idle')
      return
    }

    let cancelled = false
    let loadedTexture: THREE.Texture | null = null
    setStatus('loading')

    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      url,
      (loaded) => {
        if (cancelled) {
          loaded.dispose()
          return
        }
        loaded.colorSpace = THREE.SRGBColorSpace
        loadedTexture = loaded
        setTexture(loaded)
        setStatus('loaded')
      },
      undefined,
      () => {
        if (!cancelled) {
          setStatus('error')
          setTexture(null)
        }
      }
    )

    return () => {
      cancelled = true
      loadedTexture?.dispose()
    }
  }, [url])

  return { texture, status }
}
