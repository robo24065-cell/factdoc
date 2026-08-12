import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
// @ts-expect-error — 순수 JS 어댑터 (프록시 경유, 키를 만지지 않는다)
import { llmAdapter, probe as probeLLM } from '../engine/nk-llm-proxy.mjs'
import {
  answerAsync, asOfNotice, buildIndex,
  type NkAnswer, type NkDataset, type NkRecord, type Notice,
} from '../engine/nk-search.mjs'

/* ────────────────────────────────────────────────────────────────
   사실은ON — 국민이 묻고 국가 공식자료가 답하는 북한·통일 팩트체커

   화면 설계 4원칙
   ① emerald / amber / violet 은 자료 기준일(as-of) 3상태 전용색이다.
      다른 의미로 쓰지 않는다 (정보=blue, 경고=rose, 중립=slate).
   ② 답은 문장으로 먼저 말한다 — 화면 최대 활자는 항상 '요지 한 문장'이다.
   ③ 색 없이도 상태가 읽혀야 한다 — 색·도형·테두리종류·한국어 라벨 4중 부호화.
   ④ 노인이 읽어야 하는 문장은 전부 rem 계열(text-sm / text-base / text-2xl).
      FontScale 이 html font-size 를 16/18/20px 로 바꾸므로 임의 px 는 확대되지 않는다.
      → text-[11px] 는 캡션·출처·면책·기준일 스탬프에만 허용한다.
   ──────────────────────────────────────────────────────────────── */

/* ══════════════════════ 타입 (d.mts 가 any 로 둔 것을 지역에서 좁힌다) ══════════════════════ */

type Level = 'live' | 'stale' | 'frozen'
type Tone = 'emerald' | 'amber' | 'violet' | 'blue' | 'slate' | 'rose'

type Measure = {
  metric: string
  value: number
  unit: string | null
  dims: Record<string, string> | null
  periodStart: string | null
}
/* 엔진이 실제로 채우지만 .d.mts 선언에서 빠진 필드(top, measures)를 보강 */
type Group = NonNullable<NkAnswer['groups']>[number] & { top?: number; measures?: Measure[] }

type NumericOk = {
  comparable: true
  metric: string
  unit: string | null
  claimed: number
  n: number
  max: number
  min: number
  latest: number
  latestPeriod: string | null
  verdict: 'above_max' | 'below_min' | 'in_range'
  ratioToMax: number | null
}
type RelatedMetric = { metric: string; unit: string | null; value: number; period: string | null }
type NumericNo = {
  comparable: false
  wantUnit: string | null
  claimed: number
  reason: string
  related: RelatedMetric[]
  derived: { from: string; value: number; unit: string | null; note: string } | null
}
type NumericT = NumericOk | NumericNo

type AggT = {
  mode: 'distribution' | 'sum' | 'max' | 'min'
  metric: string
  unit: string | null
  dimName: string | null
  genderFilter: string | null
  items?: Array<{ key: string; value: number; share: number }>
  total?: number
  sum?: number
  count?: number
  peak?: { key?: string; value: number }
  low?: { key?: string; value: number }
  /* 엔진 aggregate() 가 붙이는 시점 표식 — 값이 '언제 것인지'를 화면이 말할 수 있게 한다 */
  outOfWindow?: boolean
  timeScoped?: boolean
  windowLabel?: string | null
  future?: boolean
  targetYear?: number | null
  basis?: 'periodic' | 'snapshot'
  hasPeriodic?: boolean
  cumulativeSince?: string | null
  asOfDate?: string | null
  unsolicited?: boolean
  dataset: NkDataset
  record: NkRecord
}

type LookupT = {
  askedUnit: string | null
  windowLabel: string | null
  outOfWindow: boolean
  metric: string
  unit: string | null
  value: number
  period: string | null
  dataset: NkDataset
  record: NkRecord
  substituted: boolean
  note: string | null
}

type Track = {
  key: string
  n: number
  name: string
  level: Level
  end: string
  gapDays: number
  ds: NkDataset
}

/* ══════════════════════ 상수 ══════════════════════ */

const EXAMPLES = [
  '개성공단 아직 하냐',
  '탈북은 나이 많은 사람이 더 많이 한다며',
  '김정은 최근에 뭐 했어',
  '개성공단에 기업 500개나 있었다던데',
  '금강산 관광객 지금 얼마나 가',
  '탈북민 여자가 몇 명이야',
]

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950'
const CARD = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
const PROSE = 'break-keep break-words'

const TONE: Record<Tone, { band: string; accent: string; text: string; soft: string; chip: string }> = {
  emerald: {
    band: 'bg-emerald-50 dark:bg-emerald-950/30',
    accent: 'bg-emerald-500',
    text: 'text-emerald-800 dark:text-emerald-200',
    soft: 'bg-emerald-50/70 dark:bg-emerald-950/20',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  },
  amber: {
    band: 'bg-amber-50 dark:bg-amber-950/30',
    accent: 'bg-amber-500',
    text: 'text-amber-800 dark:text-amber-200',
    soft: 'bg-amber-50/70 dark:bg-amber-950/20',
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  },
  violet: {
    band: 'bg-violet-50 dark:bg-violet-950/30',
    accent: 'bg-violet-600',
    text: 'text-violet-800 dark:text-violet-200',
    soft: 'bg-violet-50/70 dark:bg-violet-950/20',
    chip: 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200',
  },
  blue: {
    band: 'bg-blue-50 dark:bg-blue-950/30',
    accent: 'bg-blue-500',
    text: 'text-blue-800 dark:text-blue-200',
    soft: 'bg-blue-50/60 dark:bg-blue-950/20',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200',
  },
  slate: {
    band: 'bg-slate-100 dark:bg-slate-800',
    accent: 'bg-slate-400',
    text: 'text-slate-800 dark:text-slate-100',
    soft: 'bg-slate-50 dark:bg-slate-800/50',
    chip: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  },
  rose: {
    band: 'bg-rose-50 dark:bg-rose-950/30',
    accent: 'bg-rose-500',
    text: 'text-rose-800 dark:text-rose-200',
    soft: 'bg-rose-50/70 dark:bg-rose-950/20',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
  },
}

/* as-of 3상태 — 이 서비스의 정체성.
   shape : 도형(● 채움 / ○ 비움 / ■ 사각) · edge : 테두리 종류(실선/점선/겹선)
   verb  : 전문 설명 (레벨별 첫 등장에만)   · short : 축약 꼬리표 (반복 시)         */
const AS_OF: Record<Level, {
  tone: Tone; icon: string; label: string
  verb: string; short: string; after: string; legend: string
  shape: string; edge: string; dot: string
}> = {
  live: {
    tone: 'emerald', icon: '🟢', label: '최신',
    verb: '현재 시점까지 확인되는 자료입니다. 지금도 갱신되고 있습니다.',
    short: '지금까지 확인됨',
    after: '현재까지 확인됨', legend: '지금까지 확인됨',
    shape: 'rounded-full border-white bg-emerald-500 dark:border-slate-900',
    edge: 'border-l-4 border-solid border-emerald-500',
    dot: 'bg-emerald-500',
  },
  stale: {
    tone: 'amber', icon: '🟡', label: '이후 미확인',
    verb: '이 시점 이후의 상황은 확인되지 않았습니다. 아래 값은 당시의 값이며 현재 값이 아닙니다. — 없다는 뜻이 아니라 모른다는 뜻입니다.',
    short: '이후는 모름',
    after: '이후 미확인', legend: '이후는 모름 (자료가 멈춤)',
    shape: 'rounded-full border-amber-500 bg-white dark:bg-slate-900',
    edge: 'border-l-4 border-dashed border-amber-500',
    dot: 'bg-white ring-2 ring-amber-500 dark:bg-slate-900',
  },
  frozen: {
    tone: 'violet', icon: '🔒', label: '데이터 종료',
    verb: '활동 자체가 종료되어 이 시점 이후의 데이터는 존재하지 않습니다. 아래 값이 확정된 최종값이며, 더 최신 값이 어딘가에 있는 것이 아닙니다.',
    short: '이후 없음(종료)',
    after: '이후 데이터 없음', legend: '이후는 없음 (종료 확정)',
    shape: 'rounded-sm border-white bg-violet-600 dark:border-slate-900',
    edge: 'border-l-4 border-double border-violet-600',
    dot: 'bg-violet-600',
  },
}

/* frozen 구간 해치 — '데이터가 없는 구간'을 색이 아니라 질감으로.
   축소 인쇄를 견디도록 4px/12px 주기 (2px/7px 는 뭉개진다) */
const HATCH =
  'bg-[repeating-linear-gradient(45deg,#a78bfa_0px,#a78bfa_4px,transparent_4px,transparent_12px)] ' +
  'dark:bg-[repeating-linear-gradient(45deg,#7c3aed_0px,#7c3aed_4px,transparent_4px,transparent_12px)]'

type LevelMeta = { tone: Tone; icon: string; label: string; sub: string }
const LEVEL_FALLBACK: LevelMeta = {
  tone: 'blue', icon: '📄', label: '공식 자료로 확인',
  sub: '통일부 공개 데이터에서 관련 근거를 찾았습니다',
}
/* 엔진이 새 level(예: related_only)을 추가해도 화면이 백지가 되지 않도록 Record<string, …> + 폴백 */
const LEVEL_META: Record<string, LevelMeta> = {
  /* anyFrozen / anyLive 는 '포함' 판정이다 — 단정하면 6년 된 자료를 최신이라 말하게 된다 */
  frozen_answer: {
    tone: 'violet', icon: '🔒', label: '종료 확정 자료 포함',
    sub: '이후 데이터가 존재하지 않는 자료가 근거에 포함되어 있습니다',
  },
  stale_answer: {
    tone: 'amber', icon: '🟡', label: '이후 미확인 자료로 답변',
    sub: '가장 최근 확인 시점 이후의 상황은 알 수 없습니다',
  },
  dated_answer: {
    tone: 'emerald', icon: '🟢', label: '최신 자료 포함',
    sub: '최근 갱신된 공식 자료가 근거에 포함되어 있습니다',
  },
  timeline: {
    tone: 'blue', icon: '🗓', label: '기록을 시간순으로 정리',
    sub: '공식 기록을 최신순으로 보여 드립니다',
  },
  /* 아직 연동하지 못한 자료가 답할 질문 — "없다"가 아니라 "우리가 아직 못 가져왔다"다.
     둘을 같은 문구로 말하면 통일부에 있는 자료를 없다고 말하는 셈이 된다. */
  lexicon_answer: {
    tone: 'blue', icon: '🗣', label: '남북 대응어 사전으로 답변',
    sub: '통일부 「남북한 언어비교」 자료를 직접 조회했습니다',
  },
  pending_only: {
    tone: 'blue', icon: '🔌', label: '연동 대기 자료가 답할 질문',
    sub: '통일부에 자료가 있으나 아직 싣지 못했습니다 — 지금은 확인해 드릴 수 없습니다',
  },
  /* 관계망은 문서가 아니라 집계로 답한다 — '근거를 찾았다'고 말하면 어긋난다 */
  relation_answer: {
    tone: 'blue', icon: '🔗', label: '동향 기록 집계로 답변',
    sub: '통일부 동향에 기재된 수행·동행 기록을 집계했습니다',
  },
  no_evidence: {
    tone: 'slate', icon: '📭', label: '근거 없음',
    sub: '통일부 공식 자료에서 관련 기록을 찾지 못했습니다',
  },
}

/* 엔진 checkNumeric 은 claimed/max/min/latest 를 base 단위로 환산해 넘기면서
   unit 에는 원자료 단위를 담는다. 그대로 찍으면 '10,000,000,000 천달러' 가 된다. */
const BASE_UNIT: Record<string, string> = {
  '천달러': '달러', '만달러': '달러', '백만달러': '달러', '달러': '달러',
  '만명': '명', '명': '명', '인': '명',
  '억원': '원', '만원': '원', '원': '원',
}

const MS_D = 864e5

/* ══════════════════════ 유틸 ══════════════════════ */

function nf(v: unknown): string {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ko-KR') : '—'
}
function nf1(v: unknown): string | null {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
    : null
}
/* 단위 미표기(unit === null)는 실재한다 — 맨숫자로 찍지 않고 명시한다 */
const unitLabel = (u?: string | null) => (u && String(u).trim() ? String(u).trim() : '단위 미표기')
const baseUnit = (u?: string | null) => {
  const k = String(u ?? '').trim()
  return k ? (BASE_UNIT[k] ?? k) : ''
}
/* 기계 지표명(반출입_중량_증가율)의 언더스코어만 푼다. 의미는 바꾸지 않는다. */
const metricLabel = (s?: string | null) => String(s ?? '').replace(/_/g, ' ').trim()

