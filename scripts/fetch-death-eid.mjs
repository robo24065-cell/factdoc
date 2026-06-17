// 법정감염병 종류별 사망 — 질병청 전수신고 감염병 발생현황 API /death(EIDAPIService). 감염병지도(발생)와 동일 질병 분류 → 질병 선택 시 사망 동기화.
//   파라미터: serviceKey, resType=2(json), searchStartYear, searchEndYear, pageNo, numOfRows. 응답 item: {year, icdGroupNm(급), icdNm(질병명), resultVal(사망자수)}.
// per-request 외부호출 금지(§13.7) → GitHub Actions cron. 환경변수 DATA_GO_KR_API_KEY. 실패 시 기존 파일 유지.
import fs from 'node:fs'

const OUT = 'frontend/src/data/death-eid-legal.ts'
const KEY = process.env.DATA_GO_KR_API_KEY
const Y0 = 2017, Y1 = 2024 // 최신연도 자동(데이터 있는 데까지)

async function main() {
  if (!KEY) { console.log('· DATA_GO_KR_API_KEY 미설정 → 기존 death-eid-legal.ts 유지'); return }
  const url = `https://apis.data.go.kr/1790387/EIDAPIService/death?serviceKey=${KEY}&resType=2&searchStartYear=${Y0}&searchEndYear=${Y1}&pageNo=1&numOfRows=3000`
  let d; try { d = JSON.parse(await (await fetch(url)).text()) } catch (e) { console.warn('파싱 실패:', e.message); return }
  if (d.response?.header?.resultCode !== '00') { console.warn('비정상:', d.response?.header?.resultMsg); return }
  let items = d.response.body?.items?.item ?? []
  if (!Array.isArray(items)) items = items ? [items] : []
  if (!items.length) { console.warn('0건 → 기존 유지'); return }

  // icdNm → { grp, years: {year: deaths} }
  const map = {}
  let latest = 0
  for (const it of items) {
    const nm = it.icdNm; const y = String(it.year).replace(/[^\d]/g, ''); const v = parseInt(it.resultVal, 10)
    if (!nm || !y || !Number.isFinite(v)) continue
    ;(map[nm] ??= { name: nm, grp: it.icdGroupNm || '', years: {} }).years[y] = v
    latest = Math.max(latest, +y)
  }
  const rows = Object.values(map)
  if (!rows.length) { console.warn('수집 0건 → 기존 유지'); return }
  const years = [...new Set(rows.flatMap((r) => Object.keys(r.years)))].sort()
  // 최신연도 사망 내림차순
  rows.sort((a, b) => (b.years[latest] ?? 0) - (a.years[latest] ?? 0))

  const header = `// 법정감염병 종류별 사망 — 자동 생성(scripts/fetch-death-eid.mjs). 수기편집 금지(재생성됨).\n` +
    `// 출처: 질병관리청 전수신고 감염병 발생현황 API(/death). 감염병지도의 발생 데이터와 '동일 질병 분류' → 질병 선택 시 사망 동기화 가능.\n` +
    `// 연도별 사망자수(명). ${years[0]}~${latest}. 참고용·의료 진단 아님.\n` +
    `export interface EidDeathRow { name: string; grp: string; years: Record<string, number> }\n` +
    `export const EID_DEATH_YEARS: string[] = ${JSON.stringify(years)}\n` +
    `export const EID_DEATH_LATEST = ${JSON.stringify(String(latest))}\n` +
    `export const EID_DEATH: EidDeathRow[] = ${JSON.stringify(rows)}\n`
  fs.writeFileSync(OUT, header, 'utf8')
  const top = rows[0]
  console.log(`✓ ${OUT} — ${rows.length}종 × ${years.length}년(${years[0]}~${latest}) · 최다 ${top.name} ${top.years[latest]}명(${latest})`)
}
main()
