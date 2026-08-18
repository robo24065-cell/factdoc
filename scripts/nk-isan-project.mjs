// 이산가족 1세대 '소멸 시계' — 통계청 완전생명표(qx) 기반 생존자 코호트 추계
//   → 북한자료-api/isan-projection.json
//
// 방법(정직하게, 단순하게):
//   ① 통일부 「이산가족 신청 현황(’26.5.31.)」 생존자 5구간 연령분포를 단일 연령으로 편다
//      - 80-89/70-79/60-69: 구간 내 균등. 59세이하는 50~59세 균등으로 가정.
//      - 90세이상: 완전생명표 정지인구(Lx, 90~99세) 비례 배분 = 지수감소 근사. 100세+ 초기인원 0.
//   ② 남녀 비율(남 20,269 / 여 13,003)을 모든 구간에 동일 적용
//   ③ KOSIS 완전생명표(1세별, DT_1B42) 최신 연도의 성·연령별 사망확률 qx를 매년 적용
//   ④ ★ 연나이→만나이 보정: 통일부 공표 연령은 '연나이'(1/1 일괄 +1)임을 월별 CSV의
//      1월 톱니(avgAge가 매년 1월 +0.87~+0.96, 그 외 달 -0.04~-0.05)로 실측 확인했다.
//      생명표 qx는 만나이 기준이므로 공표 연나이 a인 사람의 만나이는 [a-1, a] 균등 → 기대 만나이 a-0.5.
//      qx를 로그선형 보간해 만나이 (a-0.5)에서 평가한다(= √(qx(a-1)·qx(a)), 지수사망률 가정에서 정확).
//   ⑤ ★ 실측 교정(calibration): 등록 생존자 집단의 '기록된' 사망률은 전국 생명표보다 낮다.
//      k = 실측 사망자 수 ÷ 모델 기대 사망자 수 를 실측 창에서 계산해 보정 시나리오를 함께 산출한다.
//      k는 지어낸 값이 아니라 공표 사망자 누계 증분에서 나온 실측값이다.
//
// 실행: node scripts/nk-isan-project.mjs [--today=YYYY-MM-DD]   (TODAY env도 인식)
// 필요: api.txt의 KOSIS_KEY — 키 값은 절대 출력하지 않는다.
// 다운로드/입력 검증 실패 시 기존 산출물을 덮어쓰지 않고 비정상 종료한다(수치 날조 금지).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from './nk-env.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '북한자료-api', 'isan-projection.json')
const ISAN = path.join(ROOT, '북한자료-api', 'isan.json') // data agent 산출물(있으면 우선 사용)
const CSV = path.join(ROOT, '..', '북한자료', '자료집', '통일부_이산가족찾기 등록현황 월별 통계 정보_20250831.csv')
const TODAY = (process.argv.find((a) => a.startsWith('--today=')) || '').slice(8) ||
  process.env.TODAY || new Date().toISOString().slice(0, 10)

const die = (m) => { console.error('✗ ' + m); process.exit(1) }
loadEnv(path.join(ROOT, 'api.txt'))
const KEY = process.env.KOSIS_KEY
if (!KEY) die('KOSIS_KEY 미설정 (api.txt) — 중단')
const safe = (s) => String(s).replaceAll(KEY, '***') // 로그에 키 유출 방지

// ── 입력: 이산가족 생존자 현황 (2026-05-31 기준) ─────────────────────────────
// 출처: 통일부 이산가족정보통합시스템 「이산가족 신청 현황(’26.5.31.)」(홈페이지 공표,
//       통계청 승인 국가통계 제103003호). 로컬 사본: 북한자료/2026년 5월 이산가족 신청 현황(홈페이지).pdf
// isan.json이 있으면 아래 하드코딩 값과 실측 대조한다(불일치 시 중단).
const BASE = {
  asOf: '2026-05-31',
  total: 33272, male: 20269, female: 13003,
  bins: [ // [연나이 시작, 끝, 인원, 배분방식]
    [90, 99, 11431, 'Lx'],      // '90세이상'
    [80, 89, 11057, 'uniform'],
    [70, 79, 5661, 'uniform'],
    [60, 69, 3307, 'uniform'],
    [50, 59, 1816, 'uniform'],  // '59세이하' → 50~59세 가정
  ],
}
const MALE_SHARE = BASE.male / BASE.total // 0.6092 — 모든 구간 동일 적용
const BASE_YEAR = 2026 // asOf 2026-05-31. 1스텝 = 5/31 → 익년 5/31
const AGE_OFFSET = -0.5 // 연나이 → 기대 만나이 (실측 근거: 1월 톱니)
const QX_CAP = 0.95, MAX_AGE = 130, END_YEAR = 2080 // 마일스톤 탐색용 연장(출력은 2050까지)

// ── ① KOSIS 완전생명표(1세별) 최신 연도 수집 ────────────────────────────────
async function fetchLifeTable() {
  const url = 'https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList' +
    `&apiKey=${KEY}&itmId=T15+T25+T13+T23&objL1=ALL&format=json&jsonVD=Y&prdSe=Y&newEstPrdCnt=1` +
    '&orgId=101&tblId=DT_1B42' // T15/T25=사망확률(남/여), T13/T23=정지인구(남/여)
  let lastErr
  for (let i = 0; i < 3; i++) {
    try {
      const txt = await (await fetch(url)).text()
      const j = JSON.parse(txt)
      if (!Array.isArray(j) || !j.length || j[0].err) throw new Error('KOSIS 비정상 응답: ' + safe(txt.slice(0, 150)))
      return j
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))) }
  }
  die('KOSIS 완전생명표 다운로드 실패 — ' + safe(lastErr?.message ?? ''))
}

