import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { SURFACE, TYPE, TEXT, PROSE, FOCUS, TAP, TAP_INLINE } from '../../theme/gohyang'
import { ITEMS, REGION_NAME } from '../../lib/pickData'
import { BALANCE_QUESTIONS, RECORD_TYPE_LABEL } from '../../data/pick-balance'
import {
  readAllTallies, readBalanceDetail, tallyByKey, tallyByHome, PCT_PLAIN_MIN,
  type PickGame, type AllTallies, type BalanceDetail, type Tally,
} from '../../lib/pickTally'

/* ────────────────────────────────────────────────────────────────
   실시간 실선택 순위덱 — 사이드바(4게임)와 결과 화면(그 게임 하나)의 공용 부품

   정직성 규약 (이 부품의 존재 이유 — 어기면 서비스 전체 신뢰가 무너진다)
     · 수치는 전부 Supabase 실집계다. 자리 채움·가짜 %·시연용 더미 없음.
     · % 는 단독으로 쓰지 않는다 — 항상 「N명 (x%)」 쌍. 게임 총판이
       PCT_PLAIN_MIN(20판) 미만이면 % 를 흐린 참고 표시로 낮춘다(인원수가 주인공).
     · 0판이면 순위 대신 「아직 참여 기록이 없습니다」를 그대로 적는다.
     · 머리에 「지금까지 N판 · HH:MM 불러옴」(as-of, 이 기기 시계) — 폴링은 없고
       화면 진입 1회 + 새로고침 단추뿐이다.
     · 읽기 실패({ ok: false })면 구획째 조용히 사라진다 — 게임은 그와 무관하게 돈다.
     · 막대 폭은 최댓값 대비 인원수 비례다(% 비례가 아님) — 소표본에서 막대가
       거짓 확신을 주지 않게 하고, 수치는 항상 글자로 함께 적는다.

   ★ Tournament 진행 중에는 이 덱을 렌더하지 않는다 — 남들의 선택이 보이면
     선택을 유도해 집계 자체를 오염시킨다. 허브와 결과 화면에서만 쓴다.
   ──────────────────────────────────────────────────────────────── */

const nf = (v: number) => (Number.isFinite(v) ? v.toLocaleString('ko-KR') : '—')
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const GAME_META: Record<PickGame, { label: string; to: string }> = {
  food: { label: '고향의 음식', to: '/pick/food' },
  scene: { label: '고향의 풍경', to: '/pick/scene' },
  word: { label: '북녘의 말', to: '/pick/word' },
  balance: { label: '우리 집 기억 밸런스', to: '/pick/balance' },
}

/* 표시명은 저장된 label 이 아니라 항목 자료(ITEMS)에서 key 로 역참조한다 —
   말은 「곽밥(도시락)」처럼 두 벌 표기, 절단·구버전 label 불일치를 막는다. 못 찾으면 저장 label 폴백. */
const KEY_LABEL: Map<string, string> = new Map([
  ...ITEMS.foods.map(f => [f.id, f.name] as const),
  ...ITEMS.sceneries.map(s => [s.id, s.name] as const),
  ...ITEMS.words.pairs.map(w => [w.id, `${w.nk}(${w.ko})`] as const),
  ...Object.entries(RECORD_TYPE_LABEL).map(([k, v]) => [`type-${k}`, v] as const),
  ['type-none', '유형 없음'] as const,
])

/** 게임의 전체 항목 키·이름 — 상세보기에서 0명 항목까지 정직하게 나열하기 위한 목록 */
function allKeysOf(game: PickGame): Array<{ key: string; label: string }> {
  if (game === 'food') return ITEMS.foods.map(f => ({ key: f.id, label: f.name }))
  if (game === 'scene') return ITEMS.sceneries.map(s => ({ key: s.id, label: s.name }))
  if (game === 'word') return ITEMS.words.pairs.map(w => ({ key: w.id, label: `${w.nk}(${w.ko})` }))
  return [
    ...Object.entries(RECORD_TYPE_LABEL).map(([k, v]) => ({ key: `type-${k}`, label: v })),
    { key: 'type-none', label: '유형 없음' },
  ]
}

/** 「N명 (x%)」 — % 는 항상 인원수 옆, 총판<20 이면 흐린 참고 표시(정직성 규약 2) */
function CountPct({ n, total }: { n: number; total: number }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0
  const plain = total >= PCT_PLAIN_MIN
  return (
    <span className="shrink-0 whitespace-nowrap tabular-nums">
      <b className={`${TYPE.sub} font-bold ${TEXT.ink}`}>{nf(n)}명</b>{' '}
      <span className={plain ? `${TYPE.sub} ${TEXT.soft}` : `${TYPE.cap} ${TEXT.faint}`}>({pct}%)</span>
    </span>
  )
}

