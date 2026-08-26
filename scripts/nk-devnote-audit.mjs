#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   개발자 주석 누출 감사 — 화면 문구에 파일명·함수명·내부 용어가 새는지 본다

   왜 만드는가
     사용자가 같은 문제를 두 번 지적했다.
       1차 — 분석 덱·지역 패널의 sources[].note 에 「python olefile로 파싱」 「JSESSIONID」 같은
              수집 메모가 그대로 떠 있었다(2026-08-21 전량 정화).
       2차 — 참여 화면에 「… 2026-08-25 생성(scripts/nk-pick-items.mjs).」 이 다시 들어갔다(2026-08-26).
     한 번 손으로 걷어내도 새 기능을 만들 때마다 되살아난다. 사람 약속이 아니라 검사로 막는다.
     nk-emoji-audit.mjs 와 같은 자리·같은 방식의 감사다.

   무엇을 재는가
     사용자에게 보이는 문자열 안에 아래가 있으면 실패로 잡는다.
       · 파일명·경로      scripts/… · *.mjs · *.cjs · *.ts(x) · *.json · 북한자료-api/…
       · 내부 식별자      pick_event · bukbti_event · pick_tally · BUKBTI_* 같은 상수·테이블 이름
       · 개발 용어        localStorage · RLS · CDP · API · Supabase · 정규식 · 파싱 · 조인 · 코퍼스
     주석(// 와 슬래시-별)은 화면에 안 나가므로 **검사 대상이 아니다** — 코드 주석은 자유롭게 쓴다.

   무엇을 봐주는가 (거짓 경보를 줄이려고 일부러 뺀 것)
     · 한글이 하나도 없는 문자열 — 코드·URL·클래스 이름이라 화면 문구가 아니다.
     · 대문자로 시작하는 식별자 단독 — import 이름 등.
     · ALLOW 에 적힌 예외 — 화면에 나가야 하는 정당한 말(기관명 등).

   쓰는 법
     node scripts/nk-devnote-audit.mjs [--json]
   나가는 값: 깨끗하면 0, 하나라도 새면 1.
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')

/* 감사 대상은 **고향잇기 현행 화면**이다.
   CLAUDE.md 가 이 폴더를 「두 세대가 섞인 저장소」로 규정했다 — 레거시 FactDoc 화면
   (Dashboard·Eval·Review·InfoTip·engine/eval 등)은 지우지도 고치지도 않기로 한 자산이라
   여기서 감사하지 않는다. 새 화면을 만들면 이 목록에 더한다 —
   목록에 없으면 감사도 안 된다는 뜻이라 빠뜨리지 말 것. */
const TARGET_DIRS = [
  'frontend/src/pages/gohyang',
  'frontend/src/pages/pick',
  'frontend/src/pages/studio',
  'frontend/src/components/gohyang',
  'frontend/src/components/pick',
]
const TARGET_FILES = [
  'frontend/src/pages/GohyangOn.tsx',
  'frontend/src/pages/AnalysisDeck.tsx',
  'frontend/src/components/MemoryCard.tsx',
  'frontend/src/components/MuseumTour.tsx',
  'frontend/src/components/MuseumBanner.tsx',
  'frontend/src/layouts/SasilOnLayout.tsx',
  'frontend/src/data/pick-items.ts',
  'frontend/src/data/pick-balance.ts',
  'frontend/src/data/pick-photos.ts',
  'frontend/src/data/bukbti.ts',
  'frontend/src/data/studio.ts',
  'frontend/src/data/studio-photos.ts',
  'frontend/src/engine/nk-guide.mjs',
  'frontend/src/engine/nk-summary.mjs',
  'frontend/src/engine/nk-studio.mjs',
  'frontend/src/lib/pickTally.ts',
  'frontend/src/lib/pickData.ts',
  'frontend/src/lib/bukbti.ts',
  'frontend/src/lib/studioPrompt.ts',
]
const EXT = new Set(['.tsx', '.ts', '.mjs', '.js', '.json'])

/* 화면에 나가면 안 되는 것 */
const BAD = [
  [/scripts\/[\w.\-]+/g, '스크립트 경로'],
  [/북한자료-api\/[\w.\-]+/g, '자료 폴더 경로'],
  [/\b[\w-]+\.(?:mjs|cjs|tsx|jsx)\b/g, '소스 파일명'],
  [/\b(?:pick_event|pick_tally|pick_balance_answer|bukbti_event|bukbti_tally)\b/g, '테이블 이름'],
  [/\bBUKBTI_[A-Z_]+|\bSTUDIO_[A-Z_]+/g, '내부 상수 이름'],
  [/\blocalStorage\b/g, '개발 용어'],
  [/\bRLS\b|\bCDP\b|\bJSESSIONID\b/g, '개발 용어'],
  [/정규식|파싱|파싱해|조인해|코퍼스/g, '개발 어휘'],
]

/* 화면에 나가도 되는 말 — 걸리면 안 되는 정당한 문자열 */
const ALLOW = [
  /공공데이터포털/,
  /data\.go\.kr/,
  /통일부/,
]

/** 코드 주석을 지운다 — 주석은 화면에 안 나가므로 감사 대상이 아니다 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

/** 한글이 든 문자열 리터럴만 뽑는다 — 그게 사람에게 보이는 말이다 */
function koreanLiterals(src) {
  const out = []
  const re = /'([^'\\\n]{4,400})'|"([^"\\\n]{4,400})"|`([^`\\]{4,600})`/g
  let m
  while ((m = re.exec(src))) {
    let t = m[1] ?? m[2] ?? m[3] ?? ''
    /* 템플릿 보간 ${...} 안은 코드다 — 화면에 나가는 것은 그 「값」이지 이 이름이 아니다.
       값 쪽은 그 상수가 선언된 자리에서 따로 감사된다. */
    t = t.replace(/\$\{[^}]*\}/g, ' ')
    if (!/[가-힣]/.test(t)) continue
    out.push({ text: t, at: m.index })
  }
  return out
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length
}

