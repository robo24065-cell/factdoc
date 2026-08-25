/* ────────────────────────────────────────────────────────────────
   참여(/pick) — 항목 타입과 통일부 실측 수치 읽기

   ★ 수치의 단일 진실 소스는 frontend/public/gohyang/analysis.json 이다.
     · 기록 계승 우선순위  = legacy-priority 카드 (순위합 — 점수가 아니라 정렬)
     · 남은 분·1인당 기록  = record-density-gap 카드의 table
     여기서는 **옮겨 적기만** 한다. 재계산·보간·가중 없음. 값이 갱신되면 따라간다.
     as-of 없는 수치를 내보내지 않는다 — asOf 가 없으면 통째로 실패시킨다.
   ──────────────────────────────────────────────────────────────── */

import { PACK } from '../components/gohyang/pack-types'
import pickItems from '../data/pick-items'

/* ══════════ 항목 (scripts/nk-pick-items.mjs 산출물) ══════════ */

export type PickFood = {
  id: string; name: string; desc: string; region: string; regionId: string
  basis: string; source: string; sourceName: string
  attribution: { kind: 'folk'; label: string }
}
export type PickScenery = {
  id: string; fileId: string; name: string; caption: string
  region: string; regionId: string; regionBasis: string
  provider: string; thumbUrl: string; viewUrl: string; sourceUrl: string
  attribution: { kind: 'site'; label: string; note: string }
}
export type PickWord = { id: string; ko: string; nk: string; pk: number }

export const ITEMS = pickItems as unknown as {
  builtAt: string
  regionsOld: Array<{ id: string; name: string }>
  crosswalkNote: string | null
  foods: PickFood[]
  sceneries: PickScenery[]
  words: {
    nonRegional: true
    note: string
    total: number
    attribution: { kind: 'mou'; label: string }
    pairs: PickWord[]
  }
  gallerySource: { url: string | null; collectedAt: string | null }
}

export const REGION_NAME = new Map(ITEMS.regionsOld.map(r => [r.id, r.name]))
export const REGION_ID = new Map(ITEMS.regionsOld.map(r => [r.name, r.id]))

/* ══════════ 통일부 실측 수치 (analysis.json 확정값 옮겨 적기) ══════════ */

export type RegionStat = {
  id: string
  name: string
  /** 기록 계승 우선순위 1~7 (순위합 오름차순 — 점수가 아니라 정렬) */
  rank: number
  /** 세 축 순위합 — 작을수록 우선 */
  rankSum: number
  /** 원적 생존 신청자(명) */
  survivors: number
  /** 생존자 1인당 공식 기록(건) */
  density: number
}

export type PickStats = {
  asOf: string
  regions: RegionStat[]
  byId: Map<string, RegionStat>
  /** 1인당 기록 최상위 — 격차 문장의 비교 기준 */
  densityMax: RegionStat
  /** legacy-priority 의 「점수가 아니라 정렬」 주의 원문 */
  rankCaveat: string
  /** record-density-gap findings 의 격차 표현 원문 (예: "13.9배") */
  gapValue: string
}

type Card = {
  id: string
  asOf?: string
  caveats?: string[]
  findings?: Array<{ label: string; value: string; note?: string }>
  series?: Array<{ key: string; label: string; rows?: Array<{ x: string; y: number }>; points?: Array<{ x: string; y: number }> }>
  table?: Array<Record<string, unknown>>
}

let cache: Promise<PickStats | null> | null = null

/** analysis.json 을 한 번만 읽는다. 실패하면 null — 화면은 수치 구획을 감춘다. */
export function loadPickStats(): Promise<PickStats | null> {
  if (!cache) cache = fetchStats().catch(() => null)
  return cache
}

async function fetchStats(): Promise<PickStats | null> {
  const r = await fetch(`${PACK}/analysis.json`)
  if (!r.ok) return null
  const j = (await r.json()) as { cards?: Card[] }
  const lp = j.cards?.find(c => c.id === 'legacy-priority')
  const rd = j.cards?.find(c => c.id === 'record-density-gap')
  if (!lp || !rd || !lp.asOf) return null

  const pr = lp.series?.find(s => s.key === 'priority')?.rows ?? []
  if (pr.length !== 7) return null
  /* rows 는 이미 순위합 오름차순으로 확정돼 있다 — 여기서 다시 정렬하지 않고,
     혹시 순서가 흔들려도 순위가 값에서 나오도록 순위합으로 안정 정렬만 한다. */
  const ranked = [...pr].sort((a, b) => a.y - b.y)

  const tbl = rd.table ?? []
  const regions: RegionStat[] = ranked.map((row, i) => {
    const name = row.x
    const id = REGION_ID.get(name)
    const t = tbl.find(x => x['고향'] === name)
    if (!id || !t) throw new Error('region mismatch')
    return {
      id,
      name,
      rank: i + 1,
      rankSum: row.y,
      survivors: Number(t['생존자']),
      density: Number(t['밀도']),
    }
  })
  if (regions.some(x => !Number.isFinite(x.survivors) || !Number.isFinite(x.density))) return null

  const densityMax = [...regions].sort((a, b) => b.density - a.density)[0]
  const gap = rd.findings?.find(f => f.label === '격차')?.value ?? ''
  return {
    asOf: lp.asOf,
    regions,
    byId: new Map(regions.map(x => [x.id, x])),
    densityMax,
    rankCaveat: lp.caveats?.[0] ?? '고향 7개를 줄 세운 값이라 점수가 아니라 순서입니다.',
    gapValue: gap,
  }
}

/* ══════════ 공용 유틸 ══════════ */

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 직전에 게임을 끝낸 고향 — 기기 안(sessionStorage)에만 남고 서버로 가지 않는다 */
const LAST_KEY = 'pick_last_home'
export function rememberLastHome(regionId: string | null) {
  try {
    if (regionId) sessionStorage.setItem(LAST_KEY, regionId)
  } catch { /* 무해 */ }
}
export function lastHome(): string | null {
  try { return sessionStorage.getItem(LAST_KEY) } catch { return null }
}
