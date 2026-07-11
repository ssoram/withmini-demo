/**
 * 촬영 사진 + 프레임 합성(Canvas API) 로직.
 * docs/withmini_demo_spec.md 섹션 4.6 — 선택된 사진들을 frames.layout_data(슬롯 좌표)에 맞춰 그리고,
 * 그 위에 frames.preview_image_url 이미지를 그대로 덮어 프레임의 테두리/장식을 표현한다.
 * (프레임 이미지는 사진이 들어갈 자리가 투명(PNG alpha)한 템플릿이라고 가정한다.)
 *
 * layout_data.slots의 x/y/width/height는 값이 모두 0~1 사이면 프레임 이미지 크기에 대한 비율로,
 * 그렇지 않으면 절대 픽셀 좌표로 해석한다.
 */
import type { Frame, FrameSlot } from './types'

export interface CompositeOptions {
  frame: Pick<Frame, 'layout_data' | 'preview_image_url'>
  /** 선택된 사진들. frame.layout_data.slots와 같은 순서(슬롯 순서)여야 한다. */
  photos: Blob[]
  /** frame.preview_image_url을 실제로 불러올 수 있는 URL (public URL 또는 signed URL). */
  frameImageUrl: string
  mimeType?: string
  quality?: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export async function compositePhotosToFrame({
  frame,
  photos,
  frameImageUrl,
  mimeType = 'image/png',
  quality,
}: CompositeOptions): Promise<Blob> {
  const slots = frame.layout_data?.slots ?? []
  if (slots.length === 0) {
    throw new Error('frame.layout_data.slots가 비어 있습니다. 합성할 수 없습니다.')
  }
  if (photos.length !== slots.length) {
    throw new Error(`선택한 사진 수(${photos.length})와 프레임 슬롯 수(${slots.length})가 일치하지 않습니다.`)
  }

  const frameImage = await loadImage(frameImageUrl)
  const canvasWidth = frameImage.naturalWidth || frameImage.width
  const canvasHeight = frameImage.naturalHeight || frameImage.height

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context를 생성할 수 없습니다.')
  }

  for (let i = 0; i < slots.length; i++) {
    const rect = resolveRect(slots[i], canvasWidth, canvasHeight)
    const photoImage = await loadImage(photos[i])
    drawCover(ctx, photoImage, rect)
    revokeIfBlobUrl(photoImage.src)
  }

  // 사진 위에 프레임 이미지를 덮어 테두리/장식을 표현한다.
  ctx.drawImage(frameImage, 0, 0, canvasWidth, canvasHeight)
  revokeIfBlobUrl(frameImage.src)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('합성 이미지를 생성하지 못했습니다 (canvas.toBlob 실패).'))
    }, mimeType, quality)
  })
}

function resolveRect(slot: FrameSlot, canvasWidth: number, canvasHeight: number): Rect {
  const isNormalized = slot.x <= 1 && slot.y <= 1 && slot.width <= 1 && slot.height <= 1
  if (isNormalized) {
    return {
      x: slot.x * canvasWidth,
      y: slot.y * canvasHeight,
      width: slot.width * canvasWidth,
      height: slot.height * canvasHeight,
      rotation: slot.rotation,
    }
  }
  return { x: slot.x, y: slot.y, width: slot.width, height: slot.height, rotation: slot.rotation }
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, rect: Rect) {
  const { x, y, width, height, rotation = 0 } = rect
  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height
  const imgRatio = naturalWidth / naturalHeight
  const rectRatio = width / height

  let sx = 0
  let sy = 0
  let sw = naturalWidth
  let sh = naturalHeight

  if (imgRatio > rectRatio) {
    sw = naturalHeight * rectRatio
    sx = (naturalWidth - sw) / 2
  } else {
    sh = naturalWidth / rectRatio
    sy = (naturalHeight - sh) / 2
  }

  ctx.save()
  if (rotation) {
    const cx = x + width / 2
    const cy = y + height / 2
    ctx.translate(cx, cy)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height)
  ctx.restore()
}

function loadImage(source: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (typeof source === 'string') {
      // Supabase Storage(교차 출처)에서 불러온 이미지를 canvas.toBlob에 사용하려면 CORS 허용 로드가 필요하다.
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source)
  })
}

function revokeIfBlobUrl(src: string) {
  if (src.startsWith('blob:')) {
    URL.revokeObjectURL(src)
  }
}
