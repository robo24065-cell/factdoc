// nk-isan-harvest.mjs — 이산가족 공식 통계 수집 → 북한자료-api/isan.json
//
// 수집원 4종 (전부 실측 다운로드 — 실패 시 날조하지 않고 비정상 종료):
//   ① 등록현황 월별 CSV  data.go.kr FILE_000000003242041 (CP949, 2017-07~) → monthly[]
//   ② 신청현황 게시판    reunion.unikorea.go.kr reqststat/list.do — 최신 3건 HWP → latest{}
//   ③ 교류현황 게시판    reqststat/list_exc.do — 최신 1건 HWP → exchange{}
//   ④ 남북이산가족 연표  data.go.kr FILE_000000003169500 (CP949, 1954~2021) → chronology[]
//
// HWP 파싱: scripts/nk-isan-hwp.py (python+olefile, BodyText 표 전체 추출 — PrvText는 1023자에서
//   잘려 못 쓴다). 신청현황 HWP는 문서 내 표 7개가 HWPTAG_TABLE 1개로 합쳐져 나오므로
//   (r=0,c=0) 셀 재등장을 경계로 세그먼트를 나눠 내용 라벨로 식별한다.
//
// 실행: node scripts/nk-isan-harvest.mjs [--today=YYYY-MM-DD]   (TODAY env도 인식)
// 재실행 가능. 네트워크는 curl -k(레uni TLS 체인 문제) 사용. 키 불필요.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '북한자료-api', 'isan.json')
const CACHE = path.join(ROOT, '북한자료-api', '_cache', 'isan')
const PY = path.join(ROOT, 'scripts', 'nk-isan-hwp.py')
const TODAY = (process.argv.find((a) => a.startsWith('--today=')) || '').slice(8) ||
  process.env.TODAY || new Date().toISOString().slice(0, 10)

const REUNION = 'https://reunion.unikorea.go.kr'
const URLS = {
  monthlyCsv: 'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003242041&fileDetailSn=1',
  monthlyLanding: 'https://www.data.go.kr/data/15034465/fileData.do', // 통일부_이산가족찾기 등록현황 월별 통계 정보
  chronCsv: 'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003169500&fileDetailSn=1',
  chronLanding: 'https://www.data.go.kr/data/15129679/fileData.do', // 통일부_남북이산가족 연표
  reqList: `${REUNION}/reuni/home/pds/reqststat/list.do?mid=SM00000129`,
  excList: `${REUNION}/reuni/home/pds/reqststat/list_exc.do?mid=SM00000129`,
}

const die = (msg) => { console.error('✗ ' + msg); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 다운로드 (curl: reunion은 TLS 체인 문제로 -k 필요, data.go.kr은 UA 필요) ──
async function curlBuf(url, label) {
  let last
  for (let i = 0; i < 3; i++) {
    try {
      const buf = execFileSync('curl', ['-skL', '--max-time', '180', '-A', 'Mozilla/5.0', url], { maxBuffer: 1 << 26 })
      if (buf.length > 0) return buf
      last = new Error('0바이트 응답')
    } catch (e) { last = e }
    await sleep(1500 * (i + 1))
  }
  die(`다운로드 실패(${label}): ${url} — ${last?.message}`)
}
const decodeCp949 = (buf) => new TextDecoder('euc-kr').decode(buf)
const num = (s) => { const t = String(s ?? '').replace(/,/g, '').trim(); return t === '' ? null : +t }
const pctNum = (s) => { const t = String(s ?? '').replace(/%/g, '').trim(); return t === '' ? null : +t }

// 따옴표 지원 CSV 파서 (연표의 내용 필드에 콤마가 들어있다)
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((c) => c.trim() !== '')) rows.push(row) }
  return rows
}

