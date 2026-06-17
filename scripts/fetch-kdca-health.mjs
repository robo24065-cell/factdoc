// 질병관리청 국가건강정보포털 '건강정보검색 API'(승인) → 정적 코퍼스 생성.
//   목록 healthSearchListApi.do(POST srchWrd) → cntnts_sn + 제목
//   상세 healthSearchViewApi.do(POST cntnts_sn) → 섹션별 본문
// 공공누리 제4유형(출처표시+비상업+변경금지): 짧은 발췌(섹션당 ~200자)+출처만 저장. 원문 통째 재배포 X.
// per-request 외부호출 금지(§13.7) → 이 배치로 미리 구워 frontend/src/engine/kdca-corpus.ts 로 캐시.
// 사용: KDCA_TOKEN=... node scripts/fetch-kdca-health.mjs
import fs from 'node:fs'

const TOKEN = process.env.KDCA_TOKEN
if (!TOKEN) { console.error('KDCA_TOKEN 필요'); process.exit(1) }
const LIST = 'https://health.kdca.go.kr/healthinfo/openapi/svcNew/healthSearchListApi.do'
const VIEW = 'https://health.kdca.go.kr/healthinfo/openapi/svcNew/healthSearchViewApi.do'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 수집 질병 키워드(흔한 질환 위주). 키워드별 상위 N개 콘텐츠.
const KEYWORDS = [
  '당뇨', '고혈압', '고지혈증', '비만', '통풍', '골다공증', '갑상선', '위염', '역류성식도염', '변비',
  '빈혈', '천식', '아토피', '비염', '불면증', '편두통', '탈모', '우울증', '치매', '간염', 'B형간염',
  '폐렴', '협심증', '심근경색', '뇌졸중', '골관절염', '디스크', '대상포진', '백내장', '녹내장', '전립선비대',
  '과민성대장', '지방간', '만성콩팥병', '코로나', '인플루엔자', '감기', '대사증후군', '심부전', '부정맥', '위궤양', '담석',
  // EID 법정감염병(감염병 현황판 연동) — 국가건강정보포털에 있는 것만 수집됨
  '수두', '말라리아', '백일해', '성홍열', '유행성이하선염', 'A형간염', '뎅기열', '쯔쯔가무시증', '신증후군출혈열', '레지오넬라증',
  '장출혈성대장균감염증', '매독', '홍역', '일본뇌염', '세균성이질', '장티푸스', '비브리오패혈증', '결핵', '수족구병', '파상풍',
  // 흔한 생활 질환 보강(2026-06-16 포털 존재 확인) — '독감'·'코로나19'·'E형간염'·'우울증'·'역류성식도염'은 포털 빈결과라 제외
  '식중독', '장염', '류마티스', '요로감염', '갑상선기능저하증', '갱년기', '폐경', '무좀', '결막염', '중이염', '이명', '어지럼증',
  // 코퍼스 갭 보강(2026-06-17 포털 확인) — CRE/다제내성균·심혈관·간담도 등
  '다제내성균', '대동맥류', '뇌수막염', '비브리오패혈증', '간경변', '담낭염', '췌장염',
  // 코퍼스 갭 보강 2차(2026-06-17) — 엠폭스 등 주요 감염병/질환
  '엠폭스', '원숭이두창', '큐열', '라임병', '발진열', '브루셀라증', '탄저', '디프테리아', '풍진', '폐렴구균',
  '대상포진', '요로결석', '갑상선암', '위암', '대장암', '폐암', '유방암', '간암', '췌장암', '전립선암',
  '협심증', '심부전', '부정맥', '하지정맥류', '구내염', '치주질환', '안구건조증', '비문증', '수면무호흡',
]
const PER_KW = 2          // 키워드당 콘텐츠 수
const SECTION_MAX = 230   // 섹션 발췌 최대 길이(짧은 인용)
const SECTIONS_KEEP = 5   // 콘텐츠당 섹션 수

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 FactDoc/1.0' }, body })
  return res.text()
}
const enc = (s) => encodeURIComponent(s)

