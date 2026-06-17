// 네이버 데이터랩 건강 검색어/쇼핑 트렌드 수집 — '건강 주장 키워드' 워치리스트의 급상승을 감지(가짜정보 선행지표).
//   ① 통합검색어트렌드(datalab/search): 건강기능식품·민간요법·다이어트 등 건강주장 키워드의 상대 검색량 추세.
//   ② 쇼핑인사이트(datalab/shopping/categories): 건강식품(catId 50000008) 분야 클릭 추세.
//   → 최근 7일 평균이 그 이전 7일보다 급증한 키워드 = "곧 관련 가짜정보가 따라 퍼질 수 있는" 후보(프리벙킹과 연결).
// ⚠ 네이버 OpenAPI에는 '분야 인기검색어 Top100' 랭킹 엔드포인트가 없음 → 미션에 맞춘 큐레이션 워치리스트 추적으로 구현(더 타겟됨).
// 데이터 입자: 검색어트렌드는 '일' 단위 → 하루 2회 갱신이면 충분(시간별 호출은 같은 일자값이라 무의미). §13.7 per-request 외부호출 금지(배치 수집·정적 캐시).
// 필요 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (https://developers.naver.com 무료, 일 1000건). 미설정/실패 시 기존 파일 유지(데이터 유실 방지).
import fs from 'node:fs'

const OUT = 'frontend/src/data/naver-trends.ts'
const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET
const ymd = (d) => d.toISOString().slice(0, 10)

// 건강 주장 키워드 워치리스트(그룹명 = 대표어, keywords = 동의/변형) — 가짜정보가 자주 붙는 품목/민간요법.
const WATCH = [
  { g: '홍삼', k: ['홍삼', '홍삼정', '홍삼스틱'], cat: '건강기능식품' },
  { g: '프로바이오틱스', k: ['프로바이오틱스', '유산균', '유산균영양제'], cat: '건강기능식품' },
  { g: '오메가3', k: ['오메가3', '오메가쓰리'], cat: '건강기능식품' },
  { g: '비타민D', k: ['비타민D', '비타민디'], cat: '건강기능식품' },
  { g: '루테인', k: ['루테인', '눈영양제'], cat: '건강기능식품' },
  { g: '밀크씨슬', k: ['밀크씨슬', '실리마린', '간영양제'], cat: '건강기능식품' },
  { g: '콜라겐', k: ['콜라겐', '저분자콜라겐'], cat: '건강기능식품' },
  { g: '마그네슘', k: ['마그네슘', '마그네슘영양제'], cat: '건강기능식품' },
  { g: '면역력영양제', k: ['면역력', '면역력영양제', '아연'], cat: '면역' },
  { g: '다이어트보조제', k: ['다이어트보조제', '다이어트약', '가르시니아'], cat: '다이어트' },
  { g: '단백질보충제', k: ['단백질보충제', '프로틴', '단백질파우더'], cat: '다이어트' },
  { g: '혈당영양제', k: ['혈당영양제', '혈당관리', '바나바잎'], cat: '만성질환' },
  { g: '여주', k: ['여주', '여주즙', '여주환'], cat: '민간요법' },
  { g: '노니', k: ['노니', '노니주스', '노니환'], cat: '민간요법' },
  { g: '흑마늘', k: ['흑마늘', '흑마늘즙'], cat: '민간요법' },
  { g: '펜벤다졸', k: ['펜벤다졸', '구충제암'], cat: '위험낭설' },
]
const HEALTH_FOOD_CAT = '50000008' // 네이버 쇼핑 '건강식품' 분야

async function datalab(path, body) {
  const res = await fetch(`https://openapi.naver.com/v1/datalab/${path}`, {
    method: 'POST',
    headers: { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) { console.warn(`  네이버 ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`); return null }
  return res.json()
}

// 급상승% = 최근 7포인트 평균 vs 직전 7포인트 평균.
function surge(series) {
  if (series.length < 8) return 0
  const v = series.map((p) => p.ratio)
  const recent = v.slice(-7), prior = v.slice(-14, -7)
  const a = recent.reduce((s, x) => s + x, 0) / recent.length
  const b = prior.length ? prior.reduce((s, x) => s + x, 0) / prior.length : a
  if (!(b > 0)) return 0
  return Math.round(((a - b) / b) * 100)
}

async function main() {
  if (!ID || !SECRET) { console.log('· NAVER_CLIENT_ID/SECRET 미설정 → 기존 파일 유지. https://developers.naver.com'); return }
  const end = new Date(), start = new Date(end.getTime() - 90 * 86400000)
  const items = []
  // 검색어트렌드 — 5그룹씩 끊어 호출
  for (let i = 0; i < WATCH.length; i += 5) {
    const chunk = WATCH.slice(i, i + 5)
    const data = await datalab('search', {
      startDate: ymd(start), endDate: ymd(end), timeUnit: 'date',
      keywordGroups: chunk.map((w) => ({ groupName: w.g, keywords: w.k })),
    })
    if (!data?.results) continue
    for (const r of data.results) {
      const meta = chunk.find((w) => w.g === r.title)
      const series = (r.data || []).map((d) => ({ d: d.period, ratio: Math.round(d.ratio * 10) / 10 }))
      items.push({ name: r.title, cat: meta?.cat ?? '기타', surgePct: surge(series), latest: series.at(-1)?.ratio ?? 0, series: series.slice(-30) })
    }
  }
  if (!items.length) { console.log('· 네이버 응답 없음 → 기존 파일 유지'); return }
  items.sort((a, b) => b.surgePct - a.surgePct)

  // 쇼핑인사이트 — 건강식품 분야 클릭 추세(월 단위)
  let foodCat = null
  const fc = await datalab('shopping/categories', {
    startDate: ymd(new Date(end.getTime() - 180 * 86400000)), endDate: ymd(end), timeUnit: 'month',
    category: [{ name: '건강식품', param: [HEALTH_FOOD_CAT] }],
  })
  if (fc?.results?.[0]?.data) foodCat = fc.results[0].data.map((d) => ({ d: d.period.slice(0, 7), ratio: Math.round(d.ratio * 10) / 10 })).slice(-12)

  const updated = ymd(end)
  const header = `// 네이버 데이터랩 건강 검색어/쇼핑 트렌드 — 자동 생성(scripts/fetch-naver-trends.mjs). 수기편집 금지(재생성됨).\n` +
    `// 건강 주장 키워드 워치리스트의 상대 검색량(0~100)과 급상승%(최근7일 vs 직전7일). 급상승 = 가짜정보 선행 후보(프리벙킹 연결).\n` +
    `// 출처: 네이버 데이터랩 통합검색어트렌드·쇼핑인사이트(상대 지수, 실제 검색량 아님). GitHub Actions cron 하루 2회 자동 갱신.\n` +
    `export interface NaverTrendItem { name: string; cat: string; surgePct: number; latest: number; series: { d: string; ratio: number }[] }\n` +
    `export const NAVER_UPDATED = ${JSON.stringify(updated)}\n` +
    `export const NAVER_TRENDS: NaverTrendItem[] = ${JSON.stringify(items)}\n` +
    `export const NAVER_FOOD_CATEGORY: { d: string; ratio: number }[] = ${JSON.stringify(foodCat ?? [])}\n`
  fs.writeFileSync(OUT, header, 'utf8')
  console.log(`✓ ${OUT} — 키워드 ${items.length}개(급상승 top: ${items[0]?.name} ${items[0]?.surgePct}%), 건강식품 분야 ${foodCat?.length ?? 0}개월`)
}
main()
