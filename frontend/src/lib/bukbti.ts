/* ────────────────────────────────────────────────────────────────
   북BTI 진행·기록 — localStorage(기기 안) + Supabase(유형 4글자만)

   절대 규칙 (supabase/migrations/0015 와 한 몸)
     · 기기 밖으로 나가는 것은 완성 유형 코드 4글자뿐이다.
       진행 상태(bukbti_v1)·일일 표식·축별 비율(axes)은 localStorage 에만 있고
       서버로 가지 않는다. 나이·기기·고향·게임별 우승 항목은 저장하지 않는다
       (비율은 횟수 두 개와 글자 하나뿐 — 항목 이름·id 를 남기지 않는다).
     · 「마지막으로 한 판 기준」 — 글자는 항상 덮어쓴다. 일일 집계 표식
       (pick_sent_*)과 무관하다(그건 pick_event 서버 집계의 게이트일 뿐).
     · ★ 축별 비율 — 「대비 매치」(두 항목의 태그가 서로 다른 대결)만 분모다.
       같은 편끼리 붙은 대결은 무엇을 골라도 같은 글자라 취향을 말해 주지 않는다.
       비율을 못 내는 경로로 글자를 쓸 때는 그 축의 비율을 반드시 지운다 —
       안 지우면 「국 73%인데 글자는 찬」이라는 거짓 화면이 만들어진다.
     · 재기록 연타 방지 2겹(전부 기기 안 표식):
       ① recorded === code (유형 불변이면 안 보냄)
       ② 같은 날 같은 유형 표식(bukbti_sent_코드_날짜) — A→B→A 순환 연타 차단
     · 네트워크·DB 가 죽어도 놀이는 정상이다. 기록 실패는 조용히,
       집계 읽기 실패는 { ok: false } — 화면은 통계 구획만 감춘다.
   ──────────────────────────────────────────────────────────────── */

import { supabase } from './supabase'
import { countContrast, decideLetter, ratioPct } from './bukbti-ratio.mjs'
import { BUKBTI_AXES, BUKBTI_AXIS_OF, BUKBTI_TAG, BUKBTI_TYPE_OF, type BukbtiGame, type BukbtiLetter } from '../data/bukbti'

export type BukbtiLetters = Partial<Record<BukbtiGame, BukbtiLetter>>

/** 한 축의 비율 — 기기 안에만 남는다(서버로 보내지 않는다).
 *  a     = 대비 매치에서 축의 a글자 쪽을 고른 횟수(분자)
 *  d     = 대비 매치 총 횟수(분모) — 15가 아니다. 실측 분포는 네 번에서 열한 번이
 *          98.4%(중앙 여섯)이고, 한쪽을 꾸준히 고르실수록 적어진다.
 *          ★ 이 숫자를 고칠 때는 data/bukbti.ts 의 BUKBTI_RATIO_SMALL_N 도 함께 고친다 —
 *            둘이 어긋나면 다음 사람이 옛 숫자를 되살린다
 *  total = 그 판에서 고른 전체 횟수(월드컵 15)
 *  src   = ratio 비율로 정함 · final 정확히 반반이라 결승 선택으로 정함 · none 대비 매치 0회
 *  ft    = 결승에서 고르신 항목의 글자(항목 id·이름은 남기지 않는다) */
export type BukbtiAxisStat = {
  a: number
  d: number
  total: number
  src: 'ratio' | 'final' | 'none'
  ft?: BukbtiLetter
  at: number
}
export type BukbtiAxes = Partial<Record<BukbtiGame, BukbtiAxisStat>>
export type BukbtiState = { letters: BukbtiLetters; recorded: string | null; axes?: BukbtiAxes }

/** ★ 키를 올리지 마라(bukbti_v2 금지) — 올리면 기존 네 글자와 recorded 가 사라져
 *  같은 유형이 서버에 한 번 더 INSERT 되고 0015 집계가 오염된다.
 *  axes 는 선택적 필드라 옛 저장분과 그대로 호환된다(그 축은 「이전에 하신 판」으로 떨어진다). */
const KEY = 'bukbti_v1'
/** 진행판·조각이 같은 화면 안에서 함께 갱신되게 하는 신호 — 기기 안 이벤트일 뿐이다 */
export const BUKBTI_EVENT = 'bukbti-change'

const EMPTY: BukbtiState = { letters: {}, recorded: null }

