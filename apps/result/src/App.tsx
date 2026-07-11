import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Result from './routes/Result'

// 라우트 목록: docs/withmini_demo_spec.md 섹션 4.9 — 이 도메인에는 /:sessionId 라우트만 존재한다.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/:sessionId" element={<Result />} />
      </Routes>
    </BrowserRouter>
  )
}