async function listFor(kw, tries = 0) {
  const h = await post(LIST, `TOKEN=${TOKEN}&srchWrd=${enc(kw)}&pageIndex=1&lclasSn=`)
  if (/자료가 없습니다/.test(h) && tries < 2) { await sleep(1500); return listFor(kw, tries + 1) }
  const calls = [...h.matchAll(/fn_goView\(\s*['"]?(\d+)['"]?\s*,\s*['"]([^'"]+)['"]/g)]
  const seen = new Set()
  return calls.map((m) => ({ sn: m[1], title: m[2].trim() })).filter((x) => !seen.has(x.sn) && (seen.add(x.sn), true)).slice(0, PER_KW)
}

const SECTION_LABELS = /^(개요|정의|원인|증상|진단|검사|진단 및 검사|치료|예방|관리|위험요인|위험요인 및 예방|경과|합병증|식이|생활습관|자가관리)/

function clean(s) { return s.replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim() }

async function viewFor(sn, tries = 0) {
  const h = await post(VIEW, `TOKEN=${TOKEN}&cntnts_sn=${sn}`)
  if (h.length < 1500 && tries < 2) { await sleep(1500); return viewFor(sn, tries + 1) }
  const bi = h.indexOf('<body'); const body = h.slice(bi >= 0 ? bi : 0)
  // 헤딩 단위로 분할: <h2-5> 또는 <strong>. 헤딩 라벨 + 다음 헤딩 전까지 텍스트.
  const parts = body.split(/<(?:h[2-5]|strong)[^>]*>/i)
  const out = []
  for (const p of parts) {
    const headEnd = p.search(/<\/(?:h[2-5]|strong)>/i)
    if (headEnd < 0) continue
    const label = clean(p.slice(0, headEnd).replace(/<[^>]+>/g, ''))
    if (!SECTION_LABELS.test(label)) continue
    const rest = p.slice(headEnd)
    const text = clean(rest.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' '))
    if (text.length < 30) continue
    out.push({ section: label, text: text.slice(0, SECTION_MAX) })
    if (out.length >= SECTIONS_KEEP) break
  }
  return out
}

const corpus = []
const seenSn = new Set() // 전역 중복제거 — 여러 키워드가 같은 문서를 가리켜도 1번만(A형간염 중복 등 방지)
let calls = 0
for (const kw of KEYWORDS) {
  try {
    const items = await listFor(kw); await sleep(700); calls++
    for (const it of items) {
      if (seenSn.has(it.sn)) { console.log(`  ↩ [${kw}] ${it.title} (중복 skip)`); continue }
      seenSn.add(it.sn)
      const chunks = await viewFor(it.sn); await sleep(700); calls++
      if (chunks.length) { corpus.push({ title: it.title, cntntsSn: it.sn, portal: '질병관리청 국가건강정보포털', chunks }); console.log(`  ✓ [${kw}] ${it.title} (${chunks.length}섹션)`) }
      else console.log(`  · [${kw}] ${it.title} (본문 파싱 실패)`)
    }
  } catch (e) { console.log(`  ✗ [${kw}] ${e.message}`) }
}

const q = (s) => JSON.stringify(s)
let body = ''
for (const a of corpus) {
  const ch = a.chunks.map((c) => `    { section: ${q(c.section)}, text: ${q(c.text)} },`).join('\n')
  body += `  { title: ${q(a.title)}, cntntsSn: ${q(a.cntntsSn)}, portal: ${q(a.portal)}, chunks: [\n${ch}\n  ] },\n`
}
const header = `// 질병관리청 국가건강정보포털 코퍼스 — 건강정보검색 API(승인) 배치 수집. ⚠ 수기편집 금지(재수집).\n` +
  `// 출처: 질병관리청 국가건강정보포털. 공공누리 제4유형(출처표시+비상업+변경금지) — 짧은 발췌+출처만. ${corpus.length}개 문서.\n` +
  `export interface KdcaDoc { title: string; cntntsSn: string; portal: string; chunks: { section: string; text: string }[] }\n\n` +
  `export const KDCA_CORPUS: KdcaDoc[] = [\n`
fs.writeFileSync('frontend/src/engine/kdca-corpus.ts', header + body + ']\n', 'utf8')
console.log(`\n${corpus.length}개 문서 → frontend/src/engine/kdca-corpus.ts (API 호출 ${calls}회)`)
