// 조달청 나라장터 방역물자 조달 동향 — 입찰공고정보(물품, getBidPblancListInfoThngPPSSrch) 최근분을 받아 방역 키워드로 필터·집계.
//   FactDoc 역할: '발생 급증(질병청) → 방역물자 조달 착수' 흐름의 외부 선행지표(조기경보 보조). 판정 근거 아님(§데이터-API-조사 결론).
// per-request 외부호출 금지(§13.7) → GitHub Actions cron(주1회). 환경변수 DATA_GO_KR_API_KEY. 실패 시 기존 파일 유지.
import fs from 'node:fs'

const OUT = 'frontend/src/data/procurement.ts'
const KEY = process.env.DATA_GO_KR_API_KEY
const BASE = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoThngPPSSrch'
const DAYS = 120, WINDOW = 28, MAX_PAGES = 8, ROWS = 999 // ⚠ 조달청 inqryDiv=1 조회범위 ≤30일 → 28일 윈도우로 청크
const YEAR_MS = 365 * 86400000 // 전년 동기 비교용

// 방역·감염 대응 물자 키워드(공고명 매칭). 카테고리별.
const KW = {
  '진단·검사': ['진단키트', '신속항원', '자가검사', 'PCR', '검체', '항원검사', '진단시약'],
  '개인보호구': ['마스크', 'KF94', 'KF80', 'N95', '방호복', '보호구', '보호의', '페이스실드', '안면보호'],
  '소독·방역': ['소독', '살균', '손소독', '방역', '소독제', '방역물품', '분무'],
  '의료·치료': ['해열제', '체온계', '음압', '산소포화도', '인공호흡', '백신냉장', '콜드체인'],
}
const ALL_KW = Object.entries(KW).flatMap(([cat, ks]) => ks.map((k) => ({ k, cat })))
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

// 한 기간(endDate 기준 days일 소급)을 28일 윈도우로 스캔 → {scanned, hits}
async function scanPeriod(endDate, days) {
  let scanned = 0
  const hits = []
  for (let off = 0; off < days; off += WINDOW) {
    const wEnd = new Date(endDate.getTime() - off * 86400000)
    const wBgn = new Date(endDate.getTime() - Math.min(days, off + WINDOW) * 86400000)
    const bgn = ymd(wBgn) + '0000', end = ymd(wEnd) + '2359'
    for (let p = 1; p <= MAX_PAGES; p++) {
      const url = `${BASE}?serviceKey=${KEY}&numOfRows=${ROWS}&pageNo=${p}&type=json&inqryDiv=1&inqryBgnDt=${bgn}&inqryEndDt=${end}`
      let d
      try { d = await (await fetch(url)).json() } catch { break }
      if (d.response?.header?.resultCode !== '00') { console.warn('  resultCode:', d.response?.header?.resultMsg || JSON.stringify(d).slice(0, 80)); break }
      const body = d.response.body
      const items = Array.isArray(body.items) ? body.items : (body.items?.item ?? [])
      if (!items.length) break
      scanned += items.length
      for (const it of items) {
        const nm = it.bidNtceNm || ''
        const m = ALL_KW.find((x) => nm.includes(x.k))
        if (!m) continue
        hits.push({ nm: nm.slice(0, 70), inst: it.ntceInsttNm || '', date: (it.bidNtceDt || '').slice(0, 10), url: it.bidNtceUrl || it.bidNtceDtlUrl || '', price: parseInt(it.presmptPrce || it.asignBdgtAmt || '0', 10) || 0, cat: m.cat, kw: m.k })
      }
      if (items.length < ROWS) break
    }
  }
  return { scanned, hits }
}
const count = (arr, key) => arr.reduce((o, h) => { o[h[key]] = (o[h[key]] || 0) + 1; return o }, {})

