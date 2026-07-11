import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * 각 앱(booth/admin/result)의 .env에서 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 읽는다.
 * anon key만 클라이언트에 노출한다 — service_role 키는 절대 프론트 번들에 포함하지 않는다 (스펙 섹션 9).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      "각 앱 폴더의 .env.example을 복사해 .env를 만들고 값을 채워주세요."
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
