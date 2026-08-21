#!/usr/bin/env node
// nk-reunion-museum-all.mjs — 디지털박물관 6개 코너 수집기를 순서대로 돌린다.
//
// 코너별 산출물(공통 봉투 { source, corner, url, collectedAt, total, items[], meta:{failed[], note} }):
//   손편지     scripts/nk-reunion-handlttr.mjs    → 북한자료-api/reunion-handlttr.json
//   컬렉션     scripts/nk-reunion-collection.mjs  → 북한자료-api/reunion-collection.json
//   기록관     scripts/nk-reunion-archive.mjs     → 북한자료-api/reunion-archive.json
//   기증현황   scripts/nk-reunion-donation.mjs    → 북한자료-api/reunion-donation.json
//   연표       scripts/nk-reunion-yearbook.mjs    → 북한자료-api/reunion-yearbook.json
//   통합검색   scripts/nk-reunion-search.mjs      → 북한자료-api/reunion-search.json
//
// 전부 재실행 가능·증분이다. 캐시는 북한자료-api/_cache/reunion-museum/<코너>/ 에 쌓이고,
// 두 번째 실행부터는 네트워크를 다시 때리지 않는다(--force 로 무시 가능).
// 넘긴 인자는 각 수집기에 그대로 전달된다: node scripts/nk-reunion-museum-all.mjs --delay=800

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const pass = process.argv.slice(2)

const RUNS = [
  ['손편지', 'nk-reunion-handlttr.mjs', 'reunion-handlttr.json'],
  ['컬렉션', 'nk-reunion-collection.mjs', 'reunion-collection.json'],
  ['기록관', 'nk-reunion-archive.mjs', 'reunion-archive.json'],
  ['기증현황', 'nk-reunion-donation.mjs', 'reunion-donation.json'],
  ['연표', 'nk-reunion-yearbook.mjs', 'reunion-yearbook.json'],
  ['통합검색', 'nk-reunion-search.mjs', 'reunion-search.json'],
]

const rows = []
for (const [corner, script, out] of RUNS) {
  console.log(`\n=== ${corner} (${script}) ===`)
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...pass], { stdio: 'inherit' })
  const okExit = r.status === 0
  let total = null, collected = null, failed = null
  const p = path.join(ROOT, '북한자료-api', out)
  if (fs.existsSync(p)) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      total = j.total; collected = j.meta?.collected ?? j.items?.length; failed = j.meta?.failed?.length
    } catch { /* 깨진 산출물은 아래 표에 null 로 남는다 */ }
  }
  rows.push({ corner, script, out, exit: r.status, ok: okExit, total, collected, failed })
}

console.log('\n=== 요약 ===')
for (const r of rows) {
  console.log(
    `${r.ok ? '  ' : '✗ '}${r.corner.padEnd(6)} total=${r.total} collected=${r.collected} failed=${r.failed}  → 북한자료-api/${r.out}`
  )
}
if (rows.some(r => !r.ok)) process.exit(1)
