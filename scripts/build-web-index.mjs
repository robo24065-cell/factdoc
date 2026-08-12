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

/* ★ 웹 인덱스에서 제외할 데이터셋 — 브라우저가 받는 파일이다. 무한정 키울 수 없다.
   nkinfoTrend(북한정보포털 동향)는 8,000건인데 날짜 필드가 없어 as-of 배지를 못 단다.
   검색 가치 대비 부피가 커서 웹에서는 빼고 전체 인덱스(Supabase 적재용)에만 남긴다.
   실측: 포함 시 gzip 0.9MB → 5.39MB. 제외하면 브라우저 부담이 사라진다. */
const WEB_EXCLUDE = new Set(['nkinfoTrend'])
const kept = d.records.filter(r => !WEB_EXCLUDE.has(r.datasetId))
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
    return {
      id: r.id, datasetId: r.datasetId, kind: r.kind, topic: r.topic,
      title: r.title,
      body: cut,
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
    .map(([k, re]) => [k, { re: re.source,
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
const GRAPH_SRC = path.resolve('북한자료-api/nk-graph.json')
const GRAPH_OUT = OUT.replace(/nk-index\.json$/, 'nk-graph.json')
const shipped = [OUT, MEASURES_OUT]
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