// ── ① 등록현황 월별 CSV ─────────────────────────────────────────────────────
async function harvestMonthly() {
  const buf = await curlBuf(URLS.monthlyCsv, '등록현황 월별 CSV')
  fs.writeFileSync(path.join(CACHE, 'monthly.csv'), buf)
  const text = decodeCp949(buf)
  if (!text.startsWith('연월')) die('등록현황 CSV 헤더가 "연월"으로 시작하지 않음 — 포맷 변경 의심')
  const rows = parseCsv(text.trim())
  const H = rows[0].map((h) => h.trim())
  const col = (name) => { const i = H.indexOf(name); if (i < 0) die(`등록현황 CSV 열 없음: ${name}`); return i }
  const C = {
    month: col('연월'), avgAge: col('생존자(생존 신청자) 나이 평균'),
    o황해: col('생존자 출신지별 통계 - 황해'), o평남: col('생존자 출신지별 통계 - 평남'),
    o평북: col('생존자 출신지별 통계 - 평북'), o함남: col('생존자 출신지별 통계 - 함남'),
    o함북: col('생존자 출신지별 통계 - 함북'), o미수복경기: col('생존자 출신지별 통계 - 미수복경기'),
    o미수복강원: col('생존자 출신지별 통계 - 미수복강원'),
    r부모: col('생존자 부모(찾는사람)'), r형제자매: col('생존자 형제자매(찾는사람)'), r3촌이상: col('생존자 3촌이상(찾는사람)'),
    male: col('생존자 남자'), female: col('생존자 여자'), total: col('생존자 총인원(남녀합계)'),
    d부모: col('사망자 부모(찾는사람)'), d형제자매: col('사망자형제자매(찾는사람)'), d3촌이상: col('사망자3촌이상(찾는사람)'),
    d남자: col('사망자남자'), d여자: col('사망자여자'),
  }
  const monthly = rows.slice(1).map((r) => {
    const dec = [C.d부모, C.d형제자매, C.d3촌이상, C.d남자, C.d여자].map((i) => num(r[i]))
    return {
      month: r[C.month].trim(), avgAge: num(r[C.avgAge]),
      origin: { 황해: num(r[C.o황해]), 평남: num(r[C.o평남]), 평북: num(r[C.o평북]), 함남: num(r[C.o함남]), 함북: num(r[C.o함북]), 미수복경기: num(r[C.o미수복경기]), 미수복강원: num(r[C.o미수복강원]) },
      relation: { 부모: num(r[C.r부모]), 형제자매: num(r[C.r형제자매]), '3촌이상': num(r[C.r3촌이상]) },
      male: num(r[C.male]), female: num(r[C.female]), total: num(r[C.total]),
      deceased: dec.every((v) => v == null) ? null : { 부모: dec[0], 형제자매: dec[1], '3촌이상': dec[2], 남자: dec[3], 여자: dec[4] },
    }
  })
  if (!monthly.length) die('등록현황 CSV 데이터 행 0')
  return monthly
}

// ── 게시판 목록 파싱 (신청/교류 공용) ───────────────────────────────────────
async function fetchBoard(url, label) {
  const html = (await curlBuf(url, label)).toString('utf8')
  if (!html.includes('webView_cel')) die(`${label} 목록 HTML에 표가 없음 — 구조 변경 의심`)
  const posts = []
  for (const tr of html.split(/<tr>/).slice(1)) {
    const m = /<td class="[^"]*webView_cel">(\d+)<\/td>\s*<td class="ta_l[^"]*"><a\s+href="(view[^"]+)"[^>]*>([^<]+)<\/a>/.exec(tr)
    if (!m) continue
    const atch = /atchfile\/down\/([A-Za-z0-9.]+)/.exec(tr)
    const date = /(\d{4}-\d{2}-\d{2})/.exec(tr)
    posts.push({
      no: +m[1], id: +(/[?&]id=(\d+)/.exec(m[2].replace(/&amp;/g, '&'))?.[1] ?? 0),
      title: m[3].trim(), postedAt: date?.[1] ?? null,
      attachment: atch ? `${REUNION}/reuni/atchfile/down/${atch[1]}` : null,
    })
  }
  if (!posts.length) die(`${label} 게시글 행을 못 찾음`)
  return { totalPosts: posts[0].no, posts } // 목록은 내림차순 — 첫 행 번호 = 총 게시글 수
}

async function fetchHwp(post, label) {
  if (!post.attachment) die(`${label} "${post.title}" 첨부 HWP 없음`)
  const buf = await curlBuf(post.attachment, `${label} HWP`)
  if (buf.readUInt32BE(0) !== 0xd0cf11e0) die(`${label} "${post.title}" 첨부가 OLE(HWP v5)가 아님`)
  const file = path.join(CACHE, path.basename(post.attachment))
  fs.writeFileSync(file, buf)
  const out = execFileSync('python', [PY, file], { maxBuffer: 1 << 26 })
  return JSON.parse(out.toString('utf8'))
}

