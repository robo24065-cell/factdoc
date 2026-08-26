import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BTN, SURFACE, TYPE, TEXT, PROSE, FOCUS, TAP_INLINE } from '../../theme/gohyang'
import ItemCard, { itemKey, itemName, itemRegionId, type CardItem } from '../../components/pick/ItemCard'
import PickResult from './PickResult'
import { ITEMS, shuffle, rememberLastHome } from '../../lib/pickData'
import { recordPick, type PickGame } from '../../lib/pickTally'
import { updateBukbtiLetter } from '../../lib/bukbti'
import { prefersReduced } from '../../components/gohyang/motion'

/* ────────────────────────────────────────────────────────────────
   월드컵 공통 엔진 — 음식·풍경·말 (16강 → 8강 → 4강 → 결승, 15번 선택)

   · 카드 전체가 선택 단추다(48px 규약은 카드 크기로 당연 충족).
   · 키보드 ← → 로도 고른다. Tab+Enter 는 카드가 button 이라 공짜다.
   · 「한 판 되돌리기」 — 스택 전체를 보관해 끝까지 되돌릴 수 있다.
   · 진행 상태는 메모리뿐 — 저장하지 않는다. 떠나면 그냥 버려진다.
   · 모션은 prefers-reduced-motion 이면 전부 끈다. 켜져 있어도 불투명도 한 겹뿐.
   · 집계는 결승 확정 순간 1회 — 실패해도 조용히 넘어가고 게임은 그대로 끝난다.
   · ★ 진행 중에는 실선택 순위덱(TallyDeck)을 보여주지 않는다 — 남들의 선택이
     보이면 선택을 유도해 집계 자체를 오염시킨다. 덱은 허브 사이드바와
     결과 화면(PickResult)에만 있다. 이 화면에 덱을 추가하지 마라.
   ──────────────────────────────────────────────────────────────── */

const GAME_DEF: Record<Exclude<PickGame, 'balance'>, { title: string; ask: string; notice: string }> = {
  food: {
    title: '고향의 음식 월드컵',
    ask: '어느 쪽이 더 마음에 남으십니까?',
    notice: '음식의 지역 구분은 향토음식 문헌의 통설이며 통일부 공표 자료가 아닙니다. 결과 화면의 지역 수치는 전부 통일부 공공데이터이고, 참여 집계는 이 서비스 안의 익명 집계로 따로 표시합니다.',
  },
  scene: {
    title: '고향의 풍경 월드컵',
    ask: '어느 풍경이 더 마음에 남으십니까?',
    notice: '사진은 통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재분이며 저작권은 각 제공처에 있습니다. 지역 구분은 광복 당시 행정구역으로 옮긴 근사입니다.',
  },
  word: {
    title: '북녘의 말 월드컵',
    ask: '어느 말이 더 마음에 남으십니까?',
    notice: '통일부 공공데이터 「남북한 언어비교」의 문화어-표준어 대응입니다. 지역 사투리가 아니라 남북 표준어의 차이입니다.',
  },
}

function roundName(n: number): string {
  return n === 16 ? '16강' : n === 8 ? '8강' : n === 4 ? '4강' : '결승'
}

function buildDeck(game: Exclude<PickGame, 'balance'>): CardItem[] {
  if (game === 'food') return shuffle(ITEMS.foods).map(f => ({ game: 'food', food: f }))
  if (game === 'scene') return shuffle(ITEMS.sceneries).map(s => ({ game: 'scene', scene: s }))
  return shuffle(ITEMS.words.pairs).map(w => ({ game: 'word', word: w }))
}

type Snap = { round: CardItem[]; next: CardItem[]; idx: number }

