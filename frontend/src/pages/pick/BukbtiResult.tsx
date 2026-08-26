import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BTN, C, FONT, SURFACE, TYPE, TEXT, PROSE, FOCUS, TAP, TAP_INLINE, WEBFONT_SERIF, josa } from '../../theme/gohyang'
import { wrapLines } from '../../lib/wrapLines.mjs'
import BukbtiBoard from '../../components/pick/BukbtiBoard'
import {
  BUKBTI_AXES, BUKBTI_DISCLAIMER, BUKBTI_RATIO_HOW, BUKBTI_RATIO_HOW_SHORT, BUKBTI_RATIO_LIMIT,
  BUKBTI_RATIO_LIMIT_SHORT, BUKBTI_RATIO_SMALL_N, BUKBTI_TALLY_HONESTY, BUKBTI_TYPES, BUKBTI_TYPE_OF,
  bukbtiDisplay, type BukbtiType,
} from '../../data/bukbti'
import {
  BUKBTI_EVENT, bukbtiAxisView, bukbtiCode, bukbtiCountLine, bukbtiMineHits, bukbtiMinePct,
  bukbtiRemaining, readBukbti, readBukbtiTally,
  type BukbtiAxisView, type BukbtiState, type BukbtiTally,
} from '../../lib/bukbti'

/* ────────────────────────────────────────────────────────────────
   북BTI 완성 화면 (/pick/bukbti)

   구성(위→아래): ① 유형 카드(코드 명조 대활자 + 한 줄 요약 + 별칭 + 문안 +
   ★네 자리 비율 막대 + 「자세히 보기」) ② 「같은 유형 N번 기록」
   ③ 16유형 전체 분포(0건 유형도 전부 나열 + 내 유형 순위) ④ 공유 PNG
   ⑤ 글자 다시 채우기(네 게임 링크).

   정직성 규약
     · 분포는 「사람 수」가 아니라 「완성 기록의 누적」이다 — 그 문구를 그대로 싣고,
       같은 유형 수도 「명」이 아니라 「N번 기록」으로 적는다(없는 통계 금지).
       순위 문장에도 「완성 기록의 순위」라고 못 박는다 — 「몇 명」이라고 쓰지 않는다.
     · n 상시 병기 — 「N건 (x%)」. 총 20건 미만이면 % 를 흐린 참고 표시로 낮춘다.
     · ★ 축 비율도 같은 규약이다 — 「국 73%」 옆에 반드시 횟수(11번 중 8번)를 적는다.
       분모는 15가 아니라 「대비 매치」 수이고, 실측 분포는 네 번에서 열한 번이 98.4%다.
       비율을 못 내는 판(밸런스·대비 0회·정확히 반반)과 옛 기록은 막대를 그리지 않고
       왜 없는지를 적는다 — 없는 비율을 그리는 순간 그것이 날조다.
     · 비율은 취향의 세기가 아니다(BUKBTI_RATIO_LIMIT). 자리끼리 견주지 못한다.
     · as-of — 「지금까지 N건 · HH:MM 불러옴」 + 새로고침 단추(TallyDeck 관용).
     · 집계 읽기 실패면 ②③ 구획만 조용히 사라지고 유형·문안·축 비율은 그대로 남는다
       (DB 가 죽어도 놀이만 남는 규약 — 축 비율은 애초에 기기 안 값이다).
   ──────────────────────────────────────────────────────────────── */

const nf = (v: number) => (Number.isFinite(v) ? v.toLocaleString('ko-KR') : '—')
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
/** % 를 본문 크기로 보여 줄 최소 총건수 — pickTally.PCT_PLAIN_MIN 과 같은 문턱 */
const PCT_PLAIN_MIN = 20

