// 통일부 OpenAPI 전량 수집 — 원본 그대로 보관
//
// 사용자 지시: "나중에라도 필요해보이는거도 긁어놓자. 나중에 필요할때 받아쓰려면 또 수집시간이 걸리니까"
// API 는 오래 죽어 있었고 또 죽을 수 있다. 살아 있을 때 받아서 파일로 남긴다.
//
//   node scripts/fetch-mou-api.mjs              동작 확인된 것 전부
//   node scripts/fetch-mou-api.mjs briefing     일부만
//   node scripts/fetch-mou-api.mjs --full       증분 무시하고 처음부터
//
// 저장: 북한자료-api/<key>.json  { key, name, id, url, params, fetchedAt, totalCount, items: [...] }
// 증분: 이미 있으면 기존 items 위에 새 것만 병합한다(사용자 지시 — append-only).

import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from './nk-env.mjs'
import { MOU_APIS } from './mou-api-registry.mjs'

loadEnv(path.resolve('api.txt'))
const KEY = process.env.DATA_GO_KR_API_KEY
if (!KEY) { console.error('DATA_GO_KR_API_KEY 없음 (api.txt)'); process.exit(1) }

const OUT = path.resolve('북한자료-api')
fs.mkdirSync(OUT, { recursive: true })
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const sleep = ms => new Promise(r => setTimeout(r, ms))

/* 탐색으로 확정한 호출 규약. 여기 없는 것은 아직 못 뚫었거나 활용신청이 안 된 것이다.
   ⚠ 추측으로 채우지 말 것 — probe-mou-api.mjs 로 확인한 뒤에만 추가한다. */
const RECIPE = {
  briefing: { params: { bgng_ymd: '19480101', end_ymd: TODAY, type: 'json' }, rows: 100,
              dedupe: it => it.url || (it.sj + '|' + it.wrt_ymd), dateOf: it => it.wrt_ymd },
  trend:    { params: { bgng_ymd: '19480101', end_ymd: TODAY, type: 'json' }, rows: 100,
              /* cl 은 분류다. 값을 바꿔가며 전부 받는다 — 하나만 받으면 일일치만 들어온다. */
              variants: [{ cl: 'ARGUMENT_DAIL' }, { cl: 'ARGUMENT_WEEK' }, { cl: 'ARGUMENT_MONTH' },
                         { cl: 'TREND_DAIL' }, { cl: 'TREND_WEEK' }, { cl: 'TREND_MONTH' }],
              dedupe: it => it.url || (it.sj + '|' + it.first_reg_ymd), dateOf: it => it.first_reg_ymd },
  wordCmp:  { params: { type: 'json', sj: '' }, rows: 100,
              dedupe: it => `${it.catgory}|${it.koword}|${it.nkword}` },
}

const args = process.argv.slice(2)
const full = args.includes('--full')
const only = args.filter(a => !a.startsWith('-'))

function build(url, params) {
  const u = new URL(url)
  u.searchParams.set('serviceKey', KEY)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  return u
}

async function callOnce(url, params, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(build(url, params), { signal: AbortSignal.timeout(45000) })
      const t = await r.text()
      try { return JSON.parse(t) } catch { return { __raw: t.slice(0, 300) } }
    } catch (e) {
      if (i === tries - 1) throw e
      await sleep(1500 * (i + 1))      // 공공 API 예의 — 물러섰다 다시
    }
  }
}

/** 한 조합을 끝까지 페이징. 같은 페이지가 반복되면(서버가 pageNo 를 무시하면) 멈춘다.
    ⚠ 빈 응답 한 번으로 끝내지 않는다 — 이 API 는 간헐적으로 빈 배열을 준다.
       briefing 이 그것 때문에 0건으로 끝난 적이 있다(재시도하니 2,670건). 두 번 연속일 때만 종료. */
async function harvest(api, recipe, extra = {}) {
  const items = []
  const seen = new Set()
  let page = 1, empty = 0
  for (;;) {
    const params = { ...recipe.params, ...extra, pageNo: page, numOfRows: recipe.rows }
    const j = await callOnce(api.url, params)
    const got = j?.items ?? j?.response?.body?.items?.item ?? []
    const arr = Array.isArray(got) ? got : (got ? [got] : [])
    if (!arr.length) {
      if (++empty >= 2) break
      await sleep(1200); page++; continue
    }
    empty = 0
    let fresh = 0
    for (const it of arr) {
      const k = recipe.dedupe ? recipe.dedupe(it) : JSON.stringify(it)
      if (seen.has(k)) continue
      seen.add(k); items.push(it); fresh++
    }
    process.stdout.write(`\r    ${JSON.stringify(extra) || ''} p${page} · 누적 ${items.length.toLocaleString()}   `)
    if (!fresh) break                              // 서버가 같은 페이지를 계속 준다 → 종료
    if (arr.length < recipe.rows) break            // 마지막 페이지
    page++
    if (page > 2000) break                         // 폭주 방지
    await sleep(250)
  }
  process.stdout.write('\r' + ' '.repeat(70) + '\r')
  return items
}

const targets = Object.entries(MOU_APIS)
  .filter(([k]) => RECIPE[k] && (!only.length || only.includes(k)))

console.log(`통일부 OpenAPI 수집 — ${targets.length}종 (확인된 것만)\n${'─'.repeat(74)}`)
let grand = 0

for (const [key, api] of targets) {
  const recipe = RECIPE[key]
  const file = path.join(OUT, `${key}.json`)
  const prev = (!full && fs.existsSync(file)) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null

  let items = []
  try {
    for (const v of (recipe.variants || [{}])) items.push(...await harvest(api, recipe, v))
  } catch (e) {
    console.log(`✗ ${key.padEnd(10)} ${api.name.padEnd(20)} 실패 ${e.message.slice(0, 40)}`)
    continue
  }

  // 증분 병합 — 옛 것을 지우지 않는다
  if (prev?.items?.length) {
    const seen = new Set(items.map(it => recipe.dedupe ? recipe.dedupe(it) : JSON.stringify(it)))
    for (const it of prev.items) {
      const k = recipe.dedupe ? recipe.dedupe(it) : JSON.stringify(it)
      if (!seen.has(k)) { seen.add(k); items.push(it) }
    }
  }
  if (recipe.dateOf) items.sort((a, b) => String(recipe.dateOf(b) ?? '').localeCompare(String(recipe.dateOf(a) ?? '')))

  const dates = recipe.dateOf ? items.map(recipe.dateOf).filter(Boolean).sort() : []
  const body = {
    key, name: api.name, id: api.id, url: api.url, params: recipe.params,
    fetchedAt: new Date().toISOString().slice(0, 10),
    coverageStart: dates[0] || null, coverageEnd: dates.at(-1) || null,
    totalCount: items.length, items,
  }
  fs.writeFileSync(file, JSON.stringify(body), 'utf8')
  grand += items.length
  const added = prev ? items.length - (prev.totalCount || 0) : items.length
  const span = dates.length ? `  ${dates[0]}~${dates.at(-1)}` : ''
  console.log(`✓ ${key.padEnd(10)} ${api.name.padEnd(20)} ${items.length.toLocaleString().padStart(8)}건` +
              `${added > 0 && prev ? ` (+${added})` : ''}${span}`)
}

console.log('─'.repeat(74))
console.log(` 합계 ${grand.toLocaleString()}건 · ${OUT}`)
