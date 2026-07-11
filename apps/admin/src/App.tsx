import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import Login from './routes/Login'
import Concepts from './routes/Concepts'
import Frames from './routes/Frames'
import Sessions from './routes/Sessions'
import RequireAuth from './routes/RequireAuth'
import AdminLayout from './components/AdminLayout'

// 라우트 목록: docs/withmini_demo_spec.md 섹션 5.1~5.4
// /login을 제외한 모든 라우트는 RequireAuth로 감싸 인증 가드를 적용한다.
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route path="/concepts" element={<Concepts />} />
            <Route path="/frames" element={<Frames />} />
            <Route path="/sessions" element={<Sessions />} />
          </Route>
          <Route path="/" element={<Navigate to="/sessions" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