const rows = await fetchLifeTable()
const year = rows[0].PRD_DE
let published = ''
const qx = { m: {}, f: {} }, Lx = { m: {}, f: {} }
for (const r of rows) {
  const m = /^(\d+)세(이상)?$/.exec(r.C1_NM) // C1 코드는 비선형 → 이름으로 파싱
  if (!m) continue
  const a = +m[1], v = parseFloat(r.DT)
  if (!Number.isFinite(v)) continue
  if (r.ITM_ID === 'T15') qx.m[a] = v
  else if (r.ITM_ID === 'T25') qx.f[a] = v
  else if (r.ITM_ID === 'T13') Lx.m[a] = v
  else if (r.ITM_ID === 'T23') Lx.f[a] = v
  if (r.LST_CHN_DE > published) published = r.LST_CHN_DE
}
// 완전성 검증 — 부족하면 날조하지 않고 중단
if (+year < 2023) die(`생명표 최신 연도가 ${year} (2023 미만) — 중단`)
for (const s of ['m', 'f']) {
  for (let a = 45; a <= 99; a++) if (!(qx[s][a] > 0 && qx[s][a] < 1)) die(`qx ${s} ${a}세 결측 — 중단`)
  for (let a = 90; a <= 99; a++) if (!(Lx[s][a] > 0)) die(`Lx ${s} ${a}세 결측 — 중단`)
}
console.log(`✓ KOSIS 완전생명표(DT_1B42) ${year}년 수신 — ${rows.length}행, 최종수정 ${published}`)

// 100세+ qx 외삽: qx(a) = min(0.95, qx99·g^(a-99)), g = (qx99/qx90)^(1/9)
const g = { m: (qx.m[99] / qx.m[90]) ** (1 / 9), f: (qx.f[99] / qx.f[90]) ** (1 / 9) }
const qInt = (s, a) => (a <= 99 ? qx[s][a] : Math.min(QX_CAP, qx[s][99] * g[s] ** (a - 99)))
// 만나이 실수 x에서의 qx — 로그선형 보간(사망률 지수증가 가정에서 정확)
const qReal = (s, x) => {
  const i = Math.floor(x), f = x - i
  return Math.min(QX_CAP, f === 0 ? qInt(s, i) : qInt(s, i) ** (1 - f) * qInt(s, i + 1) ** f)
}
// 공표 연나이 a → 1년 사망확률 (offset 만큼 만나이 보정, k배 교정)
const qOf = (s, a, offset, k) => Math.min(QX_CAP, k * qReal(s, a + offset))
// qx 로그기울기 β (연령 1세당) — 보정 효과 해석용
const beta = { m: Math.log(qInt('m', 95) / qInt('m', 80)) / 15, f: Math.log(qInt('f', 95) / qInt('f', 80)) / 15 }

// ── ② 월별 실측 시계열 로드 (isan.json 우선 → 원본 CSV 폴백) ────────────────
function loadMonthlyFromIsan() {
  if (!fs.existsSync(ISAN)) return null
  const j = JSON.parse(fs.readFileSync(ISAN, 'utf8'))
  if (!Array.isArray(j.monthly) || !j.monthly.length) return null
  const monthly = j.monthly.map((r) => ({
    date: r.month, surv: r.total, avgAge: r.avgAge,
    dead: r.deceased ? r.deceased.남자 + r.deceased.여자 : null,
  })).filter((r) => r.date && Number.isFinite(r.surv))
  return { monthly, src: 'isan.json', isan: j }
}
function loadMonthlyFromCsv() {
  if (!fs.existsSync(CSV)) die('월별 실측 소스 없음 (isan.json·원본 CSV 둘 다 부재): ' + CSV)
  const csvRows = new TextDecoder('euc-kr').decode(fs.readFileSync(CSV)).trim().split(/\r?\n/).map((l) => l.split(','))
  const H = csvRows[0]
  const col = (n) => { const i = H.findIndex((h) => h.trim() === n); if (i < 0) die(`CSV 열 없음: ${n}`); return i }
  const iD = col('연월'), iS = col('생존자 총인원(남녀합계)'), iA = col('생존자(생존 신청자) 나이 평균')
  const iDM = col('사망자남자'), iDF = col('사망자여자')
  const monthly = csvRows.slice(1).map((r) => ({
    date: r[iD], surv: +r[iS], avgAge: +r[iA],
    dead: r[iDM] && r[iDF] ? +r[iDM] + +r[iDF] : null,
  })).filter((r) => r.date && Number.isFinite(r.surv))
  return { monthly, src: 'csv', isan: null }
}
const M = loadMonthlyFromIsan() ?? loadMonthlyFromCsv()
const monthly = M.monthly
if (monthly.length < 24) die(`월별 실측 행이 ${monthly.length}개 — 검증 불가, 중단`)
const first = monthly[0], last = monthly[monthly.length - 1]
const months = (d0, d1) => (+d1.slice(0, 4) - +d0.slice(0, 4)) * 12 + (+d1.slice(5, 7) - +d0.slice(5, 7))
const at = (d) => monthly.find((r) => r.date === d)
console.log(`✓ 월별 실측 ${monthly.length}행 (${first.date} ~ ${last.date}) — 출처 ${M.src}`)

// isan.json이 있으면 하드코딩 입력을 실측 대조 (불일치 = 중단)
let inputCrossCheck = { checked: false, note: 'isan.json 부재 — 하드코딩 값(공표 PDF 대조 확인)을 그대로 사용' }
if (M.isan?.latest?.survivors) {
  const s = M.isan.latest.survivors
  const byLabel = Object.fromEntries(s.byAge.entries.map((e) => [e.label, e.n]))
  const want = { '90세이상': 11431, '89-80세': 11057, '79-70세': 5661, '69-60세': 3307, '59세이하': 1816 }
  const bad = Object.entries(want).filter(([k, v]) => byLabel[k] !== v)
  const male = s.byGender.entries.find((e) => e.label === '남자')?.n
  if (M.isan.latest.asOf !== BASE.asOf) die(`isan.json 최신 기준일 ${M.isan.latest.asOf} ≠ 하드코딩 ${BASE.asOf} — 입력 갱신 필요, 중단`)
  if (bad.length || s.total !== BASE.total || male !== BASE.male) {
    die(`isan.json 실측과 하드코딩 입력 불일치: ${JSON.stringify({ bins: bad, total: s.total, male })} — 중단`)
  }
  inputCrossCheck = { checked: true, source: 'isan.json (통일부 공표 HWP 파싱)', asOf: M.isan.latest.asOf, result: '5구간·총계·성별 전부 일치' }
}

