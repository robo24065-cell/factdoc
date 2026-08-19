/* ────────────────────────────────────────────────────────────────
   고향잇기 — 표기 유틸 (GohyangOn.tsx 에서 순수 이동, 동작 무변경)

   수치·날짜·원자료 문자열을 화면 문장으로 바꾸는 규칙이 전부 여기 있다.
   씬 파일이 여럿으로 갈라져도 같은 값은 같은 모양으로 찍혀야 한다.
   ──────────────────────────────────────────────────────────────── */

import { asOfNotice, type NkRecord, type Notice } from '../../engine/nk-search.mjs'
import type { Level } from './pack-types'

export function nf(v: unknown): string {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ko-KR') : '—'
}
export function nf1(v: unknown): string {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '—'
}
/* '2026-05-31' → '2026년 5월' */
export function ymKo(d?: string | null): string {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}년 ${Number(m[2])}월` : '기준일 미상'
}
/* '2025-08-24' → '2025년 8월 24일' */
export function ymdKo(d?: string | null): string {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : '일자 미상'
}
export function gapText(days?: number | null): string {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return '0개월'
  let y = Math.floor(days / 365.25)
  let mo = Math.round((days - y * 365.25) / 30.44)
  if (mo >= 12) { y += 1; mo = 0 }
  if (y <= 0) return `${Math.max(1, mo)}개월`
  return mo >= 1 ? `${y}년 ${mo}개월` : `${y}년`
}
/* 원자료 정제 — 연표 제목에 전각 쉼표(U+FF0C)가 그대로 들어 있다
   (조사 처리 josa() 는 theme/gohyang.ts 에 있다 — 화면 전체가 같은 규칙을 쓴다) */
export function clean(s?: string | null): string {
  return String(s ?? '')
    .replace(/，/g, ', ').replace(/．/g, '. ')
    .replace(/～/g, '~').replace(/－/g, '-').replace(/･/g, '·')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/* 수집 원자료에는 편집자 표시 글리프(★ ⚠)가 섞여 있다.
   ⚠(U+26A0)는 플랫폼에 따라 컬러 이모지로 렌더되므로 화면에 내보내기 전에 뗀다
   (theme/gohyang.ts 제약 ① — 이 화면의 렌더링 이모지는 0개여야 한다). */
export function plain(s?: string | null): string {
  return String(s ?? '')
    .replace(/[★☆⚠]️?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/* 박물관 생산일자 — 원문 표기를 그대로 보존한 값이라 형태가 여러 가지다(실측).
   '1987.03.24' · '1997.00.00'(월일 미상) · '0000.00.00'(전체 미상) · '2003.09' · '2015' · '-' · null
   없는 것을 있는 것처럼 채우지 않는다. 모르는 자리는 잘라내고 모르면 '미상'이라고 쓴다. */
export function museumDate(v?: string | null): string {
  const s = String(v ?? '').trim()
  if (!s || s === '-' || /^0{4}/.test(s)) return '생산일자 미상'
  const [y, mo, d] = s.split('.')
  if (!/^\d{4}$/.test(y)) return '생산일자 미상'
  const M = mo && /^\d{1,2}$/.test(mo) && Number(mo) > 0 ? Number(mo) : null
  const D = d && /^\d{1,2}$/.test(d) && Number(d) > 0 ? Number(d) : null
  if (M == null) return `${y}년`
  if (D == null) return `${y}년 ${M}월`
  return `${y}년 ${M}월 ${D}일`
}

/* '사진류 > 인화사진' → '사진류 · 인화사진' */
export function formKo(v?: string | null): string {
  return String(v ?? '').split('>').map(s => s.trim()).filter(Boolean).join(' · ')
}

/* 기준일 문구는 엔진 asOfNotice 하나만 쓴다 — 재구현하면 엔진이 문구를 고칠 때 화면만 갈라진다.
   (asOfNotice 가 읽는 필드는 coverageEnd / freshness / frozenReason 셋뿐이다) */
export function notice(coverageEnd: string, freshness: Level, frozenReason?: string | null): Notice {
  const rec = { coverageEnd, freshness, frozenReason: frozenReason ?? null } as unknown as NkRecord
  const n = asOfNotice(rec, new Date())
  return { ...n, level: (n.level === 'live' || n.level === 'frozen' ? n.level : 'stale') as Level }
}
