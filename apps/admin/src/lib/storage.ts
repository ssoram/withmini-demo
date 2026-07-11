import { supabase } from '@withmini/shared'

/**
 * 프레임 관련 공개 버킷(frame-previews, frame-videos)에 파일을 업로드하고 public URL을 반환한다.
 * 세션 관련 버킷은 이 헬퍼로 다루지 않는다 (관리자는 세션 파일 목록/삭제만 하고 내용은 조회하지 않음, 스펙 5.4).
 */
export async function uploadPublicFile(
  bucket: 'frame-previews' | 'frame-videos',
  file: File
): Promise<string> {
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
