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
// 참여(지연로딩) — 월드컵 3종 + 기억 밸런스. 취향으로 고향을 만나는 입구
const PickHub = lazy(() => import('./pages/pick/PickHub'))
const PickTournament = lazy(() => import('./pages/pick/Tournament'))
const PickBalance = lazy(() => import('./pages/pick/BalanceGame'))
// 북BTI 완성 화면 — 재미로 보는 취향 놀이(심리검사·통일부 자료 아님)
const BukbtiResult = lazy(() => import('./pages/pick/BukbtiResult'))
// AI 스튜디오(지연로딩) — 후손의 도구: 가족 이야기 → 생성 AI 프롬프트. 놀이가 아니라 도구라 /pick 밖의 경로다
const Studio = lazy(() => import('./pages/studio/Studio'))
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
          {/* 참여 — 월드컵 3종(음식·풍경·북녘 말) + 우리 집 기억 밸런스.
              결과는 별도 경로를 파지 않는다(새로고침이면 처음부터 — 집계 중복 방지). */}
          <Route path="pick" element={<PickHub />} />
          <Route path="pick/balance" element={<PickBalance />} />
          {/* 북BTI — 반드시 pick/:game 앞에 선언한다(파라미터 라우트에 먹히지 않게) */}
          <Route path="pick/bukbti" element={<BukbtiResult />} />
          <Route path="pick/:game" element={<PickTournament />} />
          {/* AI 스튜디오 — 산출은 프롬프트뿐(영상·사진 생성 없음). 입력은 브라우저 안에서만 처리 */}
          <Route path="studio" element={<Studio />} />
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
