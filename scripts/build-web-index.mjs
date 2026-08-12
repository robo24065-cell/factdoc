// 웹 배포용 경량 인덱스
// 원본 15MB → 본문 절단·필드 축약으로 브라우저에 실을 수 있는 크기로 줄인다.
// 검색 품질에 영향이 큰 title/entities/measures는 보존하고 body만 자른다.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { tokenize } from '../frontend/src/engine/nk-search.mjs'
import { PENDING_HINTS } from './nk-catalog.mjs'

const IN = path.resolve('frontend/src/data/nk-index.json')
const OUT = path.resolve('frontend/public/nk-index.json')
const BODY_MAX = 220        // 카드에 보이는 만큼만 (표시용)
const ST_MAX = 800          // 잘린 뒷부분에서 살릴 검색용 어휘 수 (레코드당)

const d = JSON.parse(fs.readFileSync(IN, 'utf8'))

/* ★ 포털동향(nkinfoTrend)은 **별도 파일**로 나눈다.
   전에는 웹에서 통째로 뺐다. 그래서 화면의 '공식 기록'이 22,902건이었는데,
   실제 보유량은 API 원본만 51,561건이다 — 사용자가 "이거밖에 없어?"라고 물은 지점이다.

   부피가 문제였지 가치가 없어서가 아니었다. Cloudflare 상한은 **파일당** 25MiB 이므로
   나누면 실을 수 있다(이미 measures 를 그렇게 나눠 놨다).
   실측: 본문 150자로 자르면 42,813건이 22.2MB(상한의 89%), gzip 4.2MB.
   병렬로 받으므로 체감 비용은 gzip 크기다.

   날짜 필드가 없어 as-of 배지를 레코드 단위로 못 다는 것은 그대로다 —
   데이터셋 단위 기준일로 표시된다. */
const TREND_KEY = 'nkinfoTrend'
const TREND_BODY_MAX = 150       // 이 값이 곧 파일 크기다. 올리면 상한을 넘는다(240자 → 105%).
const trendRecs = d.records.filter(r => r.datasetId === TREND_KEY)
const kept = d.records.filter(r => r.datasetId !== TREND_KEY)
const keptIds = new Set(kept.map(r => r.id))
d.records = kept
d.measures = d.measures.filter(m => keptIds.has(m.recordId))

// 전체 코퍼스 df — 상한에 걸릴 때 희소한 어휘부터 남긴다 (변별력 우선)
const df = new Map()
for (const r of d.records)
  for (const t of new Set([...tokenize(r.title), ...tokenize(r.sourceName), ...tokenize(r.body)]))
    df.set(t, (df.get(t) || 0) + 1)

// 표시용 body 는 자르되, 잘려나간 구간에만 있던 어휘는 st 로 보존한다.
// st 는 검색 전용 — 화면에 절대 렌더하지 않는다.
let stCount = 0
function searchTail(r, cut) {
  const b = r.body || ''
  if (b.length <= BODY_MAX) return null
  const seen = new Set([...tokenize(r.title), ...tokenize(r.sourceName), ...tokenize(cut)])
  let extra = [...new Set(tokenize(b))].filter(t => !seen.has(t))
  if (!extra.length) return null
  if (extra.length > ST_MAX)                     // 적재 사고 레코드(6007, 본문 131,865자) 방어
    extra = extra.sort((a, c) => (df.get(a) || 0) - (df.get(c) || 0)).slice(0, ST_MAX)
  stCount++
  return extra.join(' ')
}

const web = {
  builtAt: d.builtAt,
  topics: d.topics,
  datasets: Object.fromEntries(Object.entries(d.datasets).map(([k, v]) => [k, {
    name: v.name, provider: v.provider, url: v.url || null, topic: v.topic,
    asOf: v.asOf, coverageEnd: v.coverageEnd, freshness: v.freshness,
    frozenReason: v.frozenReason || null, note: v.note || null,
    status: v.status, searchPriority: v.searchPriority || 50,
  }])),
  records: d.records.map(r => {
    const b = r.body || ''
    const cut = b.length > BODY_MAX ? b.slice(0, BODY_MAX) + '…' : b
    const st = searchTail(r, cut)
    /* ★ 자르기 전 원본 토큰 수. BM25 의 길이 정규화는 짧은 문서를 우대하므로
       **자르는 행위 자체가 그 문서의 순위를 올린다.** 그러면 배포본과 로컬의 검색이 갈린다.
       실측 사고 2026-08-13: 포털동향 42,788건을 150자로 잘라 실었더니 그 문서들이
       통계 레코드를 300위 밖으로 밀어냈고, 집계가 배포본에서만 죽었다
       (로컬 eval 48/48 · 배포본 40/48). len0 을 실어 절단이 순위를 바꾸지 않게 한다. */
    const len0 = tokenize(r.title).length * 3 + tokenize(r.sourceName).length * 2 + tokenize(b).length
    return {
      id: r.id, datasetId: r.datasetId, kind: r.kind, topic: r.topic,
      title: r.title,
      body: cut,
      len0,
      ...(st ? { st } : {}),          // 검색 전용. 화면에 절대 렌더하지 않는다
      occurredOn: r.occurredOn, asOf: r.asOf, coverageEnd: r.coverageEnd,
      freshness: r.freshness, frozenReason: r.frozenReason,
      sourceName: r.sourceName, sourceUrl: r.sourceUrl,
      priority: r.priority, entities: r.entities, isLatestInDataset: r.isLatestInDataset,
    }
  }),
  measures: d.measures,
  entities: d.entities,
  /* 아직 못 실은 자료가 답할 질문의 표지 — 정규식을 문자열로 실어 보낸다.
     카탈로그가 단일 진실 소스로 남고, 프론트는 정의를 복제하지 않는다. */
  pendingHints: Object.fromEntries(Object.entries(PENDING_HINTS)
    .filter(([k]) => d.datasets[k]?.status === 'pending')
    .map(([k, h]) => [k, { re: h.re.source, exclusive: !!h.exclusive,
      name: d.datasets[k].name, url: d.datasets[k].url || null }])),
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })

