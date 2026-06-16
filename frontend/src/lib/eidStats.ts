// 감염병 현황판 데이터(EDW 주별)에서 파생 통계 — 어드민·유행·현황판 공용.
import { EID_CUR_YEAR, EID_YEARS, EID_WEEKLY_DISEASES, EID_GROUP, EID_WK_NAT, EID_SEXAGE } from '../data/eid-region'

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

// 특정 질병의 최신 발생현황(최근 4주, 2026 현재주차) — Disease 상세 '발생 현황' 패널용(옛 Supabase 2024 대체).
export function eidDiseaseLatest(name: string): { year: string; week: number; count: number; pct: number; trend: OutbreakItem['trend'] } | null {
  const { year, week, rows } = eidLatestOutbreak()
  if (!week) return null
  const nn = name.replace(/\s+/g, '')
  const row = rows.find((r) => { const rn = r.name.replace(/\s+/g, ''); return rn.includes(nn) || nn.includes(rn) })
  return row ? { year, week, count: row.count, pct: row.pct, trend: row.trend } : null
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

// '50대' → '50~59'(EID_SEXAGE 연령대 키). 90대 이상은 '90~'.
export function ageLabelToBand(age: string): string | null {
  const m = age.match(/(\d+)\s*대/)
  if (!m) return null
  const d = parseInt(m[1], 10)
  if (d >= 90) return '90~'
  if (d >= 10 && d <= 80) return `${d}~${d + 9}`
  return null
}

export interface PeerItem { name: string; grp: string; count: number; growthPct: number; surging: boolean }
// ★내 또래 감염병 — 사용자 연령대(+성별)에서 최근 많이 발생한 감염병 Top N. 지금 급증중이면 surging 플래그.
// 제미나이가 구조적으로 못 내는 답('당신 또래에서 지금 이게 많다'). EID_SEXAGE(연령/성별 실데이터)에서 결정론 산출.
export function eidPeerTop(age: string, sex: 'male' | 'female' | '', max = 3): { band: string; rows: PeerItem[] } | null {
  const band = ageLabelToBand(age)
  if (!band) return null
  const growth = new Map(eidGrowthSignal(0).rows.map((r) => [r.name, r.growthPct]))
  const years = EID_YEARS.slice(-2) // 최근 2개 연도(현재+직전) — 동적(내년이면 자동 전진). 진행중 연도+직전 전체연도로 최신성·안정성 균형
  const rows: PeerItem[] = []
  for (const d of Object.keys(EID_SEXAGE)) {
    let count = 0
    for (const y of years) {
      const cell = EID_SEXAGE[d]?.[y]?.[band]
      if (cell) count += sex === 'female' ? cell.f : sex === 'male' ? cell.m : cell.m + cell.f
    }
    if (count <= 0) continue
    const name = cleanName(d)
    const g = growth.get(name) ?? 0
    rows.push({ name, grp: EID_GROUP[d] || '', count, growthPct: g, surging: g >= 20 })
  }
  rows.sort((a, b) => b.count - a.count)
  return { band, rows: rows.slice(0, max) }
}
