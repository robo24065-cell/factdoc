#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   고향ON 렌더링 이모지 감사 — 화면에 그림문자가 한 개도 뜨지 않는지 검사한다.

   왜 스크립트로 만드는가
     theme/gohyang.ts 의 제약 ① 은 "그림 이모지를 쓰지 않는다"이고, 이유는 취향이 아니다.
       · 기기마다 모양이 달라져 흑백 인쇄에서 뭉개진다
       · 관공서 화면에서 장식 이모지는 수치의 무게를 깎는다
       · 실사용자 평균 나이 83.0세 — 뜻이 불분명한 그림은 라벨을 대신하지 못한다
     제약을 문서에만 적어 두면 다음 작업에서 조용히 새어 들어온다. 매번 셀 수 있게 만든다.

   무엇을 세는가 (판정 기준)
     ✗ 금지 — **컬러 이모지로 렌더되는 문자**
        · \p{Emoji_Presentation}      기본값이 이모지 표현인 문자 (🟢 📊 ✅ …)
        · \p{Extended_Pictographic}+U+FE0F  텍스트 문자를 이모지로 강제한 것 (⚠️ ❗️ …)
     ○ 허용 — 기하 도형·화살표·괄호기호 (● ▲ ■ ◆ ◇ ★ ↗ ↓ → ▾ ▴ ⚠)
        글꼴 글리프이지 이모지가 아니다. 흑백에서도 모양이 남고 색·라벨과 함께 3중 부호화된다.
        ※ U+26A0(⚠)은 VS16 없이 쓰면 텍스트 표현이라 통과하지만, 플랫폼에 따라 흔들리므로
          화면 코드에서는 plain() 으로 떼어 내고 있다 — 여기서는 '남아 있으면 알려주는' 참고 항목이다.

   소스만 보지 않고 **데이터 팩까지** 본다.
     화면 문자열의 상당수가 JSON 에서 온다(사료 제목·경로 설명·caveats).
     소스가 깨끗해도 데이터에 이모지가 있으면 화면에는 이모지가 뜬다.

   사용법
     node scripts/nk-emoji-audit.mjs            # 기본 대상 검사
     node scripts/nk-emoji-audit.mjs --json     # 기계 판독용 1줄 JSON
     node scripts/nk-emoji-audit.mjs 경로 …     # 대상 추가(glob 아님, 파일/디렉터리 경로)

   나가는 값: 발견 0건이면 0, 1건 이상이면 1.
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* 한글 폴더명 + Windows 드라이브 문자 때문에 URL.pathname 을 쓰면 안 된다 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const AS_JSON = argv.includes('--json')
const extra = argv.filter((a) => !a.startsWith('--'))

/* 기본 대상 — 고향ON 화면이 렌더하는 코드와 그 화면이 fetch 하는 데이터 팩 */
const TARGETS = [
  'frontend/src/pages/GohyangOn.tsx',
  'frontend/src/theme/gohyang.ts',
  'frontend/src/layouts/SasilOnLayout.tsx',
  'frontend/public/gohyang',
  ...extra,
]

/** 컬러 이모지로 렌더되는 문자 (VS16 는 ️ 로 명시 — 눈에 안 보이는 문자를 소스에 직접 두지 않는다) */
const BANNED = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/gu
/** 참고용 — 기본값이 텍스트 표현이라 통과하지만 플랫폼에 따라 이모지로 흔들리는 문자 */
const WOBBLY = /[⚠✔✖☑✉☎✂☀♻]/gu

function listFiles(rel) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) return []
  const st = fs.statSync(abs)
  if (st.isFile()) return [abs]
  return fs
    .readdirSync(abs)
    .filter((f) => /\.(tsx?|jsx?|mjs|json|css|html|md)$/.test(f))
    .map((f) => path.join(abs, f))
    .filter((f) => fs.statSync(f).isFile())
}

const files = [...new Set(TARGETS.flatMap(listFiles))]
if (!files.length) {
  console.error('✗ 검사할 파일이 없다. 경로를 확인하라.')
  process.exit(1)
}

const rows = []
let banned = 0
let wobbly = 0

for (const abs of files) {
  const rel = path.relative(root, abs).replace(/\\/g, '/')
  const text = fs.readFileSync(abs, 'utf8')
  const hitsB = text.match(BANNED) ?? []
  const hitsW = text.match(WOBBLY) ?? []
  banned += hitsB.length
  wobbly += hitsW.length

  /* 어느 줄인지 알려 준다 — 5.4MB JSON 에서 문자 하나를 손으로 찾을 수는 없다 */
  const where = []
  if (hitsB.length) {
    text.split('\n').forEach((ln, i) => {
      const m = ln.match(BANNED)
      if (m) where.push({ line: i + 1, chars: [...new Set(m)].join(' '), excerpt: ln.trim().slice(0, 100) })
    })
  }
  rows.push({
    file: rel,
    bytes: Buffer.byteLength(text),
    banned: hitsB.length,
    bannedChars: [...new Set(hitsB)],
    wobbly: hitsW.length,
    wobblyChars: [...new Set(hitsW)],
    where: where.slice(0, 20),
  })
}

if (AS_JSON) {
  console.log(JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), files: rows.length, banned, wobbly, rows }))
  process.exit(banned === 0 ? 0 : 1)
}

console.log(`\n▶ 렌더링 이모지 감사 — 파일 ${rows.length}개`)
for (const r of rows) {
  const mark = r.banned === 0 ? '✓' : '✗'
  const tail = r.banned === 0 ? '이모지 0개' : `이모지 ${r.banned}개 — ${r.bannedChars.join(' ')}`
  const note = r.wobbly ? `  (참고: 텍스트 표현 기호 ${r.wobbly}개 ${r.wobblyChars.join(' ')})` : ''
  console.log(`  ${mark} ${r.file.padEnd(44)} ${String(r.bytes).padStart(9)} B  ${tail}${note}`)
  for (const w of r.where) console.log(`       ${w.line}행  ${w.chars}  ${w.excerpt}`)
}

if (banned === 0) {
  console.log(`\n✓ 통과 — 렌더링 이모지 0개 (기하 도형·화살표는 허용 대상이라 세지 않는다)\n`)
  process.exit(0)
}
console.error(`\n✗ 실패 — 렌더링 이모지 ${banned}개. theme/gohyang.ts 제약 ①: 의미가 필요하면 기하 도형(● ▲ ■ ◆ ◇)이나 한국어 라벨을 쓴다.\n`)
process.exit(1)
