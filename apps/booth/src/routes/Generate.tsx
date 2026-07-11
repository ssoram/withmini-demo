import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { compositePhotosToFrame, supabase } from '@withmini/shared'
import Screen from '../components/Screen'
import { useBoothFlow } from '../context/BoothFlowContext'
import { resolvePublicUrl, uploadBlob } from '../lib/storage'

// 스펙 섹션 4.6 — 결과 생성. 선택 사진 + frames.layout_data로 Canvas 합성 후
// session-raw/{sessionId}/, session-results/{sessionId}/에 업로드하고 sessions row를 생성/갱신한다.
// 완료되면 /print-animation으로 이동한다 (해당 화면 자체는 animation-builder 담당).
//
// 업로드 순서 주의 (infra-agent 0003_infra_hardening.sql / docs/infra-security-notes.md 3절 계약):
// - session-raw/session-results 버킷의 anon insert 정책은 "{sessionId}가 실제 존재하고 삭제/만료되지
//   않은 세션"일 때만 허용한다(session_is_active()). 그래서 sessions row를 먼저 만들고 나서 업로드해야 한다.
// - 같은 이유로 anon은 이 버킷들을 더 이상 직접 read(=signed URL 발급 포함)할 수 없다. 그래서
//   sessions.result_image_url/raw_photo_urls/selected_photo_urls에는 signed URL이 아니라 Storage
//   오브젝트 경로를 저장한다. 공개 조회는 integrator가 붙일 get-session-media Edge Function 몫이다.
// - /print-animation은 booth 앱 안에서 곧바로 이어지는 화면이라 방금 합성한 결과를 로컬 blob URL로
//   그대로 넘긴다 (PrintAnimation.tsx가 우선적으로 사용하도록 이미 만들어져 있음 — state.resultImageUrl).

// {result 도메인}/{sessionId} 형태의 QR 대상 URL을 만들기 위한 베이스 URL.
// 실배포 시 apps/booth/.env의 VITE_RESULT_BASE_URL로 덮어쓴다 (스펙 섹션 1의 result 도메인 예시가 기본값).
const RESULT_BASE_URL = import.meta.env.VITE_RESULT_BASE_URL || 'https://withmini.link'

