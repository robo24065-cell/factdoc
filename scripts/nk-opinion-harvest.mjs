// nk-opinion-harvest.mjs — 서울대 통일평화연구원 「통일의식조사」 연도별 추이 수집
//                          → 북한자료-api/unification-opinion.json
//
// 수집원 3종 (전부 실측 다운로드. 실패하면 죽는다 — 추정치로 채우지 않는다):
//   ① 인포그래픽 시계열 XLSX  ipus.snu.ac.kr /wp-content/themes/ipus/graph/korea-unity-infographic/
//      · 지표 목록은 하드코딩하지 않는다. 같은 테마의 graph/main.js 안 setDownload(sec,menu,gNum,gName)
//        호출을 긁어 파일명을 조립한다 (파일명 규칙 = {menu}-{gNum}-{gName}.xlsx).
//        → 사이트가 지표를 늘리면 이 스크립트도 자동으로 따라간다.
//      · 커버리지 2007~2022. 그 뒤는 인포그래픽에 없다(실측).
//   ② 연도별 기초보고서 PDF   data-archive 페이지에서 링크를 긁어 연도별로 분류
//      · 「표 2. 남북한 통일의 필요성」 전체 행을 좌표 기반으로 추출(연도마다 열 순서가 다르다).
//      · ①의 2022 이후 공백(2023·2024·2025)을 메우는 유일한 경로.
//   ③ 2025 로데이터 ZIP       파일목록·응답자 수·주요 컬럼 확인 + 가중집계로 ②를 교차검증
//      · 용량 때문에 2025년분 1개만 받는다.
//
// 포맷 디코딩(xlsx/pdf/zip)은 scripts/nk-opinion-parse.py 가 맡는다(openpyxl + PyMuPDF).
//
// 실행:  node scripts/nk-opinion-harvest.mjs [--today=YYYY-MM-DD] [--fresh] [--no-sweep]
//   --fresh     캐시 무시하고 전부 다시 받는다
//   --no-sweep  Uni01~Uni20 존재여부 일제 조사(HEAD 480회)를 건너뛴다
// 재실행 가능. 원본은 북한자료-api/_cache/opinion/ 에 캐시된다(.gitignore 처리됨). 키 불필요.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '북한자료-api', 'unification-opinion.json')
const CACHE = path.join(ROOT, '북한자료-api', '_cache', 'opinion')
const PY = path.join(ROOT, 'scripts', 'nk-opinion-parse.py')
const ARGS = process.argv.slice(2)
const TODAY = (ARGS.find((a) => a.startsWith('--today=')) || '').slice(8) ||
  process.env.TODAY || new Date().toISOString().slice(0, 10)
const FRESH = ARGS.includes('--fresh')
const SWEEP = !ARGS.includes('--no-sweep')

const IPUS = 'https://ipus.snu.ac.kr'
const URLS = {
  home: `${IPUS}/`,
  mainJs: `${IPUS}/wp-content/themes/ipus/graph/main.js`,
  infographic: `${IPUS}/wp-content/themes/ipus/graph/korea-unity-infographic/`,
  archive: `${IPUS}/data-archive`,
}
// 이용 조건 — 원문 표기를 그대로 보존한다. 화면·기획서 어디서든 이 문구가 따라붙어야 한다.
const LICENSE = '서울대학교 통일평화연구원에서 실시한 통일의식조사'
const LICENSE_FULL =
  '본 자료를 활용하실 경우 반드시 서울대학교 통일평화연구원에서 실시한 통일의식조사 자료임.'

// 인포그래픽 메뉴 라벨 — ipus.snu.ac.kr 메인 그래프 위젯 탭 표기 그대로(실측).
const MENU = {
  1: { dir: '1-opinion-south', label: '남한 주민 대상 통일의식조사', respondents: '남한 주민' },
  2: { dir: '2-opinion-north', label: '북한 이탈 주민 대상 통일의식조사', respondents: '북한이탈주민(북한 거주 시 인식)' },
  3: { dir: '3-society-north', label: '북한 이탈 주민 대상 북한사회변동조사', respondents: '북한이탈주민(북한 사회 실태)' },
}

const die = (msg) => { console.error('✗ ' + msg); process.exit(1) }
const pad2 = (n) => String(n).padStart(2, '0')
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
fs.mkdirSync(CACHE, { recursive: true })

