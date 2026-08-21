#!/usr/bin/env node
// nk-reunion-search.mjs — 디지털박물관 「통합검색」 수집 → 북한자료-api/reunion-search.json
//
// 코너: https://reunion.unikorea.go.kr/reuni/home/museum/archive/search/SearchEngine.do?mid=SM00000268
// 렌더: JS. jsSearch() → POST SearcEngineList.do  (사이트 오타 그대로: Searc — Search 아님)
// 요청: POST /reuni/home/museum/archive/search/SearcEngineList.do
//   body: search={q}&currentRecordPage={p}&currentFilePage={p}&currentHandFilePage={p}
//         &currentCollectPage={p}&currentVodPage={p}&i_id=&archiveType=99&TabToggle=1&mid=SM00000268
//
// ★ 이 코너는 '고정된 목록'이 아니라 질의 인터페이스다. 그래서 '총 N건 전량'이라는 것이 없다.
//   대신 **질의 집합을 못박고**(우리 고향 축 7개 도명 + museum.json 이 이미 세어 둔 도시 지명),
//   질의마다 사이트가 표시한 탭별 건수와 결과 항목을 전량 받는다. 질의 집합은 meta.querySet 에 남는다.
//
// ★ 한 번의 POST 가 5개 탭을 **동시에** 돌려준다. 탭마다 page 파라미터가 따로 있으므로
//   다섯 개를 같은 p 로 맞추면 요청 1회에 5개 탭의 p쪽을 한꺼번에 얻는다 — 요청 수를 5분의 1로 줄인다.
//   탭당 6건 고정(pageUnit 파라미터 자체가 없다).
//
// ★★ 「0건이 나온다」는 함정의 원인 하나를 찾았다 — 문자 인코딩이다.
//   검색어를 UTF-8 원문 그대로 argv 에 실어 curl 에 넘기면(Windows) 서버가 깨진 문자열을 받아
//   전 탭 0건을 돌려준다. HTTP 는 200 이라 실패로 보이지도 않는다.
//   → 검색어는 반드시 encodeURIComponent 로 **퍼센트 인코딩(ASCII)** 해서 보낸다. 이 스크립트는 그렇게 한다.
//   (탐사 메모의 '처음 몇 번은 0건' 현상이 전부 이 원인이라고 단정하지는 않는다. 서버 쪽 불안정이
//    따로 있을 수 있어 zeroRetry 재시도를 그대로 둔다.)
//
// 실행: node scripts/nk-reunion-search.mjs [--force] [--delay=500] [--max-pages=60] [--q=단어,단어]

import fs from 'node:fs'
import path from 'node:path'
import {
  BASE, MID, OUT_DIR, createCtx, parseArgs, stripTags, htmlToText,
  writeEnvelope, loadMuseumIds, LICENSE_NOTE, nowKSTStamp, stampCollected,
} from './nk-reunion-lib.mjs'

const SEARCH_URL = `${BASE}/reuni/home/museum/archive/search/SearcEngineList.do`
const PAGE_URL = `${BASE}/reuni/home/museum/archive/search/SearchEngine.do?mid=${MID.search}`
const PAGE_SIZE = 6

const TABS = [
  { key: 'record', label: '사료검색', domId: 'second-tab', pageParam: 'currentRecordPage' },
  { key: 'attach', label: '첨부내용', domId: 'third-tab', pageParam: 'currentFilePage' },
  { key: 'handletter', label: '손편지', domId: 'fourth-tab', pageParam: 'currentHandFilePage' },
  { key: 'collection', label: '컬렉션', domId: 'fifth-tab', pageParam: 'currentCollectPage' },
  { key: 'vletter', label: '영상편지', domId: 'sixth-tab', pageParam: 'currentVodPage' },
]

const args = parseArgs()
const MAX_PAGES = +args.val('max-pages', '60')
const ctx = createCtx({ corner: 'search', delay: args.delay, force: args.force })

