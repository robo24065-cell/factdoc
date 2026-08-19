/* ────────────────────────────────────────────────────────────────
   고향잇기 — 공통 조각 (GohyangOn.tsx 에서 순수 이동, 동작 무변경)

   as-of 배지·기준일 줄·원문 링크·구획 틀처럼 모든 씬이 함께 쓰는 조각.
   팔레트·활자는 theme/gohyang.ts 가 단일 진실 소스이고, 여기는 그 토큰을
   이 화면이 쓰는 이름(TONE·AS_OF)으로 옮겨 붙인 얇은 층이다.
   ──────────────────────────────────────────────────────────────── */

import type { ReactNode } from 'react'
import { SURFACE, TYPE, TEXT, ASOF, PROSE as T_PROSE, FOCUS as T_FOCUS, TAP_INLINE } from '../../theme/gohyang'
import type { Level, Tone } from './pack-types'
import { gapText } from './format'
import type { Notice } from '../../engine/nk-search.mjs'

export const FOCUS = T_FOCUS
export const CARD = SURFACE.card
export const PROSE = T_PROSE

/* 색의 역할을 다시 정했다.
    as-of 3상태(jade/ember/seal)만 **기능색**이고, 나머지는 전부 종이·먹색이다.
     예전에는 정보 카드까지 파랑이라 화면 전체가 파랗고, 정작 중요한
     '이 자료가 언제 것인가'가 묻혔다. 중립을 늘려서 기능색이 눈에 들어오게 한다. */
export const TONE: Record<Tone, { band: string; accent: string; text: string; soft: string; chip: string }> = {
  emerald: {
    band: ASOF.live.band, accent: ASOF.live.bar,
    text: ASOF.live.text, soft: 'bg-[#f4faf7] dark:bg-[#0f231a]',
    chip: ASOF.live.chip,
  },
  amber: {
    band: ASOF.stale.band, accent: ASOF.stale.bar,
    text: ASOF.stale.text, soft: 'bg-[#fdf8ee] dark:bg-[#241a0a]',
    chip: ASOF.stale.chip,
  },
  violet: {
    band: ASOF.frozen.band, accent: ASOF.frozen.bar,
    text: ASOF.frozen.text, soft: 'bg-[#f6f4fb] dark:bg-[#181428]',
    chip: ASOF.frozen.chip,
  },
  // 정보 계열 — 파랑을 버리고 종이/먹으로 간다
  blue: {
    band: 'bg-[#f5f7fa] dark:bg-[#14181e]', accent: 'bg-[#1a4e9c] dark:bg-[#7aa9e8]',
    text: TEXT.ink, soft: 'bg-[#f9fafc] dark:bg-[#14181e]',
    chip: 'bg-[#eef3fb] text-[#1a4e9c] ring-1 ring-[#cfdcef] dark:bg-[#16202c] dark:text-[#7aa9e8] dark:ring-[#27364a]',
  },
  slate: {
    band: 'bg-[#f5f7fa] dark:bg-[#14181e]', accent: 'bg-[#b6bcc5] dark:bg-[#39414c]',
    text: TEXT.soft, soft: 'bg-[#f9fafc] dark:bg-[#14181e]',
    chip: 'bg-[#eef1f5] text-[#555555] ring-1 ring-[#dcdfe4] dark:bg-[#1a1f26] dark:text-[#a4acb6] dark:ring-[#2a2f36]',
  },
}

/* as-of 3상태 — 색·도형·라벨 3중 부호화. 이모지 대신 도형 글리프를 쓴다:
   이모지는 기기마다 모양이 달라지고 흑백 인쇄에서 뭉개진다. */
export const AS_OF: Record<Level, { tone: Tone; icon: string; label: string; verb: string; edge: string }> = {
  live: {
    tone: 'emerald', icon: ASOF.live.glyph, label: ASOF.live.label,
    verb: '현재 시점까지 확인되는 자료입니다.',
    edge: 'border-l-[3px] border-solid border-[#136c43] dark:border-[#5fc99a]',
  },
  stale: {
    tone: 'amber', icon: ASOF.stale.glyph, label: ASOF.stale.label,
    verb: '이 시점 이후의 상황은 확인되지 않았습니다. 아래 값은 당시의 값이며 현재 값이 아닙니다. — 없다는 뜻이 아니라 모른다는 뜻입니다.',
    edge: 'border-l-[3px] border-dashed border-[#b06a00] dark:border-[#e3ac5b]',
  },
  frozen: {
    tone: 'violet', icon: ASOF.frozen.glyph, label: ASOF.frozen.label,
    verb: '활동 자체가 종료되어 이 시점 이후의 데이터는 존재하지 않습니다. 아래 값이 확정된 최종값입니다.',
    edge: 'border-l-[3px] border-double border-[#4a3f7a] dark:border-[#a99ce0]',
  },
}

/* 단계별 채색 — Tailwind 는 소스에 **문자 그대로** 있는 클래스만 생성한다.
   `fill-[${hex}]` 같은 동적 조합은 빌드에서 사라지므로 정적 문자열 표로 둔다.
   종이색 → 먹색으로 어두워지는 한 계열이라 "짙을수록 크다"가 설명 없이 읽히고,
   무채색으로 떨어뜨려도 밝기가 단조 증가해 색맹·흑백에서도 순서가 남는다. */
