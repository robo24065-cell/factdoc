import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './App'
import Main from './pages/Main'

// 무거운 라우트는 코드 분할(지연 로딩) — 첫 화면(검증)을 가볍게 유지
const Compare = lazy(() => import('./pages/Compare'))
const Eval = lazy(() => import('./pages/Eval'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MyPage = lazy(() => import('./pages/MyPage'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Main />} />
          <Route path="compare" element={<Compare />} />
          <Route path="eval" element={<Eval />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="mypage" element={<MyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
