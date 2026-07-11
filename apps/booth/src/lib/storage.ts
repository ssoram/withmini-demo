import { supabase } from '@withmini/shared'

/** DB에 저장된 값이 이미 완전한 URL이면 그대로, storage 경로면 public URL로 변환한다 (frame-previews/frame-videos용). */
export function resolvePublicUrl(bucket: string, pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  return supabase.storage.from(bucket).getPublicUrl(pathOrUrl).data.publicUrl
}

// 세션 버킷(session-raw/session-results/session-timelapse)은 infra-agent가 anon read를 제거했다
// (0003_infra_hardening.sql) — booth에서는 signed URL을 직접 발급할 수 없고 필요하지도 않다.
// DB에는 Storage 오브젝트 경로만 저장하고, 공개 조회는 get-session-media Edge Function(integrator 담당)이 처리한다.

export async function uploadBlob(bucket: string, path: string, blob: Blob, contentType: string): Promise<void> {
  // upsert:true(x-upsert 업로드)는 sessions upsert와 마찬가지로 내부적으로 SELECT 권한을 요구하는데,
  // 세션 버킷은 anon SELECT 정책이 없어(0003_infra_hardening.sql) 항상 RLS 403으로 막힌다. 그래서
  // 일반(upsert 없는) insert 업로드만 시도한다. 같은 sessionId로 재시도하면 같은 경로가 이미 존재해
  // 409("The resource already exists")가 나는데, 이는 재시도로 인한 것일 뿐 실패가 아니므로 성공으로 간주한다.
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType })
  if (error) {
    const isAlreadyExists = error.statusCode === '409' || error.message.includes('already exists')
    if (isAlreadyExists) {
      return
    }
    throw new Error(`업로드 실패 (${bucket}/${path}): ${error.message}`)
  }
}