// ── 다운로드 ────────────────────────────────────────────────────────────────
// 한글 경로가 섞인 URL 이 많아 encodeURI 필수(생 UTF-8 경로는 404로 떨어진다 — 실측).
function curlTo(url, file, label) {
  const dest = path.join(CACHE, file)
  if (!FRESH && fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest
  let last
  for (let i = 0; i < 3; i++) {
    try {
      execFileSync('curl', ['-sSL', '--fail', '--max-time', '300', '-A', 'Mozilla/5.0',
        '-o', dest, encodeURI(url)], { stdio: ['ignore', 'ignore', 'pipe'] })
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest
      last = new Error('0바이트 응답')
    } catch (e) { last = e; try { fs.unlinkSync(dest) } catch {} }
    sleep(1200 * (i + 1))
  }
  die(`다운로드 실패(${label}): ${url} — ${last?.message}`)
}
const curlText = (url, file, label) => fs.readFileSync(curlTo(url, file, label), 'utf8')

// 여러 URL 을 한 번의 curl 로 HEAD — 연결 재사용 덕에 480건도 수 초에 끝난다.
// -I 는 헤더를 stdout 에 흘리므로 마커 접두 write-out 줄만 골라 읽는다.
// (마커에 '@' 를 쓰면 curl 이 -w 인자를 파일명으로 해석해 죽는다 — 실측.)
const HEAD_MARK = '<<HEAD>>'
function headMany(urls) {
  const out = {}
  for (let i = 0; i < urls.length; i += 40) {
    const batch = urls.slice(i, i + 40)
    let stdout = ''
    try {
      stdout = execFileSync('curl', ['-s', '-I', '--max-time', '60', '-A', 'Mozilla/5.0',
        '-w', `${HEAD_MARK}%{url_effective} %{http_code}\n`, ...batch.map(encodeURI)],
        { encoding: 'utf8', maxBuffer: 1 << 26 })
    } catch (e) { stdout = e.stdout || '' }
    for (const line of stdout.split('\n')) {
      const m = line.match(/^<<HEAD>>(\S+) (\d{3})/)
      if (m) out[decodeURI(m[1])] = +m[2]
    }
  }
  if (!Object.keys(out).length) die(`HEAD 일제 조사가 한 건도 응답을 못 받았다 (${urls.length}건 시도)`)
  return out
}

// ── python 헬퍼 ─────────────────────────────────────────────────────────────
function py(cmd, file) {
  let stdout
  try {
    stdout = execFileSync('python', [PY, cmd, file], { encoding: 'utf8', maxBuffer: 1 << 28 })
  } catch (e) {
    die(`nk-opinion-parse.py ${cmd} 실패: ${file}\n${(e.stderr || e.message || '').trim()}`)
  }
  try { return JSON.parse(stdout) } catch { die(`파서 출력이 JSON 아님: ${cmd} ${file}`) }
}

// ── ① 인포그래픽: 지표 목록 발견 ────────────────────────────────────────────
function discoverManifest() {
  const js = curlText(URLS.mainJs, 'main.js', '인포그래픽 main.js')
  const survey = [], index = []
  const re = /setDownload\(\s*(\d)\s*,\s*"(\d+)"\s*,\s*(?:"(\d+)"|null)\s*,\s*"([^"]+)"\s*\)/g
  const seen = new Set()
  for (const m of js.matchAll(re)) {
    const [, sec, menu, gNum, gName] = m
    const id = `${sec}|${menu}|${gNum || ''}|${gName}`
    if (seen.has(id)) continue
    seen.add(id)
    if (sec === '1') survey.push({ menu: +menu, gNum, gName })
    else index.push({ menu: +menu, gName })
  }
  if (!survey.length) die('main.js 에서 setDownload() 호출을 찾지 못함 — 사이트 구조가 바뀌었다')
  survey.sort((a, b) => a.menu - b.menu || a.gNum.localeCompare(b.gNum))
  return { survey, index, jsBytes: js.length }
}
const surveyUrl = (e) => `${URLS.infographic}1-survey-data/${MENU[e.menu].dir}/${e.menu}-${e.gNum}-${e.gName}.xlsx`
const surveyPng = (e) => `${URLS.infographic}1-survey-graph/${MENU[e.menu].dir}/${e.menu}-${e.gNum}-${e.gName}.png`
const indexUrl = (e) => `${URLS.infographic}2-index-data/${e.menu}-${e.gName}.xlsx`