/* 요지 문장용 — 카드의 '2020.03' 과 달리 문장 안에서는 '2020년 3월'이 읽힌다 */
function ymKo(d?: string | null): string {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}년 ${Number(m[2])}월` : '기준일 미상'
}

function ym(d?: string | null): string {
  if (!d) return '기간 미상'
  const m = String(d).match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}.${m[2]}` : String(d)
}
function gapText(days?: number | null): string {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return '0개월'
  let y = Math.floor(days / 365.25)
  let mo = Math.round((days - y * 365.25) / 30.44)
  if (mo >= 12) { y += 1; mo = 0 }
  if (y <= 0) return `${Math.max(1, mo)}개월`
  return mo >= 1 ? `${y}년 ${mo}개월` : `${y}년`
}

/* 원자료 정제 — 전각 문장부호(U+FF0C 13,137건)와 미디코딩 HTML 엔티티가 그대로 남아 있다.
   React 는 &lt;br/&gt; 를 글자 그대로 찍으므로 렌더 직전에 정규화한다.
   ※ 제목 90자 하드컷 / 본문 221자 '…' 컷은 원본에서 이미 잘린 것이므로 다시 자르지 않는다.
      (line-clamp 를 얹으면 이중 절단이 된다) */
function clean(s?: string | null): string {
  if (!s) return ''
  return String(s)
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/<br\s*\/?>/gi, ' ')
    // 북한개황 본문에 원본 HTML 이 섞여 있다 (<p style="padding-bottom:15px"> 등).
    // 엔티티 복원 뒤에 태그를 걷어내야 &lt;p&gt; 형태로 들어온 것까지 함께 잡힌다.
    .replace(/<\/?[a-zA-Z][^<>]{0,200}>/g, ' ')
    .replace(/\uFF0C/g, ', ')
    .replace(/\uFF0E/g, '. ')
    .replace(/\uFF1F/g, '? ')
    .replace(/\uFF5E/g, '~')
    .replace(/\uFF0D/g, '-')
    .replace(/\uFF65/g, '·')
    .replace(/\uFF62/g, '「')
    .replace(/\uFF63/g, '」')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const asLevel = (s?: string | null): Level =>
  s === 'live' || s === 'frozen' ? s : 'stale'

/* 기준일 문구는 엔진 asOfNotice 하나만 쓴다 — 재구현하면 엔진이 문구를 고칠 때 화면만 갈라진다.
   record 가 있으면 레코드 단위로(정확), 없으면 dataset 을 캐스트한다.
   (asOfNotice 가 읽는 필드는 coverageEnd / freshness / frozenReason 셋뿐이고 NkDataset 이 전부 갖는다) */
function noticeOf(
  rec?: NkRecord | null,
  ds?: NkDataset | null,
  askedAt?: unknown,
): Notice {
  const at = askedAt instanceof Date && !Number.isNaN(askedAt.getTime()) ? askedAt : new Date()
  const src = rec?.coverageEnd ? rec : ds?.coverageEnd ? (ds as unknown as NkRecord) : null
  if (!src) return { level: 'stale', gapDays: 0, text: '자료 기준일을 확인할 수 없습니다.' }
  const n = asOfNotice(src, at)
  /* frozenReason 이 null 인 frozen 자료가 있어 '(null)' 이 노출된다 */
  return { ...n, level: asLevel(n.level), text: String(n.text).replace(/\s*\(null\)/, '') }
}

/* ── 조사 자동 선택 ─────────────────────────────────────────
   요지 문장의 명사는 대부분 데이터에서 온다('연령대', '입주기업수', '2015년', '30-39세').
   조사를 하드코딩하면 "가장 많은 연령대은" 같은 문장이 나온다.
   받침 유무로 골라 붙인다. */
const JOSA = {
  '은/는': ['은', '는'], '이/가': ['이', '가'], '을/를': ['을', '를'],
  '과/와': ['과', '와'], '으로/로': ['으로', '로'],
} as const
/* 숫자는 마지막 자릿수의 '읽는 소리'로 판정한다 — 1(일)·3(삼)·6(육)·7(칠)·8(팔)·0(영)은 받침 있음 */
const DIGIT_JONG: Record<string, boolean> = {
  '0': true, '1': true, '2': false, '3': true, '4': false,
  '5': false, '6': true, '7': true, '8': true, '9': false,
}
function hasJong(word: string): boolean {
  // 괄호·따옴표·공백 등 조사 발음에 영향 없는 꼬리는 벗겨낸다
  const s = String(word ?? '').replace(/[)\]}’'"”\s.·]+$/, '')
  const c = s.at(-1)
  if (!c) return false
  if (c === '%') return false                      // 퍼센트
  if (DIGIT_JONG[c] !== undefined) return DIGIT_JONG[c]
  const code = c.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0
  return true                                       // 영문·기타는 받침 있는 쪽으로 (덜 어색)
}
/** josa('연령대', '은/는') → '연령대는' */
function josa(word: string, kind: keyof typeof JOSA): string {
  const [withJong, without] = JOSA[kind]
  return `${word}${hasJong(word) ? withJong : without}`
}

/* ── 집계 한 문장 ─────────────────────────────────────────────
   as-of 3상태(live/stale/frozen)는 '자료가 언제까지 있나'를 말한다.
   여기서 다루는 건 그 옆 축이다 — '물어본 시점의 값이 맞나'.
   숫자를 지우지 않는다. 가진 것을 주되 그것이 무엇의 값인지 먼저 밝힌다. */
function aggSentence(g: AggT): string {
  const u = g.unit ? g.unit : ''
  const asof = ymKo(g.asOfDate)
  /* '누적'은 카탈로그가 확정한 것만 단정한다(nk-catalog CUMULATIVE).
     등록되지 않은 스냅샷은 '기간 미분해 집계'로만 말한다 — 재고를 누적이라 부르지 않기 위해서다. */
  const cum = g.cumulativeSince
    ? `${String(g.cumulativeSince).slice(0, 4)}년 이후 ${asof}까지 누적`
    : g.basis === 'snapshot' ? `${asof} 기준(기간 미분해 집계)` : `${asof} 기준`
  /* 성별 등 필터가 걸린 합계를 조건 없이 말하면 전체값으로 읽힌다 —
     '여자만 24,147명'이 '북한이탈주민 입국현황은 24,147명'으로 나가던 자리다. */
  const cond = g.genderFilter && g.genderFilter !== '전체' ? `${g.genderFilter}성 ` : ''
  const name = metricLabel(g.metric)
  const val = nf(g.sum ?? g.total)

  // ① 미래 — 자료가 '없는' 게 아니라 '아직 발생하지 않은' 것이다. 그 차이를 말한다.
  if (g.future) {
    const tgt = !g.windowLabel || g.windowLabel === '앞으로' ? '앞으로의' : g.windowLabel
    return `${tgt} 수치는 아직 발생하지 않았으므로 어떤 공식 자료에도 없습니다. ` +
      `가장 최근 확인된 값은 ${cond}${name} ${cum} ${val}${u}입니다.`
  }
  // ② 시점을 물었는데 그 구간으로 나뉜 수치가 코퍼스에 아예 없다 → 단정할 수 있다
  if (g.outOfWindow && g.hasPeriodic === false)
    return `${g.windowLabel} 수치는 이 자료에 없습니다 — 이 지표는 기간별로 나뉘어 있지 않습니다. ` +
      `확인되는 것은 ${cond}${name} ${cum} ${val}${u}뿐입니다.`
  // ③ 기간별 자료이긴 한데 그 구간이 비었다 → 모른다
  if (g.outOfWindow)
    return `${g.windowLabel} 자료는 확인되지 않습니다. 아래는 ${cond}${name}의 ${cum} 값 ${val}${u}입니다.`

  // ④ 시점 조건 없음 — 기존 4갈래에 basis/as-of 만 얹는다
  if (g.mode === 'distribution' && g.items && g.items.length) {
    const top = g.items[0]
    return `${name} ${cum} ${nf(g.total)}${u} 중 가장 많은 ${josa(g.dimName ?? '구간', '은/는')} ` +
      `${top.key}(${nf(top.value)}${u}, ${(top.share * 100).toFixed(1)}%)입니다.`
  }
  if (g.mode === 'max' && g.peak)
    return `${josa(name, '이/가')} 가장 많은 ${josa(g.dimName ?? '구간', '은/는')} ${g.peak.key ?? '(구분값 미기재)'}, ${nf(g.peak.value)}${u}입니다. (${cum})`
  if (g.mode === 'min' && g.low)
    return `${josa(name, '이/가')} 가장 적은 ${josa(g.dimName ?? '구간', '은/는')} ${g.low.key ?? '(구분값 미기재)'}, ${nf(g.low.value)}${u}입니다. (${cum})`
  return `${cond}${josa(name, '은/는')} ${cum} ${val}${u}입니다.`
}

/* 관계 답변의 요지 한 문장.
   순서가 의미를 만든다 — '누구를 수행했나'(윗선)를 먼저, '누가 수행했나'(아랫선)를 뒤에.
   상위 3명까지만 문장에 넣는다. 나머지는 카드가 보여 준다. */
function relSentence(rel: RelationT): string | null {
  const top3 = (l: RelLink[]) => l.slice(0, 3).map(x => `${x.name} ${nf(x.w)}회`).join(' · ')
  if (rel.kind === 'pair') {
    const a = rel.subject, b = rel.other
    if (rel.subjectServes)
      return `통일부 동향에 ${josa(a, '이/가')} ${josa(b, '을/를')} 수행한 기록이 ${nf(rel.subjectServes.w)}건 있습니다.`
    if (rel.subjectServed)
      return `통일부 동향에 ${josa(b, '이/가')} ${josa(a, '을/를')} 수행한 기록이 ${nf(rel.subjectServed.w)}건 있습니다.`
    /* 직접 접점이 없어도 '같은 사람을 수행했다'가 답이다 — 없다고 말하면 있는 사실을 지운다 */
    if (rel.shared?.length) {
      const s = rel.shared.slice(0, 2)
        .map(x => `${x.name}(${a} ${nf(x.a)}회 · ${b} ${nf(x.b)}회)`).join(', ')
      return `두 사람이 서로를 수행한 기록은 없습니다. 다만 같은 인물을 수행한 기록이 있습니다 — ${s}.`
    }
    const n = rel.met?.w ?? rel.with?.w
    return n ? `통일부 동향에 두 사람이 함께 기록된 것이 ${nf(n)}건 있습니다.` : null
  }
  /* 직책은 이름 **앞**에 둔다 — "김정은(조선노동당 총비서)는" 처럼 조사가 괄호 끝 음절에
     붙는 사고를 막는다. 한국어 어순으로도 '조선노동당 총비서 김정은은'이 자연스럽다. */
  const head = `${rel.pos ? rel.pos + ' ' : ''}${josa(rel.subject, '은/는')} `
    + `통일부 동향 ${nf(rel.records)}건에 등장합니다.`
  /* ★ 어느 쪽이 답인지는 기록량이 정한다.
     '김정은 측근 누구'는 그가 수행한 대상이 아니라 **그를 수행한 사람**을 묻는다.
     김정은은 수행받음 2,380 / 수행함 71 이라 많은 쪽을 고르면 저절로 맞는다. */
  if (rel.servedTotal >= rel.servesTotal && rel.served.length)
    return `${head} ${josa(rel.subject, '을/를')} 수행한 기록은 ${top3(rel.served)} 순으로 많습니다.`
  if (rel.serves.length)
    return `${head} ${josa(rel.subject, '이/가')} 수행한 기록은 ${top3(rel.serves)} 순으로 많습니다.`
  if (rel.served.length)
    return `${head} ${josa(rel.subject, '을/를')} 수행한 기록은 ${top3(rel.served)} 순으로 많습니다.`
  if (rel.met.length) return `${head} 접견·회담으로 함께 기록된 인물은 ${top3(rel.met)} 순입니다.`
  return head
}

/* ── 요지 한 문장 — 화면 최대 활자가 될 문장을 만든다 ───────────
   주제 종료 공지(topicNotice)는 '맥락'이지 '답'이 아니다.
   "개성공단에 기업 500개나 있었다던데" 에 종료 공지부터 들이밀면 물어본 것에 답하지 않은 셈이다.
   → 구체적인 답(수치 대조·집계·연혁)이 있으면 그것이 헤드라인, 종료 공지는 바로 아래 맥락 문장.
     구체적인 답이 없을 때만 종료 공지가 헤드라인이 된다. */
