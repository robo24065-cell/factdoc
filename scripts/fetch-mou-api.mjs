// 통일부 OpenAPI 수집 — 북한자료-api/<key>.json (append-only 누적)
//
//   node scripts/fetch-mou-api.mjs                  증분 (기본)
//   node scripts/fetch-mou-api.mjs --full           전량 재수집(기존 위에 병합, 삭제 없음)
//   node scripts/fetch-mou-api.mjs briefing trendDaily     일부만
//   node scripts/fetch-mou-api.mjs --plan           호출하지 않고 계획만 출력
//
// 사용자 지시: "옛날 데이터는 계속 쌓아두고 최신꺼 갱신해서 추가"
//   → 기존 파일을 덮어쓰지 않는다. _pk 로 upsert 하고, 내용이 바뀐 건 revisions[] 에 옛 판을 남긴다.
//     (fact_key 가 같은 사실의 여러 시점 스냅샷을 잇는다 = '입장 변경 추적'이 공짜로 나온다)
//
// ⚠ 이 스크립트가 '어떻게 부르는가'의 진실 소스, nk-catalog 는 '어떻게 해석하는가'의 진실 소스다.
//   둘의 endpoint 가 어긋나면 시작할 때 경고한다.

import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from './nk-env.mjs'
import { DATASETS } from './nk-catalog.mjs'

loadEnv(path.resolve('api.txt'))
const KEY = process.env.DATA_GO_KR_API_KEY || process.env.PUBLIC_DATA_KEY
if (!KEY) { console.error('DATA_GO_KR_API_KEY 없음 (api.txt)'); process.exit(1) }

const OUT = path.resolve(process.env.NK_API_DIR || '북한자료-api')
const B = 'https://apis.data.go.kr/1250000'
const TODAY = new Date().toISOString().slice(0, 10)
const T8 = TODAY.replace(/-/g, '')

const GAP = Number(process.env.NK_API_GAP || 400)          // 호출 간격(ms) — 공공 API 예의
const TIMEOUT = Number(process.env.NK_API_TIMEOUT || 90000) // nesdta/nktalkmng 백엔드가 느리다
const MAXP = Number(process.env.NK_API_MAX_PAGES || 700)   // 스모크 테스트용 상한
const argv = process.argv.slice(2)
const FULL = argv.includes('--full')
const PLAN = argv.includes('--plan')
const only = argv.filter(a => !a.startsWith('-'))

const sleep = ms => new Promise(r => setTimeout(r, ms))
let CALLS = 0, FAILS = 0

// ── 호출 ────────────────────────────────────────────────────
// ★ resultCode !== '0' 이면 반드시 재시도한다. db_error 를 '0건'으로 삼키면
//   coverageEnd 가 조용히 잘못 밀린다 — 금강산 함정(파일 날짜 2020 / 실제 2008)과 같은 구조다.
async function call(ep, params, tries = 3) {
  const u = new URL(ep)
  u.searchParams.set('serviceKey', KEY)        // 디코딩된 일반 인증키. set 이 인코딩까지 한다
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  let last = null
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(2000 * 2 ** i)
    await sleep(GAP); CALLS++
    let text
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) })
      text = await r.text()
      if (r.status !== 200) { last = `HTTP ${r.status} ${text.slice(0, 60)}`; continue }
    } catch (e) { last = e.message; continue }
    let j
    try { j = JSON.parse(text) } catch { last = `JSON 아님 ${text.slice(0, 80)}`; continue }
    const rc = String(j.resultCode ?? '')
    if (rc !== '0') { last = `resultCode ${rc} ${j.resultMsg || ''}`; continue }
    // items 는 1건일 때 객체로 올 수 있다(공공API 흔한 패턴)
    const items = Array.isArray(j.items) ? j.items : (j.items ? [j.items] : [])
    return { ok: true, items }
  }
  FAILS++
  return { ok: false, items: [], error: last }
}

