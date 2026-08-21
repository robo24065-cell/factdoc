#!/usr/bin/env node
// nk-build-region.mjs — 보유 데이터를 '지역 축'으로 재편한 nk-region.json 생성
//
// 입력(전부 로컬):
//   frontend/src/data/nk-index.json      통합 인덱스 (timeline/briefing/defectorOrigin 등)
//   북한자료-api/nkinfoTrend.json         북한정보포털 동향 (items[].sj 제목)
//   북한자료-api/nkinfoOverview.json      북한개황 (items[].sj/cn)
//   frontend/src/data/nk-map.json        구행정구역 crosswalk (isanOrigin 대응키)
// 외부(익명 다운로드, scripts/.cache/noaa-gsod/ 캐시):
//   NOAA isd-history.csv → CTRY=KN 현행 지점 → GSOD 연도별 일자료 마지막 행(최신 관측)
//
// 산출: 북한자료-api/nk-region.json
//   { builtAt, sources[], regions: { 지역명: { id, mapRegionId, aliases,
//       events:{total,latest[≤30]}, briefings, trends, overviews,
//       frozen|null, defectorOrigin|null, isanOrigin, weather[] } },
//     cities[], meta }
//
// 사용: node scripts/nk-build-region.mjs [--built-at=YYYY-MM-DD] [--force] [--no-weather]
//   --built-at   산출 메타 builtAt (미지정 시 BUILD_DATE env → 실행 시점 날짜)
//   --force      NOAA 캐시 무시하고 재다운로드
//   --no-weather 날씨 수집 생략(오프라인 재실행용 — 기존 산출의 weather 유지 시도)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOPIC_STATUS } from './nk-catalog.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(__dirname, '.cache', 'noaa-gsod')
const OUT_FILE = path.join(ROOT, '북한자료-api', 'nk-region.json')

const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const NO_WEATHER = args.includes('--no-weather')
const builtAtArg = args.find(a => a.startsWith('--built-at='))
const BUILT_AT = builtAtArg ? builtAtArg.split('=')[1]
  : (process.env.BUILD_DATE || new Date().toISOString().slice(0, 10))

// ── 1. 지역 사전(현행 13축) ──────────────────────────────────────────────────
// mapRegionId: frontend/src/data/nk-map.json regionsModern[].id 와 조인용.
//   남포·개성은 이 지도 판본에 별도 폴리곤이 없다(개성은 황해북도 폴리곤에 포함) → null + note.
// isanOrigin: 이산가족 출신지(광복 당시 구행정구역) 축과의 대응키 — nk-map.json crosswalk 기준.
//   수치는 화면에서 isan 데이터와 조인한다(여기엔 키만 기록).
const REGIONS = [
  { name: '평양',     id: 'pyongyang',  mapRegionId: 'pyongyang',  aliases: ['평양'],
    isan: { key: 'pyongan-s-old', name: '평안남도(구)' } },
  { name: '남포',     id: 'nampo',      mapRegionId: null,         aliases: ['남포'],
    mapNote: '현행 지도 폴리곤 없음(평안남도 일대) — 도시 마커로 표현',
    isan: { key: 'pyongan-s-old', name: '평안남도(구)' } },
  { name: '개성',     id: 'kaesong',    mapRegionId: null,         aliases: ['개성'],
    mapNote: '현행 지도에서 황해북도 폴리곤에 포함 — 도시 마커로 표현',
    isan: { key: 'gyeonggi-unrec', name: '미수복경기' } },
  { name: '라선',     id: 'rason',      mapRegionId: 'rason',      aliases: ['라선', '나선', '라진', '나진', '선봉'],
    isan: { key: 'hamgyong-n-old', name: '함경북도(구)' } },
  { name: '평안남도', id: 'pyongan-s',  mapRegionId: 'pyongan-s',  aliases: ['평안남도', '평남'],
    isan: { key: 'pyongan-s-old', name: '평안남도(구)' } },
  { name: '평안북도', id: 'pyongan-n',  mapRegionId: 'pyongan-n',  aliases: ['평안북도', '평북'],
    isan: { key: 'pyongan-n-old', name: '평안북도(구)' } },
  { name: '자강도',   id: 'chagang',    mapRegionId: 'chagang',    aliases: ['자강도'],
    isan: { key: 'pyongan-n-old', name: '평안북도(구)' } },
  { name: '황해남도', id: 'hwanghae-s', mapRegionId: 'hwanghae-s', aliases: ['황해남도', '황남'],
    isan: { key: 'hwanghae-old', name: '황해도(구)' } },
  { name: '황해북도', id: 'hwanghae-n', mapRegionId: 'hwanghae-n', aliases: ['황해북도', '황북'],
    isan: { key: 'hwanghae-old', name: '황해도(구)' } },
  { name: '강원도',   id: 'kangwon',    mapRegionId: 'kangwon',    aliases: ['강원도(북측)', '북강원'],
    isan: { key: 'gangwon-unrec', name: '미수복강원' } },
  { name: '함경남도', id: 'hamgyong-s', mapRegionId: 'hamgyong-s', aliases: ['함경남도', '함남'],
    isan: { key: 'hamgyong-s-old', name: '함경남도(구)' } },
  { name: '함경북도', id: 'hamgyong-n', mapRegionId: 'hamgyong-n', aliases: ['함경북도', '함북'],
    isan: { key: 'hamgyong-n-old', name: '함경북도(구)' } },
  { name: '량강도',   id: 'ryanggang',  mapRegionId: 'ryanggang',  aliases: ['량강도', '양강도'],
    isan: { key: 'hamgyong-s-old', name: '함경남도(구)' } },
]

