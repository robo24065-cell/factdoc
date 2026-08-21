#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   고향잇기 — 분석 카드 빌더

   보유 데이터만으로 **실제로 성립하는** 교차표·시계열을 계산해
   북한자료-api/analysis.json 으로 낸다.

   원칙 (이 파일의 존재 이유)
   ① **재료를 먼저 잰다.** 후보를 계산해 보고 표본이 얇으면 '불가'로 적는다.
      성립하지 않는 카드도 cards[] 에 남긴다 — 정직한 목록이 억지 분석보다 강하다.
   ② **수치는 전부 여기서 계산한다.** 하드코딩 금지. 상수로 박은 값이 있으면
      그건 원문에서 옮긴 라벨(구행정구역 대응표 등)뿐이고 주석으로 근거를 단다.
   ③ **as-of 를 카드마다 붙인다.** 계열마다 기준일이 다르다(CSV 2025-08-31,
      HWP 2026-05-31, 보도자료 2025-10-24, 회담 2018-12-31…). 섞으면 반드시 적는다.
   ④ **인과를 주장하지 않는다.** 같은 기간 함께 움직였다까지만 쓴다.
   ⑤ 유의성은 **정확검정**으로 낸다(n 이 작아 근사가 무의미). 순열/부호/맨-휘트니.

   입력
     frontend/public/gohyang/{isan,region,museum,opinion,projection,map}.json
     북한자료-api/museum.json          (사료 전량 4,342 — 팩은 1,445만 담는다)
     frontend/src/data/nk-index.json   (통일부 코퍼스 68,487 — 없으면 해당 카드만 '불가')
     북한자료-api/nkinfoTrendDates.json (동향 날짜 — 커버리지 측정용)

   출력
     북한자료-api/analysis.json

   사용법
     node scripts/nk-analysis.mjs [--out=경로] [--quiet]

   재실행 가능 — 같은 입력이면 builtAt 을 빼고 바이트 동일.
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACK = path.join(ROOT, 'frontend', 'public', 'gohyang')
const API = path.join(ROOT, '북한자료-api')
const argv = process.argv.slice(2)
const arg = (k) => { const h = argv.find((a) => a.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : null }
const QUIET = argv.includes('--quiet')
const OUT = arg('out') || path.join(API, 'analysis.json')
const log = (...a) => { if (!QUIET) console.log(...a) }

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }

/* ── 카드를 문장 안에서 부를 때 쓰는 이름 ──────────────────────────────────
   화면에 나가는 글에는 내부 id(영문)를 절대 쓰지 않는다. 카드 제목의
   파생기호(—) 앞부분을 그대로 쓴다. 제목을 바꾸면 여기도 함께 바꾼다. */
const CARD_NAME = {
  'exchange-terminus': '「교류는 줄어든 게 아니라 끊겼다」',
  'record-density-gap': '「가장 많은 사람이 그리는 고향에, 가장 적은 기록이 남았다」',
  'series-breaks': '「98개월 안에 숨은 단절」',
}
const CN = (id) => CARD_NAME[id]