/* ══ ★ 이 API 군의 페이징은 깨져 있다. 산술로 우회한다. ═══════════════════
   실측한 오프셋 규칙 (2026-08-12, search·trend·nesdta 3개 모두 동일):
       pageNo=1  → 결과집합의 행[1 .. n]          ← 행0(최신 1건)이 잘린다
       pageNo=k≥2 → 행[k·n−1 .. (k+1)·n−2]

   그래서 그냥 페이징하면 행[n+1 .. 2n−2] 가 통째로 사라진다. n=100 이면 99행.
   n=50 의 p2(오프셋 99)·p3(오프셋 149)가 행[99..198] 을 덮어 그 구멍을 정확히 메운다.

   검증:
     search  동향/thema=4   페이징 2,465 → 복구 후 2,564   (사전 예측 2,564 정확히 일치)
     nesdta  2024년         페이징   281 → 복구 후   369   (창 방식 370 중 369)
     trend   n=10/28행 집합 p2 가 9행    → 규칙 k·n−1 과 일치

   ⚠ 행0 은 어떤 (n, pageNo) 조합으로도 도달할 수 없다.
     → 데이터셋마다 '최신 1건'이 영구 비가시. totalCount 도 총건수가 아니다(반환행수 에코).
       실증: trend 최대 trendMngNo 134653 인데 nkinfo 통합검색엔 134654 가 있다. */
async function sweep(ep, base, label) {
  const rows = []
  let first = 0
  for (let p = 1; p <= MAXP; p++) {
    const res = await call(ep, { ...base, pageNo: p, numOfRows: 100 })
    if (!res.ok) { log(`  ! ${label} p${p} ${res.error}`); break }
    if (p === 1) first = res.items.length
    rows.push(...res.items)
    if (res.items.length < 100) break
    if (p % 20 === 0) log(`    …${label} p${p} 누적 ${rows.length}`)
  }
  // 결과집합이 100행 이하면 p1 만으로 이미 전부 덮었다 — 복구 호출 불필요
  if (first >= 100) {
    for (const p of [2, 3]) {
      const res = await call(ep, { ...base, pageNo: p, numOfRows: 50 })
      if (res.ok) rows.push(...res.items)
      else log(`  ! ${label} 복구 p${p} ${res.error}`)
    }
  }
  return rows
}

/* 페이징이 **정상인** 엔드포인트용 — 복구 호출을 하지 않는다.
   위의 k·n−1 버그가 통일부 API 전체에 있는 것은 아니다(2026-08-12 실측).
     · 버그 있음: search / trend / nesdta  → sweep() 을 쓴다
     · 정상    : othbcact(김정은 공개활동) / prsn(인물) / hist(약사)
                오프셋이 정확히 (pageNo−1)×numOfRows 다. 검증: 19행 집합에서
                n=5 p1=행0~4, p2=행5~9. 258행 집합에서 n=10 p26=8행.
   정상인 곳에 복구 호출을 얹으면 **중복만 늘어난다.** 그래서 함수를 나눈다.
   numOfRows 상한은 100이다(1000을 보내면 조용히 100으로 깎인다). */
async function pageThrough(ep, base, label) {
  const rows = []
  for (let p = 1; p <= MAXP; p++) {
    const res = await call(ep, { ...base, pageNo: p, numOfRows: 100 })
    if (!res.ok) { log(`  ! ${label} p${p} ${res.error}`); break }
    rows.push(...res.items)
    if (res.items.length < 100) break
    if (p % 20 === 0) log(`    …${label} p${p} 누적 ${rows.length}`)
  }
  return rows
}