// ── ③ 코호트 구성 ───────────────────────────────────────────────────────────
function buildCohort(bins, total, maleShare, mode90) {
  const c = { m: new Float64Array(MAX_AGE + 1), f: new Float64Array(MAX_AGE + 1) }
  for (const [a0, a1, n, mode] of bins) {
    const use = a0 === 90 ? (mode90 ?? mode) : mode
    for (const [s, share] of [['m', maleShare], ['f', 1 - maleShare]]) {
      if (use === 'uniform') {
        for (let a = a0; a <= a1; a++) c[s][a] += (n * share) / (a1 - a0 + 1)
      } else { // 'Lx': 정지인구 비례(성별 각각) — 90+ 구간의 지수감소 근사
        let sum = 0
        for (let a = a0; a <= a1; a++) sum += Lx[s][a]
        for (let a = a0; a <= a1; a++) c[s][a] += n * share * (Lx[s][a] / sum)
      }
    }
  }
  return c
}
const stat = (c) => {
  let tot = 0, male = 0, ge90 = 0, ageSum = 0
  for (let a = 0; a <= MAX_AGE; a++) {
    const n = c.m[a] + c.f[a]
    tot += n; male += c.m[a]; ageSum += n * a
    if (a >= 90) ge90 += n
  }
  return { tot, male, ge90, avg: tot ? ageSum / tot : 0 }
}
// 1년 진행 — 반환: 다음 코호트 + 사망자 수 + 사망자 평균연령
function step(c, offset, k) {
  const nm = new Float64Array(MAX_AGE + 1), nf = new Float64Array(MAX_AGE + 1)
  let deaths = 0, deadAgeSum = 0
  for (let a = 0; a < MAX_AGE; a++) {
    for (const [s, src, dst] of [['m', c.m, nm], ['f', c.f, nf]]) {
      if (!src[a]) continue
      const d = src[a] * qOf(s, a, offset, k)
      dst[a + 1] = src[a] - d
      deaths += d; deadAgeSum += d * a
    }
  }
  return { c: { m: nm, f: nf }, deaths, deadAvgAge: deaths ? deadAgeSum / deaths : 0 }
}
function project({ offset = AGE_OFFSET, k = 1, mode90 = 'Lx' } = {}) {
  let c = buildCohort(BASE.bins, BASE.total, MALE_SHARE, mode90)
  const series = []
  for (let y = BASE_YEAR; y <= END_YEAR; y++) {
    const st = stat(c)
    const nx = step(c, offset, k)
    series.push({ year: y, ...st, deathsNextYear: nx.deaths, deadAvgAge: nx.deadAvgAge })
    c = nx.c
  }
  return series
}
const firstBelow = (series, th) => series.find((r) => r.tot < th)?.year ?? null
const milestonesOf = (series) => ({
  below20000: firstBelow(series, 20000), below10000: firstBelow(series, 10000),
  below5000: firstBelow(series, 5000), below1000: firstBelow(series, 1000),
})

// ── ④ 실측 검증 ─────────────────────────────────────────────────────────────
const pct = (x, d = 2) => +(x * 100).toFixed(d)

// (a) 연나이 근거 — 월별 avgAge의 1월 톱니 (실측)
const janJumps = [], nonJan = []
for (let i = 1; i < monthly.length; i++) {
  const d = monthly[i].avgAge - monthly[i - 1].avgAge
  if (!Number.isFinite(d)) continue
  ;(monthly[i].date.slice(5, 7) === '01' ? janJumps : nonJan).push(+d.toFixed(3))
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const ageConvention = {
  what: '공표 연령이 만나이가 아니라 연나이(1/1 일괄 +1)임을 월별 avgAge 계단으로 실측 확인',
  januaryJumps: janJumps, januaryMeanJump: +mean(janJumps).toFixed(3),
  otherMonthsMeanDelta: +mean(nonJan).toFixed(3),
  verdict: mean(janJumps) > 0.6 && mean(nonJan) < 0
    ? '연나이 확정 — 1월에만 계단 상승, 그 외 달은 사망 선택효과로 완만히 하락'
    : '연나이 패턴 불명확 — AGE_OFFSET 가정 재검토 필요',
  appliedOffset: AGE_OFFSET,
  effect: `공표 연나이 a → 만나이 기대값 a${AGE_OFFSET}. qx 로그기울기 β(남 ${beta.m.toFixed(3)}·여 ${beta.f.toFixed(3)})에서 사망확률 약 ${pct(1 - Math.exp(beta.m * AGE_OFFSET), 1)}%(남) 하향`,
}
if (!mean(janJumps) || janJumps.length < 3) die('1월 톱니 표본 부족 — 연나이 판정 불가, 중단')

// (b) 월별 사망자 실측 — 사망자 누계 증분(= 기록된 사망 수)
const withDead = monthly.filter((r) => r.dead != null)
if (withDead.length < 24) die('사망자 누계 열이 있는 행이 부족 — 검증 불가, 중단')
const deathsBetween = (d0, d1) => {
  const a = withDead.find((r) => r.date === d0), b = withDead.find((r) => r.date === d1)
  return a && b ? b.dead - a.dead : null
}
const inflowBetween = (d0, d1) => { // Δ(생존+누계사망) = 신규 등록
  const a = withDead.find((r) => r.date === d0), b = withDead.find((r) => r.date === d1)
  return a && b ? (b.surv + b.dead) - (a.surv + a.dead) : null
}
// 12개월 창별 실측 사망률 시계열
const deathRateWindows = []
for (let i = 12; i < withDead.length; i++) {
  const a = withDead[i - 12], b = withDead[i]
  if (months(a.date, b.date) !== 12) continue
  deathRateWindows.push({
    from: a.date, to: b.date, startSurvivors: a.surv, startAvgAge: a.avgAge,
    deaths: b.dead - a.dead, newRegistrations: (b.surv + b.dead) - (a.surv + a.dead),
    deathRatePct: pct((b.dead - a.dead) / a.surv), netDeclinePct: pct(1 - b.surv / a.surv),
  })
}
const annualWindows = deathRateWindows.filter((w) => w.to.slice(5, 7) === last.date.slice(5, 7))
const lastWin = deathRateWindows[deathRateWindows.length - 1]

// (c) 사망 계절성 — 완전 역년(1~12월)만 사용, 월별 사망 점유율 실측
//     ⚠ 공표 사망자 누계에는 행정 일괄정리로 보이는 이상치가 섞인다(예: 2018-04 = 중앙값의 4배 이상).
//     평균은 이 한 달에 끌려가므로 중앙값 기반(robust)을 중심값으로 쓰고, 평균·균등을 괄호로 함께 남긴다.
const monthDeaths = Array.from({ length: 12 }, () => [])
{
  const byYearDeaths = new Map()
  for (let i = 1; i < withDead.length; i++) {
    if (months(withDead[i - 1].date, withDead[i].date) !== 1) continue
    const y = +withDead[i].date.slice(0, 4), mo = +withDead[i].date.slice(5, 7)
    if (!byYearDeaths.has(y)) byYearDeaths.set(y, new Map())
    byYearDeaths.get(y).set(mo, withDead[i].dead - withDead[i - 1].dead)
  }
  for (const [y, mm] of byYearDeaths) {
    if (mm.size !== 12) continue // 완전 역년만
    for (const [mo, d] of mm) monthDeaths[mo - 1].push({ year: y, deaths: d })
  }
}
const seasonalYears = Math.min(...monthDeaths.map((a) => a.length))
if (!seasonalYears) die('완전 역년이 없어 계절성 산출 불가 — 중단')
const median = (a) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2 }
const medByMonth = monthDeaths.map((a) => median(a.map((r) => r.deaths)))
const meanByMonth = monthDeaths.map((a) => mean(a.map((r) => r.deaths)))
const norm = (arr) => { const t = arr.reduce((x, y) => x + y, 0); return arr.map((v) => v / t) }
const shareMedian = norm(medByMonth), shareMean = norm(meanByMonth)
const shareUniform = Array(12).fill(1 / 12)
// 이상치(중앙값의 2배 초과) — 실측으로 드러내 놓는다
const seasonalOutliers = []
monthDeaths.forEach((a, i) => a.forEach((r) => {
  if (medByMonth[i] > 0 && r.deaths > medByMonth[i] * 2) {
    seasonalOutliers.push({ month: `${r.year}-${String(i + 1).padStart(2, '0')}`, deaths: r.deaths, monthMedian: medByMonth[i], ratio: +(r.deaths / medByMonth[i]).toFixed(2) })
  }
}))
const shareOfMonths = (mos, share) => mos.reduce((a, mo) => a + share[mo - 1], 0)

