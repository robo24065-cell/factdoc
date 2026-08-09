// 북한·통일 이슈 레이더 — 전수 수집 → 노이즈 필터 → 군집화 → 오늘의 이슈 TOP N
// 사용: NCP_ID=... NCP_SECRET=... node scripts/nk-issue-radar.mjs [시간(h)=24] [TOP=10]
//
// 빅카인즈의 "오늘의 이슈" 를 북한·통일 도메인에 특화해 재현한다.
// 클러스터링은 TF-IDF 코사인 + 단일연결(union-find). 임베딩 없이 결정론적으로 동작.

const ID = process.env.NCP_ID, SECRET = process.env.NCP_SECRET
if (!ID || !SECRET) { console.error('NCP_ID / NCP_SECRET 필요'); process.exit(1) }

const HOURS = Number(process.argv[2] || 24)
const TOPN = Number(process.argv[3] || 10)
const BASE = 'https://naverapihub.apigw.ntruss.com/search/v1/news'
const MAX_PAGES = 5          // 키워드당 최대 500건
const SLEEP_MS = 70

// ─────────────────────────────────────────────────────────────
// 1. 키워드 세트 — 광의어('북한' 단독)를 세분화해 노이즈 유입을 줄임
// ─────────────────────────────────────────────────────────────
const KEYWORDS = [
  // 인물
  '김정은','김여정','김주애','최선희','리설주','김정일','조용원','박정천','김덕훈','현송월',
  // 기관·매체
  '조선노동당','조선중앙통신','노동신문','북한 국무위원회','통일전선부','북한 외무성','조선인민군','북한 총참모부',
  // 군사·안보
  '북한 미사일','북한 탄도미사일','북한 ICBM','북한 핵실험','북한 무인기','북한 방사포','북한 순항미사일',
  '북한 도발','9·19 군사합의','서해 북방한계선','NLL 북한','북한 위성 발사','북한 정찰위성','북핵','비핵화',
  '북한 우라늄','영변 핵시설','북한 잠수함','북한 열병식','북한 군사정찰',
  // 남북관계
  '남북관계','남북회담','남북대화','남북합의','남북교류협력','남북연락사무소','남북 정상회담',
  '개성공단','금강산 관광','이산가족','이산가족 상봉','판문점','판문점 견학','공동경비구역',
  '대북전단','오물풍선','대남 쓰레기 풍선','대북 확성기','남북 철도','경의선','동해선',
  // 정책·제재·외교
  '통일부','통일부 장관','대북정책','대북제재','유엔 대북제재','북미회담','북미 관계','6자회담',
  '대북지원','대북 인도적 지원','종전선언','평화협정','한반도 평화','한반도 비핵화','흡수통일','두 국가론',
  // 탈북·인권
  '탈북민','북한이탈주민','탈북','북한인권','북한인권보고서','강제북송','하나원','탈북 청소년',
  '북한이탈주민 정착','북한 정치범수용소','북한 인권침해',
  // 경제·사회
  '북한 경제','북한 주민','북한 식량','북한 물가','북한 장마당','북한 무역','북중 무역','북러 협력',
  '북러 정상회담','북한 파병','북한 노동자','북한 관광','원산갈마','북한 수해','북한 코로나',
  '북한 교육','북한 문화','북한 체제','북한 세습','북한 화폐',
  // 접경·DMZ
  'DMZ','비무장지대','접경지역','통일전망대','민통선','강화 접경',
  // 통일 담론
  '통일교육','통일 인식','평화통일','민족공동체','통일 준비','통일 비용',
]

// ─────────────────────────────────────────────────────────────
// 2. 노이즈 필터용 어휘
// ─────────────────────────────────────────────────────────────
// STRONG: 하나만 있어도 도메인 기사로 인정
const STRONG = ['김정은','김여정','김주애','최선희','김정일','리설주','조선중앙통신','노동신문','조선노동당',
  '인민군','총참모부','통일전선부','평양','원산갈마','개성공단','금강산','판문점','공동경비구역','판문점선언',
  '탈북','북한이탈주민','하나원','강제북송','북송','북핵','비핵화','영변','대북제재','대북전단','오물풍선',
  '남북회담','남북정상회담','이산가족','9·19','군사합의','NLL','북방한계선','노동당','최고인민회의',
  '통일부','북한군','북한 주민','북한 미사일','북한 경제','정찰위성','열병식','비무장지대','민통선','조선인민']
