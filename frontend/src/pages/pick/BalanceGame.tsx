import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BTN, FONT, SURFACE, TYPE, TEXT, PROSE, FOCUS, TAP_INLINE } from '../../theme/gohyang'
import RegionStatBlock from '../../components/pick/RegionStatBlock'
import PickShareCard, { type ShareModel } from '../../components/pick/PickShareCard'
import { BALANCE_QUESTIONS, RECORD_TYPE_LABEL, RECORD_TYPE_NOTE, type BalanceOption, type RecordType } from '../../data/pick-balance'
import { ITEMS, loadPickStats, rememberLastHome, type PickStats } from '../../lib/pickData'
import { recordPick } from '../../lib/pickTally'
import { PACK } from '../../components/gohyang/pack-types'
import { DONATION_FIRST } from '../../components/gohyang/model'

/* ────────────────────────────────────────────────────────────────
   우리 집 기억 밸런스 — 8문항 + 고향 고르기(선택)

   원칙
     · 점수·등급·백분율 없음 — 진단은 「답에서 직접 따라 나오는 안내」뿐.
     · 마지막 고향 고르기에서 「모릅니다」는 동등 크기의 선택지다 —
       모름이 열등 선택지가 아니다. 안 고르면 지역 수치 구획을 생략할 뿐이다.
     · 경로 안내는 paths.json 실측 경로만 쓴다(제목·연락처를 두 벌로 적지 않는다).
       기증 경로(DONATION_FIRST)가 맨 앞 — 실태조사 1순위 요청에 직접 답하는 순서다.
   ──────────────────────────────────────────────────────────────── */

type PathRec = { id: string; title: string; org: string; what: string; url: string; contact: string }