// 질의 집합 — 우리 고향 축 7종 + museum.json 이 이미 실측한 도시 지명.
// ★ 여기서 지역 매핑을 하지 않는다. 질의어를 원문 그대로 쓰고, 매핑은 통합 단계로 넘긴다.
const AXIS_REGIONS = ['황해도', '평안남도', '평안북도', '함경남도', '함경북도', '경기도', '강원도']
// museum.json 의 지역 축은 **현행 북한 행정구역명**(평양·남포·황해남도·량강도 …) + 옛 도명 3개 버킷
// (함경도(구)·황해도(구)·미수복경기)로 되어 있다. 우리 고향 축 7종과 이름이 그대로 맞지 않는다.
// 아래 표는 '대조를 하기 위한 근사 대응'일 뿐이고, ★고향 축 확정 매핑이 아니다 — 그건 통합 단계의 몫이다.
const COMPARE_BUCKETS = {
  '황해도': ['황해도(구)', '황해남도', '황해북도'],
  '평안남도': ['평안남도'],
  '평안북도': ['평안북도'],
  '함경남도': ['함경남도'],
  '함경북도': ['함경북도'],
  '경기도': ['미수복경기'],
  '강원도': ['강원도'],
}
function cityQueries() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'museum.json'), 'utf8'))
    return Object.keys(j.meta?.cityMentions || {})
  } catch { return [] }
}

// ★ 탭 건수를 읽는 경로가 두 개다. 둘 다 읽어 서로 대조한다.
//   ① 탭 버튼   <a class="_btn-tab">사료검색 (164)</a>  — ★ 영상편지 버튼이 없는 응답이 있다(실측).
//   ② 결과 머리 <p class="result">사료검색</p><p class="result2">164 건의 검색 …</p> — 5개 탭 전부 나온다.
//   기본값은 ②를 쓰고, ①은 교차검증용으로 남긴다.
const TAB_LABELS = ['사료검색', '첨부내용', '손편지', '컬렉션', '영상편지']
function tabCountsFromButtons(html) {
  const out = {}
  for (const m of html.matchAll(/class="_btn-tab[^"]*"[^>]*>([^<]+)</g)) {
    const t = stripTags(m[1])
    const c = t.match(/^(.+?)\s*\((\d+)\)$/)
    if (c) out[c[1].trim()] = +c[2]
  }
  return out
}
function tabCountsFromHeaders(html) {
  const out = {}
  for (const m of html.matchAll(/<p class="result">([^<]+)<\/p>\s*<p class="result2">([^<]*)<\/p>/g)) {
    const label = stripTags(m[1])
    const n = stripTags(m[2]).match(/^(\d+)\s*건/)
    if (n && TAB_LABELS.includes(label)) out[label] = +n[1]
  }
  return out
}
function tabCounts(html) {
  const h = tabCountsFromHeaders(html)
  const b = tabCountsFromButtons(html)
  const out = {}
  for (const l of TAB_LABELS) out[l] = h[l] ?? b[l] ?? null
  return out
}

function sliceTab(html, domId) {
  const i = html.indexOf(`id="${domId}"`)
  if (i < 0) return ''
  const j = html.indexOf('<!--', i)
  const k = html.indexOf('id="', i + 10)
  const end = Math.min(...[j, k].filter(x => x > i).concat([html.length]))
  return html.slice(i, end)
}

// 검색어가 <span class='search'>…</span> 로 감싸져 돌아온다 — 하이라이트를 벗겨 원문 텍스트로 되돌린다.
const unhi = (s) => (s == null ? null : stripTags(s))

// ★ 함정: 하이라이트 <span> 이 <span class="filename"> 안에 **중첩**된다.
//   /<span class="filename">([\s\S]*?)<\/span>/ 로 잡으면 안쪽 </span> 에서 끊겨 파일명이 잘린다
//   (실측: '270_함경남도' 까지만 잡히고 뒤가 통째로 날아가 서로 다른 파일이 같은 값으로 뭉개졌다).
//   그래서 <span> 깊이를 세어 바깥 짝을 찾는다.
function spanInner(seg, className) {
  const marker = `<span class="${className}">`
  const i = seg.indexOf(marker)
  if (i < 0) return null
  let j = i + marker.length, depth = 1
  while (j < seg.length && depth > 0) {
    const open = seg.indexOf('<span', j)
    const close = seg.indexOf('</span>', j)
    if (close < 0) return null
    if (open >= 0 && open < close) { depth++; j = open + 5 } else { depth--; j = close + 7 }
  }
  return seg.slice(i + marker.length, j - 7)
}