// WEAK: 2개 이상 동시 등장해야 인정
const WEAK = ['북한','북','남북','통일','한반도','대북','평화','DMZ','접경','정전','분단','민족','국방','안보','미사일','핵']
// 반복 노이즈 패턴 (STRONG 부재 시에만 적용)
const NOISE = [/연합예배/,/기도회/,/성회/,/찬양/,/목사/,/교회/,/성당/,/법회/,
  /당대표\s*후보/,/전당대회/,/지방선거/,/공천/,/최고위원/,/원내대표/,
  /광복절\s*경축/,/광복\s*8\d주년\s*기념식/,/체육대회/,/축제\s*개막/,/음악회/,/백일장/,
  /부고/,/인사\s*발령/,/신간/,/오늘의\s*운세/,/증시/,/코스피/,/환율\s*마감/]

const strip = (s) => (s || '').replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function countHits(text, list) {
  const set = new Set()
  for (const w of list) if (text.includes(w)) set.add(w)
  return set
}

function classify(title, desc) {
  const t = `${title} ${desc}`
  const strong = countHits(t, STRONG)
  const weak = countHits(t, WEAK)
  if (strong.size >= 1) return { ok: true, reason: `strong:${[...strong].slice(0, 3).join(',')}` }
  if (NOISE.some(re => re.test(t))) return { ok: false, reason: 'noise-pattern' }
  if (weak.size >= 2) return { ok: true, reason: `weak×${weak.size}` }
  return { ok: false, reason: `weak×${weak.size} only` }
}

// ─────────────────────────────────────────────────────────────
// 3. 수집
// ─────────────────────────────────────────────────────────────
async function fetchNews(query, start) {
  const url = `${BASE}?query=${encodeURIComponent(query)}&display=100&start=${start}&sort=date&format=json`
  const r = await fetch(url, { headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const cutoff = Date.now() - HOURS * 3600 * 1000
const docs = new Map()   // url → doc
let calls = 0, rawInWindow = 0

console.log(`▶ 수집 시작 — 키워드 ${KEYWORDS.length}개 / 최근 ${HOURS}h\n`)
for (let i = 0; i < KEYWORDS.length; i++) {
  const kw = KEYWORDS[i]
  let page = 1, stop = false, got = 0
  while (!stop && page <= MAX_PAGES) {
    let j
    try { j = await fetchNews(kw, (page - 1) * 100 + 1); calls++ }
    catch (e) { break }
    const items = j.items || []
    if (!items.length) break
    for (const it of items) {
      const ts = new Date(it.pubDate).getTime()
      if (!(ts >= cutoff)) { stop = true; continue }
      rawInWindow++; got++
      const key = it.originallink || it.link
      if (docs.has(key)) { docs.get(key).kw.add(kw); continue }
      docs.set(key, { url: key, title: strip(it.title), desc: strip(it.description), ts, kw: new Set([kw]) })
    }
    if (items.length < 100) break
    page++
    await sleep(SLEEP_MS)
  }
  if ((i + 1) % 20 === 0) process.stdout.write(`  ...${i + 1}/${KEYWORDS.length} (호출 ${calls}, 고유 ${docs.size})\n`)
  await sleep(SLEEP_MS)
}

// ─────────────────────────────────────────────────────────────
// 4. 노이즈 필터
// ─────────────────────────────────────────────────────────────
const all = [...docs.values()]
const kept = [], dropped = []
for (const d of all) {
  const c = classify(d.title, d.desc)
  d.reason = c.reason
  ;(c.ok ? kept : dropped).push(d)
}

// ─────────────────────────────────────────────────────────────
// 5. TF-IDF + 단일연결 군집화
// ─────────────────────────────────────────────────────────────
const STOP = new Set(['그리고','하지만','대해','대한','위해','통해','따르면','밝혔다','said','있다','했다','한다','이다','기자','뉴스','연합뉴스','종합','속보','단독','포토','영상','사진','오늘','내일','지난','올해','관련','최근','우리','이번','당시','서울','기사'])
function tokens(d) {
  const t = `${d.title} ${d.title} ${d.desc}`   // 제목 가중 2배
  const raw = t.match(/[가-힣]{2,}|[A-Za-z]{3,}|\d{2,4}[년월일]?/g) || []
  return raw.map(s => s.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|까지|부터|한다|했다|이다)$/, ''))
            .filter(s => s.length >= 2 && !STOP.has(s))
}
const N = kept.length
const df = new Map()
for (const d of kept) { d.tf = new Map(); for (const w of tokens(d)) d.tf.set(w, (d.tf.get(w) || 0) + 1)
  for (const w of new Set(d.tf.keys())) df.set(w, (df.get(w) || 0) + 1) }
for (const d of kept) {
  let norm = 0; d.vec = new Map()
  for (const [w, f] of d.tf) {
    const idf = Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 1
    if (df.get(w) > N * 0.35) continue            // 너무 흔한 말 제외
    const v = (1 + Math.log(f)) * idf
    d.vec.set(w, v); norm += v * v
  }
  d.norm = Math.sqrt(norm) || 1
}
const cos = (a, b) => {
  const [s, l] = a.vec.size < b.vec.size ? [a, b] : [b, a]
  let dot = 0; for (const [w, v] of s.vec) { const u = l.vec.get(w); if (u) dot += v * u }
  return dot / (a.norm * b.norm)
}
const parent = kept.map((_, i) => i)
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a }
const TH = 0.34
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (cos(kept[i], kept[j]) >= TH) union(i, j)

