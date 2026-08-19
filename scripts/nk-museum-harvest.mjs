#!/usr/bin/env node
// nk-museum-harvest.mjs — 통일부 「남북이산가족 디지털박물관」 공개 사료 수집 → 북한자료-api/museum.json
//
// 수집원 (전부 실측 HTTP. 실패는 실패로 기록하고 추정치로 채우지 않는다):
//   ① 컬렉션 목록   CollectionView.do?col_id=N&mid=SM00000263
//        정적 HTML 에 제목이 없다. 본문 스크립트의 document.title = "… > 컬렉션 > 향수(鄕愁)" 에서 뽑는다.
//   ② 사료 목록     POST CollectionViewList.do?mid=SM00000263  (body: col_id=N&pageIndex=P)
//        JS 가 부르는 조각 HTML. <a href="CollectionRecord.do?i_id=..&col_id=..&pageIndex=..">
//        ★ 실측: 쿼리스트링의 limit/page 는 무시된다. 실제 페이징은 **body 의 pageIndex** 이고
//          **누적(cumulative)** 이다 — pageIndex=P 는 1..P 페이지를 한꺼번에 돌려준다(1페이지=6건).
//          그래서 "링크가 더 안 늘어날 때까지" pageIndex 를 1 씩 올리는 방식으로 끝을 판정한다.
//   ③ 사료 상세     CollectionRecord.do?i_id=N&col_id=M&pageIndex=1&mid=SM00000263
//        제목 · 생산일자 · 등록번호 · 생산자 · 기증자 · 출처정보 · 형태정보 · 내용 · file_id[]
//
// 세션: mid 파라미터 없이 부르면 302. 먼저 museum/view.do 로 JSESSIONID 를 받아 쿠키를 물고 다닌다.
//       reunion.unikorea.go.kr 은 TLS 체인 문제가 있어 curl -k 가 필수(기존 nk-isan-harvest.mjs 와 동일).
//
// ★ 이미지: HandLttrImageView.do?mid=SM00000262&file_id=F 는 쿠키 없이/외부 Referer 로도 200 JPEG 다.
//   (mid=SM00000262 가 없으면 302.) **파일은 내려받아 저장하지 않는다 — 기증자 저작권.** URL 만 기록한다.
//   검증 시에도 매직바이트만 메모리에서 확인하고 즉시 버린다(디스크 기록 없음).
//
// 지역 태깅: scripts/nk-build-region.mjs 의 지역 사전·도시 매핑·오탐 가드를 **그대로** 옮겨 쓴다.
//   nk-build-region.mjs 는 import 즉시 main() 이 실행돼(네트워크 포함) 모듈로 못 불러온다 →
//   사전을 복사하되 verifyDictSync() 가 원본 소스와 정규식 문자열이 일치하는지 매 실행 검사한다.
//
// 실행: node scripts/nk-museum-harvest.mjs [--built-at=YYYY-MM-DD] [--force] [--max-col=20] [--delay=300]
//   --force    캐시 무시하고 전부 재수집
//   --delay    요청 간 최소 대기(ms, 기본 300 — 하한 300 강제)
// 재실행 가능. 키 불필요.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, '북한자료-api', 'museum.json')
const CACHE = path.join(ROOT, '북한자료-api', '_cache', 'museum')
const REGION_SRC = path.join(__dirname, 'nk-build-region.mjs')

const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const argOf = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : d }
const BUILT_AT = argOf('built-at', process.env.BUILD_DATE || new Date().toISOString().slice(0, 10))
const MAX_COL = +argOf('max-col', 20)
const DELAY_MS = Math.max(300, +argOf('delay', 300))     // 정부 서버 배려 — 하한 300ms
const MAX_CONSEC_FAIL = 30
let LAST_COL_SCANNED = 0
const EMPTY_COL_STREAK_STOP = 5

const BASE = 'https://reunion.unikorea.go.kr'
const COL_BASE = `${BASE}/reuni/home/museum/archive/collection`
const ARC_BASE = `${BASE}/reuni/home/museum/archive`
const MID_MUSEUM = 'SM00000261'   // 박물관 진입(세션 발급)
const MID_IMAGE = 'SM00000262'    // ★ 이미지 뷰어. 없으면 302
const MID_COLLECTION = 'SM00000263'
const MID_ARCHIVE = 'SM00000264'  // 기록관(형태별 사료) — 전량 목록/상세
const URLS = {
  session: `${BASE}/reuni/home/museum/view.do?gubn=A&mid=${MID_MUSEUM}`,
  collectionView: (c) => `${COL_BASE}/CollectionView.do?col_id=${c}&mid=${MID_COLLECTION}`,
  collectionList: `${COL_BASE}/CollectionViewList.do?mid=${MID_COLLECTION}`,
  record: (i, c) => `${COL_BASE}/CollectionRecord.do?i_id=${i}&col_id=${c}&pageIndex=1&mid=${MID_COLLECTION}`,
  image: (f) => `${BASE}/reuni/home/museum/archive/letter/HandLttrImageView.do?mid=${MID_IMAGE}&file_id=${f}`,
  archiveList: `${ARC_BASE}/ArchivesList.do`,
  archiveRecord: (i) => `${ARC_BASE}/RecordView.do?i_id=${i}&mid=${MID_ARCHIVE}`,
}
const ARCHIVE_PAGE_UNIT = 100

