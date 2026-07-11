import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '@withmini/shared'
import type { Concept } from '@withmini/shared'
import { useAuth } from '../lib/AuthContext'
import { logAdminAction } from '../lib/auditLog'

// 스펙 섹션 5.2 — 컨셉 관리: 목록/추가/이름 수정/노출 토글/삭제(soft delete 우선).
export default function Concepts() {
  const { admin } = useAuth()
  const canWrite = admin?.role === 'super_admin'

  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

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

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!admin || !newName.trim()) return

    setCreating(true)
    const nextOrder = concepts.reduce((max, c) => Math.max(max, c.display_order), -1) + 1

    const { data, error: insertError } = await supabase
      .from('concepts')
      .insert({ name: newName.trim(), display_order: nextOrder })
      .select('*')
      .single()

    setCreating(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    await logAdminAction({
      adminId: admin.id,
      action: 'concept.create',
      targetTable: 'concepts',
      targetId: data.id,
      detail: { name: data.name },
    })

    setNewName('')
    await loadConcepts()
  }

  function startEdit(concept: Concept) {
    setEditingId(concept.id)
    setEditingName(concept.name)
  }

  async function saveEdit(concept: Concept) {
    if (!admin || !editingName.trim() || editingName === concept.name) {
      setEditingId(null)
      return
    }

    const { error: updateError } = await supabase
      .from('concepts')
      .update({ name: editingName.trim() })
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
      detail: { before: { name: concept.name }, after: { name: editingName.trim() } },
    })

    setEditingId(null)
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

  return (
    <main>
      <h1>컨셉 관리</h1>
      {error && <p className="form-error">{error}</p>}
      {!canWrite && <p className="notice">스태프 계정은 조회만 가능합니다.</p>}

      {canWrite && (
        <form className="inline-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="새 컨셉 이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <button type="submit" disabled={creating}>
            {creating ? '추가 중...' : '컨셉 추가'}
          </button>
        </form>
      )}

      {loading ? (
        <p>불러오는 중...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
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
                <td>{concept.display_order}</td>
                <td>
                  {editingId === concept.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => saveEdit(concept)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(concept)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                    />
                  ) : (
                    <span>{concept.name}</span>
                  )}
                </td>
                <td>
                  <span className={concept.is_visible ? 'badge badge--on' : 'badge badge--off'}>
                    {concept.is_visible ? '노출' : '숨김'}
                  </span>
                </td>
                <td>{new Date(concept.created_at).toLocaleDateString('ko-KR')}</td>
                {canWrite && (
                  <td className="row-actions">
                    <button type="button" onClick={() => startEdit(concept)}>
                      이름 수정
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
                <td colSpan={canWrite ? 5 : 4}>등록된 컨셉이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </main>
  )
}
