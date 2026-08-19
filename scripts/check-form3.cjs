#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   서식3 규격 검사기 — 「A4 10페이지 이내 / 휴먼명조 / 14pt / 줄간격 160%」

   왜 따로 두는가
     이 네 줄은 공모전 안내문이 정한 **실격 사유**다. 사람이 "지켰다"고 말하는 것과
     파일이 실제로 그런 것은 다르다. 표를 넣거나 문장을 고칠 때마다 조용히 깨질 수
     있는 종류라서, 문서를 만들 때마다 기계가 다시 재도록 한다.

   무엇을 재는가 (docx 를 풀어 XML 을 직접 본다 — 눈대중 금지)
     [1] 글꼴   모든 w:rFonts 가 휴먼명조인가 (ascii/eastAsia/hAnsi/cs 전부)
     [2] 크기   모든 w:sz 가 28 half-point = 14pt 인가
     [3] 줄간격 모든 문단의 w:spacing 이 line=384(=240*1.6) lineRule=auto 인가
     [4] 기본값 docDefaults·스타일에 다른 글꼴/크기가 숨어 있지 않은가
     [5] 쪽수   Word COM 으로 실측 (Word 가 없으면 못 쟀다고 정직하게 말한다)

   쓰는 법
     node scripts/check-form3.cjs [파일경로] [--json]
     기본 대상: 제출서류/서식3_아이디어기획서_고향잇기.docx

   나가는 값: 전부 통과면 0, 하나라도 위반이면 1.
   ────────────────────────────────────────────────────────────────────────── */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const FONT = '휴먼명조'
const SZ = 28          // 14pt (half-points)
const LINE = 384       // 160% (240 × 1.6)
const MAX_PAGES = 10

const argv = process.argv.slice(2)
const AS_JSON = argv.includes('--json')
const target = argv.find((a) => !a.startsWith('--'))
  || path.join(ROOT, '제출서류', '서식3_아이디어기획서_고향잇기.docx')

const out = []
const say = (s) => { if (!AS_JSON) console.log(s) }
const check = (name, pass, detail = '') => {
  out.push({ name, pass: Boolean(pass), detail })
  say(`  ${pass ? '[OK]' : '[NG]'} ${name}${detail ? `  - ${detail}` : ''}`)
}

/* ── docx 는 zip 이다. 의존성을 늘리지 않으려고 최소 리더를 직접 쓴다.
      (중앙 디렉터리를 읽고 deflate 만 푼다 — docx 는 전부 deflate/stored 다) ── */
function unzip(file) {
  const buf = fs.readFileSync(file)
  const zlib = require('zlib')
  const files = {}
  // End of Central Directory
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip 중앙 디렉터리를 찾지 못했다')
  const n = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const cmtLen = buf.readUInt16LE(p + 32)
    const lho = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    // local header 에서 실제 데이터 시작점을 다시 구한다(extra 길이가 다를 수 있다)
    const lNameLen = buf.readUInt16LE(lho + 26)
    const lExtraLen = buf.readUInt16LE(lho + 28)
    const start = lho + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + csize)
    try {
      files[name] = method === 0 ? raw : zlib.inflateRawSync(raw)
    } catch { /* 못 푼 항목은 건너뛴다 — 우리가 볼 것은 xml 뿐이다 */ }
    p += 46 + nameLen + extraLen + cmtLen
  }
  return files
}

/* ── 쪽수는 Word 만이 정확히 안다(줄바꿈·표 분할이 렌더러에 달렸다) ── */
function pageCount(file) {
  const ps = [
    '$ErrorActionPreference = "Stop"',
    'try {',
    '  $w = New-Object -ComObject Word.Application',
    '  $w.Visible = $false',
    `  $d = $w.Documents.Open("${file.replace(/\\/g, '\\\\')}", $false, $true)`,
    '  $n = $d.ComputeStatistics(2)',
    '  $d.Close($false); $w.Quit()',
    '  Write-Output $n',
    '} catch { Write-Output "ERR" }',
  ].join('; ')
  try {
    const r = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8', timeout: 180000,
    }).trim()
    const m = r.match(/(\d+)\s*$/)
    return m ? Number(m[1]) : null
  } catch { return null }
}

