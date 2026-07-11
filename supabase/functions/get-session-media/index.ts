// withmini Demo Mode — get-session-media
// 스펙 섹션 4.9(QR 결과 페이지) + 섹션 9(signed URL 전용 접근) 지원용으로 infra-agent가 추가.
//
// 세션 관련 Storage 버킷(session-raw/session-results/session-timelapse)은 public이 아니고
// anon 직접 read 정책도 없다(0003_infra_hardening.sql). 결과 페이지(result 앱, 별도 공개 도메인,
// 비로그인)는 이 함수를 통해서만 최종 이미지/타임랩스 URL을 받아야 한다.
//
// 요청: GET/POST, body 또는 query에 { sessionId } (uuid)
// 응답:
//   200 { status: 'completed', resultImageUrl, timelapseVideoUrl, frameVideoUrl, expiresAt }
//   404 { status: 'not_found' }                — 존재하지 않는 세션 id
//   410 { status: 'expired' }                   — TTL 만료 또는 status='deleted'
//   409 { status: 'in_progress' | ... }          — 아직 결과가 준비되지 않음(합성 전)
//
// raw_photo_urls / selected_photo_urls는 어떤 경우에도 응답에 포함하지 않는다(스펙 5.4 원칙 — 관리자뿐 아니라
// 결과 페이지도 원본 8장이 아닌 "최종 합성 이미지"만 노출).
//
// sessions.result_image_url / timelapse_video_url 컬럼에는 (버킷이 비공개이므로) 공개 URL이 아니라
// Storage 오브젝트 경로("{sessionId}/xxx.jpg")를 저장하는 것을 규약으로 한다 — booth-builder/integrator 공지 사항.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1시간. 결과 페이지 재방문/새로고침 시 이 함수가 다시 호출되어 새 URL을 받는다.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}

/** result_image_url / timelapse_video_url에 실수로 완전한 URL이 저장된 경우에도 경로만 추출한다. */
function toStoragePath(bucket: string, value: string): string {
  const marker = `/${bucket}/`
  const idx = value.indexOf(marker)
  if (idx === -1) return value
  return value.slice(idx + marker.length)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  let sessionId: unknown
  if (req.method === 'GET') {
    sessionId = new URL(req.url).searchParams.get('sessionId')
  } else if (req.method === 'POST') {
    try {
      const body = await req.json()
      sessionId = body?.sessionId
    } catch {
      return json({ status: 'bad_request', message: 'invalid JSON body' }, 400)
    }
  } else {
    return json({ status: 'method_not_allowed' }, 405)
  }

  if (!isUuid(sessionId)) {
    return json({ status: 'bad_request', message: 'sessionId must be a uuid' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ status: 'server_error', message: 'missing Supabase env vars' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status, expires_at, result_image_url, timelapse_video_url, frame_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError) {
    return json({ status: 'server_error', message: sessionError.message }, 500)
  }

  if (!session) {
    return json({ status: 'not_found' }, 404)
  }

  const isExpired =
    session.status === 'deleted' || (session.expires_at && new Date(session.expires_at).getTime() < Date.now())

  if (isExpired) {
    return json({ status: 'expired' }, 410)
  }

  if (session.status !== 'completed' || !session.result_image_url) {
    return json({ status: session.status }, 409)
  }

  const resultPath = toStoragePath('session-results', session.result_image_url)
  const { data: signedResult, error: signError } = await supabase.storage
    .from('session-results')
    .createSignedUrl(resultPath, SIGNED_URL_TTL_SECONDS)

  if (signError || !signedResult) {
    return json({ status: 'server_error', message: signError?.message ?? 'failed to sign result image' }, 500)
  }

  let timelapseVideoUrl: string | null = null
  if (session.timelapse_video_url) {
    const timelapsePath = toStoragePath('session-timelapse', session.timelapse_video_url)
    const { data: signedTimelapse } = await supabase.storage
      .from('session-timelapse')
      .createSignedUrl(timelapsePath, SIGNED_URL_TTL_SECONDS)
    timelapseVideoUrl = signedTimelapse?.signedUrl ?? null
  }

  // frame-videos 버킷은 공개(public) 버킷이므로 서명 없이 공개 URL을 그대로 내려준다.
  let frameVideoUrl: string | null = null
  if (session.frame_id) {
    const { data: frame } = await supabase
      .from('frames')
      .select('frame_video_url')
      .eq('id', session.frame_id)
      .maybeSingle()
    frameVideoUrl = frame?.frame_video_url ?? null
  }

  return json(
    {
      status: 'completed',
      resultImageUrl: signedResult.signedUrl,
      timelapseVideoUrl,
      frameVideoUrl,
      expiresAt: session.expires_at,
      signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS,
    },
    200
  )
})
