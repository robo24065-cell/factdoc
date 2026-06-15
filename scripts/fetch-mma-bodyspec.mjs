// 병무청 병역판정 신체검사 정보(3064321) → 또래 신체스펙 기준치 집계.
// 개별 수검자 레코드(1행=1인: birth/geomsaDt/height/weight/bmi/jbceong)를 페이징 수집해
// 검사년도별 평균·표준편차·분위수(5/25/50/75/95%)를 산출 → frontend/src/engine/mma-bodyspec.ts 교체.
//
// 사용: DATA_GO_KR_API_KEY=... node scripts/fetch-mma-bodyspec.mjs [표본수=20000] [검사년도(옵션)]
// 주의: 병무청 1300000 게이트웨이는 활용신청 승인/전파 후에만 응답(전까지 "Unexpected errors").
//   API에 연도·성별 필터 파라미터가 없어(serviceKey/numOfRows/pageNo만) 페이징 후 클라이언트 집계.
//   BMI 18.5~35 구간만 공개되는 점은 결과 주석에 명시.
import fs from 'node:fs'

const KEY = process.env.DATA_GO_KR_API_KEY
if (!KEY) { console.error('DATA_GO_KR_API_KEY 필요'); process.exit(1) }
const SAMPLE = Number(process.argv[2] ?? 20000)
const ONLY_YEAR = process.argv[3] ? Number(process.argv[3]) : null
const BASE = 'http://apis.data.go.kr/1300000/jBGSSCJeongBo/list'
const ROWS = 1000

async function page(no) {
  const url = `${BASE}?serviceKey=${encodeURIComponent(KEY)}&numOfRows=${ROWS}&pageNo=${no}`
  const res = await fetch(url)
  const txt = await res.text()
  if (txt.trim().startsWith('<')) {
    // XML — 간단 파싱
    const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const g = (t) => (m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]
      return { birth: +g('birth'), geomsaDt: +g('geomsaDt'), height: +g('height'), weight: +g('weight'), bmi: +g('bmi') }
    })
    return items
  }
  throw new Error(`예상치 못한 응답(전파 전일 수 있음): ${txt.slice(0, 80)}`)
}

const recs = []
for (let no = 1; recs.length < SAMPLE; no++) {
  const items = await page(no)
  if (!items.length) break
  for (const it of items) {
    if (ONLY_YEAR && it.geomsaDt !== ONLY_YEAR) continue
    if (it.height > 0 && it.weight > 0) recs.push(it)
  }
  if (no % 5 === 0) console.log(`  ${recs.length}건 수집...`)
  if (no > Math.ceil(SAMPLE / ROWS) * 3) break // 안전장치
}
if (recs.length < 100) { console.error(`표본 부족(${recs.length}). 전파/승인 확인 필요`); process.exit(1) }

const yr = ONLY_YEAR ?? Math.max(...recs.map((r) => r.geomsaDt))
const use = recs.filter((r) => r.geomsaDt === yr)
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length
const sd = (a, m) => Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)] }
const H = use.map((r) => r.height), W = use.map((r) => r.weight)
const mh = mean(H), mw = mean(W)
const out = {
  year: yr, n: use.length,
  meanHeight: +mh.toFixed(2), sdHeight: +sd(H, mh).toFixed(2),
  meanWeight: +mw.toFixed(2), sdWeight: +sd(W, mw).toFixed(2),
  meanBmi: +mean(use.map((r) => r.bmi || r.weight / (r.height / 100) ** 2)).toFixed(1),
  heightPct: { p5: pct(H, 0.05), p25: pct(H, 0.25), p50: pct(H, 0.5), p75: pct(H, 0.75), p95: pct(H, 0.95) },
  weightPct: { p5: pct(W, 0.05), p25: pct(W, 0.25), p50: pct(W, 0.5), p75: pct(W, 0.75), p95: pct(W, 0.95) },
}
console.log(JSON.stringify(out, null, 2))
fs.writeFileSync('scripts/mma-bodyspec.out.json', JSON.stringify(out, null, 2))
console.log(`\n표본 ${use.length}건(${yr}년) 집계 완료 → scripts/mma-bodyspec.out.json`)
console.log('이 값으로 frontend/src/engine/mma-bodyspec.ts의 MMA_REF + 분위수를 갱신하세요(실측 분위수로 백분위 표시 가능).')
