// 일회성 정리 — 기존 kdca-corpus.ts에서 '본문 대신 파일 다운로드 URL만 들어간' 섹션 제거.
// (650문서 대확장 때 figure/표 링크가 본문으로 섞여 들어옴. 재수집 없이 즉시 교정.)
// 실행: node scripts/clean-corpus-urls.mjs  → 같은 포맷으로 kdca-corpus.ts 재기록.
// 수집기(fetch-kdca-provide.mjs)에도 동일 strip을 넣어 향후 재수집 시 재발 방지함.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const req = createRequire(new URL('../frontend/package.json', import.meta.url))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)

const OUT = fileURLToPath(new URL('../frontend/src/engine/kdca-corpus.ts', import.meta.url))
const SECTION_MAX = 230

const root = fileURLToPath(new URL('../frontend', import.meta.url))
const server = await createServer({ root, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' })
const mod = await server.ssrLoadModule('/src/engine/kdca-corpus.ts')
const CORPUS = mod.KDCA_CORPUS
await server.close()

let dropChunks = 0, dropDocs = 0, before = 0, afterCnt = 0
const cleaned = []
for (const d of CORPUS) {
  const chunks = []
  for (const c of d.chunks) {
    before++
    let text = String(c.text).replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim()
    if (text.length < 20) { dropChunks++; continue }
    if (text.length > SECTION_MAX) text = text.slice(0, SECTION_MAX)
    chunks.push({ section: c.section, text })
    afterCnt++
  }
  if (!chunks.length) { dropDocs++; continue }
  cleaned.push({ title: d.title, cntntsSn: d.cntntsSn, portal: d.portal, chunks })
}

const body = cleaned.map((d) => {
  const chunks = d.chunks.map((c) => `    { section: ${JSON.stringify(c.section)}, text: ${JSON.stringify(c.text)} },`).join('\n')
  return `  { title: ${JSON.stringify(d.title)}, cntntsSn: ${JSON.stringify(d.cntntsSn)}, portal: ${JSON.stringify(d.portal)}, chunks: [\n${chunks}\n  ] },`
}).join('\n')
const header = `// 질병관리청 국가건강정보포털 코퍼스 — 건강정보 제공 API(healthInfoList+healthInfo) 전수 수집. ⚠ 수기편집 금지(재수집).\n` +
  `// 출처: 질병관리청 국가건강정보포털. 공공누리 제4유형(출처표시+비상업+변경금지) — 섹션당 짧은 발췌(${SECTION_MAX}자)+출처 포인터만. ${cleaned.length}개 문서 / ${afterCnt}개 섹션.\n` +
  `export interface KdcaDoc { title: string; cntntsSn: string; portal: string; chunks: { section: string; text: string }[] }\n\n` +
  `export const KDCA_CORPUS: KdcaDoc[] = [\n${body}\n]\n`
fs.writeFileSync(OUT, header, 'utf8')
console.log(`✓ 정리 완료 — 섹션 ${before}→${afterCnt} (URL전용 ${dropChunks}건 제거), 문서 ${CORPUS.length}→${cleaned.length} (빈문서 ${dropDocs}건 제거)`)
