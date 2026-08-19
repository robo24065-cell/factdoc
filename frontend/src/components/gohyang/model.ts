/* ────────────────────────────────────────────────────────────────
   고향잇기 — 패널·사료 조인 (GohyangOn.tsx 에서 순수 이동, 동작 무변경)

   현행 1개 지역이든 구행정구역 1개(=현행 2~3개 묶음)든 같은 모양으로 만든다.
   화면이 두 갈래로 갈라지지 않게, 합치는 일을 여기서 한 번만 한다.
   지도 패널·기억 카드·한걸음씩 모드가 전부 이 조인을 공유한다 — 계산이
   흩어지면 같은 고향이 화면마다 다른 값을 갖게 된다.
   ──────────────────────────────────────────────────────────────── */

import type { Mode, MuseumRec, NkRegionData, Pack, Sel, Weather } from './pack-types'

export type PanelModel = {
  kind: Mode
  title: string
  sub: string
  memberNames: string[]
  note: string | null
  weather: Array<Weather & { region: string }>
  frozen: Array<{ region: string; topic: string; reason: string; since: string }>
  defector: { male: number; female: number; total: number; asOf: string; cumulativeSince: string } | null
  defectorMissing: string[]
  isanKey: { key: string; name: string; monthlyKey: string; latestKey: string } | null
  events: Array<{ date: string; title: string }>
  eventsTotal: number
  briefings: number
  trends: number
  overviews: number
}

export function membersOf(sel: Sel, region: NkRegionData): string[] {
  if (sel.mode === 'modern') return region.regions[sel.key] ? [sel.key] : []
  return Object.keys(region.regions).filter(k => region.regions[k].isanOrigin?.key === sel.id)
}

export function buildPanel(sel: Sel, pack: Pack): PanelModel | null {
  const names = membersOf(sel, pack.region)
  if (!names.length) return null
  const infos = names.map(n => pack.region.regions[n])

  const oldDef = sel.mode === 'old' ? pack.map.regionsOld.find(o => o.id === sel.id) : null
  if (sel.mode === 'old' && !oldDef) return null

  const events = infos
    .flatMap((r, i) => r.events.latest.map(e => ({ ...e, region: names[i] })))
    .filter((e, i, arr) => arr.findIndex(x => x.date === e.date && x.title === e.title) === i)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const defParts = infos.filter(r => r.defectorOrigin)
  const defector = defParts.length
    ? {
        male: defParts.reduce((s, r) => s + (r.defectorOrigin?.male ?? 0), 0),
        female: defParts.reduce((s, r) => s + (r.defectorOrigin?.female ?? 0), 0),
        total: defParts.reduce((s, r) => s + (r.defectorOrigin?.total ?? 0), 0),
        asOf: defParts[0].defectorOrigin!.asOf,
        cumulativeSince: defParts[0].defectorOrigin!.cumulativeSince,
      }
    : null

  return {
    kind: sel.mode,
    title: sel.mode === 'old' ? oldDef!.name : sel.key,
    sub:
      sel.mode === 'old'
        ? `광복 당시 구행정구역 · 현행 ${names.join('·')}`
        : `현행 행정구역${infos[0].mapNote ? ` · ${infos[0].mapNote}` : ''}`,
    memberNames: names,
    note: sel.mode === 'old' ? (oldDef!.note ?? null) : (infos[0].mapNote ?? null),
    weather: infos.flatMap((r, i) => (r.weather ?? []).map(w => ({ ...w, region: names[i] }))),
    frozen: infos.flatMap((r, i) => (r.frozen ? [{ ...r.frozen, region: names[i] }] : [])),
    defector,
    defectorMissing: names.filter(n => !pack.region.regions[n].defectorOrigin),
    isanKey: infos.find(r => r.isanOrigin)?.isanOrigin ?? null,
    events,
    eventsTotal: infos.reduce((s, r) => s + r.events.total, 0),
    briefings: infos.reduce((s, r) => s + r.briefings, 0),
    trends: infos.reduce((s, r) => s + r.trends, 0),
    overviews: infos.reduce((s, r) => s + r.overviews, 0),
  }
}

/* ══════════════════════ 박물관 사료 조인 ══════════════════════

   통일부 남북이산가족 디지털박물관의 공개 사료 4,342건 중, 본문에 북한 지명이
   확인된 1,445건만 이 화면이 지역에 걸 수 있다. 나머지 2,897건은 고향이 없어서가
   아니라 **본문에 지명이 적혀 있지 않아서** 걸 자리가 없는 것이다 — 화면이 그렇게 말한다. */

export type MuseumBundle = {
  hometown: MuseumRec[]
  venue: MuseumRec[]
  historic: MuseumRec[]
  historicKeys: string[]
  total: number
}

/** 사료 목록 안에서의 정렬 — 상세를 받은 건(전 필드 보유)을 앞에 둔다. */
export function museumOrder(a: MuseumRec, b: MuseumRec): number {
  const rank = (r: MuseumRec) => (r.source === 'collectionDetail' ? 0 : 1)
  return rank(a) - rank(b) || a.iId - b.iId
}

export function museumFor(sel: Sel, pack: Pack): MuseumBundle {
  const m = pack.museum
  const byId = new Map(m.records.map(r => [r.iId, r]))
  const pick = (ids?: number[]) => (ids ?? []).map(i => byId.get(i)).filter((r): r is MuseumRec => Boolean(r))

  const members = membersOf(sel, pack.region)
  const oldId = sel.mode === 'old' ? sel.id : pack.region.regions[sel.key]?.isanOrigin?.key ?? null

  const direct = new Map<number, MuseumRec>()
  members.forEach(n => pick(m.byRegion[n]).forEach(r => direct.set(r.iId, r)))

  /* 구(舊)도명 — 광복 당시 표기라 현행 13축으로 확정할 수 없어 따로 묶는다.
     historicToOld 는 데이터 팩이 검증한 대응표다(화면에서 만들어 내지 않는다). */
  const historicKeys = oldId
    ? Object.keys(m.meta.historicToOld).filter(k => (m.meta.historicToOld[k] ?? []).includes(oldId))
    : []
  const historic = new Map<number, MuseumRec>()
  historicKeys.forEach(k => pick(m.byRegionHistoric[k]).forEach(r => { if (!direct.has(r.iId)) historic.set(r.iId, r) }))

  const all = [...direct.values()]
  return {
    hometown: all.filter(r => !r.venueOnly).sort(museumOrder),
    venue: all.filter(r => r.venueOnly).sort(museumOrder),
    historic: [...historic.values()].sort(museumOrder),
    historicKeys,
    total: all.length + historic.size,
  }
}

/* 사료 이미지는 **경유로를 통해** 부른다.
   박물관 서버가 JPEG 를 Content-Type: text/html + nosniff 로 보내서 Chromium 의 ORB 가
   막는다 — 실측 2026-08-19: 실제 Chrome 에서 onerror, iOS Safari 는 ORB 가 없어 그냥 보였다
   ("모바일에선 보이는데 PC 에선 안 보인다"의 원인). /api/museum-img 는 원본 바이트를
   저장 없이 흘려보내며 Content-Type 만 실제 값으로 고친다. */
export function imgSrcOf(r: MuseumRec): string | null {
  if (!r.imageUrl) return null
  const m = r.imageUrl.match(/file_id=(\d+)/)
  return m ? `/api/museum-img?file_id=${m[1]}` : r.imageUrl
}

/* 기증 경로를 맨 앞으로 — 실태조사 1순위 요청(기록물 수집 보존)에 직접 답하는 행동이기 때문 */
export const DONATION_FIRST = ['life-record-donation', 'museum-donation']
