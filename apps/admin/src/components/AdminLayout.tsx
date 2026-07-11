import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '@withmini/shared'
import { useAuth } from '../lib/AuthContext'

// 스펙 섹션 4.0 — 목록/폼 중심의 실용적 UI. 화려한 대시보드 대신 단순 네비게이션만 둔다.
export default function AdminLayout() {
  const { admin } = useAuth()

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div className="admin-header__brand">withmini Admin</div>
        <nav className="admin-nav">
          <NavLink to="/concepts">컨셉 관리</NavLink>
          <NavLink to="/frames">프레임 관리</NavLink>
          <NavLink to="/sessions">결과물 관리</NavLink>
        </nav>
        <div className="admin-header__user">
          <span>
            {admin?.name ?? admin?.id.slice(0, 8)} · {admin?.role === 'super_admin' ? '최고관리자' : '스태프'}
          </span>
          <button type="button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  )
}
