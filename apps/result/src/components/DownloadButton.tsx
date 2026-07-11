import { useState } from 'react'
import { shareOrDownload } from '../lib/download'

interface DownloadButtonProps {
  url: string
  filename: string
  mimeType: string
  label: string
}

export default function DownloadButton({ url, filename, mimeType, label }: DownloadButtonProps) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      await shareOrDownload(url, filename, mimeType)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="btn-primary" onClick={() => void handleClick()} disabled={busy}>
      {busy ? '준비 중...' : label}
    </button>
  )
}
