// 스펙 섹션 4.9 — 모바일 브라우저 저장(다운로드) 지원. <a download> 또는 Web Share API 사용.

async function downloadViaAnchor(url: string, filename: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('failed to fetch media')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    // fetch가 CORS 등으로 실패하면 새 탭에서 직접 열어 사용자가 길게 눌러 저장하도록 폴백한다.
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/** 가능하면 Web Share API(파일 공유)로, 아니면 다운로드로 저장을 지원한다. */
export async function shareOrDownload(url: string, filename: string, mimeType: string) {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
    share?: (data?: ShareData) => Promise<void>
  }

  if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const file = new File([blob], filename, { type: mimeType })
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file] })
        return
      }
    } catch {
      // 공유 취소/실패 시 아래 다운로드 폴백으로 진행한다.
    }
  }

  await downloadViaAnchor(url, filename)
}
