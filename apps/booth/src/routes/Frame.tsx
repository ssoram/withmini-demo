import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, type Frame as FrameRow } from '@withmini/shared'
import Screen from '../components/Screen'
import { useBoothFlow } from '../context/BoothFlowContext'
import { resolvePublicUrl } from '../lib/storage'

// 스펙 섹션 4.3 — 프레임 선택. 선택된 concept_id 기준 frames 조회 (is_active=true AND is_general=true).
export default function Frame() {
  const navigate = useNavigate()
  const { concept, setFrame } = useBoothFlow()
  const [frames, setFrames] = useState<FrameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!concept) {
      navigate('/concept', { replace: true })
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('frames')
        .select('*')
        .eq('concept_id', concept!.id)
        .eq('is_active', true)
        .eq('is_general', true)
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (error) {
        setError('프레임 목록을 불러오지 못했습니다.')
      } else {
        setFrames(data ?? [])
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [concept, navigate])

  function handleSelect(frame: FrameRow) {
    setFrame(frame)
    navigate('/capture')
  }

  if (!concept) return null

  return (
    <Screen title="프레임을 선택하세요" subtitle={`${concept.name} · 원하는 프레임을 터치하세요`}>
      {loading && <div className="spinner" />}
      {error && <p className="error-box">{error}</p>}
      {!loading && !error && frames.length === 0 && <p>사용 가능한 프레임이 없습니다.</p>}
      {!loading && !error && frames.length > 0 && (
        <div className="card-grid" style={{ gridTemplateColumns: `repeat(${Math.min(frames.length, 3)}, 1fr)` }}>
          {frames.map((frame) => (
            <button key={frame.id} className="card frame-card" onClick={() => handleSelect(frame)}>
              <div className="frame-card-media">
                {frame.preview_image_url && (
                  <img src={resolvePublicUrl('frame-previews', frame.preview_image_url)} alt={frame.name} />
                )}
              </div>
              <p className="frame-card-caption">
                {frame.name} · {frame.slot_count}컷
              </p>
            </button>
          ))}
        </div>
      )}
    </Screen>
  )
}