function parseTabItems(seg, tabKey) {
  const out = []
  if (!seg) return out
  if (tabKey === 'vletter') {
    for (const m of seg.matchAll(/<a href="(https?:\/\/[^"]*view_vle\.do\?id=(\d+)[^"]*)"[\s\S]*?background-image:url\(([^)]*)\)[\s\S]*?<strong class="tit[^"]*">([\s\S]*?)<\/strong>[\s\S]*?<div class="info">([\s\S]*?)<\/div>/g)) {
      const fid = m[3].match(/file_id=(\d+)/)
      out.push({
        vodId: +m[2], title: unhi(m[4]), duration: stripTags(m[5]) || null,
        thumbUrl: fid ? `${BASE}/reuni/home/museum/archive/search/VodLttrImageView.do?file_id=${fid[1]}` : null,
        url: m[1],
      })
    }
    return out
  }
  // 나머지 4개 탭은 같은 카드 모양이다: jsRecordEnginView(iId)
  const marks = [...seg.matchAll(/jsRecordEnginView\((\d+)\)/g)].map(m => ({ iId: +m[1], at: m.index }))
  for (let k = 0; k < marks.length; k++) {
    const b = seg.slice(marks[k].at, k + 1 < marks.length ? marks[k + 1].at : seg.length)
    const fid = b.match(/HandLttrImageView\.do\?file_id=(\d+)/)
    const tit = b.match(/<strong class="tit[^"]*">([\s\S]*?)<\/strong>/)
    const data = spanInner(b, 'data')
    const name = spanInner(b, 'name')
    const dec = b.match(/<p class="dec">([\s\S]*?)<\/p>/)
    const fn = spanInner(b, 'filename')
    const it = { iId: marks[k].iId, title: unhi(tit && tit[1]) }
    if (data && stripTags(data)) it.producedOn = stripTags(data)
    if (name) it.name = unhi(name)
    if (dec && htmlToText(dec[1])) it.content = unhi(dec[1])
    if (fn) it.attachFileName = unhi(fn)     // ★ 첨부내용·손편지 탭의 새 정보(파일 단위 색인)
    if (fid) {
      it.thumbFileId = +fid[1]
      it.thumbUrl = `${BASE}/reuni/home/museum/archive/letter/HandLttrImageView.do?mid=${MID.letter}&file_id=${fid[1]}`
    }
    it.recordUrl = `${BASE}/reuni/home/museum/archive/RecordView.do?i_id=${it.iId}&mid=${MID.archive}`
    out.push(it)
  }
  return out
}

const bodyFor = (q, p) =>
  `search=${encodeURIComponent(q)}&` +
  TABS.map(t => `${t.pageParam}=${p}`).join('&') +
  `&i_id=&archiveType=99&TabToggle=1&mid=${MID.search}`

async function runQuery(q) {
  // 1쪽: 탭별 총건수를 사이트 표시값으로 확정한다.
  let first = await ctx.post(SEARCH_URL, bodyFor(q, 1), `q="${q}" p1`)
  let zeroRetries = 0
  while (first && Object.values(tabCounts(first)).every(v => v === 0) && zeroRetries < 3) {
    // 전 탭 0 은 '없음'일 수도, 검색엔진 일시 불안정일 수도 있다 — 단정하지 말고 다시 물어본다.
    zeroRetries++
    await new Promise(r => setTimeout(r, 2500))
    first = await ctx.post(SEARCH_URL, bodyFor(q, 1), `q="${q}" p1 재시도${zeroRetries}`, { noCache: true })
  }
  if (!first) { ctx.note(`q="${q}"`, '1쪽 실패 — 이 질의는 건너뛴다'); return null }

  const counts = tabCounts(first)
  const countsFromButtons = tabCountsFromButtons(first)
  const countsFromHeaders = tabCountsFromHeaders(first)
  const perTab = {}
  const seen = {}
  for (const t of TABS) { perTab[t.key] = { label: t.label, siteTotal: counts[t.label] ?? null, items: [] }; seen[t.key] = new Set() }

  const absorb = (html) => {
    for (const t of TABS) {
      const items = parseTabItems(sliceTab(html, t.domId), t.key)
      for (const it of items) {
        // 손편지·첨부내용 탭은 파일 단위라 같은 iId 가 여러 번 나온다 — 파일명까지 합쳐 키로 쓴다.
        const key = t.key === 'vletter' ? `v${it.vodId}` : `${it.iId}|${it.attachFileName || ''}`
        if (seen[t.key].has(key)) continue
        seen[t.key].add(key)
        perTab[t.key].items.push(it)
      }
    }
  }
  absorb(first)

  const needPages = Math.max(...TABS.map(t => Math.ceil((counts[t.label] || 0) / PAGE_SIZE)), 1)
  const pages = Math.min(needPages, MAX_PAGES)
  for (let p = 2; p <= pages; p++) {
    const html = await ctx.post(SEARCH_URL, bodyFor(q, p), `q="${q}" p${p}`)
    if (!html) continue
    absorb(html)
  }

  for (const t of TABS) {
    const tab = perTab[t.key]
    tab.collected = tab.items.length
    tab.pagesNeeded = Math.ceil((tab.siteTotal || 0) / PAGE_SIZE)
    tab.capped = tab.pagesNeeded > pages
    tab.gapVsSiteTotal = tab.siteTotal == null ? null : tab.siteTotal - tab.collected
  }
  ctx.log(`  q="${q}" ${TABS.map(t => `${t.label}${perTab[t.key].siteTotal}/${perTab[t.key].collected}`).join(' ')}${zeroRetries ? ` (0건재시도 ${zeroRetries}회)` : ''}`)
  const countDisagreement = TAB_LABELS
    .filter(l => countsFromButtons[l] != null && countsFromHeaders[l] != null && countsFromButtons[l] !== countsFromHeaders[l])
    .map(l => ({ tab: l, button: countsFromButtons[l], header: countsFromHeaders[l] }))
  return {
    query: q, pagesFetched: pages, pagesNeeded: needPages, zeroRetries,
    countsFromButtons, countsFromHeaders, countDisagreement,
    tabs: perTab,
  }
}