// 공표문 기준일: "(’26. 5. 31.)" → 2026-05-31
function parseAsOf(paras, label) {
  for (const p of paras.slice(0, 4)) {
    const m = /[’'`]\s*(\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/.exec(p)
    if (m) return `20${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`
  }
  die(`${label} 기준일 문구를 못 찾음 (paras: ${paras.slice(0, 3).join(' / ')})`)
}

// ── ② 신청현황 HWP — 표 7개가 한 덩어리로 나오므로 (0,0) 재등장 기준 분할 ──
function segmentCells(cells) {
  const segs = []
  for (const cell of cells) {
    if (cell.r === 0 && cell.c === 0) segs.push([])
    if (!segs.length) die('신청현황 표 첫 셀이 (0,0)이 아님')
    segs[segs.length - 1].push(cell)
  }
  return segs
}
const segRows = (seg) => {
  const byR = new Map()
  for (const c of seg) { if (!byR.has(c.r)) byR.set(c.r, []); byR.get(c.r).push(c) }
  return [...byR.keys()].sort((a, b) => a - b).map((r) => byR.get(r).sort((a, b) => a.c - b.c).map((c) => c.text.replace(/\s+/g, ' ').trim()))
}
const has = (seg, label) => seg.some((c) => c.text.replace(/\s+/g, ' ').includes(label))

// '구 분'/인원수/비율 3행 구조(거주지별은 3행×2단) → [{label,n,pct}] + 계
function parseBreakdown(seg, name) {
  const rows = segRows(seg)
  const entries = []
  let total = null, totalPct = null, labels = null
  for (const row of rows) {
    const head = row[0]
    if (/구\s*분/.test(head)) labels = row.slice(1)
    else if (/인원수/.test(head)) {
      if (!labels) die(`${name}: 인원수 행이 구분 행보다 먼저 나옴`)
      row.slice(1).forEach((v, i) => {
        const label = labels[i]
        if (!label) return
        if (label === '계') total = num(v)
        else entries.push({ label, n: num(v), pct: null })
      })
    } else if (/비율/.test(head)) {
      let k = entries.length - labels.filter((l) => l && l !== '계').length
      row.slice(1).forEach((v, i) => {
        const label = labels[i]
        if (!label) return
        if (label === '계') totalPct = pctNum(v)
        else entries[k++].pct = pctNum(v)
      })
    }
  }
  if (!entries.length || total == null) die(`${name}: 표 해석 실패`)
  return { entries, total, totalPct }
}

function parseOverview(seg) {
  const rows = segRows(seg)
  const header = rows.find((r) => r.includes('신청자'))
  if (!header) die('개요 표에 신청자 열이 없음')
  const idx = { applicants: header.indexOf('신청자'), alive: header.indexOf('생존자'), deceased: header.indexOf('사망자') }
  const pick = (row) => ({ applicants: num(row[idx.applicants]), alive: num(row[idx.alive]), deceased: num(row[idx.deceased]) })
  const signed = (s) => { const m = /([\d,]+)\s*(증가|감소)/.exec(s); return m ? (m[2] === '감소' ? -1 : 1) * num(m[1]) : null }
  const out = {}
  for (const row of rows) {
    if (/현재/.test(row[0])) out.cumulative = pick(row)
    else if (/전월$/.test(row[0].trim()) || /~\s*전월/.test(row[0])) out.prevMonth = pick(row)
    else if (/전월\s*대비/.test(row[0])) out.momChange = { applicants: signed(row[idx.applicants]), alive: signed(row[idx.alive]), deceased: signed(row[idx.deceased]) }
  }
  if (!out.cumulative) die('개요 표에서 누계 행을 못 찾음')
  return out
}

function parseRequestHwp(doc, label) {
  if (doc.tables.length !== 1) die(`${label}: 신청현황 표 묶음이 1개가 아님(${doc.tables.length})`)
  const segs = segmentCells(doc.tables[0])
  const overviewSeg = segs.find((s) => has(s, '신청자'))
  if (!overviewSeg) die(`${label}: 개요 세그먼트 없음`)
  const overview = parseOverview(overviewSeg)
  const ageSegs = segs.filter((s) => has(s, '90세이상'))
  if (ageSegs.length !== 2) die(`${label}: 연령별 표가 ${ageSegs.length}개 (생존자+사망자 2개여야 함)`)
  const ages = ageSegs.map((s) => parseBreakdown(s, `${label} 연령별`))
  const aliveAge = ages.find((a) => a.total === overview.cumulative.alive)
  const deadAge = ages.find((a) => a.total === overview.cumulative.deceased)
  if (!aliveAge || !deadAge) die(`${label}: 연령별 계(${ages.map((a) => a.total)})가 개요 생존/사망(${overview.cumulative.alive}/${overview.cumulative.deceased})과 불일치`)
  const seg = (kw, name) => { const s = segs.find((x) => has(x, kw) && !has(x, '90세이상')); if (!s) die(`${label}: ${name} 세그먼트 없음`); return parseBreakdown(s, `${label} ${name}`) }
  return {
    asOf: parseAsOf(doc.paras, label),
    overview,
    survivors: {
      total: overview.cumulative.alive,
      byAge: aliveAge, byRelation: seg('부부/부모/자녀', '가족관계별'), byOrigin: seg('황해', '출신지역별'),
      byGender: seg('남자', '성별'), byResidence: seg('서울', '거주지별'),
    },
    deceased: { total: overview.cumulative.deceased, byAge: deadAge },
  }
}

// ── ③ 교류현황 HWP — 병합셀 있는 단일 표 → 스팬 전개 그리드 ────────────────
function parseExchangeHwp(doc, label) {
  const cells = doc.tables.find((t) => t.some((c) => c.text.includes('당국차원')))
  if (!cells) die(`${label}: 당국차원 표를 못 찾음`)
  const grid = []
  for (const c of cells) for (let dr = 0; dr < c.rs; dr++) for (let dc = 0; dc < c.cs; dc++) { (grid[c.r + dr] ??= [])[c.c + dc] ??= c.text.replace(/\s+/g, ' ').trim() }
  const expectHeader = { 1: '생사확인', 3: '서신교환', 5: '방남상봉', 7: '방북상봉', 9: '화상상봉', 11: '생사확인', 12: '서신교환', 13: '기타', 14: '상봉' }
  for (const [c, want] of Object.entries(expectHeader)) if (grid[1][+c] !== want) die(`${label}: 헤더 열 ${c}가 "${grid[1][+c]}" (기대 "${want}") — 표 구조 변경 의심`)
  const rowOf = (r) => ({
    gov: {
      lifeCheck: { cases: num(grid[r][1]) ?? 0, persons: num(grid[r][2]) ?? 0 },
      letters: { cases: num(grid[r][3]) ?? 0, persons: num(grid[r][4]) ?? 0 },
      visitSouth: { cases: num(grid[r][5]) ?? 0, persons: num(grid[r][6]) ?? 0 },
      visitNorth: { cases: num(grid[r][7]) ?? 0, persons: num(grid[r][8]) ?? 0 },
      video: { cases: num(grid[r][9]) ?? 0, persons: num(grid[r][10]) ?? 0 },
    },
    private: {
      lifeCheckCases: num(grid[r][11]) ?? 0, letterCases: num(grid[r][12]) ?? 0, otherCases: num(grid[r][13]) ?? 0,
      reunion: { cases: num(grid[r][14]) ?? 0, persons: num(grid[r][15]) ?? 0 },
    },
  })
  const byYear = []; let totals = null
  for (let r = 3; r < grid.length; r++) {
    const lab = grid[r]?.[0] ?? ''
    if (/합\s*계/.test(lab)) { totals = rowOf(r); continue }
    const m = /^(\d{4})년(?:\s*(\d{1,2})월)?$/.exec(lab)
    if (!m) die(`${label}: 행 라벨 해석 불가 "${lab}"`)
    byYear.push({ year: +m[1], label: lab, ...(m[2] ? { throughMonth: +m[2] } : {}), ...rowOf(r) })
  }
  if (!totals || !byYear.length) die(`${label}: 연도 행/합계 행 누락`)
  return {
    asOf: parseAsOf(doc.paras, label),
    footnote: doc.paras.find((p) => p.includes('기타')) ?? null, // "* 기타 : 성묘방북"
    unitNote: '건=성사 건수, 명=인원. 원문 공란은 해당 연도 실적 없음(0 처리). 당국차원 5유형은 건/명, 민간차원 생사확인·서신교환·기타는 건만 공표.',
    byYear, totals,
  }
}

// ── ④ 연표 CSV ──────────────────────────────────────────────────────────────
async function harvestChronology() {
  const buf = await curlBuf(URLS.chronCsv, '연표 CSV')
  fs.writeFileSync(path.join(CACHE, 'chronology.csv'), buf)
  const text = decodeCp949(buf)
  if (!text.startsWith('년대')) die('연표 CSV 헤더가 "년대"로 시작하지 않음 — 포맷 변경 의심')
  const rows = parseCsv(text.trim())
  const H = rows[0].map((s) => s.trim())
  if (H[0] !== '년대' || H[1] !== '날짜' || H[2] !== '내용') die(`연표 CSV 헤더 상이: ${H.join(',')}`)
  return rows.slice(1).map((r) => ({ era: r[0].trim(), date: r[1].trim(), event: r[2].trim() }))
}

// ── 실행 ────────────────────────────────────────────────────────────────────
fs.mkdirSync(CACHE, { recursive: true })

console.log('① 등록현황 월별 CSV …')
const monthly = await harvestMonthly()
console.log(`   ${monthly.length}행 (${monthly[0].month} ~ ${monthly.at(-1).month})`)

console.log('② 신청현황 게시판 …')
const reqBoard = await fetchBoard(URLS.reqList, '신청현황')
const reqPosts = []
for (const post of reqBoard.posts.slice(0, 3)) {
  const doc = await fetchHwp(post, '신청현황')
  const parsed = parseRequestHwp(doc, post.title)
  reqPosts.push({ postId: post.id, title: post.title, postedAt: post.postedAt, attachment: post.attachment, ...parsed })
  console.log(`   ${post.title} → 기준 ${parsed.asOf} 누계 ${parsed.overview.cumulative.applicants.toLocaleString()} 생존 ${parsed.overview.cumulative.alive.toLocaleString()}`)
}
const cur = reqPosts[0]

console.log('③ 교류현황 게시판 …')
const excBoard = await fetchBoard(URLS.excList, '교류현황')
const excPost = excBoard.posts[0]
const exchange = {
  postId: excPost.id, title: excPost.title, postedAt: excPost.postedAt, attachment: excPost.attachment,
  boardUrl: URLS.excList, boardTotalPosts: excBoard.totalPosts,
  ...parseExchangeHwp(await fetchHwp(excPost, '교류현황'), excPost.title),
}
console.log(`   ${excPost.title} → 기준 ${exchange.asOf}, 연도행 ${exchange.byYear.length}, 당국 생사확인 누계 ${exchange.totals.gov.lifeCheck.cases.toLocaleString()}건/${exchange.totals.gov.lifeCheck.persons.toLocaleString()}명`)

console.log('④ 연표 CSV …')
const chronology = await harvestChronology()
console.log(`   ${chronology.length}건 (${chronology[0].date} ~ ${chronology.at(-1).date})`)

// ── 검증 (전 항목 실측 대조 — 불일치는 기록하되, 구조 오류는 중단) ───────────
const sum = (arr) => arr.reduce((a, b) => a + b, 0)
const V = {}

// (a) 월별 CSV: 성별합=총원, 가족관계합=총원 (전 행). 원문 자체 오차는 보존·기록하고,
//     불일치가 광범위하면(>5%) 파싱 버그로 보고 중단한다.
V.monthlyRows = { count: monthly.length, span: [monthly[0].month, monthly.at(-1).month], deceasedNullMonths: monthly.filter((m) => !m.deceased).map((m) => m.month) }
const genderBad = monthly.filter((m) => m.male + m.female !== m.total)
const relationBad = monthly.filter((m) => sum(Object.values(m.relation)) !== m.total)
if (genderBad.length + relationBad.length > monthly.length * 0.05) die(`월별 CSV 합계 불일치가 광범위(성별 ${genderBad.length}·가족관계 ${relationBad.length}행) — 파싱 버그 의심`)
V.monthlyGenderSumOk = genderBad.length === 0
V.monthlyRelationSumOk = relationBad.length === 0
V.monthlySumAnomalies = [...genderBad, ...relationBad].map((m) => ({
  month: m.month, maleFemaleSum: m.male + m.female, relationSum: sum(Object.values(m.relation)), publishedTotal: m.total,
  note: '원문 수치 그대로 보존(가공하지 않음)',
}))
// 출신지 7종은 북한 출신만 집계(남한 출생 등 미포함)라 총원보다 작다 — 실측 기록만.
V.monthlyOriginShare = { note: '출신지 7종 합 < 총원 (남한 출생 등 미포함)', lastRow: { originSum: sum(Object.values(monthly.at(-1).origin)), total: monthly.at(-1).total } }
// 사망자 5열은 가족관계 3열합 vs 남녀 2열합이 이론상 같아야 하나 원문 자체가 미세 불일치 — 그대로 기록
const lastD = monthly.at(-1).deceased
V.monthlyDeceasedAnomaly = lastD ? {
  note: '사망자 가족관계합과 남녀합이 원문에서 불일치하면 그대로 보존(가공하지 않음)',
  lastRow: { relSum: lastD.부모 + lastD.형제자매 + lastD['3촌이상'], genderSum: lastD.남자 + lastD.여자 },
} : null

// (b) 신청현황 HWP: 각 분류합 = 생존자 총계
const bd = cur.survivors
const check = (name, b, expected) => {
  const s = sum(b.entries.map((e) => e.n))
  const ok = s === expected && b.total === expected
  if (!ok) die(`신청현황 ${name}: 합 ${s} / 계 ${b.total} ≠ ${expected}`)
  return { sum: s, expected, ok }
}
V.latestBreakdownSums = {
  byAge: check('연령별', bd.byAge, bd.total),
  byRelation: check('가족관계별', bd.byRelation, bd.total),
  byOrigin: check('출신지역별', bd.byOrigin, bd.total),
  byGender: check('성별', bd.byGender, bd.total),
  byResidence: check('거주지별', bd.byResidence, bd.total),
  deceasedByAge: check('사망자 연령별', cur.deceased.byAge, cur.deceased.total),
}
V.overviewIdentityOk = cur.overview.cumulative.alive + cur.overview.cumulative.deceased === cur.overview.cumulative.applicants
if (!V.overviewIdentityOk) die('개요: 생존+사망 ≠ 신청 누계')
// 전월 대비 정합: 이번달 누계 - 전월 누계 = 공표된 증감
const mm = cur.overview.momChange, cu = cur.overview.cumulative, pv = cur.overview.prevMonth
V.momChangeOk = pv && mm && cu.applicants - pv.applicants === mm.applicants && cu.alive - pv.alive === mm.alive && cu.deceased - pv.deceased === mm.deceased
// 최신 3건 시계열 연속성: (n-1)월 누계 == n월 공표의 '전월' 행
V.postChainOk = reqPosts.length === 3 &&
  reqPosts[0].overview.prevMonth.alive === reqPosts[1].overview.cumulative.alive &&
  reqPosts[1].overview.prevMonth.alive === reqPosts[2].overview.cumulative.alive

// (c) 월별 CSV 마지막 행 vs HWP 최신 — 기준월이 다르면 그 사실을 명시
const lastCsv = monthly.at(-1)
V.csvVsHwp = {
  csv: { asOf: lastCsv.month, survivors: lastCsv.total },
  hwp: { asOf: cur.asOf, survivors: cur.survivors.total },
  sameMonth: lastCsv.month.slice(0, 7) === cur.asOf.slice(0, 7),
  note: lastCsv.month.slice(0, 7) === cur.asOf.slice(0, 7)
    ? '동일 기준월 — 값 직접 대조 가능'
    : `기준월 상이(CSV ${lastCsv.month.slice(0, 7)} vs HWP ${cur.asOf.slice(0, 7)}) — 직접 대조 불가. data.go.kr 파일데이터가 게시판 공표보다 늦게 갱신됨. 생존자는 단조감소하므로 HWP(더 최신) 값이 더 작아야 정상 → ${cur.survivors.total < lastCsv.total ? '정상' : '비정상'}`,
}

// (d) 교류현황: 연도 열합 = 합계 행
const flat = (o) => [o.gov.lifeCheck.cases, o.gov.lifeCheck.persons, o.gov.letters.cases, o.gov.letters.persons, o.gov.visitSouth.cases, o.gov.visitSouth.persons, o.gov.visitNorth.cases, o.gov.visitNorth.persons, o.gov.video.cases, o.gov.video.persons, o.private.lifeCheckCases, o.private.letterCases, o.private.otherCases, o.private.reunion.cases, o.private.reunion.persons]
const colSums = exchange.byYear.map(flat).reduce((a, r) => a.map((v, i) => v + r[i]), Array(15).fill(0))
const totFlat = flat(exchange.totals)
V.exchangeTotalsOk = colSums.every((v, i) => v === totFlat[i])
V.exchangeTotals = { computed: colSums, published: totFlat }
if (!V.exchangeTotalsOk) console.warn('⚠ 교류현황 열합 ≠ 합계 행 — 원문 그대로 보존, computed/published 확인')

// (e) 연표
V.chronologyRows = { count: chronology.length, span: [chronology[0].date, chronology.at(-1).date] }
const badDates = chronology.filter((c) => !/^\d{4}(-\d{2}(-\d{2})?)?/.test(c.date))
V.chronologyDateFormatOk = badDates.length === 0
if (badDates.length) V.chronologyBadDates = badDates.slice(0, 5)

// ── 산출 ────────────────────────────────────────────────────────────────────
const out = {
  builtAt: TODAY,
  sources: [
    {
      name: '통일부_이산가족찾기 등록현황 월별 통계 정보', kind: 'csv(CP949)',
      landing: URLS.monthlyLanding, download: URLS.monthlyCsv,
      org: '공공데이터포털(data.go.kr) — 통일부 파일데이터', asOf: lastCsv.month, accessedAt: TODAY,
      note: '월말 기준 누적 스냅샷. 2017-07·08 행은 사망자 5열 공란.',
    },
    {
      name: '이산가족 신청 현황(월별 공표 HWP) — 최신 3건', kind: 'hwp',
      landing: URLS.reqList, org: '통일부 이산가족정보통합시스템(국가통계 승인번호 제103003호)',
      asOf: cur.asOf, accessedAt: TODAY,
      note: 'HWP BodyText 표를 python olefile로 직접 파싱(PrvText는 1023자 절단이라 미사용).',
    },
    {
      name: '이산가족 교류 현황(월별 공표 HWP) — 최신 1건', kind: 'hwp',
      landing: URLS.excList, org: '통일부 이산가족정보통합시스템',
      asOf: exchange.asOf, accessedAt: TODAY,
    },
    {
      name: '통일부_남북이산가족 관련 연표', kind: 'csv(CP949)',
      landing: URLS.chronLanding, download: URLS.chronCsv,
      org: '공공데이터포털(data.go.kr) — 통일부 파일데이터',
      asOf: chronology.at(-1).date, accessedAt: TODAY,
      note: `1954~2021 주요사건 ${chronology.length}건. 이후 연도는 원자료 미갱신.`,
    },
  ],
  boards: {
    request: { url: URLS.reqList, totalPosts: reqBoard.totalPosts },
    exchange: { url: URLS.excList, totalPosts: excBoard.totalPosts },
  },
  monthly,
  latest: { ...cur, boardUrl: URLS.reqList, boardTotalPosts: reqBoard.totalPosts, previousMonths: reqPosts.slice(1) },
  exchange,
  chronology,
  validation: V,
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8')
const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
console.log(`✓ ${OUT} (${kb}KB)`)
console.log(`  monthly ${monthly.length}행 · latest 기준 ${cur.asOf}(신청 ${cur.overview.cumulative.applicants.toLocaleString()}·생존 ${cur.survivors.total.toLocaleString()}·사망 ${cur.deceased.total.toLocaleString()}) · exchange 연도행 ${exchange.byYear.length} · chronology ${chronology.length}건`)
console.log(`  검증: 성별합 ${V.monthlyGenderSumOk} · 분류합 6종 OK · 개요항등식 ${V.overviewIdentityOk} · 전월대비 ${V.momChangeOk} · 3건 연쇄 ${V.postChainOk} · 교류합계 ${V.exchangeTotalsOk}`)