const die = (m) => { console.error('✗ ' + m); process.exit(1) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── 요청 게이트: 모든 원격 호출은 여기를 지난다(최소 간격 보장 + 연속 실패 차단) ──
const NET = { calls: 0, fail: 0, consecFail: 0, bytes: 0, lastAt: 0 }
async function gate() {
  const wait = DELAY_MS - (Date.now() - NET.lastAt)
  if (wait > 0) await sleep(wait)
  NET.lastAt = Date.now()
}
function noteOk(bytes) { NET.calls++; NET.bytes += bytes; NET.consecFail = 0 }
function noteFail(label, err) {
  NET.calls++; NET.fail++; NET.consecFail++
  console.warn(`  ⚠ 실패(${NET.consecFail}연속) ${label}: ${err}`)
  if (NET.consecFail >= MAX_CONSEC_FAIL) die(`연속 실패 ${MAX_CONSEC_FAIL}회 — 중단(서버 이상 또는 차단 의심)`)
}

const COOKIE = path.join(CACHE, 'cookies.txt')
const SINK = path.join(CACHE, '.sink')   // curl -o 버림용(윈도우 NUL 경로 이슈 회피)
function curl(extra, label, { retries = 2 } = {}) {
  let last
  for (let a = 0; a <= retries; a++) {
    try {
      const buf = execFileSync('curl', [
        '-sk', '--max-time', '120', '-A', 'Mozilla/5.0 (compatible; nk-museum-harvest/1.0)',
        '-b', COOKIE, '-c', COOKIE, ...extra,
      ], { maxBuffer: 1 << 28 })
      return buf
    } catch (e) { last = e }
  }
  throw new Error(`curl 실패: ${label} — ${last?.message}`)
}
async function getText(url, label) {
  await gate()
  try {
    const buf = curl(['-w', '\n__HTTP__%{http_code}', url], label)
    const s = buf.toString('utf8')
    const cut = s.lastIndexOf('\n__HTTP__')
    const code = +s.slice(cut + 9).trim()
    const body = s.slice(0, cut)
    if (code !== 200) throw new Error(`HTTP ${code}`)
    noteOk(body.length)
    return body.replace(/^﻿+/, '')
  } catch (e) { noteFail(label, String(e.message || e)); return null }
}
async function postText(url, body, label) {
  await gate()
  try {
    const buf = curl(['-X', 'POST', '-H', 'Content-Type: application/x-www-form-urlencoded',
      '--data', body, '-w', '\n__HTTP__%{http_code}', url], label)
    const s = buf.toString('utf8')
    const cut = s.lastIndexOf('\n__HTTP__')
    const code = +s.slice(cut + 9).trim()
    if (code !== 200) throw new Error(`HTTP ${code}`)
    noteOk(cut)
    return s.slice(0, cut).replace(/^﻿+/, '')
  } catch (e) { noteFail(label, String(e.message || e)); return null }
}

// ── HTML 유틸 ────────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, k) => ENT[k])
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)))
}
// <BR> 은 줄바꿈으로 살린다(사료 '내용'이 줄 단위 서술이라 의미가 실린다).
// ★ 상세는 "<BR>" 뒤에 개행이 붙어 오고 기록관 카드는 생 개행으로 온다 — <BR> 뒤 공백까지 같이 먹어야
//   같은 사료의 두 경로 텍스트가 문자열로 일치한다(실측: 안 그러면 겹침 215건 중 190건이 공백 차이로만 불일치).
function htmlToText(s) {
  return decodeEntities(
    s.replace(/<\s*br\s*\/?\s*>[ \t\r\n ]*/gi, '\n').replace(/<[^>]*>/g, '')
  ).split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim()
}
const oneLine = (s) => htmlToText(s).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()

// ══════════════════════════════════════════════════════════════════════════════
// 지역 사전 — scripts/nk-build-region.mjs 에서 그대로 옮김 (원본이 단일 진실 소스)
// ══════════════════════════════════════════════════════════════════════════════
const REGIONS = [
  '평양', '남포', '개성', '라선', '평안남도', '평안북도', '자강도',
  '황해남도', '황해북도', '강원도', '함경남도', '함경북도', '량강도',
]
const REGION_RES = {
  '평양':     [/평양/],
  '남포':     [/남포/],
  '개성':     [/개성/],
  '라선':     [/라선/, /나선(?=특별시|시|경제|지대|지구)/],
  '평안남도': [/평안남도/, /평남/],
  '평안북도': [/평안북도/, /평북/],
  '자강도':   [/자강도/],
  '황해남도': [/황해남도/, /황남/],
  '황해북도': [/황해북도/, /황북/],
  '강원도':   [],   // KANGWON 규칙으로만
  '함경남도': [/함경남도/, /함남/],
  '함경북도': [/함경북도/, /함북/],
  '량강도':   [/량강도/, /양강도/],
}
const KANGWON_DIRECT = /강원도|북강원/
const KANGWON_NORTH_CUE = /북한|북측|이북|북강원|북조선|北/
const KANGWON_SOUTH_MARK = /속초|강릉|춘천|양양|동해시|삼척|평창|정선군|태백|홍천|원주|영월|인제군|화천|양구|횡성/
const CITIES = [
  { name: '신의주', region: '평안북도', re: /신의주/ },
  { name: '원산',   region: '강원도',   re: /원산(?!지)/ },
  { name: '함흥',   region: '함경남도', re: /함흥(?!차사)/ },
  { name: '청진',   region: '함경북도', re: /청진/ },
  { name: '해주',   region: '황해남도', re: /(?:^|[^가-힣])해주(?![기는고며면었셨서야도록니지다든])/ },
  { name: '사리원', region: '황해북도', re: /사리원/ },
  { name: '혜산',   region: '량강도',   re: /혜산/ },
  { name: '강계',   region: '자강도',   re: /(?<!금)강계(?!곡)/ },
  { name: '금강산', region: '강원도',   re: /금강산/ },
  { name: '만포',   region: '자강도',   re: /만포/ },
  { name: '회령',   region: '함경북도', re: /회령/ },
  { name: '무산',   region: '함경북도', re: /무산(?=군|광산|지구|철산)/ },
  { name: '김책',   region: '함경북도', re: /김책(?=시|제철)/ },
  { name: '단천',   region: '함경남도', re: /단천/ },
  { name: '흥남',   region: '함경남도', re: /흥남/ },
  { name: '신포',   region: '함경남도', re: /신포/ },
  { name: '장진',   region: '함경남도', re: /장진(?=호|군)/ },
  { name: '구성',   region: '평안북도', re: /구성시/ },
  { name: '정주',   region: '평안북도', re: /정주(?=시|군)/ },
  { name: '영변',   region: '평안북도', re: /영변/ },
  { name: '동창리', region: '평안북도', re: /동창리/ },
  { name: '철산',   region: '평안북도', re: /철산(?=군|리)/ },
  { name: '수풍',   region: '평안북도', re: /수풍/ },
  { name: '풍계리', region: '함경북도', re: /풍계리/ },
  { name: '온성',   region: '함경북도', re: /온성(?=군|읍)/ },
  { name: '백두산', region: '량강도',   re: /백두산/ },
  { name: '삼지연', region: '량강도',   re: /삼지연/ },
  { name: '개천',   region: '평안남도', re: /개천(?=시|군)/ },
  { name: '안주',   region: '평안남도', re: /안주(?=시|군|지구)/ },
  { name: '평성',   region: '평안남도', re: /평성(?=시)/ },
  { name: '순안',   region: '평양',     re: /순안(?=공항|비행장|구역)/ },
  { name: '희천',   region: '자강도',   re: /희천/ },
  { name: '중강',   region: '자강도',   re: /중강(?=군|진)/ },
  { name: '통천',   region: '강원도',   re: /통천/ },
  { name: '문천',   region: '강원도',   re: /문천/ },
  { name: '안변',   region: '강원도',   re: /안변/ },
  { name: '마식령', region: '강원도',   re: /마식령/ },
  { name: '장전항', region: '강원도',   re: /장전항/ },
  { name: '평강',   region: '강원도',   re: /평강(?=군)/ },
  { name: '세포',   region: '강원도',   re: /세포(?=군|등판)/ },
  { name: '금강군', region: '강원도',   re: /금강군/ },
  { name: '회양',   region: '강원도',   re: /회양(?=군|읍)/ },
  { name: '고산군', region: '강원도',   re: /고산군/ },
  { name: '천내',   region: '강원도',   re: /천내(?=군)/ },
  { name: '깃대령', region: '강원도',   re: /깃대령/ },
  { name: '김화',   region: '강원도',   re: /김화군/ },
  { name: '이천군', region: '강원도',   re: /이천군/ },
  { name: '갈마',   region: '강원도',   re: /갈마(?=반도|지구|비행장|해안)/ },
  { name: '창도',   region: '강원도',   re: /창도(?=군)/ },
  { name: '법동',   region: '강원도',   re: /법동(?=군)/ },
  { name: '판교군', region: '강원도',   re: /판교군/ },
  { name: '신계',   region: '황해북도', re: /신계(?=군)/ },
  { name: '룡연',   region: '황해남도', re: /룡연(?=군)/ },
  { name: '장연',   region: '황해남도', re: /장연(?=군)/ },
  { name: '연백',   region: '황해남도', re: /연백/ },
  { name: '나진',   region: '라선',     re: /(?<![가-힣])[라나]진(?=항|시|만|지구|경제|선봉|[·ㆍ\-‐–]|[를을이가은는에의와과]|\s|$)/ },
]