// 지역명 직접 매칭 정규식(도시 제외). 오탐 방지 가드:
//   자강도 — '자강력(자강력제일주의)' 오탐 방지 위해 '자강도'만.
//   라선 — '나선형/나서다 활용형' 오탐 방지: '라선' + '나선특별시/나선시/나선경제…'만.
//   강원도 — 남한 강원과 겹침 → 별도 규칙(아래 KANGWON_*): 북측 도시 매칭 우선,
//            '강원도' 단독 표기는 북측 단서가 있고 남측 도시가 없을 때만 인정.
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
// '北'(한자 약칭)은 연표·동향 제목에서 지배적인 북한 표기다 — 빠뜨리면 '北， 강원도 깃대령…',
// '北, 강원도 김화군 지방공업공장 현지지도' 같은 명백한 북측 항목이 통째로 누락된다(실측 23건).
const KANGWON_NORTH_CUE = /북한|북측|이북|북강원|북조선|北/
const KANGWON_SOUTH_MARK = /속초|강릉|춘천|양양|동해시|삼척|평창|정선군|태백|홍천|원주|영월|인제군|화천|양구|횡성/
// 남북 양쪽에 같은 지명이 있어 도시 매칭에 넣지 않는 것: 철원(대부분 DMZ·남측 문맥), 고성군(남측 제진역 등).
// → 이들은 위 北/남측마커 규칙으로만 판정한다.

// ── 2. 도시 → 지역 매핑 (오탐 가드 포함) ─────────────────────────────────────
// 가드 사유: 원산지(무역), 함흥차사, 해주(~해주다 활용형), 무산되다, 정주영, 개천절,
//   구성(단어), 안주(단어), 장전(탄약), 달라진/사라진(라진), 세포(생물), 김책공대(평양 소재) 등.
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
  // 북측 전용 강원도 시·군 (남한 동명 지명 없음 또는 '군' 접미로 분리 가능)
  { name: '금강군', region: '강원도',   re: /금강군/ },
  { name: '회양',   region: '강원도',   re: /회양(?=군|읍)/ },
  { name: '고산군', region: '강원도',   re: /고산군/ },
  { name: '천내',   region: '강원도',   re: /천내(?=군)/ },
  { name: '깃대령', region: '강원도',   re: /깃대령/ },
  { name: '김화',   region: '강원도',   re: /김화군/ },              // 남측은 '김화읍'(철원군) — '군'으로 분리
  { name: '이천군', region: '강원도',   re: /이천군/ },              // 남측 이천은 '이천시'(경기)
  { name: '갈마',   region: '강원도',   re: /갈마(?=반도|지구|비행장|해안)/ },
  { name: '창도',   region: '강원도',   re: /창도(?=군)/ },
  { name: '법동',   region: '강원도',   re: /법동(?=군)/ },
  { name: '판교군', region: '강원도',   re: /판교군/ },              // 남측 판교는 '판교동/판교신도시'(성남)
  { name: '신계',   region: '황해북도', re: /신계(?=군)/ },
  { name: '룡연',   region: '황해남도', re: /룡연(?=군)/ },
  { name: '장연',   region: '황해남도', re: /장연(?=군)/ },
  { name: '연백',   region: '황해남도', re: /연백/ },
  { name: '나진',   region: '라선',     re: /(?<![가-힣])[라나]진(?=항|시|만|지구|경제|선봉|[·ㆍ\-‐–]|[를을이가은는에의와과]|\s|$)/ },
]

