#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   AI 스튜디오 사료 매니페스트 생성 — reunion.json htgallery 129장 → studio-photos.ts

   왜 빌드 스크립트인가 (pick-items.ts 와 같은 관용)
     htgallery 는 정적 코퍼스다(수집 2026-08-21). 갈래 분류를 화면에서 매번 돌리지 않고
     생성물로 굳혀 두면, 분류가 바뀌었는지를 diff 로 볼 수 있고 검증 스크립트가
     같은 분류기(engine/nk-studio.mjs classifyRelic)로 재분류해 어긋남을 잡아낸다.

   산출: frontend/src/data/studio-photos.ts (자동 생성 — 손대지 않는다)
   사용법: node scripts/nk-studio-photos.mjs
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyRelic, RELIC_CATS } from '../frontend/src/engine/nk-studio.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcPath = path.join(root, 'frontend/public/gohyang/reunion.json')
const outPath = path.join(root, 'frontend/src/data/studio-photos.ts')

const reunion = JSON.parse(fs.readFileSync(srcPath, 'utf8'))
const items = reunion?.htgallery?.items
if (!Array.isArray(items) || !items.length) {
  console.error('✗ reunion.json htgallery.items 가 비어 있다')
  process.exit(1)
}

const rows = items.map((it) => ({
  fileId: it.fileId,
  name: String(it.placeName ?? '').normalize('NFC').trim(),
  category: classifyRelic(it.fileId, it.placeName),
  oldKeys: it.oldKeys ?? [],
  areaRaw: String(it.areaRaw ?? '').trim(),
  provider: String(it.provider ?? '').trim() || '제공처 미상',
  thumbUrl: it.thumbUrl,
  viewUrl: it.viewUrl,
  sourceUrl: it.sourceUrl,
}))

/* 검산 — 전 항목 정확히 1갈래, 합 = 원천 건수 */
const catIds = new Set(RELIC_CATS.map((c) => c.id))
const bad = rows.filter((r) => !catIds.has(r.category) || !r.fileId || !r.name)
if (bad.length) {
  console.error('✗ 분류 불능 항목:', bad.map((r) => r.fileId).join(', '))
  process.exit(1)
}
const counts = {}
for (const r of rows) counts[r.category] = (counts[r.category] ?? 0) + 1

/* collectedAt 은 코너별 객체다({htgallery: 'YYYY-MM-DD', …}) — 통째로 String() 하면
   "[object Ob" 로 잘려 as-of 추적이 깨진다(실측으로 잡은 손상). htgallery 것만 꺼낸다. */
const collectedAt = reunion?.collectedAt?.htgallery
const data = {
  builtAt: (typeof collectedAt === 'string' && collectedAt ? collectedAt.slice(0, 10) : null),
  generator: 'scripts/nk-studio-photos.mjs',
  note: 'AI 스튜디오 사료 참고용 매니페스트. 사진은 저장하지 않고 통일부 원본 주소를 그대로 부르며, 저작권은 각 제공처에 있다 — 보며 참고만 하고 생성 AI 입력으로 쓰지 않는다.',
  total: rows.length,
  counts,
  items: rows,
}

const ts = `/* 자동 생성 파일 — 손으로 고치지 마라. scripts/nk-studio-photos.mjs 가 재생성한다.
   통일부 「나의 살던 고향은」 게재 사료 ${rows.length}장 · 갈래 분류는 engine/nk-studio.mjs classifyRelic 규칙.
   이미지 비보관(원본 주소 직결) · 저작권은 각 제공처 · 보며 참고 전용(생성 AI 입력 금지). */
const data = ${JSON.stringify(data, null, 1)}

export type StudioRelicCat = 'street' | 'coast' | 'nature' | 'living' | 'heritage'
export type StudioRelic = {
  fileId: string; name: string; category: StudioRelicCat
  oldKeys: string[]; areaRaw: string; provider: string
  thumbUrl: string; viewUrl: string; sourceUrl: string
}
export default data as unknown as {
  builtAt: string | null
  generator: string
  note: string
  total: number
  counts: Record<StudioRelicCat, number>
  items: StudioRelic[]
}
`
fs.writeFileSync(outPath, ts)
console.log(`✓ ${path.relative(root, outPath)} — ${rows.length}장`)
console.log('  갈래별:', RELIC_CATS.map((c) => `${c.label} ${counts[c.id] ?? 0}`).join(' · '))
