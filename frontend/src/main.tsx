import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import './index.css'
import ConsumerLayout from './layouts/ConsumerLayout'
import SasilOnLayout from './layouts/SasilOnLayout'
import AdminLayout from './layouts/AdminLayout'
import GohyangOn from './pages/GohyangOn'

// 팩트체커는 부속 화면이 됐다(지연로딩) — 검색 인덱스 13.5MB 를 첫 화면 비용에 얹지 않는다
const SasilOn = lazy(() => import('./pages/SasilOn'))
// 분석 덱(지연로딩) — analysis.json 234KB 를 첫 화면 비용에 얹지 않는다
const AnalysisDeck = lazy(() => import('./pages/AnalysisDeck'))
// 사용자(지연로딩)
const Home = lazy(() => import('./pages/Home'))
const Trending = lazy(() => import('./pages/Trending'))
const Forecast = lazy(() => import('./pages/Forecast'))
const InfectiousMap = lazy(() => import('./pages/InfectiousMap'))
const Disease = lazy(() => import('./pages/Disease'))
const Me = lazy(() => import('./pages/Me'))
// 관리자(지연로딩)
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Strategy = lazy(() => import('./pages/Strategy'))
const Review = lazy(() => import('./pages/Review'))
const Eval = lazy(() => import('./pages/Eval'))
const Compare = lazy(() => import('./pages/Compare'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 고향잇기 — 이제 이쪽이 메인이다.
            지도·소멸시계·후손 다리가 서비스의 얼굴이고, 팩트체커는 그 안의 한 기능으로 들어간다.
            (/gohyang 은 예전 주소 — 공유된 링크가 깨지지 않게 같은 화면으로 남겨 둔다) */}
        <Route element={<SasilOnLayout />}>
          <Route index element={<GohyangOn />} />
          <Route path="gohyang" element={<GohyangOn />} />
          {/* 분석 덱 — 재본 것과 재보지 못한 것을 한 장씩 넘긴다 */}
          <Route path="deck" element={<AnalysisDeck />} />
          {/* 사이트구조.md 시절 주소 — 화면이 한 장으로 합쳐져 홈으로 보낸다 */}
          <Route path="map" element={<Navigate to="/" replace />} />
          <Route path="clock" element={<Navigate to="/" replace />} />
          <Route path="action" element={<Navigate to="/" replace />} />
          <Route path="archive" element={<Navigate to="/" replace />} />
          {/* 사실은ON 팩트체커 — 사이드 화면 */}
          <Route path="factcheck" element={<SasilOn />} />
        </Route>
        {/* 레거시 FactDoc — 그대로 보존 */}
        <Route element={<ConsumerLayout />}>
          <Route path="legacy" element={<Home />} />
          <Route path="trending" element={<Trending />} />
          <Route path="forecast" element={<Forecast />} />
          <Route path="legacy/map" element={<InfectiousMap />} />
          <Route path="disease/:name" element={<Disease />} />
          <Route path="me" element={<Me />} />
        </Route>
        {/* 관리자 (비밀번호 게이트) */}
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="strategy" element={<Strategy />} />
          <Route path="review" element={<Review />} />
          <Route path="eval" element={<Eval />} />
          <Route path="compare" element={<Compare />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