// 원본과의 드리프트 감시 — 정규식 원문이 nk-build-region.mjs 안에 그대로 있는지 확인.
function verifyDictSync() {
  const out = { checked: 0, missing: [], sourceFile: 'scripts/nk-build-region.mjs' }
  let src
  try { src = fs.readFileSync(REGION_SRC, 'utf8') }
  catch (e) { out.error = `원본을 읽지 못함: ${String(e.message || e)}`; return out }
  const check = (label, re) => {
    out.checked++
    if (!src.includes(re.source)) out.missing.push(`${label}: /${re.source}/`)
  }
  for (const [name, list] of Object.entries(REGION_RES)) for (const re of list) check(name, re)
  for (const c of CITIES) check(`city:${c.name}`, c.re)
  for (const [label, re] of [['KANGWON_DIRECT', KANGWON_DIRECT], ['KANGWON_NORTH_CUE', KANGWON_NORTH_CUE],
    ['KANGWON_SOUTH_MARK', KANGWON_SOUTH_MARK]]) check(label, re)
  out.inSync = out.missing.length === 0
  return out
}

function matchRegions(text) {
  const hit = new Set()
  const cityHits = []
  for (const name of REGIONS) {
    if ((REGION_RES[name] || []).some(re => re.test(text))) hit.add(name)
  }
  for (const c of CITIES) if (c.re.test(text)) { hit.add(c.region); cityHits.push(c.name) }
  if (!hit.has('강원도') && KANGWON_DIRECT.test(text)
      && KANGWON_NORTH_CUE.test(text) && !KANGWON_SOUTH_MARK.test(text)) {
    hit.add('강원도')
  }
  return { regions: REGIONS.filter(r => hit.has(r)), cities: cityHits }
}

// 구(舊)행정구역 표기 — 13축 사전에 없는 광복 당시 도명. 13축으로 '억지 배정'하지 않고
// 별도 축(regionsHistoric)에 따로 기록한다. 함경도/평안도는 남·북 분도 이전 표기라 단일 지역으로 확정 불가.
const HISTORIC_RES = [
  { name: '황해도(구)',   re: /황해도/ },
  { name: '함경도(구)',   re: /함경도/ },
  { name: '평안도(구)',   re: /평안도/ },
  { name: '미수복경기',   re: /미수복\s*경기|개풍|장단|연백평야/ },
]
function matchHistoric(text) { return HISTORIC_RES.filter(h => h.re.test(text)).map(h => h.name) }

// ══════════════════════════════════════════════════════════════════════════════
// 파서
// ══════════════════════════════════════════════════════════════════════════════
function parseCollectionTitle(html) {
  const m = /document\.title\s*=\s*"([^"]*)"/.exec(html)
  if (!m) return null
  const full = decodeEntities(m[1]).trim()
  const parts = full.split('>').map(s => s.trim())
  const leaf = parts[parts.length - 1]
  return { full, title: leaf || null }
}

function parseListFragment(html) {
  const out = []
  const re = /<a[^>]*href="CollectionRecord\.do\?i_id=(\d+)&col_id=(\d+)&pageIndex=(\d+)"[\s\S]*?<\/a>/g
  let m
  while ((m = re.exec(html))) {
    const block = m[0]
    const fid = /HandLttrImageView\.do\?file_id=(\d+)/.exec(block)
    const t = /<strong>([\s\S]*?)<\/strong>/.exec(block)
    out.push({
      iId: +m[1], colId: +m[2],
      listTitle: t ? oneLine(t[1]) : null,
      thumbFileId: fid ? +fid[1] : null,
    })
  }
  return out
}

