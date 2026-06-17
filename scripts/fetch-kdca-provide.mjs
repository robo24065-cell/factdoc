// 질병관리청 국가건강정보포털 코퍼스 전수 수집 — 건강정보 제공 API(api.kdca.go.kr/api/provide).
//   ① healthInfoList(목록 1회) → 전체 cntntsSn ② healthInfo?cntntsSn= 순회(병렬) → 섹션 본문.
//   → frontend/src/engine/kdca-corpus.ts 재생성(질환 추가=재실행, §13.9 브레드스 엔진).
// 공공누리 제4유형(출처표시+비상업+변경금지): 원문 통째 X → 섹션당 짧은 발췌(SECTION_MAX) + 핵심 섹션만(MAX_SECTIONS) + 출처 cntntsSn 포인터.
// per-request 외부호출 금지(§13.7): GitHub Actions cron 배치로만 굽고 프론트는 캐시만 읽음.
// 필요: TOKEN(건강정보 API 인증키). 환경변수 KDCA_TOKEN 또는 인자. 실패 시 기존 파일 유지(데이터 유실 방지).
import fs from 'node:fs'
import https from 'node:https'
import crypto from 'node:crypto'

// ⚠ KDCA 서버는 레거시 TLS 재협상 사용 → Node 기본 fetch는 ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED로 거부.
//   node:https + SSL_OP_LEGACY_SERVER_CONNECT 에이전트로 허용(curl -L과 동일 동작). GitHub Actions(Node20)에서도 동작.
const legacyAgent = new https.Agent({ secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT, keepAlive: true })

const OUT = 'frontend/src/engine/kdca-corpus.ts'
const TOKEN = process.env.KDCA_TOKEN || process.argv[2]
const BASE = 'https://api.kdca.go.kr/api/provide'
const CONC = 12           // 동시 요청 수
const SECTION_MAX = 230   // 섹션당 발췌 글자수(변경금지·짧은 인용)
const MAX_SECTIONS = 7    // 문서당 핵심 섹션 수(번들 크기·라이선스)
// 팩트체크에 유용한 핵심 섹션 우선순위(요약/정의/증상/원인/치료/예방/합병증/위험요인). '참고문헌·병태생리'는 제외(제3자 저작물·저활용).
const SECTION_PRIORITY = ['요약문', '정의', '개요', '증상', '원인', '진단', '검사', '치료', '약물', '예방', '합병증', '위험요인', '경과', '관리', '식이']
const SKIP_SECTION = /참고문헌|관련|references/i

const cdata = (s) => (s == null ? '' : String(s).replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, ''))
function tag(xml, name) { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml); return m ? cdata(m[1]).trim() : '' }
function tagAll(xml, name) { const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'); const out = []; let m; while ((m = re.exec(xml))) out.push(m[1]); return out }
// HTML/엔티티 제거 → 평문
function clean(s) {
  return cdata(s)
    .replace(/<br\s*\/?>(?=)/gi, ' ').replace(/<\/(p|div|li|tr)>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&deg;/g, '°').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim()
}
function sectionRank(name) { const i = SECTION_PRIORITY.findIndex((p) => name.includes(p)); return i < 0 ? 99 : i }

function httpsGet(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { agent: legacyAgent, timeout: 25000, headers: { 'User-Agent': 'curl/8.0', Accept: '*/*' } }, (res) => {
      // 30x 리다이렉트 추적
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); resolve(httpsGet(new URL(res.headers.location, url).href)); return }
      let data = ''; res.setEncoding('utf8'); res.on('data', (c) => (data += c)); res.on('end', () => resolve(res.statusCode < 400 ? data : null))
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}
async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) { const t = await httpsGet(url); if (t) return t }
  return null
}