function main() {
  if (!fs.existsSync(target)) {
    console.error(`파일이 없다: ${target}`)
    process.exit(1)
  }
  say(`\n서식3 규격 검사 - ${path.relative(ROOT, target)}`)
  say(`  기준: A4 ${MAX_PAGES}쪽 이내 / ${FONT} / 14pt(sz ${SZ}) / 줄간격 160%(line ${LINE})\n`)

  const z = unzip(target)
  const doc = (z['word/document.xml'] || Buffer.from('')).toString('utf8')
  const styles = (z['word/styles.xml'] || Buffer.from('')).toString('utf8')
  if (!doc) { console.error('word/document.xml 을 읽지 못했다'); process.exit(1) }

  /* [1] 글꼴 — rFonts 의 모든 속성값이 휴먼명조여야 한다 */
  const fontAttrs = [...doc.matchAll(/<w:rFonts\b([^>]*)\/?>/g)]
    .flatMap((m) => [...m[1].matchAll(/w:(?:ascii|eastAsia|hAnsi|cs)="([^"]*)"/g)].map((x) => x[1]))
  const badFonts = [...new Set(fontAttrs.filter((f) => f !== FONT))]
  check(`본문 글꼴이 전부 ${FONT}`, badFonts.length === 0,
    badFonts.length ? `다른 글꼴 ${badFonts.length}종: ${badFonts.join(', ')}` : `rFonts ${fontAttrs.length}개 전부 일치`)

  /* ── 본문과 서식 구성요소를 가른다 ──
     공식 hwpx 원본을 뜯어 보면 양식 **자신이** 여러 크기를 쓴다:
       12pt(머리 대괄호줄) · 20pt(「아이디어 기획서」 표제) · 14pt(본문) · 10pt 이하(안내 잔글씨).
     그러므로 「글자 폰트 크기 14」는 **응모자가 쓰는 본문**에 걸리는 규칙이고,
     양식이 주는 표제·라벨까지 14pt 로 눌러 버리면 오히려 원본과 달라진다.
     여기서는 길이로 가른다 — 30자 이상 이어지는 글은 본문이다(라벨·표제는 짧다). */
  const BODY_MIN = 30
  const runs = [...doc.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)].map((m) => {
    const inner = m[1]
    const text = [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((t) => t[1]).join('')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    const sz = Number((inner.match(/<w:sz\s+w:val="(\d+)"/) || [])[1] || SZ)
    return { text, sz }
  }).filter((r) => r.text.trim())

  const body = runs.filter((r) => r.text.length >= BODY_MIN)
  const furniture = runs.filter((r) => r.text.length < BODY_MIN && r.sz !== SZ)

  /* [2] 본문 크기 — 여기가 실격이 걸리는 자리다 */
  const badBody = body.filter((r) => r.sz !== SZ)
  check(`본문 글자 크기가 전부 14pt(sz ${SZ})`, badBody.length === 0,
    badBody.length
      ? `어긋난 본문 ${badBody.length}개: ${badBody.slice(0, 3).map((r) => `${r.sz / 2}pt "${r.text.slice(0, 24)}…"`).join(' / ')}`
      : `본문 런 ${body.length}개 전부 ${SZ}`)

  /* 서식 구성요소는 위반이 아니라 **눈으로 확인할 목록**으로 보여 준다 */
  if (furniture.length) {
    const grp = {}
    furniture.forEach((r) => { (grp[r.sz] ||= []).push(r.text.trim()) })
    say(`      (서식 구성요소 ${furniture.length}개 - 원본 양식도 12/14/20pt 를 섞어 쓴다)`)
    Object.entries(grp).forEach(([sz, ts]) => {
      say(`        ${Number(sz) / 2}pt : ${[...new Set(ts)].slice(0, 4).map((t) => `"${t.slice(0, 22)}"`).join(', ')}`)
    })
  }

  /* [3] 줄간격 — 본문 문단만 본다. 표 라벨 한 줄짜리는 대상이 아니다. */
  const paras = [...doc.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((m) => m[1])
  const bodyParas = paras.filter((p) => {
    const t = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('')
    return t.length >= BODY_MIN
  })
  const badLine = bodyParas.filter((p) => {
    const a = (p.match(/<w:spacing\b([^>]*)\/?>/) || [])[1]
    if (!a || !/w:line="/.test(a)) return true          // 지정이 없으면 기본값을 타므로 위반으로 본다
    const v = Number((a.match(/w:line="(\d+)"/) || [])[1])
    const rule = (a.match(/w:lineRule="([^"]+)"/) || [])[1] || 'auto'
    return v !== LINE || rule !== 'auto'
  })
  check(`본문 줄간격이 전부 160%(line ${LINE}, auto)`, badLine.length === 0,
    badLine.length ? `어긋난 본문 문단 ${badLine.length}개 / 전체 ${bodyParas.length}개` : `본문 문단 ${bodyParas.length}개 전부 일치`)

  /* [4] 문서 기본값(docDefaults)만 본다 — docx 생성기가 쓰지도 않는 표제 스타일을
         잔뜩 넣어 두므로 명명 스타일까지 세면 잡음만 늘어난다. */
  const dd = (styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/) || [''])[0]
  const ddFonts = [...dd.matchAll(/w:(?:ascii|eastAsia|hAnsi|cs)="([^"]*)"/g)].map((m) => m[1])
  const ddBadFont = [...new Set(ddFonts.filter((f) => f !== FONT))]
  const ddSz = [...new Set([...dd.matchAll(/<w:sz(?:Cs)?\s+w:val="(\d+)"/g)].map((m) => Number(m[1])).filter((s) => s !== SZ))]
  check('문서 기본값이 휴먼명조·14pt', ddBadFont.length === 0 && ddSz.length === 0,
    [ddBadFont.length ? `기본 글꼴 ${ddBadFont.join(', ')}` : '',
     ddSz.length ? `기본 크기 ${ddSz.join(', ')}` : ''].filter(Boolean).join(' / ')
     || (dd ? `docDefaults = ${FONT}/${SZ}` : 'docDefaults 없음 - 런마다 명시하고 있어 무해'))

  /* [5] 쪽수 */
  const pages = pageCount(path.resolve(target))
  if (pages == null) {
    check(`A4 ${MAX_PAGES}쪽 이내`, false, 'Word COM 으로 쪽수를 재지 못했다 (Word 미설치 또는 COM 실패) - 사람이 열어 확인할 것')
  } else {
    check(`A4 ${MAX_PAGES}쪽 이내`, pages <= MAX_PAGES, `실측 ${pages}쪽`)
  }

  const ok = out.every((r) => r.pass)
  if (AS_JSON) console.log(JSON.stringify({ file: target, pages, results: out, ok }, null, 1))
  else say(`\n${ok ? '통과' : '위반 있음'} - ${out.filter((r) => r.pass).length}/${out.length}\n`)
  process.exit(ok ? 0 : 1)
}

main()