/** 가로 막대 — 폭은 최댓값 대비 인원수 비례. 수치는 항상 글자로 병기하므로 장식이다 */
function Bar({ n, max }: { n: number; max: number }) {
  const w = max > 0 ? Math.max(2, Math.round((n / max) * 100)) : 0
  return (
    <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded bg-[#eaecef] dark:bg-[#252a31]">
      <span className="block h-full rounded bg-[#4b79bb] dark:bg-[#7aa9e8]" style={{ width: `${w}%` }} />
    </span>
  )
}

/* ══════════ 게임 한 블록 ══════════ */

function GameBlock({ game, tally, at, showEntryLink }: {
  game: PickGame
  tally: Tally | null          // null = 이 게임 0판
  at: Date
  showEntryLink: boolean
}) {
  const [open, setOpen] = useState(false)
  const [bal, setBal] = useState<BalanceDetail | null>(null)
  const detailId = useId()
  const meta = GAME_META[game]

  /* 밸런스 상세만 펼치는 순간 1회 lazy fetch — 접었다 펴도 재요청하지 않는다 */
  useEffect(() => {
    if (!open || game !== 'balance' || bal) return
    let alive = true
    void readBalanceDetail().then(d => { if (alive) setBal(d) })
    return () => { alive = false }
  }, [open, game, bal])

  const total = tally?.total ?? 0
  const byKey = tally ? tallyByKey(tally) : []
  const top = byKey.slice(0, 5)
  const max = top[0]?.n ?? 0

  return (
    <li>
      <p className={`${TYPE.cap} font-semibold ${TEXT.soft} ${PROSE}`}>
        {meta.label} — 지금까지 {nf(total)}판 · <span className="tabular-nums">{hhmm(at)}</span> 불러옴
      </p>

      {total === 0 ? (
        <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          아직 참여 기록이 없습니다 —{' '}
          {showEntryLink
            ? <Link to={meta.to} className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>첫 번째로 남겨 보세요</Link>
            : '첫 번째로 남겨 보세요'}
        </p>
      ) : (
        <>
          <ol className="mt-1.5 space-y-1.5">
            {top.map((r, i) => (
              <li key={r.key}>
                <span className={`flex items-baseline justify-between gap-2 ${TYPE.cap} ${TEXT.soft}`}>
                  <span className={`${PROSE} min-w-0`}>{i + 1}. {KEY_LABEL.get(r.key) ?? r.label}</span>
                  <CountPct n={r.n} total={total} />
                </span>
                <Bar n={r.n} max={max} />
              </li>
            ))}
          </ol>

          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen(o => !o)}
            className={`mt-1 inline-flex ${TAP} items-center gap-1 ${TYPE.cap} font-semibold ${TEXT.blue} underline underline-offset-2 ${FOCUS}`}
          >
            {open ? '접기' : '전체 순위 상세보기'} <span aria-hidden="true">{open ? '▲' : '▼'}</span>
          </button>

          {open && (
            <div id={detailId} className={`mt-1 rounded ${SURFACE.inset} p-2.5`}>
              {game !== 'balance'
                ? <FullRanking game={game} byKey={byKey} total={total} />
                : <BalanceDetailView bal={bal} />}
            </div>
          )}
        </>
      )}
    </li>
  )
}

/** 월드컵 상세 — 전체 항목 순위·인원·%. 0명 항목도 숨기지 않고 말미에 묶어 적는다 */
function FullRanking({ game, byKey, total }: {
  game: PickGame
  byKey: Array<{ key: string; label: string; n: number }>
  total: number
}) {
  const picked = new Set(byKey.map(r => r.key))
  const zero = allKeysOf(game).filter(x => !picked.has(x.key))
  const max = byKey[0]?.n ?? 0
  return (
    <>
      <ol className="space-y-1.5">
        {byKey.map((r, i) => (
          <li key={r.key}>
            <span className={`flex items-baseline justify-between gap-2 ${TYPE.cap} ${TEXT.soft}`}>
              <span className={`${PROSE} min-w-0`}>{i + 1}. {KEY_LABEL.get(r.key) ?? r.label}</span>
              <CountPct n={r.n} total={total} />
            </span>
            <Bar n={r.n} max={max} />
          </li>
        ))}
      </ol>
      {zero.length > 0 && (
        <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          아직 뽑히지 않음 — {zero.map(z => z.label).join(' · ')}
        </p>
      )}
    </>
  )
}