/** 저장된 비율 한 건 검증 — 하나라도 어긋나면 그 축의 비율만 버리고 글자는 남긴다 */
function sane(game: BukbtiGame, v: unknown): BukbtiAxisStat | null {
  const ax = BUKBTI_AXIS_OF.get(game)
  if (!ax || !v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const a = o.a, d = o.d, total = o.total, src = o.src, at = o.at, ft = o.ft
  if (!Number.isInteger(a) || !Number.isInteger(d) || !Number.isInteger(total)) return null
  const an = a as number, dn = d as number, tn = total as number
  if (an < 0 || an > dn || dn > tn || tn > 15) return null
  if (src !== 'ratio' && src !== 'final' && src !== 'none') return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  const letter = ft === ax.a.letter || ft === ax.b.letter ? (ft as BukbtiLetter) : undefined
  return { a: an, d: dn, total: tn, src, ...(letter ? { ft: letter } : {}), at }
}

export function readBukbti(): BukbtiState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY, letters: {} }
    const j = JSON.parse(raw) as BukbtiState
    const letters: BukbtiLetters = {}
    const axes: BukbtiAxes = {}
    for (const ax of BUKBTI_AXES) {
      const v = j?.letters?.[ax.game]
      if (v === ax.a.letter || v === ax.b.letter) letters[ax.game] = v
      const st = sane(ax.game, j?.axes?.[ax.game])
      if (st) axes[ax.game] = st
    }
    const recorded = typeof j?.recorded === 'string' && BUKBTI_TYPE_OF.has(j.recorded) ? j.recorded : null
    return { letters, recorded, axes }
  } catch {
    return { ...EMPTY, letters: {}, axes: {} }
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

/** 결과 key 한 개(밸런스 type-* · 태그 밖 폴백)로 글자를 접어 **항상 덮어쓴다**.
 *  태그에 없는 key 면 조용히 아무것도 하지 않는다(놀이는 그와 무관).
 *  ★ 이 경로는 비율을 내지 못한다 — 그러므로 그 축의 옛 비율을 반드시 지운다.
 *    안 지우면 옛 판의 「국 73%」가 새 글자 「찬」에 붙어 거짓 화면이 된다.
 *  4글자가 완성되거나 완성 후 글자가 바뀌면 유형 기록(maybeRecordBukbti)을 시도한다. */
export function updateBukbtiLetter(game: BukbtiGame, resultKey: string): void {
  const tag = BUKBTI_TAG[resultKey]
  if (!tag) return
  const s = readBukbti()
  s.letters[game] = tag
  if (s.axes) delete s.axes[game]
  writeState(s)
  const code = bukbtiCode(s.letters)
  if (code) void maybeRecordBukbti(code)
}

/** ★ 월드컵 — 그 판에서 실제로 고르신 대결 전부로 비율을 내고 글자를 정한다.
 *
 *  대비 매치 = 두 항목의 태그가 서로 다른 대결. 같은 편끼리 붙은 대결(국 대 국)은
 *  무엇을 골라도 같은 글자라 취향을 말해 주지 않으므로 분모에서 뺀다.
 *  비율이 50%를 넘는 쪽이 글자다. 정확히 반반이거나 대비 매치가 0회면 예전대로
 *  결승에서 고르신 항목의 태그를 쓰고, 그 사실을 화면이 밝힌다(src).
 *
 *  matches 는 되돌리기가 반영된 이력이다 — Tournament 가 history 와 같은 지점에서
 *  push·pop 하므로 되돌린 선택은 분모·분자 어디에도 남지 않는다. */
export function updateBukbtiFromMatches(
  game: BukbtiGame,
  matches: ReadonlyArray<{ win: string; lose: string }>,
  finalWinKey: string,
): void {
  const ax = BUKBTI_AXIS_OF.get(game)
  if (!ax) return
  const ft = BUKBTI_TAG[finalWinKey]
  /* 산식은 bukbti-ratio.mjs 하나뿐이다 — verify-bukbti.mjs 가 그 파일을 그대로 불러 단위 검사한다 */
  const { a, d } = countContrast(matches, k => BUKBTI_TAG[k], ax.a.letter)
  const { letter: byRatio, src } = decideLetter(a, d, ax.a.letter, ax.b.letter) as {
    letter: BukbtiLetter | null
    src: BukbtiAxisStat['src']
  }
  const letter = byRatio ?? ft
  if (!letter) return               // 비율도 없고 결승 태그도 없다 — 아무것도 하지 않는다
  const s = readBukbti()
  s.letters[game] = letter
  s.axes = { ...(s.axes ?? {}) }
  s.axes[game] = { a, d, total: matches.length, src, ...(ft ? { ft } : {}), at: Date.now() }
  writeState(s)
  const code = bukbtiCode(s.letters)
  if (code) void maybeRecordBukbti(code)
}

/* ══════════ 화면 공용 — 저장분을 표시 모델로 ══════════ */

export type BukbtiAxisView = {
  axis: (typeof BUKBTI_AXES)[number]
  /** 이 축의 내 글자 — 아직 안 채운 축이면 null */
  mine: BukbtiLetter | null
  /** 반올림 정수. 두 쪽 합은 반드시 100(한쪽을 100 빼기 다른쪽). null = 비율 없음 */
  pctA: number | null
  pctB: number | null
  /** 대비 매치에서 a글자 쪽을 고른 횟수(분자) · 대비 매치 수(분모) · 그 판의 전체 선택 수.
   *  횟수는 반올림한 %에서 되계산하지 않는다 — 「73% (11/15)」의 11이 어긋나면 그 자체가 거짓말이다 */
  a: number
  d: number
  total: number
  /** ratio 비율로 정함 · final 정확히 반반 · none 비율을 낼 수 없는 판 · legacy 옛 기록 */
  src: 'ratio' | 'final' | 'none' | 'legacy'
  /** 비율이 없거나 결승 선택과 글자가 갈릴 때 화면에 그대로 싣는 정직 문구 */
  note: string | null
}

/** 축 하나를 화면이 그릴 수 있는 모양으로 편다. 옛 저장분·밸런스도 여기서 정직하게 떨어진다 */
export function bukbtiAxisView(game: BukbtiGame, s: BukbtiState): BukbtiAxisView {
  const axis = BUKBTI_AXIS_OF.get(game) ?? BUKBTI_AXES[0]
  const mine = s.letters[game] ?? null
  const st = s.axes?.[game]
  const base = { axis, mine, pctA: null, pctB: null, a: 0, d: 0, total: 0 } as const

  /* 밸런스 — 여덟 문항의 답이 눈/귀로 갈리지 않는다. 비율을 만들면 그것이 곧 날조다 */
  if (game === 'balance') {
    return {
      ...base,
      src: 'none',
      note: mine
        ? '이 판은 답 하나하나가 눈과 귀로 갈리지 않아 비율을 내지 않습니다 — 글자는 답에 가장 많이 붙은 기록 유형으로 정했습니다.'
        : null,
    }
  }

  /* 옛 기록 — 비율 없이 글자만 저장돼 있던 판 */
  if (!st) {
    return {
      ...base,
      src: 'legacy',
      note: mine ? '이전에 하신 판이라 비율이 남아 있지 않습니다 — 다시 하시면 비율이 나옵니다.' : null,
    }
  }

  if (st.d === 0) {
    return {
      ...base,
      d: 0,
      total: st.total,
      src: 'none',
      note: '고르신 대결이 한쪽으로만 붙어 비율을 낼 수 없었습니다 — 글자는 결승에서 고르신 항목으로 정했습니다.',
    }
  }

  const { pctA, pctB } = ratioPct(st.a, st.d)
  let note: string | null = null
  if (st.src === 'final') {
    /* 「대비 매치」는 우리끼리 쓰는 말이다 — 화면에는 다른 자리와 같은 말로 적는다 */
    note = `서로 다른 쪽이 맞붙은 대결 ${st.d}번을 「${axis.a.letter}」 쪽과 「${axis.b.letter}」 쪽으로 정확히 반씩 고르셨습니다 — 글자는 결승에서 고르신 항목으로 정했습니다.`
  } else if (st.src === 'ratio' && st.ft && mine && st.ft !== mine) {
    note = `결승에서 고르신 항목은 「${st.ft}」 쪽입니다만, 서로 다른 쪽이 맞붙은 대결 전체로는 「${mine}」 쪽이 더 많았습니다 — 글자는 한 항목이 아니라 고르신 전체로 정합니다.`
  }
  return { axis, mine, pctA, pctB, a: st.a, d: st.d, total: st.total, src: st.src === 'final' ? 'final' : 'ratio', note }
}

/** 내 글자 쪽을 고른 횟수 — 반올림한 %가 아니라 저장된 횟수 그대로 */
export function bukbtiMineHits(v: BukbtiAxisView): number {
  return v.mine === v.axis.a.letter ? v.a : v.d - v.a
}

/** 「서로 다른 쪽이 맞붙은 대결 11번 중 8번을 「국」 쪽으로 고르셨습니다」 — 화면 공용 한 줄 */
export function bukbtiCountLine(v: BukbtiAxisView): string | null {
  if (v.pctA == null || !v.mine || v.d === 0) return null
  return `서로 다른 쪽이 맞붙은 대결 ${v.d}번 중 ${bukbtiMineHits(v)}번을 「${v.mine}」 쪽으로 고르셨습니다`
}

/** 내 글자 쪽의 비율(%) — 막대·문장이 같은 값을 쓰게 하는 단일 창구 */
export function bukbtiMinePct(v: BukbtiAxisView): number | null {
  if (v.pctA == null || v.pctB == null || !v.mine) return null
  return v.mine === v.axis.a.letter ? v.pctA : v.pctB
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
