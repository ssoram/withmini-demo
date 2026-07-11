import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr } from '@react-three/drei'
import PrintBoothScene from './PrintBoothScene'
import { CAMERA_CENTER_Y } from './constants'

interface PrintAnimationCanvasProps {
  resultImageUrl: string | null
  onComplete: () => void
}

/**
 * react-three-fiber Canvas 진입점.
 * 태블릿 성능을 고려해: 그림자/후처리 없음, pixel ratio 최대 2로 제한,
 * AdaptiveDpr로 프레임이 처지면 자동으로 해상도를 낮춘다.
 */
export default function PrintAnimationCanvas({ resultImageUrl, onComplete }: PrintAnimationCanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows={false}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, CAMERA_CENTER_Y, 4.4], fov: 32, near: 0.1, far: 20 }}
      style={{ width: '100%', height: '100%' }}
    >
      <AdaptiveDpr pixelated={false} />
      <PrintBoothScene resultImageUrl={resultImageUrl} onComplete={onComplete} />
    </Canvas>
  )
}