// ── 날짜 유틸 ────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0')
const ymd8 = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const dash = s => (/^\d{8}$/.test(s || '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null)
const monthEnd = (y, m) => new Date(y, m, 0)
const addDays = (s8, n) => { const d = new Date(+s8.slice(0, 4), +s8.slice(4, 6) - 1, +s8.slice(6)); d.setDate(d.getDate() + n); return ymd8(d) }
/** 증분 시작일 — 마지막 확인 시점에서 back 일 뒤로 물러선다(소급 등록·지연 게시 대비) */
const since = (meta, back, floor) => (FULL || !meta.coverageEnd) ? floor : addDays(meta.coverageEnd.replace(/-/g, ''), -back)

// ── 저장소 ──────────────────────────────────────────────────
function load(key) {
  const p = path.join(OUT, `${key}.json`)
  if (!fs.existsSync(p)) return { key, items: [], revisions: [], runs: [] }
  const s = JSON.parse(fs.readFileSync(p, 'utf8'))
  s.items ||= []; s.revisions ||= []; s.runs ||= []
  return s
}
function save(key, store) {
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify(store), 'utf8')
}
const payload = it => { const { _pk, _firstSeen, _lastSeen, ...rest } = it; return JSON.stringify(rest) }

/* ★ dwld_url 에 호출마다 달라지는 세션 토큰이 박혀 온다. 그대로 저장하면 같은 레코드가
   매 실행 '변경됨'으로 잡혀 revisions 가 폭증한다(실측: 첫 시도에서 11건 중 6건 오검출).
   실측 원문: ...2025102415252330943.pdf;jsessionid=hnccmcZB5Pg0mOOaf2J2BP5x.unikorea11'
   결측 표기도 여기서 통일한다 — 구 레코드는 문자열 "nan", 신 레코드는 null 이다. */
const scrub = raw => {
  const o = { ...raw }
  for (const k of Object.keys(o)) {
    if (typeof o[k] !== 'string') continue
    o[k] = o[k].replace(/;jsessionid=[^?&'"\s]*/gi, '').replace(/['"\s]+$/, '')
    if (o[k] === '' || o[k] === 'nan') o[k] = null
  }
  return o
}

/* append-only upsert. 삭제 없음.
   ★ 이 API 는 같은 pk 에 서로 다른 내용의 행을 2벌 갖고 있다(백엔드 중복 행).
     실측: briefing 2,709건 중 68건이 한 번의 크롤 안에서 제목·본문이 다른 두 판으로 왔다.
       "통일부, 대국민 온라인 제공 서비스(웹서비스) 정상 운영"  ↔  "통일부, 대국민 웹서비스 정상 운영"
     순진하게 '다르면 갱신'으로 처리하면 매 실행 두 판이 서로를 밀어내며 revisions 가 무한히 자란다
     (실측: 2회차에 +4). → 이미 본 적 있는 판이면 갱신으로 치지 않는다. 먼저 본 판이 현행으로 남는다. */
function merge(store, rows, pk) {
  const idx = new Map(store.items.map((it, i) => [it._pk, i]))
  const known = new Map()                                  // _pk → Set(이미 본 payload)
  for (const it of store.items) known.set(it._pk, new Set([payload(it)]))
  for (const rv of store.revisions) {
    const { _pk, seenUntil, ...rest } = rv
    ;(known.get(_pk) || known.set(_pk, new Set()).get(_pk)).add(JSON.stringify(rest))
  }
  let added = 0, changed = 0, skipped = 0, variant = 0
  for (const dirty of rows) {
    const raw = scrub(dirty)
    const id = pk(raw)
    if (!id) { skipped++; continue }
    const key = String(id)
    const at = idx.get(key)
    if (at === undefined) {
      idx.set(key, store.items.push({ ...raw, _pk: key, _firstSeen: TODAY, _lastSeen: TODAY }) - 1)
      known.set(key, new Set([payload({ ...raw, _pk: key })]))
      added++
      continue
    }
    const prev = store.items[at]
    const next = { ...raw, _pk: key }
    const p = payload(next)
    if (p === payload(prev)) { prev._lastSeen = TODAY; continue }
    if (known.get(key)?.has(p)) { variant++; prev._lastSeen = TODAY; continue }  // 이미 아는 이본
    store.revisions.push({ _pk: key, seenUntil: prev._lastSeen, ...JSON.parse(payload(prev)) })
    known.get(key).add(p)
    store.items[at] = { ...next, _firstSeen: prev._firstSeen, _lastSeen: TODAY }
    changed++
  }
  return { added, changed, skipped, variant }
}
const maxId = st => st.items.reduce((a, i) => Math.max(a, Number(i._pk) || 0), 0)
function readMeta(key) {
  const p = path.join(OUT, `${key}.json`)
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8'))._meta || null } catch { return null }
}

// ── 수집 계획 ────────────────────────────────────────────────
//   pk          레코드 유일키 (ingest 의 factKey 원천)
//   date        coverage 계산용 날짜(YYYY-MM-DD). 없으면 null
//   run         수집 루틴
//   coverageEnd (선택) 날짜 최대값이 아닌 다른 규칙을 쓸 때
const JOBS = {
  // 보도자료·보도설명자료 ─ 판정 시드
  briefing: {
    name: '통일부 보도자료', endpoint: `${B}/nesdta/getNesdta`,
    pk: r => (String(r.url).match(/cntId=(\d+)/) || [])[1],
    date: r => dash(r.wrt_ymd),
    // type 파라미터는 완전히 무시된다(json/xml/생략 응답이 바이트 단위 동일) → 보내지 않는다
    run: (s, m) => sweep(JOBS.briefing.endpoint,
      { bgng_ymd: since(m, 62, '20100101'), end_ymd: T8 }, 'briefing'),
  },

  // 북한 동향 ─ cl 3종을 별개 데이터셋으로 쪼갠다.
  //   coverageEnd 가 서로 다르다(일일 2026-08-11 / 주간 2026-08-02 / 월간 2026-06-30).
  //   한 덩어리로 두면 월간이 최대 38일 과대평가된다 = as-of 3상태 모델 정면 위반.
  ...trendJob('trendDaily', 'ARGUMENT_DAIL', '일일북한동향', 30),
  ...trendJob('trendWeekly', 'ARGUMENT_WIK', '주간북한동향', 60),
  ...trendJob('trendMonthly', 'ARGUMENT_MNTHNG', '월간북한동향', 120),

  // 북한정보포털 통합검색 ─ ★ 엔드포인트는 search/getSearch.
  //   카탈로그의 nkinfo/getNkinfo 는 존재하지 않는 경로였다(게이트웨이가 rc=11 로 되돌려줘 오진 유발).
  //   날짜 파라미터는 받기만 하고 무시된다(rc=0 인데 필터가 안 걸림) → 보내지 않는다. 증분 불가.
  ...searchJob('nkinfoTrend', '동향', [1, 2, 3, 4, 5], '북한정보포털 동향'),
  ...searchJob('nkinfoOverview', '개황', [1, 2, 3, 4, 5], '북한개황(포털)'),

  // ↓ 2026-08-12 현재 백엔드 db_error. 시도는 하되 실패를 실패로 기록한다.
  /* 2026-08-12 파라미터 실측(에이전트 전수 열거):
       · bgng_ymd/end_ymd 필수. 빼면 rc=11.
       · **country 가 유일한 실질 필터**이고 완전일치다. 비우면 rc=0 인데 0건(조용한 빈 결과).
         북측 97 · 남측 28 · 해외 7 · 기타 6 → 4회 훑어야 전량이다.
       · thema 는 **무시된다**. 1~99·빈값 어느 것이든 같은 결과가 온다.
         사용자 예시(thema=2 → 18건)가 걸러진 건 thema 가 아니라 keyword=남북 때문이었다.
       · 날짜 필터는 agmnt_ymd(합의일)에 걸린다. bgng_ymd 가 빈 문자열인 6건도
         country=기타 로 도달한다 — 옛 주석의 "영구 도달 불가"는 **틀렸다.** */
  accord: {
    name: '남북합의서', endpoint: `${B}/nktalkmng/getNktalkmng`, fragile: true,
    pk: r => {
      const id = (String(r.url || '').match(/[?&]id=(\d+)/) || [])[1]
      if (id) return `id:${id}`
      const t = String(r.title || r.sj || '').replace(/\s+/g, '')
      return t ? `${r.agmnt_ymd || r.bgng_ymd || '00000000'}:${t}`.slice(0, 120) : null
    },
    date: r => dash(String(r.agmnt_ymd || '').replace(/\D/g, '')),
    run: async () => {
      const out = []
      for (const country of ['북측', '남측', '해외', '기타']) {
        out.push(...await sweep(`${B}/nktalkmng/getNktalkmng`,
          { bgng_ymd: '19480101', end_ymd: T8, country }, `accord:${country}`))
      }
      return out
    },
  },

  /* 김정은 공개활동 7,544건.
     ★ 이 엔드포인트는 페이징이 **정상**이다(오프셋 = (pageNo−1)×numOfRows).
       다른 통일부 API 의 k·n−1 버그가 여기엔 없어서, 복구 호출을 쓰면 중복만 생긴다.
       sweep() 은 first>=100 일 때 복구 호출을 하므로 여기서는 쓰지 않고 직접 넘긴다.
     ★ 원본에 완전 동일 행이 대량 중복돼 있다(같은 날 같은 내용이 3~5회).
       totalCount 가 중복까지 세므로 연도별 건수를 활동 횟수로 읽으면 안 된다. */
  kjuAct: {
    name: '김정은 공개활동', endpoint: `${B}/othbcact/getOthbcact`, fragile: true,
    pk: r => {
      const cn = String(r.nes_cn || '').replace(/\s+/g, ' ').replace(/상세보기\s*$/, '').trim()
      return cn ? `${r.nes_ymd || '00000000'}:${cn}`.slice(0, 160) : null
    },
    date: r => dash(String(r.nes_ymd || '').replace(/\D/g, '')),
    run: () => pageThrough(`${B}/othbcact/getOthbcact`,
      { bgng_ymd: '20110101', end_ymd: T8 }, 'kjuAct'),
  },

  /* 북한 인물 — sexdstn(1남/2여) × nk_prsn_death_at(N생존/Y사망) 이 **둘 다 필수**라
     4회 훑어야 전량(433건)이다. bgng_ymd/end_ymd 는 게시일이 아니라 **출생일 범위**다.
     ★ 이 엔드포인트의 totalCount 는 '반환행수 에코'다 — 총량으로 쓰면 안 된다. */
  personApi: {
    name: '북한 인물(API)', endpoint: `${B}/prsn/getPrsn`, fragile: true,
    pk: r => {
      const nm = String(r.nm || r.korean_nm || '').trim()
      return nm ? `${nm}|${String(r.brth || '').trim()}|${String(r.rspofc || '').trim()}`.slice(0, 120) : null
    },
    date: () => null,
    run: async () => {
      const out = []
      for (const sexdstn of ['1', '2']) {
        for (const death of ['N', 'Y']) {
          out.push(...await pageThrough(`${B}/prsn/getPrsn`,
            { sexdstn, nk_prsn_death_at: death, bgng_ymd: '19000101', end_ymd: T8 },
            `person:${sexdstn}${death}`))
        }
      }
      return out
    },
  },

  hist: {
    name: '북한 약사', endpoint: `${B}/hist/getHist`, fragile: true,
    pk: r => { const t = String(r.sj || r.title || r.cn || '').replace(/\s+/g, '').slice(0, 90); return t || null },
    date: r => dash(String(r.ymd || r.occrrnc_ymd || '').replace(/\D/g, '')),
    run: () => pageThrough(`${B}/hist/getHist`, { bgng_ymd: '19000101', end_ymd: T8 }, 'hist'),
  },
  lexicon: {
    name: '북한 용어사전', endpoint: `${B}/nkword/getNkword`, fragile: true,
    pk: r => (r.word ? `${r.catgory || '기타'}:${r.word}` : null),   // catgory 는 오타가 아니라 스펙 철자다
    date: () => null,
    run: () => sweep(`${B}/nkword/getNkword`, {}, 'lexicon'),
  },
  /* 남북한 언어비교 — "안녕하세요 북한말로?" 에 답할 **유일한** 자료다.
     스키마가 koword(남) ↔ nkword(북) 한 쌍이라 대응어가 구조적으로 들어 있다.
     (북한 용어사전 lexicon 은 word+설명뿐이라 남→북 대응이 없다 — 그래서 둘 다 필요하다)
     2026-08-12 재확인: resultCode 0 · totalCount 22,192. 이전의 db_error 는 복구됐다. */
  wordCmp: {
    name: '남북한 언어비교', endpoint: `${B}/nskwordcmp/getNskwordCmp`, fragile: true,
    pk: r => (r.koword || r.nkword ? `${r.koword || ''}|${r.nkword || ''}` : null),
    date: () => null,
    run: () => sweep(`${B}/nskwordcmp/getNskwordCmp`, {}, 'wordCmp'),
  },
}

function trendJob(key, cl, name, back) {
  return {
    [key]: {
      name, cl, endpoint: `${B}/trend/getTrend`,
      pk: r => (String(r.url).match(/trend(?:MngNo|ReportNo)=(\d+)/) || [])[1],
      date: r => dash(r.first_reg_ymd),
      run: (s, m) => sweep(`${B}/trend/getTrend`,
        { cl, bgng_ymd: since(m, back, '19900101'), end_ymd: T8 }, key),
      // ★ 주간/월간은 '게시일'이 아니라 '다루는 기간의 끝'이 coverageEnd 다.
      //   최신호는 2026-08-04 에 게시됐지만 내용은 2026-08-02 까지다. 8/3~8/4 는 확인되지 않음.
      coverageEnd: cl === 'ARGUMENT_DAIL' ? null : store => {
        let best = null
        for (const it of store.items) {
          const f = String(it.filenm || ''), s = String(it.sj || '')
          let d = null
          const w = f.match(/(\d{8})-(\d{8})/)                       // 파일명이 8자리 고정폭 — 가장 견고
          if (w) d = dash(w[2])
          else {
            const t = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.?\s*[-~]\s*(\d{4})\.(\d{1,2})\.(\d{1,2})/)
            if (t) d = `${t[4]}-${pad(t[5])}-${pad(t[6])}`
            else {
              const mo = s.match(/(\d{4})년\s*(\d{1,2})월/) || f.match(/(\d{4})년\s*(\d{1,2})월/)
              if (mo) d = dash(ymd8(monthEnd(+mo[1], +mo[2])))       // 월간 → 해당 월 말일
            }
          }
          if (d && (!best || d > best)) best = d
        }
        return best
      },
    },
  }
}

function searchJob(key, cl, themas, name) {
  return {
    [key]: {
      name, cl, themas, endpoint: `${B}/search/getSearch`,
      pk: r => (String(r.url).match(/trendMngNo=(\d+)/) || [])[1]
        || (String(r.url).match(/menuId=([A-Za-z0-9_]+)/) || [])[1],
      // 개황은 본문 말미에 '(2024.8월 작성)' 마커가 있다 — 레코드별 as-of 의 유일한 근거.
      // 동향은 날짜 필드가 아예 없다.
      date: cl !== '개황' ? () => null : r => {
        const m = String(r.cn || '').match(/\((\d{4})\.\s*(\d{1,2})\s*월\s*작성\)/)
        if (m) return dash(ymd8(monthEnd(+m[1], +m[2])))
        const y = String(r.filenm || '').match(/(20\d{2})/)          // fallback: 발간물 연도
        return y ? `${y[1]}-12-31` : null
      },
      async run() {
        const rows = []
        for (const thema of this.themas) {
          const got = await sweep(this.endpoint, { cl, thema }, `${cl}/t${thema}`)
          log(`    ${cl}/thema=${thema} ${got.length}건`)
          if (!got.length) log(`    ! ${cl}/t${thema} 0건 — 조합 오류 의심(오타는 rc=0/0건으로 조용히 실패한다)`)
          rows.push(...got)
        }
        return rows
      },
      // 동향은 날짜 필드가 없다. 수집일을 그냥 쓰면 거짓말이 되므로,
      // trendDaily 와 id 공간을 공유하는지 확인될 때만 그 게시일을 빌려 쓴다. 아니면 null(=모른다).
      coverageEnd: cl !== '동향' ? null : store => {
        const td = readMeta('trendDaily')
        if (!td?.maxId || !td?.coverageEnd) return null
        const mine = maxId(store)
        return mine && Math.abs(mine - td.maxId) <= 200 ? td.coverageEnd : null
      },
    },
  }
}

// ── 실행 ────────────────────────────────────────────────────
const log = s => console.log(s)

for (const [k, j] of Object.entries(JOBS)) {           // 카탈로그와 어긋나면 알린다
  const ep = DATASETS[k]?.endpoint
  if (ep && ep !== j.endpoint) console.warn(`⚠ 카탈로그 endpoint 불일치 ${k}: ${ep} ≠ ${j.endpoint}`)
}

const targets = Object.entries(JOBS).filter(([k]) => !only.length || only.includes(k))
if (PLAN) {
  console.log(`계획 (${FULL ? '전량' : '증분'})`)
  for (const [k, j] of targets) console.log(`  ${k.padEnd(16)} ${j.endpoint}  확인 ${readMeta(k)?.coverageEnd || '(신규)'}`)
  process.exit(0)
}

console.log('═'.repeat(76))
console.log(`통일부 OpenAPI 수집 — ${targets.length}종 · ${FULL ? '전량' : '증분'} · ${TODAY}`)
console.log('═'.repeat(76))

const summary = []
for (const [key, job] of targets) {
  const store = load(key)
  const meta = store._meta || {}
  const t0 = Date.now(), c0 = CALLS
  log(`▶ ${key} — ${job.name}  (보유 ${store.items.length.toLocaleString()}건 · 확인 ${meta.coverageEnd || '없음'})`)

  let rows = []
  try { rows = await job.run(store, meta) } catch (e) { log(`  ✗ 예외 ${e.message}`) }

  const m = merge(store, rows, job.pk)
  const dates = store.items.map(job.date).filter(Boolean).sort()
  const covEnd = job.coverageEnd ? job.coverageEnd(store) : (dates.at(-1) || null)
  const failed = !store.items.length

  store._meta = {
    key, name: job.name, endpoint: job.endpoint, cl: job.cl || null,
    fetchedAt: TODAY,
    asOf: TODAY,                          // 우리가 '수집을 시도한' 날
    coverageStart: dates[0] || null,
    coverageEnd: covEnd,                  // 실제로 확보한 마지막 시점. 모르면 null — 수집일로 때우지 않는다
    count: store.items.length,
    maxId: maxId(store) || null,
    status: failed ? 'failed' : (m.added || m.changed ? 'ok' : 'no-new'),
  }
  store.runs.push({ at: TODAY, mode: FULL ? 'full' : 'inc', calls: CALLS - c0, got: rows.length,
    added: m.added, changed: m.changed, sec: Math.round((Date.now() - t0) / 1000) })
  if (!failed) save(key, store)
  else log(`  ✗ 0건 — 파일을 쓰지 않는다. 실패와 공집합을 구분해야 이전 스냅샷이 살아남는다`)

  log(`  ${failed ? '✗' : '✓'} ${String(store.items.length).padStart(7)}건  +${m.added} 신규 · ~${m.changed} 갱신` +
      `  범위 ${dates[0] || '?'} ~ ${covEnd || '미확인'}  ${CALLS - c0}콜 ${Math.round((Date.now() - t0) / 1000)}s`)
  summary.push({ key, n: store.items.length, added: m.added, covEnd, failed })
}

console.log('═'.repeat(76))
for (const s of summary)
  console.log(`${s.failed ? '✗' : '🟢'} ${s.key.padEnd(17)}${String(s.n).padStart(8)}건  +${String(s.added).padStart(6)}   ~${s.covEnd || '미확인'}`)
console.log(`총 ${CALLS}콜 · 실패 ${FAILS} · 출력 ${OUT}`)
console.log('다음: node scripts/ingest-nk.mjs && node scripts/build-web-index.mjs && node scripts/eval.mjs && node scripts/wild.mjs')
console.log('═'.repeat(76))