// (d) ★ 정밀 교정창 — 공표 연령분포가 있는 최근 2개월 (연나이라 구간 이동 없음)
//     실측 사망자 = 사망자 누계 증분(공표), 시작 연령분포 = 공표 HWP 원표
// k는 (ageOffset, dist90plus) 가정에 의존하므로 가정별로 다시 구한다 — 민감도 각 행이 자기 정합적이어야 한다
const calWindow = (() => {
  if (!(M.isan?.latest && Array.isArray(M.isan.latest.previousMonths) && M.isan.latest.previousMonths.length >= 2)) return null
  const posts = [M.isan.latest, ...M.isan.latest.previousMonths]
    .map((p) => ({ asOf: p.asOf, alive: p.overview.cumulative.alive, dead: p.overview.cumulative.deceased, byAge: p.survivors.byAge.entries }))
    .sort((a, b) => a.asOf < b.asOf ? -1 : 1)
  const p0 = posts[0], pN = posts[posts.length - 1]
  const nMonths = months(p0.asOf, pN.asOf)
  if (nMonths < 1) return null
  const mos = []
  for (let i = 1; i <= nMonths; i++) mos.push(((+p0.asOf.slice(5, 7) + i - 1) % 12) + 1)
  const lab = { '90세이상': [90, 99, 'Lx'], '89-80세': [80, 89, 'uniform'], '79-70세': [70, 79, 'uniform'], '69-60세': [60, 69, 'uniform'], '59세이하': [50, 59, 'uniform'] }
  const bins0 = p0.byAge.map((e) => { const L = lab[e.label]; if (!L) die(`교정창 연령라벨 미상: ${e.label}`); return [L[0], L[1], e.n, L[2]] })
  return { p0, pN, nMonths, mos, bins0, obsDeaths: pN.dead - p0.dead }
})()
// (offset, mode90) → 교정계수. 계절점유율 3변형 전부 계산하고 중앙값 기반을 중심값으로 쓴다.
function computeK(offset, mode90) {
  if (!calWindow) return null
  const c0 = buildCohort(calWindow.bins0, calWindow.p0.alive, MALE_SHARE, mode90)
  const expAnnual = step(c0, offset, 1).deaths
  const variants = { median: shareMedian, mean: shareMean, uniform: shareUniform }
  const kBy = Object.fromEntries(Object.entries(variants).map(([n, sh]) => {
    const s = shareOfMonths(calWindow.mos, sh)
    return [n, { shareOfAnnualDeaths: +s.toFixed(4), modelExpectedWindowDeaths: +(expAnnual * s).toFixed(1), k: +(calWindow.obsDeaths / (expAnnual * s)).toFixed(4) }]
  }))
  return { expAnnual, kBy, k: kBy.median.k }
}