// ── 3. frozen (nk-catalog.mjs TOPIC_STATUS 단일 진실 소스) ────────────────────
const FROZEN_BY_REGION = {
  '개성':   { topic: 'econ.kaesong', ...pickStatus('econ.kaesong') },
  '강원도': { topic: 'econ.kumgang', ...pickStatus('econ.kumgang') },
}
function pickStatus(topic) {
  const s = TOPIC_STATUS[topic]
  if (!s || s.state !== 'frozen') throw new Error(`TOPIC_STATUS['${topic}'] frozen 아님 — 카탈로그 확인 필요`)
  return { reason: s.text, since: s.since }
}

// ── 4. 탈북민 재북 출신지역 13축 → 현행 지역명 표기 통일 ─────────────────────
const DEFECTOR_AXIS = {
  '강원': '강원도', '남포': '남포', '양강': '량강도', '자강': '자강도',
  '평남': '평안남도', '평북': '평안북도', '평양': '평양',
  '함남': '함경남도', '함북': '함경북도', '황남': '황해남도', '황북': '황해북도',
  '개성': '개성',   // '기타(재외 등)'은 지역이 아니므로 meta 로
}

// ── 4b. isanOrigin 조인 키 — isan.json 은 두 축에서 라벨 표기가 다르다 ────────
//   isan.json monthly[].origin  : 황해·평남·평북·함남·함북·미수복경기·미수복강원
//   isan.json latest.byOrigin   : 황해·평남·평북·함남·함북·경기·강원(+기타)
// 화면에서 조인할 때 어느 축을 쓰느냐에 따라 키가 달라지므로 둘 다 기록한다(수치는 여기에 넣지 않음).
const ISAN_JOIN = {
  'hwanghae-old':   { monthlyKey: '황해',       latestKey: '황해' },
  'pyongan-s-old':  { monthlyKey: '평남',       latestKey: '평남' },
  'pyongan-n-old':  { monthlyKey: '평북',       latestKey: '평북' },
  'hamgyong-s-old': { monthlyKey: '함남',       latestKey: '함남' },
  'hamgyong-n-old': { monthlyKey: '함북',       latestKey: '함북' },
  'gangwon-unrec':  { monthlyKey: '미수복강원', latestKey: '강원' },
  'gyeonggi-unrec': { monthlyKey: '미수복경기', latestKey: '경기' },
}

// ── 5. NOAA GSOD 지점 → 지역 배정 (CTRY=KN 현행 27지점, 이름 기준) ───────────
const STATION_REGION = {
  'SENBONG':          { kr: '선봉',       region: '라선' },
  'SAMJIYON':         { kr: '삼지연',     region: '량강도' },
  'CHONGJIN':         { kr: '청진',       region: '함경북도' },
  'CHUNGGANG':        { kr: '중강',       region: '자강도' },
  'HYESAN':           { kr: '혜산',       region: '량강도' },
  'KANGGYE':          { kr: '강계',       region: '자강도' },
  'PUNGSAN':          { kr: '풍산',       region: '량강도' },
  'KIMCHAEK/SONGJIN': { kr: '김책(성진)', region: '함경북도' },
  'SUPUNG':           { kr: '수풍',       region: '평안북도' },
  'CHANGJIN':         { kr: '장진',       region: '함경남도' },
  'SINUIJU':          { kr: '신의주',     region: '평안북도' },
  'KUSONG':           { kr: '구성',       region: '평안북도' },
  'HUICHON':          { kr: '희천',       region: '자강도' },
  'HAMHEUNG':         { kr: '함흥',       region: '함경남도' },
  'SINPO':            { kr: '신포',       region: '함경남도' },
  'ANJU':             { kr: '안주',       region: '평안남도' },
  'YANGDOK':          { kr: '양덕',       region: '평안남도' },
  'WONSAN':           { kr: '원산',       region: '강원도' },
  'PYONGYANG INTL':   { kr: '평양(순안)', region: '평양' },
  'NAMPO':            { kr: '남포',       region: '남포' },
  'CHANGJON':         { kr: '장전',       region: '강원도' },
  'SARIWON':          { kr: '사리원',     region: '황해북도' },
  'SINGYE':           { kr: '신계',       region: '황해북도' },
  'RYONGYON':         { kr: '룡연',       region: '황해남도' },
  'HAEJU':            { kr: '해주',       region: '황해남도' },
  'KAESONG':          { kr: '개성',       region: '개성' },
  'PYONGGANG':        { kr: '평강',       region: '강원도' },
}
// 이름 미등록 지점 폴백: 최근접 앵커(위경도)
const REGION_ANCHORS = [
  ['평양', 39.03, 125.75], ['남포', 38.73, 125.41], ['개성', 37.97, 126.55],
  ['라선', 42.25, 130.30], ['평안남도', 39.62, 125.66], ['평안북도', 40.10, 124.40],
  ['자강도', 40.97, 126.60], ['황해남도', 38.03, 125.70], ['황해북도', 38.51, 125.76],
  ['강원도', 39.15, 127.44], ['함경남도', 39.93, 127.54], ['함경북도', 41.78, 129.82],
  ['량강도', 41.40, 128.18],
]