export default function BalanceGame() {
  const [answers, setAnswers] = useState<Array<'a' | 'b'>>([])
  const [homeStep, setHomeStep] = useState(false)
  const [home, setHome] = useState<string | null | 'skip'>(null)   // regionId | 'skip'(모름·비공개) | null(미선택)
  const [done, setDone] = useState(false)
  const [paths, setPaths] = useState<PathRec[] | null>(null)
  const [stats, setStats] = useState<PickStats | null>(null)
  const sent = useRef(false)
  /* 멱등 가드 — Tournament 와 같은 패턴. stale-state 특성상 실측 무해였지만 같은 방어를 둔다 */
  const acted = useRef(-1)

  const qIdx = answers.length
  const question = !homeStep && !done ? BALANCE_QUESTIONS[qIdx] : null

  useEffect(() => {
    let alive = true
    fetch(`${PACK}/paths.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j?.paths) setPaths(j.paths as PathRec[]) })
      .catch(() => { /* 경로 파일이 없어도 결과의 다른 구획은 나온다 */ })
    void loadPickStats().then(s => { if (alive) setStats(s) })
    return () => { alive = false }
  }, [])

  function answer(k: 'a' | 'b') {
    if (!question) return
    if (acted.current === answers.length) return
    acted.current = answers.length
    const nextAnswers = [...answers, k]
    setAnswers(nextAnswers)
    if (nextAnswers.length >= BALANCE_QUESTIONS.length) setHomeStep(true)
  }

  function undo() {
    acted.current = -1
    if (done) { setDone(false); sent.current = false; return }
    if (homeStep) { setHomeStep(false); setAnswers(a => a.slice(0, -1)); setHome(null); return }
    setAnswers(a => a.slice(0, -1))
  }

  function restart() {
    setAnswers([]); setHomeStep(false); setHome(null); setDone(false); sent.current = false
    acted.current = -1
  }

  /* 키보드 ← → = 왼쪽(가)·오른쪽(나) */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!question) return
      if (e.repeat) return   /* 키 자동반복은 받지 않는다 — Tournament 와 같은 가드 */
      if (e.key === 'ArrowLeft') { e.preventDefault(); answer('a') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); answer('b') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const chosen: BalanceOption[] = useMemo(
    () => answers.map((k, i) => BALANCE_QUESTIONS[i][k]),
    [answers],
  )

  /* 유형 접기 — 태그 수 세기뿐, 점수화하지 않는다 */
  const topTypes: RecordType[] = useMemo(() => {
    const order: RecordType[] = ['photo', 'doc', 'oral', 'place']
    const cnt = new Map<RecordType, number>()
    for (const o of chosen) for (const t of o.types ?? []) cnt.set(t, (cnt.get(t) ?? 0) + 1)
    return order.filter(t => (cnt.get(t) ?? 0) > 0).sort((a, b) => (cnt.get(b) ?? 0) - (cnt.get(a) ?? 0)).slice(0, 2)
  }, [chosen])

  /* 경로 모으기 — 기증 경로(DONATION_FIRST)를 맨 앞으로, 최대 3개 */
  const pathCards: PathRec[] = useMemo(() => {
    if (!paths) return []
    const ids = [...new Set(chosen.flatMap(o => o.pathIds ?? []))]
    ids.sort((a, b) => {
      const ra = DONATION_FIRST.indexOf(a), rb = DONATION_FIRST.indexOf(b)
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb)
    })
    return ids.map(id => paths.find(p => p.id === id)).filter((p): p is PathRec => Boolean(p)).slice(0, 3)
  }, [paths, chosen])

  const internals = useMemo(() => {
    const m = new Map<string, { href: string; label: string }>()
    for (const o of chosen) if (o.internal) m.set(o.internal.href, o.internal)
    return [...m.values()]
  }, [chosen])

  const homeStat = stats && home && home !== 'skip' ? stats.byId.get(home) ?? null : null

  /* 결과 확정 — 집계 1회(상위 유형과 고향만, 실패 무해) */
  useEffect(() => {
    if (!done || sent.current) return
    sent.current = true
    const top = topTypes[0]
    const regionId = home && home !== 'skip' ? home : null
    rememberLastHome(regionId)
    void recordPick('balance', top ? `type-${top}` : 'type-none', top ? RECORD_TYPE_LABEL[top] : '유형 없음', regionId)
  }, [done, topTypes, home])

  const shareModel: ShareModel = {
    gameLabel: '우리 집 기억 밸런스',
    winnerName: topTypes.length ? `${topTypes.map(t => RECORD_TYPE_LABEL[t]).join(' · ')} 중심` : '이야기로 남은 집',
    regionName: homeStat?.name ?? null,
    stats: homeStat && stats
      ? {
          rank: homeStat.rank, survivors: homeStat.survivors, density: homeStat.density,
          densityMaxName: stats.densityMax.name, densityMaxValue: stats.densityMax.density, asOf: stats.asOf,
        }
      : null,
    wordStandard: null,
    tallyLine: null,
    attributionLines: [
      '이 결과는 답하신 내용에서 직접 따라 나온 안내이며, 점수·등급이 아닙니다.',
      '수치는 통일부 공공데이터 · 기증·기록 경로는 이산가족정보통합시스템 실측 · 공모전 출품 시제품.',
    ],
  }

  return (
    <div className="mx-auto max-w-5xl">
      <nav aria-label="현재 위치" className={`${TYPE.cap} ${TEXT.faint}`}>
        <Link to="/pick" className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>참여</Link>
        <span aria-hidden="true"> › </span>우리 집 기억 밸런스
      </nav>
      <header className="mt-2">
        <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>우리 집 기억 밸런스</h2>
        <p className={`mt-1 max-w-[46rem] ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
          여덟 문항으로 댁에 남아 있는 기록의 유형을 짚고, 거기에 맞는 국가 기록 경로를 안내해 드립니다.
          {' '}정확하지 않아도 됩니다 — 점수를 매기지 않습니다.
        </p>
      </header>

      {/* ── 문항 ── */}
      {question && (
        <div className="mt-5">
          <p className={`${TYPE.sub} font-bold tabular-nums ${TEXT.blue}`} aria-live="polite">{qIdx + 1} / {BALANCE_QUESTIONS.length}</p>
          <p className={`mt-2 max-w-[46rem] text-[1.3125rem] font-bold leading-[1.6] ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            {question.q}
          </p>
          {question.hint && <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{question.hint}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([question.a, question.b] as const).map(o => (
              <button
                key={o.key}
                type="button"
                onClick={() => answer(o.key)}
                className={`min-h-[72px] rounded-md border bg-white p-4 text-left hover:border-[#1a4e9c] dark:bg-transparent ${SURFACE.line} ${FOCUS}`}
              >
                <span className={`block ${TYPE.body} font-semibold ${TEXT.ink} ${PROSE}`}>{o.label}</span>
              </button>
            ))}
          </div>
          <p className={`mt-2 ${TYPE.cap} ${TEXT.faint}`}>키보드 왼쪽·오른쪽 화살표로도 고르실 수 있습니다.</p>
        </div>
      )}

      {/* ── 고향 고르기 (선택) ── */}
      {homeStep && !done && (
        <div className="mt-5">
          <p className={`max-w-[46rem] text-[1.3125rem] font-bold leading-[1.6] ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            집안의 고향이 어디셨습니까?
          </p>
          <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>모르셔도 됩니다 — 고르지 않으면 지역 수치 없이 안내만 드립니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ITEMS.regionsOld.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setHome(r.id); setDone(true) }}
                className={`inline-flex min-h-[52px] items-center rounded-md border bg-white px-4 py-2 ${TYPE.sub} font-medium hover:border-[#1a4e9c] dark:bg-transparent ${SURFACE.line} ${TEXT.ink} ${FOCUS}`}
              >
                {r.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setHome('skip'); setDone(true) }}
              className={`inline-flex min-h-[52px] items-center rounded-md border bg-white px-4 py-2 ${TYPE.sub} font-medium hover:border-[#1a4e9c] dark:bg-transparent ${SURFACE.line} ${TEXT.soft} ${FOCUS}`}
            >
              모릅니다 · 답하지 않겠습니다
            </button>
          </div>
        </div>
      )}

      {/* ── 결과 ── */}
      {done && (
        <div className="mt-5 space-y-5">
          <section className={`${SURFACE.slab} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>답하신 내용에서 따라 나온 안내</p>
            <h3 className={`mt-1.5 ${TYPE.h2} ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
              {topTypes.length
                ? `댁의 기억은 ${topTypes.map(t => RECORD_TYPE_LABEL[t]).join('과 ')} 중심입니다`
                : '댁의 기억은 아직 이야기로만 남아 있습니다'}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {topTypes.map(t => (
                <li key={t} className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                  <span aria-hidden="true">▲</span> {RECORD_TYPE_NOTE[t]}
                </li>
              ))}
              {!topTypes.length && (
                <li className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                  <span aria-hidden="true">▲</span> {RECORD_TYPE_NOTE.oral}
                </li>
              )}
            </ul>
          </section>

          {/* 댁에 남아 있는 것 — 답 그대로 */}
          <section>
            <h4 className={`${TYPE.h3} ${TEXT.ink}`}>답하신 것과 그 뜻</h4>
            <ul className={`mt-2 max-w-[46rem] divide-y ${SURFACE.hair}`}>
              {chosen.map((o, i) => (
                <li key={i} className="py-2">
                  <p className={`${TYPE.sub} font-semibold ${TEXT.ink} ${PROSE}`}>{o.label}</p>
                  <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{o.memo}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* 경로 — paths.json 실측 */}
          {pathCards.length > 0 && (
            <section>
              <h4 className={`${TYPE.h3} ${TEXT.ink}`}>지금 열려 있는 국가 기록 경로</h4>
              <ul className="mt-2 grid gap-3 lg:grid-cols-2">
                {pathCards.map(p => (
                  <li key={p.id} className={`${SURFACE.card} p-4`}>
                    <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{p.title}</p>
                    <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{p.what}</p>
                    <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>주관 {p.org} · 문의 {p.contact}</p>
                    <p className="mt-2.5">
                      <a href={p.url} target="_blank" rel="noreferrer" className={BTN.primary}>
                        안내 페이지 열기 <span aria-hidden="true">↗</span>
                      </a>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 서비스 안 다음 걸음 */}
          {internals.length > 0 && (
            <div className="flex flex-wrap gap-2.5">
              {internals.map(l => (
                <Link key={l.href} to={l.href} className={BTN.ghost}>{l.label} <span aria-hidden="true">→</span></Link>
              ))}
            </div>
          )}

          {/* 고향을 골랐을 때만 — 통일부 실측 구획 */}
          {homeStat && stats && (
            <>
              <RegionStatBlock stat={homeStat} stats={stats} />
              <div className="flex flex-wrap gap-2.5">
                <Link to={`/?고향=${homeStat.id}`} className={BTN.primary}>
                  {homeStat.name} 지도로 가기 <span aria-hidden="true">→</span>
                </Link>
                <Link to={`/?고향=${homeStat.id}#memory-card`} className={BTN.ghost}>기억 카드 만들기</Link>
                {/* #g-museum — 지역 패널의 「그 고향에서 온 기록물」 구획. #museum-tour(전체 덱)로 보내면
                    다른 고향 사진부터 보게 되어 링크 문구가 거짓이 된다(실측 지적 2026-08-25). */}
                <Link to={`/?고향=${homeStat.id}#g-museum`} className={BTN.ghost}>그 고향에서 온 기록 보기</Link>
              </div>
            </>
          )}
          {home === 'skip' && (
            <p className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
              고향을 고르지 않으셨습니다 — 일곱 고향의 기록 현황은{' '}
              <Link to="/pick" className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>참여 첫 화면의 표</Link>에서 보실 수 있습니다.
            </p>
          )}

          <div className={`flex flex-wrap items-center gap-2.5 border-t pt-4 ${SURFACE.hair}`}>
            <PickShareCard model={shareModel} fileName="고향잇기_우리집기억밸런스.png" />
            <button type="button" onClick={restart} className={BTN.ghost}>처음부터 다시</button>
            <Link to="/pick" className={BTN.ghost}>다른 게임 고르기</Link>
          </div>
        </div>
      )}

      {/* 되돌리기 — 문항·고향 단계 공용 */}
      {!done && answers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button type="button" onClick={undo} className={BTN.ghost}><span aria-hidden="true">←</span> 한 문항 되돌리기</button>
          <button type="button" onClick={restart} className={BTN.ghost}>처음부터</button>
        </div>
      )}

      <p className={`mt-5 border-t pt-3 ${SURFACE.hair} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        답하신 내용은 저장되지 않습니다. 결과 확정 때 기록 유형과 (고르셨다면) 고향 이름만 익명으로 집계됩니다.
      </p>
    </div>
  )
}