export default function BukbtiResult() {
  const [state, setState] = useState<BukbtiState>(() => readBukbti())
  const [tally, setTally] = useState<BukbtiTally | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sync = () => setState(readBukbti())
    window.addEventListener(BUKBTI_EVENT, sync)
    return () => window.removeEventListener(BUKBTI_EVENT, sync)
  }, [])

  const code = bukbtiCode(state.letters)

  useEffect(() => {
    if (!code) return
    let alive = true
    /* 자기 기록의 INSERT 직후일 수 있다 — 반영된 값을 보도록 한 박자 늦춘다(TallyDeck 관용) */
    const t = setTimeout(() => {
      void readBukbtiTally().then(r => { if (alive) setTally(r) })
    }, 900)
    return () => { alive = false; clearTimeout(t) }
  }, [code])

  async function refresh() {
    setBusy(true)
    try { setTally(await readBukbtiTally(true)) } finally { setBusy(false) }
  }

  const type: BukbtiType | null = code ? BUKBTI_TYPE_OF.get(code) ?? null : null

  return (
    <div className="mx-auto max-w-5xl">
      <nav aria-label="현재 위치" className={`${TYPE.cap} ${TEXT.faint}`}>
        <Link to="/pick" className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>참여</Link>
        <span aria-hidden="true"> › </span>북BTI
      </nav>
      <header className="mt-2 max-w-[46rem]">
        <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>북BTI — 네 판에서 고르신 것</h2>
        <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{BUKBTI_DISCLAIMER}</p>
      </header>

      {/* ── 미완성 — 진행판 + 남은 게임 안내만 ── */}
      {!type && (
        <div className="mt-5 max-w-[46rem] space-y-4">
          <BukbtiBoard />
          <p className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
            아직 네 글자가 다 채워지지 않았습니다. 남은 게임을 마치면 이 자리에서 유형을 보여 드립니다 —{' '}
            {bukbtiRemaining(state.letters).map((ax, i) => (
              <span key={ax.game}>
                {i > 0 && ' · '}
                <Link to={ax.to} className={`${TAP_INLINE} font-semibold ${TEXT.blue} underline underline-offset-2 ${FOCUS}`}>
                  {ax.gameLabel}
                </Link>
              </span>
            ))}
          </p>
        </div>
      )}

      {/* ── 완성 ── */}
      {type && code && (
        <div className="mt-5 space-y-5">
          {/* ① 유형 카드 */}
          <section className={`${SURFACE.slab} max-w-[46rem] p-5`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>당신의 북BTI</p>
            {/* 코드 대활자 + 그 옆에 작은 글씨 한 줄 요약(별칭·문안과 겹치지 않는 짧은 성격) */}
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className={`text-[2.125rem] font-bold leading-tight tracking-[-0.01em] ${TEXT.ink}`} style={{ fontFamily: FONT.serif }}>
                {bukbtiDisplay(code)}
              </span>
              <span className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{type.oneLine}</span>
            </p>
            <p className={`mt-1 text-[1.3125rem] font-bold leading-snug ${TEXT.blue} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
              {type.alias}
            </p>
            <p className={`mt-2.5 ${TYPE.body} ${TEXT.soft} ${PROSE}`}>{type.text}</p>

            {/* ★ 네 자리 비율 — 각 자리의 두 글자와, 그 판에서 실제로 고르신 횟수 */}
            <div className={`mt-3 border-t pt-3 ${SURFACE.hair}`} data-bukbti-axes>
              <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>네 자리 비율 · 이 기기 안에서만 셈</p>
              <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{BUKBTI_RATIO_HOW}</p>
              <div className="mt-3 space-y-3.5">
                {BUKBTI_AXES.map((ax, i) => (
                  <AxisRow key={ax.game} view={bukbtiAxisView(ax.game, state)} ordinal={['첫째', '둘째', '셋째', '넷째'][i]} />
                ))}
              </div>

              {/* 자리별 설명 — 접힘 기본. summary 의 Enter·Space 기본 동작만 쓴다(스크립트·모션 없음) */}
              <details className={`mt-3 border-t pt-1 ${SURFACE.hair}`}>
                <summary
                  className={`inline-flex ${TAP} cursor-pointer list-none items-center gap-1.5 ${TYPE.cap} font-semibold ${TEXT.blue} [&::-webkit-details-marker]:hidden ${FOCUS}`}
                >
                  <span aria-hidden="true">▸</span> 네 자리가 각각 무엇인지 자세히 보기
                </summary>
                <ul className={`space-y-3 border-t pb-1 pt-3 ${SURFACE.hair}`}>
                  {BUKBTI_AXES.map((ax, i) => {
                    const mine = state.letters[ax.game]
                    return (
                      <li key={ax.game}>
                        <p className={`${TYPE.sub} font-bold ${TEXT.ink} ${PROSE}`}>
                          {['첫째', '둘째', '셋째', '넷째'][i]} 자리 · {ax.title} — {ax.a.letter} 또는 {ax.b.letter}
                        </p>
                        <p className={`mt-0.5 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>{ax.measures}</p>
                        <ul className="mt-1 space-y-0.5">
                          {[ax.a, ax.b].map(side => (
                            <li key={side.letter} className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
                              {/* 받침에 따라 「국이면」·「귀면」 — 지역명과 같은 조사 규약(theme/gohyang.josa) */}
                              <b className={`font-bold ${mine === side.letter ? TEXT.blue : TEXT.ink}`}>{side.letter}</b>
                              {josa(side.letter, '이면', '면')} {side.desc}
                              {mine === side.letter && <span className={`ml-1 font-bold ${TEXT.blue}`}>{' '}— 내 글자</span>}
                            </li>
                          ))}
                        </ul>
                        <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{ax.from}</p>
                      </li>
                    )
                  })}
                </ul>
              </details>

              <p className={`mt-3 border-t pt-2 ${SURFACE.hair} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                {BUKBTI_RATIO_SMALL_N} {BUKBTI_RATIO_LIMIT}
              </p>
            </div>
          </section>

          {/* ② 같은 유형 N번 — 집계가 살아 있을 때만 (사람 수가 아니라 기록 수) */}
          {tally?.ok && (
            <p className={`max-w-[46rem] ${TYPE.answer} ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
              {/* 「(이번 내 기록 포함)」은 집계에 실제로 1건 이상 잡혀 있을 때만 붙인다 —
                  반영 지연·DB 초기화 후 로컬 표식 잔존이면 n=0 인데 「내 기록 포함」이라는 모순 문장이 된다 */}
              같은 유형이 지금까지 {nf(tally.byCode.get(code) ?? 0)}번 기록되었습니다
              {(tally.byCode.get(code) ?? 0) > 0 && state.recorded === code ? '(이번 내 기록 포함)' : ''}.
            </p>
          )}

          {/* ③ 16유형 전체 분포 — 0건 유형도 전부 나열 */}
          {tally?.ok && (
            <section className={`${SURFACE.card} max-w-[46rem] p-4`} data-bukbti-tally>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>이 화면의 익명 집계 · 통일부 자료 아님</p>
                  <h3 className={`mt-1 ${TYPE.h3} ${TEXT.ink}`}>16유형 분포 — 완성 기록 누적</h3>
                </div>
                <button
                  type="button"
                  onClick={() => { void refresh() }}
                  disabled={busy}
                  className={`inline-flex ${TAP} shrink-0 items-center rounded border px-2.5 ${TYPE.cap} font-semibold ${SURFACE.line} ${TEXT.soft} hover:border-[#1a4e9c] hover:text-[#1a4e9c] disabled:opacity-50 dark:hover:text-[#7aa9e8] ${FOCUS}`}
                >
                  새로고침
                </button>
              </div>
              {(() => {
                const total = tally.total
                const max = Math.max(0, ...BUKBTI_TYPES.map(t => tally.byCode.get(t.code) ?? 0))
                const plain = total >= PCT_PLAIN_MIN
                return (
                  <>
                    <ol className="mt-2.5 space-y-1.5">
                      {[...BUKBTI_TYPES]
                        .map(t => ({ t, n: tally.byCode.get(t.code) ?? 0 }))
                        .sort((a, b) => b.n - a.n)
                        .map(({ t, n }) => {
                          const pct = total > 0 ? Math.round((n / total) * 100) : 0
                          const w = max > 0 ? Math.max(n > 0 ? 2 : 0, Math.round((n / max) * 100)) : 0
                          const isMine = t.code === code
                          return (
                            <li key={t.code}>
                              <span className={`flex items-baseline justify-between gap-2 ${TYPE.cap} ${TEXT.soft}`}>
                                <span className={`${PROSE} min-w-0`}>
                                  {isMine && <span className={`mr-1 font-bold ${TEXT.blue}`} aria-hidden="true">●</span>}
                                  {bukbtiDisplay(t.code)} {t.alias}
                                  {isMine && <span className={`ml-1 ${TYPE.cap} font-bold ${TEXT.blue}`}>내 유형</span>}
                                </span>
                                <span className="shrink-0 whitespace-nowrap tabular-nums">
                                  <b className={`${TYPE.sub} font-bold ${TEXT.ink}`}>{nf(n)}건</b>{' '}
                                  <span className={plain ? `${TYPE.sub} ${TEXT.soft}` : `${TYPE.cap} ${TEXT.faint}`}>({pct}%)</span>
                                </span>
                              </span>
                              <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded bg-[#eaecef] dark:bg-[#252a31]">
                                <span className="block h-full rounded bg-[#4b79bb] dark:bg-[#7aa9e8]" style={{ width: `${w}%` }} />
                              </span>
                            </li>
                          )
                        })}
                    </ol>
                    {/* 내 유형이 전체에서 몇 번째로 많은지 — 「사람 수」가 아니라 완성 기록의 순위다 */}
                    {total > 0 && (() => {
                      const mineN = tally.byCode.get(code) ?? 0
                      if (mineN === 0) {
                        return (
                          <p className={`mt-2.5 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                            내 유형은 아직 이 집계에 잡히지 않았습니다 — 방금 기록이 반영되기까지 잠시 걸릴 수 있습니다.
                          </p>
                        )
                      }
                      const rank = 1 + BUKBTI_TYPES.filter(t => (tally.byCode.get(t.code) ?? 0) > mineN).length
                      const same = BUKBTI_TYPES.filter(t => t.code !== code && (tally.byCode.get(t.code) ?? 0) === mineN).length
                      return (
                        <p className={`mt-2.5 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                          내 유형은 16유형 가운데 <b className={`font-bold ${TEXT.ink}`}>{rank}번째</b>로 기록이 많습니다
                          {same > 0 ? `(같은 건수인 유형이 ${same}종 더 있습니다)` : ''}. 사람 수가 아니라 완성 기록의 순위입니다.
                        </p>
                      )
                    })()}
                    <p className={`mt-3 border-t pt-2 ${SURFACE.hair} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                      {BUKBTI_TALLY_HONESTY}
                      {' '}지금까지 {nf(total)}건 · <span className="tabular-nums">{hhmm(tally.at)}</span> 불러옴.
                    </p>
                  </>
                )
              })()}
            </section>
          )}

          {/* ④ 공유 PNG + ⑤ 글자 다시 채우기 */}
          <div className={`flex flex-wrap items-center gap-2.5 border-t pt-4 ${SURFACE.hair}`}>
            <BukbtiShareCard
              code={code}
              type={type}
              tallyN={tally?.ok ? tally.byCode.get(code) ?? 0 : null}
              axes={BUKBTI_AXES.map(ax => bukbtiAxisView(ax.game, state))}
            />
            <Link to="/pick" className={BTN.ghost}>다른 게임 고르기</Link>
          </div>
          <div className="max-w-[46rem]">
            <p className={`${TYPE.cap} font-semibold ${TEXT.faint}`}>글자 다시 채우기 — 다시 하면 마지막 판 기준으로 바뀝니다</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {BUKBTI_AXES.map(ax => (
                <Link key={ax.game} to={ax.to} className={BTN.ghost}>
                  {ax.gameLabel}(지금 {state.letters[ax.game]}) <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════ 축 한 줄 — MBTI 식 좌우 막대 ══════════

   ★ 375px 에서 네 축이 **전부 한 줄**이어야 한다 (사용자 지적 2026-08-26:
     「모바일에서 좌우로 배치되어야 할 것 같은데 두 개가 위아래로 배치돼 스크롤이 길어진다」).
     그래서 라벨 줄은 flex-nowrap 이고 양쪽 조각에 whitespace-nowrap·shrink-0 을 준다 —
     줄이 터질 여지를 CSS 로 없앤 것이지, 글자가 짧아서 우연히 붙어 있는 게 아니다.
     폭을 가장 많이 먹던 「내 글자」 배지(글자 4개+여백)는 화면에서 빼고
     ● 도형 + 굵기 + 밑줄 **세 형태 신호**로 바꿨다. 색만으로 구분하지 않는다는 규약은
     그대로다(as-of 3상태와 같은 원칙). 읽어 주는 기계에는 sr-only 로 「내 글자」가 남는다.

   · 막대 안에 글자를 넣지 않는다 — 22% 칸에는 11px 도 들어가지 않는다. 수치는 윗줄에.
   · 막대와 문장은 같은 값을 쓴다(pctA/pctB, 합은 반드시 100). 횟수는 반올림한 %에서
     되계산하지 않고 저장된 횟수를 그대로 쓴다.
   · 횟수는 막대 바로 아래 **각 글자 쪽 끝**에 붙인다 — 「국 7번 … 대결 9번 … 찬 2번」.
     7+2=9 가 눈으로 맞아떨어져야 비율이 어디서 나왔는지가 보인다(n 상시 병기 규약).
   · 비율이 없는 축(밸런스·옛 기록·대비 0회)은 막대 대신 점선 한 줄과 그 이유를 적는다. */
function AxisSide({ side, pct, isMine, end }: {
  side: { letter: string; desc: string }
  pct: number | null
  isMine: boolean
  end: boolean
}) {
  const dot = isMine ? <span className={`${end ? 'ml-1' : 'mr-1'} ${TEXT.blue}`} aria-hidden="true">●</span> : null
  const letter = (
    <span className={isMine ? `font-bold ${TEXT.ink} underline decoration-[#1a4e9c] decoration-2 underline-offset-4 dark:decoration-[#7aa9e8]` : ''}>
      {side.letter}
    </span>
  )
  const num = pct != null ? <span className={`${end ? 'mr-1' : 'ml-1'} tabular-nums`}>{pct}%</span> : null
  return (
    <span
      data-axis-side={side.letter}
      className={`shrink-0 whitespace-nowrap ${end ? 'text-right' : 'text-left'} ${
        isMine ? `${TYPE.sub} ${TEXT.ink}` : `${TYPE.cap} ${TEXT.faint}`
      }`}
    >
      {end ? <>{num}{letter}{dot}</> : <>{dot}{letter}{num}</>}
      {isMine && <span className="sr-only"> — 내 글자</span>}
    </span>
  )
}

function AxisRow({ view, ordinal }: { view: BukbtiAxisView; ordinal: string }) {
  const { axis, mine, pctA, pctB } = view
  const hasBar = pctA != null && pctB != null
  const minePct = bukbtiMinePct(view)
  const counted = bukbtiCountLine(view)
  const mineIsA = mine === axis.a.letter

  return (
    <div data-bukbti-axis={axis.game}>
      <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        {ordinal} 자리 · {axis.title}({axis.gameLabel})
      </p>
      {/* 좌우 양 끝 — 375px 에서도 줄바꿈하지 않는다(flex-nowrap + 조각마다 whitespace-nowrap) */}
      <div className="mt-0.5 flex flex-nowrap items-baseline justify-between gap-2" data-axis-labels>
        <AxisSide side={axis.a} pct={pctA} isMine={mine === axis.a.letter} end={false} />
        <AxisSide side={axis.b} pct={pctB} isMine={mine === axis.b.letter} end />
      </div>

      {hasBar ? (
        <div
          className="mt-1 flex h-2.5 w-full overflow-hidden rounded bg-[#eaecef] dark:bg-[#252a31]"
          role="img"
          aria-label={`${axis.a.letter} ${pctA}퍼센트, ${axis.b.letter} ${pctB}퍼센트. ${counted ?? ''}.`}
        >
          <span
            aria-hidden="true"
            className={`block h-full ${mineIsA ? 'bg-[#1a4e9c] dark:bg-[#7aa9e8]' : 'bg-[#c9d5e8] dark:bg-[#2b3a52]'}`}
            style={{ width: `${pctA}%` }}
          />
          <span
            aria-hidden="true"
            className={`block h-full ${mineIsA ? 'bg-[#c9d5e8] dark:bg-[#2b3a52]' : 'bg-[#1a4e9c] dark:bg-[#7aa9e8]'}`}
            style={{ width: `${pctB}%` }}
          />
        </div>
      ) : (
        <div className={`mt-1 h-2.5 w-full rounded border border-dashed ${SURFACE.hair}`} aria-hidden="true" />
      )}

      {/* 횟수 — 각 글자 쪽 끝에. 이 줄도 375px 에서 한 줄이다 */}
      {hasBar && (
        <p
          className={`mt-1 flex flex-nowrap items-baseline justify-between gap-2 ${TYPE.cap} ${TEXT.faint} tabular-nums`}
          data-axis-counts
        >
          <span className="shrink-0 whitespace-nowrap">{axis.a.letter} {view.a}번</span>
          <span className="shrink-0 whitespace-nowrap">대결 {view.d}번</span>
          <span className="shrink-0 whitespace-nowrap">{axis.b.letter} {view.d - view.a}번</span>
        </p>
      )}

      <p className={`mt-1 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
        {axis.a.letter} {axis.a.desc} · {axis.b.letter} {axis.b.desc}
      </p>
      {counted && minePct != null && (
        <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          고르신 {view.total}번 중 {view.d}번이 그런 대결이었습니다.
        </p>
      )}
      {view.note && <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{view.note}</p>}
    </div>
  )
}

/* ══════════ 공유 PNG — PickShareCard 의 canvas 절차 재사용(사진 0장) ══════════ */

const SERIF_SPECS = [`400 21px ${WEBFONT_SERIF}`, `700 40px ${WEBFONT_SERIF}`, `700 26px ${WEBFONT_SERIF}`] as const
const uniqChars = (s: string) => [...new Set(String(s ?? '').normalize('NFC'))].join('')

async function loadSerif(text: string, ms = 2500): Promise<boolean> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts || typeof fonts.load !== 'function') return false
  const chars = uniqChars(text)
  if (!chars) return false
  try {
    const faces = await Promise.race([
      Promise.all(SERIF_SPECS.map(s => fonts.load(s, chars))).then(a => a.flat()),
      new Promise<never>((_, rj) => { setTimeout(() => rj(new Error('font-timeout')), ms) }),
    ])
    return faces.length > 0 && SERIF_SPECS.every(s => fonts.check(s, chars))
  } catch {
    return false
  }
}

function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

type ShareInput = { code: string; type: BukbtiType; tallyN: number | null; axes: BukbtiAxisView[] }

function paintBukbti(ctx: CanvasRenderingContext2D, m: ShareInput, W: number, measure: boolean): number {
  const M = 64
  const maxW = W - M * 2
  let y = 0
  const line = (text: string, size: number, weight: string, color: string, lead: number, serif: boolean) => {
    ctx.font = `${weight} ${size}px ${serif ? FONT.serif : FONT.gothic}`
    ctx.fillStyle = color
    for (const ln of wrapLines(ctx, text, maxW)) {
      y += lead
      if (!measure) ctx.fillText(ln, M, y)
    }
  }
  const rule = (color: string = C.line, h = 1) => {
    y += 14
    if (!measure) { ctx.fillStyle = color; ctx.fillRect(M, y, maxW, h) }
    y += 6
  }

  if (!measure) { ctx.fillStyle = C.blue; ctx.fillRect(0, 0, W, 10) }
  y = 40
  line('북BTI — 재미로 보는 취향 놀이', 17, '700', C.faint, 30, false)
  line(bukbtiDisplay(m.code), 40, '700', C.ink, 52, true)
  line(m.type.alias, 26, '700', C.blue, 38, true)
  rule(C.blue, 2)
  y += 8
  line(m.type.text, 17, '400', C.ink, 30, false)

  /* 네 자리 비율 — 사진 없음 규약 그대로(글자와 사각형만).
     ★ measure 패스와 paint 패스가 같은 코드를 두 번 돈다. fillRect 는 반드시
       if (!measure) 안에, y 증감은 바깥에 둬야 재는 높이와 그리는 높이가 맞는다. */
  const ORD = ['첫째', '둘째', '셋째', '넷째']
  const BW = 300
  y += 8
  rule()
  line(`네 자리 비율 — ${BUKBTI_RATIO_HOW_SHORT}`, 14, '700', C.faint, 24, false)
  m.axes.forEach((v, i) => {
    const mine = v.mine ?? ''
    if (v.pctA != null && v.pctB != null) {
      line(
        `${ORD[i]} ${v.axis.title}   ${v.axis.a.letter} ${v.pctA}% · ${v.axis.b.letter} ${v.pctB}%   (대결 ${v.d}번 중 ${bukbtiMineHits(v)}번을 ${mine} 쪽으로)`,
        15, '400', C.ink, 26, false,
      )
      y += 10
      const wa = Math.round((BW * v.pctA) / 100)
      if (!measure) {
        const mineIsA = mine === v.axis.a.letter
        ctx.fillStyle = mineIsA ? C.blue : C.line
        ctx.fillRect(M, y, wa, 6)
        ctx.fillStyle = mineIsA ? C.line : C.blue
        ctx.fillRect(M + wa, y, BW - wa, 6)
      }
      y += 16
      /* ★ 비율이 있는 자리에도 사유는 함께 간다 — 정확히 반씩 고르신 판(src='final')이나
         결승 선택과 갈린 판은 막대만 보면 그 글자의 근거가 없다. line() 은 measure·paint
         두 패스에서 똑같이 불려야 재는 높이와 그리는 높이가 맞는다(fillRect 만 !measure 안). */
      if (v.note) line(v.note, 13, '400', C.faint, 21, false)
    } else {
      line(`${ORD[i]} ${v.axis.title}   ${mine} — 이 판은 비율을 내지 않았습니다`, 15, '400', C.ink, 26, false)
      if (v.note) line(v.note, 13, '400', C.faint, 21, false)
      y += 6
    }
  })
  y += 6
  line('같은 편끼리 맞붙은 대결은 무엇을 골라도 같은 글자라 세지 않았습니다.', 13, '400', C.faint, 22, false)
  /* 이 그림은 맥락 밖으로 나가는 유일한 산출물이다 — 화면에만 있던 한계 고지를 함께 싣는다 */
  line(BUKBTI_RATIO_LIMIT_SHORT, 13, '400', C.faint, 22, false)

  if (m.tallyN != null) {
    y += 6
    line(`같은 유형이 지금까지 ${m.tallyN.toLocaleString('ko-KR')}번 기록되었습니다.`, 15, '400', C.soft, 26, false)
    line('(고향잇기 참여 익명 집계 · 통일부 자료 아님)', 13, '400', C.faint, 22, false)
  }
  y += 10
  rule()
  line('북BTI는 재미로 보는 취향 놀이입니다 · 심리검사 아님 · 공모전 출품 시제품', 14, '400', C.faint, 24, false)
  line(`고향잇기 — 참여(/pick) · ${nowStamp()} 이 기기에서 그려짐`, 14, '400', C.faint, 24, false)
  y += 40
  return y
}

async function renderBukbtiPng(m: ShareInput): Promise<{ url: string; bytes: number } | null> {
  await loadSerif(m.code + m.type.alias + '북BTI0123456789·')
  try {
    const W = 1000
    const dpr = 2
    const probe = document.createElement('canvas')
    probe.width = W
    probe.height = 10
    const pctx = probe.getContext('2d')
    if (!pctx) return null
    const need = Math.max(480, Math.ceil(paintBukbti(pctx, m, W, true)))

    const cv = document.createElement('canvas')
    cv.width = W * dpr
    cv.height = need * dpr
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, need)
    ctx.textBaseline = 'alphabetic'
    paintBukbti(ctx, m, W, false)
    const url = cv.toDataURL('image/png')
    if (!url.startsWith('data:image/png')) return null
    return { url, bytes: Math.round((url.length - url.indexOf(',') - 1) * 0.75) }
  } catch {
    return null
  }
}

function BukbtiShareCard({ code, type, tallyN, axes }: ShareInput) {
  const [png, setPng] = useState<{ url: string; bytes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState(false)
  const fileName = `고향잇기_북BTI_${code}.png`

  const make = async () => {
    if (busy) return
    setBusy(true)
    let out: Awaited<ReturnType<typeof renderBukbtiPng>> = null
    try { out = await renderBukbtiPng({ code, type, tallyN, axes }) } finally { setBusy(false) }
    if (!out) { setFail(true); setPng(null); return }
    setFail(false)
    setPng(out)
    try {
      const a = document.createElement('a')
      a.href = out.url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch { /* 내려받기가 막힌 환경 — 아래 링크가 남는다 */ }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => { void make() }} disabled={busy} aria-busy={busy} className={`${BTN.ghost} disabled:opacity-70`}>
          공유 그림 저장
        </button>
        {busy && <span className={`${TYPE.sub} ${TEXT.faint}`}>카드를 그리는 중입니다</span>}
      </div>
      {png && (
        <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          그림 파일 한 장을 만들었습니다 (약 {nf(Math.round(png.bytes / 1024))}KB). 사진은 담지 않고 글자만 담았습니다.
          {' '}자동으로 저장되지 않으면{' '}
          <a href={png.url} download={fileName} className={`${TAP_INLINE} font-medium text-[#1a4e9c] underline underline-offset-2 ${FOCUS}`}>
            여기를 눌러 저장
          </a>
          하십시오.
        </p>
      )}
      {fail && (
        <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>이 브라우저에서는 그림 파일을 만들지 못했습니다. 화면을 갈무리해 쓰셔도 됩니다.</p>
      )}
    </div>
  )
}