// ── ① 인포그래픽: 시트 → 블록(연도 머리행 + 라벨행) ─────────────────────────
// Nkd01_11(탈북민 친근감)처럼 문항 개편으로 한 파일에 블록이 3개 들어있는 경우가 있어
// 블록을 전부 보존하고, 그중 연도 폭이 가장 넓은 블록을 대표 시계열로 승격한다.
const isYear = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1990 && v <= 2100
const numOrNull = (v) => (typeof v === 'number' ? v : v == null || v === '' || !Number.isFinite(+v) ? null : +v)

function yearCols(row) {
  const cols = []
  for (let c = 1; c < row.length; c++) if (isYear(row[c])) cols.push(c)
  return cols
}
function parseBlocks(rows) {
  const blocks = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || []
    const cols = yearCols(r)
    if (r[0] != null || cols.length < 3) continue
    const dataRows = []
    for (let j = i + 1; j < rows.length; j++) {
      const rr = rows[j] || []
      if (rr[0] == null) {
        if (yearCols(rr).length >= 3) break     // 다음 블록 머리행
        continue                                 // 블록 사이 빈 줄
      }
      const values = cols.map((c) => numOrNull(rr[c]))
      if (values.every((v) => v === null)) continue
      dataRows.push({ label: String(rr[0]).replace(/\s+/g, ' ').trim(), values })
    }
    if (dataRows.length) blocks.push({ years: cols.map((c) => r[c]), rows: dataRows })
  }
  return blocks
}
function parseTitle(rows) {
  for (const r of rows.slice(0, 5)) {
    for (const c of r || []) {
      if (typeof c !== 'string') continue
      const m = c.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\)\s*(.+)$/s)
      if (m) {
        const text = m[2].replace(/\s+/g, ' ').trim()
        return { titleKey: m[1], question: text, topic: text.split(':')[0].trim() }
      }
    }
  }
  return null
}

function harvestSeries(manifest) {
  const series = [], missing = []
  for (const e of manifest.survey) {
    const url = surveyUrl(e)
    const file = `info-${e.menu}-${e.gNum}-${e.gName}.xlsx`
    const p = curlTo(url, file, `인포그래픽 ${e.menu}-${e.gNum}-${e.gName}`)
    const bytes = fs.statSync(p).size
    const parsed = py('xlsx', p)
    const rows = parsed.sheets[0]?.rows || []
    const t = parseTitle(rows)
    const blocks = parseBlocks(rows)
    if (!blocks.length) { missing.push(`${e.menu}-${e.gNum}-${e.gName}: 연도 머리행 없음`); continue }
    const primary = blocks.reduce((a, b) => (b.years.length > a.years.length ? b : a))
    series.push({
      key: e.gName,
      titleKey: t?.titleKey ?? null,
      topic: t?.topic ?? null,
      question: t?.question ?? null,
      group: { menu: e.menu, label: MENU[e.menu].label, respondents: MENU[e.menu].respondents, dir: MENU[e.menu].dir },
      unit: '%',
      years: primary.years,
      rows: primary.rows,
      blocks: blocks.length > 1 ? blocks : undefined,
      blockNote: blocks.length > 1
        ? `문항 개편으로 파일 안에 블록 ${blocks.length}개. years/rows 는 연도 폭이 가장 넓은 블록.` : undefined,
      source: { xlsx: url, png: surveyPng(e), bytes, sheet: parsed.sheets[0]?.name ?? null },
    })
  }
  return { series, missing }
}

// ── ① 확장 조사: Uni01~Uni20 이 정말 목록에 있는 게 전부인가 ────────────────
function sweepUni(manifest) {
  const known = new Set(manifest.survey.map((e) => surveyUrl(e)))
  const urls = []
  for (const menu of [1, 2]) {
    for (let g = 1; g <= 12; g++) {
      for (let u = 1; u <= 20; u++) {
        urls.push(`${URLS.infographic}1-survey-data/${MENU[menu].dir}/${menu}-${pad2(g)}-Uni${pad2(u)}.xlsx`)
      }
    }
  }
  const res = headMany(urls)
  const found = Object.entries(res).filter(([, code]) => code === 200).map(([u]) => u)
  return {
    pattern: '{menu}-{gNum:01..12}-Uni{01..20}.xlsx (menu 1·2)',
    tried: urls.length,
    found: found.sort(),
    extraBeyondManifest: found.filter((u) => !known.has(u)),
    note: '파일명에 차트슬롯 번호(gNum)가 들어가므로 1-01-Uni01 식 조합만 존재한다. Uni02·Uni04… 처럼 슬롯이 없는 문항은 인포그래픽에 배포되지 않는다.',
  }
}

