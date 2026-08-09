// 북한·통일 도메인 뉴스 수집량 측정 프로브
// 사용: NCP_ID=... NCP_SECRET=... node scripts/probe-nk-news.mjs [시간(h), 기본 24]
// 목적: 하루에 몇 건이 잡히는지 → 이슈 클러스터링 성립 여부 판단

const ID = process.env.NCP_ID
const SECRET = process.env.NCP_SECRET
if (!ID || !SECRET) { console.error('NCP_ID / NCP_SECRET 환경변수 필요'); process.exit(1) }

const HOURS = Number(process.argv[2] || 24)
const BASE = 'https://naverapihub.apigw.ntruss.com/search/v1/news'

// 북한·통일 도메인 키워드 (테스트용 코어 세트)
const KEYWORDS = [
  '북한', '김정은', '남북관계', '통일부', '대북정책',
  '북한이탈주민', '탈북민', '개성공단', '이산가족', '판문점',
  '비무장지대 DMZ', '북핵', '평양', '김여정', '대남',
  '남북회담', '남북교류협력', '대북제재', '북한인권', '북한군',
  '대북전단', '오물풍선', '남북합의', '북한 경제', '한반도 평화',
]

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchNews(query, start = 1) {
  const url = `${BASE}?query=${encodeURIComponent(query)}&display=100&start=${start}&sort=date&format=json`
  const r = await fetch(url, { headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET } })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const cutoff = Date.now() - HOURS * 3600 * 1000
const byUrl = new Map()      // originallink → { title, pubDate, keywords:Set }
const perKeyword = []
let calls = 0

for (const kw of KEYWORDS) {
  let inWindow = 0, page = 1, stop = false
  while (!stop && page <= 3) {           // 키워드당 최대 3페이지(300건)
    let j
    try { j = await fetchNews(kw, (page - 1) * 100 + 1); calls++ }
    catch (e) { console.error(`  ! ${kw} p${page}: ${e.message}`); break }

    const items = j.items || []
    if (items.length === 0) break

    for (const it of items) {
      const t = new Date(it.pubDate).getTime()
      if (t < cutoff) { stop = true; continue }   // date 정렬이므로 이후는 전부 과거
      inWindow++
      const key = it.originallink || it.link
      if (!byUrl.has(key)) byUrl.set(key, { title: strip(it.title), pubDate: it.pubDate, keywords: new Set() })
      byUrl.get(key).keywords.add(kw)
    }
    if (items.length < 100) break
    page++
    await sleep(120)
  }
  perKeyword.push({ kw, inWindow })
  process.stdout.write(`  ${kw}: ${inWindow}건\n`)
}

console.log('\n' + '='.repeat(58))
console.log(`측정 구간   : 최근 ${HOURS}시간`)
console.log(`키워드 수   : ${KEYWORDS.length}`)
console.log(`API 호출    : ${calls}회`)
console.log(`중복 포함   : ${perKeyword.reduce((s, x) => s + x.inWindow, 0)}건`)
console.log(`고유 기사   : ${byUrl.size}건  ← 이슈 클러스터링 입력 규모`)
console.log('='.repeat(58))

console.log('\n[키워드별 상위]')
perKeyword.sort((a, b) => b.inWindow - a.inWindow).slice(0, 12)
  .forEach(x => console.log(`  ${String(x.inWindow).padStart(4)}건  ${x.kw}`))

// 여러 키워드에 동시 등장 = 이슈성 높음 (군집 씨앗)
const multi = [...byUrl.values()].filter(v => v.keywords.size >= 2)
  .sort((a, b) => b.keywords.size - a.keywords.size)
console.log(`\n[복수 키워드 매칭 기사] ${multi.length}건 — 이슈 후보`)
multi.slice(0, 15).forEach(v => console.log(`  [${v.keywords.size}] ${v.title.slice(0, 60)}`))

console.log('\n[최신 기사 샘플 10건]')
;[...byUrl.values()].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0, 10)
  .forEach(v => console.log(`  ${v.pubDate.slice(5, 22)} | ${v.title.slice(0, 55)}`))
