import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '@withmini/shared'
import type { Concept, Frame, FrameLayoutData, FrameSlot } from '@withmini/shared'
import { useAuth } from '../lib/AuthContext'
import { logAdminAction } from '../lib/auditLog'
import { uploadPublicFile } from '../lib/storage'
import SlotEditor from '../components/SlotEditor'

interface FrameFormState {
  id: string | null
  name: string
  concept_id: string
  is_active: boolean
  is_general: boolean
  slots: FrameSlot[]
  layoutJsonText: string
  layoutJsonError: string | null
  frame_video_url: string
  preview_image_url: string | null
  /** 업로드 완료 전 미리보기용 로컬 objectURL. 폼을 닫을 때 revoke한다. */
  previewLocalUrl: string | null
}

function emptyForm(defaultConceptId: string): FrameFormState {
  return {
    id: null,
    name: '',
    concept_id: defaultConceptId,
    is_active: true,
    is_general: true,
    slots: [],
    layoutJsonText: '',
    layoutJsonError: null,
    frame_video_url: '',
    preview_image_url: null,
    previewLocalUrl: null,
  }
}

function isValidSlotArray(value: unknown): value is FrameSlot[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        s &&
        typeof s === 'object' &&
        typeof (s as FrameSlot).x === 'number' &&
        typeof (s as FrameSlot).y === 'number' &&
        typeof (s as FrameSlot).width === 'number' &&
        typeof (s as FrameSlot).height === 'number'
    )
  )
}

