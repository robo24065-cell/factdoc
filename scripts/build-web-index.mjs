// 웹 배포용 경량 인덱스
// 원본 15MB → 본문 절단·필드 축약으로 브라우저에 실을 수 있는 크기로 줄인다.
// 검색 품질에 영향이 큰 title/entities/measures는 보존하고 body만 자른다.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { tokenize } from '../frontend/src/engine/nk-search.mjs'

const IN = path.resolve('frontend/src/data/nk-index.json')
const OUT = path.resolve('frontend/public/nk-index.json')
const BODY_MAX = 220        // 카드에 보이는 만큼만 (표시용)
const ST_MAX = 800          // 잘린 뒷부분에서 살릴 검색용 어휘 수 (레코드당)

const d = JSON.parse(fs.readFileSync(IN, 'utf8'))

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
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(web), 'utf8')

const before = fs.statSync(IN).size / 1048576
const after = fs.statSync(OUT).size / 1048576
console.log(`원본 ${before.toFixed(1)} MB → 웹 ${after.toFixed(1)} MB  (${((1 - after / before) * 100).toFixed(0)}% 절감)`)
console.log(`레코드 ${web.records.length.toLocaleString()} · 수치 ${web.measures.length.toLocaleString()} · 엔티티 ${web.entities.length}`)
console.log(`출력 ${OUT}`)
const raw = fs.readFileSync(OUT)
const MB = n => (n / 1048576).toFixed(2) + ' MB'
console.log(`st 부착 ${stCount}건 · gzip ${MB(zlib.gzipSync(raw).length)} · brotli ${MB(zlib.brotliCompressSync(raw).length)}`)