async function fetchDoc(sn) {
  const xml = await fetchText(`${BASE}/healthInfo?TOKEN=${TOKEN}&cntntsSn=${sn}`)
  if (!xml) return null
  const title = tag(xml, 'CNTNTSSJ')
  if (!title) return null // 무효 SN
  const cls = tagAll(xml, 'cntntsCl')
  const chunks = []
  for (const c of cls) {
    const section = clean(tag(c, 'CNTNTS_CL_NM')) || '개요'
    if (SKIP_SECTION.test(section)) continue
    let text = clean(tag(c, 'CNTNTS_CL_CN'))
    if (text.length < 20) continue
    if (text.length > SECTION_MAX) text = text.slice(0, SECTION_MAX)
    chunks.push({ section, text, rank: sectionRank(section) })
  }
  if (!chunks.length) return null
  chunks.sort((a, b) => a.rank - b.rank)
  return { title, cntntsSn: String(sn), portal: '질병관리청 국가건강정보포털', chunks: chunks.slice(0, MAX_SECTIONS).map(({ rank, ...c }) => c) }
}

async function pool(items, fn, conc) {
  const out = new Array(items.length); let idx = 0
  await Promise.all(Array.from({ length: conc }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i) }
  }))
  return out
}

async function main() {
  if (!TOKEN) { console.log('· KDCA_TOKEN 미설정 → 기존 kdca-corpus.ts 유지. (건강정보 API 인증키 필요)'); return }
  const listXml = await fetchText(`${BASE}/healthInfoList?TOKEN=${TOKEN}`)
  if (!listXml) { console.warn('목록 API 실패 → 기존 유지'); return }
  const lists = tagAll(listXml, 'cntntsList')
  const sns = [...new Set(lists.map((x) => tag(x, 'CNTNTS_SN')).filter(Boolean))]
  if (!sns.length) { console.warn('목록 0건 → 기존 유지'); return }
  console.log(`  목록 ${sns.length}건 수집 시작(동시 ${CONC})…`)

  const docsRaw = (await pool(sns, fetchDoc, CONC)).filter(Boolean)
  // 동일 제목 중복 → 섹션 많은 것 채택
  const byTitle = new Map()
  for (const d of docsRaw) {
    const cur = byTitle.get(d.title)
    if (!cur || d.chunks.length > cur.chunks.length) byTitle.set(d.title, d)
  }
  const docs = [...byTitle.values()].sort((a, b) => +a.cntntsSn - +b.cntntsSn)
  if (docs.length < 100) { console.warn(`수집 ${docs.length}건(<100) — 비정상 의심, 기존 유지`); return }

  const body = docs.map((d) => {
    const chunks = d.chunks.map((c) => `    { section: ${JSON.stringify(c.section)}, text: ${JSON.stringify(c.text)} },`).join('\n')
    return `  { title: ${JSON.stringify(d.title)}, cntntsSn: ${JSON.stringify(d.cntntsSn)}, portal: ${JSON.stringify(d.portal)}, chunks: [\n${chunks}\n  ] },`
  }).join('\n')
  const totalSections = docs.reduce((s, d) => s + d.chunks.length, 0)
  const header = `// 질병관리청 국가건강정보포털 코퍼스 — 건강정보 제공 API(healthInfoList+healthInfo) 전수 수집. ⚠ 수기편집 금지(재수집).\n` +
    `// 출처: 질병관리청 국가건강정보포털. 공공누리 제4유형(출처표시+비상업+변경금지) — 섹션당 짧은 발췌(${SECTION_MAX}자)+출처 포인터만. ${docs.length}개 문서 / ${totalSections}개 섹션.\n` +
    `export interface KdcaDoc { title: string; cntntsSn: string; portal: string; chunks: { section: string; text: string }[] }\n\n` +
    `export const KDCA_CORPUS: KdcaDoc[] = [\n${body}\n]\n`
  fs.writeFileSync(OUT, header, 'utf8')
  console.log(`✓ ${OUT} 재생성 — ${docs.length}개 문서 / ${totalSections}개 섹션 (목록 ${sns.length} 중 본문보유)`)
}
main()
