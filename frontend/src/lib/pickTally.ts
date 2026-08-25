/* ────────────────────────────────────────────────────────────────
   참여(/pick) 집계 — Supabase 직결, 실패는 조용히

   절대 규칙 (supabase/migrations/0013_pick_tally.sql 과 한 몸)
     · 보내는 것은 (게임, 고른 항목, 고향)뿐 — 나이·기기·IP·세션·식별자 없음.
     · 네트워크·DB 가 죽어도 게임은 정상 동작한다. 여기의 모든 실패는
       조용히 삼켜지고(콘솔 경고조차 없이), 화면은 통계 구획만 감춘다.
     · 표본이 20판 미만이면 null 을 돌려준다 — 백분율이 오해를 부르는 구간은
       아예 내보내지 않는다. 화면이 각자 문턱을 정하게 두지 않는다.
     · 연타 억제는 localStorage 표식(게임×날짜) — 이 기기 안에만 있고
       서버로 보내지 않으므로 개인 식별로 변질되지 않는다.
   ──────────────────────────────────────────────────────────────── */

import { supabase } from './supabase'

export type PickGame = 'food' | 'scene' | 'word' | 'balance'

export type TallyRow = { key: string; label: string; homeOld: string | null; n: number }
export type Tally = { total: number; rows: TallyRow[] }

/** 표본이 이보다 적으면 통계를 내보내지 않는다 */
export const MIN_SAMPLE = 20

const sentKey = (game: PickGame) => `pick_sent_${game}_${new Date().toISOString().slice(0, 10)}`

/** 결승 확정 순간 1회만 부른다. 실패해도 아무 일도 일어나지 않는다. */
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

/** 집계 뷰만 읽는다. 실패·표본 부족이면 null — 화면은 구획을 감춘다. */
export async function readTally(game: PickGame): Promise<Tally | null> {
  try {
    if (!supabase) return null
    const { data, error } = await supabase.from('pick_tally').select('winner_key,winner_label,home_old,n').eq('game', game)
    if (error || !Array.isArray(data) || !data.length) return null
    const rows: TallyRow[] = data
      .map(r => ({
        key: String(r.winner_key ?? ''),
        label: String(r.winner_label ?? ''),
        homeOld: r.home_old == null ? null : String(r.home_old),
        n: Number(r.n ?? 0),
      }))
      .filter(r => r.key && Number.isFinite(r.n) && r.n > 0)
      .sort((a, b) => b.n - a.n)
    const total = rows.reduce((s, r) => s + r.n, 0)
    if (total < MIN_SAMPLE) return null
    return { total, rows }
  } catch {
    return null
  }
}

/** 고향 축으로 접은 집계 — 「지금까지 가장 많이 뽑힌 고향」용 */
export function tallyByHome(t: Tally): Array<{ homeOld: string; n: number }> {
  const m = new Map<string, number>()
  for (const r of t.rows) if (r.homeOld) m.set(r.homeOld, (m.get(r.homeOld) ?? 0) + r.n)
  return [...m.entries()].map(([homeOld, n]) => ({ homeOld, n })).sort((a, b) => b.n - a.n)
}