const FIELD_MAP = {
  '생산일자': 'producedOn', '등록번호': 'regNo', '생산자': 'producer',
  '기증자': 'donor', '출처정보': 'origin', '형태정보': 'form',
}
function parseRecord(html) {
  const wrapStart = html.indexOf('bbs-view-wrap')
  if (wrapStart < 0) return { ok: false, error: 'bbs-view-wrap 없음' }
  const wrapEnd = html.indexOf('btn-wrap', wrapStart)
  const wrap = html.slice(wrapStart, wrapEnd > 0 ? wrapEnd : wrapStart + 60000)

  const tm = /<h4 class="list-tit">([\s\S]*?)<\/h4>/.exec(wrap)
  if (!tm) return { ok: false, error: 'list-tit(제목) 없음' }
  const title = oneLine(tm[1])

  const fields = {}
  const dl = /<dl[^>]*>\s*<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>\s*<\/dl>/g
  let d
  const unknown = []
  while ((d = dl.exec(wrap))) {
    const k = oneLine(d[1])
    const v = oneLine(d[2]).replace(/\s*>\s*/g, ' > ')
    if (FIELD_MAP[k]) fields[FIELD_MAP[k]] = v || null
    else unknown.push(k)
  }

  const cm = /<strong class="tit">\s*내용\s*<\/strong>\s*<p class="dec">([\s\S]*?)<\/p>/.exec(wrap)
  const content = cm ? htmlToText(cm[1]) : null

  const fileIds = []
  const im = /HandLttrImageView\.do\?file_id=(\d+)/g
  let f
  while ((f = im.exec(wrap))) { const v = +f[1]; if (!fileIds.includes(v)) fileIds.push(v) }

  return {
    ok: true, title, content,
    producedOn: fields.producedOn ?? null, regNo: fields.regNo ?? null,
    producer: fields.producer ?? null, donor: fields.donor ?? null,
    origin: fields.origin ?? null, form: fields.form ?? null,
    fileIds, unknownFields: unknown,
  }
}

// ── 기록관(ArchivesList.do) 카드 파서 ────────────────────────────────────────
// ★ 컬렉션(215건)은 기록관 전량(실측 totCnt)의 부분집합이다. 기록관 카드 한 장에
//   제목·생산연도·인명·**내용 전문**·썸네일 file_id 가 다 들어 있어서, 상세를 안 받아도
//   지역 태깅에 필요한 텍스트가 확보된다(전량 44요청 vs 상세 4천여 요청·1GB).
function parseArchiveList(html) {
  const totM = /id="totCnt"[^>]*value="(\d+)"/.exec(html)
  const totCnt = totM ? +totM[1] : null
  const items = []
  const re = /<li><a[^>]*jsRecordView\('(\d+)'\)[\s\S]*?<\/a><\/li>/g
  let m
  while ((m = re.exec(html))) {
    const b = m[0]
    const fid = /HandLttrImageView\.do\?file_id=(\d+)/.exec(b)
    const t = /<strong class="tit[^"]*">([\s\S]*?)<\/strong>/.exec(b)
    const dt = /<span class="data">([\s\S]*?)<\/span>/.exec(b)
    const nm = /<span class="name">([\s\S]*?)<\/span>/.exec(b)
    const dec = /<p class="dec">([\s\S]*?)<\/p>/.exec(b)
    const dtx = dt ? oneLine(dt[1]) : ''
    items.push({
      iId: +m[1],
      title: t ? oneLine(t[1]) : null,
      listDate: dtx && dtx !== '-' ? dtx : null,
      listName: nm ? oneLine(nm[1]) : null,
      content: dec ? htmlToText(dec[1]) : null,
      thumbFileId: fid ? +fid[1] : null,
    })
  }
  return { totCnt, items }
}

// ══════════════════════════════════════════════════════════════════════════════
// 캐시 (원문 HTML 은 1건 250KB 라 저장하지 않고, **파싱 결과만** 캐시한다)
// ══════════════════════════════════════════════════════════════════════════════
const RECCACHE = path.join(CACHE, 'records')
const LISTCACHE = path.join(CACHE, 'lists')
const readCache = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const writeCache = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o), 'utf8') }

// ══════════════════════════════════════════════════════════════════════════════
// 수집
// ══════════════════════════════════════════════════════════════════════════════
async function bootstrapSession() {
  fs.mkdirSync(CACHE, { recursive: true })
  try { fs.unlinkSync(COOKIE) } catch { /* 없으면 무시 */ }
  fs.writeFileSync(COOKIE, '')
  await gate()
  const buf = execFileSync('curl', ['-sk', '--max-time', '120', '-A', 'Mozilla/5.0 (compatible; nk-museum-harvest/1.0)',
    '-c', COOKIE, '-o', SINK, '-w', '%{http_code}', URLS.session], { maxBuffer: 1 << 20 })
  const code = +buf.toString('utf8').trim()
  if (code !== 200) die(`세션 발급 실패 HTTP ${code} — ${URLS.session}`)
  const jar = fs.readFileSync(COOKIE, 'utf8')
  if (!/JSESSIONID/.test(jar)) die('세션 쿠키(JSESSIONID) 미발급 — 이후 요청이 302 로 튕긴다')
  NET.calls++
  console.log(`  세션 OK (JSESSIONID 발급)`)
}

// pageIndex 는 **누적** 이라 "링크 수가 더 안 늘어날 때" 가 끝이다.
async function harvestCollectionList(colId) {
  const cachePath = path.join(LISTCACHE, `${colId}.json`)
  if (!FORCE) { const c = readCache(cachePath); if (c) return { ...c, fromCache: true } }

  const seen = new Map()
  let pages = 0, prev = -1, stalled = 0, lastPage = 0
  for (let p = 1; p <= 400; p++) {
    const html = await postText(URLS.collectionList, `col_id=${colId}&pageIndex=${p}`, `list col_id=${colId} p=${p}`)
    pages++
    if (html == null) { stalled++; if (stalled >= 3) break; continue }
    for (const it of parseListFragment(html)) if (!seen.has(it.iId)) seen.set(it.iId, it)
    if (seen.size === prev) { lastPage = p; break }      // 더 안 늘어남 = 끝
    prev = seen.size
    lastPage = p
    stalled = 0
  }
  const res = { colId, items: [...seen.values()], pagesFetched: pages, lastPageIndex: lastPage }
  writeCache(cachePath, res)
  return res
}

async function harvestRecord(iId, colId) {
  const cachePath = path.join(RECCACHE, `${iId}.json`)
  if (!FORCE) { const c = readCache(cachePath); if (c) return { ...c, fromCache: true } }
  const html = await getText(URLS.record(iId, colId), `record i_id=${iId}`)
  if (html == null) return { ok: false, error: 'fetch 실패' }
  const parsed = parseRecord(html)
  if (!parsed.ok) { console.warn(`  ⚠ 파싱 실패 i_id=${iId}: ${parsed.error}`); return parsed }
  writeCache(cachePath, parsed)
  return parsed
}

