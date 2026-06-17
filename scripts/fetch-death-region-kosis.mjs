// 시도별 감염병 사망 수집 — 통계청 KOSIS 사망원인통계 DT_1B34E11(사망원인/시도/연령/성별, 사망자수+사망률).
//   감염병지도(발생수=질병청 EDW)와 별개 지표(사망=통계청). 출처·질병셋 다름 → UI에서 분리·치명률 직접산출 금지.
// per-request 외부호출 금지(§13.7) → GitHub Actions cron 월1회(연1회 공표). 환경변수 KOSIS_KEY.
import fs from 'node:fs'

const OUT = 'frontend/src/data/death-region.ts'
const KEY = process.env.KOSIS_KEY
const Y0 = 2014, Y1 = 2025 // 최신연도 자동 선택

// KOSIS에 실제 사망분류가 있는 주요 감염사인(EID 지도 드롭다운과 분리). code→표시명.
const CAUSE = {
  'A02': '폐렴', '125': '코로나19', '111': '패혈증', '104': '결핵(호흡기)',
  '118': '바이러스 간염', '120': '말라리아', 'A01': '인플루엔자', '119': '후천성면역결핍증(AIDS)',
}
const CODES = Object.keys(CAUSE)

async function main() {
  if (!KEY) { console.log('· KOSIS_KEY 미설정 → 기존 death-region.ts 유지'); return }
  // ⚠ E11에서 사망률 ITM_ID = T4(T5 아님). T1=사망자수·T4=사망률(십만명당). objL2=00(전국)+ALL(17시도).
  const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${KEY}` +
    `&itmId=T1+T4+&objL1=${CODES.join('+')}+&objL2=00+ALL&objL3=00+&objL4=0+&format=json&jsonVD=Y&prdSe=Y&startPrdDe=${Y0}&endPrdDe=${Y1}&orgId=101&tblId=DT_1B34E11`
  const res = await fetch(url); const txt = await res.text()
  let data; try { data = JSON.parse(txt) } catch { console.warn('파싱 실패:', txt.slice(0, 150)); return }
  if (!Array.isArray(data) || !data.length || data[0].err) { console.warn('비정상:', txt.slice(0, 150)); return }

  // 최신연도
  let latest = 0
  for (const r of data) { if (CODES.includes(r.C1)) latest = Math.max(latest, +r.PRD_DE) }
  // cause → { sido → {deaths, rate} }, 전국('전국'/'계') 포함
  const byCause = {}
  const sidoSet = new Set()
  for (const r of data) {
    if (!CODES.includes(r.C1) || +r.PRD_DE !== latest) continue
    const sido = r.C2_NM, v = parseFloat(String(r.DT).replace(/[^\d.]/g, ''))
    if (!sido || !Number.isFinite(v)) continue
    const c = (byCause[r.C1] ??= {})
    const s = (c[sido] ??= { deaths: 0, rate: 0 })
    if (r.ITM_ID === 'T1') s.deaths = Math.round(v)
    else if (r.ITM_ID === 'T4') s.rate = Math.round(v * 10) / 10
    sidoSet.add(sido)
  }
  const causes = CODES.filter((c) => byCause[c]).map((c) => ({ code: c, name: CAUSE[c], sido: byCause[c] }))
  if (!causes.length) { console.warn('수집 0건 → 기존 유지'); return }

  const header = `// 시도별 감염병 사망 — 자동 생성(scripts/fetch-death-region-kosis.mjs). 수기편집 금지(재생성됨).\n` +
    `// 출처: 통계청 KOSIS 사망원인통계(DT_1B34E11) — 시도별 사망자수·사망률(십만명당), 연령·성 계. ${latest}년.\n` +
    `// ⚠ 감염병지도의 '발생수'(질병청 감염병포털)와 출처·집계기준·대상질병이 다른 별개 지표. 치명률(사망/발생) 직접 산출 금지.\n` +
    `export interface DeathRegionCause { code: string; name: string; sido: Record<string, { deaths: number; rate: number }> }\n` +
    `export const DEATH_REGION_YEAR = ${JSON.stringify(String(latest))}\n` +
    `export const DEATH_REGION: DeathRegionCause[] = ${JSON.stringify(causes)}\n`
  fs.writeFileSync(OUT, header, 'utf8')
  console.log(`✓ ${OUT} — ${causes.length}개 사인 × 시도 ${sidoSet.size}개 · ${latest}년 (폐렴 전국 ${byCause['A02']?.['전국']?.deaths ?? byCause['A02']?.['계']?.deaths ?? '?'}명)`)
}
main()