// ── ② 데이터 아카이브: 연도별 파일 목록 ─────────────────────────────────────
const KIND = [
  [/기초보고서/, 'report'],
  [/로데이터|로_데이터|rawdata/i, 'rawdata'],
  [/코드북/, 'codebook'],
  [/설문지|조사표|질문지/, 'questionnaire'],
]
function discoverArchive() {
  const html = curlText(URLS.archive, 'data-archive.html', '데이터 아카이브')
  const byYear = new Map()
  for (const m of html.matchAll(/href="(https:\/\/ipus\.snu\.ac\.kr\/wp-content\/uploads\/[^"]+\.(?:pdf|zip|xlsx))"/g)) {
    const url = m[1]
    const name = decodeURIComponent(url.split('/').pop())
    if (!/통일의식조사/.test(name)) continue
    const ym = name.match(/(20\d{2})/)
    if (!ym) continue
    const year = +ym[1]
    const kind = KIND.find(([re]) => re.test(name))?.[1]
    if (!kind) continue
    if (!byYear.has(year)) byYear.set(year, { year, files: {} })
    byYear.get(year).files[kind] = { url, name }
  }
  const landings = [...new Set([...html.matchAll(/href="(https:\/\/ipus\.snu\.ac\.kr\/blog\/archives\/research\/\d+)"/g)].map((m) => m[1]))]
  const years = [...byYear.values()].sort((a, b) => a.year - b.year)
  if (!years.length) die('데이터 아카이브에서 연도별 파일 링크를 찾지 못함 — 페이지 구조가 바뀌었다')
  return { years, landings }
}

// ── ② 기초보고서 PDF → 통일 필요성 전체 행 ──────────────────────────────────
function harvestReports(archive) {
  const out = [], failed = []
  for (const y of archive.years) {
    const f = y.files.report
    if (!f) { failed.push({ year: y.year, reason: '기초보고서 PDF 링크 없음' }); continue }
    const p = curlTo(f.url, `report-${y.year}.pdf`, `${y.year} 기초보고서`)
    const r = py('report', p)
    if (!r.textPdf) { failed.push({ year: y.year, reason: `이미지 PDF(텍스트 레이어 없음, ${r.pages}쪽)` }); continue }
    out.push({
      year: y.year, url: f.url, fileBytes: fs.statSync(p).size, pdfPages: r.pages, tablePage: r.page + 1,
      // as-of = 실사 종료일. 조사연도 말일이 아니다(2025년분은 9/1 종료).
      asOf: r.fieldPeriod?.to ?? null,
      sampleSize: r.sampleSize, need: r.need, neutral: r.neutral, notNeed: r.notNeed, sum: r.sum,
      fieldPeriod: r.fieldPeriod
        ? { from: r.fieldPeriod.from, to: r.fieldPeriod.to, days: r.fieldPeriod.days, printedDays: r.fieldPeriod.printedDays }
        : null,
    })
  }
  return { reports: out.sort((a, b) => a.year - b.year), failed }
}

// ── ③ 2025 로데이터 ZIP ─────────────────────────────────────────────────────
function harvestMicrodata(archive) {
  const latest = archive.years.filter((y) => y.files.rawdata).sort((a, b) => b.year - a.year)[0]
  if (!latest) return { available: false, note: '데이터 아카이브에서 로데이터 ZIP 링크를 찾지 못함' }
  const landing = archive.landings[0] || null
  const p = curlTo(latest.files.rawdata.url, `rawdata-${latest.year}.zip`, `${latest.year} 로데이터 ZIP`)
  const bytes = fs.statSync(p).size
  const r = py('microdata', p)
  const x = r.xlsx
  return {
    available: true,
    year: latest.year,
    url: latest.files.rawdata.url,
    landingUrl: landing,
    zipBytes: bytes,
    files: r.files,
    respondents: x ? x.respondents : null,
    unit: '개인 단위 응답(1행 = 1응답자)',
    xlsx: x ? {
      entry: x.entry, sheet: x.sheet, sheetRows: x.rows, sheetCols: x.cols,
      headerRows: x.headerRows,
      headerNote: '1행 = 한글 문항라벨, 2행 = 변수명(uni01_a, wt …), 3행부터 응답',
      columnsKor: x.columnsKor, columnsVar: x.columnsVar,
    } : null,
    crosscheck: x?.weighted ? {
      variable: x.weighted.variable, weight: x.weighted.weight,
      byCode: x.weighted.byCode,
      need: x.weighted.need, neutral: x.weighted.neutral, notNeed: x.weighted.notNeed,
      rawCount: x.rawCount,
      note: '원자료를 표준화 가중치로 다시 집계한 값. 같은 해 기초보고서 표2와 대조해 확인했다.',
    } : null,
    note: `최신 ${latest.year}년분만 확인했다.`,
  }
}

