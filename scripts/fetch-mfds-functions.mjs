// 식약처 건강기능식품정보(1471000/HtfsInfoService03) → 원료별 '인정 기능성(MAIN_FNCTN)' 스냅샷.
// 건기식 자동반증 룰(§13.2·§13.11)에 실데이터 연결: "○○ 건기식이 △△병 치료" → 인정 기능성은 '도움'뿐 → 허위.
// 사용: DATA_GO_KR_API_KEY=... node scripts/fetch-mfds-functions.mjs
import fs from 'node:fs'

const KEY = process.env.DATA_GO_KR_API_KEY
if (!KEY) { console.error('DATA_GO_KR_API_KEY 필요'); process.exit(1) }
const BASE = 'https://apis.data.go.kr/1471000/HtfsInfoService03/getHtfsItem01'

// 표시 원료명 → 검색 키워드(제품명 부분일치). 우리 온톨로지/INGREDIENTS와 정합.
const RAWS = [
  '홍삼', '인삼', '가르시니아', '루테인', '오메가3', '프로바이오틱스', '비타민C', '비타민D', '비타민A', '비타민E',
  '칼슘', '마그네슘', '아연', '철분', '엽산', '밀크씨슬', '글루코사민', '코엔자임Q10', '쏘팔메토', '콜라겐',
  '은행잎', '헛개', '프로폴리스', '셀레늄', '크롬', '비오틴', '클로렐라', '스피루리나', '알로에', '녹차추출물',
  '가시오갈피', '구기자', '노니', '달맞이꽃', '차전자피', '키토산', '대두이소플라본', '감마리놀렌산', '베타글루칸', '프락토올리고당',
  '보스웰리아', 'MSM', '히알루론산', '빌베리', '아스타잔틴', '테아닌', '백수오', '쏘이', '난소화성말토덱스트린', '가르시니아캄보지아',
]

function clean(s) {
  return (s || '')
    .replace(/\[[^\]]*\]/g, ' ')          // [원료명] 제거
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, ' · ')   // 번호 → 구분
    .replace(/\s+/g, ' ')
    .replace(/^\s*·\s*/, '')
    .trim()
}

async function fetchFunc(kw) {
  const url = `${BASE}?serviceKey=${encodeURIComponent(KEY)}&pageNo=1&numOfRows=1&type=json&Prduct=${encodeURIComponent(kw)}`
  try {
    const res = await fetch(url)
    const j = await res.json()
    if (j.header?.resultCode !== '00') return null
    const it = j.body?.items?.[0]?.item
    if (!it || !it.MAIN_FNCTN) return null
    return { total: Number(j.body.totalCount) || 0, func: clean(it.MAIN_FNCTN).slice(0, 160), example: (it.PRDUCT || '').trim() }
  } catch { return null }
}

const out = {}
for (const kw of RAWS) {
  const r = await fetchFunc(kw)
  if (r && r.func) { out[kw] = r; console.log(`  ✓ ${kw} (${r.total}건) → ${r.func.slice(0, 60)}`) }
  else console.log(`  · ${kw} (없음)`)
  await new Promise((res) => setTimeout(res, 120))
}
fs.writeFileSync('scripts/mfds-functions.out.json', JSON.stringify(out, null, 2))
console.log(`\n${Object.keys(out).length}/${RAWS.length}종 수집 → scripts/mfds-functions.out.json`)