function summarize(a: NkAnswer): string | null {
  const n = a.numeric as NumericT | null | undefined
  if (n && n.comparable) {
    const u = baseUnit(n.unit)
    const su = u ? u : ''
    const claimed = `${nf(n.claimed)}${su}`
    if (n.verdict === 'above_max') {
      const r = nf1(n.ratioToMax)
      return r
        ? `주장하신 ${josa(claimed, '은/는')} 공식 자료의 최댓값 ${nf(n.max)}${su}의 약 ${r}배입니다.`
        : `주장하신 ${josa(claimed, '은/는')} 공식 자료에 기록된 최댓값 ${josa(`${nf(n.max)}${su}`, '을/를')} 넘어섭니다.`
    }
    if (n.verdict === 'below_min')
      return `주장하신 ${josa(claimed, '은/는')} 공식 자료의 최솟값 ${nf(n.min)}${su}보다 작습니다.`
    return `주장하신 ${josa(claimed, '은/는')} 공식 관측 범위(${nf(n.min)}~${nf(n.max)}${su}) 안에 있습니다.`
  }
  if (n && n.comparable === false)
    return `주장하신 ‘${n.wantUnit ?? '해당'}’ 단위와 같은 단위의 공식 지표가 없어, 대조 대신 관련 지표만 제시합니다.`

  const g = a.agg as AggT | null | undefined
  /* 수량을 묻지 않은 질문이면 수치 카드는 남기되 요지로는 쓰지 않는다(엔진이 unsolicited 로 표시) */
  if (g && !g.unsolicited) return aggSentence(g)

  if (a.level === 'timeline') {
    const shown = a.items?.length ?? 0
    if (!shown) return '이 조건에 해당하는, 날짜가 확인된 공식 기록이 없습니다.'
    return `관련 공식 기록 ${nf(a.available ?? shown)}건 중 최신 ${nf(shown)}건을 시간순으로 정리했습니다.`
  }

  /* ★ 인물의 생사를 물었으면 인물 카드가 답이다. 통일부 인물 정보는 사망 기록을 갖고 있다(83명 등재).
     '사망 기록 없음'은 '살아 있다'는 단정이 아니라 '통일부 자료에 사망 기록이 없다'는 사실이고,
     그 자료의 기준일까지만 유효하다 — 그 둘을 한 문장에 같이 담는다. */
  if (a.Q?.personAsk) {
    const ent = (a.groups ?? []).flatMap(g => g.hits ?? [])
      .map(h => h.r).find(r => r.kind === 'entity')
    if (ent) {
      const b = clean(ent.body)
      const died = b.match(/사망:\s*([^·]+)/)
      const pos = (b.match(/직책:\s*([^·]+)/) || [])[1]?.trim().replace(/^사망\s*/, '')
      const asof = ymKo(ent.coverageEnd || ent.asOf)
      return died
        ? `${ent.title}${pos ? `(${pos})` : ''}은 통일부 인물 정보에 사망일이 ${died[1].trim()}로 기록돼 있습니다.`
        : `통일부 인물 정보에 ${ent.title}의 사망 기록은 없습니다 — ${asof} 기준입니다. ` +
          `없다는 확인이지 이후를 보장하는 것은 아닙니다.`
    }
  }

  /* ★ 낱말을 물었으면 사전이 답이다. 찾았든 못 찾았든 이 계층이 답을 책임진다. */
  const lex = a.lexicon as LexiconT | null | undefined
  if (lex) {
    if (lex.kind === 'found') {
      const ws = lex.words ?? []
      const side = lex.dir === 'toNK' ? '북한에서는' : '남한에서는'
      if (ws.length) {
        /* 조사를 괄호로 얼버무리지 않는다 — josa() 가 받침을 보고 고른다.
           마지막 낱말에만 '(이)라고'가 붙으므로 그 낱말 기준으로 판정한다. */
        const list = ws.join(', ')
        const last = ws[ws.length - 1]
        return `${side} ${josa(`‘${lex.word}’`, '을/를')} ${list}${hasJong(last) ? '이라고' : '라고'} 합니다.`
      }
      if (lex.term?.def) return `‘${lex.word}’ — ${lex.term.def}`
    }
    return `통일부 「남북한 언어비교」 자료에 ‘${lex.word}’는 등재돼 있지 않습니다. `
      + `남북이 같은 말을 쓰거나, 아직 수록되지 않은 낱말입니다.`
  }

  /* ★ 준비된 자료 중 어느 것도 답할 수 없는 질문 유형 — 어휘 질문이 그렇다.
     이때 문서를 근거로 들이밀면 「인민의 안녕」으로 "안녕하세요"에 답하는 꼴이 된다.
     "모른다"가 아니라 "이 자료가 오면 답할 수 있다"까지 말해 주는 것이 이 서비스의 몫이다. */
  if (a.level === 'pending_only' && a.pending)
    return `이 질문에 답하려면 「${a.pending.name}」 자료가 필요합니다. `
      + `아직 연동하지 못해, 지금은 확인해 드릴 수 없습니다.`

  /* ★ 관계를 물었으면 관계가 답이다. 문서 검색이 빈손이어도 여기서 답이 나온다 —
     "장성택 누구랑 다녔어"에 '자료를 찾지 못했습니다'라고 해놓고 바로 아래에서
     수행 기록을 나열하면 화면이 스스로와 모순된다.
     순서상 수치·집계·연혁·생사 확인보다는 뒤다(그쪽이 더 구체적인 답이다). */
  const rel = a.relation as RelationT | null | undefined
  if (rel) { const s = relSentence(rel); if (s) return s }

  /* 여기까지 왔다면 구체적인 답이 없다.
     "개성공단 아직 하냐" 처럼 종료 공지 자체가 답인 경우가 여기다 —
     '근거 N건을 찾았습니다' 같은 무내용 문장보다 종료 공지가 훨씬 나은 답이다. */
  if (a.topicNotice?.text) return a.topicNotice.text

  if (a.groups && a.groups.length) {
    const g0 = a.groups[0]
    const r0 = g0.hits?.[0]?.r
    if (!r0) return null
    /* 요지 문장에 원본 제목을 인용한다 — clean() 을 거치지 않으면 전각쉼표(，)·HTML 태그가
       화면 최대 활자에 그대로 박힌다. 제목이 길면 요지가 아니게 되므로 60자에서 끊는다. */
    const t0 = clean(r0.title)
    const title0 = t0.length > 60 ? t0.slice(0, 60) + '…' : t0
    const ds0 = clean(g0.ds?.name) || '공식 자료'
    const more = a.groups.length > 1 ? ` 외 공식 자료 ${a.groups.length - 1}종을 함께 확인했습니다.` : ''

    /* 질의에 변별력 있는 어휘가 하나도 걸리지 않았다 (예: '북한방사능' → '방사능'이 코퍼스에 0건).
       이때 아래 자료는 '근거'가 아니라 '참고'다. 그렇다고 빈손으로 돌려보내지는 않는다 —
       그게 이 프로젝트가 갈아엎은 그 실패다. 무엇을 못 찾았는지만 정직하게 밝힌다.
       ※ Q.unmatched 는 '뭐함/어떰/무서워' 같은 어미 파편이 섞여 화면에 인용하지 않는다. */
    /* ★ 두 경우를 갈라 말한다. 지금까지 같은 문구를 썼는데 뜻이 다르다.
       genericOnly — 사용자가 **주제를 안 지정했다**("북한 요즘 뭐함"). 못 찾은 게 아니다.
         "핵심어를 찾지 못했다"고 하면 답이 있는데도 실패처럼 읽힌다.
       weakMatch  — 지정은 했는데 **코퍼스에 없다**("북한방사능"). 이때는 못 찾은 게 맞다. */
    /* ⚠ 엔진 정의상 weakMatch = genericOnly || (…) 다. 즉 genericOnly 면 weakMatch 도 참이다.
       `genericOnly && !weakMatch` 로 쓰면 영원히 거짓이 된다(실제로 그렇게 썼다가 안 먹었다).
       **순서로** 가른다 — 주제 미지정이 먼저, 그다음이 '지정했는데 없음'. */
    if (a.Q?.genericOnly)
      return `특정 주제를 지정하지 않으셔서, 관련 있는 최근 공식 기록을 보여 드립니다 — ` +
             `${ds0}의 「${title0}」입니다.${more}`
    if (a.Q?.weakMatch ?? a.Q?.genericOnly)
      return `질문의 핵심어에 걸리는 공식 자료를 찾지 못했습니다. 아래는 근거가 아니라 참고 자료입니다 — ` +
             `가장 가까운 기록은 ${ds0}의 「${title0}」입니다.`

    /* 건수가 아니라 제목으로 말한다. 무엇을 근거로 삼았는지가 숫자보다 검증 가능하다. */
    /* 검색에 쓴 내부 토큰을 인용하지 않는다 — 조사가 붙은 형태('북한주민은')와
       변별력 없는 조각('많이')이 '핵심어'인 양 노출돼 오히려 질문 요지를 흐렸다.
       사용자가 무엇을 물었는지는 바로 아래 '묻고 계신 것' 줄에 원문 그대로 보인다. */
    return `확인된 가장 가까운 공식 기록은 ${ds0}의 「${title0}」입니다.${more}`
  }
  return null
}

/* ══════════════════════ 원자 컴포넌트 ══════════════════════ */

function NumChip({ n }: { n: number }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold tabular-nums text-white dark:bg-white dark:text-slate-900"
      aria-hidden="true"
    >
      {n}
    </span>
  )
}

/* 조항 라벨 — 검은 알약을 쓰지 않는다. frozen 배지(violet)·근거번호(검은 원)와 3자 분리 */
function ClauseTag({ children }: { children: ReactNode }) {
  return (
    <span className="mt-0.5 shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold tracking-wider text-slate-500 dark:border-slate-600 dark:text-slate-400">
      {children}
    </span>
  )
}

function AsOfPill({ level }: { level: string }) {
  const lv = asLevel(level)
  const m = AS_OF[lv]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[m.tone].chip}`}
    >
      <span aria-hidden="true">{m.icon}</span>
      <span className="sr-only">자료 기준 등급: </span>
      {m.label}
    </span>
  )
}

/**
 * 기준일 안내. verbose=true 면 전문(모른다 vs 없다)을 쓰고,
 * 같은 레벨이 화면에 다시 나올 때는 축약 꼬리표만 붙인다.
 * (같은 5줄 경고를 카드마다 반복하면 두 번째부터 아무도 안 읽는다)
 */
function AsOfBanner({ notice, verbose }: { notice: Notice; verbose: boolean }) {
  const lv = asLevel(notice.level)
  const m = AS_OF[lv]
  const T = TONE[m.tone]
  return (
    <div className={`rounded-xl ${m.edge} ${T.soft} p-3`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <AsOfPill level={lv} />
        {!verbose && (
          <span className={`text-sm font-medium ${T.text}`}>→ {m.short}</span>
        )}
        {lv !== 'live' && (notice.gapDays ?? 0) > 30 && (
          <span className="text-[11px] tabular-nums text-slate-500">
            {lv === 'frozen' ? '종료 후' : '미확인'} {gapText(notice.gapDays)} 경과
          </span>
        )}
      </div>
      <p className={`mt-1.5 text-base font-medium leading-relaxed ${PROSE} ${T.text}`}>{notice.text}</p>
      {verbose && (
        <p className={`mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>{m.verb}</p>
      )}
    </div>
  )
}

