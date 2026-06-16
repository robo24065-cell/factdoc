// 감염병 현황판 데이터(EDW 주별)에서 파생 통계 — 어드민·유행·현황판 공용.
import { EID_CUR_YEAR, EID_WEEKLY_DISEASES, EID_GROUP, EID_WK_NAT } from '../data/eid-region'

const cleanName = (d: string) => d.replace(/^@/, '')
function lastWeekIdx(): number {
  let last = -1
  for (const d of EID_WEEKLY_DISEASES) { const a = EID_WK_NAT[d]; if (a) for (let i = a.length - 1; i >= 0; i--) { if (a[i] > 0) { if (i > last) last = i; break } } }
  return last
}
const sum = (a: number[] | undefined, s: number, e: number) => { let t = 0; if (a) for (let i = Math.max(0, s); i <= e; i++) t += a[i] || 0; return t }

export interface OutbreakItem { name: string; grp: string; count: number; prior: number; pct: number; trend: 'up' | 'down' | 'flat' }
// 최신 주차 기준 '최근 4주' 발생 현황(신고지연 보정). 어드민·유행 공용. pct=직전4주 대비 증감%.
export function eidLatestOutbreak(): { year: string; week: number; rows: OutbreakItem[] } {
  const last = lastWeekIdx()
  if (last < 0) return { year: EID_CUR_YEAR, week: 0, rows: [] }
  const ws = Math.max(0, last - 3)
  const rows = EID_WEEKLY_DISEASES.map((d) => {
    const a = EID_WK_NAT[d]
    const recent = sum(a, ws, last), prior = sum(a, ws - 4, ws - 1)
    const pct = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : (recent > 0 ? 100 : 0)
    return { name: cleanName(d), grp: EID_GROUP[d], count: recent, prior, pct, trend: (recent > prior * 1.1 ? 'up' : recent < prior * 0.9 ? 'down' : 'flat') as OutbreakItem['trend'] }
  }).filter((r) => r.count > 0).sort((x, y) => y.count - x.count)
  return { year: EID_CUR_YEAR, week: last + 1, rows }
}

export interface GrowthItem { name: string; grp: string; recent: number; prior: number; growthPct: number }
// ★급증 신호(조기경보) — 최근 4주 합 vs 직전 4주 합 증가율. 노이즈 방지로 최소 발생수 필터.
export function eidGrowthSignal(minRecent = 20): { week: number; rows: GrowthItem[] } {
  const last = lastWeekIdx()
  if (last < 0) return { week: 0, rows: [] }
  const ws = Math.max(0, last - 3)
  const rows = EID_WEEKLY_DISEASES.map((d) => {
    const a = EID_WK_NAT[d]
    const recent = sum(a, ws, last), prior = sum(a, ws - 4, ws - 1)
    const growthPct = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : (recent > 0 ? 999 : 0)
    return { name: cleanName(d), grp: EID_GROUP[d], recent, prior, growthPct }
  }).filter((r) => r.recent >= minRecent && r.growthPct > 0).sort((x, y) => y.growthPct - x.growthPct)
  return { week: last + 1, rows }
}
