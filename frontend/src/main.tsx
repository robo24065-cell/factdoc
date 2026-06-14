import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './App'
import Main from './pages/Main'
import Compare from './pages/Compare'
import Dashboard from './pages/Dashboard'
import MyPage from './pages/MyPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Main />} />
          <Route path="compare" element={<Compare />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="mypage" element={<MyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
