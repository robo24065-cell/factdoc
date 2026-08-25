/* ────────────────────────────────────────────────────────────────
   참여(/pick) 집계 — Supabase 직결, 실패는 조용히

   절대 규칙 (supabase/migrations/0013·0014 와 한 몸)
     · 보내는 것은 (게임, 고른 항목, 고향) + 밸런스 문항의 (문항 id, 가/나)뿐 —
       나이·기기·IP·세션·식별자 없음. 판 연결키도 없다(8행이 한 사람 것임을
       서버가 재구성할 수 없게 하는 것이 설계다).
     · 네트워크·DB 가 죽어도 게임은 정상 동작한다. 읽기 실패는 { ok: false } 로
       구분해 돌려주고, 화면은 집계 구획만 조용히 감춘다.
     · ★ 정직성 규약(2026-08-26 개정): 표본이 적다고 통계를 감추지 않는다.
       0판이면 「아직 참여 기록이 없습니다」를 그대로 보여 주는 것이 정직이다.
       대신 백분율은 항상 인원수 옆에만 붙이고, 표본이 PCT_PLAIN_MIN(20판) 미만이면
       화면이 % 를 흐리게 참고 표시로 낮춘다 — 문턱의 의미가 「차단」에서
       「표시 강조」로 바뀌었다. { ok: false }(읽기 실패)와 0행(참여 없음)을
       반드시 구분한다 — 둘을 섞으면 「없음」과 「모름」이 섞인다.
     · 연타 억제는 localStorage 표식(게임×날짜) — 이 기기 안에만 있고
       서버로 보내지 않으므로 개인 식별로 변질되지 않는다.
       이 표식의 존재는 순위덱 꼬리에 정직하게 고지한다.
   ──────────────────────────────────────────────────────────────── */

import { supabase } from './supabase'

export type PickGame = 'food' | 'scene' | 'word' | 'balance'

export type TallyRow = { key: string; label: string; homeOld: string | null; n: number }
export type Tally = { total: number; rows: TallyRow[] }

/** 이 판수(게임 총판) 이상이어야 % 를 본문 크기로 보여 준다.
 *  미만이면 화면이 % 를 흐린 참고 표시로 낮춘다 — 차단 문턱이 아니다(구 MIN_SAMPLE 대체). */
export const PCT_PLAIN_MIN = 20

export type AllTallies =
  | { ok: true; at: Date; byGame: Map<PickGame, Tally> }
  | { ok: false }

export type BalanceDetail =
  | { ok: true; at: Date; rows: Array<{ qId: string; a: number; b: number }> }
  | { ok: false }

const sentKey = (game: PickGame) => `pick_sent_${game}_${new Date().toISOString().slice(0, 10)}`

/* ══════════ 쓰기 ══════════ */

/** 월드컵 결승 확정 순간 1회만 부른다. 실패해도 아무 일도 일어나지 않는다. */
export async function recordPick(game: PickGame, winnerKey: string, winnerLabel: string, homeOld?: string | null): Promise<void> {
  try {
    if (!supabase) return
    const k = sentKey(game)
    try { if (localStorage.getItem(k)) return } catch { /* 사생활 모드 — 표식 없이 진행 */ }
    const { error } = await supabase.from('pick_event').insert({
      game,
      winner_key: winnerKey.slice(0, 64),
      winner_label: winnerLabel.slice(0, 40),
      home_old: homeOld ?? null,
    })
    if (!error) { try { localStorage.setItem(k, '1') } catch { /* 무해 */ } }
  } catch { /* 집계는 이 화면의 필수 의존이 아니다 */ }
}

/** 밸런스 결과 확정 1회 — 판 요약 1행(pick_event) + 문항별 8행(pick_balance_answer).
 *  두 insert 가 같은 일일 표식(pick_sent_balance_날짜)을 공유한다 — 표식이 있으면 둘 다 보내지 않는다. */
export async function recordBalanceRun(
  answers: ReadonlyArray<{ qId: string; choice: 'a' | 'b' }>,
  topKey: string,
  topLabel: string,
  homeOld?: string | null,
): Promise<void> {
  try {
    if (!supabase) return
    const k = sentKey('balance')
    try { if (localStorage.getItem(k)) return } catch { /* 사생활 모드 — 표식 없이 진행 */ }
    const [ev, ans] = await Promise.all([
      supabase.from('pick_event').insert({
        game: 'balance',
        winner_key: topKey.slice(0, 64),
        winner_label: topLabel.slice(0, 40),
        home_old: homeOld ?? null,
      }),
      supabase.from('pick_balance_answer').insert(
        answers.map(a => ({ q_id: a.qId, choice: a.choice })),   // 배열 insert = 요청 1건
      ),
    ])
    if (!ev.error || !ans.error) { try { localStorage.setItem(k, '1') } catch { /* 무해 */ } }
  } catch { /* 집계는 이 화면의 필수 의존이 아니다 */ }
}

