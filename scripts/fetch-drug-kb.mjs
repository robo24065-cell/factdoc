// 식약처 e약은요(의약품개요정보, 1471000/DrbEasyDrugInfoService) → 흔한 일반약 공식정보 스냅샷.
// 키를 브라우저에 노출하지 않기 위해 배치로 굽는다(§13.7). 사람들이 흔히 묻는 OTC 위주.
// 사용: DATA_GO_KR_API_KEY=... node scripts/fetch-drug-kb.mjs
import fs from 'node:fs'

const KEY = process.env.DATA_GO_KR_API_KEY
if (!KEY) { console.error('DATA_GO_KR_API_KEY 필요'); process.exit(1) }
const BASE = 'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList'

// 일반인이 자주 언급하는 일반약(상호명). 부분일치라 대표명만.
const QUERIES = [
  '타이레놀', '게보린', '펜잘', '사리돈', '부루펜', '이지엔6', '탁센', '아스피린프로텍트',
  '판콜', '판피린', '콜대원', '테라플루', '하벤', '코푸시럽', '용각산',
  '베아제', '훼스탈', '닥터베아제', '백초시럽', '까스활명수', '겔포스', '개비스콘', '베나치오',
  '우루사', '인사돌', '이가탄', '아로나민', '삐콤씨',
  '후시딘', '마데카솔', '안티푸라민', '물파스', '버물리', '제놀', '신신파스',
  '둘코락스', '비코그린', '터치엔드토우', '라미실', '카네스텐',
  '지르텍', '클라리틴', '액티피드', '화이투벤', '판토텐',
]

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()

async function fetchDrug(q) {
  const url = `${BASE}?serviceKey=${encodeURIComponent(KEY)}&itemName=${encodeURIComponent(q)}&pageNo=1&numOfRows=10&type=json`
  try {
    const res = await fetch(url)
    const j = await res.json()
    if (j.header?.resultCode !== '00') return null
    const items = (j.body?.items ?? []).filter((x) => x && x.itemName)
    if (!items.length) return null
    // 성인 대표품목 우선: 어린이/키즈/유아/소아 변형은 후순위, 효능문구 있는 것 우선
    const score = (x) => (/(어린이|키즈|유아|소아|baby|kids)/i.test(x.itemName) ? -2 : 0) + (x.efcyQesitm ? 1 : 0)
    const it = [...items].sort((a, b) => score(b) - score(a))[0]
    return {
      query: q,
      itemName: norm(it.itemName),
      entpName: norm(it.entpName),
      efcy: norm(it.efcyQesitm),
      use: norm(it.useMethodQesitm),
      warn: norm(it.atpnWarnQesitm),
      caution: norm(it.atpnQesitm),
      interact: norm(it.intrcQesitm),
      side: norm(it.seQesitm),
    }
  } catch { return null }
}

const out = []
for (const q of QUERIES) {
  const d = await fetchDrug(q)
  if (d) { out.push(d); console.log(`  ✓ ${q} → ${d.itemName}`) }
  else console.log(`  · ${q} (없음)`)
  await new Promise((r) => setTimeout(r, 120))
}
fs.writeFileSync('scripts/drug-kb.out.json', JSON.stringify(out, null, 2))
console.log(`\n${out.length}/${QUERIES.length}건 수집 → scripts/drug-kb.out.json`)
