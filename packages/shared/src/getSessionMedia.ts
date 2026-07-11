import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// supabase/functions/get-session-media 계약(docs/infra-security-notes.md 3절):
// session 관련 Storage 버킷은 비공개이고, sessions 테이블도 anon SELECT를 허용하지 않는다
// (0005_sessions_select_hardening.sql). booth(PrintAnimation 폴백)와 result 앱은 반드시 이
// Edge Function을 거쳐서만 최종 사진/타임랩스/프레임 영상 URL(signed 또는 공개 URL)을 받는다.
export interface SessionMediaCompleted {
  status: 'completed'
  resultImageUrl: string
  timelapseVideoUrl: string | null
  frameVideoUrl: string | null
  expiresAt: string
  signedUrlTtlSeconds: number
}

export interface SessionMediaFailure {
  status: 'not_found' | 'expired' | 'in_progress' | 'bad_request' | 'server_error' | 'network_error'
  message?: string
}

export type SessionMediaResult = SessionMediaCompleted | SessionMediaFailure

export async function fetchSessionMedia(sessionId: string): Promise<SessionMediaResult> {
  const { data, error } = await supabase.functions.invoke('get-session-media', {
    body: { sessionId },
  })

  if (!error) {
    return data as SessionMediaCompleted
  }

  // get-session-media는 404/409/410 등 2xx가 아닌 상태에도 JSON 본문({ status: ... })을 내려주므로,
  // FunctionsHttpError의 context(Response)를 다시 파싱해야 실제 상태값을 얻을 수 있다.
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      return body as SessionMediaFailure
    } catch {
      return { status: 'server_error' }
    }
  }

  return { status: 'network_error' }
}
