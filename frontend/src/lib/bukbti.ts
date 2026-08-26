/* ────────────────────────────────────────────────────────────────
   북BTI 진행·기록 — localStorage(기기 안) + Supabase(유형 4글자만)

   절대 규칙 (supabase/migrations/0015 와 한 몸)
     · 기기 밖으로 나가는 것은 완성 유형 코드 4글자뿐이다.
       진행 상태(bukbti_v1)·일일 표식은 localStorage 에만 있고 서버로 가지 않는다.
       나이·기기·고향·게임별 우승 항목조차 저장하지 않는다.
     · 「마지막으로 한 판 기준」 — 글자는 항상 덮어쓴다. 일일 집계 표식
       (pick_sent_*)과 무관하다(그건 pick_event 서버 집계의 게이트일 뿐).
     · 재기록 연타 방지 2겹(전부 기기 안 표식):
       ① recorded === code (유형 불변이면 안 보냄)
       ② 같은 날 같은 유형 표식(bukbti_sent_코드_날짜) — A→B→A 순환 연타 차단
     · 네트워크·DB 가 죽어도 놀이는 정상이다. 기록 실패는 조용히,
       집계 읽기 실패는 { ok: false } — 화면은 통계 구획만 감춘다.
   ──────────────────────────────────────────────────────────────── */

import { supabase } from './supabase'
import { BUKBTI_AXES, BUKBTI_TAG, BUKBTI_TYPE_OF, type BukbtiGame, type BukbtiLetter } from '../data/bukbti'

export type BukbtiLetters = Partial<Record<BukbtiGame, BukbtiLetter>>
export type BukbtiState = { letters: BukbtiLetters; recorded: string | null }

const KEY = 'bukbti_v1'
/** 진행판·조각이 같은 화면 안에서 함께 갱신되게 하는 신호 — 기기 안 이벤트일 뿐이다 */
export const BUKBTI_EVENT = 'bukbti-change'

const EMPTY: BukbtiState = { letters: {}, recorded: null }

export function readBukbti(): BukbtiState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY, letters: {} }
    const j = JSON.parse(raw) as BukbtiState
    const letters: BukbtiLetters = {}
    for (const ax of BUKBTI_AXES) {
      const v = j?.letters?.[ax.game]
      if (v === ax.a.letter || v === ax.b.letter) letters[ax.game] = v
    }
    const recorded = typeof j?.recorded === 'string' && BUKBTI_TYPE_OF.has(j.recorded) ? j.recorded : null
    return { letters, recorded }
  } catch {
    return { ...EMPTY, letters: {} }
  }
}

function writeState(s: BukbtiState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* 사생활 모드 — 진행이 안 남을 뿐 놀이는 정상 */ }
  try { window.dispatchEvent(new CustomEvent(BUKBTI_EVENT)) } catch { /* 무해 */ }
}

/** 완성 코드 — 축 순서 고정(음식→풍경→말→밸런스). 4글자가 다 있어야 코드가 선다 */
export function bukbtiCode(letters: BukbtiLetters): string | null {
  const parts = BUKBTI_AXES.map(ax => letters[ax.game])
  if (parts.some(p => !p)) return null
  return parts.join('')
}

/** 채워진 글자 수 — 진행 「2/4」 표기용 */
export function bukbtiFilled(letters: BukbtiLetters): number {
  return BUKBTI_AXES.filter(ax => letters[ax.game]).length
}

/** 남은 게임 축 — 「남은 게임: 북녘의 말」 안내용 */
export function bukbtiRemaining(letters: BukbtiLetters) {
  return BUKBTI_AXES.filter(ax => !letters[ax.game])
}

/* ══════════ 글자 쓰기 — 게임 결과 확정 지점에서 1줄 호출 ══════════ */

/** 결과 key(우승 항목 id · 밸런스 type-*)를 글자로 접어 **항상 덮어쓴다**.
 *  태그에 없는 key 면 조용히 아무것도 하지 않는다(놀이는 그와 무관).
 *  4글자가 완성되거나 완성 후 글자가 바뀌면 유형 기록(maybeRecordBukbti)을 시도한다. */
export function updateBukbtiLetter(game: BukbtiGame, resultKey: string): void {
  const tag = BUKBTI_TAG[resultKey]
  if (!tag) return
  const s = readBukbti()
  s.letters[game] = tag
  writeState(s)
  const code = bukbtiCode(s.letters)
  if (code) void maybeRecordBukbti(code)
}

/* ══════════ 유형 기록 — bukbti_event INSERT 1행(유형 4글자뿐) ══════════ */

const sentKey = (code: string) => `bukbti_sent_${code}_${new Date().toISOString().slice(0, 10)}`

export async function maybeRecordBukbti(code: string): Promise<void> {
  try {
    if (!supabase || !BUKBTI_TYPE_OF.has(code)) return
    const s = readBukbti()
    if (s.recorded === code) return                                  // ① 유형 불변
    try { if (localStorage.getItem(sentKey(code))) return } catch { /* 사생활 모드 — 표식 없이 진행 */ }
    const { error } = await supabase.from('bukbti_event').insert({ type_code: code })
    if (!error) {
      const cur = readBukbti()
      cur.recorded = code
      writeState(cur)
      try { localStorage.setItem(sentKey(code), '1') } catch { /* 무해 */ }
    }
  } catch { /* 집계는 이 놀이의 필수 의존이 아니다 */ }
}

/* ══════════ 집계 읽기 — bukbti_tally 뷰만, 짧은 캐시(pickTally 관용) ══════════ */

export type BukbtiTally =
  | { ok: true; at: Date; total: number; byCode: Map<string, number> }
  | { ok: false }

let cache: { at: number; p: Promise<BukbtiTally> } | null = null
const CACHE_MS = 3000

export function readBukbtiTally(force = false): Promise<BukbtiTally> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.p
  const p = fetchTally()
  cache = { at: Date.now(), p }
  return p
}

async function fetchTally(): Promise<BukbtiTally> {
  try {
    if (!supabase) return { ok: false }
    const { data, error } = await supabase.from('bukbti_tally').select('type_code,n')
    if (error || !Array.isArray(data)) return { ok: false }
    const byCode = new Map<string, number>()
    let total = 0
    for (const r of data) {
      const code = String(r.type_code ?? '')
      const n = Number(r.n ?? 0)
      if (!BUKBTI_TYPE_OF.has(code) || !Number.isFinite(n) || n <= 0) continue
      byCode.set(code, (byCode.get(code) ?? 0) + n)
      total += n
    }
    return { ok: true, at: new Date(), total, byCode }
  } catch {
    return { ok: false }
  }
}
