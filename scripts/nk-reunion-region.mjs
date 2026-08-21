#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   고향잇기 — 이산가족정보통합시스템 신규 수집분의 ① 중복 판정 ② 고향 7종 축 대응

   왜 이 파일이 따로 있는가
     nk-analysis.mjs 는 "수치를 계산하는 곳"이고, 여기는 "무엇을 셀지 정하는 곳"이다.
     분자에 들어갈 자격 판정(중복·지역귀속)을 분석기 안에 숨기면 근거를 감사할 수 없다.
     그래서 판정 결과와 **근거 문장**을 통째로 JSON 으로 내고, 분석기는 그것을 읽기만 한다.

   원칙
     ① **억지 매핑 금지.** 확정할 수 없으면 미상으로 남기고 그 사유를 적는다.
     ② **대응표를 새로 만들지 않는다.** region.json 의 regions[].isanOrigin(현행→구7종)과
        cities[](도시→현행) 를 그대로 쓴다. 정규식은 nk-build-region.mjs 원본과 같은 것을
        재선언하되, 이름·지역 대응이 region.json 과 어긋나면 즉시 죽는다(REUSE 검사).
     ③ **근거를 남긴다.** 매핑된 건마다 via(무엇으로 붙였는가)와 evidence(원문 조각)를 적는다.
     ④ **as-of 를 섞지 않는다.** 수집일(collectedAt)만 기록한다. 사진의 촬영일·영상의 제작연도는
        별개 축이며 여기서 지역 판정에 쓰지 않는다.

   입력
     frontend/public/gohyang/region.json      (구7종 대응표 — 단일 진실 소스)
     북한자료-api/museum.json                  (사료 전량 4,342 — 중복 판정 기준)
     북한자료-api/reunion-*.json               (신규 수집 12코너)

   출력
     북한자료-api/reunion-region.json

   사용법
     node scripts/nk-reunion-region.mjs [--out=경로] [--quiet]

   재실행 가능 — 같은 입력이면 builtAt 을 빼고 바이트 동일.
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACK = path.join(ROOT, 'frontend', 'public', 'gohyang')
const API = path.join(ROOT, '북한자료-api')
const argv = process.argv.slice(2)
const arg = (k) => { const h = argv.find((a) => a.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : null }
const QUIET = argv.includes('--quiet')
const OUT = arg('out') || path.join(API, 'reunion-region.json')
const log = (...a) => { if (!QUIET) console.log(...a) }

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const has = (p) => { try { fs.accessSync(p); return true } catch { return false } }
const r1 = (x) => Math.round(x * 10) / 10
const pct = (a, b) => (b === 0 ? null : r1((a / b) * 100))

/* ── 입력 ────────────────────────────────────────────────────────────────── */
const region = readJSON(path.join(PACK, 'region.json'))
const museum = readJSON(path.join(API, 'museum.json'))

const RN = (n) => path.join(API, `reunion-${n}.json`)
const CORNERS = ['htgallery', 'photo', 'vletter', 'timetravel', 'webtoon', 'museum-intro',
  'handlttr', 'collection', 'archive', 'donation', 'yearbook', 'search']
const R = {}
for (const c of CORNERS) {
  if (!has(RN(c))) throw new Error(`수집분 누락: reunion-${c}.json — 수집기를 먼저 돌려라`)
  R[c] = readJSON(RN(c))
}

/* ══ 1. 대응표 — region.json 을 그대로 쓴다 ══════════════════════════════ */

/** 현행 13지역 → 구7종 축 키. region.json regions[].isanOrigin 이 단일 진실 소스. */
const MODERN_TO_OLD = {}
for (const [name, r] of Object.entries(region.regions)) {
  if (!r.isanOrigin?.key) throw new Error(`isanOrigin 누락: ${name}`)
  MODERN_TO_OLD[name] = { key: r.isanOrigin.key, name: r.isanOrigin.name }
}
const OLD_KEYS = ['hwanghae-old', 'pyongan-s-old', 'pyongan-n-old', 'hamgyong-s-old', 'hamgyong-n-old', 'gyeonggi-unrec', 'gangwon-unrec']
const OLD_NAME = {}
for (const v of Object.values(MODERN_TO_OLD)) OLD_NAME[v.key] = v.name
for (const k of OLD_KEYS) if (!OLD_NAME[k]) throw new Error(`구7종 축 키가 region.json 에서 나오지 않는다: ${k}`)

/* 도(道)명 직접 매칭 — nk-build-region.mjs REGION_RES 와 같은 정규식.
   가드 사유는 그 파일 주석에 있다(자강력·나선형 오탐 등). */
const REGION_RES = {
  '평양': [/평양/g],
  '남포': [/남포/g],
  '개성': [/개성/g],
  '라선': [/라선/g, /나선(?=특별시|시|경제|지대|지구)/g],
  '평안남도': [/평안남도/g, /평남/g],
  '평안북도': [/평안북도/g, /평북/g],
  '자강도': [/자강도/g],
  '황해남도': [/황해남도/g, /황남/g],
  '황해북도': [/황해북도/g, /황북/g],
  '강원도': [],   // 남북 동명 — KANGWON 규칙으로만
  '함경남도': [/함경남도/g, /함남/g],
  '함경북도': [/함경북도/g, /함북/g],
  '량강도': [/량강도/g, /양강도/g],
}
const KANGWON_DIRECT = /강원도|북강원/g
const KANGWON_NORTH_CUE = /북한|북측|이북|북강원|북조선|北/
const KANGWON_SOUTH_MARK = /속초|강릉|춘천|양양|동해시|삼척|평창|정선군|태백|홍천|원주|영월|인제군|화천|양구|횡성/

/* 도시 → 현행 지역. 이름·지역 대응은 region.json cities[] 와 1:1 이어야 한다(아래 REUSE 검사). */
const CITY_RES = [
  ['신의주', '평안북도', /신의주/g], ['원산', '강원도', /원산(?!지)/g], ['함흥', '함경남도', /함흥(?!차사)/g],
  ['청진', '함경북도', /청진/g], ['해주', '황해남도', /(?:^|[^가-힣])해주(?![기는고며면었셨서야도록니지다든])/g],
  ['사리원', '황해북도', /사리원/g], ['혜산', '량강도', /혜산/g], ['강계', '자강도', /(?<!금)강계(?!곡)/g],
  ['금강산', '강원도', /금강산/g], ['만포', '자강도', /만포/g], ['회령', '함경북도', /회령/g],
  ['무산', '함경북도', /무산(?=군|광산|지구|철산)/g], ['김책', '함경북도', /김책(?=시|제철)/g],
  ['단천', '함경남도', /단천/g], ['흥남', '함경남도', /흥남/g], ['신포', '함경남도', /신포/g],
  ['장진', '함경남도', /장진(?=호|군)/g], ['구성', '평안북도', /구성시/g], ['정주', '평안북도', /정주(?=시|군)/g],
  ['영변', '평안북도', /영변/g], ['동창리', '평안북도', /동창리/g], ['철산', '평안북도', /철산(?=군|리)/g],
  ['수풍', '평안북도', /수풍/g], ['풍계리', '함경북도', /풍계리/g], ['온성', '함경북도', /온성(?=군|읍)/g],
  ['백두산', '량강도', /백두산/g], ['삼지연', '량강도', /삼지연/g], ['개천', '평안남도', /개천(?=시|군)/g],
  ['안주', '평안남도', /안주(?=시|군|지구)/g], ['평성', '평안남도', /평성(?=시)/g], ['순안', '평양', /순안(?=공항|비행장|구역)/g],
  ['희천', '자강도', /희천/g], ['중강', '자강도', /중강(?=군|진)/g], ['통천', '강원도', /통천/g],
  ['문천', '강원도', /문천/g], ['안변', '강원도', /안변/g], ['마식령', '강원도', /마식령/g],
  ['장전항', '강원도', /장전항/g], ['평강', '강원도', /평강(?=군)/g], ['세포', '강원도', /세포(?=군|등판)/g],
  ['금강군', '강원도', /금강군/g], ['회양', '강원도', /회양(?=군|읍)/g], ['고산군', '강원도', /고산군/g],
  ['천내', '강원도', /천내(?=군)/g], ['깃대령', '강원도', /깃대령/g], ['김화', '강원도', /김화군/g],
  ['이천군', '강원도', /이천군/g], ['갈마', '강원도', /갈마(?=반도|지구|비행장|해안)/g], ['창도', '강원도', /창도(?=군)/g],
  ['법동', '강원도', /법동(?=군)/g], ['판교군', '강원도', /판교군/g], ['신계', '황해북도', /신계(?=군)/g],
  ['룡연', '황해남도', /룡연(?=군)/g], ['장연', '황해남도', /장연(?=군)/g], ['연백', '황해남도', /연백/g],
  ['나진', '라선', /(?<![가-힣])[라나]진(?=항|시|만|지구|경제|선봉|[·ㆍ\-‐–]|[를을이가은는에의와과]|\s|$)/g],
]

/* ── REUSE 검사: 여기 표가 region.json 과 어긋나면 조용히 틀린 수치가 나온다. 죽인다. */
{
  const mine = new Map(CITY_RES.map(([n, r]) => [n, r]))
  const theirs = new Map(region.cities.map((c) => [c.name, c.region]))
  if (mine.size !== theirs.size) throw new Error(`도시 대응표 크기 불일치: ${mine.size} ≠ region.json ${theirs.size}`)
  for (const [n, r] of theirs) {
    if (!mine.has(n)) throw new Error(`도시 누락: ${n}`)
    if (mine.get(n) !== r) throw new Error(`도시 지역 불일치: ${n} — ${mine.get(n)} ≠ ${r}`)
  }
  for (const n of Object.keys(REGION_RES)) if (!region.regions[n]) throw new Error(`지역 축 라벨 불일치: ${n}`)
}

/* 구(舊) 도명 직접 표기 — 자막·설명문에는 광복 당시 도명이 그대로 나온다.
   현행 13지역을 거치지 않고 구7종으로 바로 붙일 수 있는 것만 넣는다.
     '황해도'  → 남·북 어느 쪽으로 갈라져도 구 황해도 한 곳이다(모호성 없음).
     '함경도'·'평안도' → 남/북 두 축으로 갈라진다. **넣지 않는다**(미상 처리).
     '경기도'·'강원도' 단독 → 남측 동명 지역이 압도적이다. **넣지 않는다**. */
const OLD_DIRECT = [['황해도', 'hwanghae-old', /황해도/g]]

/** 텍스트에서 지역 근거를 뽑는다. → [{ oldKey, oldName, via, term, index }] */
function resolve(text, opts = {}) {
  if (!text) return []
  const out = []
  const push = (oldKey, via, term, index) => out.push({ oldKey, oldName: OLD_NAME[oldKey], via, term, index })
  for (const [term, oldKey, re] of OLD_DIRECT) {
    re.lastIndex = 0; let m
    while ((m = re.exec(text))) push(oldKey, '구도명', term, m.index)
  }
  for (const [name, res] of Object.entries(REGION_RES)) {
    for (const re of res) {
      re.lastIndex = 0; let m
      while ((m = re.exec(text))) push(MODERN_TO_OLD[name].key, '현행도명', m[0], m.index)
    }
  }
  for (const [name, rname, re] of CITY_RES) {
    re.lastIndex = 0; let m
    while ((m = re.exec(text))) push(MODERN_TO_OLD[rname].key, '도시', name, m.index)
  }
  /* 강원도 단독 표기 — 북측 단서가 있고 남측 도시가 없을 때만. nk-build-region.mjs 와 같은 규칙.
     그 규칙의 "북측 도시 매칭 우선" 조항을 여기서도 그대로 쓴다: 사전에 있는 북측 전용
     강원 시·군(이천군·통천·안변·회양·김화군·평강군…)이 같은 문장에 있으면 그것이 북측 단서다.
     opts.northContext 는 "그 코너 자체가 북측 고향만 다룬다"가 원문으로 확인된 경우에만 켠다. */
  const kangwonCityCue = out.some((h) => h.via === '도시' && h.oldKey === 'gangwon-unrec')
  const northCue = opts.northContext || kangwonCityCue || KANGWON_NORTH_CUE.test(text)
  if (northCue && !KANGWON_SOUTH_MARK.test(text)) {
    KANGWON_DIRECT.lastIndex = 0; let m
    while ((m = KANGWON_DIRECT.exec(text))) push('gangwon-unrec', opts.northContext ? '현행도명(코너가 북측 전용)' : '현행도명(북측 단서)', m[0], m.index)
  }
  return out
}

/* ══ 2. 중복 판정 ═════════════════════════════════════════════════════════
   기준을 코너마다 다르게 쓰지 않는다. 세 가지 키만 쓴다.
     ① iId  — 박물관 사료 일련번호. 같은 저장소의 같은 레코드다(가장 강함).
     ② fileId — 첨부 파일 식별자. 저장소가 다르면 애초에 충돌할 수 없다.
     ③ 제목  — 위 둘이 없을 때만. 동명이건 가능성이 있어 '주의'로만 쓴다.  */
const museumIds = new Set(museum.records.map((r) => r.iId))
const museumFileIds = new Set()
for (const r of museum.records) for (const f of (r.fileIds || [])) museumFileIds.add(String(f))
const museumTitles = new Set(museum.records.map((r) => (r.title || '').trim()).filter(Boolean))

const dedupByIId = (items, get = (x) => x.iId) => {
  const ids = items.map(get).filter((v) => v != null)
  const dup = ids.filter((v) => museumIds.has(v))
  return { n: items.length, keyed: ids.length, duplicate: dup.length, novel: ids.length - dup.length, key: 'iId' }
}
const dedupByFileId = (fileIds) => {
  const dup = fileIds.filter((f) => museumFileIds.has(String(f)))
  return { n: fileIds.length, duplicate: dup.length, novel: fileIds.length - dup.length, key: 'fileId', samples: dup.slice(0, 5) }
}
const titleOverlap = (titles) => {
  const hit = titles.filter((t) => museumTitles.has((t || '').trim()))
  return { n: titles.length, titleMatches: hit.length, samples: hit.slice(0, 5) }
}

const dedup = {
  method: 'iId(사료 일련번호) → fileId(첨부 식별자) → 제목 순으로 가장 강한 키를 쓴다. 제목은 단독 판정에 쓰지 않고 주의 표시로만 쓴다.',
  museumBaseline: { records: museum.records.length, fileIds: museumFileIds.size, titles: museumTitles.size },
  corners: {},
}
dedup.corners['htgallery'] = {
  key: 'fileId(atchfile 계열)', ...dedupByFileId(R.htgallery.items.map((i) => i.fileId)),
  titleNote: titleOverlap(R.htgallery.items.map((i) => i.placeName)),
  verdict: '겹치지 않음 — 저장소(/reuni/atchfile/)와 ID 체계(F/P 접두)가 박물관(HandLttrImageView.do?file_id=<정수>)과 다르다',
}
dedup.corners['vletter'] = {
  key: '없음(영상편지 id 는 사료 iId 와 다른 계열)',
  n: R.vletter.items.length, duplicate: 0, novel: R.vletter.items.length,
  titleNote: titleOverlap(R.vletter.items.map((i) => i.title)),
  nameLevelWarning: R.vletter.meta.overlapWithMuseum?.nameLevelWarning
    || '신청인 이름이 박물관 기증자 명단과 일부 일치하나 동일인 판정이 아니다 — 자산 단위 중복은 0건이다.',
  verdict: '겹치지 않음 — 영상 자산이며 사료 iId 체계에 존재하지 않는다',
}
dedup.corners['photo'] = {
  key: 'fileId(atchfile 계열)', ...dedupByFileId(R.photo.items.filter((i) => i.fileId).map((i) => i.fileId)),
  verdict: '겹치지 않음',
}
dedup.corners['timetravel'] = {
  ...dedupByIId(R.timetravel.items, (x) => x.iId ?? x.iid ?? x.id),
  verdict: '★ 전량 중복 — museum.json 안에 이미 있다. 분자에 더하면 이중계상이다',
}
dedup.corners['handlttr'] = { ...dedupByIId(R.handlttr.items), verdict: '★ 전량 중복 — 손편지는 사료 4,342건의 부분집합(문서류)이다' }
dedup.corners['archive'] = { ...dedupByIId(R.archive.items), verdict: '★ 전량 중복 — 기록관은 museum.json 그 자체다' }
dedup.corners['collection'] = (() => {
  const ids = []
  for (const c of R.collection.items) for (const r of (c.records || c.items || [])) ids.push(r.iId ?? r.i_id ?? r)
  const uniq = [...new Set(ids.filter((v) => typeof v === 'number'))]
  const dup = uniq.filter((v) => museumIds.has(v))
  return { n: uniq.length, keyed: uniq.length, duplicate: dup.length, novel: uniq.length - dup.length, key: 'iId', verdict: '★ 전량 중복 — 컬렉션 소속 사료는 전부 기록관 안에 있다' }
})()
dedup.corners['search'] = (() => {
  const ids = new Set()
  for (const q of R.search.items) for (const t of Object.values(q.tabs || {})) for (const r of (t.results || t.items || [])) { const v = r.iId ?? r.i_id; if (v != null) ids.add(Number(v)) }
  const uniq = [...ids]
  const dup = uniq.filter((v) => museumIds.has(v))
  return { n: uniq.length, keyed: uniq.length, duplicate: dup.length, novel: uniq.length - dup.length, key: 'iId', verdict: '★ 전량 중복 — 검색 결과는 기존 사료의 색인이다' }
})()
dedup.corners['webtoon'] = { key: '없음(사료 계열이 아님)', n: R.webtoon.items.length, duplicate: 0, novel: R.webtoon.items.length, verdict: '겹치지 않음 — 다만 사료가 아니라 창작 서사물이다' }
dedup.corners['yearbook'] = { key: '없음(사건 서술 계열)', n: R.yearbook.items.length, duplicate: 0, novel: R.yearbook.items.length, verdict: '겹치지 않음 — 다만 사료가 아니라 사건 서술이다' }
dedup.corners['donation'] = { key: '해당 없음(통계표 6행 + 기증자 명단)', n: R.donation.items.length, duplicate: null, novel: null, verdict: '기록 건수 계열이 아니다 — 셀 수 있는 단위가 아님' }
dedup.corners['museum-intro'] = { key: '해당 없음(허브 페이지)', n: R.museum_intro?.items?.length ?? R['museum-intro'].items.length, duplicate: null, novel: null, verdict: '사료 0건 — 입구 링크 수이지 기록 건수가 아니다' }

/* ══ 3. 「나의 살던 고향은」 지역 대응 ════════════════════════════════════ */
/* 이 코너는 사이트가 「북측 고향 풍경」만 모아 놓은 곳이고 탭 자체가 도명이다.
   그래서 강원도 판정에 northContext 를 켠다 — 남측 강원 사진이 섞일 자리가 아니다.
   다만 탭 이름만으로는 못 붙인다:
     · 「경기도」 탭에 사리원(황해북도) 사진 2장이 섞여 있다(실측). 탭을 그대로 믿으면 틀린다.
     · 「함경도」·「평안도」 탭은 남/북 두 축으로 갈라져 탭만으로는 확정 불가.
   → 본문 근거(areaRaw + placeName + caption)를 먼저 보고, 탭은 **모순 검사**에만 쓴다. */
const TAB_TO_OLD = {
  '황해도': ['hwanghae-old'],
  '경기도': ['gyeonggi-unrec'],
  '강원도': ['gangwon-unrec'],
  '함경도': ['hamgyong-s-old', 'hamgyong-n-old'],
  '평안도': ['pyongan-s-old', 'pyongan-n-old'],
}
const htRows = []
for (const it of R.htgallery.items) {
  const text = [it.areaRaw, it.placeName, it.dataTitle, it.altDesc].filter(Boolean).join(' ')
  const hits = resolve(text, { northContext: true })
  const keys = [...new Set(hits.map((h) => h.oldKey))]
  const tabKeys = TAB_TO_OLD[it.tab] || []
  const agree = keys.filter((k) => tabKeys.includes(k))
  const conflict = keys.filter((k) => !tabKeys.includes(k))
  let oldKeys = [], via = null, evidence = null
  if (keys.length === 1) { oldKeys = keys; via = hits[0].via; evidence = hits.map((h) => h.term).join(',') }
  else if (agree.length === 1 && conflict.length === 0) { oldKeys = agree; via = '본문 근거(탭과 일치)'; evidence = hits.map((h) => h.term).join(',') }
  else if (keys.length > 1) {
    /* 근거가 둘 이상 도에 걸린다 — 탭과 일치하는 것이 하나뿐이면 그것으로, 아니면 미상 */
    if (agree.length === 1) { oldKeys = agree; via = '본문 근거 다중 → 탭으로 좁힘'; evidence = hits.map((h) => `${h.term}(${OLD_NAME[h.oldKey]})`).join(',') }
    else { oldKeys = []; via = null; evidence = hits.map((h) => `${h.term}(${OLD_NAME[h.oldKey]})`).join(',') }
  }
  /* 본문 근거가 아예 없을 때만 탭이 하나의 축으로 확정되는 경우 탭을 근거로 인정한다.
     「경기도」 탭은 사리원 혼입이 실측됐으므로 탭 단독 근거를 인정하지 않는다. */
  if (oldKeys.length === 0 && hits.length === 0 && tabKeys.length === 1 && it.tab !== '경기도') {
    oldKeys = tabKeys; via = '탭(도명 탭 단독)'; evidence = it.tab
  }
  htRows.push({
    fileId: it.fileId, tab: it.tab, placeName: it.placeName, areaRaw: it.areaRaw || null,
    provider: it.provider || null, thumbUrl: it.thumbUrl, viewUrl: it.viewUrl, sourceUrl: it.sourceUrl,
    oldKeys, oldNames: oldKeys.map((k) => OLD_NAME[k]),
    via, evidence,
    tabAgrees: oldKeys.length > 0 ? oldKeys.every((k) => tabKeys.includes(k)) : null,
  })
}
const htMapped = htRows.filter((r) => r.oldKeys.length > 0)
const htUnmapped = htRows.filter((r) => r.oldKeys.length === 0)

/* ══ 4. 영상편지 지역 대응 ════════════════════════════════════════════════
   ★ 여기가 가장 위험한 자리다. 자막에는 세 종류의 지명이 섞여 있다.
       ① 고향(원적) — 우리가 찾는 것
       ② 남측 거주지 — "저는 거제시에 살고 있습니다"
       ③ 피난 경로 — "사리원역에서 손을 놨는데"
   문자열 등장만으로 세면 ②③이 통째로 고향으로 둔갑한다(수집기 meta 의 경고).
   그래서 **고향 선언문**만 인정한다:
     · 자막 한 줄 안에서 고향/본적/원적/출생지/태어난 곳 키워드 바로 뒤(≤12자)에
       북측 지명이 나올 것. 거리를 두는 이유는 "고향 생각도 나고 … 황해도" 같은
       회상 문장이 걸리지 않게 하기 위해서다.
     · 키워드 뒤에 **주격·주제 조사(은/는/이/가)** 가 와야 한다. "고향을 떠나서 평양에" 처럼
       고향이 아닌 곳을 가리키는 문장을 걸러내려는 것이다(실측 오탐).
     · 남측 지명으로 해석되는 것은 애초에 사전에 없어 매칭되지 않는다(경기도 가평·강원도 춘천 등).
     · 한 선언문 안에 도명과 도시명이 함께 나오면 **도명이 이긴다**. 원산(현행 강원도)을
       "함경남도 원산"이라 말하는 분이 있는데, 광복 당시 원산은 함경남도였고 이 코너의
       화자는 광복 당시 행정구역으로 말한다. 현행 도시 사전으로 덮어쓰면 그 진술을 틀리게 만든다.
   이 규칙은 재현율을 희생하고 정확도를 택한 것이다. 놓친 건은 미상으로 남는다. */
const HOME_KEY = /(?:고향\s*주소|고향|본적|원적|출생지|태어난\s*곳|태어나신\s*곳)\s*(?:은|는|이|가)/g
const MAX_GAP = 12
const NEGATED = /아니(?:고|다|라|에요|예요|야|었|였|지만)/
const CITY_HEAD_GAP = 3
const UNSURE = /미상|모르|모릅|모름|알\s*수\s*없|기억(이|도)?\s*(안|못)/
const vlRows = []
for (const it of R.vletter.items) {
  if (!it.caption) continue
  const found = []
  for (const line of it.caption.split(/\n+/)) {
    HOME_KEY.lastIndex = 0
    let k
    while ((k = HOME_KEY.exec(line))) {
      const start = k.index + k[0].length
      const seg = line.slice(start, start + 40)
      /* 화자가 스스로 모른다고 말하는 문장은 뺀다 — "고향은 미상이지만 평남과 황해도의…" (실측).
         부정어가 지명 **앞**에 있을 때만 뺀다. "고향은 평양시 동네는 모르겠다"는 도가 확정된 진술이다. */
      const near0 = resolve(seg).filter((h) => h.index <= MAX_GAP)
      const near = near0.filter((h) => {
        if (h.index > MAX_GAP) return false
        if (UNSURE.test(seg.slice(0, h.index))) return false
        /* 부정문 — "고향은원산이 아니고 여기 전라도…"(실측). 지명 직후에 부정어가 오면 뺀다. */
        if (NEGATED.test(seg.slice(0, h.index + h.term.length + 8))) return false
        /* 도시명은 선언문 **맨 앞**에 올 때만 인정한다.
           "고향은 달성군 유가면 원산입니다"(대구 달성군의 원산리)처럼 뒷자리에 온 도시명은
           하위 행정구역 이름일 뿐 도(道)를 뜻하지 않는다 — 실측 오탐. 도명에는 이 제한을 두지 않는다. */
        if (h.via === '도시' && h.index > CITY_HEAD_GAP && !near0.some((p) => p.via !== '도시' && p.oldKey === h.oldKey)) return false
        return true
      })
      /* 도명이 도시명을 이긴다(위 주석 참조) — 같은 선언문 안에서만 적용한다 */
      const provincial = near.filter((h) => h.via !== '도시')
      const win = provincial.length ? provincial : near
      for (const h of win) {
        found.push({ ...h, line: line.trim(), phrase: `${k[0]}${seg.slice(0, Math.max(h.index + h.term.length + 2, 14))}`.trim() })
      }
    }
  }
  if (!found.length) continue
  const keys = [...new Set(found.map((f) => f.oldKey))]
  vlRows.push({
    id: it.id, title: it.title, productionYear: it.productionYear ?? null,
    sourceUrl: it.sourceUrl, videoUrl: it.videoUrl || null,
    oldKeys: keys, oldNames: keys.map((k) => OLD_NAME[k]),
    via: '자막 고향 선언문',
    evidence: [...new Set(found.map((f) => f.phrase))].slice(0, 4),
    evidenceLines: [...new Set(found.map((f) => f.line))].slice(0, 4),
  })
}
const vlWithCaption = R.vletter.items.filter((i) => i.caption).length
const vlMapped = vlRows.length

/* ══ 5. 축별 집계 ═════════════════════════════════════════════════════════ */
const byOld = {}
for (const k of OLD_KEYS) byOld[k] = { key: k, name: OLD_NAME[k], htgallery: 0, vletter: 0, total: 0, htgalleryFileIds: [], vletterIds: [] }
for (const r of htMapped) for (const k of r.oldKeys) { byOld[k].htgallery++; byOld[k].htgalleryFileIds.push(r.fileId) }
for (const r of vlRows) for (const k of r.oldKeys) { byOld[k].vletter++; byOld[k].vletterIds.push(r.id) }
for (const k of OLD_KEYS) byOld[k].total = byOld[k].htgallery + byOld[k].vletter

/* 다중 귀속 — 한 건이 두 축에 걸리면 축별 합이 건수보다 커진다. 숨기지 않고 적는다. */
const htMulti = htMapped.filter((r) => r.oldKeys.length > 1).length
const vlMulti = vlRows.filter((r) => r.oldKeys.length > 1).length

/* ══ 6. 분자 포함/제외 판단표 ════════════════════════════════════════════ */
const RULE = {
  statement: '기록 밀도의 분자는 「그 고향 지역에 관한, 통일부가 게시한, 건 단위로 세어지는, 기존 분자와 겹치지 않는 기록」이다.',
  tests: [
    { id: 'A', name: '게시 주체', ask: '통일부(또는 통일부가 운영하는 시스템)가 게시한 기록물인가?', note: '제작·기증 주체가 외부여도 된다 — 기존 분자의 사료도 기증자가 외부다. 게시 주체를 본다.' },
    { id: 'B', name: '건 단위', ask: '건수가 정의되는 개별 기록인가?', note: '통계표 행·입구 링크·검색 질의는 기록 건이 아니다.' },
    { id: 'C', name: '지역 귀속', ask: '그 건이 그 고향에 속한다는 근거가 원문에 있는가?', note: '상봉 장소만 걸린 건은 제외한다 — 기존 venueOnly 규칙과 같다.' },
    { id: 'D', name: '비중복', ask: '기존 분자(사료 4,342·연표·보도자료·동향·개황)와 겹치지 않는가?', note: '겹치면 이중계상이며 대표 수치가 근거 없이 흔들린다.' },
  ],
}
const J = (corner, n, A, B, C, D, verdict, why) => ({ corner, collected: n, A, B, C, D, verdict, why })
const judgement = [
  J('나의 살던 고향은(htgallery)', R.htgallery.items.length, 'O', 'O', 'O', 'O', '포함',
    `이산가족정보통합시스템이 게시한 고향 풍경 사진이고, 탭(구도명)과 사진 설명(현행 지명)이라는 지역 근거가 원문에 있다. fileId 체계가 사료와 달라 중복 0건. 매핑된 ${htMapped.length}건만 분자에 넣고 미상 ${htUnmapped.length}건은 넣지 않는다.`),
  J('영상편지(vletter)', R.vletter.items.length, 'O', 'O', '△', 'O', '조건부 포함',
    `이산가족 본인의 기록물이며 통일부 시스템이 게시했다. 다만 지역은 구조화 필드가 없고 자막 자유텍스트뿐이다. 자막이 있는 건이 ${vlWithCaption}건(전체의 ${pct(vlWithCaption, R.vletter.items.length)}%)이고, 그중 고향 선언문으로 북측 도가 확정되는 ${vlMapped}건만 분자에 넣는다. 나머지는 미상 — 지명이 나와도 남측 거주지·피난 경로일 수 있어 세지 않는다.`),
  J('이산가족상봉 이모저모(photo)', R.photo.items.length, 'O', 'O', 'X', 'O', '제외',
    '어떤 필드에도 고향 정보가 없다. 제목의 여수·속초는 남측 개최지이며 고향축에 붙이면 오류다. C 불충족.'),
  J('시간여행(timetravel)', R.timetravel.items.length, 'O', 'O', '△', 'X', '제외',
    `175건 전부가 museum.json 안에 이미 있다(iId 일치 ${dedup.corners.timetravel.duplicate}/${dedup.corners.timetravel.keyed}). D 불충족 — 더하면 순수 이중계상이다. 새로 얻은 해설문은 화면 텍스트로 쓰되 분자에는 넣지 않는다.`),
  J('웹툰(webtoon)', R.webtoon.items.length, '△', 'O', 'X', 'O', '제외',
    '창작 서사물이지 기록물이 아니고, 지역 귀속도 없다(대본의 지명은 이야기 배경). A·C 불충족.'),
  J('박물관 소개(museum-intro)', R['museum-intro'].items.length, 'O', 'X', 'X', '—', '제외',
    '사료 0건. 수집된 11은 입구 링크 수이지 기록 건수가 아니다. B 불충족.'),
  J('손편지(handlttr)', R.handlttr.items.length, 'O', 'O', '△', 'X', '제외',
    `752건 전부가 사료 4,342건의 부분집합이다(iId 일치 ${dedup.corners.handlttr.duplicate}/${dedup.corners.handlttr.keyed}). D 불충족.`),
  J('컬렉션(collection)', dedup.corners.collection.n, 'O', 'O', '△', 'X', '제외',
    `고유 사료 ${dedup.corners.collection.n}건이 전부 기록관 안에 있다. D 불충족.`),
  J('기록관(archive)', R.archive.items.length, 'O', 'O', '△', 'X', '제외',
    'museum.json 그 자체다. 새로 얻은 형태(i_type) 6종은 필드 충실도를 올릴 뿐 건수를 늘리지 않는다. D 불충족.'),
  J('기증현황(donation)', R.donation.items.length, 'O', 'X', 'X', '—', '제외',
    '통계표 6행과 기증자 명단이다. 셀 수 있는 기록 건이 아니다. B 불충족. (표의 기준일도 사이트가 알려주지 않는다 — 화면에 기준일로 인용하면 as-of 위반)'),
  J('연표(yearbook)', R.yearbook.items.length, 'O', 'O', 'X', 'O', '제외',
    '이산가족 관련 사건 서술 1,041건이다. 지역 필드가 없고 본문의 장소는 대부분 상봉 장소(금강산·서울·평양)다. 기존 분자가 상봉 장소만 걸린 건을 빼는데 여기를 넣으면 그 규칙과 정면으로 어긋난다. C 불충족.'),
  J('통합검색(search)', dedup.corners.search.n, 'O', 'O', '△', 'X', '제외',
    `결과 ${dedup.corners.search.n}건이 전부 기존 iId 다. 색인이지 새 기록이 아니다. D 불충족.`),
]

/* ══ 7. 봉투 ══════════════════════════════════════════════════════════════ */
const out = {
  builtAt: new Date().toISOString(),
  builder: 'scripts/nk-reunion-region.mjs',
  purpose: '이산가족정보통합시스템 12코너 신규 수집분의 중복 판정과 고향 7종 축 대응. nk-analysis.mjs 가 이 파일을 읽어 기록 밀도 분자를 만든다.',
  /* ★ 전 코너를 **같은 축**(KST 달력 날짜)으로 통일한다.
       코너마다 봉투 모양이 다르다 — 셋(시간여행·웹툰·박물관 소개)은 collectedAt 이 UTC 타임스탬프이고
       collectedOnKst 를 따로 갖는다. 예전에는 그 UTC 문자열을 그대로 옮겨, 같은 실행에서 받은 자료가
       공개 manifest 에서 두 코너만 하루 전(2026-08-20T21:46Z = KST 08-21 06:46)으로 보였다.
       KST 날짜가 있으면 그것을 쓰고, 없으면 collectedAt 의 앞 10자를 쓴다. */
  collectedAt: (() => {
    const kst = (r) => r.collectedOnKst ?? String(r.collectedAt ?? '').slice(0, 10)
    return {
      htgallery: kst(R.htgallery), vletter: kst(R.vletter), photo: kst(R.photo),
      timetravel: kst(R.timetravel), webtoon: kst(R.webtoon),
      handlttr: kst(R.handlttr), archive: kst(R.archive), yearbook: kst(R.yearbook),
      axis: 'KST 달력 날짜',
      note: '수집일이다(KST). 사진의 촬영일·영상의 제작연도·사료의 생산연도와 섞지 말 것. 코너별 초 단위 시각은 각 원본 봉투의 collectedAt/collectedAtStamp 에 있다.',
    }
  })(),
  axis: OLD_KEYS.map((k) => ({ key: k, name: OLD_NAME[k] })),
  crosswalk: {
    source: 'frontend/public/gohyang/region.json — regions[].isanOrigin(현행 13지역→구7종), cities[](도시→현행 13지역)',
    modernToOld: MODERN_TO_OLD,
    oldDirect: OLD_DIRECT.map(([t, k]) => ({ term: t, oldKey: k, why: '남·북 어느 쪽으로 갈라져도 구 황해도 한 곳이다' })),
    notMapped: [
      { term: '함경도', why: '함남·함북 두 축으로 갈라진다 — 원문만으로 확정 불가' },
      { term: '평안도', why: '평남·평북 두 축으로 갈라진다 — 원문만으로 확정 불가' },
      { term: '경기도(단독)', why: '남측 경기가 압도적이다. 개성 등 북측 지명 근거가 있어야만 미수복경기로 붙인다' },
      { term: '강원도(단독)', why: '남북 동명. 북측 단서가 있고 남측 도시가 없을 때만(region.json kangwonRule 재사용)' },
      { term: '철원·옹진·고성·장단', why: '남북 양쪽에 같은 지명이 있다 — 도명 없이 단독으로는 붙이지 않는다' },
    ],
    reuseCheck: { cities: region.cities.length, ok: true, note: 'region.json cities[] 와 이름·지역이 1:1 로 일치하지 않으면 빌드가 죽는다' },
  },
  dedup,
  htgallery: {
    corner: '나의 살던 고향은',
    siteBadgeTotal: R.htgallery.total,
    collected: R.htgallery.items.length,
    mapped: htMapped.length,
    unmapped: htUnmapped.length,
    mappingRate: pct(htMapped.length, R.htgallery.items.length),
    multiRegion: htMulti,
    byOld: Object.fromEntries(OLD_KEYS.map((k) => [k, byOld[k].htgallery])),
    unmappedReasons: htUnmapped.map((r) => ({ fileId: r.fileId, tab: r.tab, placeName: r.placeName, areaRaw: r.areaRaw, evidence: r.evidence, why: r.evidence ? '근거가 둘 이상 도에 걸리고 탭으로도 좁혀지지 않는다' : '원문에 도·시 근거가 없다' })),
    items: htRows,
  },
  vletter: {
    corner: '영상편지',
    siteBadgeTotal: R.vletter.total,
    collected: R.vletter.items.length,
    withCaption: vlWithCaption,
    mapped: vlMapped,
    mappingRateOfAll: pct(vlMapped, R.vletter.items.length),
    mappingRateOfCaptioned: pct(vlMapped, vlWithCaption),
    multiRegion: vlMulti,
    byOld: Object.fromEntries(OLD_KEYS.map((k) => [k, byOld[k].vletter])),
    rule: `자막 한 줄 안에서 고향/본적/원적/출생지 키워드 뒤 ${MAX_GAP}자 이내에 북측 지명이 나올 때만 인정한다. 지명이 그냥 몇 번 나왔는지는 세지 않습니다 — 남측 거주지나 피난 경로가 섞이기 때문입니다.`,
    ruleTradeoff: '재현율을 버리고 정확도를 택했다. 자막이 없는 건과 고향을 말하지 않는 건은 전부 미상으로 남는다 — 이 표본은 영상편지 전체의 고향 분포가 아니다.',
        /* ── 개인정보: 영상편지는 개별 기록을 공개 산출물에 싣지 않는다 ──
       이 코너의 제목에는 신청인 실명이, 자막에는 본적지·가족 이름·생년월일이 들어 있다.
       통일부 게시판이 받은 공개 동의는 그 게시판에 대한 것이지 우리 화면에 대한 것이 아니다.
       분석에 필요한 것은 「몇 건에서 고향이 확인됐는가」라는 집계뿐이므로 집계만 싣는다.
       판정 근거(자막 인용·개별 id)는 로컬 원자료에만 남고 배포물에는 나가지 않는다. */
    itemsWithheld: {
      n: vlRows.length,
      why: '개별 항목에 신청인 실명과 자막 속 본적지가 들어 있어 공개 산출물에서 뺐습니다.',
      seeOriginal: 'https://reunion.unikorea.go.kr/reuni/home/vle/vletter/promote/list_vle.do?mid=SM00000127',
    },

  },
  byOld: Object.fromEntries(OLD_KEYS.map((k) => [k, { key: k, name: OLD_NAME[k], htgallery: byOld[k].htgallery, vletter: byOld[k].vletter, total: byOld[k].total, htgalleryFileIds: byOld[k].htgalleryFileIds }])),  /* vletterIds 는 개인 식별 가능성이 있어 배포물에서 뺀다 */
  numeratorRule: RULE,
  judgement,
  numeratorDelta: {
    note: 'nk-analysis.mjs 가 이 값을 기존 분자(연표+보도자료+동향+개황+사료)에 더한다.',
    included: ['htgallery', 'vletter'],
    excluded: judgement.filter((j) => j.verdict === '제외').map((j) => j.corner),
    perOld: Object.fromEntries(OLD_KEYS.map((k) => [k, byOld[k].total])),
    totalAdded: OLD_KEYS.reduce((s, k) => s + byOld[k].total, 0),
    distinctRecordsAdded: htMapped.length + vlMapped,
    multiRegionNote: `축별 합(${OLD_KEYS.reduce((s, k) => s + byOld[k].total, 0)})이 건수(${htMapped.length + vlMapped})보다 큰 이유는 한 건이 두 축에 걸리는 경우가 있기 때문이다(사진 ${htMulti}건 · 영상편지 ${vlMulti}건). 기존 분자의 사료 집계도 같은 방식이다.`,
  },
  caveats: [
    '매핑률은 "수집분 중 몇 %에 지역을 붙일 수 있었나"이지 정확도가 아니다. 붙인 것이 맞는지는 evidence 필드로 감사해야 한다.',
    '영상편지 표본은 자막이 있는 건에 쏠려 있다 — 자막 보유가 지역·연도에 따라 균등하다는 보장이 없다. 이 분포를 영상편지 전체의 고향 분포로 읽으면 안 된다.',
    '「나의 살던 고향은」 강원도 탭의 금강산 사진은 명소 풍경이지 상봉 장소 기록이 아니다 — 사료의 venueOnly 규칙과는 성격이 다르므로 빼지 않았다.',
    '수집 자체가 사이트 표시 총건수에 못 미치는 코너가 있다(사진 129/141 — <img> 미생성 12건). 분자에는 실제로 확보한 것만 들어간다.',
    '권리: 공공누리(KOGL) 표기를 찾지 못했다. 화면에 쓸 때 제공처 표기와 원문 링크를 반드시 동반해야 한다.',
  ],
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8')

log('── 중복 판정 ──')
for (const [c, d] of Object.entries(dedup.corners)) log(`  ${c.padEnd(14)} n=${String(d.n).padStart(5)}  중복=${d.duplicate ?? '—'}  신규=${d.novel ?? '—'}  ${d.verdict}`)
log('── 지역 대응 ──')
log(`  나의 살던 고향은  ${htMapped.length}/${R.htgallery.items.length} (${pct(htMapped.length, R.htgallery.items.length)}%) · 미상 ${htUnmapped.length}`)
log(`  영상편지          ${vlMapped}/${R.vletter.items.length} (${pct(vlMapped, R.vletter.items.length)}%) · 자막보유분 대비 ${pct(vlMapped, vlWithCaption)}%`)
log('── 축별 추가분 ──')
for (const k of OLD_KEYS) log(`  ${OLD_NAME[k].padEnd(8)} 사진 ${String(byOld[k].htgallery).padStart(3)} · 영상편지 ${String(byOld[k].vletter).padStart(3)} · 계 ${byOld[k].total}`)
log(`\n→ ${path.relative(ROOT, OUT)}`)
