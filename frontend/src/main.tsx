import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import ConsumerLayout from './layouts/ConsumerLayout'
import SasilOnLayout from './layouts/SasilOnLayout'
import AdminLayout from './layouts/AdminLayout'
import SasilOn from './pages/SasilOn'

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
        {/* 사실은ON — 전용 레이아웃 (레거시 탭 없음) */}
        <Route element={<SasilOnLayout />}>
          <Route index element={<SasilOn />} />
        </Route>
        {/* 레거시 FactDoc — 그대로 보존 */}
        <Route element={<ConsumerLayout />}>
          <Route path="legacy" element={<Home />} />
          <Route path="trending" element={<Trending />} />
          <Route path="forecast" element={<Forecast />} />
          <Route path="map" element={<InfectiousMap />} />
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