// 기록관 전량 목록 — pageUnit=100 으로 페이지를 1부터 끝까지. 여기 totCnt 가 박물관 전체 공개 사료 수다.
async function harvestArchiveList() {
  const cachePath = path.join(CACHE, 'archive-list.json')
  if (!FORCE) { const c = readCache(cachePath); if (c) return { ...c, fromCache: true } }
  const seen = new Map()
  let totCnt = null, pages = 0, stalled = 0
  for (let p = 1; p <= 200; p++) {
    const body = `mid=${MID_ARCHIVE}&pageIndex=${p}&i_type=&archiveType=0&listType=1`
      + `&searchType=&search=&orderType=&pageUnit=${ARCHIVE_PAGE_UNIT}`
    const html = await postText(URLS.archiveList, body, `archive list p=${p}`)
    pages++
    if (html == null) { stalled++; if (stalled >= 3) break; continue }
    stalled = 0
    const { totCnt: tc, items } = parseArchiveList(html)
    if (tc != null) totCnt = tc
    const before = seen.size
    for (const it of items) if (!seen.has(it.iId)) seen.set(it.iId, it)
    if (!items.length || seen.size === before) break        // 더 안 나오면 끝
    if (totCnt != null && seen.size >= totCnt) break
  }
  const res = { totCnt, items: [...seen.values()], pagesFetched: pages, pageUnit: ARCHIVE_PAGE_UNIT }
  writeCache(cachePath, res)
  return res
}