const ISD_HISTORY_URL = 'https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv'
const GSOD_BASE = 'https://www.ncei.noaa.gov/data/global-summary-of-the-day/access'
const WEATHER_YEARS = [2026, 2025]   // 2026 파일 우선, 없으면(404) 2025 폴백 — usedYear 로 기록

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const f2c = f => Math.round((f - 32) * 5 / 9 * 10) / 10
const in2mm = v => Math.round(v * 25.4 * 10) / 10

function matchRegions(text) {
  const hit = new Set()
  for (const r of REGIONS) {
    if (REGION_RES[r.name].some(re => re.test(text))) hit.add(r.name)
  }
  for (const c of CITIES) if (c.re.test(text)) hit.add(c.region)
  // 강원도 단독 표기: 북측 단서 + 남측 도시 부재일 때만
  if (!hit.has('강원도') && KANGWON_DIRECT.test(text)
      && KANGWON_NORTH_CUE.test(text) && !KANGWON_SOUTH_MARK.test(text)) {
    hit.add('강원도')
  }
  return hit
}

function parseCsvLine(line) {
  const out = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

async function download(url, cachePath, { minBytes = 100 } = {}) {
  if (!FORCE && fs.existsSync(cachePath) && fs.statSync(cachePath).size > minBytes) {
    return fs.readFileSync(cachePath, 'utf8')
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (text.length < minBytes) throw new Error(`본문 ${text.length}B — 너무 작음`)
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  fs.writeFileSync(cachePath, text)
  return text
}

// ── 날씨 수집 ────────────────────────────────────────────────────────────────
// 연도 디렉터리 존재 여부를 1회만 확인(HEAD). 없는 연도에 27번 404를 때리지 않기 위해서이기도 하고,
// "2026년 자료가 아직 없다"는 사실 자체를 산출물 메타에 남기기 위해서다(as-of 3상태 모델의 stale 근거).
async function probeYears(years) {
  const availability = {}
  const usable = []
  for (const y of years) {
    try {
      const res = await fetch(`${GSOD_BASE}/${y}/`, { method: 'HEAD', signal: AbortSignal.timeout(60_000) })
      availability[y] = res.ok ? '열려 있음' : '아직 게시되지 않음'
      if (res.ok) usable.push(y)
    } catch (e) {
      availability[y] = '확인 실패'
    }
  }
  return { availability, usable }
}

async function collectWeather() {
  const summary = { attempted: 0, succeeded: 0, failed: [], stations: 0, requestedYears: WEATHER_YEARS }
  const byRegion = {}
  let hist
  try {
    hist = await download(ISD_HISTORY_URL, path.join(CACHE_DIR, 'isd-history.csv'), { minBytes: 100_000 })
  } catch (e) {
    summary.failed.push({ step: 'isd-history', error: String(e.message || e) })
    return { byRegion, summary }
  }
  const lines = hist.split('\n')
  const header = parseCsvLine(lines[0])
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
  const stations = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const f = parseCsvLine(line)
    if (f[col['CTRY']] !== 'KN') continue
    const end = f[col['END']] || ''
    if (end < '20250101') continue   // 현행(최근 보고) 지점만 — 실측 27개
    const name = (f[col['STATION NAME']] || '').trim()
    const usaf = f[col['USAF']], wban = f[col['WBAN']]
    let map = STATION_REGION[name]
    if (!map) {
      const lat = parseFloat(f[col['LAT']]), lon = parseFloat(f[col['LON']])
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        let best = null, bd = Infinity
        for (const [rname, alat, alon] of REGION_ANCHORS) {
          const d = (lat - alat) ** 2 + (lon - alon) ** 2
          if (d < bd) { bd = d; best = rname }
        }
        map = { kr: name, region: best, note: '이름 미등록 — 최근접 좌표로 배정' }
      }
    }
    if (!map) { summary.failed.push({ station: name, error: '지역 배정 불가' }); continue }
    stations.push({ usaf, wban, name, ...map })
  }
  summary.stations = stations.length

  const { availability, usable } = await probeYears(WEATHER_YEARS)
  summary.yearAvailability = availability
  if (!usable.length) {
    summary.failed.push({ step: 'year-probe', error: `사용 가능한 GSOD 연도 없음: ${JSON.stringify(availability)}` })
    return { byRegion, summary }
  }

  for (const st of stations) {
    summary.attempted++
    let done = false
    const tried = []
    for (const year of usable) {
      const id = `${st.usaf}${st.wban}`
      const url = `${GSOD_BASE}/${year}/${id}.csv`
      try {
        const csv = await download(url, path.join(CACHE_DIR, String(year), `${id}.csv`), { minBytes: 300 })
        const rows = csv.trim().split('\n')
        if (rows.length < 2) throw new Error('데이터 행 없음')
        const h = parseCsvLine(rows[0])
        const c = Object.fromEntries(h.map((x, i) => [x.replace(/"/g, '').trim(), i]))
        const last = parseCsvLine(rows[rows.length - 1])
        const num = (idx, missing) => {
          const v = parseFloat(last[idx])
          return (!Number.isFinite(v) || v === missing) ? null : v
        }
        const temp = num(c['TEMP'], 9999.9)
        const max = num(c['MAX'], 9999.9)
        const min = num(c['MIN'], 9999.9)
        const prcp = num(c['PRCP'], 99.99)
        const rec = {
          station: st.kr, stationEn: st.name, usaf: st.usaf, wban: st.wban,
          date: (last[c['DATE']] || '').replace(/"/g, ''),
          tempC: temp == null ? null : f2c(temp),
          maxC: max == null ? null : f2c(max),
          minC: min == null ? null : f2c(min),
          prcpMm: prcp == null ? null : in2mm(prcp),
          usedYear: year,
        }
        ;(byRegion[st.region] ||= []).push(rec)
        summary.succeeded++
        done = true
        break
      } catch (e) {
        tried.push(`${year}: ${String(e.message || e)}`)
      }
    }
    if (!done) summary.failed.push({ station: `${st.name}(${st.usaf})`, error: tried.join(' / ') })
  }

  // 관측 최신일 — 화면 as-of 배지의 근거. 요청 연도(2026)와 실제 사용 연도가 다르면 그 사실을 명시한다.
  const all = Object.values(byRegion).flat()
  const dates = all.map(r => r.date).filter(Boolean).sort()
  summary.latestObsDate = dates.length ? dates[dates.length - 1] : null
  summary.earliestObsDate = dates.length ? dates[0] : null
  summary.usedYears = [...new Set(all.map(r => r.usedYear))].sort()
  if (summary.usedYears.length && !summary.usedYears.includes(WEATHER_YEARS[0])) {
    summary.asOfNote = `${WEATHER_YEARS[0]}년 자료는 NOAA에 아직 게시되지 않았습니다. `
      + `실제로 쓴 것은 ${summary.usedYears.join('/')}년 자료이고, 최신 관측일은 ${summary.latestObsDate} 이며 `
      + `그 이후는 확인되지 않았습니다.`
  }
  return { byRegion, summary }
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[nk-build-region] builtAt=${BUILT_AT} force=${FORCE} weather=${!NO_WEATHER}`)

  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'data', 'nk-index.json'), 'utf8'))
  const trend = JSON.parse(fs.readFileSync(path.join(ROOT, '북한자료-api', 'nkinfoTrend.json'), 'utf8'))
  const overview = JSON.parse(fs.readFileSync(path.join(ROOT, '북한자료-api', 'nkinfoOverview.json'), 'utf8'))
  const nkMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'data', 'nk-map.json'), 'utf8'))

  const timeline = idx.records.filter(r => r.datasetId === 'timeline')
  const briefing = idx.records.filter(r => r.datasetId === 'briefing')
  const trendItems = trend.items || []
  const ovItems = overview.items || []

  // 집계 준비
  const acc = {}
  for (const r of REGIONS) {
    acc[r.name] = { events: [], briefings: 0, trends: 0, overviews: 0 }
  }
  const cityCount = Object.fromEntries(CITIES.map(c => [c.name, { timeline: 0, briefing: 0, trend: 0 }]))

  // 연표
  for (const rec of timeline) {
    const text = `${rec.title || ''}\n${rec.body || ''}`
    const hit = matchRegions(text)
    for (const name of hit) acc[name].events.push({ date: rec.occurredOn || null, title: rec.title })
    for (const c of CITIES) if (c.re.test(text)) cityCount[c.name].timeline++
  }
  // 보도자료
  for (const rec of briefing) {
    const text = `${rec.title || ''}\n${rec.body || ''}`
    const hit = matchRegions(text)
    for (const name of hit) acc[name].briefings++
    for (const c of CITIES) if (c.re.test(text)) cityCount[c.name].briefing++
  }
  // 동향(제목만)
  for (const it of trendItems) {
    const text = it.sj || ''
    if (!text) continue
    const hit = matchRegions(text)
    for (const name of hit) acc[name].trends++
    for (const c of CITIES) if (c.re.test(text)) cityCount[c.name].trend++
  }
  // 개황(제목+본문 — 문서 단위 언급 수)
  for (const it of ovItems) {
    const text = `${it.sj || ''}\n${it.cn || ''}`
    const hit = matchRegions(text)
    for (const name of hit) acc[name].overviews++
  }

  // 탈북민 출신지역
  const defector = {}
  let defectorEtc = null
  for (const rec of idx.records.filter(r => r.datasetId === 'defectorOrigin')) {
    const axis = (rec.factKey || '').replace('defectorOrigin.', '')
    const m = (rec.body || '').match(/남\s*([\d,]+)명\s*·\s*여\s*([\d,]+)명\s*·\s*전체\s*([\d,]+)명/)
    if (!m) { console.warn(`[warn] defectorOrigin 본문 파싱 실패: ${rec.title}`); continue }
    const val = {
      male: parseInt(m[1].replace(/,/g, ''), 10),
      female: parseInt(m[2].replace(/,/g, ''), 10),
      total: parseInt(m[3].replace(/,/g, ''), 10),
      axisLabel: axis, asOf: rec.asOf || null,
      cumulativeSince: '1998-01-01',   // nk-catalog CUMULATIVE.defectorOrigin
    }
    const regionName = DEFECTOR_AXIS[axis]
    if (regionName) defector[regionName] = val
    else defectorEtc = val   // 기타(재외 등)
  }

  // 날씨
  let weatherByRegion = {}, weatherSummary = { skipped: true }
  if (!NO_WEATHER) {
    ({ byRegion: weatherByRegion, summary: weatherSummary } = await collectWeather())
  } else if (fs.existsSync(OUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'))
      for (const [name, obj] of Object.entries(prev.regions || {})) {
        if (obj.weather?.length) weatherByRegion[name] = obj.weather
      }
      weatherSummary = { skipped: true, reusedFrom: prev.builtAt }
    } catch { /* 무시 */ }
  }

  // 지역 객체 조립
  const regions = {}
  for (const r of REGIONS) {
    const a = acc[r.name]
    a.events.sort((x, y) => (y.date || '').localeCompare(x.date || ''))
    regions[r.name] = {
      id: r.id,
      mapRegionId: r.mapRegionId,
      ...(r.mapNote ? { mapNote: r.mapNote } : {}),
      aliases: r.aliases,
      events: { total: a.events.length, latest: a.events.slice(0, 30) },
      briefings: a.briefings,
      trends: a.trends,
      overviews: a.overviews,
      frozen: FROZEN_BY_REGION[r.name] || null,
      defectorOrigin: defector[r.name] || null,
      isanOrigin: { ...r.isan, ...(ISAN_JOIN[r.isan.key] || {}) },
      weather: weatherByRegion[r.name] || [],
    }
  }

  const cities = CITIES.map(c => ({
    name: c.name, region: c.region,
    mentions: cityCount[c.name],
  }))

  const out = {
    builtAt: BUILT_AT,
    sources: [
      { name: '남북관계연표 · 통일부 보도자료 · 북한이탈주민 재북 출신지역별 현황',
        file: 'frontend/src/data/nk-index.json', builtAt: idx.builtAt,
        urls: ['https://www.data.go.kr/data/15090949/fileData.do', 'https://www.unikorea.go.kr'] },
      { name: '북한정보포털 동향', file: '북한자료-api/nkinfoTrend.json',
        url: 'https://nkinfo.unikorea.go.kr', asOf: trend._meta?.asOf || null,
        coverageEnd: trend._meta?.coverageEnd || null, items: trendItems.length },
      { name: '북한개황(포털)', file: '북한자료-api/nkinfoOverview.json',
        url: 'https://nkinfo.unikorea.go.kr', asOf: overview._meta?.asOf || null, items: ovItems.length },
      { name: 'NOAA 관측지점 이력(북한 지점)', url: ISD_HISTORY_URL, accessedAt: BUILT_AT },
      { name: 'NOAA 일별 기상 요약', url: `${GSOD_BASE}/{year}/{USAF}{WBAN}.csv`,
        accessedAt: BUILT_AT },
      { name: '구행정구역 대응표(이산가족 출신지 축)', file: 'frontend/src/data/nk-map.json',
        builtAt: nkMap.builtAt },
    ],
    regions,
    cities,
    meta: {
      regionAxis: REGIONS.map(r => r.name),
      scanned: { timeline: timeline.length, briefing: briefing.length,
        trendTitles: trendItems.length, overviewDocs: ovItems.length },
      defectorOriginEtc: defectorEtc,   // '기타(재외 등)' — 지역 아님
      weather: weatherSummary,
      matching: {
        method: '지역명·별칭과 도시명의 부분일치. 연표·보도자료는 제목과 본문, 동향은 제목만, 개황은 제목과 본문(문서 단위)을 훑는다.',
        kangwonRule: '북측 도시(원산·금강산·통천·문천·안변·마식령·장전항·평강군·세포군 등) 매칭 우선. "강원도" 단독 표기는 북측 단서(북한/북측/이북/북강원)가 있고 남측 도시(속초·강릉·춘천 등)가 없을 때만 북한 강원으로 집계.',
        caveats: [
          '개성 건수에는 개성공단 문서가 많이 포함된다.',
          '백두산 언급은 지리적 실체(량강도)로 집계하나 상징적 용례가 섞일 수 있음.',
          '해주·나진처럼 이름이 같은 남측 지명이 섞이는 것을 줄였으나 완전하지 않음.',
        ],
      },
      isanNote: '이산가족 출신지(광복 당시 구행정구역) 축의 대응키만 기록한다 — 수치는 화면에서 이산가족 자료와 맞물린다. 근사 대응이다.',
    },
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1), 'utf8')
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(0)
  console.log(`[write] ${OUT_FILE} (${kb}KB)`)

  // 실측 요약
  const top = (key) => Object.entries(regions)
    .map(([n, r]) => [n, key === 'events' ? r.events.total : r[key]])
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([n, v]) => `${n} ${v}`).join(' · ')
  console.log(`[요약] events 상위5: ${top('events')}`)
  console.log(`[요약] trends 상위5: ${top('trends')}`)
  console.log(`[요약] briefings 상위5: ${top('briefings')}`)
  if (!weatherSummary.skipped) {
    console.log(`[요약] 날씨: ${weatherSummary.succeeded}/${weatherSummary.attempted} 지점 성공 (지점 발견 ${weatherSummary.stations})`)
    console.log(`[요약] 연도 가용성: ${JSON.stringify(weatherSummary.yearAvailability)} → 사용 ${JSON.stringify(weatherSummary.usedYears)}, 최신 관측일 ${weatherSummary.latestObsDate}`)
    if (weatherSummary.asOfNote) console.log(`[요약] as-of: ${weatherSummary.asOfNote}`)
    if (weatherSummary.failed.length) console.log('[요약] 날씨 실패:', JSON.stringify(weatherSummary.failed))
  }
}

main().catch(e => { console.error('[fatal]', e); process.exit(1) })