function SourceLine({ ds, no }: { ds?: NkDataset | null; no?: number }) {
  if (!ds) return null
  return (
    <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
      <p className={`text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
        <span className="text-slate-500" aria-hidden="true">📎 </span>
        <span className="text-slate-500">출처</span>{' '}
        {no != null && <span className="tabular-nums text-slate-500">[{no}] </span>}
        <span className="font-medium text-slate-500">{ds.name}</span>
        {' · '}{ds.provider}
        {ds.status === 'pending' && (
          <span className="ml-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            API 연계 예정
          </span>
        )}
        {' · '}
        <span className="tabular-nums">자료 기준일 {ds.coverageEnd}</span>
        {ds.url ? (
          <>
            {' · '}
            <a
              href={ds.url}
              target="_blank"
              rel="noreferrer"
              className={`rounded text-blue-600 underline underline-offset-2 dark:text-blue-400 ${FOCUS}`}
            >
              원본 데이터
            </a>
          </>
        ) : (
          <>{' · '}원본 링크 미제공</>
        )}
      </p>
      {ds.note && (
        <p className={`mt-1.5 rounded-lg bg-slate-50 p-2 text-sm leading-relaxed text-slate-600 dark:bg-slate-800/50 dark:text-slate-300 ${PROSE}`}>
          <span aria-hidden="true">ℹ️ </span>{ds.note}
        </p>
      )}
    </div>
  )
}

/* 블록 껍데기 — 카드마다 조항 라벨을 달아, 스크롤 어디에서 멈춰도 정체를 알 수 있게 한다 */
function Block({
  tag, tone, icon, title, sub, no, children,
}: {
  tag: string; tone: Tone; icon: string; title: string
  sub?: string | null; no?: number; children: ReactNode
}) {
  const T = TONE[tone]
  return (
    <section className={`mt-6 overflow-hidden ${CARD}`}>
      <div className={`flex items-start gap-2.5 p-4 ${T.band}`}>
        <ClauseTag>{tag}</ClauseTag>
        <div className={`h-10 w-1.5 shrink-0 rounded-full ${T.accent}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className={`text-base font-semibold leading-snug ${PROSE} ${T.text}`}>
            <span aria-hidden="true">{icon}</span> {title}
          </h2>
          {sub && <p className={`mt-0.5 text-sm leading-relaxed text-slate-500 ${PROSE}`}>{sub}</p>}
        </div>
        {no != null && (
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">
            근거 <NumChip n={no} />
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

/* ══════════════════════ ★ 근거 시점 지도 ══════════════════════
   이 서비스의 발명을 배지가 아니라 '공간'으로 옮긴 그래픽.
   가로축 = 시간. 막대는 자료가 확인되는 지점까지, 그 '이후'를 상태별로 다르게 그린다.
     live   실선으로 오늘까지 이어짐
     stale  점선 (끊긴 채 이어짐 = 모른다)
     frozen 사선 해치 + 세로 벽 (막힘 = 없다)
   ※ 기획서 축소 인쇄를 견디도록 본문 전폭·h-3 막대·4px 해치·rem 라벨을 쓴다.
      (레일 안 6px 막대 + 10px 라벨은 축소하면 회색 띠로 뭉개진다)                */
function TrackMap({ tracks }: { tracks: Track[] }) {
  const now = Date.now()
  const tmin = Math.min(...tracks.map(t => new Date(t.end).getTime()))
  const span = Math.max(now - tmin, 5 * 365.25 * MS_D)
  const t0 = now - span * 1.1
  const pct = (d: string) =>
    Math.min(95, Math.max(6, ((new Date(d).getTime() - t0) / (now - t0)) * 100))
  const nowD = new Date()

  return (
    <section className={`mt-6 overflow-hidden ${CARD}`}>
      <div className="flex items-start gap-2.5 border-b border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
        <ClauseTag>기준일</ClauseTag>
        <div className="min-w-0 flex-1">
          <h2 className={`text-base font-semibold text-slate-900 dark:text-white ${PROSE}`}>
            <span aria-hidden="true">🕒</span> 근거 시점 지도
          </h2>
          <p className={`mt-0.5 text-sm leading-relaxed text-slate-500 ${PROSE}`}>
            이 답변이 쓴 자료가 각각 <b className="font-medium text-slate-700 dark:text-slate-200">어느 시점까지</b> 확인되는지.
            아래 번호는 근거 카드의 번호와 같습니다.
          </p>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between text-[11px] tabular-nums text-slate-400">
          <span>{new Date(t0).getFullYear()}년</span>
          <span>오늘 {nowD.getFullYear()}.{String(nowD.getMonth() + 1).padStart(2, '0')}</span>
        </div>

        <ol className="mt-2 space-y-5">
          {tracks.map(t => {
            const m = AS_OF[t.level]
            const p = pct(t.end)
            return (
              <li key={t.key}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <NumChip n={t.n} />
                  <span className={`min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 ${PROSE}`}>
                    {t.name}
                  </span>
                  <AsOfPill level={t.level} />
                </div>

                <div className="relative mt-2.5 h-8">
                  {/* 시간축 */}
                  <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-slate-100 dark:bg-slate-800" />
                  {/* 자료가 확인되는 구간 */}
                  <div
                    className={`absolute left-0 top-1/2 h-3 -translate-y-1/2 rounded-l-full ${TONE[m.tone].accent}`}
                    style={{ width: `${p}%` }}
                  />
                  {/* 기준일 '이후' 구간 — 상태별로 완전히 다른 표현 */}
                  {t.level === 'live' && (
                    <div
                      className="absolute right-0 top-1/2 h-3 -translate-y-1/2 rounded-r-full bg-emerald-400"
                      style={{ left: `${p}%` }}
                    />
                  )}
                  {t.level === 'stale' && (
                    <div
                      className="absolute right-0 top-1/2 flex h-3 -translate-y-1/2 items-center"
                      style={{ left: `${p}%` }}
                    >
                      <span className="block w-full border-t-[3px] border-dashed border-amber-500" />
                    </div>
                  )}
                  {t.level === 'frozen' && (
                    <>
                      <div
                        className={`absolute right-0 top-1/2 h-5 -translate-y-1/2 rounded-r-sm ring-1 ring-violet-300 dark:ring-violet-800 ${HATCH}`}
                        style={{ left: `${p}%` }}
                      />
                      <span
                        className="absolute top-0 h-8 w-1 -translate-x-1/2 rounded-full bg-violet-600"
                        style={{ left: `${p}%` }}
                      />
                    </>
                  )}
                  {/* 기준일 마커 — 도형으로도 구분 (● / ○ / ■) */}
                  <span
                    className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 border-2 ${m.shape}`}
                    style={{ left: `${p}%` }}
                    aria-hidden="true"
                  />
                  {/* 오늘 */}
                  <span className="absolute right-0 top-0 h-8 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
                </div>

                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="text-[11px] tabular-nums text-slate-400">기준일 {ym(t.end)}</span>
                  <span className={`shrink-0 text-sm font-medium ${TONE[m.tone].text}`}>
                    {m.after}
                    {t.level !== 'live' && t.gapDays > 30 ? ` (${gapText(t.gapDays)})` : ''}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className={`text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>
            🟡 은 <b className="font-semibold">모른다</b>, 🔒 는 <b className="font-semibold">없다</b> 입니다.
            이 서비스는 두 상태를 같은 것으로 표시하지 않습니다.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {(['live', 'stale', 'frozen'] as Level[]).map(l => {
              const m = AS_OF[l]
              return (
                <li key={l} className="flex items-center gap-2 text-sm text-slate-500">
                  <span className={`h-3.5 w-3.5 shrink-0 border-2 ${m.shape}`} aria-hidden="true" />
                  <b className={`font-medium ${TONE[m.tone].text}`}>{m.icon} {m.label}</b>
                  <span className={`text-slate-500 ${PROSE}`}>— {m.legend}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}

/* 검색 전 안내 / 데스크톱 레일 기본 카드 */
function LegendCard() {
  return (
    <section className={`${CARD} p-4`}>
      <h2 className={`text-base font-semibold text-slate-900 dark:text-white ${PROSE}`}>
        <span aria-hidden="true">🕒</span> 답변마다 ‘자료 기준일’을 붙입니다
      </h2>
      <p className={`mt-1 text-sm leading-relaxed text-slate-500 ${PROSE}`}>
        2026년에 물었는데 2020년 자료를 그냥 말해 버리지 않습니다.
        🟡 은 <b className="font-semibold text-slate-700 dark:text-slate-200">모른다</b>,
        🔒 는 <b className="font-semibold text-slate-700 dark:text-slate-200">없다</b> 입니다.
      </p>
      <ul className="mt-3 space-y-2">
        {(['live', 'stale', 'frozen'] as Level[]).map(l => {
          const m = AS_OF[l]
          return (
            <li key={l} className={`rounded-xl ${m.edge} ${TONE[m.tone].soft} p-3`}>
              <div className="flex items-center gap-2">
                <span className={`h-3.5 w-3.5 shrink-0 border-2 ${m.shape}`} aria-hidden="true" />
                <b className={`text-sm font-semibold ${TONE[m.tone].text}`}>{m.icon} {m.label}</b>
              </div>
              <p className={`mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>{m.verb}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* 데스크톱 레일 — 답변 → 근거 → 출처 추적의 종착점 */
function SourceRail({ tracks }: { tracks: Track[] }) {
  return (
    <section className={`${CARD} p-4`}>
      <h2 className={`text-base font-semibold text-slate-900 dark:text-white ${PROSE}`}>
        <span aria-hidden="true">📎</span> 사용한 공식 출처 {tracks.length}종
      </h2>
      <ul className="mt-3 space-y-3">
        {tracks.map(t => (
          <li key={t.key} className="flex items-start gap-2">
            <NumChip n={t.n} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium leading-snug text-slate-700 dark:text-slate-200 ${PROSE}`}>
                {t.name}
              </p>
              <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                {t.ds.provider} · 기준일 {t.ds.coverageEnd}
              </p>
              {t.ds.url ? (
                <a
                  href={t.ds.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded text-[11px] text-blue-600 underline underline-offset-2 dark:text-blue-400 ${FOCUS}`}
                >
                  원본 데이터 열기
                </a>
              ) : (
                <span className="text-[11px] text-slate-400">원본 링크 미제공</span>
              )}
            </div>
            <span className="shrink-0" aria-hidden="true">{AS_OF[t.level].icon}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ══════════════════════ 판정 헤더 ══════════════════════
   화면 최대 활자는 '상태 라벨'이 아니라 '답 문장'이다.
   주제 종료 공지(topicNotice)가 있으면 그 문장 자체가 답이므로 최상단 헤드라인이 된다. */
function Headline({
  a, q, lm, headText, refOnly = false,
}: { a: NkAnswer; q: string; lm: LevelMeta; headText: string; refOnly?: boolean }) {
  const tn = a.topicNotice
  const frozenTopic = tn?.state === 'frozen'
  const tone: Tone = tn ? (frozenTopic ? 'violet' : 'amber') : lm.tone
  const icon = tn ? (frozenTopic ? '🔒' : '⏸') : lm.icon
  const label = tn ? (frozenTopic ? '종료된 사안' : '중단된 사안') : lm.label
  const T = TONE[tone]

  return (
    <section className={`mt-6 overflow-hidden ${CARD}`} aria-label="확인 결과 요지">
      <div className={`flex gap-3 p-4 lg:p-5 ${T.band}`}>
        <span className={`w-2 shrink-0 rounded-full ${T.accent}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${T.chip}`}>
              <span aria-hidden="true">{icon}</span> {label}
            </span>
            <span className="text-xs font-medium text-slate-500">사실은ON 확인 결과</span>
          </div>
          <h2
            className={`mt-2 text-2xl font-semibold leading-snug lg:text-[1.75rem] lg:leading-[1.35] ${PROSE} ${T.text}`}
          >
            {headText}
          </h2>
          {/* 참고 자료뿐일 때 '근거에 포함되어 있습니다'는 헤드라인과 모순된다 */}
          <p className={`mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>
            {/* 관계망이 답한 경우, 문서를 못 찾았다는 말만 하면 화면이 스스로와 모순된다.
                문서 근거가 없는 것은 사실이므로 지우지 않고, 무엇으로 답했는지를 함께 밝힌다. */}
            {refOnly
              ? (a.relation
                ? '문서 근거는 없습니다 — 동향에 기록된 수행·동행 관계를 집계해 답했습니다'
                : a.Q?.genericOnly
                  ? '주제를 좁히면 더 정확히 찾아 드립니다'
                  : '질문의 핵심어에 걸린 공식 자료는 없습니다')
              : lm.sub}
          </p>
          {tn?.since && (
            <p className="mt-1.5 text-[11px] tabular-nums text-slate-500">
              {frozenTopic ? '종료 시점' : '중단 시점'} {tn.since}
            </p>
          )}
        </div>
      </div>

      <div className="p-4">
        <p className={`text-base leading-relaxed text-slate-800 dark:text-slate-100 ${PROSE}`}>
          <span className="text-slate-400">묻고 계신 것 — </span>“{q}”
        </p>
        {/* 종료 공지가 헤드라인을 차지하지 않은 경우(구체적 답이 있는 경우)에도
            그 사실은 반드시 전달되어야 한다 — 자리만 헤드라인 아래로 내린다 */}
        {tn && tn.text !== headText && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm leading-relaxed ${TONE[tone].soft} ${TONE[tone].text} ${PROSE}`}>
            <span aria-hidden="true">{icon}</span> {tn.text}
          </p>
        )}
        {tn && (
          <p className={`mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>
            {frozenTopic
              ? '→ 아래 수치·기록은 모두 종료 이전의 확정된 값이며, 그 이후의 자료는 존재하지 않습니다.'
              : '→ 아래 기록 이후의 진행 상황은 공식 자료로 확인되지 않습니다.'}
          </p>
        )}
      </div>
    </section>
  )
}

/* ══════════════════════ 수치 주장 대조 ══════════════════════ */
function NumericCompare({ n }: { n: NumericOk }) {
  const u = baseUnit(n.unit)
  const rescaled = !!n.unit && u !== String(n.unit).trim()
  const rows: Array<{ k: string; v: number; hint: string | null; strong: boolean }> = [
    { k: '주장값', v: n.claimed, hint: '질문에 포함된 수치', strong: true },
    { k: '공식 최댓값', v: n.max, hint: `${metricLabel(n.metric)} · 관측 ${nf(n.n)}구간`, strong: false },
    { k: '공식 최솟값', v: n.min, hint: metricLabel(n.metric), strong: false },
    { k: '최종 관측', v: n.latest, hint: n.latestPeriod ? `${n.latestPeriod} 기준` : '기간 미상', strong: false },
  ]
  /* ratioToMax 는 max === 0 일 때 null 이다 — 그대로 toFixed 하면 화면 전체가 죽는다 */
  const ratio = nf1(n.ratioToMax)
  const concl =
    n.verdict === 'above_max'
      ? ratio
        ? `주장값이 공식 최댓값의 ${ratio}배입니다.`
        : `주장값이 공식 관측 최댓값(${nf(n.max)}${u ? ` ${u}` : ''})을 넘어섭니다.`
      : n.verdict === 'below_min'
        ? '주장값이 공식 관측 최솟값보다 작습니다.'
        : '주장값이 공식 관측 범위 안에 있습니다.'
  const ctone: Tone = n.verdict === 'in_range' ? 'blue' : 'rose'

  return (
    <Block
      tag="대조"
      tone="blue"
      icon="📊"
      title="수치 대조"
      sub={`공식 지표 ‘${metricLabel(n.metric)}’ 와 직접 맞춰 봤습니다`}
    >
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(r => (
          <div key={r.k} className="flex flex-wrap items-baseline gap-x-3 py-2.5 first:pt-0">
            <dt className="w-24 shrink-0 text-sm text-slate-500">{r.k}</dt>
            <dd className="min-w-0 flex-1">
              <span
                className={`text-base font-semibold tabular-nums ${PROSE} ${
                  r.strong ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {nf(r.v)}
              </span>
              <span className="ml-1 text-sm text-slate-500">{u || '단위 미표기'}</span>
              {r.hint && <p className={`mt-0.5 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>{r.hint}</p>}
            </dd>
          </div>
        ))}
      </dl>
      <p className={`mt-3 rounded-xl p-3 text-base font-semibold leading-relaxed ${PROSE} ${TONE[ctone].soft} ${TONE[ctone].text}`}>
        <span aria-hidden="true">→ </span>{concl}
      </p>
      {rescaled && (
        <p className={`mt-2 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
          ※ 원자료 지표 ‘{metricLabel(n.metric)}’ 의 배포 단위는 ‘{n.unit}’ 이며, 비교를 위해 네 행 모두 ‘{u}’ 기준으로 환산해 표시했습니다.
        </p>
      )}
      <p className={`mt-1 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
        ※ 이 대조에 쓰인 지표의 자료 기준일은 아래 근거 카드에 표시됩니다.
      </p>
    </Block>
  )
}

/* ══════════════════════ 단위 가족 불일치 — 대조 거부 ══════════════════════ */
function NumericIncomparable({ n }: { n: NumericNo }) {
  const list = Array.isArray(n.related) ? n.related : []
  return (
    <Block tag="대조" tone="blue" icon="⚖" title="직접 대조 불가" sub="틀린 대조를 하느니 하지 않습니다">
      <p className={`text-base leading-relaxed text-slate-800 dark:text-slate-100 ${PROSE}`}>
        주장하신 단위 <b className="font-semibold">{n.wantUnit ?? '(단위 인식 실패)'}</b> 와 같은 단위의 공식 지표가 없어
        ({n.reason}), 잘못된 대조 대신 <b className="font-semibold">관련 지표</b>만 제시합니다.
      </p>
      <p className="mt-1.5 text-sm tabular-nums text-slate-500">
        질문에 나온 수치 {nf(n.claimed)} {n.wantUnit ?? ''}
      </p>

      {list.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {list.map((r, i) => (
            <li key={`${r.metric}-${i}`} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className={`text-sm text-slate-500 ${PROSE}`}>{metricLabel(r.metric)}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 dark:text-white">
                {nf(r.value)}
                <span className="ml-1 text-sm font-normal text-slate-500">{unitLabel(r.unit)}</span>
              </p>
              <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">{ym(r.period)}</p>
            </li>
          ))}
        </ul>
      )}

      {n.derived && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-950 dark:bg-blue-950/20">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
            <span aria-hidden="true">🧮 </span>역산 추정치 · 공식 발표값이 아닙니다
          </p>
          <p className="mt-1 text-xl font-medium tabular-nums text-slate-900 dark:text-white">
            약 {nf(n.derived.value)}
            <span className="ml-1 text-sm font-normal text-slate-500">{unitLabel(n.derived.unit)}</span>
          </p>
          <p className={`mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200 ${PROSE}`}>{n.derived.note}</p>
        </div>
      )}
    </Block>
  )
}

/* ══════════════════════ 관련 정보 (lookupNumeric) ══════════════════════
   lookupNumeric 은 '몇/얼마' 질문이면 친화도가 낮은 지표라도 반환한다.
   따라서 '질문하신 수치'라고 단정하면 안 된다.                              */
function RelatedCard({
  r, no, askedAt, verbose,
}: { r: LookupT; no?: number; askedAt: unknown; verbose: boolean }) {
  const notice = noticeOf(r.record, r.dataset, askedAt)
  return (
    <Block
      tag="참고"
      tone="blue"
      icon="🔎"
      title="관련 정보 — 질문에 대한 직접적인 답은 아닙니다"
      sub={r.substituted ? '질문하신 단위의 공식 지표가 없어 다른 지표로 답합니다' : null}
      no={no}
    >
      {r.note && (
        <p className={`rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-base leading-relaxed text-blue-900 dark:border-blue-950 dark:bg-blue-950/20 dark:text-blue-100 ${PROSE}`}>
          {r.note}
        </p>
      )}
      {r.outOfWindow && (
        <p className={`mt-2 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 ${PROSE}`}>
          <span aria-hidden="true">⚠ </span>
          질문하신 ‘{r.windowLabel ?? '해당 기간'}’ 구간에는 자료가 없어, 전 기간에서 가장 최근 값을 보여 드립니다.
        </p>
      )}
      <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <p className={`text-sm text-slate-500 ${PROSE}`}>{metricLabel(r.metric)}</p>
        <p className="mt-0.5 text-2xl font-medium tabular-nums text-slate-900 dark:text-white">
          {nf(r.value)}
          <span className="ml-1 text-base font-normal text-slate-500">{unitLabel(r.unit)}</span>
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">{ym(r.period)} 기준</p>
      </div>
      <div className="mt-3"><AsOfBanner notice={notice} verbose={verbose} /></div>
      <SourceLine ds={r.dataset} no={no} />
    </Block>
  )
}

/* ══════════════════════ 어휘 (남북 대응어) ══════════════════════
   낱말 하나를 묻는 질문은 문서 랭킹으로 풀 수 없다 — "안녕하세요를 북한말로?"가
   「인민의 안녕」에 걸린 사고가 그 증거다. 사전을 직접 본다.
   ★ 없으면 없다고 말한다. 비슷한 낱말을 답인 척 내놓지 않는다. */
type LexSource = { pairs?: { name: string; provider: string; url?: string }
  terms?: { name: string; provider: string; url?: string } } | null
type LexiconT = {
  kind: 'found' | 'missing'
  word: string
  dir: 'toNK' | 'toKO'
  words?: string[]
  term?: { def: string; cat: string } | null
  near?: Array<[string, string]>
  source: LexSource
}

function LexiconCard({ lex }: { lex: LexiconT }) {
  const toNK = lex.dir === 'toNK'
  const srcName = lex.source?.pairs?.name ?? '남북한 언어비교'
  const provider = lex.source?.pairs?.provider ?? '통일부'

  if (lex.kind === 'found') {
    return (
      <Block tag="어휘" tone="blue" icon="🗣"
        title={`‘${lex.word}’ — ${toNK ? '북한에서 쓰는 말' : '남한에서 쓰는 말'}`}>
        {!!lex.words?.length && (
          <ul className="flex flex-wrap gap-2">
            {lex.words.map(w => (
              <li key={w}
                className="rounded-xl bg-slate-100 px-3 py-1.5 text-lg text-slate-900 dark:bg-slate-800 dark:text-white">
                {w}
              </li>
            ))}
          </ul>
        )}
        {lex.term?.def && (
          <p className={`mt-3 rounded-xl bg-slate-50 p-3 text-base leading-relaxed text-slate-800 dark:bg-slate-800/50 dark:text-slate-100 ${PROSE}`}>
            {lex.term.def}
            {lex.term.cat && <span className="ml-1 text-xs text-slate-400">({lex.term.cat})</span>}
          </p>
        )}
        <p className={`mt-3 text-sm leading-relaxed text-slate-500 ${PROSE}`}>
          통일부가 공개한 남북 대응어 목록에 등재된 표기입니다. 실제 쓰임은 지역·세대에 따라 다를 수 있습니다.
        </p>
        <p className="mt-2 text-[11px] text-slate-400">출처 · {provider} 「{srcName}」</p>
      </Block>
    )
  }

  return (
    <Block tag="어휘" tone="slate" icon="🗣" title={`‘${lex.word}’는 대응어 목록에 없습니다`}>
      <p className={`text-base leading-relaxed text-slate-800 dark:text-slate-100 ${PROSE}`}>
        통일부 「{srcName}」 자료에서 ‘{lex.word}’에 해당하는 항목을 찾지 못했습니다.
        <strong className="font-medium"> 남북이 같은 말을 쓰거나</strong>, 아직 이 자료에 수록되지 않은 낱말입니다.
      </p>
      {/* 비슷한 낱말은 **답이 아니다.** 그렇게 표시한다 — 여기서 얼버무리면 없는 걸 있다고 하는 것이다 */}
      {!!lex.near?.length && (
        <div className="mt-3">
          <p className={`text-sm text-slate-500 ${PROSE}`}>
            혹시 이 낱말을 찾으셨나요 <span className="text-slate-400">— 답이 아니라 비슷한 표제어입니다</span>
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {lex.near.map(([ko, nk]) => (
              <li key={ko}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {ko} <span className="text-slate-400">→</span> {nk}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">출처 · {provider} 「{srcName}」</p>
    </Block>
  )
}

/* ══════════════════════ 관계망 ══════════════════════
   "장성택 누구랑 다녔어" 는 문서 랭킹으로 못 푸는 질문이다 — 문서가 아니라 사람 목록을 원한다.
   근거는 추정이 아니라 통일부가 동향 제목에 적어 놓은 수행·동행 기록 10,917건의 집계다.
   **방향이 곧 서열이다**: 수행받기만 하면 위, 수행만 하면 아래. */
type RelLink = { name: string; w: number; span?: { from: string; to: string; n: number } | null }
type RelSource = { name: string; provider: string; note: string }
/* 두 모양은 필드가 겹치되 개수가 다르다 — 인물 조회는 목록, 쌍 조회는 단건이다.
   판별 유니온으로 두어야 met 이 배열인지 단건인지 컴파일러가 갈라 준다. */
type RelationPerson = {
  kind: 'person'
  subject: string
  pos: string | null
  records: number
  serves: RelLink[]
  served: RelLink[]
  met: RelLink[]
  with: RelLink[]
  servesTotal: number
  servedTotal: number
  rank: 'top' | 'staff' | 'mid' | null
  span: { from: string; to: string } | null
  source: RelSource
}
type RelationPair = {
  kind: 'pair'
  subject: string
  other: string
  subjectServes: RelLink | null
  subjectServed: RelLink | null
  met: RelLink | null
  with: RelLink | null
  /* 서로를 수행한 적은 없지만 같은 사람을 수행한 경우 — a/b 는 각자의 횟수 */
  shared?: Array<{ name: string; a: number; b: number }>
  source: RelSource
}
type RelationT = RelationPerson | RelationPair

const RANK_TEXT: Record<string, string> = {
  top: '수행을 받기만 하는 위치입니다',
  staff: '수행하는 쪽입니다',
  mid: '수행과 피수행이 모두 기록돼 있습니다',
}

function PeopleRow({ label, hint, list }: { label: string; hint: string; list: RelLink[] }) {
  if (!list.length) return null
  return (
    <div className="mt-3">
      <p className={`text-sm text-slate-500 ${PROSE}`}>
        {label} <span className="text-slate-400">— {hint}</span>
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {list.map(x => (
          <li key={x.name}
            className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">
            {x.name}
            <span className="ml-1.5 tabular-nums text-xs text-slate-500">{x.w}회</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RelationCard({ rel, no }: { rel: RelationT; no?: number }) {
  if (rel.kind === 'pair') {
    const a = rel.subject, b = rel.other ?? ''
    const lines: string[] = []
    if (rel.subjectServes) lines.push(`${a}이(가) ${b}을(를) 수행한 기록 ${rel.subjectServes.w}건`)
    if (rel.subjectServed) lines.push(`${b}이(가) ${a}을(를) 수행한 기록 ${rel.subjectServed.w}건`)
    if (rel.met) lines.push(`접견·회담 등으로 함께 기록된 것 ${rel.met.w}건`)
    if (rel.with) lines.push(`같은 기록에 함께 등장한 것 ${rel.with.w}건`)
    const shared = rel.shared ?? []
    if (!lines.length && shared.length) lines.push('두 사람이 서로를 수행한 기록은 없습니다.')
    return (
      <Block tag="관계" tone="blue" icon="🔗" title={`${a} · ${b} — 동향에 기록된 접점`} no={no}>
        <ul className={`space-y-1 text-base leading-relaxed text-slate-800 dark:text-slate-100 ${PROSE}`}>
          {lines.map(t => <li key={t}>· {t}</li>)}
        </ul>
        {/* 직접 접점이 없을 때의 진짜 답 — 같은 윗선을 모셨다는 사실 */}
        {shared.length > 0 && (
          <div className="mt-3">
            <p className={`text-sm text-slate-500 ${PROSE}`}>
              둘 다 수행한 인물 <span className="text-slate-400">— 공통의 윗선</span>
            </p>
            <ul className="mt-1.5 space-y-1">
              {shared.map(x => (
                <li key={x.name}
                  className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  {x.name}
                  <span className="ml-2 tabular-nums text-xs text-slate-500">
                    {a} {nf(x.a)}회 · {b} {nf(x.b)}회
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className={`mt-3 text-sm leading-relaxed text-slate-500 ${PROSE}`}>{rel.source.note}</p>
        <p className="mt-2 text-[11px] text-slate-400">출처 · {rel.source.provider} 「{rel.source.name}」</p>
      </Block>
    )
  }

  const rank = rel.rank ? RANK_TEXT[rel.rank] : null
  return (
    <Block
      tag="관계"
      tone="blue"
      icon="🔗"
      title={`${rel.subject} — 동향에 함께 기록된 사람들`}
      sub={rel.pos ?? null}
      no={no}
    >
      <p className={`text-base leading-relaxed text-slate-800 dark:text-slate-100 ${PROSE}`}>
        동향 {nf(rel.records ?? 0)}건에 등장합니다.
        {rank ? ` 수행 기록으로 보면 ${rank}.` : ''}
      </p>
      {/* 순서가 중요하다 — 이 사람이 수행한 대상(위)이 먼저, 이 사람을 수행한 사람(아래)이 뒤 */}
      <PeopleRow label="이 사람이 수행한 대상" hint="윗선" list={rel.serves ?? []} />
      <PeopleRow label="이 사람을 수행한 사람" hint="아랫선" list={rel.served ?? []} />
      <PeopleRow label="접견·회담" hint="대등한 자리" list={rel.met ?? []} />
      <PeopleRow label="같은 기록에 함께" hint="동시 등장" list={rel.with ?? []} />
      <p className={`mt-3 text-sm leading-relaxed text-slate-500 ${PROSE}`}>{rel.source.note}</p>
      <p className="mt-2 text-[11px] text-slate-400">출처 · {rel.source.provider} 「{rel.source.name}」</p>
    </Block>
  )
}

/* ══════════════════════ 집계 · 분포 ══════════════════════ */
function AggCard({
  agg, no, askedAt, verbose,
}: { agg: AggT; no?: number; askedAt: unknown; verbose: boolean }) {
  const notice = noticeOf(agg.record, agg.dataset, askedAt)
  const gender = agg.genderFilter && agg.genderFilter !== '전체' ? ` — ${agg.genderFilter}성` : ''
  const title =
    agg.mode === 'distribution' ? `${agg.dimName ?? '항목'}별 분포`
      : agg.mode === 'max' ? '가장 많은 항목'
        : agg.mode === 'min' ? '가장 적은 항목'
          : '합계'
  /* 엔진이 dims 에 해당 키를 못 채우는 경우가 실재한다 — undefined 를 그대로 찍지 않는다 */
  const pickKey = agg.mode === 'max' ? agg.peak?.key : agg.low?.key
  const pickVal = agg.mode === 'max' ? agg.peak?.value : agg.low?.value
  const items = Array.isArray(agg.items) ? agg.items : []

  return (
    <Block tag="집계" tone="blue" icon="📊" title={`${title}${gender}`} sub={metricLabel(agg.metric)} no={no}>
      {agg.outOfWindow && (
        <p className={`mb-3 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 ${PROSE}`}>
          <span aria-hidden="true">⚠ </span>
          {agg.future
            ? `‘${agg.windowLabel}’은 아직 오지 않은 시점입니다. 아래는 그 시점의 값이 아니라, 현재까지 확인된 ${ym(agg.asOfDate)} 기준 집계입니다.`
            : agg.hasPeriodic === false
              ? `이 지표에는 기간별 수치가 없습니다. 아래는 ‘${agg.windowLabel}’ 값이 아니라 ${ym(agg.asOfDate)} 기준 집계값입니다.`
              : `‘${agg.windowLabel}’ 구간의 자료는 확인되지 않아, ${ym(agg.asOfDate)} 기준 값을 보여 드립니다.`}
        </p>
      )}
      {agg.mode === 'distribution' ? (
        <>
          <ul className="space-y-3">
            {items.map((it, i) => (
              <li key={`${it.key}-${i}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`min-w-0 text-base font-medium text-slate-800 dark:text-slate-100 ${PROSE}`}>
                    {it.key}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-slate-600 dark:text-slate-300">
                    <b className="text-base font-semibold text-slate-900 dark:text-white">{nf(it.value)}</b>
                    <span className="ml-0.5 text-slate-500">{agg.unit ?? ''}</span>
                    <span className="ml-2 text-slate-500">{(it.share * 100).toFixed(1)}%</span>
                  </span>
                </div>
                {/* 최소 비율 3.87% 가 실재하므로 하한 가드가 필요하다 */}
                <div className="mt-1.5 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                  <div
                    className={`h-2.5 rounded-full ${i === 0 ? 'bg-blue-600' : 'bg-blue-400 dark:bg-blue-500'}`}
                    style={{ width: `${Math.max(2, it.share * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] tabular-nums text-slate-400">
            합계 {nf(agg.total)}{agg.unit ?? ''} · {items.length}개 항목
          </p>
        </>
      ) : agg.mode === 'max' || agg.mode === 'min' ? (
        <>
          <p className={`text-sm text-slate-500 ${PROSE}`}>
            {agg.dimName ?? '구간'} 기준 {agg.mode === 'max' ? '가장 큰' : '가장 작은'} 값
          </p>
          <p className={`mt-1 text-xl font-semibold text-slate-900 dark:text-white ${PROSE}`}>
            {pickKey ?? '(구분값 미기재)'}
          </p>
          <p className="mt-0.5 text-2xl font-medium tabular-nums text-slate-900 dark:text-white">
            {nf(pickVal)}
            <span className="ml-1 text-base font-normal text-slate-500">{unitLabel(agg.unit)}</span>
          </p>
          {pickKey == null && (
            <p className={`mt-1 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
              원자료에 해당 구분값이 비어 있어 항목명을 표시하지 못했습니다.
            </p>
          )}
          <p className="mt-2 text-[11px] tabular-nums text-slate-400">
            비교 대상 {nf(agg.count)}개 구간 · 전체 합계 {nf(agg.sum)}{agg.unit ?? ''}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-medium tabular-nums text-slate-900 dark:text-white">
            {nf(agg.sum)}
            <span className="ml-1 text-base font-normal text-slate-500">{unitLabel(agg.unit)}</span>
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-slate-400">
            {agg.dimName ?? '구간'} {nf(agg.count)}개 합산
          </p>
        </>
      )}
      <div className="mt-3"><AsOfBanner notice={notice} verbose={verbose} /></div>
      <SourceLine ds={agg.dataset} no={no} />
    </Block>
  )
}

/* ══════════════════════ 원문 링크 ══════════════════════
   지금까지 출처 링크가 **데이터셋 페이지**(data.go.kr 의 API 문서)로만 갔다.
   사용자가 원하는 건 "그 글이 실제로 적힌 페이지"다.
   레코드별 sourceUrl 을 갖고 있는 자료가 실제로 있다(실측):
     briefing·trendDaily·accord·포털동향 → 개별 글 주소 ✅
     timeline·kjuAct·hist·people        → 원본이 CSV/API 라 개별 페이지가 없다
   그래서 **레코드 주소가 데이터셋 주소와 다를 때만** 원문 링크를 붙인다.

   본문 절단(…)과도 한 세트다. 웹 인덱스는 본문을 220자에서 자르므로 '펼치기'로
   더 보여줄 원본이 애초에 없다. 잘렸다는 사실을 숨기지 말고 원문으로 보낸다. */
function RecordLink({ r, ds }: { r: any; ds?: NkDataset }) {
  const u = r?.sourceUrl
  if (!u || u === ds?.url) return null
  const truncated = typeof r.body === 'string' && r.body.endsWith('…')
  return (
    <a
      href={u}
      target="_blank"
      rel="noreferrer"
      className={`mt-1 inline-flex items-center gap-1 rounded text-[11px] text-blue-600 underline underline-offset-2 dark:text-blue-400 ${FOCUS}`}
    >
      {truncated ? '원문 전체 보기' : '원문 보기'}
      <span aria-hidden="true">↗</span>
    </a>
  )
}

/* ══════════════════════ 연혁 ══════════════════════ */
function TimelineItem({ it }: { it: NonNullable<NkAnswer['items']>[number] }) {
  const lv = asLevel(it.notice?.level)
  const m = AS_OF[lv]
  const title = clean(it.r.title)
  const body = clean(it.r.body)
  return (
    <li className="relative">
      <span
        className={`absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${m.dot}`}
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <time className="text-sm font-medium tabular-nums text-slate-500" dateTime={it.r.occurredOn ?? undefined}>
          {it.r.occurredOn ?? '일자 미상'}
        </time>
        <AsOfPill level={lv} />
      </div>
      {/* 제목이 본문보다 커야 한다 (FontScale 확대 시에도 유지되도록 둘 다 rem) */}
      <p className={`mt-1 text-base font-semibold leading-snug text-slate-900 dark:text-white ${PROSE}`}>{title}</p>
      {body && body !== title && (
        <p className={`mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>{body}</p>
      )}
      <p className={`mt-1.5 text-[11px] text-slate-400 ${PROSE}`}>
        {it.ds?.name}
        <RecordLink r={it.r} ds={it.ds} />
      </p>
    </li>
  )
}

function TimelineCard({ a }: { a: NkAnswer }) {
  const items = a.items ?? []
  const sources = a.sources ?? []
  const mix = items.reduce<Record<string, number>>((m, it) => {
    const k = asLevel(it.notice?.level)
    m[k] = (m[k] ?? 0) + 1
    return m
  }, {})
  const mixKeys = (['live', 'stale', 'frozen'] as Level[]).filter(k => mix[k])
  const head = items.slice(0, 8)
  const rest = items.slice(8)

  return (
    <Block
      tag="연혁"
      tone="blue"
      icon="🗓"
      title={`공식 기록 ${nf(items.length)}건 (시간순)`}
      sub={`관련 ${nf(a.available ?? items.length)}건 중 최신순`}
    >
      {a.widened && items.length > 0 && (
        <p className={`mb-3 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 ${PROSE}`}>
          <span aria-hidden="true">⚠ </span>
          ‘{a.Q?.win?.label ?? '요청하신 기간'}’ 구간의 자료가 부족해 전 기간에서 최신순으로 보여 드립니다.
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <p className={`text-base font-semibold text-slate-800 dark:text-slate-100 ${PROSE}`}>
            <span aria-hidden="true">📭 </span>날짜가 확인되는 기록이 없어 연혁을 만들 수 없습니다.
          </p>
          <p className={`mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>
            관련 자료는 찾았지만, 시간순으로 나열할 수 있는 <b className="font-semibold">발생 일자</b>가 기록된 자료가 없습니다.
            사건이 없었다는 뜻이 아니라, 날짜가 함께 공개된 자료가 없다는 뜻입니다.
          </p>
        </div>
      ) : (
        <>
          {mixKeys.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <span className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>
                이 목록은 자료 기준 상태가 섞여 있습니다
              </span>
              {mixKeys.map(k => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <AsOfPill level={k} />
                  <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{mix[k]}건</span>
                </span>
              ))}
            </div>
          )}

          <ol className="relative ml-1 space-y-5 border-l border-slate-200 pl-4 dark:border-slate-700">
            {head.map((it, i) => <TimelineItem key={`${it.r.id}-${i}`} it={it} />)}
          </ol>

          {rest.length > 0 && (
            <details className="group mt-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <summary
                className={`flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden ${FOCUS}`}
              >
                나머지 {nf(rest.length)}건 더 보기
                <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-180">▾</span>
              </summary>
              <ol className="relative ml-4 space-y-5 border-l border-slate-200 py-4 pl-4 pr-3 dark:border-slate-700">
                {rest.map((it, i) => <TimelineItem key={`${it.r.id}-r${i}`} it={it} />)}
              </ol>
            </details>
          )}
        </>
      )}

      {sources.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-2 dark:border-slate-800">
          <p className="mt-1 text-sm font-medium text-slate-500">
            <span aria-hidden="true">📚 </span>이 목록이 사용한 공식 출처 {sources.length}곳
          </p>
          {sources.map((s, i) => <SourceLine key={s.name} ds={s} no={i + 1} />)}
        </div>
      )}
    </Block>
  )
}

/* ══════════════════════ 근거 그룹 ══════════════════════ */
function GroupCard({ g, no, verbose, refOnly = false }: { g: Group; no: number; verbose: boolean; refOnly?: boolean }) {
  const lv = asLevel(g.notice?.level)
  const m = AS_OF[lv]
  const T = TONE[m.tone]
  const measures = (g.measures ?? []).filter(
    (x, i, arr) => arr.findIndex(y => y.metric === x.metric && y.periodStart === x.periodStart) === i,
  )
  const shown = measures.slice(0, 4)
  const head = g.hits?.[0]?.r

  return (
    <section className={`mt-6 overflow-hidden ${CARD}`}>
      <div className={`flex items-start gap-2.5 p-4 ${T.band}`}>
        <ClauseTag>{refOnly ? '참고' : '근거'}</ClauseTag>
        <div className={`h-10 w-1.5 shrink-0 rounded-full ${T.accent}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <NumChip n={no} />
            {/* 근거의 정체성인 데이터셋명은 자르지 않는다 (최장 18자) */}
            <h3 className={`min-w-0 flex-1 text-base font-semibold leading-snug ${PROSE} ${T.text}`}>{g.ds?.name}</h3>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <AsOfPill level={lv} />
            <span className="text-[11px] tabular-nums text-slate-500">
              기준일 {head?.coverageEnd ?? g.ds?.coverageEnd}
            </span>
            <span className="text-[11px] tabular-nums text-slate-400">적중 {g.hits?.length ?? 0}건</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        <AsOfBanner notice={g.notice} verbose={verbose} />

        {shown.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-slate-500">이 자료에 담긴 수치</p>
            <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {shown.map((mm, i) => (
                <li key={`${mm.metric}-${mm.periodStart ?? i}-${i}`} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className={`text-sm text-slate-500 ${PROSE}`}>
                    {metricLabel(mm.metric)}
                    {mm.dims && (
                      <span className="ml-1 text-[11px] text-slate-400">
                        ({Object.entries(mm.dims).map(([k, v]) => `${k} ${String(v)}`).join(' · ')})
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 dark:text-white">
                    {nf(mm.value)}
                    <span className="ml-1 text-sm font-normal text-slate-500">{unitLabel(mm.unit)}</span>
                  </p>
                  {mm.periodStart && (
                    <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">{mm.periodStart} 기준</p>
                  )}
                </li>
              ))}
            </ul>
            {measures.length > shown.length && (
              <p className="mt-2 text-[11px] text-slate-400">
                이 자료에서 확인된 수치 {measures.length}개 중 4개만 표시
              </p>
            )}
          </div>
        )}

        <ul className="mt-3 space-y-2">
          {(g.hits ?? []).map(h => {
            const title = clean(h.r.title)
            const body = clean(h.r.body)
            return (
              <li key={h.r.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {h.r.isLatestInDataset && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      이 자료의 최종 관측
                    </span>
                  )}
                  <time className="text-[11px] tabular-nums text-slate-400" dateTime={h.r.occurredOn ?? undefined}>
                    {h.r.occurredOn ?? '일자 미상'}
                  </time>
                </div>
                <p className={`mt-1 text-base font-semibold leading-snug text-slate-900 dark:text-white ${PROSE}`}>{title}</p>
                {body && body !== title && (
                  <p className={`mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>{body}</p>
                )}
                <RecordLink r={h.r} ds={g.ds} />
              </li>
            )
          })}
        </ul>

        <SourceLine ds={g.ds} no={no} />
      </div>
    </section>
  )
}

/* ══════════════════════ 페이지 ══════════════════════ */

export default function SasilOn() {
  const [ix, setIx] = useState<any>(null)
  const [q, setQ] = useState('')
  const [a, setA] = useState<NkAnswer | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  /* LLM 중간계층은 /api/llm 프록시가 살아 있을 때만 켠다.
     없으면 규칙 계층만으로 그대로 동작한다 — 화면에는 아무 차이가 없다. */
  const [llmOn, setLlmOn] = useState(false)
  useEffect(() => { probeLLM().then((ok: boolean) => setLlmOn(!!ok)).catch(() => {}) }, [])

  useEffect(() => {
    let alive = true
    /* 인덱스가 두 파일로 나뉘어 있다 — Cloudflare Pages 자산 상한이 25 MiB 라
       한 덩어리로는 배포가 거부되고 이전 버전이 조용히 서빙된다(실제로 그렇게 됐었다).
       병렬로 받아 합친다. measures 는 gzip 0.29MB 라 체감 비용이 거의 없다. */
    const grab = (u: string) =>
      fetch(u).then(r => { if (!r.ok) throw new Error(`${u} 로드 실패 (${r.status})`); return r.json() })
    /* 관계망은 **없어도 되는 것**이다 — 못 받으면 관계 답변만 꺼지고 검색은 그대로 돈다.
       그래서 셋 중 이것만 실패를 삼킨다. 있으면 되고 없으면 마는 축이다. */
    const grabOpt = (u: string) => grab(u).catch(() => null)
    /* 포털동향 42,788건은 같은 값을 반복하므로 열 단위로 압축해 실려 온다
       ([id, topic, title, body, pk] + 공통값 defaults). 여기서 되펼친다.
       레코드마다 다 넣으면 28.3MB 로 Cloudflare 자산 상한(25MiB)을 넘어 배포가 거부된다. */
    const expandTrend = (p: any) => {
      if (!p?.rows?.length) return []
      const d = p.defaults ?? {}
      /* ★ defaults 를 통째로 펼친다. 손으로 나열하면 빠뜨리고, 빠진 필드는
         랭킹에서 조용히 NaN 이 되어 **정렬 전체**를 무너뜨린다(2026-08-13 실측 사고). */
      return p.rows.map((r: any[]) => ({
        ...d,
        id: r[0], topic: r[1], title: r[2], body: r[3],
        occurredOn: null, len0: r[5] ?? undefined,
        sourceUrl: r[4] ? String(d.urlTemplate).replace('{pk}', String(r[4])) : null,
      }))
    }
    Promise.all([grab('/nk-index.json'), grab('/nk-measures.json'),
      grabOpt('/nk-graph.json'), grabOpt('/nk-trend.json'), grabOpt('/nk-lexicon.json')])
      .then(([idx, m, g, tr, lex]) => {
        if (!alive) return
        setIx(buildIndex({
          ...idx,
          records: [...(idx.records ?? []), ...expandTrend(tr)],
          measures: m.measures ?? [], graph: g, lexicon: lex,
        }))
      })
      .catch(e => { if (alive) setErr(e?.message ?? '인덱스를 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [])

  const stats = useMemo(() => {
    if (!ix) return null
    const ds = Object.values(ix.data.datasets ?? {}) as NkDataset[]
    return {
      records: (ix.data.records ?? []).length,
      measures: (ix.data.measures ?? []).length,
      datasets: ds.filter(d => d.status !== 'pending').length,
      pending: ds.filter(d => d.status === 'pending').length,
      frozen: ds.filter(d => d.freshness === 'frozen').length,
    }
  }, [ix])

  const groups = (a?.groups ?? []) as Group[]
  const numeric = (a?.numeric ?? null) as NumericT | null
  const related = (a?.related ?? null) as LookupT | null
  const agg = (a?.agg ?? null) as AggT | null
  const relation = (a?.relation ?? null) as RelationT | null
  const lexicon = (a?.lexicon ?? null) as LexiconT | null
  const askedAt = a?.Q?.askedAt

  /* 답변이 사용한 자료를 하나의 시간축 위로 모은다. 번호 = 근거 카드 번호 */
  const tracks = useMemo<Track[]>(() => {
    if (!a) return []
    const out: Track[] = []
    const seen = new Set<string>()
    const push = (ds: NkDataset | null | undefined, notice: Notice, end?: string | null) => {
      const at = end ?? ds?.coverageEnd
      if (!ds || !at || seen.has(ds.name)) return
      seen.add(ds.name)
      out.push({
        key: ds.name, n: out.length + 1, name: ds.name,
        level: asLevel(notice.level), end: at, gapDays: notice.gapDays ?? 0, ds,
      })
    }
    for (const g of groups) push(g.ds, g.notice, g.hits?.[0]?.r.coverageEnd ?? g.ds?.coverageEnd)
    for (const s of a.sources ?? []) push(s, noticeOf(null, s, askedAt))
    if (agg?.dataset) push(agg.dataset, noticeOf(agg.record, agg.dataset, askedAt))
    if (related?.dataset) push(related.dataset, noticeOf(related.record, related.dataset, askedAt))
    return out
  }, [a]) // eslint-disable-line react-hooks/exhaustive-deps

  const noOf = (ds?: NkDataset | null) => (ds ? tracks.find(t => t.name === ds.name)?.n : undefined)

  /* as-of 전문 설명은 레벨별 '첫 등장'에만. 이후 카드는 축약 꼬리표만 쓴다.
     (렌더 순서: 관련정보 → 집계 → 근거그룹) */
  const verboseSlots = useMemo(() => {
    const out = new Set<string>()
    if (!a) return out
    const seenLv = new Set<string>()
    const mark = (slot: string, lvl: string) => {
      if (seenLv.has(lvl)) return
      seenLv.add(lvl)
      out.add(slot)
    }
    if (related?.dataset) mark('related', noticeOf(related.record, related.dataset, askedAt).level)
    if (agg?.dataset) mark('agg', noticeOf(agg.record, agg.dataset, askedAt).level)
    for (const g of groups) mark(`g:${g.dsKey}`, asLevel(g.notice?.level))
    return out
  }, [a]) // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => (a ? summarize(a) : null), [a])

  useEffect(() => {
    if (a && typeof window !== 'undefined' && window.innerWidth < 1024) {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [a])

  /* ?q= 퍼머링크 — 팩트체크 결과는 공유되어야 의미가 있다.
     인덱스가 준비된 뒤 한 번만 실행한다. */
  const bootstrapped = useRef(false)
  useEffect(() => {
    if (!ix || bootstrapped.current) return
    bootstrapped.current = true
    const q0 = new URLSearchParams(window.location.search).get('q')?.trim()
    if (!q0) return
    if (inputRef.current) inputRef.current.value = q0
    void run(q0)
  }, [ix]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(text: string) {
    const t = String(text ?? '').trim()
    if (!ix || !t) return
    const id = ++seq.current
    setQ(t)
    setErr(null)
    setBusy(true)
    try {
      const res = await answerAsync(ix, t, llmOn ? { llm: llmAdapter } : undefined)
      if (id !== seq.current) return
      setA(res)
      window.history.replaceState(null, '', `?q=${encodeURIComponent(t)}`)
    } catch (e: any) {
      if (id !== seq.current) return
      setA(null)
      setErr(e?.message ?? '대조 중 오류가 발생했습니다.')
    } finally {
      if (id === seq.current) setBusy(false)
    }
  }

  function pick(text: string) {
    if (inputRef.current) inputRef.current.value = text
    void run(text)
  }

  /* 엔진이 새 level 을 추가해도 결과가 백지가 되지 않도록 폴백을 둔다 */
  const lm: LevelMeta = a ? (LEVEL_META[a.level] ?? LEVEL_FALLBACK) : LEVEL_FALLBACK
  const outOfDomain = a?.Q?.inDomain === false
  /* 아직 못 실은 자료가 답할 질문인가 — "없다"와 "우리가 아직 못 가져왔다"는 다르다.
     '안녕하세요 북한말로?' 는 통일부 「남북한 언어비교」가 답할 질문이지, 자료가 없는 질문이 아니다. */
  const pendingSource = useMemo(() => {
    const hints = ix?.data?.pendingHints
    if (!hints || !q) return null
    for (const [key, h] of Object.entries(hints) as [string, any][]) {
      try { if (new RegExp(h.re).test(q)) return { key, ...h } } catch { /* 잘못된 정규식은 무시 */ }
    }
    return null
  }, [ix, q])

  /* 변별 어휘가 하나도 안 걸린 질의 — 아래 자료는 근거가 아니라 참고다 */
  const refOnly = !!(a?.Q?.weakMatch ?? a?.Q?.genericOnly) && groups.length > 0
  const headText =
    summary ??
    (outOfDomain
      /* "다루는 분야가 아닙니다" 라고 단정하지 않는다 — 거짓이 될 수 있다.
         '방사능 폐수'는 통일부가 실제로 보도설명자료를 낸 주제인데(평산 우라늄공장),
         우리 적재분에 '방사능'이 0건이라 걸리지 않았을 뿐이다.
         엔진이 실제로 판정한 것은 '주제'가 아니라 '이 질문에서 연결 신호를 못 찾았다'이다. */
      ? '북한·통일 자료와 연결되는 내용을 찾지 못했습니다.'
      : '관련 통일부 공식 자료를 찾지 못했습니다.')
  const evidenceCount = a ? (a.level === 'timeline' ? (a.sources ?? []).length : groups.length) : 0

  return (
    <div className="pb-4">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ══ 본문 ══ */}
        <div className="min-w-0">
          <header className={PROSE}>
            <p className="text-xs font-semibold tracking-wide text-blue-700 dark:text-blue-400">
              통일부 공공데이터 기반 북한·통일 팩트체커
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-snug text-slate-900 dark:text-white">
              국민이 묻고 <span className="text-blue-700 dark:text-blue-400">국가 공식자료</span>가 답합니다
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              모든 답변에 <b className="font-semibold text-slate-800 dark:text-slate-100">그 자료가 언제까지 확인된 것인지</b>를 함께 표시합니다.
            </p>
          </header>

          <form
            className={`mt-5 ${CARD} p-3`}
            onSubmit={e => { e.preventDefault(); void run(inputRef.current?.value ?? '') }}
          >
            <label htmlFor="son-q" className="block px-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              궁금한 주장이나 질문을 그대로 입력하세요
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="son-q"
                ref={inputRef}
                defaultValue={q}
                type="text"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="예) 개성공단 아직 하냐"
                className={`min-w-0 flex-1 rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white ${FOCUS}`}
              />
              <button
                type="submit"
                disabled={!ix || busy}
                className={`shrink-0 rounded-xl bg-blue-700 px-6 py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-40 sm:w-32 ${FOCUS}`}
              >
                {!ix ? '준비 중' : busy ? '대조 중' : '확인'}
              </button>
            </div>
            {(!ix || busy) && !err && (
              <p className="mt-2 flex items-center gap-2 px-1 text-sm text-slate-500">
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500"
                />
                {!ix ? '통일부 공식자료 색인을 불러오는 중…' : '공식 자료와 대조하는 중…'}
              </p>
            )}
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="self-center text-xs text-slate-400">예시</span>
            {EXAMPLES.map(x => (
              <button
                key={x}
                type="button"
                disabled={!ix}
                onClick={() => pick(x)}
                className={`rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition active:scale-95 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${FOCUS}`}
              >
                {x}
              </button>
            ))}
          </div>

          {!a && stats && (
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: '데이터셋', v: `${stats.datasets}종`, h: `API 연계 예정 ${stats.pending}종` },
                { k: '공식 기록', v: nf(stats.records), h: '건' },
                { k: '수치', v: nf(stats.measures), h: '건' },
                { k: '종료 확정', v: `${stats.frozen}종`, h: '🔒 이후 데이터 없음' },
              ].map(s => (
                <div key={s.k} className={`${CARD} p-4`}>
                  <dt className="text-xs text-slate-500">{s.k}</dt>
                  <dd className="mt-0.5 text-2xl font-medium tabular-nums text-slate-900 dark:text-white">{s.v}</dd>
                  <dd className={`text-[11px] text-slate-400 ${PROSE}`}>{s.h}</dd>
                </div>
              ))}
            </dl>
          )}

          {err && (
            <div
              role="alert"
              className={`mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-base leading-relaxed text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200 ${PROSE}`}
            >
              <span aria-hidden="true">⚠ </span>{err}
            </div>
          )}

          <div ref={resultRef} className="scroll-mt-24">
            {a && (
              <section aria-label="확인 결과">
                <p role="status" aria-live="polite" className="sr-only">
                  대조 완료. {lm.label}. {headText}
                </p>

                {/* ① 요지 + 주제 종료/중단 공지 — 무엇을 묻든 최상단 */}
                <Headline a={a} q={q} lm={lm} headText={headText} refOnly={refOnly} />

                {/* ② 근거 시점 지도 — 근거가 2종 이상일 때만 (1종이면 막대 한 줄짜리 과잉) */}
                {tracks.length >= 2 && <TrackMap tracks={tracks} />}

                {/* 메타 — 잡음이 되지 않게 최소한만 */}
                {a.level !== 'no_evidence' && (
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-slate-400">
                    <span>{refOnly ? '참고 자료' : '근거 데이터셋'} {evidenceCount}종</span>
                    {a.totalHits != null && <span>검색 적중 {nf(a.totalHits)}건</span>}
                    {a.Q?.win?.label && <span>조회 구간 {a.Q.win.label}</span>}
                    {a.llmUsed && a.llmUsed.length > 0 && <span>AI 보정 적용 ({a.llmUsed.join(', ')})</span>}
                  </p>
                )}

                {/* ③ 근거 없음 */}
                {a.level === 'no_evidence' && (
                  <Block
                    tag="안내"
                    tone="slate"
                    icon="📭"
                    title={outOfDomain ? '북한·통일 자료와 연결되는 내용을 찾지 못했습니다' : '관련 통일부 공식 자료를 찾지 못했습니다'}
                    sub={outOfDomain ? '이 서비스는 북한·통일 분야 공공데이터만 근거로 씁니다' : null}
                  >
                    <p className={`text-base leading-relaxed text-slate-800 dark:text-slate-100 ${PROSE}`}>
                      {outOfDomain
                        ? '질문에 북한·통일과 이어지는 말이 없으면 답하지 않습니다. 대상을 구체적으로 적거나(예: ‘평산 우라늄’) ‘북한’을 함께 적어 주시면 찾을 수 있습니다.'
                        : '근거가 없어서 확인할 수 없다는 뜻이며, 주장이 거짓이라는 의미가 아닙니다. 근거가 없을 때 억지로 판정하지 않는 것이 이 서비스의 원칙입니다.'}
                    </p>
                    <div className="mt-3 rounded-xl border border-dashed border-blue-300 bg-blue-50/40 p-3.5 dark:border-blue-900/60 dark:bg-blue-950/10">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                        이렇게 물어보면 답할 수 있습니다
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {EXAMPLES.slice(0, 3).map(x => (
                          <button
                            key={x}
                            type="button"
                            onClick={() => pick(x)}
                            className={`rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${FOCUS}`}
                          >
                            {x}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Block>
                )}

                {/* ④ 수치 대조 */}
                {numeric && numeric.comparable && <NumericCompare n={numeric} />}
                {numeric && numeric.comparable === false && <NumericIncomparable n={numeric} />}

                {/* ⑤ 관련 정보 */}
                {related && (
                  <RelatedCard
                    r={related}
                    no={noOf(related.dataset)}
                    askedAt={askedAt}
                    verbose={verboseSlots.has('related')}
                  />
                )}

                {/* ⑤-a 어휘 — 낱말 질문은 문서가 아니라 사전이 답한다 */}
                {lexicon && <LexiconCard lex={lexicon} />}

                {/* ⑤-b 관계망 — 근거가 0건이어도 답할 수 있는 유일한 축이다 */}
                {relation && <RelationCard rel={relation} />}

                {/* ⑥ 집계·분포 */}
                {agg && (
                  <AggCard
                    agg={agg}
                    no={noOf(agg.dataset)}
                    askedAt={askedAt}
                    verbose={verboseSlots.has('agg')}
                  />
                )}

                {/* ⑦ 연혁 */}
                {a.level === 'timeline' && <TimelineCard a={a} />}

                {/* 아직 연동하지 못한 자료가 답할 질문 — 못 찾았을 때만 알린다.
                    pending_only 는 엔진이 "준비된 자료로는 답할 수 없다"고 판정한 경우다. */}
                {pendingSource && (refOnly || a.level === 'no_evidence' || a.level === 'pending_only') && (
                  <Block tag="안내" tone="blue" icon="🔌"
                    title={`이 질문은 「${pendingSource.name}」 자료가 답할 수 있습니다`}
                    sub="통일부에 있는 자료이지만 아직 싣지 못했습니다">
                    <p className={`text-base leading-relaxed text-slate-800 dark:text-slate-100 ${PROSE}`}>
                      해당 공개 API가 현재 응답하지 않아(서비스 연결 오류) 연동을 완료하지 못했습니다.
                      자료가 존재하지 않는다는 뜻이 아니라, <b>이 서비스가 아직 가져오지 못했다</b>는 뜻입니다.
                      복구되는 대로 이 안내는 사라지고 해당 자료로 답하게 됩니다.
                    </p>
                    {pendingSource.url && (
                      <p className="mt-2 text-[11px]">
                        <a className="text-blue-700 underline dark:text-blue-400"
                           href={pendingSource.url} target="_blank" rel="noreferrer">
                          공공데이터포털에서 원본 보기
                        </a>
                      </p>
                    )}
                  </Block>
                )}

                {/* ⑧ 근거 그룹 */}
                {groups.length > 0 && (
                  <>
                    {/* 질의의 핵심어가 코퍼스에 하나도 안 걸렸으면 이건 '근거'가 아니라 '참고'다.
                        헤드라인만 참고라고 하고 여기서 근거라고 부르면 화면이 스스로와 모순된다. */}
                    <h2 className="mt-8 text-base font-semibold text-slate-800 dark:text-slate-100">
                      <span aria-hidden="true">{refOnly ? '🔎 ' : '📚 '}</span>
                      {refOnly ? `참고 자료 ${groups.length}종 (근거 아님)` : `이 답변의 근거 ${groups.length}종`}
                    </h2>
                    {refOnly ? (
                      /* 주제를 안 지정한 것과, 지정했는데 없는 것을 갈라 말한다.
                         같은 문구를 쓰면 "북한 요즘 뭐함" 처럼 자료가 있는 질문에도
                         '못 찾았다'고 말하게 된다. 헤드라인·상태줄과 같은 규칙이다. */
                      <p className="mt-0.5 text-sm text-slate-500">
                        {a.Q?.genericOnly
                          ? '주제를 지정하지 않으셔서, 관련 있는 자료를 참고용으로 보여 드립니다.'
                          : '질문의 핵심어가 공식 자료에 걸리지 않아, 주제만 같은 자료를 참고용으로 보여 드립니다.'}
                      </p>
                    ) : tracks.length >= 2 ? (
                      <p className="mt-0.5 text-sm text-slate-500">번호는 위 ‘근거 시점 지도’의 번호와 같습니다.</p>
                    ) : null}
                    {groups.map((g, i) => (
                      <GroupCard key={g.dsKey} g={g} no={i + 1} verbose={verboseSlots.has(`g:${g.dsKey}`)} refOnly={refOnly} />
                    ))}
                  </>
                )}

                {/* ⑨ 면책 — 항상 마지막 */}
                <p className={`mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-[11px] leading-relaxed text-slate-400 dark:border-slate-800 dark:bg-slate-800/30 ${PROSE}`}>
                  본 결과는 통일부 공개 데이터와의 자동 대조 결과이며 최종적인 사실 판단이 아닙니다.
                  북한 관련 정보의 특성상 공식 자료에 수록되지 않은 사실이 존재할 수 있습니다.
                </p>
              </section>
            )}
          </div>

          {/* 모바일: 검색 전 3상태 안내 */}
          {!a && (
            <div className="mt-6 lg:hidden">
              <LegendCard />
            </div>
          )}
        </div>

        {/* ══ 데스크톱 우측 레일 ══ */}
        <aside className="mt-8 hidden space-y-5 lg:sticky lg:top-24 lg:mt-1 lg:block" aria-label="이 답변의 자료 요약">
          <LegendCard />
          {tracks.length > 0 && <SourceRail tracks={tracks} />}
        </aside>

        {/* 모바일: 결과가 있을 때만 출처 요약을 하단에 */}
        {tracks.length > 0 && (
          <div className="mt-6 lg:hidden">
            <SourceRail tracks={tracks} />
          </div>
        )}
      </div>
    </div>
  )
}