export const CHORO = [
  'fill-[#f0f1f3] dark:fill-[#181c22]',   // 0 — 해당 축에 집계 항목 없음
  'fill-[#cfdcef] dark:fill-[#1d2937]',
  'fill-[#a8c2e2] dark:fill-[#27384d]',
  'fill-[#7ba1d2] dark:fill-[#345170]',
  'fill-[#4b79bb] dark:fill-[#456f9b]',
  'fill-[#1a4e9c] dark:fill-[#5b8dc7]',
]
export const CHORO_SWATCH = [
  'bg-[#f0f1f3] dark:bg-[#181c22]',
  'bg-[#cfdcef] dark:bg-[#1d2937]',
  'bg-[#a8c2e2] dark:bg-[#27384d]',
  'bg-[#7ba1d2] dark:bg-[#345170]',
  'bg-[#4b79bb] dark:bg-[#456f9b]',
  'bg-[#1a4e9c] dark:bg-[#5b8dc7]',
]

export function AsOfPill({ level, size = 'md' }: { level: Level; size?: 'md' | 'sm' }) {
  const m = AS_OF[level]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${TONE[m.tone].chip} ${
        size === 'sm' ? 'text-[11px]' : 'text-xs'
      }`}
    >
      <span aria-hidden="true">{m.icon}</span>
      <span className="sr-only">자료 기준 등급: </span>
      {m.label}
    </span>
  )
}

export function AsOfLine({ n, verbose = false }: { n: Notice; verbose?: boolean }) {
  const lv = n.level as Level
  const m = AS_OF[lv]
  const T = TONE[m.tone]
  return (
    <div className={`rounded-xl ${m.edge} ${T.soft} p-2.5`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <AsOfPill level={lv} size="sm" />
        {lv !== 'live' && (n.gapDays ?? 0) > 30 && (
          <span className="text-[11px] tabular-nums text-slate-500">
            {lv === 'frozen' ? '종료 후' : '미확인'} {gapText(n.gapDays)} 경과
          </span>
        )}
      </div>
      <p className={`mt-1 text-sm font-medium leading-relaxed ${PROSE} ${T.text}`}>{n.text}</p>
      {verbose && <p className={`mt-1 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>{m.verb}</p>}
    </div>
  )
}

/* 원문 링크 — SasilOn 의 RecordLink 관례. 실제 웹페이지가 있을 때만 붙이고,
   없으면 '원본 링크 미제공'이라고 쓴다(있는 척하지 않는다).

   ★ 글자는 11px 이지만 **누르는 자리는 48px** 이다(theme TAP_INLINE).
     실측(2026-08-19)에서 「원본↗」 13개가 36.5×16.5px, 「박물관에서 보기↗」 24개가
     95.3×17.6px 였다 — 손이 떨리는 어르신에게는 사실상 못 누르는 링크다.
     히트영역만 투명하게 넓히는 방식(::after 겹치기)은 같은 열에 세로로 늘어선
     이웃 링크를 가려 오히려 오작동을 만들어서 쓰지 않는다. 줄 상자를 실제로 키운다. */
export function OutLink({ href, children }: { href?: string | null; children: ReactNode }) {
  if (!href) return <span className="text-[11px] text-slate-400">원본 링크 미제공</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${TAP_INLINE} gap-1 rounded px-1 text-[11px] text-blue-600 underline underline-offset-2 dark:text-blue-400 ${FOCUS}`}
    >
      {children}
      <span aria-hidden="true">↗</span>
    </a>
  )
}

export function ClauseTag({ children }: { children: ReactNode }) {
  return (
    <span className="mt-0.5 shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold tracking-wider text-slate-500 dark:border-slate-600 dark:text-slate-400">
      {children}
    </span>
  )
}

/* 구획 — 정부 누리집의 관용 표현을 따른다: 분류 라벨 + 남색 세로 막대 + 제목.
   그림 아이콘은 쓰지 않는다(§토큰 제약 ①). 위계는 활자 굵기와 선으로만 만든다. */
export function Block({ tag, tone, title, sub, children }: {
  tag: string; tone: Tone; title: string; sub?: string | null; children: ReactNode
}) {
  const T = TONE[tone]
  return (
    <section className={`overflow-hidden ${CARD}`}>
      <div className={`flex items-start gap-2.5 border-b p-5 ${SURFACE.hair} ${T.band}`}>
        <ClauseTag>{tag}</ClauseTag>
        <div className={`h-9 w-[3px] shrink-0 ${T.accent}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className={`${TYPE.h2} ${PROSE} ${T.text}`}>{title}</h2>
          {sub && <p className={`mt-1 ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>{sub}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <span className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>{label}</span>
      <span className="shrink-0 text-right">
        <b className="text-base font-semibold tabular-nums text-slate-900 dark:text-white">{value}</b>
        {sub && <span className="ml-1 text-[11px] text-slate-400">{sub}</span>}
      </span>
    </div>
  )
}
