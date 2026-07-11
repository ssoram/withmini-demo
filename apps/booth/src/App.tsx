import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Start from './routes/Start'
import Concept from './routes/Concept'
import Frame from './routes/Frame'
import Capture from './routes/Capture'
import Select from './routes/Select'
import Generate from './routes/Generate'
import PrintAnimation from './routes/PrintAnimation'
import Qr from './routes/Qr'
import { BoothFlowProvider } from './context/BoothFlowContext'
import IdleGuard from './components/IdleGuard'

// 라우트 목록: docs/withmini_demo_spec.md 섹션 4.1~4.8
export default function App() {
  return (
    <BrowserRouter>
      <BoothFlowProvider>
        {/* 모든 화면 공통 idle timeout(4.1) 감시 */}
        <IdleGuard />
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/concept" element={<Concept />} />
          <Route path="/frame" element={<Frame />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/select" element={<Select />} />
          <Route path="/generate" element={<Generate />} />
          <Route path="/print-animation" element={<PrintAnimation />} />
          <Route path="/qr" element={<Qr />} />
        </Routes>
      </BoothFlowProvider>
    </BrowserRouter>
  )
}