/* ══════════ 읽기 — 집계 뷰만, 무필터 1회씩 ══════════ */

/* 같은 화면에서 덱·결과가 겹쳐 불러도 요청이 1건이 되게 하는 짧은 캐시(3초).
   「새로고침」 단추는 force 로 캐시를 지나친다. 폴링은 하지 않는다. */
let allCache: { at: number; p: Promise<AllTallies> } | null = null
let balCache: { at: number; p: Promise<BalanceDetail> } | null = null
const CACHE_MS = 3000

/** 네 게임 전체 집계 — pick_tally 무필터 1회(행 상한 ~수백).
 *  { ok: false } = 읽기 실패(구획 숨김) · byGame 에 없는 게임 = 0판(빈 상태 문구). */
export function readAllTallies(force = false): Promise<AllTallies> {
  if (!force && allCache && Date.now() - allCache.at < CACHE_MS) return allCache.p
  const p = fetchAllTallies()
  allCache = { at: Date.now(), p }
  return p
}

async function fetchAllTallies(): Promise<AllTallies> {
  try {
    if (!supabase) return { ok: false }
    const { data, error } = await supabase.from('pick_tally').select('game,home_old,winner_key,winner_label,n')
    if (error || !Array.isArray(data)) return { ok: false }
    const byGame = new Map<PickGame, Tally>()
    for (const r of data) {
      const game = String(r.game ?? '') as PickGame
      if (!['food', 'scene', 'word', 'balance'].includes(game)) continue
      const row: TallyRow = {
        key: String(r.winner_key ?? ''),
        label: String(r.winner_label ?? ''),
        homeOld: r.home_old == null ? null : String(r.home_old),
        n: Number(r.n ?? 0),
      }
      if (!row.key || !Number.isFinite(row.n) || row.n <= 0) continue
      const t = byGame.get(game) ?? { total: 0, rows: [] }
      t.rows.push(row)
      t.total += row.n
      byGame.set(game, t)
    }
    for (const t of byGame.values()) t.rows.sort((a, b) => b.n - a.n)
    return { ok: true, at: new Date(), byGame }
  } catch {
    return { ok: false }
  }
}

/** 밸런스 문항별 집계 — pick_balance_tally 1회. 상세보기를 펼칠 때만 부른다(lazy). */
export function readBalanceDetail(force = false): Promise<BalanceDetail> {
  if (!force && balCache && Date.now() - balCache.at < CACHE_MS) return balCache.p
  const p = fetchBalanceDetail()
  balCache = { at: Date.now(), p }
  return p
}

async function fetchBalanceDetail(): Promise<BalanceDetail> {
  try {
    if (!supabase) return { ok: false }
    const { data, error } = await supabase.from('pick_balance_tally').select('q_id,choice,n')
    if (error || !Array.isArray(data)) return { ok: false }
    const m = new Map<string, { qId: string; a: number; b: number }>()
    for (const r of data) {
      const qId = String(r.q_id ?? '')
      const choice = String(r.choice ?? '')
      const n = Number(r.n ?? 0)
      if (!qId || !Number.isFinite(n) || n <= 0 || (choice !== 'a' && choice !== 'b')) continue
      const row = m.get(qId) ?? { qId, a: 0, b: 0 }
      row[choice] += n
      m.set(qId, row)
    }
    return { ok: true, at: new Date(), rows: [...m.values()] }
  } catch {
    return { ok: false }
  }
}

/* ══════════ 접기 유틸 ══════════ */

/** 항목 축으로 접은 집계 — 순위덱용. home_old 축을 합산해 (항목, 인원)으로 만든다 */
export function tallyByKey(t: Tally): Array<{ key: string; label: string; n: number }> {
  const m = new Map<string, { key: string; label: string; n: number }>()
  for (const r of t.rows) {
    const cur = m.get(r.key) ?? { key: r.key, label: r.label, n: 0 }
    cur.n += r.n
    m.set(r.key, cur)
  }
  /* 동률은 n 내림차순 뒤 가나다 — 순서가 요청마다 흔들리지 않게 */
  return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'ko'))
}

/** 고향 축으로 접은 집계 — 「가장 많이 뽑힌 고향」용 */
export function tallyByHome(t: Tally): Array<{ homeOld: string; n: number }> {
  const m = new Map<string, number>()
  for (const r of t.rows) if (r.homeOld) m.set(r.homeOld, (m.get(r.homeOld) ?? 0) + r.n)
  return [...m.entries()].map(([homeOld, n]) => ({ homeOld, n })).sort((a, b) => b.n - a.n)
}