export default function Tournament() {
  const { game } = useParams()
  const g = (game === 'food' || game === 'scene' || game === 'word' ? game : null) as Exclude<PickGame, 'balance'> | null

  const [round, setRound] = useState<CardItem[]>([])
  const [next, setNext] = useState<CardItem[]>([])
  const [idx, setIdx] = useState(0)
  const [history, setHistory] = useState<Snap[]>([])
  const [winner, setWinner] = useState<CardItem | null>(null)
  const sent = useRef(false)
  /* ★ 멱등 가드 — 같은 짝(라운드 크기:짝 위치)에 두 번 반응하지 않는다.
     키보드 자동반복·빠른 연타로 렌더 사이에 이벤트가 몰리면 choose 가 stale 한
     round/idx 로 여러 번 돌아 history 에 중복 스냅샷이 쌓였다(실측: 15판이 51판으로).
     라운드가 줄고 idx 가 바뀌면 키가 자연히 달라지고, 되돌리기·처음부터는 비운다. */
  const acted = useRef('')
  const reduced = useMemo(() => prefersReduced(), [])

  const restart = useMemo(() => () => {
    if (!g) return
    setRound(buildDeck(g))
    setNext([])
    setIdx(0)
    setHistory([])
    setWinner(null)
    sent.current = false
    acted.current = ''
  }, [g])

  useEffect(() => { restart() }, [restart])

  const pair: [CardItem, CardItem] | null =
    !winner && round.length >= idx + 2 ? [round[idx], round[idx + 1]] : null

  function choose(pick: CardItem) {
    if (!pair || winner) return
    const k = `${round.length}:${idx}`
    if (acted.current === k) return
    acted.current = k
    setHistory(h => [...h, { round, next, idx }])
    const grown = [...next, pick]
    if (idx + 2 >= round.length) {
      if (grown.length === 1) {
        setWinner(pick)
        return
      }
      setRound(grown)
      setNext([])
      setIdx(0)
    } else {
      setNext(grown)
      setIdx(idx + 2)
    }
  }

  function undo() {
    setWinner(null)
    sent.current = false
    acted.current = ''
    setHistory(h => {
      const last = h[h.length - 1]
      if (!last) return h
      setRound(last.round)
      setNext(last.next)
      setIdx(last.idx)
      return h.slice(0, -1)
    })
  }

  /* 키보드 — ← 왼쪽 카드, → 오른쪽 카드 */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!pair) return
      if (e.repeat) return   /* 화살표를 누르고 있으면 자동반복이 몰려온다 — 첫 눌림만 받는다 */
      if (e.key === 'ArrowLeft') { e.preventDefault(); choose(pair[0]) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); choose(pair[1]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* 결승 확정 — 집계 1회(실패 무해) + 직전 고향 표식(이 기기 안에만) */
  useEffect(() => {
    if (!winner || !g || sent.current) return
    sent.current = true
    const regionId = itemRegionId(winner)
    rememberLastHome(regionId)
    void recordPick(g, itemKey(winner), itemName(winner), regionId)
    /* 북BTI — 마지막 판 기준으로 글자를 덮어쓴다(기기 안 localStorage, 일일 집계 표식과 무관) */
    updateBukbtiLetter(g, itemKey(winner))
  }, [winner, g])

  if (!g) return <Navigate to="/pick" replace />
  const def = GAME_DEF[g]

  if (winner) {
    return (
      <div className="mx-auto max-w-5xl">
        <PickResult game={g} item={winner} onRestart={restart} />
      </div>
    )
  }

  const done = history.length
  const totalPairs = round.length / 2
  const pairNo = idx / 2 + 1

  return (
    <div className="mx-auto max-w-5xl">
      <nav aria-label="현재 위치" className={`${TYPE.cap} ${TEXT.faint}`}>
        <Link to="/pick" className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>참여</Link>
        <span aria-hidden="true"> › </span>{def.title}
      </nav>
      <header className="mt-2">
        <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>{def.title}</h2>
        <p className={`mt-1 max-w-[46rem] ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{def.notice}</p>
      </header>

      {/* 진행 표시 — 라운드명 + 판 수 + 얇은 막대(전체 15번 기준) */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className={`${TYPE.sub} font-bold tabular-nums ${TEXT.blue}`} aria-live="polite">
          {roundName(round.length)} · {pairNo} / {totalPairs}
        </p>
        <div className="h-1 w-40 overflow-hidden rounded bg-[#eaecef] dark:bg-[#252a31]" role="presentation">
          <div className="h-full bg-[#1a4e9c] dark:bg-[#7aa9e8]" style={{ width: `${Math.min(100, (done / 15) * 100)}%` }} />
        </div>
        <span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>모두 15번 고릅니다 · {done}번 골랐습니다</span>
      </div>

      <p className={`mt-4 ${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{def.ask}</p>
      <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint}`}>키보드 왼쪽·오른쪽 화살표로도 고르실 수 있습니다.</p>

      {pair && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {pair.map((it, i) => (
            <button
              key={itemKey(it)}
              type="button"
              onClick={() => choose(it)}
              aria-label={`${i === 0 ? '왼쪽' : '오른쪽'} — ${itemName(it)} 고르기`}
              className={`min-h-[48px] rounded-md text-left ${FOCUS} ${
                reduced ? '' : 'transition-opacity duration-150 hover:opacity-95'
              }`}
            >
              <ItemCard item={it} />
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={undo} disabled={!history.length} className={`${BTN.ghost} disabled:opacity-50`}>
          <span aria-hidden="true">←</span> 한 판 되돌리기
        </button>
        <button type="button" onClick={restart} className={BTN.ghost}>
          처음부터
        </button>
      </div>

      <p className={`mt-5 border-t pt-3 ${SURFACE.hair} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        진행 상태는 이 화면의 메모리에만 있으며 저장되지 않습니다. 결승까지 마치면 게임 종류·고른 항목·고향 이름만 익명으로 집계됩니다
        (나이·기기·위치는 묻지도 저장하지도 않습니다).
      </p>
    </div>
  )
}