// ── 조립 ────────────────────────────────────────────────────────────────────
console.log(`· 인포그래픽 지표 목록 발견 …`)
const manifest = discoverManifest()
console.log(`  survey ${manifest.survey.length}종 · index ${manifest.index.length}종`)

console.log(`· 인포그래픽 XLSX 수집 …`)
const { series, missing } = harvestSeries(manifest)
console.log(`  series ${series.length}종`)

const sweep = SWEEP ? (console.log('· Uni01~Uni20 일제 조사(HEAD) …'), sweepUni(manifest)) : null

console.log(`· 데이터 아카이브 …`)
const archive = discoverArchive()
console.log(`  연도 ${archive.years.length}개 (${archive.years[0].year}~${archive.years.at(-1).year})`)

console.log(`· 기초보고서 PDF …`)
const { reports, failed: reportFailed } = harvestReports(archive)
console.log(`  ${reports.length}개 연도 추출`)

console.log(`· 로데이터 ZIP …`)
const microdata = harvestMicrodata(archive)

// 대표 시계열: 남한 주민 대상 Uni01(통일 필요성)
const uni01 = series.find((s) => s.group.menu === 1 && s.key === 'Uni01')
if (!uni01) die('남한 주민 Uni01(통일 필요성) 시계열을 얻지 못함 — 헤드라인 산출 불가')
const ROW = { need: '필요하다', neutral: '반반/보통', notNeed: '필요하지 않다' }
const pick = (name) => uni01.rows.find((r) => r.label === name) ||
  die(`Uni01 에서 '${name}' 행을 찾지 못함 (있는 행: ${uni01.rows.map((r) => r.label).join(', ')})`)
const infoRows = { need: pick(ROW.need), neutral: pick(ROW.neutral), notNeed: pick(ROW.notNeed) }
const infoLastYear = uni01.years.at(-1)

// 중복 연도 대조: 인포그래픽 vs 기초보고서 (산출 방식 차이를 수치로 남긴다)
const overlap = reports
  .filter((r) => uni01.years.includes(r.year))
  .map((r) => {
    const i = uni01.years.indexOf(r.year)
    const g = (k) => infoRows[k].values[i]
    return {
      year: r.year,
      infographic: { need: g('need'), neutral: g('neutral'), notNeed: g('notNeed') },
      report: { need: r.need, neutral: r.neutral, notNeed: r.notNeed },
      diffPp: {
        need: +(g('need') - r.need).toFixed(1),
        neutral: +(g('neutral') - r.neutral).toFixed(1),
        notNeed: +(g('notNeed') - r.notNeed).toFixed(1),
      },
    }
  })
const maxDiff = overlap.length
  ? Math.max(...overlap.flatMap((o) => Object.values(o.diffPp).map(Math.abs))) : null