// 스펙 섹션 5.3 — 프레임 관리: 컨셉별 필터, 등록/수정/삭제, is_active/is_general 토글,
// 소속 컨셉 설정, 미리보기 이미지 업로드, layout_data는 비주얼 슬롯 에디터(+ 고급 JSON 직접 편집).
export default function Frames() {
  const { admin } = useAuth()
  const canWrite = admin?.role === 'super_admin'

  const [concepts, setConcepts] = useState<Concept[]>([])
  const [frames, setFrames] = useState<Frame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterConceptId, setFilterConceptId] = useState<string>('all')

  const [form, setForm] = useState<FrameFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingPreview, setUploadingPreview] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [previewUploadError, setPreviewUploadError] = useState<string | null>(null)
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)

    const [conceptsRes, framesRes] = await Promise.all([
      supabase.from('concepts').select('*').order('display_order', { ascending: true }),
      supabase.from('frames').select('*').order('created_at', { ascending: false }),
    ])

    if (conceptsRes.error) setError(conceptsRes.error.message)
    if (framesRes.error) setError(framesRes.error.message)

    setConcepts(conceptsRes.data ?? [])
    setFrames(framesRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const conceptNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of concepts) map.set(c.id, c.name)
    return map
  }, [concepts])

  const filteredFrames = useMemo(() => {
    if (filterConceptId === 'all') return frames
    return frames.filter((f) => f.concept_id === filterConceptId)
  }, [frames, filterConceptId])

  function openCreateForm() {
    setForm(emptyForm(concepts[0]?.id ?? ''))
    setPreviewUploadError(null)
    setVideoUploadError(null)
  }

  function openEditForm(frame: Frame) {
    const slots = frame.layout_data?.slots ?? []
    setForm({
      id: frame.id,
      name: frame.name,
      concept_id: frame.concept_id,
      is_active: frame.is_active,
      is_general: frame.is_general,
      slots,
      layoutJsonText: slots.length ? JSON.stringify({ slots }, null, 2) : '',
      layoutJsonError: null,
      frame_video_url: frame.frame_video_url ?? '',
      preview_image_url: frame.preview_image_url,
      previewLocalUrl: null,
    })
    setPreviewUploadError(null)
    setVideoUploadError(null)
  }

  function closeForm() {
    setForm((prev) => {
      if (prev?.previewLocalUrl) URL.revokeObjectURL(prev.previewLocalUrl)
      return null
    })
  }

  // 비주얼 에디터에서 슬롯이 바뀌면 layout_data JSON 미리보기 텍스트도 함께 갱신한다.
  function handleSlotsChange(nextSlots: FrameSlot[]) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            slots: nextSlots,
            layoutJsonText: nextSlots.length ? JSON.stringify({ slots: nextSlots }, null, 2) : '',
            layoutJsonError: null,
          }
        : prev
    )
  }

  // 고급 JSON 직접 편집 — 파싱 성공 시에만 슬롯 배열(비주얼 에디터)에 반영, 실패 시 에러만 표시.
  function handleJsonTextChange(text: string) {
    setForm((prev) => {
      if (!prev) return prev

      if (!text.trim()) {
        return { ...prev, layoutJsonText: text, slots: [], layoutJsonError: null }
      }

      try {
        const parsed = JSON.parse(text)
        if (!parsed || !isValidSlotArray(parsed.slots)) {
          return { ...prev, layoutJsonText: text, layoutJsonError: 'layout_data.slots 배열(x/y/width/height 숫자)이 필요합니다.' }
        }
        return { ...prev, layoutJsonText: text, slots: parsed.slots, layoutJsonError: null }
      } catch {
        return { ...prev, layoutJsonText: text, layoutJsonError: 'JSON 형식이 올바르지 않습니다.' }
      }
    })
  }

  async function handlePreviewFileChange(file: File) {
    const localUrl = URL.createObjectURL(file)
    setForm((prev) => {
      if (!prev) return prev
      if (prev.previewLocalUrl) URL.revokeObjectURL(prev.previewLocalUrl)
      // preview_image_url은 업로드가 성공할 때까지 건드리지 않는다(수정 화면에서 이미지를 교체하다
      // 업로드가 실패해도 기존 유효한 이미지가 사라지지 않도록). 제출 버튼은 업로드 중 비활성화되므로
      // "미완료 업로드로 저장되는" 레이스는 아래 disabled 조건으로 막는다.
      return { ...prev, previewLocalUrl: localUrl }
    })

    setUploadingPreview(true)
    setPreviewUploadError(null)
    try {
      const url = await uploadPublicFile('frame-previews', file)
      setForm((prev) => (prev ? { ...prev, preview_image_url: url } : prev))
    } catch (e) {
      setPreviewUploadError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadingPreview(false)
    }
  }

  async function handleVideoUpload(file: File) {
    setUploadingVideo(true)
    setVideoUploadError(null)
    try {
      const url = await uploadPublicFile('frame-videos', file)
      setForm((prev) => (prev ? { ...prev, frame_video_url: url } : prev))
    } catch (e) {
      setVideoUploadError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadingVideo(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!admin || !form) return

    if (!form.concept_id) {
      setError('소속 컨셉을 선택해주세요.')
      return
    }
    if (form.layoutJsonError) {
      setError(`layout_data JSON을 확인해주세요: ${form.layoutJsonError}`)
      return
    }
    if (form.slots.length === 0) {
      setError('슬롯을 최소 1개 이상 추가해주세요.')
      return
    }
    if (uploadingPreview || uploadingVideo) {
      // 저장 버튼이 업로드 중엔 비활성화되지만, 방어적으로 한 번 더 막는다.
      setError('이미지/영상 업로드가 끝날 때까지 기다려주세요.')
      return
    }
    if (!form.preview_image_url) {
      const proceed = window.confirm(
        '미리보기 이미지가 없습니다. 이미지가 없으면 촬영 앱에서 이 프레임으로 합성할 수 없습니다. 그래도 저장하시겠습니까?'
      )
      if (!proceed) return
    }

    setSaving(true)
    setError(null)

    const layoutData: FrameLayoutData = { slots: form.slots }

    const payload = {
      name: form.name.trim(),
      concept_id: form.concept_id,
      slot_count: form.slots.length,
      is_active: form.is_active,
      is_general: form.is_general,
      layout_data: layoutData,
      frame_video_url: form.frame_video_url.trim() || null,
      preview_image_url: form.preview_image_url,
    }

    if (form.id) {
      const before = frames.find((f) => f.id === form.id) ?? null
      const { error: updateError } = await supabase.from('frames').update(payload).eq('id', form.id)
      setSaving(false)

      if (updateError) {
        setError(updateError.message)
        return
      }

      await logAdminAction({
        adminId: admin.id,
        action: 'frame.update',
        targetTable: 'frames',
        targetId: form.id,
        detail: { before, after: payload },
      })
    } else {
      const { data, error: insertError } = await supabase.from('frames').insert(payload).select('*').single()
      setSaving(false)

      if (insertError) {
        setError(insertError.message)
        return
      }

      await logAdminAction({
        adminId: admin.id,
        action: 'frame.create',
        targetTable: 'frames',
        targetId: data.id,
        detail: { name: data.name, concept_id: data.concept_id },
      })
    }

    closeForm()
    await loadData()
  }

  async function toggleField(frame: Frame, field: 'is_active' | 'is_general') {
    if (!admin) return
    const nextValue = !frame[field]
    const update = field === 'is_active' ? { is_active: nextValue } : { is_general: nextValue }

    const { error: updateError } = await supabase.from('frames').update(update).eq('id', frame.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await logAdminAction({
      adminId: admin.id,
      action: 'frame.update',
      targetTable: 'frames',
      targetId: frame.id,
      detail: { before: { [field]: frame[field] }, after: { [field]: nextValue } },
    })

    await loadData()
  }

  async function handleDelete(frame: Frame) {
    if (!admin) return

    const ok = window.confirm(`"${frame.name}" 프레임을 삭제합니다. 되돌릴 수 없습니다. 계속하시겠습니까?`)
    if (!ok) return

    const { error: deleteError } = await supabase.from('frames').delete().eq('id', frame.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    await logAdminAction({
      adminId: admin.id,
      action: 'frame.delete',
      targetTable: 'frames',
      targetId: frame.id,
      detail: { name: frame.name, concept_id: frame.concept_id },
    })

    await loadData()
  }

  const previewSrc = form ? form.previewLocalUrl ?? form.preview_image_url : null

  return (
    <main>
      <h1>프레임 관리</h1>
      {error && <p className="form-error">{error}</p>}
      {!canWrite && <p className="notice">스태프 계정은 조회만 가능합니다.</p>}

      <div className="toolbar">
        <label>
          컨셉 필터
          <select value={filterConceptId} onChange={(e) => setFilterConceptId(e.target.value)}>
            <option value="all">전체</option>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {canWrite && (
          <button type="button" onClick={openCreateForm} disabled={concepts.length === 0}>
            프레임 등록
          </button>
        )}
      </div>
      {concepts.length === 0 && <p className="notice">먼저 컨셉을 하나 이상 등록해야 프레임을 만들 수 있습니다.</p>}

      {loading ? (
        <p>불러오는 중...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>미리보기</th>
              <th>이름</th>
              <th>컨셉</th>
              <th>슬롯 수</th>
              <th>활성화</th>
              <th>일반 프레임</th>
              {canWrite && <th>작업</th>}
            </tr>
          </thead>
          <tbody>
            {filteredFrames.map((frame) => (
              <tr key={frame.id}>
                <td>
                  {frame.preview_image_url ? (
                    <img className="thumb" src={frame.preview_image_url} alt={frame.name} />
                  ) : (
                    <span className="thumb thumb--empty">없음</span>
                  )}
                </td>
                <td>{frame.name}</td>
                <td>{conceptNameById.get(frame.concept_id) ?? '-'}</td>
                <td>{frame.slot_count}</td>
                <td>
                  <span className={frame.is_active ? 'badge badge--on' : 'badge badge--off'}>
                    {frame.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td>
                  <span className={frame.is_general ? 'badge badge--on' : 'badge badge--off'}>
                    {frame.is_general ? '일반' : '이벤트'}
                  </span>
                </td>
                {canWrite && (
                  <td className="row-actions">
                    <button type="button" onClick={() => openEditForm(frame)}>
                      수정
                    </button>
                    <button type="button" onClick={() => toggleField(frame, 'is_active')}>
                      {frame.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button type="button" onClick={() => toggleField(frame, 'is_general')}>
                      {frame.is_general ? '일반 해제' : '일반 지정'}
                    </button>
                    <button type="button" className="danger" onClick={() => handleDelete(frame)}>
                      삭제
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {filteredFrames.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 7 : 6}>등록된 프레임이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {form && (
        <div className="modal-backdrop" onClick={closeForm}>
          <form className="modal-form modal-form--wide" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? '프레임 수정' : '프레임 등록'}</h2>

            <label>
              이름
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>

            <label>
              소속 컨셉
              <select
                value={form.concept_id}
                onChange={(e) => setForm({ ...form, concept_id: e.target.value })}
                required
              >
                {concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              활성화 (is_active)
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.is_general}
                onChange={(e) => setForm({ ...form, is_general: e.target.checked })}
              />
              일반 프레임 (is_general) — 켜야 사용자 앱에 노출됩니다
            </label>

            <label>
              미리보기 이미지
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handlePreviewFileChange(file)
                }}
              />
              <span className="hint">
                촬영 앱 합성은 선택한 사진들을 먼저 그린 뒤 이 이미지를 그 위에 덮어씌우는 방식입니다.
                사진이 들어갈 자리가 투명하게 뚫린 PNG 템플릿을 업로드해주세요.
              </span>
              {uploadingPreview && <span> 업로드 중... (완료 전까지 저장할 수 없습니다)</span>}
              {previewUploadError && <p className="form-error">{previewUploadError}</p>}
            </label>

            <div className="field-block">
              <span className="field-block__label">슬롯 배치 (슬롯 수: {form.slots.length}개, 자동 계산)</span>
              <SlotEditor imageUrl={previewSrc} slots={form.slots} onSlotsChange={handleSlotsChange} />
            </div>

            <label>
              프레임 전용 영상 (선택)
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleVideoUpload(file)
                }}
              />
              {uploadingVideo && <span> 업로드 중... (완료 전까지 저장할 수 없습니다)</span>}
              {videoUploadError && <p className="form-error">{videoUploadError}</p>}
              {form.frame_video_url && <p className="hint">{form.frame_video_url}</p>}
            </label>

            <details className="advanced-json">
              <summary>고급: JSON 직접 편집</summary>
              <textarea
                rows={6}
                placeholder={'{\n  "slots": [\n    { "x": 0.05, "y": 0.1, "width": 0.4, "height": 0.3 }\n  ]\n}'}
                value={form.layoutJsonText}
                onChange={(e) => handleJsonTextChange(e.target.value)}
              />
              {form.layoutJsonError && <p className="form-error">{form.layoutJsonError}</p>}
              <span className="hint">
                x/y/width/height 값이 0~1 사이면 비율, 1보다 크면 절대 픽셀로 자동 판별됩니다. 위 슬롯 배치
                에디터와 실시간으로 동기화됩니다.
              </span>
            </details>

            <div className="modal-form__actions">
              <button type="button" onClick={closeForm}>
                취소
              </button>
              <button type="submit" disabled={saving || uploadingPreview || uploadingVideo}>
                {saving ? '저장 중...' : uploadingPreview || uploadingVideo ? '업로드 완료 대기 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