/* ★ Cloudflare Pages 는 **자산 하나당 25 MiB(26,214,400 B)** 가 상한이다.
   합쳐 쓰면 26,463,741 B 로 249KB 초과 → 그 자산만 배포가 거부되고
   Cloudflare 가 조용히 이전 버전을 계속 서빙한다. 실제로 그렇게 됐다 —
   연표 1,464건 복구분이 라이브에 반영되지 않았고 2016~2019년이 0건인 채로 돌고 있었다.
   총 전송량이 문제가 아니라 '파일 하나의 크기'가 문제이므로 두 파일로 나눈다.
   measures 6.28MB 는 gzip 으로는 0.29MB 라 병렬로 받으면 체감 비용이 거의 없다. */
const MEASURES_OUT = OUT.replace(/nk-index\.json$/, 'nk-measures.json')
const measures = web.measures
delete web.measures

fs.writeFileSync(OUT, JSON.stringify(web), 'utf8')
fs.writeFileSync(MEASURES_OUT, JSON.stringify({ measures }), 'utf8')

/* 관계망 — 세 번째 파일. 0.19MB 라 상한과는 무관하지만 같은 가드를 통과시킨다.
   별도 파일인 이유: 관계망은 문서 인덱스와 갱신 주기가 다르다(동향 재수집 때만 바뀐다).
   못 받아도 검색은 그대로 돌아야 하므로 화면에서도 실패를 허용한다. */
/* 포털동향 별도 파일 — 화면·검색에 쓸 최소 필드만 담는다.
   sourceName 을 함께 실어야 근거 카드가 출처를 표시할 수 있다. */
const TREND_OUT = OUT.replace(/nk-index\.json$/, 'nk-trend.json')
/* 42,813건이 **같은 값을 반복**한다 — datasetId·kind·sourceName·asOf·freshness 는
   전부 동일하고, sourceUrl 은 번호만 다른 같은 주소다. 레코드마다 넣으면
   28.3MB(상한의 113%)가 되어 배포가 거부된다(가드가 실제로 잡았다).
   공통값은 defaults 에 한 번만 두고, URL 은 번호만 남긴다. 화면이 받을 때 되돌린다. */
const URL_RE = /trendMngNo=(\d+)/
const trendDs = d.datasets[TREND_KEY] || {}
const trendPack = {
  defaults: {
    datasetId: TREND_KEY, kind: 'event',
    sourceName: trendDs.name ?? null,
    asOf: trendDs.asOf ?? null, coverageEnd: trendDs.coverageEnd ?? null,
    freshness: trendDs.freshness ?? null, frozenReason: trendDs.frozenReason ?? null,
    /* ★ priority 를 빠뜨리면 랭킹이 `1 + (undefined-50)/100` = NaN 이 되고,
       NaN 비교가 늘 false 라 **정렬 전체가 무너진다**(일부가 아니라 전부).
       실측 사고: 이것 때문에 배포본에서만 집계·연혁이 죽었다(eval 48/48 → 40/48).
       공통값은 반드시 여기에 다 넣는다 — 빠진 필드는 조용히 NaN 이 된다. */
    priority: trendDs.searchPriority ?? 50,
    isLatestInDataset: false,
    entities: [],
    urlTemplate: 'https://nkinfo.unikorea.go.kr/nkp/trend/view.do?trendMngNo={pk}&menuId=MENU_395',
  },
  /* 배열의 배열로 실어 키 이름 반복도 없앤다: [id, topic, title, body, pk] */
  cols: ['id', 'topic', 'title', 'body', 'pk', 'len0'],
  rows: trendRecs.map(r => {
    const b = String(r.body || '')
    return [
      r.id, r.topic,
      r.title,
      b.length > TREND_BODY_MAX ? b.slice(0, TREND_BODY_MAX) + '…' : b,
      Number((String(r.sourceUrl || '').match(URL_RE) || [])[1]) || 0,
      // 원본 토큰 수 — 절단이 순위를 바꾸지 않게 한다(위 records 의 len0 과 같은 이유)
      tokenize(r.title).length * 3 + tokenize(r.sourceName).length * 2 + tokenize(b).length,
    ]
  }),
}
fs.writeFileSync(TREND_OUT, JSON.stringify(trendPack), 'utf8')
console.log(`포털동향 ${trendPack.rows.length.toLocaleString()}건 → ${path.basename(TREND_OUT)}`)

