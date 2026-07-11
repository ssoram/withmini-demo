import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

/**
 * 스펙 섹션 5.1 — 인증 가드.
 * 세션 또는 admins 프로필이 없으면(비활성 계정 포함) /login으로 리다이렉트한다.
 * 프론트 가드는 UX 보조 수단이며, 실제 권한 제어는 RLS(supabase/migrations/0001_init.sql)가 강제한다.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, admin, loading, error } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="page-loading">로딩 중...</div>
  }

  if (!session || !admin) {
    return <Navigate to="/login" replace state={{ from: location, error }} />
  }

  return <>{children}</>
}