// 연장 시계열: 2022까지는 인포그래픽, 그 뒤는 기초보고서. 연도별 출처를 명시한다.
const extYears = [...uni01.years]
const extSource = Object.fromEntries(uni01.years.map((y) => [y, 'infographic']))
const extRows = { need: [...infoRows.need.values], neutral: [...infoRows.neutral.values], notNeed: [...infoRows.notNeed.values] }
for (const r of reports) {
  if (extYears.includes(r.year)) continue
  extYears.push(r.year); extSource[r.year] = 'basicReport'
  extRows.need.push(r.need); extRows.neutral.push(r.neutral); extRows.notNeed.push(r.notNeed)
}
const order = extYears.map((y, i) => i).sort((a, b) => extYears[a] - extYears[b])
const reorder = (arr) => order.map((i) => arr[i])
const extended = {
  years: reorder(extYears),
  sourceByYear: Object.fromEntries(reorder(extYears).map((y) => [y, extSource[y]])),
  rows: [
    { label: ROW.need, values: reorder(extRows.need) },
    { label: ROW.neutral, values: reorder(extRows.neutral) },
    { label: ROW.notNeed, values: reorder(extRows.notNeed) },
  ],
  note: `${uni01.years[0]}~${infoLastYear} 은 인포그래픽 자료, 그 이후는 연도별 기초보고서다. ` +
    (maxDiff === null ? '겹치는 연도가 없어 두 출처를 대조하지 못했다.'
      : `겹치는 ${overlap.length}개 연도에서 두 출처의 값이 최대 ${maxDiff}%p 다르다.`),
}
uni01.extended = extended
uni01.reportSeries = {
  years: reports.map((r) => r.year),
  asOfByYear: Object.fromEntries(reports.map((r) => [r.year, r.asOf])),
  sampleSizeByYear: Object.fromEntries(reports.map((r) => [r.year, r.sampleSize])),
  rows: [
    { label: ROW.need, values: reports.map((r) => r.need) },
    { label: ROW.neutral, values: reports.map((r) => r.neutral) },
    { label: ROW.notNeed, values: reports.map((r) => r.notNeed) },
  ],
  note: '기초보고서 표2 단일 출처 시계열(가중 집계). 인포그래픽과 섞이지 않아 방식이 일관된다.',
}
uni01.overlapCheck = { years: overlap.map((o) => o.year), maxAbsDiffPp: maxDiff, rows: overlap }

const eNeed = extended.rows[0]
const first = { year: extended.years[0], pct: eNeed.values[0], source: extended.sourceByYear[extended.years[0]] }
const last = { year: extended.years.at(-1), pct: eNeed.values.at(-1), source: extended.sourceByYear[extended.years.at(-1)] }
const infoFirstIdx = 0, infoLastIdx = uni01.years.length - 1

const caveats = []
caveats.push(`인포그래픽 시계열은 ${uni01.years[0]}~${infoLastYear} 에서 끊긴다(실측 — 2023 이후 XLSX 미배포). ${infoLastYear + 1} 이후 값은 기초보고서 PDF 에서 별도 추출했다.`)
if (maxDiff !== null) caveats.push(`같은 연도라도 인포그래픽과 기초보고서 값이 최대 ${maxDiff}%p 다르다(중복 ${overlap.length}개 연도 실측). 두 계열을 한 선으로 이어 붙일 때는 series[].extended.sourceByYear 로 출처 전환 지점을 표시할 것.`)
caveats.push('데이터 아카이브에서 로그인 없이 내려받을 수 있는 연도는 ' +
  `${archive.years[0].year}~${archive.years.at(-1).year} ${archive.years.length}개 연도다(실측). ` +
  '페이지 하단 「데이터 이용문헌」에는 2007년부터의 문헌이 나열되지만 그건 참고문헌 목록이고 다운로드 링크가 아니다.')
caveats.push('menu 2·3 은 「통일의식조사」와 별개 조사(북한이탈주민조사·북한사회변동조사)다. 같은 인포그래픽에 실려 있을 뿐이므로 남한 주민 계열과 직접 비교하지 말 것.')
caveats.push('남북통합지수(2-index-data) 는 연도×계열 표가 아니라 배점표·방법론 시트라서 series[] 로 옮기지 않았다. meta.indexFiles 에 URL 만 기록한다.')
if (reportFailed.length) caveats.push(`기초보고서 추출 실패: ${reportFailed.map((f) => `${f.year}(${f.reason})`).join(', ')}`)

const cc = microdata.crosscheck
if (cc) {
  const rep = reports.find((r) => r.year === microdata.year)
  const ok = rep && Math.abs(cc.need - rep.need) < 0.15 && Math.abs(cc.neutral - rep.neutral) < 0.15 && Math.abs(cc.notNeed - rep.notNeed) < 0.15
  microdata.crosscheck.matchesReport = !!ok
  microdata.crosscheck.reportValues = rep ? { need: rep.need, neutral: rep.neutral, notNeed: rep.notNeed } : null
  if (!ok) caveats.push(`${microdata.year} 로데이터 가중집계(${cc.need}/${cc.neutral}/${cc.notNeed})가 기초보고서 값과 일치하지 않는다 — 확인 필요.`)
}