export default function Generate() {
  const navigate = useNavigate()
  const { concept, frame, capturedPhotos, selectedPhotos, setIsBusy } = useBoothFlow()
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const startedRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!concept || !frame || selectedPhotos.length === 0) {
      navigate('/select', { replace: true })
    }
  }, [concept, frame, selectedPhotos, navigate])

  useEffect(() => {
    if (!concept || !frame || selectedPhotos.length === 0) return
    if (startedRef.current) return
    startedRef.current = true
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept, frame, selectedPhotos])

  async function run() {
    if (!concept || !frame) return
    setRunning(true)
    setError(null)
    setIsBusy(true)
    try {
      if (!frame.layout_data || frame.layout_data.slots.length !== selectedPhotos.length) {
        throw new Error('프레임 레이아웃 정보가 올바르지 않습니다. 관리자에게 문의해주세요.')
      }
      if (!frame.preview_image_url) {
        throw new Error('프레임 이미지가 설정되어 있지 않습니다. 관리자에게 문의해주세요.')
      }

      if (!sessionIdRef.current) {
        sessionIdRef.current = crypto.randomUUID()
      }
      const sessionId = sessionIdRef.current

      // 1) 업로드 전에 sessions row부터 만든다 (위 설명 참고). 재시도 시에도 같은 sessionId를 재사용하는데,
      //    0005_sessions_select_hardening으로 anon SELECT 정책이 사라져 upsert(INSERT ... ON CONFLICT)가
      //    RLS(42501)에 막힌다 — ON CONFLICT 판정 자체가 SELECT 권한을 요구하기 때문. 그래서 순수 INSERT만
      //    시도한다. 재시도라 이미 같은 id로 row가 있는 경우(23505 unique violation)는 해당 row가 이미
      //    in_progress로 존재한다는 뜻이므로 별도 조치 없이 성공으로 간주하고 넘어간다(anon update 정책도
      //    같은 이유로 no-op이라 더 이상 사용하지 않음 — 아래 4단계 참고). .select()는 붙이지 않는다.
      const { error: insertError } = await supabase.from('sessions').insert({
        id: sessionId,
        concept_id: concept.id,
        frame_id: frame.id,
        status: 'in_progress',
      })
      if (insertError && insertError.code !== '23505') {
        throw new Error(insertError.message)
      }

      // 2) 촬영 원본 8장을 session-raw/{sessionId}/에 업로드
      const rawPaths = await Promise.all(
        capturedPhotos.map(async (photo, index) => {
          const path = `${sessionId}/${index}.jpg`
          await uploadBlob('session-raw', path, photo.blob, 'image/jpeg')
          return path
        })
      )
      const selectedPaths = selectedPhotos.map((photo) => {
        const rawIndex = capturedPhotos.indexOf(photo)
        return rawPaths[rawIndex]
      })

      // 3) 선택된 사진 + 프레임 layout_data로 Canvas 합성
      const frameImageUrl = resolvePublicUrl('frame-previews', frame.preview_image_url)
      const resultBlob = await compositePhotosToFrame({
        frame,
        photos: selectedPhotos.map((photo) => photo.blob),
        frameImageUrl,
      })
      const resultPath = `${sessionId}/result.png`
      await uploadBlob('session-results', resultPath, resultBlob, 'image/png')

      // 4) sessions row를 completed로 전이한다. result_image_url 등은 signed URL이 아닌 Storage
      //    오브젝트 경로를 저장한다. 일반 UPDATE는 쓰지 않는다 — PostgreSQL은 UPDATE의 WHERE 절이
      //    대상 행을 찾을 때도 SELECT 권한을 요구하는데, anon SELECT 정책이 없어(0005) 조용히
      //    0건 갱신되는 no-op이 되기 때문(에러 없이 실패). 그래서 architect가 만든 security definer
      //    RPC(complete_session, 0007_complete_session_rpc.sql)로 완료 전이를 대신한다 — 이 함수는
      //    RLS를 우회해 status='in_progress'이고 미만료인 세션만 completed로 전이시키고, 조건이
      //    맞지 않으면 exception을 던진다.
      // NOTE: Database.public.Functions가 아직 빈 타입이라 rpc() 인자/반환 타입이 맞지 않는다.
      // types.ts는 계약 파일이라 직접 고치지 않고 이 호출 한 곳만 로컬 캐스팅으로 우회한다
      // (architect가 추후 Functions 타입 정식 반영 검토 예정).
      const { error: completeError } = await (supabase as any).rpc('complete_session', {
        p_session_id: sessionId,
        p_raw_photo_urls: rawPaths,
        p_selected_photo_urls: selectedPaths,
        p_result_image_url: resultPath,
        p_qr_url: `${RESULT_BASE_URL}/${sessionId}`,
      })
      if (completeError) {
        throw new Error(completeError.message)
      }

      // 5) /print-animation은 같은 브라우저 탭에서 곧바로 이어지므로, 방금 만든 합성 이미지를
      //    로컬 blob URL로 그대로 전달한다 (Storage 재조회 불필요, PrintAnimation.tsx의 최우선 경로).
      const resultObjectUrl = URL.createObjectURL(resultBlob)

      setIsBusy(false)
      navigate('/print-animation', { state: { sessionId, resultImageUrl: resultObjectUrl } })
    } catch (err) {
      setError(err instanceof Error ? err.message : '결과를 생성하지 못했습니다.')
      setIsBusy(false)
    } finally {
      setRunning(false)
    }
  }

  if (!concept || !frame || selectedPhotos.length === 0) return null

  return (
    <Screen title="결과를 만들고 있어요" subtitle={error ? undefined : '잠시만 기다려주세요'}>
      {!error && <div className="spinner" />}
      {error && (
        <div className="error-box">
          <p>{error}</p>
          <button className="btn-secondary" onClick={() => void run()} disabled={running}>
            다시 시도
          </button>
        </div>
      )}
    </Screen>
  )
}