const groups = new Map()
kept.forEach((d, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(d) })
const clusters = [...groups.values()].map(g => {
  g.sort((a, b) => b.ts - a.ts)
  const kwAll = new Set(); g.forEach(d => d.kw.forEach(k => kwAll.add(k)))
  // 대표 기사 = 클러스터 내 다른 문서와 평균 유사도가 가장 높은 것
  let rep = g[0], best = -1
  for (const d of g) { let s = 0; for (const e of g) if (d !== e) s += cos(d, e); const avg = g.length > 1 ? s / (g.length - 1) : 0
    if (avg > best) { best = avg; rep = d } }
  return { size: g.length, rep, docs: g, kw: [...kwAll] }
}).sort((a, b) => b.size - a.size)

// ─────────────────────────────────────────────────────────────
// 6. 리포트
// ─────────────────────────────────────────────────────────────
const line = '═'.repeat(64)
console.log('\n' + line)
console.log(`API 호출        : ${calls}회`)
console.log(`구간 내 수집    : ${rawInWindow}건 (중복 포함)`)
console.log(`고유 기사       : ${all.length}건`)
console.log(`노이즈 제거     : -${dropped.length}건 (${(dropped.length / all.length * 100).toFixed(1)}%)`)
console.log(`유효 기사       : ${kept.length}건  ← 클러스터링 입력`)
console.log(`군집 수         : ${clusters.length}개`)
console.log(`  · 2건 이상    : ${clusters.filter(c => c.size >= 2).length}개`)
console.log(`  · 단독 기사   : ${clusters.filter(c => c.size === 1).length}개`)
console.log(line)

console.log(`\n📌 오늘의 북한·통일 이슈 TOP ${TOPN}\n`)
clusters.slice(0, TOPN).forEach((c, i) => {
  console.log(`${String(i + 1).padStart(2)}. [${String(c.size).padStart(3)}건] ${c.rep.title.slice(0, 62)}`)
  console.log(`     키워드: ${c.kw.slice(0, 6).join(', ')}`)
  c.docs.slice(1, 3).forEach(d => console.log(`     └ ${d.title.slice(0, 58)}`))
  console.log('')
})

console.log('\n[노이즈로 걸러진 샘플 12건]')
dropped.slice(0, 12).forEach(d => console.log(`  (${d.reason}) ${d.title.slice(0, 55)}`))

console.log('\n[유효 판정 샘플 8건 — 필터 근거]')
kept.slice(0, 8).forEach(d => console.log(`  (${d.reason}) ${d.title.slice(0, 55)}`))
