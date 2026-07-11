/**
 * sessions.result_image_url을 전혀 알 수 없을 때(개발 중 이 라우트에 단독 접근하는 경우 등)
 * 사용하는 대체 텍스처. 실제 플로우에서는 항상 라우트 state 또는 sessions 조회로
 * result_image_url이 전달되는 것을 기대하며, 이 플레이스홀더는 개발/테스트 편의용이다.
 */
const PLACEHOLDER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe3ec"/>
      <stop offset="100%" stop-color="#dce8ff"/>
    </linearGradient>
  </defs>
  <rect width="480" height="640" fill="url(#bg)"/>
  <rect x="24" y="24" width="432" height="592" fill="none" stroke="#ffffffaa" stroke-width="6"/>
  <text x="240" y="320" font-family="sans-serif" font-size="28" fill="#5b5b5b" text-anchor="middle">withmini</text>
  <text x="240" y="360" font-family="sans-serif" font-size="18" fill="#8a8a8a" text-anchor="middle">sample photo</text>
</svg>
`.trim()

export const PLACEHOLDER_RESULT_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(PLACEHOLDER_SVG)}`
