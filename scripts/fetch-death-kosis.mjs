// 감염병 사망현황 수집 — 통계청 KOSIS 사망원인통계(DT_1B34E01, orgId=101)로 주요 감염병 연도별 사망자수·사망률.
//   질병청 감염병포털 EDW는 '발생수'만 제공(사망 없음) → 사망은 통계청 KOSIS가 정답. 출처 분리 표기 필수.
// 분류: C1=사망원인(ICD), C2=성(0계/1남/2여), C3=연령(00=계), itmId T1=사망자수·T5=사망률(십만명당). prdSe=Y.
// per-request 외부호출 금지(§13.7) → GitHub Actions cron(연1회 공표라 월1회면 충분)로 굽고 death-eid.ts 캐시. 프론트는 캐시만 읽음.
// 필요: 환경변수 KOSIS_KEY. 실패 시 기존 파일 유지(데이터 유실 방지).
import fs from 'node:fs'

const OUT = 'frontend/src/data/death-eid.ts'
const KEY = process.env.KOSIS_KEY
const Y0 = 2005, Y1 = 2025 // 최신연도 자동(데이터 있는 데까지). 새 연도 공표되면 자동 반영.

// 주요 감염성 사인 C1 코드 → 표시명(짧게). 출처명(C1_NM)은 그대로 두되 UI용 친화명.
const NAME = {
  '1': '감염성·기생충 질환(전체)', '104': '결핵(호흡기)', '105': '결핵(기타)', '111': '패혈증',
  '118': '바이러스 간염', '119': '후천성면역결핍증(AIDS)', '120': '말라리아', '117': '홍역',
  '125': '코로나바이러스감염증-19', 'A01': '인플루엔자', 'A02': '폐렴',
}
const CODES = Object.keys(NAME)

async function main() {
  if (!KEY) { console.log('· KOSIS_KEY 미설정 → 기존 death-eid.ts 유지. https://kosis.kr/openapi/'); return }
  const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${KEY}` +
    `&itmId=T1+T5+&objL1=${CODES.join('+')}+&objL2=0+&objL3=00+&format=json&jsonVD=Y&prdSe=Y&startPrdDe=${Y0}&endPrdDe=${Y1}&orgId=101&tblId=DT_1B34E01`
  const res = await fetch(url); const txt = await res.text()
  let data; try { data = JSON.parse(txt) } catch { console.warn('KOSIS 파싱 실패:', txt.slice(0, 150)); return }
  if (!Array.isArray(data) || !data.length || data[0].err) { console.warn('KOSIS 비정상:', txt.slice(0, 150)); return }

  // code → { name, years: { [y]: {deaths, rate} } }
  const map = {}
  let latest = 0, lstChn = ''
  for (const r of data) {
    const code = r.C1, y = String(r.PRD_DE), v = parseFloat(r.DT)
    if (!CODES.includes(code) || !Number.isFinite(v)) continue
    ;(map[code] ??= { code, name: NAME[code] || r.C1_NM, years: {} }).years[y] ??= { deaths: 0, rate: 0 }
    if (r.ITM_ID === 'T1') map[code].years[y].deaths = Math.round(v)
    else if (r.ITM_ID === 'T5') map[code].years[y].rate = Math.round(v * 10) / 10
    latest = Math.max(latest, +y)
    if (r.LST_CHN_DE && r.LST_CHN_DE > lstChn) lstChn = r.LST_CHN_DE
  }
  const rows = Object.values(map)
  if (!rows.length) { console.warn('수집 0건 → 기존 유지'); return }
  // 결핵(호흡기)+결핵(기타) 합계 행 추가(흔히 '결핵'으로 인식).
  const tb1 = map['104'], tb2 = map['105']
  if (tb1 && tb2) {
    const years = {}
    for (const y of new Set([...Object.keys(tb1.years), ...Object.keys(tb2.years)])) {
      years[y] = { deaths: (tb1.years[y]?.deaths || 0) + (tb2.years[y]?.deaths || 0), rate: Math.round(((tb1.years[y]?.rate || 0) + (tb2.years[y]?.rate || 0)) * 10) / 10 }
    }
    rows.push({ code: 'TB', name: '결핵(합계)', years })
  }
  // 최신연도 사망자 내림차순(전체 제외 후순위)
  rows.sort((a, b) => (b.years[latest]?.deaths || 0) - (a.years[latest]?.deaths || 0))
  const allYears = [...new Set(rows.flatMap((r) => Object.keys(r.years)))].sort()

  const header = `// 감염병 사망현황 — 자동 생성(scripts/fetch-death-kosis.mjs). 수기편집 금지(재생성됨).\n` +
    `// 출처: 통계청 KOSIS 사망원인통계(DT_1B34E01) — 주요 감염성 사인 연도별 사망자수·사망률(십만명당), 성·연령 계.\n` +
    `// ⚠ 질병청 감염병포털의 '발생수'와는 출처·집계기준이 다름(치명률 직접산출 금지, 각각 별도 지표). 최신=${latest}년(공표 ${lstChn || '연1회'}).\n` +
    `export interface DeathYear { deaths: number; rate: number }\n` +
    `export interface DeathRow { code: string; name: string; years: Record<string, DeathYear> }\n` +
    `export const DEATH_LATEST_YEAR = ${JSON.stringify(String(latest))}\n` +
    `export const DEATH_UPDATED = ${JSON.stringify(lstChn || '')}\n` +
    `export const DEATH_YEARS: string[] = ${JSON.stringify(allYears)}\n` +
    `export const DEATH_BY_DISEASE: DeathRow[] = ${JSON.stringify(rows)}\n`
  fs.writeFileSync(OUT, header, 'utf8')
  const top = rows[0]
  console.log(`✓ ${OUT} — ${rows.length}개 사인 · ${allYears[0]}~${latest} · 최다 ${top.name} ${top.years[latest]?.deaths?.toLocaleString()}명(${latest})`)
}
main()
