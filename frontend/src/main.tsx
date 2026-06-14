import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import ConsumerLayout from './layouts/ConsumerLayout'
import AdminLayout from './layouts/AdminLayout'
import Home from './pages/Home'

// 사용자(지연로딩)
const Trending = lazy(() => import('./pages/Trending'))
const Me = lazy(() => import('./pages/Me'))
// 관리자(지연로딩)
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Review = lazy(() => import('./pages/Review'))
const Eval = lazy(() => import('./pages/Eval'))
const Compare = lazy(() => import('./pages/Compare'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 일반 사용자 */}
        <Route element={<ConsumerLayout />}>
          <Route index element={<Home />} />
          <Route path="trending" element={<Trending />} />
          <Route path="me" element={<Me />} />
        </Route>
        {/* 관리자 (비밀번호 게이트) */}
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="review" element={<Review />} />
          <Route path="eval" element={<Eval />} />
          <Route path="compare" element={<Compare />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