/* 어휘 사전 — 낱말 질문 전용. 문서 인덱스와 성격이 달라 파일도 따로 간다.
   못 받아도 검색은 그대로 돌고, 그때는 미연동 안내로 되돌아간다. */
const LEX_SRC = path.resolve('북한자료-api/nk-lexicon.json')
const LEX_OUT = OUT.replace(/nk-index\.json$/, 'nk-lexicon.json')
let lexShipped = null
if (fs.existsSync(LEX_SRC)) {
  const lx = JSON.parse(fs.readFileSync(LEX_SRC, 'utf8'))
  fs.writeFileSync(LEX_OUT, JSON.stringify(lx), 'utf8')
  lexShipped = LEX_OUT
  console.log(`어휘 대응어 ${lx.pairs.length.toLocaleString()}쌍 · 뜻풀이 ${lx.terms.length.toLocaleString()}건 → ${path.basename(LEX_OUT)}`)
} else {
  console.log('⚠ 어휘 사전 없음 — node scripts/build-nk-lexicon.mjs 를 먼저 돌리면 낱말 답변이 켜진다')
}

/* 오늘의 이슈 — 뉴스는 **검증 대상**이라 코퍼스에 섞지 않고 따로 싣는다.
   화면에서 '지금 도는 주장'으로 보여주고, 누르면 우리 공식자료로 되묻는 입구가 된다. */
const ISSUES_SRC = path.resolve('북한자료-api/nk-issues.json')
const ISSUES_OUT = OUT.replace(/nk-index\.json$/, 'nk-issues.json')
let issuesShipped = null
if (fs.existsSync(ISSUES_SRC)) {
  const j = JSON.parse(fs.readFileSync(ISSUES_SRC, 'utf8'))
  fs.writeFileSync(ISSUES_OUT, JSON.stringify(j), 'utf8')
  issuesShipped = ISSUES_OUT
  const age = ((Date.now() - new Date(j.builtAt)) / 3600000).toFixed(1)
  console.log(`오늘의 이슈 ${j.issues.length}개 (수집 ${age}시간 전, 리랭커 ${j.llmFiltered ? '적용' : '미적용'}) → ${path.basename(ISSUES_OUT)}`)
} else {
  console.log('⚠ 이슈 없음 — node scripts/nk-issue-radar.mjs 를 먼저 돌리면 실시간 이슈가 켜진다')
}

const GRAPH_SRC = path.resolve('북한자료-api/nk-graph.json')
const GRAPH_OUT = OUT.replace(/nk-index\.json$/, 'nk-graph.json')
const shipped = [OUT, MEASURES_OUT, TREND_OUT,
  ...(lexShipped ? [lexShipped] : []), ...(issuesShipped ? [issuesShipped] : [])]
if (fs.existsSync(GRAPH_SRC)) {
  const g = JSON.parse(fs.readFileSync(GRAPH_SRC, 'utf8'))
  fs.writeFileSync(GRAPH_OUT, JSON.stringify(g), 'utf8')
  shipped.push(GRAPH_OUT)
  console.log(`관계망 노드 ${g.nodes.length.toLocaleString()} · 간선 ${g.edges.length.toLocaleString()}`)
} else {
  console.log('⚠ 관계망 없음 — node scripts/build-nk-graph.mjs 를 먼저 돌리면 관계 답변이 켜진다')
}

const LIMIT = 26214400
for (const f of shipped) {
  const b = fs.statSync(f).size
  const pct = (b / LIMIT * 100).toFixed(1)
  console.log(`${b > LIMIT ? '🚨 상한 초과' : '  '} ${path.basename(f).padEnd(18)} ${(b / 1048576).toFixed(2)} MB (상한의 ${pct}%)`)
  if (b > LIMIT) {
    console.error(`
배포가 거부된다. Cloudflare Pages 자산 상한은 25 MiB 다.`)
    process.exitCode = 1
  }
}

const before = fs.statSync(IN).size / 1048576
const after = fs.statSync(OUT).size / 1048576
console.log(`원본 ${before.toFixed(1)} MB → 웹 ${after.toFixed(1)} MB  (${((1 - after / before) * 100).toFixed(0)}% 절감)`)
console.log(`레코드 ${web.records.length.toLocaleString()} · 수치 ${measures.length.toLocaleString()}(별도 파일) · 엔티티 ${web.entities.length}`)
console.log(`출력 ${OUT}`)
const raw = fs.readFileSync(OUT)
const MB = n => (n / 1048576).toFixed(2) + ' MB'
console.log(`st 부착 ${stCount}건 · gzip ${MB(zlib.gzipSync(raw).length)} · brotli ${MB(zlib.brotliCompressSync(raw).length)}`)
