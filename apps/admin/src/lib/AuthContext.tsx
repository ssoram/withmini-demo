import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@withmini/shared'
import type { Admin } from '@withmini/shared'

/**
 * 스펙 섹션 5.1 — Supabase Auth 세션 + admins.role 프로필을 함께 들고 있는 인증 컨텍스트.
 * is_active=false 계정은 즉시 로그아웃 처리한다.
 */
interface AuthState {
  session: Session | null
  admin: Admin | null
  loading: boolean
  error: string | null
}

const initialState: AuthState = { session: null, admin: null, loading: true, error: null }

const AuthContext = createContext<AuthState>(initialState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)

  useEffect(() => {
    let mounted = true

    async function loadAdmin(session: Session | null) {
      if (!session) {
        if (mounted) setState({ session: null, admin: null, loading: false, error: null })
        return
      }

      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!mounted) return

      if (error || !data) {
        setState({
          session: null,
          admin: null,
          loading: false,
          error: '관리자 계정 정보를 찾을 수 없습니다. 관리자에게 문의하세요.',
        })
        return
      }

      if (!data.is_active) {
        await supabase.auth.signOut()
        if (!mounted) return
        setState({
          session: null,
          admin: null,
          loading: false,
          error: '비활성화된 계정입니다. 관리자에게 문의하세요.',
        })
        return
      }

      setState({ session, admin: data, loading: false, error: null })
    }

    supabase.auth.getSession().then(({ data }) => loadAdmin(data.session))

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      loadAdmin(session)
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