function walk(dir, acc = []) {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (EXT.has(path.extname(e.name))) acc.push(p)
  }
  return acc
}

const files = [
  ...TARGET_DIRS.flatMap((d) => walk(path.join(ROOT, d))),
  ...TARGET_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
]
const findings = []

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8')
  /* .json 은 주석이 없고 값 전체가 화면 재료일 수 있다 */
  const src = path.extname(f) === '.json' ? raw : stripComments(raw)
  for (const { text, at } of koreanLiterals(src)) {
    if (ALLOW.some((a) => a.test(text) && !/scripts\/|북한자료-api\/|\.mjs|\.cjs/.test(text))) continue
    for (const [re, kind] of BAD) {
      re.lastIndex = 0
      const hits = text.match(re)
      if (!hits) continue
      findings.push({
        file: path.relative(ROOT, f).replace(/\\/g, '/'),
        line: lineOf(src, at),
        kind,
        hit: [...new Set(hits)].join(', '),
        text: text.replace(/\s+/g, ' ').slice(0, 120),
      })
    }
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ files: files.length, findings, ok: findings.length === 0 }, null, 1))
} else {
  console.log(`\n개발자 주석 누출 감사 — 파일 ${files.length}개`)
  if (!findings.length) {
    console.log('\n통과 — 화면 문구에 파일명·함수명·내부 용어 0건\n')
  } else {
    console.log('')
    for (const f of findings) {
      console.log(`  [NG] ${f.file}:${f.line}  (${f.kind}: ${f.hit})`)
      console.log(`       ${f.text}`)
    }
    console.log(`\n누출 ${findings.length}건 — 화면에 나가는 말에서 빼십시오.`)
    console.log('  (코드 주석은 대상이 아닙니다. 정당한 말이면 ALLOW 에 근거와 함께 추가하십시오.)\n')
  }
}

process.exit(findings.length ? 1 : 0)