/** 밸런스 상세 — 문항마다 가/나 분할 막대. 분모는 그 문항의 응답 수 */
function BalanceDetailView({ bal }: { bal: BalanceDetail | null }) {
  if (!bal) return <p className={`${TYPE.cap} ${TEXT.faint}`}>불러오는 중…</p>
  if (!bal.ok) return <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>문항별 집계를 불러오지 못했습니다.</p>
  const byQ = new Map(bal.rows.map(r => [r.qId, r]))
  return (
    <ul className="space-y-2.5">
      {BALANCE_QUESTIONS.map(q => {
        const r = byQ.get(q.id)
        const a = r?.a ?? 0
        const b = r?.b ?? 0
        const sum = a + b
        const pa = sum > 0 ? Math.round((a / sum) * 100) : 0
        const plain = sum >= PCT_PLAIN_MIN
        const pctCls = plain ? TEXT.soft : TEXT.faint
        return (
          <li key={q.id}>
            <p className={`${TYPE.cap} font-semibold ${TEXT.soft} ${PROSE}`}>{q.q}</p>
            {sum === 0 ? (
              <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint}`}>아직 응답 기록이 없습니다.</p>
            ) : (
              <>
                <span aria-hidden="true" className="mt-1 flex h-1.5 w-full overflow-hidden rounded bg-[#eaecef] dark:bg-[#252a31]">
                  <span className="block h-full bg-[#4b79bb] dark:bg-[#7aa9e8]" style={{ width: `${pa}%` }} />
                </span>
                <p className={`mt-0.5 flex flex-wrap justify-between gap-x-3 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                  <span>가: {q.a.label} — <b className={`font-bold ${TEXT.ink}`}>{nf(a)}명</b> <span className={pctCls}>({pa}%)</span></span>
                  <span>나: {q.b.label} — <b className={`font-bold ${TEXT.ink}`}>{nf(b)}명</b> <span className={pctCls}>({sum > 0 ? 100 - pa : 0}%)</span></span>
                </p>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ══════════ 덱 전체 ══════════ */

export default function TallyDeck({ games, variant }: {
  games: PickGame[]
  /** sidebar = 허브 사이드바(4게임 + 고향 꼬리) · result = 결과 화면(그 게임 하나) */
  variant: 'sidebar' | 'result'
}) {
  const [all, setAll] = useState<AllTallies | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    /* 결과 화면은 자기 판의 INSERT 직후에 마운트된다 — 반영된 값을 보도록 한 박자 늦춘다.
       그래도 경합은 남을 수 있고, 그때는 「새로고침」 단추가 길이다. */
    const t = setTimeout(() => {
      void readAllTallies().then(r => { if (alive) setAll(r) })
    }, variant === 'result' ? 900 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [variant])

  async function refresh() {
    setBusy(true)
    try {
      const r = await readAllTallies(true)
      setAll(r)
    } finally {
      setBusy(false)
    }
  }

  /* 읽기 실패·로딩 중 — 구획째 없음(조용히). 게임·화면은 이와 무관하게 정상이다 */
  if (!all || !all.ok) return null

  const homeFold = (() => {
    if (variant !== 'sidebar') return []
    const m = new Map<string, number>()
    for (const g of ['food', 'scene'] as PickGame[]) {
      const t = all.byGame.get(g)
      if (t) for (const h of tallyByHome(t)) m.set(h.homeOld, (m.get(h.homeOld) ?? 0) + h.n)
    }
    return [...m.entries()].map(([homeOld, n]) => ({ homeOld, n })).sort((a, b) => b.n - a.n)
  })()

  return (
    <section className={`${SURFACE.card} p-4`} data-tally-deck>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>이 화면의 익명 집계 · 통일부 자료 아님</p>
          <h3 className={`mt-1 ${TYPE.h3} ${TEXT.ink}`}>실시간 실선택 순위</h3>
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

      <ul className="mt-2.5 space-y-3.5">
        {games.map(g => (
          <GameBlock key={g} game={g} tally={all.byGame.get(g) ?? null} at={all.at} showEntryLink={variant === 'sidebar'} />
        ))}
      </ul>

      {homeFold.length > 0 && (
        <p className={`mt-3 border-t pt-2 ${SURFACE.hair} ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          가장 많이 뽑힌 고향 — {REGION_NAME.get(homeFold[0].homeOld) ?? homeFold[0].homeOld}{' '}
          <b className={`font-bold ${TEXT.ink}`}>{nf(homeFold[0].n)}판</b>
          <span className={TEXT.faint}> (음식·풍경 우승 항목의 고향 합산)</span>
        </p>
      )}

      <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        이 서비스 안에서 익명으로 모인 선택이며, 같은 기기의 하루 여러 판은 한 번만 셉니다.
        {' '}게임 종류·고른 항목·고향 이름(밸런스는 문항별 가·나 포함) 외에는 아무것도 저장하지 않습니다.
      </p>
    </section>
  )
}