const out = {
  builtAt: TODAY,
  sources: [
    {
      name: '통일의식조사 인포그래픽 시계열', kind: 'xlsx',
      url: URLS.infographic, org: '서울대학교 통일평화연구원',
      asOf: `${infoLastYear}-12-31`, accessedAt: TODAY,
      note: `지표 ${series.length}종.`,
    },
    {
      name: '통일의식조사 데이터 아카이브(연도별 기초보고서)', kind: 'pdf',
      url: URLS.archive, org: '서울대학교 통일평화연구원',
      asOf: reports.length ? (reports.at(-1).fieldPeriod?.to || `${reports.at(-1).year}-12-31`) : null,
      accessedAt: TODAY,
      note: `${reports.length}개 연도 「표 2. 남북한 통일의 필요성」 전체 행.`,
    },
    {
      name: `${microdata.year ?? '?'} 통일의식조사 원자료`, kind: 'zip',
      url: microdata.url ?? null, landing: microdata.landingUrl ?? null,
      org: '서울대학교 통일평화연구원',
      asOf: reports.find((r) => r.year === microdata.year)?.fieldPeriod?.to ?? null, accessedAt: TODAY,
      note: microdata.note,
    },
  ],
  license: LICENSE,
  licenseFullText: LICENSE_FULL,
  licenseUrl: URLS.archive,
  series,
  microdata,
  headline: {
    needUnification: {
      first, last,
      deltaPp: +(last.pct - first.pct).toFixed(1),
      label: ROW.need,
      unit: '%',
      basis: 'series[].extended (인포그래픽 + 기초보고서 연결)',
      infographicOnly: {
        first: { year: uni01.years[infoFirstIdx], pct: infoRows.need.values[infoFirstIdx] },
        last: { year: uni01.years[infoLastIdx], pct: infoRows.need.values[infoLastIdx] },
        deltaPp: +(infoRows.need.values[infoLastIdx] - infoRows.need.values[infoFirstIdx]).toFixed(1),
        basis: '단일 출처(인포그래픽 XLSX)만으로 계산한 대조값',
      },
      basicReportOnly: reports.length ? {
        first: { year: reports[0].year, pct: reports[0].need },
        last: { year: reports.at(-1).year, pct: reports.at(-1).need },
        deltaPp: +(reports.at(-1).need - reports[0].need).toFixed(1),
        basis: '단일 출처(기초보고서 PDF)만으로 계산한 대조값',
      } : null,
    },
  },
  reports,
  archive: {
    url: URLS.archive,
    years: archive.years.map((y) => ({ year: y.year, files: y.files })),
    landings: archive.landings,
  },
  meta: {
    found: series.length,
    yearRange: {
      infographic: [Math.min(...series.flatMap((s) => s.years)), Math.max(...series.flatMap((s) => s.years))],
      extendedUni01: [extended.years[0], extended.years.at(-1)],
      archiveDownloadable: [archive.years[0].year, archive.years.at(-1).year],
    },
    missing: [...missing, ...reportFailed.map((f) => `${f.year} 기초보고서: ${f.reason}`)],
    caveats,
    sweep,
    indexFiles: manifest.index.map((e) => ({ menu: e.menu, name: e.gName, url: indexUrl(e) })),
    generator: 'scripts/nk-opinion-harvest.mjs (+ scripts/nk-opinion-parse.py)',
  },
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8')
const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
console.log(`✓ ${OUT} (${kb}KB)`)
console.log(`  지표 ${series.length}종 · 인포그래픽 ${out.meta.yearRange.infographic.join('~')} · 연장 ${extended.years[0]}~${extended.years.at(-1)}`)
console.log(`  통일 필요성 ${first.year} ${first.pct}% → ${last.year} ${last.pct}% (${out.headline.needUnification.deltaPp}%p)`)
console.log(`  로데이터 ${microdata.year} 응답자 ${microdata.respondents}명 · 교차검증 ${cc ? (cc.matchesReport ? '일치' : '불일치') : '미실시'}`)
if (out.meta.missing.length) console.log(`  ⚠ 미확보 ${out.meta.missing.length}건: ${out.meta.missing.join(' / ')}`)