const main = async () => {
  ctx.log('시작', nowKSTStamp())
  const custom = args.val('q', null)
  const cities = cityQueries()
  const querySet = custom
    ? custom.split(',').map(s => s.trim()).filter(Boolean)
    : [...AXIS_REGIONS, ...cities]
  ctx.log(`질의 ${querySet.length}개 (고향축 ${AXIS_REGIONS.length} + 도시 ${cities.length})`)

  const items = []
  for (const q of querySet) {
    const r = await runQuery(q)
    if (r) items.push(r)
  }

  // museum.json 이 이미 지역 태깅한 것과, 검색엔진이 찾아준 것의 차이를 본다.
  // ★ 특히 '첨부내용' 탭은 첨부파일 색인 결과라 우리 본문 텍스트 태깅이 못 잡는 사료를 찾아 준다.
  const museum = loadMuseumIds()
  const regionCompare = []
  if (museum) {
    const mu = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'museum.json'), 'utf8'))
    const buckets = { ...(mu.byRegion || {}), ...(mu.byRegionHistoric || {}) }
    for (const r of items) {
      if (!AXIS_REGIONS.includes(r.query)) continue
      const found = new Set()
      for (const t of ['record', 'attach', 'collection', 'handletter']) {
        for (const it of r.tabs[t].items) if (it.iId) found.add(it.iId)
      }
      const names = COMPARE_BUCKETS[r.query] || []
      const tagged = new Set(names.flatMap(n => (buckets[n] || []).map(Number)))
      const onlySearch = [...found].filter(i => !tagged.has(i))
      regionCompare.push({
        region: r.query,
        comparedAgainstBuckets: names,
        bucketsPresentInMuseumJson: names.filter(n => buckets[n]),
        museumJsonTagged: tagged.size,
        searchEngineHits: found.size,
        inSearchButNotTagged: onlySearch.length,
        inTaggedButNotSearch: [...tagged].filter(i => !found.has(i)).length,
        sampleNewIds: onlySearch.slice(0, 30),
      })
    }
  }

  // ★ 전 탭 0건으로 돌아온 질의 — museum.json 본문에는 그 지명이 실제로 있는데도 0이 나오는 경우가 있다.
  //   검색엔진 색인이 본문 전문의 상위집합이 아니라는 뜻이다. 0을 '없음'으로 단정하지 않기 위해 남긴다.
  let zeroResultQueries = []
  try {
    const mu = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'museum.json'), 'utf8'))
    const mentions = mu.meta?.cityMentions || {}
    zeroResultQueries = items
      .filter(r => TABS.every(t => (r.tabs[t.key].siteTotal || 0) === 0))
      .map(r => ({
        query: r.query,
        zeroRetries: r.zeroRetries,
        museumJsonCityMentions: mentions[r.query] ?? null,
        note: mentions[r.query]
          ? `★ museum.json 본문에는 이 지명이 ${mentions[r.query]}건 등장하는데 검색엔진은 0건을 돌려줬다(재시도 ${r.zeroRetries}회 후에도 0). 검색 색인이 본문 전문을 다 담고 있지 않다는 뜻이다 — 0을 '자료 없음'으로 읽으면 안 된다.`
          : '검색엔진 0건. museum.json 쪽에도 이 지명 집계가 없어 대조할 근거가 없다.',
      }))
  } catch { /* museum.json 없으면 대조를 생략한다 */ }

  const totalItems = items.reduce((s, r) => s + TABS.reduce((a, t) => a + r.tabs[t.key].collected, 0), 0)
  const cappedQueries = items.filter(r => TABS.some(t => r.tabs[t.key].capped)).map(r => r.query)

  /* ★ 수집일 확정 — 캐시에서만 읽었으면 그 캐시가 쓰인 때가 실제 수집 시각이다.
       실행 시각을 찍으면 네트워크를 0회 치고도 수집일이 앞으로 밀린다(as-of 규약 위반). */
  const stamped = stampCollected(ctx, args)
  ctx.log(`수집일 ${stamped.date} (${stamped.forced ? '--collected-at 지정' : stamped.observed ? '캐시·요청 실측 최댓값' : '실측 불가 — 폴백'})`)
  const envelope = {
    source: '통일부 남북이산가족 디지털박물관 — 박물관 통합검색',
    corner: '통합검색',
    url: PAGE_URL,
    collectedAt: args.collectedAt,
    collectedAtStamp: args.collectedAtStamp,
    total: items.length,
    totalEvidence:
      '★ 이 코너는 목록이 아니라 질의 인터페이스다 — 사이트에 「총 N건」이라는 코너 총계가 없다. ' +
      `여기의 total 은 우리가 못박은 질의 수(${items.length})다. 각 질의의 탭별 건수는 사이트가 탭 버튼에 표시한 값 그대로 옮겼다.`,
    items,
    meta: {
      querySet,
      querySetRationale:
        '우리 고향 축 7개 도명 + museum.json 이 이미 실측해 둔 도시 지명(meta.cityMentions 의 키). ' +
        '임의로 고른 것이 아니라 이미 우리 데이터에 있는 축을 그대로 물어본 것이다.',
      axisRegions: AXIS_REGIONS,
      cityQueries: cities,
      tabs: TABS.map(t => ({ key: t.key, label: t.label, pageParam: t.pageParam })),
      pageSize: PAGE_SIZE,
      pageSizeNote:
        'pageUnit 파라미터 자체가 없다 — 탭당 6건 고정. ★ 다만 응답 HTML 은 한 쪽에 **7건**을 그린다: ' +
        '앞 쪽의 마지막 항목이 다음 쪽 첫 항목으로 한 번 더 나온다(실측: p1 …,232,318 / p2 318,431,…). ' +
        '중복을 안 지우면 건수가 부풀고, 쪽 수를 7로 나누면 뒤가 잘린다 — 쪽 수는 총건수/6 으로 잡고 중복은 키로 제거했다.',
      maxPagesPerQuery: MAX_PAGES,
      cappedQueries,
      cappedNote: cappedQueries.length
        ? `★ 위 질의는 --max-pages=${MAX_PAGES} 상한에 걸려 전량을 받지 못했다. 각 질의의 tabs[].capped 와 gapVsSiteTotal 에 ` +
          '얼마가 빠졌는지 적어 뒀다. 조용히 덮지 않았다 — 필요하면 --max-pages 를 올려 다시 돌리면 이어서 채운다.'
        : '상한에 걸린 질의가 없다 — 모든 질의에서 사이트 표시 건수만큼 받았다.',
      totalItemsCollected: totalItems,
      newInformation:
        '★ 이 코너에서만 얻는 것: ① 「첨부내용」 탭 — 첨부파일(마스킹 이미지·한글문서) 색인 결과라 ' +
        '본문 텍스트에 지명이 없어도 걸린다. 우리 지역 태깅이 못 잡는 사료를 찾아 준다. ' +
        '② 「손편지」 탭 — 사료 단위가 아니라 **파일 단위** 히트(같은 iId 가 파일 수만큼 나온다). ' +
        '③ 첨부파일명 문자열 자체(attachFileName). 다만 OCR 본문은 노출되지 않는다 — 파일명과 iId 뿐이다.',
      zeroResultQueries,
      zeroRetryCacheNote:
        '★ 전 탭 0건 응답은 캐시에 넣지 않는다(재시도 요청은 noCache). 검색 색인이 나중에 살아났을 때 ' +
        '옛 0건이 굳어버리지 않게 하려는 것이다 — 그래서 재실행 때 0건 질의만큼은 네트워크를 다시 탄다. ' +
        '나머지는 전부 캐시에서 나온다.',
      zeroResultNote:
        '전 탭 0건으로 돌아온 질의 목록이다. 재시도 후에도 0이면 여기에 남는다. ' +
        '★ 그 중 일부는 museum.json 본문에 그 지명이 분명히 있는데도 0이 나온다 — ' +
        '검색엔진 색인의 한계이지 자료가 없다는 뜻이 아니다.',
      regionCompareWithMuseumJson: regionCompare,
      regionCompareNote:
        'museum.json 의 byRegion 태깅(본문 텍스트 기반)과 검색엔진 히트를 도명별로 대조한 것이다. ' +
        'inSearchButNotTagged 가 우리가 놓치고 있던 후보다. ★ 다만 검색엔진 히트는 단순 문자열 일치라 ' +
        '「함경남도 출신 기증자가 만든 남측 자료」처럼 고향이 아닌 맥락도 걸린다 — 그대로 고향 축에 붙이면 안 된다. ' +
        '판단은 통합 단계에서 하고 여기서는 원문 그대로 남긴다.',
      hasRegionField: false,
      regionNote: '검색 결과 자체에 구조화된 지역 필드는 없다. 지역은 우리가 던진 질의어일 뿐이다.',
      encodingPitfall:
        '★ 검색어는 반드시 퍼센트 인코딩해서 보낸다. UTF-8 원문을 그대로 argv 로 넘기면(Windows) ' +
        '서버가 깨진 문자열을 받아 전 탭 0건을 HTTP 200 으로 돌려준다 — 실패처럼 보이지 않는 실패다. ' +
        '이 스크립트는 encodeURIComponent 로 인코딩하며, 그래도 전 탭 0이면 최대 3회 재시도한다(zeroRetries 에 기록).',
      endpoint: {
        method: 'POST', url: SEARCH_URL,
        typoInPath: '★ 사이트 경로가 SearcEngineList.do 다(Search 아님). 고쳐 쓰면 404 다.',
        body: `search={q}&currentRecordPage={p}&currentFilePage={p}&currentHandFilePage={p}&currentCollectPage={p}&currentVodPage={p}&i_id=&archiveType=99&TabToggle=1&mid=${MID.search}`,
        trick: '한 번의 POST 가 5개 탭을 함께 돌려준다 — 다섯 page 파라미터를 같은 값으로 맞추면 요청 1회로 5개 탭의 같은 쪽을 얻는다.',
        session: 'museum/view.do?gubn=A&mid=SM00000261 로 JSESSIONID 선발급.',
      },
      privacyNote:
        '영상편지 탭 결과에는 신청인 실명이 제목에 그대로 들어 있다("OOO님의 영상편지"). ' +
        '손편지·첨부내용 탭의 attachFileName 에도 실명과 내부 관리번호가 섞여 있다(예 "..._masking.jpg"). ' +
        '수집은 원문 그대로 하되, 우리 화면에 그대로 옮기지 말고 원문 링크로 보낼 것.',
      media: 'URL 만 기록한다. 이미지·영상 바이너리는 내려받지 않는다.',
      license: LICENSE_NOTE,
      failed: ctx.failed,
      network: ctx.net,
      note:
        'as-of: 검색 건수는 수집일 ' + args.collectedAt + ' 시점에 사이트가 표시한 값이다. ' +
        '사료가 늘거나 색인이 바뀌면 달라진다 — 이 숫자를 고정 사실로 인용하지 말 것.',
    },
  }
  ctx.finish()
  const out = writeEnvelope('reunion-search.json', envelope)
  ctx.log(`저장 ${out} — 질의 ${items.length}개 · 결과 ${totalItems}건, 실패 ${ctx.failed.length}건`)
}

main().catch(e => { ctx.finish(); console.error('✗', e.message); process.exit(1) })
