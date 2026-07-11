import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchSessionMedia, type SessionMediaCompleted } from '@withmini/shared'
import DownloadButton from '../components/DownloadButton'

type Tab = 'photo' | 'timelapse' | 'frame'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; media: SessionMediaCompleted }
  | { kind: 'expired' }
  | { kind: 'pending' }
  | { kind: 'error' }

// 스펙 섹션 4.9 — QR 결과 페이지. 세션을 조회해 만료/미완료/정상 상태에 맞는 화면을 보여준다.
// 미디어는 supabase/functions/get-session-media를 통해서만 받는다(session 버킷은 비공개).
export default function Result() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const [tab, setTab] = useState<Tab>('photo')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!sessionId) {
      setView({ kind: 'expired' })
      return
    }

    let cancelled = false
    setView({ kind: 'loading' })
    ;(async () => {
      const result = await fetchSessionMedia(sessionId)
      if (cancelled) return

      if (result.status === 'completed') {
        setView({ kind: 'ready', media: result })
        setTab('photo')
        return
      }
      if (result.status === 'not_found' || result.status === 'expired' || result.status === 'bad_request') {
        setView({ kind: 'expired' })
        return
      }
      if (result.status === 'server_error' || result.status === 'network_error') {
        setView({ kind: 'error' })
        return
      }
      // in_progress 등 — 아직 결과 합성이 끝나지 않은 상태
      setView({ kind: 'pending' })
    })()

    return () => {
      cancelled = true
    }
  }, [sessionId, retryKey])

  if (view.kind === 'loading') {
    return (
      <main className="result-page">
        <div className="result-center">
          <div className="spinner" />
        </div>
      </main>
    )
  }

  if (view.kind === 'expired') {
    return (
      <main className="result-page">
        <div className="result-center">
          <h1>링크가 만료됐어요</h1>
          <p>사진 보관 기간이 지났거나 존재하지 않는 링크예요.</p>
        </div>
      </main>
    )
  }

  if (view.kind === 'pending') {
    return (
      <main className="result-page">
        <div className="result-center">
          <h1>아직 준비 중이에요</h1>
          <p>사진을 만들고 있어요. 잠시 후 다시 확인해주세요.</p>
          <button className="btn-secondary" onClick={() => setRetryKey((key) => key + 1)}>
            다시 확인하기
          </button>
        </div>
      </main>
    )
  }

  if (view.kind === 'error') {
    return (
      <main className="result-page">
        <div className="result-center">
          <h1>불러오지 못했어요</h1>
          <p>잠시 후 다시 시도해주세요.</p>
          <button className="btn-secondary" onClick={() => setRetryKey((key) => key + 1)}>
            다시 시도
          </button>
        </div>
      </main>
    )
  }

  const { media } = view
  const tabs: { key: Tab; label: string }[] = [{ key: 'photo', label: '사진' }]
  if (media.timelapseVideoUrl) tabs.push({ key: 'timelapse', label: '타임랩스' })
  if (media.frameVideoUrl) tabs.push({ key: 'frame', label: '프레임 영상' })

  return (
    <main className="result-page">
      <header className="result-header">
        <h1>사진이 준비됐어요</h1>
        <p>아래에서 사진과 영상을 확인하고 저장하세요</p>
      </header>

      {tabs.length > 1 && (
        <nav className="result-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`result-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <div className="result-content">
        {tab === 'photo' && (
          <div className="result-media">
            <img src={media.resultImageUrl} alt="완성된 사진" className="result-image" />
            <DownloadButton
              url={media.resultImageUrl}
              filename="withmini-photo.jpg"
              mimeType="image/jpeg"
              label="사진 저장하기"
            />
          </div>
        )}

        {tab === 'timelapse' && media.timelapseVideoUrl && (
          <div className="result-media">
            <video className="result-video" src={media.timelapseVideoUrl} controls playsInline />
            <DownloadButton
              url={media.timelapseVideoUrl}
              filename="withmini-timelapse.mp4"
              mimeType="video/mp4"
              label="타임랩스 저장하기"
            />
          </div>
        )}

        {tab === 'frame' && media.frameVideoUrl && (
          <div className="result-media">
            <video className="result-video" src={media.frameVideoUrl} controls playsInline />
            <DownloadButton
              url={media.frameVideoUrl}
              filename="withmini-frame.mp4"
              mimeType="video/mp4"
              label="프레임 영상 저장하기"
            />
          </div>
        )}
      </div>

      <p className="result-expiry">이 링크는 시간이 지나면 만료돼요. 지금 저장해두세요.</p>
    </main>
  )
}
