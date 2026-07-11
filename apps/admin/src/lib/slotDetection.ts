import type { FrameSlot } from '@withmini/shared'

/**
 * 프레임 PNG의 투명 영역(사진이 들어갈 자리)을 자동으로 찾아 layout_data.slots 후보를 만든다.
 * packages/shared/src/compositor.ts의 loadImage와 동일하게 crossOrigin='anonymous'로 이미지를
 * 불러온다(Supabase Storage 공개 버킷 이미지를 canvas에서 픽셀 단위로 읽으려면 필요).
 */

const ALPHA_THRESHOLD = 25 // 이보다 작은 알파값을 "투명"으로 간주
const MIN_AREA_RATIO = 0.01 // 전체 픽셀 대비 1% 미만 영역은 안티앨리어싱 파편 등 노이즈로 제외
const MAX_DETECTION_DIMENSION = 1000 // 탐지용 다운스케일 상한 — 결과는 0~1 비율이라 무손실

interface DetectedRegion {
  x: number
  y: number
  width: number
  height: number
  area: number
  touchesEdge: boolean
}

export async function detectTransparentSlots(imageUrl: string): Promise<FrameSlot[]> {
  const img = await loadImageForDetection(imageUrl)
  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height
  if (!naturalWidth || !naturalHeight) {
    throw new Error('이미지 크기를 확인할 수 없습니다.')
  }

  const scale = Math.min(1, MAX_DETECTION_DIMENSION / Math.max(naturalWidth, naturalHeight))
  const w = Math.max(1, Math.round(naturalWidth * scale))
  const h = Math.max(1, Math.round(naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context를 생성할 수 없습니다.')
  }
  ctx.drawImage(img, 0, 0, w, h)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, w, h).data
  } catch {
    throw new Error('이미지 픽셀 데이터를 읽을 수 없습니다(CORS 제한일 수 있습니다).')
  }

  const regions = findTransparentRegions(data, w, h)
  const minArea = w * h * MIN_AREA_RATIO
  const significant = regions.filter((r) => r.area >= minArea)

  // 가장자리에 닿은 영역은 배경 투명일 가능성이 높아 기본 제외하되,
  // 그 결과 후보가 하나도 없으면(스티커형 프레임 등) 가장자리 영역도 포함해 재시도한다.
  const nonEdge = significant.filter((r) => !r.touchesEdge)
  const chosen = nonEdge.length > 0 ? nonEdge : significant

  const slots: FrameSlot[] = chosen.map((r) => ({
    x: r.x / w,
    y: r.y / h,
    width: r.width / w,
    height: r.height / h,
  }))

  return sortReadingOrder(slots)
}

/** 4방향 연결 요소(BFS, 명시적 스택 — 재귀 스택오버플로 방지) 탐색으로 투명 영역들을 묶는다. */
function findTransparentRegions(data: Uint8ClampedArray, w: number, h: number): DetectedRegion[] {
  const visited = new Uint8Array(w * h)
  const regions: DetectedRegion[] = []
  const stack: number[] = []

  const isTransparent = (idx: number) => data[idx * 4 + 3] < ALPHA_THRESHOLD

  for (let start = 0; start < w * h; start++) {
    if (visited[start]) continue
    if (!isTransparent(start)) {
      visited[start] = 1
      continue
    }

    let minX = w
    let minY = h
    let maxX = 0
    let maxY = 0
    let area = 0
    let touchesEdge = false

    visited[start] = 1
    stack.push(start)

    while (stack.length > 0) {
      const idx = stack.pop() as number
      const x = idx % w
      const y = (idx - x) / w
      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true

      const neighbors: number[] = []
      if (x > 0) neighbors.push(idx - 1)
      if (x < w - 1) neighbors.push(idx + 1)
      if (y > 0) neighbors.push(idx - w)
      if (y < h - 1) neighbors.push(idx + w)

      for (const nIdx of neighbors) {
        if (visited[nIdx]) continue
        visited[nIdx] = 1
        if (isTransparent(nIdx)) stack.push(nIdx)
      }
    }

    regions.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area, touchesEdge })
  }

  return regions
}

/** 위→아래, 같은 줄(y 중심이 슬롯 높이의 절반 이내 차이)이면 왼쪽→오른쪽 순서로 정렬한다. */
function sortReadingOrder(slots: FrameSlot[]): FrameSlot[] {
  type WithCenter = FrameSlot & { cx: number; cy: number }
  const withCenter: WithCenter[] = slots.map((s) => ({ ...s, cx: s.x + s.width / 2, cy: s.y + s.height / 2 }))
  withCenter.sort((a, b) => a.cy - b.cy)

  const rows: WithCenter[][] = []
  for (const s of withCenter) {
    const row = rows.find((r) => Math.abs(r[0].cy - s.cy) <= s.height / 2)
    if (row) row.push(s)
    else rows.push([s])
  }

  const ordered: WithCenter[] = []
  for (const row of rows) {
    row.sort((a, b) => a.cx - b.cx)
    ordered.push(...row)
  }

  return ordered.map(({ x, y, width, height }) => ({ x, y, width, height }))
}

function loadImageForDetection(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    img.src = url
  })
}