/* ── 소수점: 화면이 그대로 찍을 수 있도록 여기서 자른다 ─────────────────── */
const r1 = (x) => Math.round(x * 10) / 10
const r2 = (x) => Math.round(x * 100) / 100
const r3 = (x) => Math.round(x * 1000) / 1000
const pct = (a, b) => (b === 0 ? null : r1((a / b) * 100))
/** 화면 표시용 — 소수 한 자리를 항상 유지한다("1%"가 아니라 "1.0%") */
const pctS = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`)

/* ── 통계 도구 (전부 정확검정 — n 이 7~19라 근사를 쓰면 안 된다) ────────── */
function mean(a) { return a.reduce((s, v) => s + v, 0) / a.length }
function median(a) { const b = [...a].sort((x, y) => x - y); const n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2 }
function pearson(a, b) {
  const n = a.length, ma = mean(a), mb = mean(b)
  let sab = 0, saa = 0, sbb = 0
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2 }
  return saa === 0 || sbb === 0 ? null : sab / Math.sqrt(saa * sbb)
}
function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0])
  const out = Array(a.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[idx[k][1]] = avg
    i = j + 1
  }
  return out
}
function spearman(a, b) { return pearson(ranks(a), ranks(b)) }
/** 스피어만 정확 p (n<=8 만 — 8! = 40,320) */
function spearmanExactP(a, b) {
  const n = a.length
  if (n > 8) return null
  const rx = ranks(a), ry = ranks(b)
  const obs = Math.abs(pearson(rx, ry))
  let cnt = 0, tot = 0
  const perm = (rest, cur) => {
    if (!rest.length) { tot++; if (Math.abs(pearson(rx, cur)) >= obs - 1e-12) cnt++; return }
    for (let i = 0; i < rest.length; i++) perm([...rest.slice(0, i), ...rest.slice(i + 1)], [...cur, rest[i]])
  }
  perm(ry, [])
  return cnt / tot
}
/** 맨-휘트니 U 정확검정(양측) */
function mannWhitneyExact(a, b) {
  const U = (x, y) => { let u = 0; for (const p of x) for (const q of y) { if (p > q) u++; else if (p === q) u += 0.5 } return u }
  const all = [...a, ...b], na = a.length
  const obs = U(a, b)
  const combos = []
  const rec = (st, cur) => { if (cur.length === na) { combos.push(cur.slice()); return } for (let i = st; i < all.length; i++) { cur.push(i); rec(i + 1, cur); cur.pop() } }
  rec(0, [])
  let ge = 0, le = 0
  for (const c of combos) {
    const s = new Set(c)
    const u = U(all.filter((_, i) => s.has(i)), all.filter((_, i) => !s.has(i)))
    if (u >= obs) ge++
    if (u <= obs) le++
  }
  const one = Math.min(ge, le) / combos.length
  return { U: obs, maxU: a.length * b.length, pOneSided: one, pTwoSided: Math.min(1, 2 * one), permutations: combos.length }
}
/** 부호검정(양측) */
function signTestExact(successes, n) {
  const C = (N, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (N - i)) / (i + 1); return r }
  let tail = 0
  const k = Math.max(successes, n - successes)
  for (let i = k; i <= n; i++) tail += C(n, i)
  return Math.min(1, (2 * tail) / 2 ** n)
}
function linreg(x, y) {
  const n = x.length, mx = mean(x), my = mean(y)
  let sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2 }
  const slope = sxy / sxx
  const r = pearson(x, y)
  return { slope, intercept: my - slope * mx, r, r2: r * r }
}

/* ── 입력 적재 ────────────────────────────────────────────────────────────── */
const isan = readJSON(path.join(PACK, 'isan.json'))
const region = readJSON(path.join(PACK, 'region.json'))
const opinion = readJSON(path.join(PACK, 'opinion.json'))
const projection = readJSON(path.join(PACK, 'projection.json'))
const museumFullPath = path.join(API, 'museum.json')
const museum = readJSON(museumFullPath)            // 전량 4,342 (팩은 지역 태깅분 1,445만)
const trendDatesPath = path.join(API, 'nkinfoTrendDates.json')
const corpusPath = path.join(ROOT, 'frontend', 'src', 'data', 'nk-index.json')

/* 이산가족정보통합시스템 신규 수집분(12코너)의 자격 판정 결과.
   ★ 무엇을 셀지는 여기서 정하지 않는다 — scripts/nk-reunion-region.mjs 가 중복·지역귀속을
     판정해 근거와 함께 내고, 이 파일은 그 결과를 **읽기만** 한다.
     판정을 분석기 안에 숨기면 분자가 왜 그 값인지 감사할 수 없게 된다. */
const reunionPath = path.join(API, 'reunion-region.json')
const reunion = exists(reunionPath) ? readJSON(reunionPath) : null
if (reunion) {
  const want = new Set(['htgallery', 'vletter'])
  const got = new Set(reunion.numeratorDelta.included)
  if (want.size !== got.size || [...want].some((k) => !got.has(k))) {
    throw new Error(`분자 포함 코너가 바뀌었다: ${[...got].join(',')} — nk-analysis.mjs 의 집계 코드를 함께 고쳐라`)
  }
}
/** 신규 수집분에서 그 고향 축에 붙은 건수. 판정 파일이 없으면 0 (옛 수치 그대로 나온다). */
const reunionOf = (oldKey) => (reunion ? (reunion.byOld[oldKey]?.total ?? 0) : 0)
const reunionGallery = (oldKey) => (reunion ? (reunion.byOld[oldKey]?.htgallery ?? 0) : 0)
const reunionVletter = (oldKey) => (reunion ? (reunion.byOld[oldKey]?.vletter ?? 0) : 0)

const monthly = isan.monthly
const M0 = monthly[0], M1 = monthly.at(-1)
const CSV_ASOF = M1.month                          // 2025-08-31 — 월별 CSV 의 끝
const HWP_ASOF = isan.latest.asOf                  // 2026-05-31 — 게시판 HWP 의 끝
const EX_ASOF = isan.exchange.asOf                 // 교류현황 기준일
const CHRONO_ASOF = isan.chronology.at(-1).date    // 연표(이산가족) 마지막 사건일

/* ── 구(舊)행정구역 7종 축 ────────────────────────────────────────────────
   이산가족 원적 공표축(황해·평남·평북·함남·함북·미수복경기·미수복강원)에
   현행 13지역과 사료 구도명 태그를 붙인 대응표.
   근거: map.json crosswalk(근사 매핑 — 실제 경계는 일치하지 않음),
        museum.json meta.historicToOld, region.json regions[].isanOrigin.
   ── 이 표만이 이 파일의 유일한 '손으로 적은' 값이다.                     */
const OLD_AXIS = [
  { id: 'hwanghae-old', name: '황해도(구)', originKey: '황해', modern: ['황해남도', '황해북도'], historic: ['황해도(구)'] },
  { id: 'pyongan-s-old', name: '평안남도(구)', originKey: '평남', modern: ['평안남도', '평양', '남포'], historic: [] },
  { id: 'pyongan-n-old', name: '평안북도(구)', originKey: '평북', modern: ['평안북도', '자강도'], historic: [] },
  { id: 'hamgyong-s-old', name: '함경남도(구)', originKey: '함남', modern: ['함경남도', '량강도'], historic: ['함경도(구)'] },
  { id: 'hamgyong-n-old', name: '함경북도(구)', originKey: '함북', modern: ['함경북도', '라선'], historic: ['함경도(구)'] },
  { id: 'gyeonggi-unrec', name: '미수복경기', originKey: '미수복경기', modern: ['개성'], historic: ['미수복경기'] },
  { id: 'gangwon-unrec', name: '미수복강원', originKey: '미수복강원', modern: ['강원도'], historic: [] },
]

/* 대응표 무결성 검사 — 축 라벨이 어긋나면 조용히 0 이 되므로 여기서 죽인다 */
for (const o of OLD_AXIS) {
  if (!(o.originKey in M1.origin)) throw new Error(`원적 축 라벨 불일치: ${o.originKey}`)
  for (const m of o.modern) if (!region.regions[m]) throw new Error(`지역 축 라벨 불일치: ${m}`)
  for (const h of o.historic) if (!(h in museum.byRegionHistoric)) throw new Error(`구도명 축 불일치: ${h}`)
}

/* 사료 venueOnly(상봉장소일 뿐 고향이 아님) 재현 — 원본 meta 와 대조 */
const VENUE_CITIES = new Set(museum.meta.kangwonVenueOnly.venueCities)
const isVenueOnly = (r) => (r.regionCities || []).length > 0 && (r.regionCities || []).every((c) => VENUE_CITIES.has(c))
const venueOnlyCount = museum.records.filter(isVenueOnly).length
if (venueOnlyCount !== museum.meta.kangwonVenueOnly.count) {
  throw new Error(`venueOnly 재현 실패: ${venueOnlyCount} ≠ ${museum.meta.kangwonVenueOnly.count}`)
}

/* 사료 생산연도 파서 — '1991.06.27' '1991.09' '1991' '0000.00.00' 혼재 */
const producedYear = (s) => { if (!s) return null; const m = String(s).match(/(1[89]\d\d|20\d\d)/); return m ? +m[1] : null }

/* ── 카드 조립 도우미 ─────────────────────────────────────────────────────── */
const cards = []
const rejected = []
const push = (c) => { cards.push(c); if (c.verdict === '불가') rejected.push({ id: c.id, why: c.rejectWhy || c.findings[0]?.note || '' }) }
const F = (label, value, note) => (note === undefined ? { label, value } : { label, value, note })

/* ── 「이 카드에서 먼저 읽어야 할 것」 표시 ────────────────────────────────
   예전에는 라벨 앞에 ★ 를 붙여 표시했다. 그런데 ★ 는 **화면에 그대로 나갔다** —
   읽는 사람에게는 뜻이 없는 내부 우선순위 기호였다(사용자 지적).
   표시는 남기되 글자에서 뗀다: 렌더되지 않는 필드 key 로 옮긴다.
   덱 요약 검증기(frontend/src/engine/nk-summary.mjs)가 이 표시를 읽어
   ① 요약에 넘길 finding 5개를 고르고 ② 카드가 적어 둔 한계를 강제한다. */
const KEY = (f) => ({ ...f, key: true })
const XY = (x, y) => ({ x, y })

/* ══════════════════════════════════════════════════════════════════════════
   카드 1 — 교류의 종말
   ══════════════════════════════════════════════════════════════════════════ */
{
  const rows = isan.exchange.byYear.map((y) => {
    const g = y.gov, p = y.private
    return {
      year: y.year,
      partial: y.throughMonth || null,
      govCases: g.lifeCheck.cases + g.letters.cases + g.visitSouth.cases + g.visitNorth.cases + g.video.cases,
      govPersons: g.lifeCheck.persons + g.letters.persons + g.visitSouth.persons + g.visitNorth.persons + g.video.persons,
      privCases: p.lifeCheckCases + p.letterCases + p.otherCases + p.reunion.cases,
      privReunionPersons: p.reunion.persons,
    }
  })
  const lastGov = [...rows].reverse().find((r) => r.govCases > 0)
  const lastPriv = [...rows].reverse().find((r) => r.privCases > 0)
  const peakGov = rows.reduce((a, b) => (b.govPersons > a.govPersons ? b : a))
  const peakPriv = rows.reduce((a, b) => (b.privCases > a.privCases ? b : a))
  const zeroFrom = lastGov.year + 1
  const asOfDate = new Date(EX_ASOF)
  const zeroMonths = (asOfDate.getFullYear() - zeroFrom) * 12 + (asOfDate.getMonth() + 1)
  const sumRange = (f, a, b) => rows.filter((r) => r.year >= a && r.year <= b).reduce((s, r) => s + r[f], 0)

  push({
    id: 'exchange-terminus',
    title: '교류는 줄어든 게 아니라 끊겼다',
    question: '이산가족 남북 교류는 언제, 어떻게 끝났는가?',
    verdict: '성립',
    method: '통일부 「이산가족 교류현황」 공표 원문의 연도별 실적을 당국차원(생사확인·서신·방남·방북·화상 5유형 합)과 민간차원(생사확인·서신교환·기타·재회 4유형 합)으로 각각 합산. 가공·보간 없음. 마지막 비(非)0 연도와 이후 연속 0 구간을 실측.',
    n: rows.length,
    findings: [
      F('당국차원 마지막 실적', `${lastGov.year}년 ${lastGov.govCases.toLocaleString()}건 · ${lastGov.govPersons.toLocaleString()}명`, '제21차 이산가족 상봉행사(2018-08-20~26, 금강산)가 포함된 해다'),
      F('그 뒤 연속 0', `${zeroFrom}년~${EX_ASOF} (${zeroMonths}개월)`, '당국차원 5유형 전부 0건 0명. 자료가 없어서가 아니라 공표 원문이 0으로 채워져 있다'),
      F('당국차원 정점', `${peakGov.year}년 ${peakGov.govPersons.toLocaleString()}명`, `마지막 해(${lastGov.year}년)는 정점의 ${pct(lastGov.govPersons, peakGov.govPersons)}%`),
      F('민간차원 정점', `${peakPriv.year}년 ${peakPriv.privCases.toLocaleString()}건`, '민간은 당국보다 7년 먼저 정점을 찍었다'),
      F('민간차원 최근', `${lastPriv.year}년 ${lastPriv.privCases}건`, `정점의 ${r2((lastPriv.privCases / peakPriv.privCases) * 100)}%`),
      F('당국 누계 대조', `2000~2018년 ${sumRange('govPersons', 2000, 2018).toLocaleString()}명 → 2019~2026년 ${sumRange('govPersons', 2019, 2026).toLocaleString()}명`),
      F('민간 누계 대조', `2000~2018년 ${sumRange('privCases', 2000, 2018).toLocaleString()}건 → 2019~2026년 ${sumRange('privCases', 2019, 2026).toLocaleString()}건`),
    ],
    series: [
      { key: 'govPersons', label: '당국차원 교류 인원(명)', unit: '명', points: rows.map((r) => XY(r.year, r.govPersons)) },
      { key: 'privCases', label: '민간차원 교류 건수(건)', unit: '건', points: rows.map((r) => XY(r.year, r.privCases)) },
    ],
    caveats: [
      '연도 축은 1985년과 1990~2026년이다. 1986~1989년 행은 원문에 없다(실적 없음이 아니라 미공표) — 계열에 0을 채워 넣지 않았다.',
      `2026년은 ${isan.exchange.byYear.at(-1).label} 시점의 부분 연도다.`,
      '당국차원은 건/명 둘 다, 민간차원은 생사확인·서신교환·기타가 건만 공표됩니다. 그래서 두 계열을 같은 축에 겹치지 않았다.',
      '"0"은 자료 없음이 아니라 실적 없음이다 — 원문이 공란인 해를 0으로 처리했다는 통일부 주석을 그대로 따랐다.',
    ],
    asOf: EX_ASOF,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 2 — 마지막 상봉 이후 사망자
   ══════════════════════════════════════════════════════════════════════════ */
{
  const decOf = (r) => (r.deceased ? r.deceased.남자 + r.deceased.여자 : null)
  const base = monthly.find((r) => r.month === '2018-08-31')
  const csvEnd = M1
  const d0 = decOf(base), d1 = decOf(csvEnd)
  const monthsCsv = 84   // 2018-08-31 → 2025-08-31
  const dHwp = isan.latest.overview.cumulative.deceased
  const monthsHwp = 93   // 2018-08-31 → 2026-05-31
  const survDrop = base.total - csvEnd.total

  push({
    id: 'deaths-since-last-reunion',
    title: '마지막 상봉 이후 2만 5천 분이 세상을 떠나셨다',
    question: '당국차원 교류가 끊긴 뒤 등록 이산가족은 몇 명이나 사망했나?',
    verdict: '성립',
    method: '월별 등록현황의 사망자 누계 증분. 제21차 상봉행사가 있던 2018년 8월 말을 기준선으로 잡고, ①파일데이터 한 출처(2025-08-31 기준)와 ②게시판 공표까지 이은 값(2026-05-31 기준)을 나란히 낸다.',
    n: monthsHwp,
    findings: [
      F('파일데이터 한 출처', `${(d1 - d0).toLocaleString()}명`, `2018-08-31 → ${CSV_ASOF}, ${monthsCsv}개월. 월평균 ${Math.round((d1 - d0) / monthsCsv).toLocaleString()}명`),
      F('게시판 공표까지 이은 값', `${(dHwp - d0).toLocaleString()}명`, `2018-08-31 → ${HWP_ASOF}, ${monthsHwp}개월. 월평균 ${Math.round((dHwp - d0) / monthsHwp).toLocaleString()}명`),
      F('같은 기간 당국차원 교류', '0명', `${CN('exchange-terminus')} 카드 참조`),
      F('생존자 감소', `${base.total.toLocaleString()}명 → ${csvEnd.total.toLocaleString()}명 (${survDrop.toLocaleString()}명, ${r1((survDrop / base.total) * 100)}%)`, '감소분 < 사망자인 이유는 같은 기간 신규 등록 유입이 있기 때문'),
    ],
    series: [
      { key: 'deceasedCum', label: '사망자 누계(명)', unit: '명', points: monthly.filter((r) => r.deceased && r.month >= '2018-08-31').map((r) => XY(r.month, decOf(r))) },
      { key: 'survivors', label: '생존자(명)', unit: '명', points: monthly.filter((r) => r.month >= '2018-08-31').map((r) => XY(r.month, r.total)) },
    ],
    caveats: [
      `두 번째 값은 출처가 다른 두 공표를 잇는다 — 공공데이터포털 파일데이터(${CSV_ASOF})와 이산가족정보통합시스템 게시판 공표(${HWP_ASOF}). 같은 통계지만 갱신 주기가 달라 직접 대조할 수 없다.`,
      '사망자 누계는 신고·확인 시점 기준이다. 실제 사망일과 다를 수 있다.',
      `2018-04월에 사망자 1,164명(월 중앙값의 4.3배)이 한꺼번에 잡힌다 — 행정 일괄정리로 추정된다(${CN('series-breaks')} 카드). 다만 그 달은 기준선(2018-08) 이전이라 이 카드 수치에는 들어가지 않는다.`,
    ],
    asOf: HWP_ASOF,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 3·4 — 고향별 교차표 (기록 밀도 / 두 개의 고향 지도)
   ══════════════════════════════════════════════════════════════════════════ */
const oldTable = OLD_AXIS.map((o) => {
  /* venueOnly 제외는 **미수복강원(강원도) 행에만** 적용한다.
     금강산·장전항·갈마는 강원 지명이라 "강원도 사료"로 잡히지만 실은 상봉 장소다.
     반면 다른 행(예: 평안남도)에 걸린 근거는 '평양'이라는 지명 자체이지 상봉 장소가 아니므로
     같은 플래그로 빼면 엉뚱한 것을 빼게 된다. */
  const venueApplies = o.modern.includes('강원도')
  const ids = new Set(), idsNoVenue = new Set()
  for (const rec of museum.records) {
    const hit = (rec.regions || []).some((x) => o.modern.includes(x)) || (rec.regionsHistoric || []).some((x) => o.historic.includes(x))
    if (!hit) continue
    ids.add(rec.iId)
    if (!(venueApplies && isVenueOnly(rec))) idsNoVenue.add(rec.iId)
  }
  const g = (f) => o.modern.reduce((s, k) => s + (f(region.regions[k]) || 0), 0)
  const events = g((r) => r.events?.total)
  const briefings = g((r) => r.briefings)
  const trends = g((r) => r.trends)
  const overviews = g((r) => r.overviews)
  const defector = g((r) => r.defectorOrigin?.total)
  const survivors = M1.origin[o.originKey]
  const museumAll = ids.size, museumHome = idsNoVenue.size
  /* 이산가족정보통합시스템 신규 수집분 — 「나의 살던 고향은」 사진 + 영상편지(고향 선언문 확정분).
     포함 근거와 제외한 10개 코너의 사유는 reunion-region.json 의 judgement 표에 있다. */
  const gallery = reunionGallery(o.id), vletter = reunionVletter(o.id)
  const reunionNew = gallery + vletter
  /* 식별 사료 — "그 고향임이 확인되는 기록". 사료(상봉장소만 걸린 건 제외)에
     새로 확정된 고향 사진·영상편지를 더한다. 둘 다 지명 근거가 원문에 있는 건만이다. */
  const identHome = museumHome + reunionNew
  const recordsAll = events + briefings + trends + overviews + museumHome + reunionNew
  const recordsNarrow = events + briefings + museumHome + reunionNew   // 동향(북한 내부매체 채록) 제외한 보수 집계
  /* 신규 수집분을 넣기 전 값 — before/after 를 화면과 문서가 같은 계보로 말할 수 있게 남긴다 */
  const recordsAllPrev = events + briefings + trends + overviews + museumHome
  return {
    id: o.id, name: o.name, originKey: o.originKey, modern: o.modern,
    survivors, defector, events, briefings, trends, overviews,
    museumAll, museumHome, gallery, vletter, reunionNew, identHome,
    recordsAll, recordsNarrow, recordsAllPrev,
    densityAll: recordsAll / survivors, densityNarrow: recordsNarrow / survivors,
    densityAllPrev: recordsAllPrev / survivors,
  }
})
const TOT = (f) => oldTable.reduce((s, r) => s + r[f], 0)

/* ══ 기록 계승 우선순위 — 「어디부터 남겨야 하는가」 ══════════════════
   분석이 판단으로 넘어가는 자리. 세 축을 순위로 바꿔 더한다(동일 가중):
     ① 남은 분이 줄어드는 속도 — 지난 98개월 그 고향 원적 생존자가 얼마나 빨리 줄었나
     ② 기록 공백 — 생존자 1인당 남은 공식 기록이 얼마나 적은가
     ③ 식별 공백 — 그 고향임을 확인할 수 있는 사료가 얼마나 적은가
   점수의 절대값은 쓰지 않는다. 순서만 쓴다. */
{
  const withRate = oldTable.map((r) => {
    const v0 = M0.origin[r.originKey], v1 = M1.origin[r.originKey]
    const dropPct = v0 ? (1 - v1 / v0) * 100 : null           // 실측 감소율(%)
    const homePerSurv = r.survivors ? r.identHome / r.survivors : null
    /* 신규 수집분을 넣기 전 식별 공백 — 순위가 새 자료 때문에 뒤집혔는지 검산용 */
    const homePerSurvPrev = r.survivors ? r.museumHome / r.survivors : null
    return { ...r, v0, v1, dropPct, homePerSurv, homePerSurvPrev }
  })

  const usable = withRate.filter((r) => r.dropPct != null && r.survivors > 0)
  /* 순위화 — 값이 클수록 급한 축은 내림차순, 작을수록 급한 축은 오름차순 */
  const rankBy = (arr, f, asc) => {
    const sorted = [...arr].sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a)))
    const m = new Map()
    sorted.forEach((r, i) => m.set(r.id, i + 1))
    return m
  }
  const rSpeed = rankBy(usable, (r) => r.dropPct, false)        // 빨리 줄수록 1위
  const rGap = rankBy(usable, (r) => r.densityAll, true)        // 기록 적을수록 1위
  const rIdent = rankBy(usable, (r) => r.homePerSurv, true)     // 식별 사료 적을수록 1위

  const scored = usable.map((r) => {
    const a = rSpeed.get(r.id), b = rGap.get(r.id), c = rIdent.get(r.id)
    return { ...r, rSpeed: a, rGap: b, rIdent: c, rankSum: a + b + c }
  }).sort((x, y) => x.rankSum - y.rankSum || y.survivors - x.survivors)

  /* 축을 하나씩 빼도 1위가 유지되는가 — 결과가 한 축에 업혀 있으면 그렇다고 적는다 */
  const topWithout = (drop) => {
    const alt = [...usable].map((r) => {
      const parts = { s: rSpeed.get(r.id), g: rGap.get(r.id), i: rIdent.get(r.id) }
      delete parts[drop]
      return { id: r.id, name: r.name, sum: Object.values(parts).reduce((x, y) => x + y, 0) }
    }).sort((x, y) => x.sum - y.sum)
    return alt[0]
  }
  const t1 = scored[0], t2 = scored[1], last = scored.at(-1)
  const woS = topWithout('s'), woG = topWithout('g'), woI = topWithout('i')
  const stable = [woS.name, woG.name, woI.name].filter((n) => n === t1.name).length

  /* ★ 새 자료가 순위를 뒤집었는가 — 옛 분자(신규 수집분 제외)로 같은 계산을 한 번 더 돌린다.
     같은 1순위가 나오면 "새 자료를 넣어서 결론이 바뀐 게 아니다"를 근거로 말할 수 있고,
     달라지면 그 사실을 숨기지 않고 적는다. */
  const rGapPrev = rankBy(usable, (r) => r.densityAllPrev, true)
  const rIdentPrev = rankBy(usable, (r) => r.homePerSurvPrev, true)
  const scoredPrev = usable.map((r) => ({
    id: r.id, name: r.name,
    rankSum: rSpeed.get(r.id) + rGapPrev.get(r.id) + rIdentPrev.get(r.id),
    survivors: r.survivors,
  })).sort((x, y) => x.rankSum - y.rankSum || y.survivors - x.survivors)
  const prevTop = scoredPrev[0]
  const orderChanged = scored.map((r) => r.name).join('>') !== scoredPrev.map((r) => r.name).join('>')

  push({
    id: 'legacy-priority',
    title: '어디부터 남겨야 하는가 — 남은 분이 빠르게 줄고 기록도 적은 고향',
    question: '고향 7종 가운데, 지금 기록을 우선 확보해야 할 곳은 어디인가?',
    verdict: '성립',
    method: `세 축을 각각 순위로 바꿔 동일 가중으로 더했다(합이 작을수록 급함). ① 남은 분이 줄어드는 속도 = 월별 원적 생존자 ${M0.month}→${CSV_ASOF} 감소율(실측) ② 기록 공백 = 생존자 1인당 공식 기록(${CN('record-density-gap')} 카드와 같은 집계) ③ 식별 공백 = 생존자 1인당 그 고향임이 확인되는 기록(사료 중 상봉장소만 걸린 건 제외 + 이산가족정보통합시스템 신규 수집분). 점수의 절대값은 쓰지 않고 순서만 쓴다.`,
    n: scored.length,
    findings: [
      F('1순위', `${t1.name}`, `생존 ${r1(t1.dropPct)}% 감소 · 기록 ${r3(t1.densityAll)}건/인 · 식별기록 ${r3(t1.homePerSurv)}건/인 (순위합 ${t1.rankSum})`),
      F('2순위', `${t2.name}`, `생존 ${r1(t2.dropPct)}% · 기록 ${r3(t2.densityAll)}건/인 (순위합 ${t2.rankSum})`),
      F('가장 여유 있는 곳', `${last.name}`, `기록 ${r3(last.densityAll)}건/인 (순위합 ${last.rankSum}) — 여유가 있다는 뜻이지 충분하다는 뜻이 아니다`),
      F('축을 빼도 1위가 유지되는가', `${stable}/3 축`, `감소 축 제외 시 ${woS.name} · 기록 축 제외 시 ${woG.name} · 식별 축 제외 시 ${woI.name}`),
      F('신규 수집분을 빼면 1순위가 바뀌는가', orderChanged ? `순서가 바뀐다(옛 1순위 ${prevTop.name})` : `바뀌지 않는다 — 옛 분자로도 1순위는 ${prevTop.name}`,
        reunion
          ? `이산가족정보통합시스템 신규 수집분 ${reunion.numeratorDelta.distinctRecordsAdded.toLocaleString()}건(축별 합 ${reunion.numeratorDelta.totalAdded.toLocaleString()})을 빼고 같은 계산을 다시 돌린 결과다. 이전 순서: ${scoredPrev.map((r) => r.name).join(' > ')}`
          : '신규 수집분 판정 결과가 없어 이전 분자와 같은 값이다',
        ),
      F('표본', `${scored.length}개 고향`, '고향 7개를 줄 세운 것이므로 이 순서는 정렬을 돕는 것이지 점수가 아니다'),
    ],
    series: [
      {
        key: 'priority', label: '순위합(작을수록 우선)',
        rows: scored.map((r) => ({ x: r.name, y: r.rankSum })),
      },
      {
        key: 'drop', label: `원적 생존자 감소율 % (${M0.month}→${CSV_ASOF})`,
        rows: scored.map((r) => ({ x: r.name, y: r1(r.dropPct) })),
      },
      {
        key: 'density', label: '생존자 1인당 공식 기록(건)',
        rows: scored.map((r) => ({ x: r.name, y: r3(r.densityAll) })),
      },
    ],
    caveats: [
      '고향 7개뿐이라 순위합은 정렬을 돕는 값이다. 점수로 읽을 수 있는 수치가 아니다.',
      '세 축을 동일 가중으로 두었다 — 정책적으로 어느 축이 더 급한지는 이 데이터가 답할 수 없다.',
      '감소 축은 원적이 확인된 생존자만의 값이다. 「기타」(남한 출생 등)는 고향 축이 없어 빠진다.',
      `기록 밀도의 분자에는 북한정보포털 동향과 북한개황이 들어간다 — 이산가족 기록이 아니라 그 지역에 관한 기록이다. 동향·개황을 뺀 보수 집계로도 가장 많은 곳과 가장 적은 곳이 그대로라는 것은 ${CN('record-density-gap')} 카드에서 확인했다.`,
    ...(reunion ? [
      `식별 축에 이산가족정보통합시스템 신규 수집분이 들어간다(사진 ${reunion.htgallery.mapped}건 · 영상편지 ${reunion.vletter.mapped}건). 영상편지는 자막이 있는 건에 쏠린 표본이라 이 축의 값은 "확인 가능한 기록"이지 "존재하는 기록"이 아니다.`,
    ] : []),
    ],
    asOf: CSV_ASOF,
  })
}

{
  const byDens = [...oldTable].sort((a, b) => b.densityAll - a.densityAll)
  const top = byDens[0], bot = byDens.at(-1)
  const byDensN = [...oldTable].sort((a, b) => b.densityNarrow - a.densityNarrow)
  /* 「보수 집계로도 순위가 바뀌지 않는다」를 문장으로 단언하지 않는다 — 실제로 두 순서를
     비교해서 참일 때만 그렇게 쓴다. (실측: 전체 집계와 보수 집계는 2·3위가 뒤바뀐다) */
  const narrowOrderSame =
    [...oldTable].sort((a, b) => b.densityAll - a.densityAll).map((r) => r.name).join('>') ===
    byDensN.map((r) => r.name).join('>')
  const survSorted = [...oldTable].sort((a, b) => b.survivors - a.survivors)
  const most = survSorted[0]
  /* 신규 수집분을 넣기 전 값 — 대표 수치가 얼마에서 얼마로 움직였는지를 카드가 스스로 말한다.
     이 값을 카드 밖에서 손으로 옮겨 적으면 반드시 어긋난다(옛 값이 남는 것이 이 프로젝트의 결함 유형). */
  const byDensPrev = [...oldTable].sort((a, b) => b.densityAllPrev - a.densityAllPrev)
  const topPrev = byDensPrev[0], botPrev = byDensPrev.at(-1)
  const gapPrev = topPrev.densityAllPrev / botPrev.densityAllPrev
  const gapNow = top.densityAll / bot.densityAll
  const addedTotal = oldTable.reduce((s, r) => s + r.reunionNew, 0)

  /* ══ as-of 를 **축별로** 낸다 — 이 카드의 나눗셈은 기준일이 하나가 아니다 ══════════
     분모(생존자)는 2025-08-31 한 날짜인데, 분자는 계열이 여섯이고 날짜가 전부 다르다.
     예전에는 카드에 스칼라 asOf 하나(=분모의 날짜)만 달아, 화면의 안내인이 신규 수집분이
     섞인 밀도 값에 「2025년 8월 기준」을 붙여 말했고 검증기가 그것을 통과시켰다(실측 결함).
     그래서 축을 갈라 적고, 화면 계층(nk-guide.mjs)은 이 구조를 읽어 밀도 문장에 단일
     기준일을 붙이지 못하게 한다. 스칼라 asOf 는 **분모의 날짜**로 남긴다(다른 카드와 같은 자리). */
  const regionSrc = (name) => (region.sources ?? []).find((x) => (x.name ?? '').includes(name)) ?? {}
  const idxSrc = regionSrc('남북관계연표')
  const trendSrc = regionSrc('북한정보포털 동향')
  const ovSrc = regionSrc('북한개황')
  const densityAsOfAxes = {
    axis: '이 카드의 수치는 분모·분자의 기준일이 다르다. 한 문장에 하나의 「기준」을 붙이면 안 된다.',
    denominator: {
      lane: '이산가족 원적 생존자(월별 등록현황 파일데이터)',
      asOf: CSV_ASOF,
      kind: '자료 기준일',
    },
    numerator: [
      { lane: '남북관계연표', asOf: idxSrc.builtAt ?? null, kind: '인덱스 빌드일' },
      { lane: '통일부 보도자료', asOf: idxSrc.builtAt ?? null, kind: '인덱스 빌드일' },
      { lane: '북한정보포털 동향', asOf: trendSrc.coverageEnd ?? trendSrc.asOf ?? null, kind: '확인 하한' },
      { lane: '북한개황', asOf: ovSrc.asOf ?? null, kind: '확인 하한' },
      { lane: '남북이산가족 디지털박물관 사료', asOf: museum.builtAt, kind: '수집일' },
      ...(reunion ? [
        { lane: '이산가족정보통합시스템 「나의 살던 고향은」', asOf: reunion.collectedAt.htgallery, kind: '수집일' },
        { lane: '이산가족정보통합시스템 영상편지', asOf: reunion.collectedAt.vletter, kind: '수집일' },
      ] : []),
    ],
    /* 두 날짜를 함께 적는다 — 지역 인덱스(연표·보도자료·동향·개황)를 집계한 날과
       이산가족정보통합시스템 신규 수집분을 분자에 반영한 날이 다르다. 한쪽만 적으면
       제출 문서가 어느 날짜를 베낄지 갈린다(실제로 갈렸다). */
    aggregation: reunion
      ? `지역 인덱스 집계 ${region.builtAt} · 신규 수집분 반영 ${reunion.builtAt.slice(0, 10)}`
      : '집계 실행일 ' + region.builtAt,
    note: `분모는 ${CSV_ASOF} 기준이고 분자는 계열마다 기준일이 다르다 — 이 값에는 단일 기준일이 없다.`,
  }

  push({
    id: 'record-density-gap',
    title: '가장 많은 사람이 그리는 고향에, 가장 적은 기록이 남았다',
    question: '고향(구행정구역 7종)마다 생존자 1인당 남은 공식 기록은 얼마나 다른가?',
    verdict: '성립',
    method: `이산가족 원적 공표축 7종에 현행 13지역·구도명 태그를 붙여(구행정구역 대응표) 지역별 기록을 합산: 남북관계연표 사건 + 통일부 보도자료 + 북한정보포털 동향 + 북한개황 문서 + 디지털박물관 사료(상봉장소만 걸린 건 제외)${reunion ? ` + 이산가족정보통합시스템 신규 수집분(「나의 살던 고향은」 사진 ${reunion.htgallery.mapped}건 · 영상편지 자막에서 고향이 확정된 ${reunion.vletter.mapped}건)` : ''}. 생존자는 ${CSV_ASOF} 월별 원적 공표값. 나눗셈 한 번 — 추정·보간·가중 없음.${reunion ? ' 신규 수집분은 중복·지역 귀속 판정을 통과한 것만 넣었다.' : ''}`,
    n: oldTable.length,
    findings: [
      F('밀도 최상위', `${top.name} ${r3(top.densityAll)}건/인`, `기록 ${top.recordsAll.toLocaleString()}건 ÷ 생존자 ${top.survivors.toLocaleString()}명`),
      F('밀도 최하위', `${bot.name} ${r3(bot.densityAll)}건/인`, `기록 ${bot.recordsAll.toLocaleString()}건 ÷ 생존자 ${bot.survivors.toLocaleString()}명`),
      F('격차', `${r1(gapNow)}배`, `동향·개황을 뺀 보수 집계(연표·보도자료·사료·신규 수집분만)로도 ${r1(byDensN[0].densityNarrow / byDensN.at(-1).densityNarrow)}배다 — ${narrowOrderSame ? '순서도 그대로다' : `가장 많은 곳(${byDensN[0].name})과 가장 적은 곳(${byDensN.at(-1).name})은 그대로이고, 중간 순서는 바뀐다`}`),
      ...(reunion ? [
        F('신규 수집분 반영 전후', `${r1(gapPrev)}배 → ${r1(gapNow)}배`,
          `이산가족정보통합시스템에서 ${reunion.numeratorDelta.distinctRecordsAdded.toLocaleString()}건(축별 합 ${addedTotal.toLocaleString()})을 분자에 더한 결과다. 최상위 ${topPrev.name} ${r3(topPrev.densityAllPrev)}→${r3(top.densityAll)} · 최하위 ${botPrev.name} ${r3(botPrev.densityAllPrev)}→${r3(bot.densityAll)}. 나머지 10개 코너는 중복이거나 지역 귀속이 없어 넣지 않았다`),
      ] : []),
      F('원적 1위 지역의 몫', `${most.name} 생존자 ${most.survivors.toLocaleString()}명 (원적 확인분의 ${pct(most.survivors, TOT('survivors'))}%)`, `그런데 남북관계연표 사건은 ${most.events}건(7지역 ${TOT('events').toLocaleString()}건 중 ${pct(most.events, TOT('events'))}%), 통일부 보도자료는 ${most.briefings}건(${TOT('briefings')}건 중 ${pct(most.briefings, TOT('briefings'))}%)`),
      F('반대 극단', `미수복경기(개성) 생존자 ${oldTable.find((r) => r.id === 'gyeonggi-unrec').survivors.toLocaleString()}명 (${pct(oldTable.find((r) => r.id === 'gyeonggi-unrec').survivors, TOT('survivors'))}%)`, `연표 ${oldTable.find((r) => r.id === 'gyeonggi-unrec').events}건(${pct(oldTable.find((r) => r.id === 'gyeonggi-unrec').events, TOT('events'))}%) · 보도자료 ${oldTable.find((r) => r.id === 'gyeonggi-unrec').briefings}건(${pct(oldTable.find((r) => r.id === 'gyeonggi-unrec').briefings, TOT('briefings'))}%)`),
    ],
    series: [
      { key: 'density', label: '생존자 1인당 기록(건)', unit: '건/인', points: byDens.map((r) => XY(r.name, r3(r.densityAll))) },
      { key: 'survivors', label: '생존 이산가족(명)', unit: '명', points: byDens.map((r) => XY(r.name, r.survivors)) },
      { key: 'records', label: '기록 총계(건)', unit: '건', points: byDens.map((r) => XY(r.name, r.recordsAll)) },
    ],
    table: oldTable.map((r) => ({
      고향: r.name, 생존자: r.survivors, 생존자비중: pct(r.survivors, TOT('survivors')),
      연표: r.events, 보도자료: r.briefings, 동향: r.trends, 개황: r.overviews,
      사료: r.museumHome, 사료전체: r.museumAll,
      고향사진: r.gallery, 영상편지: r.vletter,
      기록계: r.recordsAll, 기록계_신규반영전: r.recordsAllPrev,
      밀도: r3(r.densityAll), 밀도_신규반영전: r3(r.densityAllPrev),
      탈북민출신: r.defector,
    })),
    /* limitIndex — 「이 카드의 결정적 한계는 이것」을 가리킨다.
       예전에는 caveat 앞에 ★ 를 붙여 표시했는데 그 글자가 화면에 그대로 나갔다.
       표시는 렌더되지 않는 이 필드로 옮긴다(nk-summary.mjs 가 읽는다). */
    limitIndex: 9,
    caveats: [
      '기록이 많은 지역은 "고향이라서"가 아니라 "남북 사건의 무대라서" 많다 — 평양(수도)·개성(공단)·금강산(관광지구이자 상봉장). 이 카드는 그 비대칭 자체를 보여주는 것이지, 어느 지역이 더 중요하다는 뜻이 아니다.',
      '구행정구역과 현행 행정구역의 경계가 정확히 일치하지는 않는다. 이 대응은 근사다.',
      '사료의 구도명 태그 「함경도(구)」 59건은 남·북 어느 쪽인지 원문으로 판정할 수 없어 함경남도(구)·함경북도(구) 양쪽에 걸었다 — 두 행의 사료 수를 더하면 중복된다.',
      `강원도 사료 ${oldTable.find((r) => r.id === 'gangwon-unrec').museumAll}건 중 ${oldTable.find((r) => r.id === 'gangwon-unrec').museumAll - oldTable.find((r) => r.id === 'gangwon-unrec').museumHome}건은 근거 지명이 금강산·장전항·갈마뿐이다(상봉 장소). 미수복강원 행에서만 뺐다 — 다른 행의 근거는 지명 자체이지 상봉 장소가 아니다.`,
      `생존자 축은 원적이 확인된 ${TOT('survivors').toLocaleString()}명뿐이다 — 전체 생존자 ${M1.total.toLocaleString()}명의 ${pct(TOT('survivors'), M1.total)}%. 나머지는 「기타(남한 출생 등)」다.`,
      '지역 귀속은 지역명·도시명 부분일치다. 이름이 같은 남측 지명이 섞이는 것을 줄였으나 완전하지는 않다.',
      ...(reunion ? [
        `신규 수집분에서 분자에 넣은 것은 두 코너뿐이다 — 「나의 살던 고향은」과 영상편지. 나머지 10개 코너는 기존 사료와 중복이거나(시간여행·손편지·컬렉션·기록관·통합검색) 지역 귀속이 없다(상봉사진·웹툰·연표·기증현황·박물관 소개).`,
        /* ★ 분모를 두 개 다 밝힌다 — 사이트가 표시한 총계(탭 배지 합)와 화면에 실제로 그려진 수는 다르다.
             하나만 적으면 미수집분이 커버리지 계산에서 사라진다(절대규칙 4: 총건수는 사이트 표시값을 근거로). */
        `「나의 살던 고향은」은 사이트 표시 총계 ${reunion.htgallery.siteBadgeTotal}건(지역 탭 배지 합) 가운데 화면에 실제로 그려진 ${reunion.htgallery.collected}건을 수집했고(나머지 ${reunion.htgallery.siteBadgeTotal - reunion.htgallery.collected}건은 목록 배지에는 잡히나 사진이 실제로 뜨지 않는 자리다), 그중 ${reunion.htgallery.mapped}건(${reunion.htgallery.mappingRate}%)에 고향 축을 붙였다. 사이트 표시 총계를 분모로 두면 ${pct(reunion.htgallery.mapped, reunion.htgallery.siteBadgeTotal)}% 다.`,
        `영상편지는 사이트 표시 총계 ${reunion.vletter.siteBadgeTotal.toLocaleString()}건 가운데 ${reunion.vletter.collected.toLocaleString()}건을 수집했고, 그중 ${reunion.vletter.mapped}건(수집분의 ${reunion.vletter.mappingRateOfAll}%)에 고향 축을 붙였다.`,
        `영상편지의 고향은 자막 글에서만 확인된다. 자막이 있는 것이 ${reunion.vletter.withCaption.toLocaleString()}건(${pct(reunion.vletter.withCaption, reunion.vletter.collected)}%)이고, 그중 고향을 밝힌 문장으로 도가 확정되는 것만 셌다(${reunion.vletter.mappingRateOfCaptioned}%). 이 분포는 영상편지 전체의 고향 분포가 아니다 — 자막이 있는지 여부가 지역과 무관하다는 보장이 없다.`,
        `신규 수집분의 수집일은 ${reunion.collectedAt.htgallery}(사진)·${reunion.collectedAt.vletter}(영상편지)이고, 생존자 축의 기준일 ${CSV_ASOF} 과 다른 날짜다. 분자와 분모의 기준일이 어긋나 있다는 뜻이며, 이 나눗셈은 "지금 확인되는 기록 대 ${CSV_ASOF} 생존자"로만 읽어야 한다.`,
        '사진·영상편지는 통일부가 게시했으나 저작권자가 통일부가 아닌 것이 많다(제공처: 미디어한국학·평화문제연구소·영남통일교육센터·국가기록원 등). 그래서 화면의 사진마다 제공처와 원문 자리를 함께 적는다.',
      ] : []),
      densityAsOfAxes.note,
    ],
    /* 스칼라 asOf 는 **분모의 기준일**이다. 밀도 자체에는 단일 기준일이 없다 — asOfAxes 를 볼 것. */
    asOf: CSV_ASOF,
    asOfAxes: densityAsOfAxes,
  })
}

{
  const surv = oldTable.map((r) => r.survivors)
  const def = oldTable.map((r) => r.defector)
  const rho = spearman(surv, def)
  const p = spearmanExactP(surv, def)
  const totS = TOT('survivors'), totD = TOT('defector')
  const byS = [...oldTable].sort((a, b) => b.survivors - a.survivors)
  const byD = [...oldTable].sort((a, b) => b.defector - a.defector)
  const maxGap = oldTable
    .map((r) => ({ ...r, gap: Math.abs(pct(r.survivors, totS) - pct(r.defector, totD)) }))
    .sort((a, b) => b.gap - a.gap)

  push({
    id: 'two-homeland-maps',
    title: '고향을 그리는 사람과, 고향에서 온 사람은 다른 지도 위에 있다',
    question: '이산가족의 원적 분포와 북한이탈주민의 재북 출신지 분포는 겹치는가?',
    verdict: '성립',
    method: `같은 7개 구행정구역 축 위에 두 분포를 올려 비중(%)으로 비교. 이산가족은 월별 등록현황 원적(${CSV_ASOF}), 탈북민은 재북 출신지역별 현황 누계(1998-01-01~${region.meta.defectorOriginEtc.asOf}). 순위 상관은 참고로만 계산하고 정확검정 p 를 같이 낸다.`,
    n: oldTable.length,
    findings: [
      F('이산가족 1위', `${byS[0].name} ${byS[0].survivors.toLocaleString()}명 (${pct(byS[0].survivors, totS)}%)`, `같은 지역 탈북민 비중은 ${pct(byS[0].defector, totD)}%`),
      F('탈북민 1위', `${byD[0].name} ${byD[0].defector.toLocaleString()}명 (${pct(byD[0].defector, totD)}%)`, `같은 지역 이산가족 비중은 ${pct(byD[0].survivors, totS)}%`),
      F('최대 괴리', `${maxGap[0].name} — 이산 ${pct(maxGap[0].survivors, totS)}% 대 탈북 ${pct(maxGap[0].defector, totD)}%`, `${r1(maxGap[0].gap)}%p 차`),
      F('두 번째 괴리', `${maxGap[1].name} — 이산 ${pct(maxGap[1].survivors, totS)}% 대 탈북 ${pct(maxGap[1].defector, totD)}%`, `${r1(maxGap[1].gap)}%p 차`),
      KEY(F('순위 상관', `순위 상관 ${r3(rho)} · 우연일 확률 ${r3(p)} · 표본 7개 고향`, '고향이 7개뿐이라 상관이 있는지 없는지 판정할 수 없다. 위의 비중 격차만 확정된 사실이다')),
    ],
    series: [
      { key: 'isanShare', label: '이산가족 원적 비중(%)', unit: '%', points: byS.map((r) => XY(r.name, pct(r.survivors, totS))) },
      { key: 'defectorShare', label: '탈북민 재북 출신지 비중(%)', unit: '%', points: byS.map((r) => XY(r.name, pct(r.defector, totD))) },
    ],
    /* limitIndex — 「이 카드의 결정적 한계는 이것」을 가리킨다.
       예전에는 caveat 앞에 ★ 를 붙여 표시했는데 그 글자가 화면에 그대로 나갔다.
       표시는 렌더되지 않는 이 필드로 옮긴다(nk-summary.mjs 가 읽는다). */
    limitIndex: 4,
    caveats: [
      `두 계열의 기준일이 다르다 — 이산가족 ${CSV_ASOF}, 탈북민 ${region.meta.defectorOriginEtc.asOf}(그 이후 갱신 확인 안 됨).`,
      `탈북민 축에는 「${region.meta.defectorOriginEtc.axisLabel}」 ${region.meta.defectorOriginEtc.total.toLocaleString()}명이 별도로 있고 이 표에서 제외했다.`,
      '이산가족 원적은 광복 당시 구행정구역, 탈북민 출신지는 현행 행정구역이다. 같은 축에 올리려면 근사 대응이 필요하고, 그 오차가 비중에 섞여 있다.',
      '두 집단은 이산 시점(1945~53)과 탈북 시점(1998~2020)이 45년 이상 떨어져 있다. "같은 고향"이라 해도 같은 사회를 겪지 않았다.',
      '두 분포가 다르다는 사실까지다. 왜 다른지는 이 자료가 답하지 않는다.',
    ],
    asOf: CSV_ASOF,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 5 — 사료 생산 시기
   ══════════════════════════════════════════════════════════════════════════ */
{
  const total = museum.records.length
  const nullOn = museum.records.filter((r) => !r.producedOn).length
  const years = []
  let unparsable = 0
  for (const r of museum.records) {
    if (!r.producedOn) continue
    const y = producedYear(r.producedOn)
    if (y === null) { unparsable++; continue }
    years.push(y)
  }
  const dated = years.length
  const hist = {}
  for (const y of years) hist[y] = (hist[y] || 0) + 1
  const bucket = (a, b) => years.filter((y) => y >= a && y <= b).length
  const buckets = [
    { label: '1945년 이전(분단 전)', from: 1900, to: 1945 },
    { label: '1946~1953(이산 발생기)', from: 1946, to: 1953 },
    { label: '1954~1984(단절기)', from: 1954, to: 1984 },
    { label: '1985~1999(고향방문단~적십자 교류)', from: 1985, to: 1999 },
    { label: '2000~2018(정례 상봉기)', from: 2000, to: 2018 },
    { label: '2019년 이후', from: 2019, to: 2100 },
  ].map((b) => ({ ...b, n: bucket(b.from, b.to), pct: pct(bucket(b.from, b.to), dated), pctS: pctS(bucket(b.from, b.to), dated) }))
  const ys = Object.keys(hist).map(Number).sort((a, b) => a - b)

  push({
    id: 'museum-production-era',
    title: '이산의 기록은 이산 때가 아니라 상봉 때 만들어졌다',
    question: '디지털박물관 사료는 언제 만들어진 것들인가?',
    verdict: '성립',
    method: `사료 전량 ${total.toLocaleString()}건의 생산연도에서 4자리 연도를 뽑아 도수분포를 낸다. 표기가 '1991' '1991.09' '1991.06.27' '0000.00.00' 로 섞여 있어 연도만 추출하고, 뽑히지 않는 건은 따로 센다.`,
    n: dated,
    findings: [
      F('생산연도 판독', `${dated.toLocaleString()}건 / ${total.toLocaleString()}건 (${pct(dated, total)}%)`, `무기입 ${nullOn.toLocaleString()}건, 연도 미상 표기('0000.00.00' 등) ${unparsable}건`),
      ...buckets.map((b) => F(b.label, `${b.n.toLocaleString()}건 (${b.pctS})`)),
      F('연도 범위', `${ys[0]}~${ys.at(-1)}`, `${ys.length}개 연도`),
      KEY(F('2019년 이후', '0건', '상봉이 끊긴 뒤 생산연도가 확인되는 사료가 한 건도 없다')),
    ],
    series: [
      { key: 'producedByYear', label: '사료 생산연도 분포(건)', unit: '건', points: ys.map((y) => XY(y, hist[y])) },
      { key: 'byEra', label: '시대 구간별(건)', unit: '건', points: buckets.map((b) => XY(b.label, b.n)) },
    ],
    caveats: [
      '생산연도는 사료 자체가 만들어진 해다 — 박물관에 등록된 해가 아니다. 그래도 두 시점이 뒤섞였을 가능성을 배제할 수 없다(원문에 등록일 필드가 따로 없다).',
      '"2019년 이후 0건"은 수집이 그 시점에 멈췄기 때문일 수도 있다. 상봉 중단의 결과라고 단정하지 않는다.',
      `생산연도가 없는 ${(nullOn + unparsable).toLocaleString()}건(${pct(nullOn + unparsable, total)}%)이 이 분포에 빠져 있다. 그 결측이 특정 시대에 몰려 있다면 분포가 기울 수 있다.`,
      '박물관 소장 사료는 기증분이다. 남아 있는 기록이 아니라 기증된 기록의 분포다.',
    ],
    asOf: museum.builtAt,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 6 — 늙지 못하는 집단
   ══════════════════════════════════════════════════════════════════════════ */
{
  const spanYears = (new Date(M1.month) - new Date(M0.month)) / (365.2425 * 864e5)
  const ageRise = M1.avgAge - M0.avgAge
  const janJumps = []
  const otherDeltas = []
  for (let i = 1; i < monthly.length; i++) {
    const d = monthly[i].avgAge - monthly[i - 1].avgAge
    if (monthly[i].month.slice(5, 7) === '01') janJumps.push({ month: monthly[i].month, d: r2(d) })
    else otherDeltas.push(d)
  }
  const janMean = mean(janJumps.map((x) => x.d))
  const otherMean = mean(otherDeltas)

  push({
    id: 'aging-deficit',
    title: '여덟 해가 지났는데 평균 나이는 2.25세만 올랐다',
    question: '평균 나이가 흐른 시간만큼 오르지 않는 것은 무엇을 뜻하는가?',
    verdict: '성립',
    method: `월별 공표 평균연령(연나이 — 1월 1일에 전원 +1)의 실측 계단. ${monthly.length}개월 전 구간에서 1월 증분과 나머지 달 증분을 분리해 평균낸다. 닫힌 코호트라면 1월에 정확히 +1.0, 나머지 달은 0 이어야 한다.`,
    n: monthly.length,
    findings: [
      F('평균연령', `${M0.avgAge}세 → ${M1.avgAge}세`, `${M0.month} → ${M1.month}, ${r2(spanYears)}년 동안 +${r2(ageRise)}세`),
      F('흐른 시간 대비', `${pct(ageRise, spanYears)}%`, '흐른 시간의 4분의 1만큼만 평균이 올랐다. 가장 연로하신 분들이 그사이 세상을 떠나셨기 때문이다'),
      F('1월 계단', `평균 +${r2(janMean)}세`, `연나이는 1월 1일에 모두 한 살을 먹으므로 +1.00 이어야 한다. ${r2(1 - janMean)}세가 모자란 것은 그 한 달 사이에도 돌아가신 분들이 있었기 때문이다 (해가 바뀐 지점 ${janJumps.length}번)`),
      F('나머지 11개월', `평균 ${r2(otherMean)}세/월`, `해마다 ${r2(otherMean * 11)}세만큼 평균이 낮아진다. 연로하신 분부터 돌아가시는 만큼, 남아 계신 분들의 평균 나이가 내려간다 (관측한 달 ${otherDeltas.length}개)`),
      F('같은 기간 생존자', `${M0.total.toLocaleString()}명 → ${M1.total.toLocaleString()}명`, `${r1((M1.total / M0.total - 1) * 100)}%`),
    ],
    series: [
      { key: 'avgAge', label: '평균연령(세)', unit: '세', points: monthly.map((r) => XY(r.month, r.avgAge)) },
      { key: 'survivors', label: '생존자(명)', unit: '명', points: monthly.map((r) => XY(r.month, r.total)) },
    ],
    caveats: [
      '공표 연령은 만나이가 아니라 연나이다(생잔 추계에서 이미 실측으로 확인한 사실을 이 카드가 재현한다).',
      '신규 등록 유입도 평균을 낮추는 쪽으로 작용합니다(최근 24개월 월 중앙값 +10명 수준). 두 요인을 분리하지 않았습니다.',
      '평균연령은 소수 둘째 자리로 공표된다. 월 증분이 0.01 단위 반올림에 걸릴 수 있다.',
    ],
    asOf: CSV_ASOF,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 7 — 원적을 아는 사람이 사라진다
   ══════════════════════════════════════════════════════════════════════════ */
{
  const originSum = (r) => Object.values(r.origin).reduce((a, b) => a + b, 0)
  const s0 = originSum(M0), s1 = originSum(M1)
  const e0 = M0.total - s0, e1 = M1.total - s1
  const shares = monthly.map((r) => ({ m: r.month, share: pct(originSum(r), r.total), raw: (originSum(r) / r.total) * 100 }))
  const upticks = []
  for (let i = 1; i < shares.length; i++) if (shares[i].raw > shares[i - 1].raw + 1e-9) upticks.push({ month: shares[i].m, delta: r3(shares[i].raw - shares[i - 1].raw) })

  push({
    id: 'origin-known-erosion',
    title: '「고향이 어디인지 아는 사람」이 절반으로 줄었다',
    question: '북측 원적이 확인되는 생존 이산가족은 얼마나 남았는가?',
    verdict: '성립',
    method: `월별 등록현황의 원적 7종 합계 ÷ 총 생존자. 원문 주석이 "출신지 7종 합 < 총원(남한 출생 등 미포함)"이라고 밝힌 구조를 그대로 이용한다. ${monthly.length}개월 전 구간.`,
    n: monthly.length,
    findings: [
      F('원적 확인 생존자', `${s0.toLocaleString()}명 → ${s1.toLocaleString()}명`, `${r1((s1 / s0 - 1) * 100)}%`),
      F('「기타(남한 출생 등)」', `${e0.toLocaleString()}명 → ${e1.toLocaleString()}명`, `${r1((e1 / e0 - 1) * 100)}% — 원적 확인분보다 훨씬 천천히 준다`),
      F('원적 확인 비중', `${pct(s0, M0.total)}% → ${pct(s1, M1.total)}%`, `${r1(pct(s1, M1.total) - pct(s0, M0.total))}%p`),
      F('추세 형태', `${monthly.length - 1 - upticks.length}/${monthly.length - 1}개월 단조 하락`, upticks.length === 0 ? '월별 흔들림 없이 한 방향으로만 움직인다' : `예외는 ${upticks.map((u) => `${u.month}(+${u.delta}%p)`).join(', ')} — ${CN('series-breaks')} 카드가 잡아낸 원적 재분류 달과 정확히 같다`),
      F('의미', '「고향 페이지」가 다룰 수 있는 사람', `이제 생존자의 ${pct(s1, M1.total)}%뿐이다. 지역별 서비스의 모수 자체가 반으로 줄었다`),
    ],
    series: [
      { key: 'originKnownShare', label: '원적 확인 비중(%)', unit: '%', points: shares.map((x) => XY(x.m, x.share)) },
      { key: 'originKnown', label: '원적 확인 생존자(명)', unit: '명', points: monthly.map((r) => XY(r.month, originSum(r))) },
      { key: 'etc', label: '기타(남한 출생 등, 명)', unit: '명', points: monthly.map((r) => XY(r.month, r.total - originSum(r))) },
    ],
    caveats: [
      '「기타」의 내부 구성은 공표되지 않는다. 남한 출생 신청자가 젊어 사망률이 낮기 때문으로 보이지만 데이터로 확인할 수 없다.',
      `원적 축은 2018-10과 2022-03에 재분류를 겪었다(${CN('series-breaks')} 카드). 합계 비중 자체는 그 영향을 거의 받지 않으나(재분류가 축 내부 이동), 개별 지역 시계열은 그 두 지점에서 끊어 읽어야 한다.`,
      `${HWP_ASOF} 게시판 공표에서는 원적 축에 「기타」가 명시적으로 ${isan.latest.survivors.byOrigin.entries.find((e) => e.label === '기타')?.n.toLocaleString()}명(${isan.latest.survivors.byOrigin.entries.find((e) => e.label === '기타')?.pct}%)으로 실려 있다 — 파일데이터의 잔차와 같은 구조다.`,
    ],
    asOf: CSV_ASOF,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 8 — 구조적 단절 감사 (데이터 품질)
   ══════════════════════════════════════════════════════════════════════════ */
const breaks = []
{
  const scanAxis = (getter, axis) => {
    const keys = Object.keys(getter(M0))
    for (const k of keys) {
      const deltas = []
      for (let i = 1; i < monthly.length; i++) deltas.push({ month: monthly[i].month, v: getter(monthly[i])[k] - getter(monthly[i - 1])[k] })
      const med = median(deltas.map((d) => Math.abs(d.v)))
      if (!med) continue
      for (const d of deltas) if (Math.abs(d.v) > 6 * med) breaks.push({ axis, key: k, month: d.month, delta: d.v, monthlyMedianAbs: med, ratio: r1(Math.abs(d.v) / med) })
    }
  }
  scanAxis((r) => r.relation, '관계')
  scanAxis((r) => r.origin, '원적')
  scanAxis((r) => ({ 남자: r.male, 여자: r.female, 총계: r.total }), '성별·총계')

  const decRows = monthly.filter((r) => r.deceased)
  const decDeltas = []
  for (let i = 1; i < decRows.length; i++) decDeltas.push({ month: decRows[i].month, v: (decRows[i].deceased.남자 + decRows[i].deceased.여자) - (decRows[i - 1].deceased.남자 + decRows[i - 1].deceased.여자) })
  const decMed = median(decDeltas.map((d) => d.v))
  for (const d of decDeltas) if (d.v > 2.5 * decMed || d.v < 0) breaks.push({ axis: '사망자 누계', key: '월 증분', month: d.month, delta: d.v, monthlyMedianAbs: decMed, ratio: r1(d.v / decMed) })

  breaks.sort((a, b) => a.month.localeCompare(b.month) || a.axis.localeCompare(b.axis))
  const months = [...new Set(breaks.map((b) => b.month))]

  push({
    id: 'series-breaks',
    title: '98개월 안에 숨은 단절 — 이 수치들은 이어 붙이면 안 된다',
    question: '월별 등록현황 시계열에 연속으로 읽으면 안 되는 지점이 있는가?',
    verdict: '성립',
    method: `축별(관계 3종·원적 7종·성별·총계·사망자 누계)로 월 증분을 만들고, 그 축의 |증분| 중앙값의 6배(사망자 누계는 2.5배 또는 음수)를 넘는 달을 단절 후보로 뽑는다. 문턱은 사전 고정 — 결과를 보고 조정하지 않았다.`,
    n: monthly.length,
    findings: [
      F('단절 후보', `${months.length}개월`, `${monthly.length}개월 계열(월 전이 ${monthly.length - 1}회)에서 축×달 이상치 총 ${breaks.length}건`),
      ...months.map((m) => {
        const g = breaks.filter((b) => b.month === m)
        return F(m, g.map((b) => `${b.key} ${b.delta > 0 ? '+' : ''}${b.delta.toLocaleString()}`).join(' · '), `축 중앙값 대비 최대 ${Math.max(...g.map((b) => b.ratio))}배`)
      }),
      KEY(F('2018-10 해석', '관계·원적 동시 재분류', '부모·미수복강원이 줄고 형제자매·3촌이상·미수복경기가 늘었다. 총계 변화는 평월 수준이라 사망이 아니라 분류 이동이다')),
      KEY(F('2018-04 해석', '사망자 일괄 반영 추정', '한 달 사망 증분이 중앙값의 4배를 넘는다. 실제 사망이 그 달에 몰린 게 아니라 신고·정리가 몰린 것으로 본다')),
    ],
    series: [
      { key: 'deathsMonthly', label: '월별 사망 증분(명)', unit: '명', points: decDeltas.map((d) => XY(d.month, d.v)) },
      { key: 'relationParent', label: '부모(부부/부모/자녀) 생존자(명)', unit: '명', points: monthly.map((r) => XY(r.month, r.relation['부모'])) },
      { key: 'originHwanghae', label: '황해 원적 생존자(명)', unit: '명', points: monthly.map((r) => XY(r.month, r.origin['황해'])) },
      { key: 'originGyeonggi', label: '미수복경기 원적 생존자(명)', unit: '명', points: monthly.map((r) => XY(r.month, r.origin['미수복경기'])) },
    ],
    table: breaks,
    caveats: [
      '"재분류"는 해석이다. 통일부가 그렇게 공표한 것이 아니라, 총계는 평월인데 분류만 크게 움직였다는 관측에서 추론한 것이다.',
      '문턱(6배·2.5배)은 임의값이다. 낮추면 후보가 늘고 높이면 준다 — 표에 |증분|/중앙값 비율을 그대로 실어 두었으니 다시 판단할 수 있다.',
      '2017-07·08 두 달은 원문 사망자 열이 공란이라 사망 증분 계산에서 빠진다.',
    ],
    asOf: CSV_ASOF,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 9 — 관계 구성의 이동 (단절 이후 창만 사용)
   ══════════════════════════════════════════════════════════════════════════ */
{
  const breakMonth = '2018-10-31'
  const start = monthly.find((r) => r.month === '2018-11-30')
  const end = M1
  const keys = ['부모', '형제자매', '3촌이상']
  const rows = keys.map((k) => ({
    key: k,
    from: start.relation[k], to: end.relation[k],
    change: r1((end.relation[k] / start.relation[k] - 1) * 100),
    shareFrom: pct(start.relation[k], start.total), shareTo: pct(end.relation[k], end.total),
  }))
  const slowest = [...rows].sort((a, b) => b.change - a.change)[0]

  push({
    id: 'relation-shift',
    title: '직접 헤어진 가족이 줄고, 조카·사촌 등 3촌 이상의 비중이 커진다',
    question: '생존 이산가족의 관계 구성은 어떻게 바뀌고 있는가?',
    verdict: '성립',
    method: `관계 3종(부모=부부/부모/자녀 · 형제자매 · 3촌이상)의 감소율 비교. ${breakMonth} 재분류(${CN('series-breaks')} 카드) 때문에 전 구간을 이어 읽을 수 없어 재분류 다음 달(${start.month})부터 ${end.month}까지 82개월만 쓴다.`,
    n: monthly.filter((r) => r.month >= start.month).length,
    findings: [
      ...rows.map((r) => F(r.key === '부모' ? '부부/부모/자녀' : r.key, `${r.from.toLocaleString()}명 → ${r.to.toLocaleString()}명 (${r.change}%)`, `비중 ${r.shareFrom.toFixed(1)}% → ${r.shareTo.toFixed(1)}%`)),
      F('총계', `${start.total.toLocaleString()}명 → ${end.total.toLocaleString()}명`, `${r1((end.total / start.total - 1) * 100)}%`),
      KEY(F('가장 천천히 주는 관계', slowest.key === '3촌이상' ? '3촌 이상' : slowest.key, `${slowest.change}% — 다른 두 관계 평균(${r1(mean(rows.filter((r) => r.key !== slowest.key).map((r) => r.change)))}%)의 ${pct(Math.abs(slowest.change), Math.abs(mean(rows.filter((r) => r.key !== slowest.key).map((r) => r.change))))}% 속도`)),
      F('구성 이동', `3촌이상 비중 ${rows.find((r) => r.key === '3촌이상').shareFrom.toFixed(1)}% → ${rows.find((r) => r.key === '3촌이상').shareTo.toFixed(1)}%`, '헤어짐을 직접 겪으신 분이 줄면서, 조카·사촌처럼 이야기를 전해 들은 친족의 몫이 커진다'),
    ],
    series: keys.map((k) => ({
      key: `rel_${k}`,
      label: (k === '부모' ? '부부/부모/자녀' : k) + ' 생존자(명)',
      unit: '명',
      points: monthly.filter((r) => r.month >= start.month).map((r) => XY(r.month, r.relation[k])),
    })).concat([{
      key: 'rel3share', label: '3촌이상 비중(%)', unit: '%',
      points: monthly.filter((r) => r.month >= start.month).map((r) => XY(r.month, pct(r.relation['3촌이상'], r.total))),
    }]),
    caveats: [
      `${breakMonth} 이전 구간을 잘라냈다. 전 구간(2017-07~)으로 계산하면 3촌이상 감소율이 재분류 유입 때문에 더 완만하게(과대) 보인다.`,
      '신규 등록자가 3촌이상에 몰릴 가능성이 있다(전 구간 신규 유입 추정 3,257명). 그렇다면 3촌이상의 완만한 감소는 낮은 사망률이 아니라 유입 때문일 수 있다 — 관계별 유입은 공표되지 않아 분리할 수 없다.',
      '관계 이름은 파일데이터(부모/형제자매/3촌이상)와 게시판 공표(부부·부모·자녀/형제·자매/3촌이상)가 다르게 적는다. 같은 3분류로 보고 이었다.',
    ],
    asOf: CSV_ASOF,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 10 — 통일부는 계속 말하는데, 실적은 0 (코퍼스 필요)
   카드 15 — 동향 시계열 가능성 (코퍼스 필요)
   ══════════════════════════════════════════════════════════════════════════ */
let corpusMeta = null
if (exists(corpusPath)) {
  const corpus = readJSON(corpusPath)
  corpusMeta = { builtAt: corpus.builtAt, records: corpus.records.length, datasets: Object.keys(corpus.datasets).length }
  const dsMeta = corpus.datasets
  const brRecs = corpus.records.filter((r) => r.datasetId === 'briefing' && r.occurredOn)
  const tlRecs = corpus.records.filter((r) => r.datasetId === 'timeline' && r.occurredOn)
  const talkRecs = corpus.records.filter((r) => r.datasetId === 'talks' && r.occurredOn)
  const trendRecs = corpus.records.filter((r) => r.datasetId === 'nkinfoTrend')

  /* ── 카드 10 ───────────────────────────────────────────────────────────── */
  {
    const RE = /이산가족/
    const byYear = {}, isanByYear = {}
    for (const r of brRecs) {
      const y = +r.occurredOn.slice(0, 4)
      byYear[y] = (byYear[y] || 0) + 1
      if (RE.test((r.title || '') + (r.body || ''))) isanByYear[y] = (isanByYear[y] || 0) + 1
    }
    const covEnd = dsMeta.briefing.coverageEnd
    const lastFull = +covEnd.slice(0, 4) - 1     // 보도자료는 covEnd 연도가 부분 연도다
    const ys = Object.keys(byYear).map(Number).filter((y) => y <= lastFull).sort((a, b) => a - b)
    const A = ys.filter((y) => y <= 2018), B = ys.filter((y) => y >= 2019)
    const cnt = (y) => isanByYear[y] || 0
    const meanA = mean(A.map(cnt)), meanB = mean(B.map(cnt))
    const shareA = mean(A.map((y) => (cnt(y) / byYear[y]) * 100)), shareB = mean(B.map((y) => (cnt(y) / byYear[y]) * 100))
    /* 같은 기간 당국차원 실적 */
    const ex = isan.exchange.byYear
    const govP = (a, b) => ex.filter((y) => y.year >= a && y.year <= b).reduce((s, y) => s + y.gov.lifeCheck.persons + y.gov.letters.persons + y.gov.visitSouth.persons + y.gov.visitNorth.persons + y.gov.video.persons, 0)

    push({
      id: 'words-vs-deeds',
      title: '교류가 멈춘 뒤에도 이산가족은 정책 의제에서 밀려나지 않았다',
      question: '당국차원 교류가 멈춘 뒤, 정부 발표에서 이산가족을 다루는 빈도도 함께 줄었는가?',
      verdict: '성립',
      method: `통일부 보도자료·보도설명자료 ${brRecs.length.toLocaleString()}건의 제목+본문에서 '이산가족' 문자열을 세어 연도별 건수와 그해 보도자료 대비 비중을 낸다. 같은 연도 축에 이산가족 교류현황의 당국차원 인원을 나란히 놓는다. 부분 연도(${covEnd} 까지만 수집된 ${covEnd.slice(0, 4)}년)는 제외.`,
      n: A.length + B.length,
      findings: [
        F('교류 있던 시기(2010~2018)', `연평균 ${r1(meanA)}건 언급`, `보도자료 대비 평균 ${r1(shareA)}%`),
        F(`교류 끊긴 시기(2019~${lastFull})`, `연평균 ${r1(meanB)}건 언급`, `보도자료 대비 평균 ${r1(shareB)}% — 교류가 멈춘 뒤에도 다루는 건수는 ${meanB >= meanA ? '줄지 않았다' : '줄었다'}`),
        F('같은 기간 당국차원 교류 인원', `${govP(2010, 2018).toLocaleString()}명 → ${govP(2019, lastFull).toLocaleString()}명`, '다루는 빈도는 유지됐지만 성사된 교류는 없다. 교류는 상대가 있어야 성립하므로, 이 0은 남측 노력의 성적표가 아니다'),
        F('언급 최다 연도', (() => { const t = ys.reduce((a, b) => (cnt(b) > cnt(a) ? b : a)); return `${t}년 ${cnt(t)}건` })(), (() => {
          const post = ys.filter((y) => y >= 2019)
          if (!post.length) return '비교 구간 전체 기준'
          const t2 = post.reduce((a, b) => (cnt(b) > cnt(a) ? b : a))
          return `교류가 멈춘 뒤 구간에서는 ${t2}년 ${cnt(t2)}건이 가장 많다`
        })()),
      ],
      series: [
        { key: 'briefingIsan', label: "보도자료 중 '이산가족' 언급(건)", unit: '건', points: ys.map((y) => XY(y, cnt(y))) },
        { key: 'briefingIsanShare', label: '보도자료 대비 비중(%)', unit: '%', points: ys.map((y) => XY(y, r1((cnt(y) / byYear[y]) * 100))) },
        { key: 'govPersons', label: '당국차원 교류 인원(명)', unit: '명', points: ys.map((y) => XY(y, govP(y, y))) },
      ],
    /* limitIndex — 「이 카드의 결정적 한계는 이것」을 가리킨다.
       예전에는 caveat 앞에 ★ 를 붙여 표시했는데 그 글자가 화면에 그대로 나갔다.
       표시는 렌더되지 않는 이 필드로 옮긴다(nk-summary.mjs 가 읽는다). */
      limitIndex: 4,
      caveats: [
        `보도자료는 ${dsMeta.briefing.coverageStart}~${covEnd} 분이 수집돼 있고, 그 뒤는 확인되지 않았다. 2010년 이전은 자료 자체가 없어 비교 구간을 2010년부터로 잡았다.`,
        `${covEnd.slice(0, 4)}년은 ${covEnd} 까지만 수집돼 부분 연도라 계열에서 뺐다.`,
        "본문에 「이산가족」이라고 적힌 것을 찾은 결과다. 다른 표현(「흩어진 가족」 등)은 잡히지 않고, 관련 없는 맥락의 언급도 함께 잡힌다.",
        '연도별 보도자료 총량이 89~370건으로 흔들린다. 그래서 건수와 비중을 함께 냈다.',
        '이 카드는 정부를 평가하지 않는다. 교류 성사는 남측만으로 결정되지 않으므로 발표 빈도와 교류 실적은 성과로 견줄 수 있는 짝이 아니다 — 두 계열이 갈라졌다는 사실까지다.',
      ],
      asOf: covEnd,
    })
  }

  /* ── 카드: 남북회담 인도분야 — 데이터셋이 2018에서 멈춰 판정 불가 ─────── */
  {
    const byYearField = {}
    for (const r of talkRecs) {
      const m = /분야:\s*([^·]+)/.exec(r.body || '')
      const f = m ? m[1].trim() : '(미상)'
      const y = +r.occurredOn.slice(0, 4)
      ;(byYearField[y] = byYearField[y] || {})[f] = (byYearField[y][f] || 0) + 1
    }
    const ys = Object.keys(byYearField).map(Number).sort((a, b) => a - b)
    const humanitarian = ys.map((y) => XY(y, byYearField[y]['인도'] || 0))
    const totalH = humanitarian.reduce((s, p) => s + p.y, 0)
    const ds = dsMeta.talks

    push({
      id: 'talks-humanitarian',
      title: '남북회담 「인도」 분야 — 이 계열은 2018년에서 끊긴 자료다',
      question: '이산가족을 다루는 남북회담(인도 분야)은 언제까지 열렸는가?',
      verdict: '불가',
      rejectWhy: `남북회담 자료는 ${ds.coverageEnd} 까지만 수록돼 있다. 2019년 이후 "회담이 없었다"인지 "자료가 갱신되지 않았다"인지 이 자료만으로 구분할 수 없다 — 「모른다」를 「없다」로 읽으면 안 된다.`,
      method: `남북회담 정보 ${talkRecs.length}건의 본문에서 분야 표기를 읽어 연도×분야 교차표를 만들었다. 계산 자체는 성립하나, 자료의 끝이 현실의 끝인지 판정할 근거가 없어 '불가'로 둔다.`,
      n: talkRecs.length,
      findings: [
        F('인도 분야 회담', `${totalH}건`, `${ys[0]}~${ys.at(-1)}`),
        KEY(F('자료의 끝', `${ds.coverageEnd}`, '그 이후는 「없다」가 아니라 「모른다」다')),
        F('마지막 기록', `${humanitarian.filter((p) => p.y > 0).at(-1).x}년 ${humanitarian.filter((p) => p.y > 0).at(-1).y}건`),
        F('참고', '실적 기준의 종말은 교류현황으로 판정했다', `${CN('exchange-terminus')} 카드는 2026-05 까지 갱신되는 자료라 0을 단정할 수 있다`),
      ],
      series: [{ key: 'talksHumanitarian', label: '남북회담 인도 분야(건)', unit: '건', points: humanitarian }],
      caveats: [
        '분야 표기는 별도 항목이 아니라 본문 문장에서 되읽은 값이다.',
        '1978~1983년 등 회담이 0인 해는 원문에 행 자체가 없다 — 계열에 0을 채우지 않았다.',
      ],
      asOf: ds.coverageEnd,
    })
  }

  /* ── 카드: 동향 시계열 — 날짜 커버리지 부족 ────────────────────────────── */
  {
    let joined = 0, coverageYears = new Set()
    if (exists(trendDatesPath)) {
      const td = readJSON(trendDatesPath).dates
      for (const r of trendRecs) {
        const m = /nkinfo\.trend\.(\d+)/.exec(r.factKey || '')
        if (!m) continue
        const d = td[m[1]]
        if (!d) continue
        joined++
        coverageYears.add(d.slice(0, 4))
      }
    }
    const ys = [...coverageYears].sort()
    push({
      id: 'trend-timeseries',
      title: '동향 42,788건의 시계열 — 재료가 없다',
      question: '북한정보포털 동향을 연도별 시계열로 쓸 수 있는가?',
      verdict: '불가',
      rejectWhy: `동향 레코드 ${trendRecs.length.toLocaleString()}건 중 발생일이 붙는 것은 ${joined.toLocaleString()}건(${pct(joined, trendRecs.length)}%)뿐이고, 그마저 ${ys[0]}~${ys.at(-1)} 에만 몰려 있다. 나머지 66%가 어느 해 것인지 모르는 상태로 만든 연도별 곡선은 자료가 아니라 그림이다.`,
      method: `북한정보포털 동향 ${trendRecs.length.toLocaleString()}건에 날짜가 붙어 있는지를 실측.`,
      n: trendRecs.length,
      findings: [
        F('동향 레코드', `${trendRecs.length.toLocaleString()}건`),
        F('발생일이 확인된 건', `${joined.toLocaleString()}건 (${pct(joined, trendRecs.length)}%)`),
        F('커버 연도', ys.length ? `${ys[0]}~${ys.at(-1)} (${ys.length}개 연도)` : '없음', '2016년 이후 동향에는 날짜가 없다'),
        F('판정', '시계열 불가', `지역별 총량(${CN('record-density-gap')} 카드)에만 쓴다 — 그건 날짜가 필요 없다`),
      ],
      series: [],
      caveats: ['날짜를 못 붙인 건이 특정 시기에 몰려 있다면, 붙은 것만으로 만든 분포도 편향된다.'],
      asOf: dsMeta.nkinfoTrend.asOf,
    })
  }
} else {
  for (const [id, title] of [['words-vs-deeds', '교류가 멈춘 뒤에도 이산가족은 정책 의제에서 밀려나지 않았다'], ['talks-humanitarian', '남북회담 「인도」 분야'], ['trend-timeseries', '동향 시계열']]) {
    push({
      id, title, question: '(자료가 적재되지 않음)', verdict: '불가',
      rejectWhy: '통일부 코퍼스가 적재돼 있지 않아 계산하지 못했다.',
      method: '-', n: 0, findings: [F('상태', '입력 없음')], series: [], caveats: [], asOf: null,
    })
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 11 — 사망의 계절성 (약함)
   ══════════════════════════════════════════════════════════════════════════ */
{
  const decRows = monthly.filter((r) => r.deceased)
  const rec = []
  for (let i = 1; i < decRows.length; i++) {
    const a = decRows[i - 1], b = decRows[i]
    rec.push({ month: b.month, y: +b.month.slice(0, 4), m: +b.month.slice(5, 7), deaths: (b.deceased.남자 + b.deceased.여자) - (a.deceased.남자 + a.deceased.여자), start: a.total })
  }
  const byY = {}
  for (const r of rec) (byY[r.y] = byY[r.y] || []).push(r)
  const fullYears = Object.keys(byY).map(Number).filter((y) => byY[y].length === 12).sort((a, b) => a - b)
  const W = [12, 1, 2], S = [6, 7, 8]
  const perYear = fullYears.map((y) => {
    const a = byY[y]
    const wr = mean(a.filter((r) => W.includes(r.m)).map((r) => r.deaths / r.start))
    const sr = mean(a.filter((r) => S.includes(r.m)).map((r) => r.deaths / r.start))
    return { y, winter: wr, summer: sr, ratio: wr / sr }
  })
  const wins = perYear.filter((x) => x.ratio > 1).length
  const p = signTestExact(wins, perYear.length)
  /* 월별 지수 — 그해 평균 대비 */
  const idx = {}
  for (const y of fullYears) {
    const a = byY[y], mn = mean(a.map((r) => r.deaths / r.start))
    for (const r of a) (idx[r.m] = idx[r.m] || []).push((r.deaths / r.start) / mn)
  }
  const monthIndex = []
  for (let m = 1; m <= 12; m++) monthIndex.push({ m, median: r3(median(idx[m])) })
  const lo = [...monthIndex].sort((a, b) => a.median - b.median)

  push({
    id: 'death-seasonality',
    title: '겨울 달에 사망 기록이 더 많이 남았다 — 다만 표본이 7년뿐이다',
    question: '등록 이산가족의 사망 기록은 계절에 따라 다르게 남는가?',
    verdict: '약함',
    method: `월별 사망 증분을 그 달 시작 생존자로 나눠 월 사망률을 만들고, 완전 역년 ${fullYears.length}개(${fullYears[0]}~${fullYears.at(-1)})에 대해 겨울(12·1·2월) 평균과 여름(6·7·8월) 평균을 짝지어 비교했다. 우연으로 이만큼 갈릴 확률은 부호검정으로 계산했다(표본 ${perYear.length}개 연도).`,
    n: perYear.length,
    findings: [
      F('겨울 > 여름', `${wins}개 연도 / ${perYear.length}개 연도`, `우연으로 이만큼 갈릴 확률 ${r3(p)} — 통상 기준인 0.05 를 넘지 못한다`),
      F('평균 비율', `${r2(mean(perYear.map((x) => x.ratio)))}배`, '겨울 사망률이 여름보다 그만큼 높다'),
      F('가장 낮은 달', `${lo[0].m}월 (지수 ${lo[0].median})`, '그해 평균을 1.0 으로 놓은 값'),
      F('두 번째로 낮은 달', `${lo[1].m}월 (지수 ${lo[1].median})`),
      KEY(F('판정', '약함', '방향은 7년 중 6년이 같지만 표본 7년으로는 우연을 배제할 수 없다. 게다가 이 수치가 가리키는 달은 사망한 달이 아니라 신고·정리가 반영된 달일 수 있다')),
    ],
    series: [
      { key: 'monthIndex', label: '월별 사망률 지수(그해 평균=1.0)', unit: '지수', points: monthIndex.map((x) => XY(x.m, x.median)) },
      { key: 'winter', label: '겨울(12·1·2월) 월 사망률(%)', unit: '%', points: perYear.map((x) => XY(x.y, r3(x.winter * 100))) },
      { key: 'summer', label: '여름(6·7·8월) 월 사망률(%)', unit: '%', points: perYear.map((x) => XY(x.y, r3(x.summer * 100))) },
    ],
    /* limitIndex — 「이 카드의 결정적 한계는 이것」을 가리킨다.
       예전에는 caveat 앞에 ★ 를 붙여 표시했는데 그 글자가 화면에 그대로 나갔다.
       표시는 렌더되지 않는 이 필드로 옮긴다(nk-summary.mjs 가 읽는다). */
    limitIndex: 0,
    caveats: [
      '가장 큰 한계다 — 이 자료의 달은 사망 신고·확인이 반영된 달이지 사망한 달이 아니다. 계절 차이가 사망의 것인지 행정의 것인지 구분할 수 없다.',
      '2018-04에 사망 1,164명이 한꺼번에 잡힌다(중앙값의 4.3배). 그 달을 뺀 계산은 하지 않았고, 대신 평균이 아니라 중앙값 지수를 썼다.',
      `완전 역년이 ${fullYears.length}개뿐이다. 표본이 늘기 전까지 이 카드는 근거가 되지 못한다.`,
    ],
    asOf: CSV_ASOF,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 12 — 사료 생산 × 상봉 연도 (약함)
   ══════════════════════════════════════════════════════════════════════════ */
{
  /* 상봉 회차: 연표에서 실제 사건 행을 찾아 확정한다(하드코딩한 날짜는 검증용 키일 뿐) */
  const ROUND_DATES = ['2000-08-15', '2000-11-30', '2001-02-26', '2002-04-28', '2002-09-13', '2003-02-20', '2003-06-27', '2003-09-20', '2004-04-01', '2004-07-11', '2005-08-26', '2005-11-05', '2006-03-20', '2006-06-19', '2007-05-09', '2007-10-17', '2009-09-26', '2010-10-30', '2014-02-20', '2015-10-20', '2018-08-20']
  const rounds = ROUND_DATES.map((d) => {
    const hit = isan.chronology.find((c) => c.date === d && /상봉|방문단/.test(c.event))
    if (!hit) throw new Error(`상봉 회차 검증 실패 — 연표에 ${d} 행이 없다`)
    return { date: d, event: hit.event }
  })
  const reunionYears = new Set(rounds.map((r) => +r.date.slice(0, 4)))
  const hist = {}
  for (const r of museum.records) { const y = producedYear(r.producedOn); if (y) hist[y] = (hist[y] || 0) + 1 }
  const span = []
  for (let y = 2000; y <= 2018; y++) span.push(y)
  const a = span.filter((y) => reunionYears.has(y)).map((y) => hist[y] || 0)
  const b = span.filter((y) => !reunionYears.has(y)).map((y) => hist[y] || 0)
  const mw = mannWhitneyExact(a, b)

  push({
    id: 'museum-reunion-sync',
    title: '사료는 상봉이 있던 해에 더 많이 만들어졌는가 — 경계선상',
    question: '사료 생산연도가 상봉 행사가 열린 해에 몰리는가?',
    verdict: '약함',
    method: `연표에서 상봉 회차 ${rounds.length}건의 날짜를 확인해 상봉 연도 집합을 만들고, 2000~2018년 ${span.length}개 연도를 상봉 있음(${a.length})/없음(${b.length})으로 나눠 사료 생산 건수를 맨-휘트니 정확검정으로 비교(순열 ${mw.permutations.toLocaleString()}가지 전수).`,
    n: span.length,
    findings: [
      F('상봉 있던 해', `중앙값 ${median(a)}건 (평균 ${r1(mean(a))}건, ${a.length}개 연도)`),
      F('상봉 없던 해', `중앙값 ${median(b)}건 (평균 ${r1(mean(b))}건, ${b.length}개 연도)`),
      F('비율', `${r1(median(a) / median(b))}배`),
      F('우연일 확률', `${r3(mw.pTwoSided)} (양쪽 방향을 다 볼 때)`, `한쪽 방향만 보면 ${r3(mw.pOneSided)}다. 양쪽으로 보면 통상 기준인 0.05 를 넘지 못한다`),
      KEY(F('반례', `2018년 ${hist[2018] || 0}건`, '제21차 상봉이 있던 해인데 생산 사료가 가장 적다 — 최근 사료일수록 아직 기증·등록되지 않았을 수 있다')),
    ],
    series: [
      { key: 'museumByYear', label: '사료 생산 건수(건)', unit: '건', points: span.map((y) => XY(y, hist[y] || 0)) },
      { key: 'reunionFlag', label: '그 해 상봉 있음(1)/없음(0)', unit: '0/1', points: span.map((y) => XY(y, reunionYears.has(y) ? 1 : 0)) },
    ],
    table: rounds,
    caveats: [
      '상봉 후기·상봉 때 받은 편지가 사료의 상당수라 두 계열이 부분적으로 같은 사건을 재는 셈이다 — 독립 검정으로 보기 어렵다.',
      '연도 표본이 19개뿐이고 상봉 없는 해는 6개다. 한 해만 바뀌어도 p 가 크게 움직인다.',
      '박물관 수집 사업 자체가 특정 시기에 집중됐다면(예: 2005·2015 기념사업) 그 효과와 분리할 수 없다.',
    ],
    asOf: museum.builtAt,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 13 — 통일의식 × 생존자 (약함)
   ══════════════════════════════════════════════════════════════════════════ */
{
  const survByYear = {}
  for (const r of monthly) if (r.month.endsWith('-08-31')) survByYear[+r.month.slice(0, 4)] = r.total
  const need = {}
  for (const r of opinion.reports) need[r.year] = r.need
  const ys = Object.keys(survByYear).map(Number).filter((y) => need[y] != null).sort((a, b) => a - b)
  const x = ys.map((y) => survByYear[y]), y2 = ys.map((y) => need[y])
  const rLevel = pearson(x, y2)
  const dx = [], dy = []
  for (let i = 1; i < x.length; i++) { dx.push(x[i] - x[i - 1]); dy.push(y2[i] - y2[i - 1]) }
  const rDiff = pearson(dx, dy)
  const agree = dx.filter((v, i) => Math.sign(v) === Math.sign(dy[i])).length
  const u1 = opinion.series.find((s) => s.key === 'Uni01' && s.group.menu === 1)
  const ext = u1.extended, needRow = ext.rows.find((r) => r.label === '필요하다')

  push({
    id: 'opinion-vs-survivors',
    title: '통일 필요성과 생존자 수는 같은 기간 함께 내려갔다 — 그뿐이다',
    question: '통일의식(통일 필요성)과 이산가족 생존자 수는 같이 움직이는가?',
    verdict: '약함',
    method: `서울대 통일평화연구원 기초보고서(단일 출처, ${opinion.reports[0].year}~${opinion.reports.at(-1).year})의 「통일이 필요하다」 응답률과, 같은 해 8월 말 생존자 수를 겹치는 ${ys.length}개 연도에서 대조. 수준 상관과 1차 차분 상관을 둘 다 낸다.`,
    n: ys.length,
    findings: [
      F('생존자', `${x[0].toLocaleString()}명 → ${x.at(-1).toLocaleString()}명`, `${ys[0]}~${ys.at(-1)}, ${r1((x.at(-1) / x[0] - 1) * 100)}%`),
      F('「통일이 필요하다」', `${y2[0]}% → ${y2.at(-1)}%`, `${r1(y2.at(-1) - y2[0])}%p`),
      KEY(F('수준 상관', `상관 ${r3(rLevel)}`, '이 값은 근거가 되지 못한다 — 두 계열 다 계속 내려가기만 해서 무엇을 넣어도 높게 나온다')),
      F('해마다의 변화끼리 견준 상관', `${r3(rDiff)} (${dx.length}개 연도)`, `내려가는 추세를 걷어내면 같이 움직이는 성질이 사라진다. 변화 방향이 일치한 해는 ${agree}/${dx.length}년으로 동전 던지기 수준이다`),
      KEY(F('판정', '약함 — "같은 기간 함께 내려갔다"까지만', '무엇이 원인인지도, 어느 쪽이 먼저인지도 이 자료로는 말할 수 없다')),
    ],
    series: [
      { key: 'survivorsAug', label: '생존 이산가족(8월 말, 명)', unit: '명', points: ys.map((y) => XY(y, survByYear[y])) },
      { key: 'needUnification', label: '「통일이 필요하다」(%)', unit: '%', points: ys.map((y) => XY(y, need[y])) },
      { key: 'needUnificationLong', label: '「통일이 필요하다」 장기 계열(%)', unit: '%', points: ext.years.map((y, i) => XY(y, needRow.values[i])) },
    ],
    /* limitIndex — 「이 카드의 결정적 한계는 이것」을 가리킨다.
       예전에는 caveat 앞에 ★ 를 붙여 표시했는데 그 글자가 화면에 그대로 나갔다.
       표시는 렌더되지 않는 이 필드로 옮긴다(nk-summary.mjs 가 읽는다). */
    limitIndex: 3,
    caveats: [
      `겹치는 연도가 ${ys.length}개뿐이다. 월별 등록현황 자료가 ${M0.month} 부터라 그 이전으로 늘릴 수 없다.`,
      '장기 계열(2007~2025)은 인포그래픽 자료와 기초보고서 두 출처를 이은 것이라(겹치는 8개 연도에서 최대 1.4%p 차) 상관 계산에는 쓰지 않고 배경으로만 그린다.',
      '통일의식조사 표본은 매년 1,200명이다. 연도 간 1~2%p 변동은 표본오차 안일 수 있다.',
      '두 계열이 같은 시기에 내려갔다는 관측이다. 한쪽이 다른 쪽을 움직였다는 뜻이 아니다.',
    ],
    asOf: opinion.reports.at(-1).asOf,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 14 — 통일 이유 중 「이산가족」 (약함)
   ══════════════════════════════════════════════════════════════════════════ */
{
  const u6 = opinion.series.find((s) => s.key === 'Uni06' && s.group.menu === 1)
  const ys = u6.years
  const rows = u6.rows.map((r) => ({ label: r.label, values: r.values, fit: linreg(ys, r.values) }))
  const isanRow = rows.find((r) => /이산가족/.test(r.label))
  const others = rows.filter((r) => r !== isanRow && !/기타/.test(r.label)).sort((a, b) => Math.abs(b.fit.slope) - Math.abs(a.fit.slope))

  push({
    id: 'isan-motive-stable',
    title: '생존자는 반으로 줄었지만, 「이산가족 때문에 통일이 필요하다」는 줄지 않았다',
    question: '통일해야 하는 이유로 이산가족을 꼽는 비중은 시간이 지나며 줄었는가?',
    verdict: '약함',
    method: `통일의식조사 「통일 이유」 문항(${ys[0]}~${ys.at(-1)}, ${ys.length}개 연도) 6개 선택지의 연도별 응답률에 직선을 맞춰 기울기와 설명력을 비교한다.`,
    n: ys.length,
    findings: [
      F('이산가족의 고통 해결', `${isanRow.values[0]}% → ${isanRow.values.at(-1)}%`, `해마다 ${r3(isanRow.fit.slope)}%p · 직선이 설명하는 몫 ${r2(isanRow.fit.r2)} — 추세라 부를 수 없는 수준이다`),
      F('구간 평균', `${r2(mean(isanRow.values))}%`, `최저 ${Math.min(...isanRow.values)}% · 최고 ${Math.max(...isanRow.values)}%`),
      ...others.slice(0, 3).map((r) => F(r.label, `${r.values[0]}% → ${r.values.at(-1)}%`, `해마다 ${r3(r.fit.slope)}%p · 직선이 설명하는 몫 ${r2(r.fit.r2)}`)),
      KEY(F('판정', '약함 — "줄지 않았다"까지만', '늘었다고 말할 근거도 없다(설명력 0.22). 다른 이유들이 뚜렷하게 움직이는 동안 이 항목만 평평했다는 대조가 이 카드의 내용이다')),
    ],
    series: rows.filter((r) => !/기타/.test(r.label)).map((r) => ({
      key: `reason_${r.label.slice(0, 6)}`, label: `${r.label}(%)`, unit: '%',
      points: ys.map((y, i) => XY(y, r.values[i])),
    })),
    caveats: [
      `이 문항의 인포그래픽 계열은 ${ys.at(-1)}년에서 끊긴다. ${ys.at(-1) + 1}년 이후는 배포된 인포그래픽 자료가 없다.`,
      '같은 기간 생존자 수를 나란히 그릴 수 없다 — 월별 등록현황이 2017-07부터라 구간이 6년만 겹친다.',
      '「통일 이유」는 통일이 필요하다고 답한 사람에게만 묻는 후속 문항일 수 있다. 그렇다면 모수가 매년 달라진다(설문지 원문 미확인).',
      '연 1,200명 표본에서 8~12% 구간의 1~2%p 변동은 표본오차 안이다.',
    ],
    asOf: '2022-12-31',
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 15 — 생존자 대 기록량 상관 (불가)
   ══════════════════════════════════════════════════════════════════════════ */
{
  const surv = oldTable.map((r) => r.survivors)
  const pairs = [
    { label: '기록 총계', v: oldTable.map((r) => r.recordsAll) },
    { label: '사료(상봉장소 제외)', v: oldTable.map((r) => r.museumHome) },
    { label: '남북관계연표 사건', v: oldTable.map((r) => r.events) },
    { label: '통일부 보도자료', v: oldTable.map((r) => r.briefings) },
    { label: '북한정보포털 동향', v: oldTable.map((r) => r.trends) },
  ].map((p) => ({ ...p, rho: spearman(surv, p.v), p: spearmanExactP(surv, p.v) }))
  const minP = Math.min(...pairs.map((p) => p.p))

  push({
    id: 'region-survivor-record-corr',
    title: '「고향에 사람이 많으면 기록도 많은가」 — 고향 7개로는 답할 수 없다',
    question: '고향별 생존자 수와 기록량 사이에 상관이 있는가?',
    verdict: '불가',
    rejectWhy: `견줄 단위가 구행정구역 7개뿐이다. 어떤 조합에서도 우연일 확률이 ${r3(minP)} 밑으로 내려가지 않아 통상 기준을 넘지 못한다. 7개로는 순위 상관 0.7 도 우연과 구분되지 않는다 — "상관이 있다"도 "없다"도 말할 수 없다.`,
    method: `7개 구행정구역에 대해 생존자 수와 기록 5종의 순위 상관을 계산하고, 7개를 늘어놓는 5,040가지 경우를 전부 세어 우연일 확률을 냈다(근사식을 쓰지 않았다).`,
    n: 7,
    findings: [
      ...pairs.map((p) => F(`생존자 × ${p.label}`, `순위 상관 ${r3(p.rho)}`, `우연일 확률 ${r3(p.p)}`)),
      KEY(F('판정', '판정 불가', `대신 ${CN('record-density-gap')} 카드가 상관 없이 성립하는 사실(정확한 건수와 그 비율)만으로 같은 이야기를 한다`)),
    ],
    series: [{ key: 'scatter', label: '생존자(x) × 기록 총계(y)', unit: '명 / 건', points: oldTable.map((r) => ({ x: r.survivors, y: r.recordsAll, label: r.name })) }],
    caveats: [
      '지역 단위를 13개 현행 행정구역으로 늘려도 이산가족 원적 축이 7종뿐이라 맞물릴 수 있는 단위는 7로 되돌아간다.',
      '도시 단위(56개)로 내려가면 표본이 늘지만 이산가족·사료 축이 도시 단위로 공표되지 않는다.',
    ],
    asOf: CSV_ASOF,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 16 — 사료 지역 × 시대 교차표 (불가)
   ══════════════════════════════════════════════════════════════════════════ */
{
  const DECADES = [[1900, 1945], [1946, 1959], [1960, 1979], [1980, 1999], [2000, 2009], [2010, 2018]]
  const cells = []
  for (const o of OLD_AXIS) {
    const rec = museum.records.filter((r) => (r.regions || []).some((x) => o.modern.includes(x)) || (r.regionsHistoric || []).some((x) => o.historic.includes(x)))
    const dated = rec.map((r) => producedYear(r.producedOn)).filter((y) => y !== null)
    for (const [a, b] of DECADES) cells.push({ region: o.name, era: `${a}~${b}`, n: dated.filter((y) => y >= a && y <= b).length })
  }
  const thin = cells.filter((c) => c.n < 10).length
  const zero = cells.filter((c) => c.n === 0).length

  push({
    id: 'museum-region-by-era',
    title: '고향 × 시대 사료 교차표 — 칸이 비어 있다',
    question: '어느 고향의 사료가 어느 시대에 만들어졌는지 교차표로 볼 수 있는가?',
    verdict: '불가',
    rejectWhy: `7지역 × 6시대 = ${cells.length}칸 중 ${thin}칸이 10건 미만이고 ${zero}칸은 0건이다. 이 표로 지역 간 시대 분포를 비교하면 한두 건이 비율을 좌우한다.`,
    method: '구행정구역 7종 × 시대 6구간으로 사료 생산연도를 교차 집계하고 칸별 표본 수를 실측.',
    n: cells.reduce((s, c) => s + c.n, 0),
    findings: [
      F('총 칸', `${cells.length}칸`),
      F('10건 미만', `${thin}칸 (${pct(thin, cells.length)}%)`),
      F('0건', `${zero}칸`),
      F('가장 얇은 지역', (() => { const g = {}; for (const c of cells) g[c.region] = (g[c.region] || 0) + c.n; const k = Object.keys(g).sort((a, b) => g[a] - g[b])[0]; return `${k} 전 시대 합계 ${g[k]}건` })()),
      F('판정', '지역별 총량까지만 쓴다', '시대 축을 붙이면 표본이 무너진다'),
    ],
    series: [],
    table: cells,
    caveats: [
      '시대 구간을 넓히면 칸은 채워지지만 그 대신 "이산 발생기"와 "상봉기"를 가르는 해상도가 사라진다.',
      '칸 합계는 사료 실건수보다 크다 — 구도명 「함경도(구)」가 함경남도(구)·함경북도(구) 양쪽에, 여러 지역이 태깅된 사료가 여러 행에 중복으로 들어간다. 이 카드는 칸의 두께를 재는 용도이므로 중복을 제거하지 않았다.',
    ],
    asOf: museum.builtAt,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 17 — 고향 기후 (불가)
   ══════════════════════════════════════════════════════════════════════════ */
{
  const w = region.meta.weather
  const obs = []
  for (const [name, r] of Object.entries(region.regions)) for (const o of (r.weather || [])) obs.push({ region: name, ...o })
  const dates = [...new Set(obs.map((o) => o.date))].sort()
  const regionsWithObs = new Set(obs.map((o) => o.region))

  push({
    id: 'homeland-weather',
    title: '고향의 날씨로 무엇을 말할 수 있는가 — 관측이 한 날짜뿐이다',
    question: '지역별 기상 관측으로 고향 간 비교나 추세를 만들 수 있는가?',
    verdict: '불가',
    rejectWhy: `저장된 관측은 지역당 관측소 1~2곳의 단 하루치뿐이다(최신 ${w.latestObsDate}). 시계열도 평년값도 없어 비교·추세·계절성 어느 것도 계산할 수 없다. 2026년 자료는 NOAA 에 아직 없다.`,
    method: '지역별로 저장된 관측의 날짜와 관측소 수를 세었다.',
    n: obs.length,
    findings: [
      F('관측 레코드', `${obs.length}건`, `${regionsWithObs.size}개 지역 / 13개 지역`),
      F('관측 날짜', dates.length === 1 ? `${dates[0]} 단 하루` : `${dates[0]}~${dates.at(-1)} (${dates.length}개 날짜)`),
      F('최신 관측', w.latestObsDate, `요청 연도 ${JSON.stringify(w.requestedYears)} 중 실제 확보 ${JSON.stringify(w.usedYears)}`),
      F('실패', `${w.failed}건 / 시도 ${w.attempted}건`),
      F('판정', '실시간 호출로 대체', '기상만은 미리 저장하지 않고 화면이 그때그때 받아온다 — 저장하는 순간 낡은 값이 되는 유일한 자료이기 때문이다'),
    ],
    series: [],
    caveats: [w.asOfNote || '관측 기준일이 확인되지 않았다.'],
    asOf: w.latestObsDate,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   카드 18 — 후손 실태조사의 지역 분해 (불가)
   ══════════════════════════════════════════════════════════════════════════ */
if (exists(path.join(PACK, 'descendant.json'))) {
  const d = readJSON(path.join(PACK, 'descendant.json'))
  push({
    id: 'descendant-by-region',
    title: '후손 실태조사를 고향별로 볼 수 있는가 — 지역 분해가 공표되지 않았다',
    question: '제4차 실태조사 결과를 고향(구행정구역)별로 나눠 볼 수 있는가?',
    verdict: '불가',
    rejectWhy: '2024년 제4차 실태조사는 전국 단일 표본의 비율만 공표된다. 지역별·원적별 교차표가 원문에 없어 고향 페이지에 붙일 수 없다. 로데이터도 공개되지 않았다.',
    method: '제4차 실태조사가 공표한 모든 지표에 지역별 수치가 있는지 확인.',
    n: d.survey.bases.full,
    findings: [
      F('조사 규모', `1차 ${d.survey.bases.full.toLocaleString()}명 · 심층 ${d.survey.bases.deep.toLocaleString()}명`, `실사 ${d.survey.fieldwork.full}`),
      F('지역 축', '없음', '공표 지표 전부가 전국 단일 비율이다'),
      F('쓸 수 있는 것', `「기록물 수집 보존사업」 요구 ${d.recordPrograms['기록및공감대'][0].pct}%`, '전국 값으로만 인용 가능'),
      F('판정', '전국 값으로만 인용', '지역별로 쪼개어 말하면 없는 수치를 만드는 것이다'),
    ],
    series: [],
    caveats: [`실태조사 주기가 5년에서 3년으로 바뀌었다(${d.survey.cadence.changedOn}, 사유: ${d.survey.cadence.reason}). 다음 회차에서 지역 축이 생길지는 알 수 없다.`],
    asOf: d.survey.publishedAt,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   출력
   ══════════════════════════════════════════════════════════════════════════ */
const count = (v) => cards.filter((c) => c.verdict === v).length
const out = {
  builtAt: new Date().toISOString().slice(0, 10),
  generator: 'scripts/nk-analysis.mjs',
  note: '보유 데이터만으로 계산한 교차표·시계열. 회귀·군집을 억지로 돌리지 않았다. 성립하지 않는 후보도 그대로 남긴다.',
  asOfByLane: {
    '이산가족 월별 등록현황(파일데이터)': CSV_ASOF,
    '이산가족 신청·교류현황(게시판 공표)': HWP_ASOF,
    '이산가족 교류현황': EX_ASOF,
    '이산가족 연표': CHRONO_ASOF,
    '디지털박물관 사료': museum.builtAt,
    '통일의식조사(기초보고서)': opinion.reports.at(-1).asOf,
    '생잔 추계': projection.headline.asOf,
    '지역 인덱스': region.builtAt,
    ...(reunion ? {
      '이산가족정보통합시스템 「나의 살던 고향은」(수집일)': reunion.collectedAt.htgallery,
      '이산가족정보통합시스템 영상편지(수집일)': reunion.collectedAt.vletter,
    } : {}),
  },
  sources: [
    ...(reunion ? [{
      name: '이산가족정보통합시스템 — 나의 살던 고향은 · 영상편지',
      url: 'https://reunion.unikorea.go.kr/',
      /* ★ 운영 기관을 비워 두면 안 된다 — 같은 manifest 안의 reunion.json 항목은 이 출처를 「통일부」로 적는다.
           한쪽만 null 이면 같은 출처가 한 파일 안에서 두 가지로 기술된다(실측 지적). */
      org: '통일부 이산가족정보통합시스템',
      asOf: reunion.collectedAt.htgallery,
      note: `수집일 기준. 사진 ${reunion.htgallery.collected}건 중 ${reunion.htgallery.mapped}건, 영상편지 ${reunion.vletter.collected.toLocaleString()}건 중 ${reunion.vletter.mapped}건에 고향을 붙였다. 사진은 통일부가 아닌 기관이 제공한 것이 많아 제공처를 함께 적는다.`,
      usedBy: ['record-density-gap', 'legacy-priority'],
    }] : []),
    ...isan.sources.map((s) => ({ ...s, usedBy: ['exchange-terminus', 'deaths-since-last-reunion', 'aging-deficit', 'origin-known-erosion', 'series-breaks', 'relation-shift', 'death-seasonality', 'record-density-gap', 'two-homeland-maps', 'opinion-vs-survivors', 'museum-reunion-sync'] })),
    ...museum.sources.slice(0, 2).map((s) => ({ ...s, usedBy: ['museum-production-era', 'museum-reunion-sync', 'record-density-gap', 'museum-region-by-era'] })),
    ...opinion.sources.map((s) => ({ ...s, usedBy: ['opinion-vs-survivors', 'isan-motive-stable'] })),
    /* file(내부 경로)은 화면에 쓸 값이 아니라 빌드 계보다 — 덱 출처 목록으로 넘기지 않는다.
       대신 근거를 하나도 못 대는 행이 생기지 않도록 기관명이 비어 있으면 채운다. */
    ...region.sources.map(({ file: _file, ...s }) => ({
      ...s,
      ...(s.name === '구행정구역 대응표(이산가족 출신지 축)'
        ? { org: '본 시제품 작성', note: '통일부가 공표한 이산가족 출신지 7종 축에 현행 행정구역을 맞춰 본 시제품이 만든 표다. 원본 자료가 아니다.' }
        : {}),
      ...(/^NOAA/.test(s.name) ? { org: '미국 해양대기청(NOAA) 국립환경정보센터' } : {}),
      ...(s.name.startsWith('남북관계연표 ·') ? { org: '통일부 · 공공데이터포털 파일데이터' } : {}),
      usedBy: ['record-density-gap', 'two-homeland-maps', 'region-survivor-record-corr', 'homeland-weather'],
    })),
  ],
  corpus: corpusMeta,
  cards,
  meta: {
    tried: cards.length,
    accepted: count('성립'),
    weak: count('약함'),
    rejectedCount: count('불가'),
    rejected,
    stats: {
      note: '표본이 7~19개로 작아 근사식을 쓰지 않고 가능한 경우를 전부 세어 계산했다.',
      methods: ['순위 상관 — 7개를 늘어놓는 5,040가지를 전부 세어 우연일 확률을 냈다', '두 묶음의 크기 비교 — 가능한 조합을 전부 세었다', '방향이 몇 번 일치했는지 세는 검정', '직선 맞추기 — 추세가 있는지만 보고 유의성은 주장하지 않았다'],
    },
    principles: [
      '추정치로 빈칸을 채우지 않았다. 계산되지 않는 것은 불가로 적었다.',
      '인과를 주장하는 문장을 쓰지 않았다.',
      '기준일이 다른 계열을 이을 때는 이었다는 사실을 카드 안에 적었다.',
      '유의하지 않은 상관은 "없다"가 아니라 "판정 불가"로 적었다.',
    ],
  },
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8')

log(`\n${'='.repeat(66)}`)
log(`  고향잇기 분석 — ${OUT.replace(ROOT + path.sep, '')}`)
log('='.repeat(66))
for (const c of cards) {
  const mark = c.verdict === '성립' ? '●' : c.verdict === '약함' ? '◇' : '×'
  log(`  ${mark} [${c.verdict}] ${c.id.padEnd(30)} n=${String(c.n).padStart(6)}  ${c.title}`)
}
log('-'.repeat(66))
log(`  시도 ${out.meta.tried} · 성립 ${out.meta.accepted} · 약함 ${out.meta.weak} · 불가 ${out.meta.rejectedCount}`)
log(`  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`)
log('='.repeat(66) + '\n')
