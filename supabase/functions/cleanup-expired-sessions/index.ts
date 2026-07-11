// withmini Demo Mode — cleanup-expired-sessions
// 스펙 섹션 6(TTL 처리) 구현. infra-agent 담당.
//
// 동작:
//   1. settings.retention_hours(기본 24, 24~48 범위로 클램프)를 읽어 cutoff 시각을 계산한다.
//   2. status <> 'deleted' 인 세션 중, expires_at < now() 이거나 created_at < cutoff 인 세션을 조회한다.
//      (expires_at은 생성 시점 값이 이미 굳어 있으므로, 운영자가 이후에 retention_hours를
//       늘리거나 줄이면 created_at 기준 cutoff로도 함께 판정해 즉시 반영되게 한다.)
//   3. session-raw / session-results / session-timelapse 버킷에서 {sessionId}/ 하위 파일을 모두 삭제한다.
//   4. sessions row를 완전 삭제한다 (관리자도 개별 결과물을 조회하지 않는 정책이므로 원본은 통계 없이 삭제).
//
// 인증: 이 함수는 기본 JWT 검증(Supabase 기본값)을 사용한다. 즉 anon/authenticated/service_role
// 키 중 하나가 Authorization 헤더에 있어야 호출 가능하다. pg_cron 스케줄(0004_cron_cleanup_schedule.sql)은
// service_role 키로 호출하도록 구성되어 있다. 수동 테스트도 service_role 키(또는 최소 admin 인증)로 호출할 것을
// 권장한다 — anon 키로도 호출 자체는 가능하지만 내부적으로는 항상 service_role 클라이언트로 DB/Storage에
// 접근하므로 실제 삭제 권한은 always service_role 기준이다.

import { createClient } from 'npm:@supabase/supabase-js@2'

const RETENTION_MIN_HOURS = 24
const RETENTION_MAX_HOURS = 48
const DEFAULT_RETENTION_HOURS = 24

const SESSION_BUCKETS = ['session-raw', 'session-results', 'session-timelapse'] as const

interface SessionRow {
  id: string
  created_at: string
  expires_at: string | null
}

function clampRetentionHours(raw: string | null | undefined): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_RETENTION_HOURS
  return Math.min(RETENTION_MAX_HOURS, Math.max(RETENTION_MIN_HOURS, parsed))
}

async function deleteSessionFiles(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ bucket: string; removed: number; error?: string }[]> {
  const results: { bucket: string; removed: number; error?: string }[] = []

  for (const bucket of SESSION_BUCKETS) {
    const { data: files, error: listError } = await supabase.storage.from(bucket).list(sessionId, {
      limit: 1000,
    })

    if (listError) {
      results.push({ bucket, removed: 0, error: listError.message })
      continue
    }

    if (!files || files.length === 0) {
      results.push({ bucket, removed: 0 })
      continue
    }

    const paths = files.map((f) => `${sessionId}/${f.name}`)
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths)

    if (removeError) {
      results.push({ bucket, removed: 0, error: removeError.message })
    } else {
      results.push({ bucket, removed: paths.length })
    }
  }

  return results
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'missing_env', message: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    )
  }

  // service_role 클라이언트: RLS를 우회해 만료 세션과 그 파일을 완전히 정리한다.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  try {
    const { data: settingRow, error: settingError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'retention_hours')
      .maybeSingle()

    if (settingError) {
      console.error('failed to read settings.retention_hours', settingError)
    }

    const retentionHours = clampRetentionHours(settingRow?.value as string | undefined)
    const nowIso = new Date().toISOString()
    const cutoffIso = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString()

    const { data: expiredSessions, error: fetchError } = await supabase
      .from('sessions')
      .select('id, created_at, expires_at')
      .neq('status', 'deleted')
      .or(`expires_at.lt.${nowIso},created_at.lt.${cutoffIso}`)
      .returns<SessionRow[]>()

    if (fetchError) {
      throw new Error(`failed to query expired sessions: ${fetchError.message}`)
    }

    const sessions = expiredSessions ?? []
    const perSessionResult: Array<{
      sessionId: string
      storage: { bucket: string; removed: number; error?: string }[]
      deleted: boolean
      error?: string
    }> = []

    for (const session of sessions) {
      const storageResult = await deleteSessionFiles(supabase, session.id)

      const { error: deleteError } = await supabase.from('sessions').delete().eq('id', session.id)

      perSessionResult.push({
        sessionId: session.id,
        storage: storageResult,
        deleted: !deleteError,
        error: deleteError?.message,
      })
    }

    const deletedCount = perSessionResult.filter((r) => r.deleted).length

    return new Response(
      JSON.stringify({
        ok: true,
        retentionHours,
        checkedAt: nowIso,
        candidateCount: sessions.length,
        deletedCount,
        results: perSessionResult,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err) {
    console.error('cleanup-expired-sessions failed', err)
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    )
  }
})
