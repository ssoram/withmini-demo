import { supabase } from '@withmini/shared'

export type PublicBucket = 'frame-previews' | 'frame-videos' | 'concept-images'

/**
 * 공개 버킷(frame-previews, frame-videos, concept-images)에 파일을 업로드하고 public URL을 반환한다.
 * 세션 관련 버킷은 이 헬퍼로 다루지 않는다 (관리자는 세션 파일 목록/삭제만 하고 내용은 조회하지 않음, 스펙 5.4).
 */
export async function uploadPublicFile(bucket: PublicBucket, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    throw new Error(`파일 업로드 실패: ${error.message}`)
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/** uploadPublicFile로 올린 파일을 public URL로부터 경로를 역산해 삭제한다. */
export async function removePublicFile(bucket: PublicBucket, publicUrl: string): Promise<void> {
  const marker = `/${bucket}/`
  const markerIndex = publicUrl.indexOf(marker)
  if (markerIndex === -1) return // 예상과 다른 URL 형식이면 조용히 무시 — 삭제 실패가 저장 자체를 막지는 않는다.

  const path = publicUrl.slice(markerIndex + marker.length).split('?')[0]
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) {
    throw new Error(`파일 삭제 실패: ${error.message}`)
  }
}
