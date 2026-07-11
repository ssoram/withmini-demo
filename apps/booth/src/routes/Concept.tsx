import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, type Concept as ConceptRow } from '@withmini/shared'
import Screen from '../components/Screen'
import { useBoothFlow } from '../context/BoothFlowContext'

// 스펙 섹션 4.2 — 컨셉 선택. concepts에서 is_visible=true를 display_order순으로 카드형 UI로 표시.
export default function Concept() {
  const navigate = useNavigate()
  const { setConcept } = useBoothFlow()
  const [concepts, setConcepts] = useState<ConceptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('concepts')
        .select('*')
        .eq('is_visible', true)
        .order('display_order', { ascending: true })
      if (cancelled) return
      if (error) {
        setError('컨셉 목록을 불러오지 못했습니다.')
      } else {
        setConcepts(data ?? [])
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function handleSelect(concept: ConceptRow) {
    setConcept(concept)
    navigate('/frame')
  }

  return (
    <Screen title="컨셉을 선택하세요" subtitle="원하는 컨셉을 터치하세요">
      {loading && <div className="spinner" />}
      {error && <p className="error-box">{error}</p>}
      {!loading && !error && concepts.length === 0 && <p>표시할 수 있는 컨셉이 없습니다.</p>}
      {!loading && !error && concepts.length > 0 && (
        <div className="card-grid" style={{ gridTemplateColumns: `repeat(${concepts.length}, 1fr)` }}>
          {concepts.map((concept) => (
            <button key={concept.id} className="card" onClick={() => handleSelect(concept)}>
              <h2>{concept.name}</h2>
            </button>
          ))}
        </div>
      )}
    </Screen>
  )
}
