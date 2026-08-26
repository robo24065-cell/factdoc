import { Link } from 'react-router-dom'
import { FONT, SURFACE, TYPE, TEXT, PROSE, FOCUS } from '../../theme/gohyang'
import PickSidebar from '../../components/pick/PickSidebar'
import BukbtiBoard from '../../components/pick/BukbtiBoard'
import { ITEMS } from '../../lib/pickData'

/* ────────────────────────────────────────────────────────────────
   참여 허브 (/pick) — 취향으로 고향을 만나는 입구

   왜 있는가: 이 서비스의 동선(통계 → 사료 → 기억 카드 → 기증)은 진입 턱이 높다.
   정작 이어 적을 사람은 이산 3·4세대인데 들어올 가벼운 문이 없었다.
   오락이 목적이 아니라 유입 경로다 — 그래서 모든 게임의 결과가
   「그 고향의 기록 공백」(통일부 실측)으로 이어진다.

   출처 구분을 입구에서 선언한다(절대규칙: 섞지 않는다).
   ──────────────────────────────────────────────────────────────── */

const GAMES = [
  {
    to: '/pick/food', name: '고향의 음식', badge: '월드컵 16강 · 15번 고릅니다',
    sub: '평양냉면부터 개성주악까지 — 이름만 남은 고향의 맛을 골라 보십시오.',
  },
  {
    to: '/pick/scene', name: '고향의 풍경', badge: '월드컵 16강 · 15번 고릅니다',
    sub: '통일부 「나의 살던 고향은」 사진으로 보는 일곱 고향의 산과 강.',
  },
  {
    to: '/pick/word', name: '북녘의 말', badge: '월드컵 16강 · 15번 고릅니다',
    sub: '곽밥·가마치·손기척 — 통일부 남북한 언어비교 21,985쌍에서 고른 말들.',
  },
  {
    to: '/pick/balance', name: '우리 집 기억 밸런스', badge: '8문항',
    sub: '댁에 남아 있는 기록의 유형을 짚고, 맞는 국가 기록 경로를 안내합니다.',
  },
] as const

export default function PickHub() {
  return (
    <div>
      <header className="max-w-[46rem]">
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>참여</p>
        <h2 className={`mt-1 ${TYPE.h1} ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
          고향을 취향으로 먼저 만나 보십시오
        </h2>
        <p className={`mt-2 ${TYPE.body} ${TEXT.soft} ${PROSE}`}>
          할머니의 고향 음식이 무엇이었는지 모르셔도 됩니다. 골라 보시면, 그 고향에 남은 기록이 얼마나 되는지를
          끝에서 보여 드립니다 — 놀이가 아니라 기록으로 가는 입구입니다.
        </p>
        <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          음식·풍경의 지역 구분은 문화적 통설이며 통일부 공표 자료가 아닙니다. 결과 화면의 지역 수치는 전부 통일부 공공데이터입니다.
          {' '}참여 집계는 이 서비스 안의 익명 집계로 따로 표시합니다. 기증 사료(다른 집안이 맡긴 기록)는 게임에 쓰지 않습니다.
        </p>
      </header>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* ── 좌측 열(위→아래): ① 북BTI 진행판 ② 게임 카드 2×2 ③ 항목 자료 캡션 ④ AI 스튜디오 카드 ── */}
        <div className="space-y-3">
          {/* ① 북BTI 진행판 — 네 게임의 마지막 판이 글자 넷을 채운다(재미용 놀이) */}
          <BukbtiBoard />

          {/* ② 게임 카드 2×2 — 카드 전체가 눌린다 (불변) */}
          <div className="grid gap-3 sm:grid-cols-2">
            {GAMES.map(g => (
              <Link key={g.to} to={g.to} className={`block min-h-[48px] rounded-md ${FOCUS}`}>
                <div className={`h-full ${SURFACE.card} p-4 hover:border-[#1a4e9c] dark:hover:border-[#7aa9e8]`}>
                  <p className={`text-[1.3125rem] font-bold leading-snug ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
                    {g.name}
                  </p>
                  <p className={`mt-1.5 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{g.sub}</p>
                  <p className={`mt-2.5 ${TYPE.cap} font-semibold tabular-nums ${TEXT.blue}`}>{g.badge} <span aria-hidden="true">→</span></p>
                </div>
              </Link>
            ))}
          </div>

          {/* ③ 항목 자료 기준 캡션 */}
          <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            항목 자료 기준 — 음식·풍경·말 각 16종, {ITEMS.builtAt} 기준입니다.
            {' '}풍경 사진은 저장하지 않고 통일부 원본 주소를 그대로 불러오며, 저작권은 각 제공처에 있습니다.
          </p>

          {/* ④ AI 스튜디오 — 놀이가 아니라 후손의 도구라 표면(slab)을 게임 카드와 가른다 */}
          <Link to="/studio" className={`block min-h-[48px] rounded-md ${FOCUS}`} data-studio-card>
            <div className={`${SURFACE.slab} p-4 hover:border-[#1a4e9c] dark:hover:border-[#7aa9e8]`}>
              <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>후손의 도구</p>
              <p className={`mt-1 text-[1.3125rem] font-bold leading-snug ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
                AI 스튜디오 — 가족 이야기를 생성 AI 프롬프트로
              </p>
              <p className={`mt-1.5 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                들은 이야기를 영상·사진 생성 AI에 넣을 프롬프트로 바꿔 드립니다. 이야기는 이 브라우저 안에서만 처리됩니다.
              </p>
              <p className={`mt-2.5 ${TYPE.cap} font-semibold ${TEXT.blue}`}>여섯 단계로 만들기 <span aria-hidden="true">→</span></p>
            </div>
          </Link>
        </div>

        {/* ── 사이드바 — 통일부 실측 표(항상) + 참여 집계(표본 20판 이상만) ── */}
        <PickSidebar />
      </div>
    </div>
  )
}