// 표본 검증 — recordUrl / imageUrl 이 실제 200 인지. 이미지는 **저장하지 않는다**(메모리에서 매직바이트만 확인).
async function verifySamples(records, n = 3) {
  // 표본은 두 계층(컬렉션 상세 / 기록관 목록)을 모두 덮고, 지역이 붙은 건을 우선한다 —
  // recordUrl 형태가 계층마다 다르므로(CollectionRecord.do vs RecordView.do) 한쪽만 보면 검증이 반쪽이 된다.
  const withImg = records.filter(r => r.imageUrl)
  const prefer = (src) => withImg.filter(r => r.source === src && r.regions.length)
  const fallback = (src) => withImg.filter(r => r.source === src)
  const chosen = []
  const add = (r) => { if (r && !chosen.some(x => x.iId === r.iId)) chosen.push(r) }
  for (const src of ['collectionDetail', 'archiveList']) {
    const pool = prefer(src).length ? prefer(src) : fallback(src)
    add(pool[0])
    add(pool[Math.floor(pool.length / 2)])
  }
  for (let i = 0; i < withImg.length && chosen.length < n; i++) add(withImg[i])
  chosen.length = Math.min(chosen.length, Math.max(n, chosen.length))
  const out = []
  for (const r of chosen) {
    await gate()
    let recCode = null, recErr = null
    try {
      recCode = +execFileSync('curl', ['-sk', '--max-time', '60', '-b', COOKIE, '-c', COOKIE,
        '-o', SINK, '-w', '%{http_code}', r.recordUrl], { maxBuffer: 1 << 20 }).toString().trim()
    } catch (e) { recErr = String(e.message || e) }

    await gate()
    let imgCode = null, imgBytes = null, imgMagic = null, imgErr = null
    try {
      // 쿠키 없이 + 외부 Referer — '공개 접근'임을 실측으로 보인다. 응답은 메모리에서만 다루고 버린다.
      const buf = execFileSync('curl', ['-sk', '--max-time', '60', '-H', 'Referer: https://example.com/',
        '-w', '\n__HTTP__%{http_code}', r.imageUrl], { maxBuffer: 1 << 24 })
      const cut = buf.lastIndexOf(Buffer.from('\n__HTTP__'))
      imgCode = +buf.slice(cut + 9).toString().trim()
      const body = buf.slice(0, cut)
      imgBytes = body.length
      imgMagic = body.slice(0, 2).toString('hex') === 'ffd8' ? 'JPEG'
        : body.slice(0, 4).toString('hex') === '89504e47' ? 'PNG' : `기타(${body.slice(0, 4).toString('hex')})`
    } catch (e) { imgErr = String(e.message || e) }

    out.push({
      iId: r.iId, title: r.title, source: r.source, regions: r.regions,
      recordUrl: r.recordUrl, recordHttp: recCode, ...(recErr ? { recordError: recErr } : {}),
      imageUrl: r.imageUrl, imageHttp: imgCode, imageBytes: imgBytes, imageMagic: imgMagic,
      ...(imgErr ? { imageError: imgErr } : {}),
      imageSaved: false,
      note: '이미지는 메모리에서 매직바이트만 확인하고 폐기 — 디스크에 저장하지 않음(기증자 저작권)',
    })
    console.log(`  표본 i_id=${r.iId} [${r.source}] regions=[${r.regions.join(',')}] record=${recCode} image=${imgCode} ${imgMagic ?? ''} ${imgBytes ?? ''}B`)
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`[nk-museum-harvest] builtAt=${BUILT_AT} delay=${DELAY_MS}ms force=${FORCE} maxCol=${MAX_COL}`)

  const dict = verifyDictSync()
  if (dict.error) console.warn(`  ⚠ 지역사전 원본 확인 불가: ${dict.error}`)
  else if (!dict.inSync) console.warn(`  ⚠ 지역사전 드리프트 ${dict.missing.length}건 — ${dict.missing.slice(0, 3).join(' / ')}`)
  else console.log(`  지역사전 원본 일치 확인 (${dict.checked}개 정규식)`)

  console.log('① 세션 …')
  await bootstrapSession()

  console.log('② 컬렉션 스캔 …')
  const collections = []
  let emptyStreak = 0
  for (let c = 1; c <= MAX_COL; c++) {
    LAST_COL_SCANNED = c
    const html = await getText(URLS.collectionView(c), `CollectionView col_id=${c}`)
    const t = html ? parseCollectionTitle(html) : null
    const title = t?.title || null
    const list = await harvestCollectionList(c)
    const n = list.items.length
    if (!title && n === 0) {
      emptyStreak++
      console.log(`  col_id=${c} — 없음(제목·사료 모두 0)`)
      if (emptyStreak >= EMPTY_COL_STREAK_STOP) { console.log(`  빈 col_id ${EMPTY_COL_STREAK_STOP}연속 → 스캔 종료`); break }
      continue
    }
    emptyStreak = 0
    collections.push({ colId: c, title, titleFull: t?.full ?? null, count: n, items: list.items,
      pagesFetched: list.pagesFetched, fromCache: !!list.fromCache })
    console.log(`  col_id=${c} 「${title ?? '(제목없음)'}」 ${n}건 (페이지 ${list.pagesFetched}${list.fromCache ? ', 캐시' : ''})`)
  }
  if (!collections.length) die('컬렉션을 하나도 못 찾음 — 엔드포인트/세션 구조 변경 의심')

  // i_id → 소속 col_id 들 (한 사료가 여러 컬렉션에 속한다)
  const belong = new Map()
  for (const col of collections) {
    for (const it of col.items) {
      if (!belong.has(it.iId)) belong.set(it.iId, { colIds: [], listTitle: it.listTitle, thumbFileId: it.thumbFileId })
      belong.get(it.iId).colIds.push(col.colId)
    }
  }
  const iIds = [...belong.keys()].sort((a, b) => a - b)
  console.log(`③ 사료 상세 ${iIds.length}건 (컬렉션 소속 총 ${collections.reduce((s, c) => s + c.count, 0)}건, 중복 제외) …`)

  const detail = new Map()
  const failures = []
  let titleMismatch = 0, cached = 0
  for (let k = 0; k < iIds.length; k++) {
    const iId = iIds[k]
    const b = belong.get(iId)
    const primaryCol = b.colIds[0]
    const p = await harvestRecord(iId, primaryCol)
    if (!p.ok) { failures.push({ iId, colId: primaryCol, error: p.error || 'unknown' }); continue }
    if (p.fromCache) cached++
    if (b.listTitle && p.title && b.listTitle !== p.title) titleMismatch++
    detail.set(iId, { ...p, colIds: b.colIds, primaryCol })
    if ((k + 1) % 50 === 0) console.log(`  … ${k + 1}/${iIds.length} (실패 ${failures.length})`)
  }

  // ── ④ 기록관 전량 ───────────────────────────────────────────────────────────
  // 컬렉션은 큐레이션된 일부다. 기록관(ArchivesList.do)이 박물관 공개 사료 **전량**이고,
  // 카드에 내용 전문이 실려 있어 목록만으로 지역 태깅이 된다.
  console.log('④ 기록관 전량 목록 …')
  const archive = await harvestArchiveList()
  console.log(`  totCnt=${archive.totCnt} · 수집 ${archive.items.length}건 (페이지 ${archive.pagesFetched}${archive.fromCache ? ', 캐시' : ''})`)
  const arcById = new Map(archive.items.map(it => [it.iId, it]))
  const notInArchive = iIds.filter(i => !arcById.has(i))

  // 컬렉션 상세(권위) vs 기록관 카드(전량) 일치율 — 카드 텍스트를 믿어도 되는지의 실측 근거.
  const overlap = iIds.filter(i => arcById.has(i) && detail.has(i))
  const agree = { n: overlap.length, title: 0, content: 0, contentIgnoringWhitespace: 0, nameIsProducer: 0, nameIsDonor: 0, dateInProducedOn: 0 }
  for (const i of overlap) {
    const d = detail.get(i), a = arcById.get(i)
    if (d.title === a.title) agree.title++
    if ((d.content || '') === (a.content || '')) agree.content++
    if ((d.content || '').replace(/\s+/g, '') === (a.content || '').replace(/\s+/g, '')) agree.contentIgnoringWhitespace++
    if (a.listName && a.listName === d.producer) agree.nameIsProducer++
    if (a.listName && a.listName === d.donor) agree.nameIsDonor++
    if (a.listDate && d.producedOn && d.producedOn.includes(a.listDate)) agree.dateInProducedOn++
  }
  const nameField = agree.nameIsProducer >= agree.nameIsDonor ? 'producer' : 'donor'

  // ── 병합 + 지역 태깅 ────────────────────────────────────────────────────────
  const allIds = [...new Set([...iIds, ...archive.items.map(i => i.iId)])].sort((a, b) => a - b)
  const records = []
  for (const iId of allIds) {
    const d = detail.get(iId)
    const a = arcById.get(iId)
    const inCollections = !!d
    const title = d?.title ?? a?.title ?? null
    const content = d?.content ?? a?.content ?? null
    const fileIds = d?.fileIds ?? (a?.thumbFileId != null ? [a.thumbFileId] : [])
    const text = `${title || ''}\n${content || ''}`
    const { regions, cities } = matchRegions(text)
    records.push({
      iId,
      colId: d?.primaryCol ?? null,
      colIds: d?.colIds ?? [],
      title,
      producedOn: d?.producedOn ?? a?.listDate ?? null,
      regNo: d?.regNo ?? null,
      producer: d?.producer ?? (nameField === 'producer' ? a?.listName ?? null : null),
      donor: d?.donor ?? (nameField === 'donor' ? a?.listName ?? null : null),
      origin: d?.origin ?? null,
      form: d?.form ?? null,
      content,
      fileIds,
      imageUrl: fileIds.length ? URLS.image(fileIds[0]) : null,
      recordUrl: inCollections ? URLS.record(iId, d.primaryCol) : URLS.archiveRecord(iId),
      archiveRecordUrl: URLS.archiveRecord(iId),
      regions,
      regionCities: cities,
      regionsHistoric: matchHistoric(text),
      source: inCollections ? 'collectionDetail' : 'archiveList',
      inCollections,
    })
  }
  console.log(`  병합 결과 ${records.length}건 (컬렉션 상세 ${detail.size} + 기록관 전용 ${records.length - detail.size})`)

  // ── 집계 ────────────────────────────────────────────────────────────────────
  const byRegion = {}
  for (const r of REGIONS) byRegion[r] = []
  for (const rec of records) for (const r of rec.regions) byRegion[r].push(rec.iId)
  const byRegionHistoric = {}
  for (const rec of records) for (const h of rec.regionsHistoric) (byRegionHistoric[h] ||= []).push(rec.iId)

  // 도시 단위 히트 — 어떤 지명이 지역 배정을 끌고 있는지. '금강산/장전항' 은 고향이 아니라
  // 상봉 장소(금강산 이산가족면회소)로 등장하는 경우가 있어, 강원도 수치를 읽을 때 이 분해가 필요하다.
  const cityMentions = {}
  for (const rec of records) for (const c of rec.regionCities) cityMentions[c] = (cityMentions[c] || 0) + 1
  const VENUE_CITIES = ['금강산', '장전항', '갈마']
  const kangwonIds = new Set(byRegion['강원도'])
  const kangwonVenueOnly = records.filter(r => kangwonIds.has(r.iId)
    && r.regionCities.some(c => VENUE_CITIES.includes(c))
    && !r.regionCities.some(c => !VENUE_CITIES.includes(c))).length

  const withRegion = records.filter(r => r.regions.length).length
  const withHistoricOnly = records.filter(r => !r.regions.length && r.regionsHistoric.length).length
  const withImage = records.filter(r => r.imageUrl).length
  const multiImage = records.filter(r => r.fileIds.length > 1).length

  console.log('⑤ 표본 검증(recordUrl / imageUrl 200 확인) …')
  const verification = await verifySamples(records, 4)

  // ── 산출 ────────────────────────────────────────────────────────────────────
  const out = {
    builtAt: BUILT_AT,
    sources: [
      { name: '통일부 남북이산가족 디지털박물관 — 박물관 진입(세션)',
        url: URLS.session, asOf: BUILT_AT,
        note: 'mid 파라미터가 없으면 302. 여기서 JSESSIONID 를 받아 이후 요청에 물린다.' },
      { name: '디지털박물관 컬렉션 개요(제목)',
        url: `${COL_BASE}/CollectionView.do?col_id={col_id}&mid=${MID_COLLECTION}`, asOf: BUILT_AT,
        note: '정적 HTML 에 <title> 이 비어 있고, 본문 스크립트의 document.title = "… > 컬렉션 > 제목" 에서 추출.' },
      { name: '디지털박물관 컬렉션 사료 목록(JS 호출 엔드포인트)',
        url: `${COL_BASE}/CollectionViewList.do?mid=${MID_COLLECTION}`, asOf: BUILT_AT,
        note: 'POST · x-www-form-urlencoded · body: col_id=N&pageIndex=P. 응답은 HTML 조각. '
          + '실측: 쿼리스트링 limit/page 는 무시되고 body 의 pageIndex 만 동작하며 누적(1..P)이다. 1페이지=6건.' },
      { name: '디지털박물관 사료 상세',
        url: `${COL_BASE}/CollectionRecord.do?i_id={i_id}&col_id={col_id}&pageIndex=1&mid=${MID_COLLECTION}`,
        asOf: BUILT_AT,
        note: '제목·생산일자·등록번호·생산자·기증자·출처정보·형태정보·내용·file_id 를 파싱.' },
      { name: '디지털박물관 기록관 — 공개 사료 전량 목록(JS 호출 엔드포인트)',
        url: URLS.archiveList, asOf: BUILT_AT,
        note: 'POST · x-www-form-urlencoded · body: mid=SM00000264&pageIndex=P&i_type=&archiveType=0'
          + '&listType=1&searchType=&search=&orderType=&pageUnit=100. '
          + '응답 HTML 조각의 hidden totCnt 가 공개 사료 총수이고, 카드마다 제목·생산연도·인명·**내용 전문**·썸네일 file_id 가 들어 있다. '
          + '컬렉션(CollectionViewList)은 이 전량의 큐레이션 부분집합이다.' },
      { name: '디지털박물관 기록관 사료 상세(GET)',
        url: `${ARC_BASE}/RecordView.do?i_id={i_id}&mid=${MID_ARCHIVE}`, asOf: BUILT_AT,
        note: '컬렉션에 없는 사료도 여기로 열린다(실측 i_id=25). 등록번호·기증자·출처정보·형태정보는 이 상세에만 있다. '
          + '전량 상세 수집은 1건 약 250KB × 총수 ≈ 1GB 라 기본 수집에서 제외했다(필요 시 별도 단계).' },
      { name: '사료 이미지 뷰어(URL 만 기록, 파일 미저장)',
        url: `${BASE}/reuni/home/museum/archive/letter/HandLttrImageView.do?mid=${MID_IMAGE}&file_id={file_id}`,
        asOf: BUILT_AT,
        note: `mid=${MID_IMAGE} 필수(없으면 302). 쿠키 없이·외부 Referer 로도 200 JPEG 로 공개 접근됨(실측).` },
    ],
    license: '공공누리(KOGL) 등 개방형 라이선스 표기를 사이트에서 찾지 못했다. '
      + '푸터 표기: "COPYRIGHT 2020 (C) Integrated information system for separated families. ALL RIGHTS RESERVED." '
      + '(/reuni/home/cms/page/s_copyright/view.do 는 실측 HTTP 500 으로 확인 불가.) '
      + '사료 원본은 기증자 저작물이므로 이 산출물은 **메타데이터와 URL 만** 담고 이미지 바이너리는 저장하지 않는다. '
      + '화면에서는 원본 페이지(recordUrl)로 링크하는 방식으로만 사용할 것.',
    endpoints: {
      session: URLS.session,
      collectionView: `${COL_BASE}/CollectionView.do?col_id={col_id}&mid=${MID_COLLECTION}`,
      collectionList: { method: 'POST', url: URLS.collectionList, body: 'col_id={col_id}&pageIndex={p}',
        pageSize: 6, cumulative: true },
      record: `${COL_BASE}/CollectionRecord.do?i_id={i_id}&col_id={col_id}&pageIndex=1&mid=${MID_COLLECTION}`,
      image: `${BASE}/reuni/home/museum/archive/letter/HandLttrImageView.do?mid=${MID_IMAGE}&file_id={file_id}`,
      archiveList: { method: 'POST', url: URLS.archiveList,
        body: `mid=${MID_ARCHIVE}&pageIndex={p}&i_type=&archiveType=0&listType=1&searchType=&search=&orderType=&pageUnit=${ARCHIVE_PAGE_UNIT}`,
        pageSize: ARCHIVE_PAGE_UNIT, cumulative: false, totalField: 'hidden input id="totCnt"' },
      archiveRecord: `${ARC_BASE}/RecordView.do?i_id={i_id}&mid=${MID_ARCHIVE}`,
    },
    collections: collections.map(c => ({ colId: c.colId, title: c.title, count: c.count })),
    archive: {
      totCnt: archive.totCnt,
      collected: archive.items.length,
      pagesFetched: archive.pagesFetched,
      pageUnit: archive.pageUnit,
      note: '기록관(형태별 사료) 전량. 목록 카드만으로 제목·생산연도·인명·내용 전문·썸네일을 얻는다. '
        + '등록번호·기증자·출처정보·형태정보·전체 file_id 는 상세에만 있어, 컬렉션 소속 사료에 한해 상세를 받았다.',
    },
    records,
    byRegion,
    byRegionHistoric,
    meta: {
      scanned: records.length,
      withRegion,
      withoutRegion: records.length - withRegion,
      requestDelayMs: DELAY_MS,
      collectionsFound: collections.length,
      collectionIdsScanned: `1..${LAST_COL_SCANNED}`,
      membershipTotal: collections.reduce((s, c) => s + c.count, 0),
      uniqueRecords: records.length,
      collectionUniqueRecords: iIds.length,
      bySource: {
        collectionDetail: records.filter(r => r.source === 'collectionDetail').length,
        archiveList: records.filter(r => r.source === 'archiveList').length,
      },
      archiveTotCnt: archive.totCnt,
      archiveCollected: archive.items.length,
      archiveCoverage: archive.totCnt ? +(archive.items.length / archive.totCnt * 100).toFixed(1) : null,
      collectionIdsNotInArchiveList: notInArchive,
      listVsDetailAgreement: { ...agree, nameFieldResolvedAs: nameField,
        note: '컬렉션 상세(권위)와 기록관 카드가 겹치는 건에 대한 실측 일치 수. 카드 텍스트를 믿어도 되는지의 근거.' },
      recordsInMultipleCollections: records.filter(r => r.colIds.length > 1).length,
      withImage, withoutImage: records.length - withImage, multiImageRecords: multiImage,
      withHistoricOnly,
      fieldCoverage: {
        producedOn: records.filter(r => r.producedOn).length,
        regNo: records.filter(r => r.regNo).length,
        producer: records.filter(r => r.producer).length,
        donor: records.filter(r => r.donor).length,
        origin: records.filter(r => r.origin).length,
        form: records.filter(r => r.form).length,
        content: records.filter(r => r.content).length,
      },
      failures,
      listTitleMismatch: titleMismatch,
      fromCacheRecords: cached,
      network: { calls: NET.calls, failures: NET.fail, bytes: NET.bytes },
      regionDict: dict,
      cityMentions: Object.fromEntries(Object.entries(cityMentions).sort((a, b) => b[1] - a[1])),
      kangwonVenueOnly: { count: kangwonVenueOnly, venueCities: VENUE_CITIES,
        note: '강원도로 태깅된 사료 중 근거 지명이 금강산/장전항/갈마뿐인 건수. '
          + '이산가족 상봉이 금강산면회소에서 열려서 "고향"이 아니라 "상봉 장소"로 잡힌 것일 수 있다 — 고향 축으로 쓸 때 걸러낼 것.' },
      verification,
      imagesDownloaded: 0,
      caveats: [
        '이미지 파일은 한 장도 저장하지 않았다(기증자 저작권). imageUrl 문자열만 기록한다.',
        '지역 태깅은 제목+내용 텍스트 매칭이다. 사료에 고향이 적혀 있어도 본문에 지명이 없으면 regions 는 빈 배열이며, 억지 배정하지 않았다.',
        'regions 는 nk-build-region.mjs 의 현행 13지역 축이다. "황해도/함경도/평안도" 같은 광복 당시 구(舊)도명은 '
          + '남·북 분도 이전 표기라 13축으로 확정할 수 없어 regionsHistoric 에 따로 담았다(13축에 섞지 않음).',
        '한 사료가 여러 컬렉션에 속한다. collections[].count 의 합은 사료 수보다 크다(uniqueRecords 참조).',
        '컬렉션 목록 엔드포인트의 쿼리 limit/page 는 서버가 무시한다. 실동작은 body 의 pageIndex(누적, 1페이지 6건).',
        '컬렉션 제목은 정적 <title> 이 아니라 본문 스크립트의 document.title 대입문에서 뽑는다(구조 변경 시 깨질 수 있음).',
        '개방형 라이선스 표기를 확인하지 못했다 — 재배포가 아니라 원본 링크 방식으로만 쓸 것.',
        '강원도 태깅에는 금강산(이산가족면회소) 상봉 사료가 섞인다 — 고향이 아니라 상봉 장소다. meta.kangwonVenueOnly 로 분리할 수 있다.',
        '수집은 2계층이다. (a) 컬렉션 소속 사료는 상세 페이지를 받아 전 필드를 채웠다(source=collectionDetail). '
          + '(b) 나머지 기록관 사료는 목록 카드만으로 채웠다(source=archiveList) — title·content·donor 는 채워지지만 '
          + 'regNo·producer·origin·form 은 null, producedOn 은 연도까지만, fileIds 는 썸네일 1장뿐이다. '
          + '전량 상세는 1건 약 250KB × 4천여 건 ≈ 1GB 라 받지 않았다. 필드 실적재량은 meta.fieldCoverage 참조.',
        '컬렉션 상세의 생산일자 미상은 "0000.00.00", 기록관 상세는 "-" 로 표기가 다르다(원문 그대로 보존).',
        '기록관 카드의 인명(span.name)은 생산자가 아니라 **기증자**다 — 겹침 215건에서 donor 215/215, producer 160/215 로 확인해 donor 에 넣었다(meta.listVsDetailAgreement).',
      ],
    },
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8')
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0)

  console.log(`\n✓ ${OUT} (${kb}KB)`)
  console.log(`  컬렉션 ${collections.length}종(고유 ${iIds.length}건) · 기록관 totCnt ${archive.totCnt} → 병합 ${records.length}건 · 실패 ${failures.length}건`)
  console.log(`  카드 vs 상세 일치(겹침 ${agree.n}건): 제목 ${agree.title} · 내용 ${agree.content}(공백무시 ${agree.contentIgnoringWhitespace}) · 인명=${nameField}(producer ${agree.nameIsProducer}/donor ${agree.nameIsDonor})`)
  console.log(`  강원도 ${byRegion['강원도'].length}건 중 금강산류(상봉장소)만으로 잡힌 것 ${kangwonVenueOnly}건`)
  console.log(`  지역 태깅 ${withRegion}/${records.length} (${(withRegion / records.length * 100).toFixed(1)}%) · 미태깅 ${records.length - withRegion}`)
  const top = Object.entries(byRegion).filter(([, v]) => v.length)
    .sort((a, b) => b[1].length - a[1].length).slice(0, 5)
    .map(([n, v]) => `${n} ${v.length}`).join(' · ')
  console.log(`  지역 상위5: ${top || '(없음)'}`)
  const topH = Object.entries(byRegionHistoric).sort((a, b) => b[1].length - a[1].length)
    .map(([n, v]) => `${n} ${v.length}`).join(' · ')
  console.log(`  구도명(별도 축): ${topH || '(없음)'}`)
  console.log(`  이미지 저장: 0건 (URL 만 기록) · 이미지 있는 사료 ${withImage}건`)
  console.log(`  네트워크: 요청 ${NET.calls}회 · 실패 ${NET.fail}회 · 수신 ${(NET.bytes / 1048576).toFixed(1)}MB`)
}

main().catch(e => { console.error('[fatal]', e); process.exit(1) })