async function main() {
  if (!KEY) { console.log('· DATA_GO_KR_API_KEY 미설정 → 기존 procurement.ts 유지'); return }
  const now = new Date()
  // 현재(최근 DAYS일) + 전년 동기(1년 전 같은 DAYS일) 스캔 → 전년 대비 발주 폭증 랭킹
  const curP = await scanPeriod(now, DAYS)
  const prevP = await scanPeriod(new Date(now.getTime() - YEAR_MS), DAYS)
  const scanned = curP.scanned, hits = curP.hits
  if (!scanned) { console.warn('스캔 0건 → 기존 유지'); return }
  // 전년 동기 대비 폭증 — 키워드·카테고리별
  const ckCur = count(hits, 'kw'), ckPrev = count(prevP.hits, 'kw')
  const ccCur = count(hits, 'cat'), ccPrev = count(prevP.hits, 'cat')
  const surgeOf = (curMap, prevMap, key, min) => Object.keys({ ...curMap, ...prevMap })
    .map((k) => { const cur = curMap[k] || 0, prev = prevMap[k] || 0; return { [key]: k, cur, prev, deltaPct: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 999 : 0) } })
    .filter((r) => r.cur >= min || r.prev >= min)
    .sort((a, b) => b.deltaPct - a.deltaPct)
  const kwSurge = surgeOf(ckCur, ckPrev, 'kw', 3).slice(0, 8)
  const catSurge = surgeOf(ccCur, ccPrev, 'cat', 1)
  const prevRange = `${ymd(new Date(now.getTime() - YEAR_MS - DAYS * 86400000)).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}~${ymd(new Date(now.getTime() - YEAR_MS)).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}`

  // 카테고리·키워드 집계 + 월별 추세 + 최근 목록
  const byCat = {}; const byKw = {}; const byMonth = {}
  for (const h of hits) {
    byCat[h.cat] = (byCat[h.cat] || 0) + 1
    byKw[h.kw] = (byKw[h.kw] || 0) + 1
    const mo = h.date.slice(0, 7); if (mo) byMonth[mo] = (byMonth[mo] || 0) + 1
  }
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, n]) => ({ cat, n }))
  const kwRows = Object.entries(byKw).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([kw, n]) => ({ kw, n }))
  const months = Object.keys(byMonth).sort().map((m) => ({ m, n: byMonth[m] }))
  const recent = hits.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12)
  const updated = ymd(now).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')

  const header = `// 조달청 나라장터 방역물자 조달 동향 — 자동 생성(scripts/fetch-procurement.mjs). 수기편집 금지(재생성됨).\n` +
    `// 출처: 조달청 나라장터 입찰공고정보서비스(물품). 최근 ${DAYS}일 물품 입찰 ${scanned}건 중 방역 키워드 ${hits.length}건(전년 동기 ${prevP.hits.length}건). 조기경보 외부 선행지표(판정 근거 아님).\n` +
    `export interface ProcureItem { nm: string; inst: string; date: string; url: string; price: number; cat: string; kw: string }\n` +
    `export const PROCURE_UPDATED = ${JSON.stringify(updated)}\n` +
    `export const PROCURE_SCANNED = ${scanned}\n` +
    `export const PROCURE_HITS = ${hits.length}\n` +
    `export const PROCURE_PREV_HITS = ${prevP.hits.length}\n` +
    `export const PROCURE_PREV_RANGE = ${JSON.stringify(prevRange)}\n` +
    `export const PROCURE_BY_CAT: { cat: string; n: number }[] = ${JSON.stringify(catRows)}\n` +
    `export const PROCURE_BY_KW: { kw: string; n: number }[] = ${JSON.stringify(kwRows)}\n` +
    `export const PROCURE_BY_MONTH: { m: string; n: number }[] = ${JSON.stringify(months)}\n` +
    `// 전년 동기 대비 발주 폭증(조기경보 선행지표). deltaPct=999는 전년 0건(신규 급등).\n` +
    `export const PROCURE_CAT_SURGE: { cat: string; cur: number; prev: number; deltaPct: number }[] = ${JSON.stringify(catSurge)}\n` +
    `export const PROCURE_KW_SURGE: { kw: string; cur: number; prev: number; deltaPct: number }[] = ${JSON.stringify(kwSurge)}\n` +
    `export const PROCURE_RECENT: ProcureItem[] = ${JSON.stringify(recent)}\n`
  fs.writeFileSync(OUT, header, 'utf8')
  console.log(`✓ ${OUT} — 최근 ${DAYS}일 ${scanned}건 스캔, 방역 ${hits.length}건(전년동기 ${prevP.hits.length}건). 폭증 Top: ${kwSurge.slice(0, 3).map((r) => r.kw + ' ' + (r.deltaPct === 999 ? '신규' : (r.deltaPct > 0 ? '+' : '') + r.deltaPct + '%')).join(', ')}`)
}
main()