let calibration = null
const kBase = computeK(AGE_OFFSET, 'Lx')
if (kBase) {
  const { p0, pN, nMonths, mos, obsDeaths } = calWindow
  const { expAnnual, kBy, k } = kBase
  // 등가 연령오프셋 δ*: k = exp(β·δ) → δ = ln k / β (성별 가중 β)
  const betaW = MALE_SHARE * beta.m + (1 - MALE_SHARE) * beta.f
  calibration = {
    what: '공표 연령분포가 있는 최근 구간에서 실측 사망자 수 vs 모델 기대 사망자 수 → 교정계수 k',
    why: '연나이 체계에서는 이 구간 안에 연령구간 이동이 없어(1/1에만 +1) 시작 연령분포가 그대로 유지된다 — 연령차 없이 대조 가능한 유일한 창',
    window: { from: p0.asOf, to: pN.asOf, months: nMonths, startSurvivors: p0.alive, startAgeBins: p0.byAge.map((e) => ({ label: e.label, n: e.n })) },
    observedDeaths: obsDeaths,
    modelExpectedAnnualDeaths: +expAnnual.toFixed(1),
    seasonality: {
      calendarMonths: mos, basedOnFullYears: seasonalYears,
      chosen: 'median', note: '월별 사망 점유율. 공표 사망자 누계에 행정 일괄정리 이상치가 있어 평균은 왜곡된다 → 중앙값 기반을 중심값으로 채택',
      byVariant: kBy, outliersExcludedByMedian: seasonalOutliers,
    },
    modelExpectedWindowDeaths: kBy.median.modelExpectedWindowDeaths,
    k, kRange: [Math.min(...Object.values(kBy).map((v) => v.k)), Math.max(...Object.values(kBy).map((v) => v.k))],
    equivalentAgeOffsetYears: +(Math.log(k) / betaW).toFixed(2),
    interpretation: `등록 생존자 집단의 '기록된' 사망률이 전국 생명표의 ${pct(k, 1)}% 수준. 생명표 대비 ${pct(1 - k, 1)}% 낮으며 연령으로 환산하면 약 ${Math.abs(Math.log(k) / betaW).toFixed(1)}세 젊은 집단에 해당. 원인 후보: (a) 사망 신고·확인 지연(가족이 신고해야 반영), (b) 공표 연령체계와 생명표 연령체계의 잔여 불일치, (c) 등록 유지 집단의 선택효과. 어느 쪽인지 외부에서 특정 불가 → 보정 시나리오로 병기하고 원값 시나리오도 함께 남긴다.`,
  }
} else {
  calibration = { what: '교정 불가 — isan.json의 월별 공표 연령분포(previousMonths) 부재', k: null }
}
const K = calibration.k ?? 1

// (e) 12개월 창 교차검증 — 최근 12개월 실측 사망률 vs 모델(교정 전/후)
const base = project({ offset: AGE_OFFSET, k: 1 })
const cal = calibration.k ? project({ offset: AGE_OFFSET, k: K }) : null
const modelYear1 = base[0].deathsNextYear / base[0].tot
const modelYear1Cal = cal ? cal[0].deathsNextYear / cal[0].tot : null

// (f) 장기 검증 — 2017-07 → 2025-08 실측 감소율 vs 모델 동일 길이 창
const mLong = months(first.date, last.date)
const N = (y, series) => series.find((r) => r.year === y)?.tot
const interp = (t, series) => { const y = Math.floor(t); return N(y, series) * (N(y + 1, series) / N(y, series)) ** (t - y) }
const actLongNet = 1 - (last.surv / first.surv) ** (12 / mLong)
const modLongNet = (series) => 1 - (interp(BASE_YEAR + mLong / 12, series) / N(BASE_YEAR, series)) ** (12 / mLong)
// 유입 제거(사망만) 장기 감소율 — 모델과 정의를 맞춘 비교축
const reg0 = withDead[0]
const mReg = months(reg0.date, last.date)
const inflowLong = inflowBetween(reg0.date, last.date)
const deathsLong = deathsBetween(reg0.date, last.date)
const actLongGross = 1 - ((reg0.surv - deathsLong) / reg0.surv) ** (12 / mReg)

// (g) 신규 등록 유입 — 무시 가능함을 실측으로 확인
const d24 = []
for (let i = Math.max(1, withDead.length - 24); i < withDead.length; i++) {
  d24.push((withDead[i].surv + withDead[i].dead) - (withDead[i - 1].surv + withDead[i - 1].dead))
}
const newRegAvg = mean(d24), newRegMed = median(d24)
// 최신 공표(HWP) 기준 월별 신청자 증가 — CSV보다 9개월 이상 최신
let recentInflow = null
if (M.isan?.latest?.overview) {
  const posts = [M.isan.latest, ...(M.isan.latest.previousMonths ?? [])]
    .map((p) => ({ asOf: p.asOf, applicants: p.overview.cumulative.applicants, mom: p.overview.momChange?.applicants }))
    .sort((a, b) => (a.asOf < b.asOf ? -1 : 1))
  const deltas = posts.filter((p) => Number.isFinite(p.mom)).map((p) => ({ asOf: p.asOf, newApplicants: p.mom }))
  if (deltas.length) {
    const avg = mean(deltas.map((d) => d.newApplicants))
    recentInflow = {
      source: '통일부 신청현황 공표(HWP) 전월대비 신청자 증감', months: deltas, monthlyAvg: +avg.toFixed(1),
      annualisedPctOfSurvivors: pct(avg * 12 / BASE.total, 2),
    }
  }
}

// ── ⑤ 민감도 — 가정을 흔들어 마일스톤이 얼마나 움직이는지 ───────────────────
const sensitivity = []
for (const offset of [0, -0.5, -1.0, -1.5]) {
  for (const mode90 of ['Lx', 'uniform']) {
    const kHere = computeK(offset, mode90)?.k // 가정별로 재산출 — 각 행이 자기 정합적
    for (const k of kHere ? [1, kHere] : [1]) {
      const s = project({ offset, k, mode90 })
      sensitivity.push({
        ageOffset: offset, dist90plus: mode90, k: +k.toFixed(4), calibrated: k !== 1,
        year1DeclinePct: pct(s[0].deathsNextYear / s[0].tot),
        y2030: Math.round(N(2030, s)), y2040: Math.round(N(2040, s)), y2050: Math.round(N(2050, s)),
        ...milestonesOf(s),
      })
    }
  }
}

