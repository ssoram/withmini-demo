import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '@withmini/shared'
import type { Concept, Frame, SessionStatus } from '@withmini/shared'
import { useAuth } from '../lib/AuthContext'
import { logAdminAction } from '../lib/auditLog'

/**
 * 스펙 섹션 5.4 — 결과물 관리.
 * 매우 중요: 개별 세션의 사진/영상 URL(raw_photo_urls, selected_photo_urls, result_image_url,
 * timelapse_video_url, qr_url)은 이 화면에서 절대 select/표시하지 않는다.
 * 통계 집계에 필요한 컬럼(concept_id, frame_id, status, created_at)만 조회한다.
 */
interface StatRow {
  concept_id: string
  frame_id: string
  status: SessionStatus
  created_at: string
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  in_progress: '진행 중',
  completed: '완료',
  expired: '만료',
  deleted: '삭제됨',
}

const RETENTION_MIN = 24
const RETENTION_MAX = 48

export default function Sessions() {
  const { admin } = useAuth()
  const canWrite = admin?.role === 'super_admin'

  const [concepts, setConcepts] = useState<Concept[]>([])
  const [frames, setFrames] = useState<Frame[]>([])
  const [rows, setRows] = useState<StatRow[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [rangeCount, setRangeCount] = useState<number | null>(null)
  const [rangeLoading, setRangeLoading] = useState(false)

  const [retentionHours, setRetentionHours] = useState<string>('')
  const [retentionInput, setRetentionInput] = useState<string>('')
  const [retentionSaving, setRetentionSaving] = useState(false)

  const [deleteSessionId, setDeleteSessionId] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null)

  async function loadStats() {
    setLoading(true)
    setError(null)

    const [conceptsRes, framesRes, countRes, rowsRes, settingsRes] = await Promise.all([
      supabase.from('concepts').select('*'),
      supabase.from('frames').select('*'),
      supabase.from('sessions').select('id', { count: 'exact', head: true }),
      // 통계 집계 전용 컬럼만 조회 — 사진/영상 URL은 절대 포함하지 않는다.
      supabase.from('sessions').select('concept_id, frame_id, status, created_at').limit(10000),
      supabase.from('settings').select('key, value, updated_at').eq('key', 'retention_hours').maybeSingle(),
    ])

    if (conceptsRes.error) setError(conceptsRes.error.message)
    if (framesRes.error) setError(framesRes.error.message)
    if (countRes.error) setError(countRes.error.message)
    if (rowsRes.error) setError(rowsRes.error.message)

    setConcepts(conceptsRes.data ?? [])
    setFrames(framesRes.data ?? [])
    setTotalCount(countRes.count ?? null)
    setRows((rowsRes.data as StatRow[] | null) ?? [])
    if (settingsRes.data) {
      setRetentionHours(settingsRes.data.value)
      setRetentionInput(settingsRes.data.value)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadStats()
  }, [])

  const conceptNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of concepts) map.set(c.id, c.name)
    return map
  }, [concepts])

  const frameNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of frames) map.set(f.id, f.name)
    return map
  }, [frames])

  const statusCounts = useMemo(() => {
    const counts: Record<SessionStatus, number> = { in_progress: 0, completed: 0, expired: 0, deleted: 0 }
    for (const row of rows) counts[row.status] += 1
    return counts
  }, [rows])

  const conceptCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.concept_id, (counts.get(row.concept_id) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([conceptId, count]) => ({ conceptId, name: conceptNameById.get(conceptId) ?? '(삭제된 컨셉)', count }))
      .sort((a, b) => b.count - a.count)
  }, [rows, conceptNameById])

  const frameCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.frame_id, (counts.get(row.frame_id) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([frameId, count]) => ({ frameId, name: frameNameById.get(frameId) ?? '(삭제된 프레임)', count }))
      .sort((a, b) => b.count - a.count)
  }, [rows, frameNameById])

  async function handleRangeQuery(event: FormEvent) {
    event.preventDefault()
    if (!rangeFrom || !rangeTo) return

    setRangeLoading(true)
    setError(null)

    const fromIso = new Date(rangeFrom).toISOString()
    // to 날짜는 종일 포함되도록 다음날 00:00 미만으로 처리
    const toIso = new Date(new Date(rangeTo).getTime() + 24 * 60 * 60 * 1000).toISOString()

    const { count, error: rangeError } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromIso)
      .lt('created_at', toIso)

    setRangeLoading(false)

    if (rangeError) {
      setError(rangeError.message)
      return
    }

    setRangeCount(count ?? 0)
  }

  async function handleRetentionSave(event: FormEvent) {
    event.preventDefault()
    if (!admin) return

    const hours = Number(retentionInput)
    if (!Number.isInteger(hours) || hours < RETENTION_MIN || hours > RETENTION_MAX) {
      setError(`보관 시간은 ${RETENTION_MIN}~${RETENTION_MAX}시간 사이의 정수여야 합니다.`)
      return
    }

    setRetentionSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('settings')
      .update({ value: String(hours) })
      .eq('key', 'retention_hours')

    setRetentionSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await logAdminAction({
      adminId: admin.id,
      action: 'settings.update',
      targetTable: 'settings',
      targetId: null,
      detail: { key: 'retention_hours', before: retentionHours, after: String(hours) },
    })

    setRetentionHours(String(hours))
  }

  async function handleDeleteSession(event: FormEvent) {
    event.preventDefault()
    if (!admin || !deleteSessionId.trim()) return

    const sessionId = deleteSessionId.trim()
    const ok = window.confirm(
      `세션 ID "${sessionId}"를 완전히 삭제합니다. 관련 저장소 파일도 함께 삭제되며 되돌릴 수 없습니다. 계속하시겠습니까?`
    )
    if (!ok) return

    setDeleting(true)
    setDeleteMessage(null)
    setError(null)

    try {
      // 이미지/영상 내용은 절대 조회하지 않고, 파일 경로 목록만 확인해 삭제한다.
      const buckets = ['session-raw', 'session-results', 'session-timelapse'] as const
      for (const bucket of buckets) {
        const { data: files, error: listError } = await supabase.storage.from(bucket).list(sessionId)
        if (listError) continue
        if (files && files.length > 0) {
          const paths = files.map((f) => `${sessionId}/${f.name}`)
          await supabase.storage.from(bucket).remove(paths)
        }
      }

      const { error: deleteError, count } = await supabase
        .from('sessions')
        .delete({ count: 'exact' })
        .eq('id', sessionId)

      if (deleteError) {
        throw new Error(deleteError.message)
      }

      if (!count) {
        setDeleteMessage('해당 ID의 세션을 찾을 수 없습니다.')
      } else {
        await logAdminAction({
          adminId: admin.id,
          action: 'session.delete',
          targetTable: 'sessions',
          targetId: sessionId,
          detail: { manual: true },
        })
        setDeleteMessage('세션이 삭제되었습니다.')
        setDeleteSessionId('')
        await loadStats()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main>
      <h1>결과물 관리</h1>
      <p className="notice">
        개인정보 보호 원칙에 따라 개별 촬영 사진/영상은 이 화면에서 조회할 수 없습니다. 통계 정보만 표시됩니다.
      </p>
      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>불러오는 중...</p>
      ) : (
        <>
          <section className="stat-section">
            <h2>전체 현황</h2>
            <div className="stat-cards">
              <div className="stat-card">
                <span className="stat-card__label">총 세션 수</span>
                <span className="stat-card__value">{totalCount ?? rows.length}</span>
              </div>
              {(Object.keys(STATUS_LABEL) as SessionStatus[]).map((status) => (
                <div className="stat-card" key={status}>
                  <span className="stat-card__label">{STATUS_LABEL[status]}</span>
                  <span className="stat-card__value">{statusCounts[status]}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="stat-section">
            <h2>기간별 촬영 건수</h2>
            <form className="inline-form" onSubmit={handleRangeQuery}>
              <label>
                시작일
                <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} required />
              </label>
              <label>
                종료일
                <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} required />
              </label>
              <button type="submit" disabled={rangeLoading}>
                {rangeLoading ? '조회 중...' : '조회'}
              </button>
            </form>
            {rangeCount !== null && <p>선택 기간 내 세션 수: {rangeCount}건</p>}
          </section>

          <section className="stat-section">
            <h2>컨셉별 이용 현황</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>컨셉</th>
                  <th>세션 수</th>
                </tr>
              </thead>
              <tbody>
                {conceptCounts.map((row) => (
                  <tr key={row.conceptId}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
                {conceptCounts.length === 0 && (
                  <tr>
                    <td colSpan={2}>데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="stat-section">
            <h2>프레임별 이용 현황</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>프레임</th>
                  <th>세션 수</th>
                </tr>
              </thead>
              <tbody>
                {frameCounts.map((row) => (
                  <tr key={row.frameId}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
                {frameCounts.length === 0 && (
                  <tr>
                    <td colSpan={2}>데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="stat-section">
            <h2>보관 기간 설정</h2>
            <p>현재 설정: {retentionHours || '-'}시간</p>
            {canWrite ? (
              <form className="inline-form" onSubmit={handleRetentionSave}>
                <input
                  type="number"
                  min={RETENTION_MIN}
                  max={RETENTION_MAX}
                  value={retentionInput}
                  onChange={(e) => setRetentionInput(e.target.value)}
                  required
                />
                <span>시간 ({RETENTION_MIN}~{RETENTION_MAX} 범위)</span>
                <button type="submit" disabled={retentionSaving}>
                  {retentionSaving ? '저장 중...' : '저장'}
                </button>
              </form>
            ) : (
              <p className="notice">보관 기간 조정은 최고관리자만 가능합니다.</p>
            )}
          </section>

          <section className="stat-section">
            <h2>세션 수동 삭제</h2>
            <p className="hint">세션 ID(UUID)로 삭제합니다. 사진/영상은 화면에 표시되지 않습니다.</p>
            {canWrite ? (
              <form className="inline-form" onSubmit={handleDeleteSession}>
                <input
                  type="text"
                  placeholder="세션 ID (UUID)"
                  value={deleteSessionId}
                  onChange={(e) => setDeleteSessionId(e.target.value)}
                  required
                />
                <button type="submit" className="danger" disabled={deleting}>
                  {deleting ? '삭제 중...' : '삭제'}
                </button>
              </form>
            ) : (
              <p className="notice">세션 삭제는 최고관리자만 가능합니다.</p>
            )}
            {deleteMessage && <p>{deleteMessage}</p>}
          </section>
        </>
      )}
    </main>
  )
}
