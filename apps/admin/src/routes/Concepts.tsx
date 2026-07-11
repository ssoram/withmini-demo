import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '@withmini/shared'
import type { Concept } from '@withmini/shared'
import { useAuth } from '../lib/AuthContext'
import { logAdminAction } from '../lib/auditLog'
import { uploadPublicFile, removePublicFile } from '../lib/storage'

interface ConceptFormState {
  id: string | null
  name: string
  image_url: string | null
  /** 업로드 완료 전 미리보기용 로컬 objectURL. 폼을 닫을 때 revoke한다. */
  imageLocalUrl: string | null
}

function emptyForm(): ConceptFormState {
  return { id: null, name: '', image_url: null, imageLocalUrl: null }
}

// 스펙 섹션 5.2 — 컨셉 관리: 목록/추가/이름 수정/노출 토글/삭제(soft delete 우선) + 컨셉 이미지 업로드.
export default function Concepts() {
  const { admin } = useAuth()
  const canWrite = admin?.role === 'super_admin'

  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<ConceptFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  async function loadConcepts() {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('concepts')
      .select('*')
      .order('display_order', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setConcepts(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadConcepts()
  }, [])

  function openCreateForm() {
    setForm(emptyForm())
  }

  function openEditForm(concept: Concept) {
    setForm({ id: concept.id, name: concept.name, image_url: concept.image_url, imageLocalUrl: null })
  }

  function closeForm() {
    setForm((prev) => {
      if (prev?.imageLocalUrl) URL.revokeObjectURL(prev.imageLocalUrl)
      return null
    })
  }

  async function handleImageFileChange(file: File) {
    const localUrl = URL.createObjectURL(file)
    setForm((prev) => {
      if (!prev) return prev
      if (prev.imageLocalUrl) URL.revokeObjectURL(prev.imageLocalUrl)
      return { ...prev, imageLocalUrl: localUrl }
    })

    setUploadingImage(true)
    try {
      const url = await uploadPublicFile('concept-images', file)
      setForm((prev) => (prev ? { ...prev, image_url: url } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleRemoveImage() {
    if (!form?.image_url) {
      setForm((prev) => (prev ? { ...prev, image_url: null } : prev))
      return
    }
    try {
      await removePublicFile('concept-images', form.image_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    setForm((prev) => (prev ? { ...prev, image_url: null } : prev))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!admin || !form || !form.name.trim()) return

    setSaving(true)
    setError(null)

    if (form.id) {
      const before = concepts.find((c) => c.id === form.id) ?? null
      const payload = { name: form.name.trim(), image_url: form.image_url }
      const { error: updateError } = await supabase.from('concepts').update(payload).eq('id', form.id)
      setSaving(false)

      if (updateError) {
        setError(updateError.message)
        return
      }

      await logAdminAction({
        adminId: admin.id,
        action: 'concept.update',
        targetTable: 'concepts',
        targetId: form.id,
        detail: {
          before: { name: before?.name, image_url: before?.image_url },
          after: payload,
        },
      })
    } else {
      const nextOrder = concepts.reduce((max, c) => Math.max(max, c.display_order), -1) + 1
      const { data, error: insertError } = await supabase
        .from('concepts')
        .insert({ name: form.name.trim(), image_url: form.image_url, display_order: nextOrder })
        .select('*')
        .single()
      setSaving(false)

      if (insertError) {
        setError(insertError.message)
        return
      }

      await logAdminAction({
        adminId: admin.id,
        action: 'concept.create',
        targetTable: 'concepts',
        targetId: data.id,
        detail: { name: data.name, image_url: data.image_url },
      })
    }

    closeForm()
    await loadConcepts()
  }

  async function toggleVisible(concept: Concept) {
    if (!admin) return

    const nextVisible = !concept.is_visible
    const { error: updateError } = await supabase
      .from('concepts')
      .update({ is_visible: nextVisible })
      .eq('id', concept.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await logAdminAction({
      adminId: admin.id,
      action: 'concept.update',
      targetTable: 'concepts',
      targetId: concept.id,
      detail: { before: { is_visible: concept.is_visible }, after: { is_visible: nextVisible } },
    })

    await loadConcepts()
  }

  async function handleDelete(concept: Concept) {
    if (!admin) return

    if (concept.is_visible) {
      // 1단계: soft delete (노출 끄기)
      const ok = window.confirm(
        `"${concept.name}" 컨셉을 노출에서 숨깁니다. 실제 삭제는 다시 한 번 "삭제" 버튼을 눌러야 진행됩니다.`
      )
      if (!ok) return
      await toggleVisible(concept)
      return
    }

    // 2단계: 실제 삭제 (하위 프레임도 함께 삭제됨 — FK on delete cascade)
    const ok = window.confirm(
      `"${concept.name}" 컨셉을 완전히 삭제합니다. 소속된 프레임도 함께 삭제되며 되돌릴 수 없습니다. 계속하시겠습니까?`
    )
    if (!ok) return

    const { error: deleteError } = await supabase.from('concepts').delete().eq('id', concept.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    await logAdminAction({
      adminId: admin.id,
      action: 'concept.delete',
      targetTable: 'concepts',
      targetId: concept.id,
      detail: { name: concept.name },
    })

    await loadConcepts()
  }

  const formImageSrc = form ? form.imageLocalUrl ?? form.image_url : null

  return (
    <main>
      <h1>컨셉 관리</h1>
      {error && <p className="form-error">{error}</p>}
      {!canWrite && <p className="notice">스태프 계정은 조회만 가능합니다.</p>}

      {canWrite && (
        <div className="toolbar">
          <button type="button" onClick={openCreateForm}>
            컨셉 추가
          </button>
        </div>
      )}

      {loading ? (
        <p>불러오는 중...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>이미지</th>
              <th>순서</th>
              <th>이름</th>
              <th>노출</th>
              <th>생성일</th>
              {canWrite && <th>작업</th>}
            </tr>
          </thead>
          <tbody>
            {concepts.map((concept) => (
              <tr key={concept.id}>
                <td>
                  {concept.image_url ? (
                    <img className="thumb" src={concept.image_url} alt={concept.name} />
                  ) : (
                    <span className="thumb thumb--empty">없음</span>
                  )}
                </td>
                <td>{concept.display_order}</td>
                <td>{concept.name}</td>
                <td>
                  <span className={concept.is_visible ? 'badge badge--on' : 'badge badge--off'}>
                    {concept.is_visible ? '노출' : '숨김'}
                  </span>
                </td>
                <td>{new Date(concept.created_at).toLocaleDateString('ko-KR')}</td>
                {canWrite && (
                  <td className="row-actions">
                    <button type="button" onClick={() => openEditForm(concept)}>
                      수정
                    </button>
                    <button type="button" onClick={() => toggleVisible(concept)}>
                      {concept.is_visible ? '숨기기' : '노출하기'}
                    </button>
                    <button type="button" className="danger" onClick={() => handleDelete(concept)}>
                      삭제
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {concepts.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 6 : 5}>등록된 컨셉이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {form && (
        <div className="modal-backdrop" onClick={closeForm}>
          <form className="modal-form" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? '컨셉 수정' : '컨셉 추가'}</h2>

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
              컨셉 이미지
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageFileChange(file)
                }}
              />
              <span className="hint">
                부스 앱의 컨셉 선택 카드 배경으로 사용됩니다. 가로:세로 3:4 비율에 가까운 이미지를 권장합니다.
              </span>
              {uploadingImage && <span> 업로드 중...</span>}
              {formImageSrc && (
                <div>
                  <img className="thumb thumb--preview" src={formImageSrc} alt="컨셉 이미지 미리보기" />
                  <button type="button" onClick={handleRemoveImage} disabled={uploadingImage}>
                    이미지 제거
                  </button>
                </div>
              )}
            </label>

            <div className="modal-form__actions">
              <button type="button" onClick={closeForm}>
                취소
              </button>
              <button type="submit" disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