// ── ⑥ 산출 ──────────────────────────────────────────────────────────────────
const byYear = base.filter((r) => r.year <= 2050).map((r, i) => {
  const c = cal?.[i]
  const tot = Math.round(r.tot), male = Math.round(r.male)
  return {
    year: r.year, asOf: `${r.year}-05-31`,
    expected: tot, male, female: tot - male, // 독립 반올림하면 합이 1 어긋난다 → 잔차를 여자에 귀속
    age90plus: Math.round(r.ge90), share90plusPct: +(r.ge90 / r.tot * 100).toFixed(1),
    avgAge: +r.avg.toFixed(1),
    ...(c ? { expectedCalibrated: Math.round(c.tot), age90plusCalibrated: Math.round(c.ge90) } : {}),
  }
})
const milestones = milestonesOf(base)
const milestonesCalibrated = cal ? milestonesOf(cal) : null
const range = (a, b) => (a == null || b == null ? null : (a === b ? String(a) : `${Math.min(a, b)}~${Math.max(a, b)}`))
const milestoneRange = milestonesCalibrated ? {
  note: '생명표 원값(빠른 쪽) ~ 실측 교정(느린 쪽) 범위. 발표·기획서에는 이 범위를 쓰는 것이 정직하다.',
  below20000: range(milestones.below20000, milestonesCalibrated.below20000),
  below10000: range(milestones.below10000, milestonesCalibrated.below10000),
  below5000: range(milestones.below5000, milestonesCalibrated.below5000),
  below1000: range(milestones.below1000, milestonesCalibrated.below1000),
} : null

const out = {
  builtAt: TODAY,
  sources: [
    {
      name: `통계청 완전생명표(1세별) ${year}년 — 성·연령별 사망확률(qx)·정지인구(Lx)`,
      org: '통계청(KOSIS)', orgId: '101', tblId: 'DT_1B42', usedYear: year, lastChanged: published,
      items: { qxMale: 'T15', qxFemale: 'T25', LxMale: 'T13', LxFemale: 'T23' },
      url: 'https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B42',
      api: 'https://kosis.kr/openapi/Param/statisticsParameterData.do (KOSIS OpenAPI, apiKey 별도)',
      rowsReceived: rows.length, accessedAt: TODAY,
    },
    {
      name: '이산가족 신청 현황(’26.5.31.) — 생존자 연령 5구간·성별', asOf: BASE.asOf,
      org: '통일부 이산가족정보통합시스템(국가통계 승인번호 제103003호)',
      url: 'https://reunion.unikorea.go.kr/reuni/home/pds/reqststat/list.do?mid=SM00000129',
      localFile: '북한자료/2026년 5월 이산가족 신청 현황(홈페이지).pdf',
      via: M.isan ? '북한자료-api/isan.json (HWP 원표 파싱) — 하드코딩 입력과 실측 대조 완료' : '하드코딩(공표 PDF 대조 확인)',
    },
    {
      name: '통일부_이산가족찾기 등록현황 월별 통계 정보 (검증·교정용 실측)', asOf: last.date,
      org: '공공데이터포털(data.go.kr) — 통일부 제공 파일데이터',
      url: 'https://www.data.go.kr/data/15034465/fileData.do',
      localFile: '북한자료/자료집/통일부_이산가족찾기 등록현황 월별 통계 정보_20250831.csv',
      span: `${first.date} ~ ${last.date} (${monthly.length}개월)`, loadedVia: M.src,
    },
  ],
  headline: {
    asOf: BASE.asOf, survivors: BASE.total,
    note: '생명표 원값 시나리오와 실측 교정 시나리오의 범위로 읽어야 한다. 단일 수치로 단정하지 말 것.',
    survivors2030: cal ? `${Math.round(N(2030, base)).toLocaleString()}~${Math.round(N(2030, cal)).toLocaleString()}` : String(Math.round(N(2030, base))),
    survivors2040: cal ? `${Math.round(N(2040, base)).toLocaleString()}~${Math.round(N(2040, cal)).toLocaleString()}` : String(Math.round(N(2040, base))),
    below10000Year: milestoneRange?.below10000 ?? milestones.below10000,
  },
  method: {
    summary: '성·연령별 코호트에 완전생명표 사망확률(qx)을 매년 적용하는 단순 생잔(生殘) 추계. 신규 유입 없음(실측으로 미미함 확인). 연나이→만나이 보정 적용, 실측 교정계수 시나리오 병기.',
    steps: [
      '연령 5구간을 단일 연령으로 배분: 80-89·70-79·60-69 균등, 59세이하→50~59세 균등 가정',
      `90세이상은 완전생명표 정지인구(Lx) 비례로 90~99세 배분 — 지수감소 근사(연비 남 ${((Lx.m[99] / Lx.m[90]) ** (1 / 9)).toFixed(2)}·여 ${((Lx.f[99] / Lx.f[90]) ** (1 / 9)).toFixed(2)}), 100세+ 초기인원 0`,
      `남녀 비율 ${pct(MALE_SHARE, 1)}% : ${pct(1 - MALE_SHARE, 1)}%를 모든 구간에 동일 적용`,
      `★ 연나이→만나이 보정: 공표 연령 a의 만나이는 [a-1,a] 균등 → qx를 만나이 a${AGE_OFFSET}에서 로그선형 보간(=√(qx(a-1)·qx(a))). 근거는 validation.ageConvention의 1월 톱니 실측`,
      `매년 5/31 기준 코호트에 1년 사망확률을 적용해 생존 기대값 산출, ${BASE_YEAR}→2050 반복(마일스톤 탐색은 ${END_YEAR}까지)`,
      `100세 이상 qx는 지수 외삽 qx(a)=min(${QX_CAP}, qx99·g^(a-99)), g남=${g.m.toFixed(4)}·g여=${g.f.toFixed(4)} (표의 100세이상 qx=1은 개방구간 정의값이라 미사용)`,
      calibration.k ? `★ 교정 시나리오: 위 qx에 실측 교정계수 k=${calibration.k}를 곱한 병렬 추계(expectedCalibrated). k는 공표 사망자 누계 증분에서 산출한 실측값` : '교정 시나리오 미산출(연령분포 시계열 부재)',
    ],
    scenarios: {
      expected: '생명표 원값 — 전국 평균 사망률을 그대로 적용. 감소가 빠른 쪽(하한 생존자).',
      expectedCalibrated: calibration.k ? `실측 교정 — 등록 생존자 집단의 기록된 사망률(생명표의 ${pct(K, 1)}%)을 반영. 감소가 느린 쪽(상한 생존자).` : null,
    },
  },
  assumptions: [
    `신규 등록 유입 무시 — 실측 최근 24개월 월 중앙값 +${newRegMed.toFixed(1)}명(연 ${pct(newRegMed * 12 / last.surv, 2)}%)${recentInflow ? `, 최신 공표(${recentInflow.months.map((d) => d.asOf).join('·')}) 기준 월 ${recentInflow.monthlyAvg}명(연 ${recentInflow.annualisedPctOfSurvivors}%)` : ''} — 사망률의 수십 분의 1이라 무시해도 결과가 바뀌지 않는다`,
    '59세이하(1,816명)는 50~59세 균등분포로 가정 — 실제 하한 불명(민감도: sensitivity 표의 ageOffset 행으로 간접 확인)',
    '90세이상(11,431명)은 90~99세에 생명표 정지인구(Lx) 비례 배분, 100세 이상 초기 인원 0으로 가정 — 균등배분 대안은 sensitivity의 dist90plus=uniform',
    '남녀 비율(남 60.9%)을 전 연령 구간에 동일 적용 — 구간별 실제 성비는 미공표',
    `사망확률은 ${year}년 완전생명표를 전 기간 고정 적용 — 미래 사망률 개선(수명 연장) 미반영 → 감소 속도 과대추정 방향`,
    '공표 연령은 연나이로 판정(1월 톱니 실측)했고 만나이 -0.5 보정을 적용했다. 다만 월별 CSV의 공표 평균연령(2025-08 83.02세)은 공표 연령분포에서 계산되는 평균(81.6~82.4세)과 1~2세 차이가 있다 — 두 공표계열의 연령체계가 완전히 같다고 단정할 수 없어 sensitivity에 ageOffset 0/-0.5/-1.0/-1.5를 모두 실었다',
    '이산가족 생존자 집단의 사망률 = 전국 평균이라는 가정은 실측과 어긋난다 — 교정계수 k로 정량화해 병렬 시나리오로 제시(원값 시나리오도 그대로 보존)',
    '생존자 감소 실측치에는 사망 신고·확인 지연이 섞여 있어 실측 사망률이 실제 사망보다 낮게(느리게) 기록될 수 있음 — 진실은 두 시나리오 사이',
  ],
  input: {
    asOf: BASE.asOf, total: BASE.total, male: BASE.male, female: BASE.female,
    ageBins: [
      { bin: '90세이상', n: 11431 }, { bin: '80-89세', n: 11057 }, { bin: '70-79세', n: 5661 },
      { bin: '60-69세', n: 3307 }, { bin: '59세이하', n: 1816 },
    ],
    ageBasis: '연나이(공표 원문) — 모델 내부에서 만나이 -0.5 보정',
    crossCheck: inputCrossCheck,
    note: '통일부 「이산가족 신청 현황(’26.5.31.)」 원문과 대조 확인된 값',
  },
  lifeTable: {
    year, tblId: 'DT_1B42', published,
    betaLogSlopePerYear: { male: +beta.m.toFixed(4), female: +beta.f.toFixed(4) },
    qxAgeStart: 50,
    qxMale: Array.from({ length: 50 }, (_, i) => qx.m[50 + i]),
    qxFemale: Array.from({ length: 50 }, (_, i) => qx.f[50 + i]),
  },
  byYear,
  milestones,
  milestonesCalibrated,
  milestoneRange,
  validation: {
    ageConvention,
    calibration,
    recentWindow: lastWin ? {
      what: '실측 최근 12개월 사망률(공표 사망자 누계 증분) vs 모델 1차연도 사망률 — 연령구조가 가장 가까운 대조',
      actual: {
        from: lastWin.from, to: lastWin.to, startSurvivors: lastWin.startSurvivors,
        deaths: lastWin.deaths, deathRatePct: lastWin.deathRatePct,
        netDeclinePct: lastWin.netDeclinePct, newRegistrations: lastWin.newRegistrations,
      },
      model: { year1DeathRatePct: pct(modelYear1), year1DeathRateCalibratedPct: modelYear1Cal != null ? pct(modelYear1Cal) : null },
      errorPp: +((modelYear1 - lastWin.deathRatePct / 100) * 100).toFixed(2),
      errorRelPct: +(((modelYear1 - lastWin.deathRatePct / 100) / (lastWin.deathRatePct / 100)) * 100).toFixed(1),
      errorRelCalibratedPct: modelYear1Cal != null
        ? +(((modelYear1Cal - lastWin.deathRatePct / 100) / (lastWin.deathRatePct / 100)) * 100).toFixed(1) : null,
      caveat: `실측 창 시작(${lastWin.from}) 집단은 모델 기준(2026-05)보다 ${(months(lastWin.from, BASE.asOf) / 12).toFixed(1)}년 젊다 — 모델 사망률이 다소 높게 나오는 방향이 자연스럽다. 교정계수 k는 이 연령차가 없는 2026년 창에서 산출했다`,
    } : null,
    deathRateSeries: {
      what: '12개월 이동창 실측 사망률(사망자 누계 증분 ÷ 창 시작 생존자) — 모델이 재현해야 할 실측 곡선',
      note: '실측 사망률은 집단 고령화에도 최근 5년 7.5~7.8%에서 정체 — 생명표대로면 매년 상승해야 한다. 이 정체 자체가 기록 지연·미신고를 시사한다',
      annual: annualWindows.map((w) => ({ from: w.from, to: w.to, startSurvivors: w.startSurvivors, startAvgAge: w.startAvgAge, deaths: w.deaths, deathRatePct: w.deathRatePct, netDeclinePct: w.netDeclinePct })),
    },
    seasonality: {
      what: '월별 사망 점유율 실측(완전 역년) — 짧은 교정창을 연율화할 때 계절 편향 제거에 사용',
      fullYearsUsed: seasonalYears,
      shareByMonth: shareMedian.map((v, i) => ({
        month: i + 1, shareMedian: +v.toFixed(4), shareMean: +shareMean[i].toFixed(4),
        medianDeaths: medByMonth[i], years: monthDeaths[i].length,
      })),
      outliers: seasonalOutliers,
      outlierNote: '중앙값의 2배를 넘는 달 = 행정 일괄정리로 추정. 평균 기반 계절성은 이 값에 끌려가므로 교정에는 중앙값을 쓴다',
    },
    longWindow: {
      what: `실측 월별 감소율(${first.date}→${last.date}, ${mLong}개월)과 모델 동일 길이 창(2026-05 기준→${mLong}개월) 연환산 대조`,
      actual: {
        from: { date: first.date, survivors: first.surv }, to: { date: last.date, survivors: last.surv },
        months: mLong, annualNetDeclinePct: pct(actLongNet),
      },
      actualGrossOfInflow: {
        what: '신규 등록 유입을 제거한 사망만의 연환산 감소율 — 모델과 정의가 같은 비교축',
        span: `${reg0.date} ~ ${last.date}`, months: mReg, deaths: deathsLong, inflow: inflowLong,
        annualDeclinePct: pct(actLongGross),
      },
      model: {
        annualDeclinePct: pct(modLongNet(base)),
        annualDeclineCalibratedPct: cal ? pct(modLongNet(cal)) : null,
      },
      errorPpVsNet: +((modLongNet(base) - actLongNet) * 100).toFixed(2),
      errorRelPctVsNet: +(((modLongNet(base) - actLongNet) / actLongNet) * 100).toFixed(1),
      errorPpVsGross: +((modLongNet(base) - actLongGross) * 100).toFixed(2),
      errorRelPctVsGross: +(((modLongNet(base) - actLongGross) / actLongGross) * 100).toFixed(1),
      errorRelPctVsGrossCalibrated: cal ? +(((modLongNet(cal) - actLongGross) / actLongGross) * 100).toFixed(1) : null,
      caveat: '실측 창(2017~25)의 집단은 모델 기준 시점(2026)보다 젊었다 — 모델 감소율이 높게 나오는 방향이 자연스러움. 연령차가 없는 대조는 validation.calibration을 볼 것',
    },
    newRegistrations: {
      what: '신규 등록 유입이 무시 가능함을 실측으로 확인 — Δ(생존+누계사망) 월별',
      span: `${withDead[0].date} ~ ${last.date}`,
      monthlyAvgLast24: +newRegAvg.toFixed(1),
      monthlyMedianLast24: +newRegMed.toFixed(1),
      shareOfSurvivorsPctPerMonth: pct(newRegMed / last.surv, 3),
      annualisedPctByMean: pct(newRegAvg * 12 / last.surv, 2),
      annualisedPctByMedian: pct(newRegMed * 12 / last.surv, 2),
      latestPublished: recentInflow,
      verdict: recentInflow
        ? `최신 공표 기준 월 ${recentInflow.monthlyAvg}명(연 ${recentInflow.annualisedPctOfSurvivors}%) — 사망률(연 ${pct(modelYear1)}%/실측 ${lastWin.deathRatePct}%)의 수십 분의 1. 유입 무시 가정은 실측으로 정당화된다`
        : '최신 공표 기준 유입 미측정(isan.json 부재)',
      caveat: 'CSV 기간의 평균은 행정 일괄정리 달에 끌려간다 → 중앙값과 최신 공표치를 함께 본다',
    },
    avgAgeCheck: {
      what: '모델 초기 평균연령(공표 연령분포 기반) vs 공표 평균연령 — 두 공표계열의 연령체계 정합성 점검',
      modelInitialAvgAge: +base[0].avg.toFixed(2),
      publishedAvgAge: { date: last.date, value: last.avgAge },
      gapYears: +(last.avgAge - base[0].avg).toFixed(2),
      finding: '공표 연령분포에서 계산한 평균(구간 중앙값 기준)과 공표 평균연령 열이 1~2세 어긋난다. 어느 쪽이 만나이/연나이/세는나이인지 원자료에 명시가 없어 외부에서 특정 불가 → 해결하지 않고 sensitivity의 ageOffset으로 영향 범위를 공개한다',
      modelDeadAvgAgeYear1: +base[0].deadAvgAge.toFixed(1),
    },
  },
  sensitivity: {
    what: '가정을 흔들었을 때 마일스톤이 얼마나 움직이는지 — 이 표가 단일 수치 단정을 막는다',
    columns: 'ageOffset(연나이→만나이 보정), dist90plus(90+ 배분), k(실측 교정계수), 연도별 생존자, 마일스톤',
    baseCase: { ageOffset: AGE_OFFSET, dist90plus: 'Lx', k: 1 },
    grid: sensitivity,
  },
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8')
console.log(`✓ ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`)
console.log(`  기준 ${BASE.asOf} ${BASE.total.toLocaleString()}명`)
console.log(`  원값 : 2030 ${Math.round(N(2030, base)).toLocaleString()} · 2040 ${Math.round(N(2040, base)).toLocaleString()} · 2050 ${Math.round(N(2050, base)).toLocaleString()} — 2만↓${milestones.below20000} 1만↓${milestones.below10000} 5천↓${milestones.below5000} 1천↓${milestones.below1000}`)
if (cal) console.log(`  교정 : 2030 ${Math.round(N(2030, cal)).toLocaleString()} · 2040 ${Math.round(N(2040, cal)).toLocaleString()} · 2050 ${Math.round(N(2050, cal)).toLocaleString()} — 2만↓${milestonesCalibrated.below20000} 1만↓${milestonesCalibrated.below10000} 5천↓${milestonesCalibrated.below5000} 1천↓${milestonesCalibrated.below1000}`)
console.log(`  연나이 판정: 1월 평균 +${ageConvention.januaryMeanJump} / 그외 ${ageConvention.otherMonthsMeanDelta} → offset ${AGE_OFFSET}`)
if (calibration.k) console.log(`  교정계수 k=${calibration.k} (${calibration.window.from}~${calibration.window.to}, 실측 사망 ${calibration.observedDeaths} vs 기대 ${calibration.modelExpectedWindowDeaths}) ≈ 연령 ${calibration.equivalentAgeOffsetYears}세`)
console.log(`  검증(최근12M): 실측 사망률 ${lastWin.deathRatePct}% vs 모델 원값 ${pct(modelYear1)}%${modelYear1Cal != null ? ` / 교정 ${pct(modelYear1Cal)}%` : ''}`)
console.log(`  검증(장기 ${mLong}M): 실측 순감 ${pct(actLongNet)}% · 유입보정 ${pct(actLongGross)}% vs 모델 원값 ${pct(modLongNet(base))}%${cal ? ` / 교정 ${pct(modLongNet(cal))}%` : ''}`)
