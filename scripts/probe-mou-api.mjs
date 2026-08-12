// 통일부 OpenAPI 18종 사전 탐색 — 어떤 파라미터로 부르면 되고, 몇 건이 있는가
//
// 수집 전에 이걸 먼저 돌린다. 결과는 북한자료-api/_probe.json 에 남는다.
// 공공 API 를 난사하지 않기 위해 numOfRows 는 10, 조합 사다리는 통과 즉시 중단한다.
//
//   node scripts/probe-mou-api.mjs
//   node scripts/probe-mou-api.mjs briefing accord      (일부만)

import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from './nk-env.mjs'
import { MOU_APIS, PARAM_LADDER, BASE_PARAMS } from './mou-api-registry.mjs'

loadEnv(path.resolve('api.txt'))
const KEY = process.env.DATA_GO_KR_API_KEY || process.env.PUBLIC_DATA_KEY
if (!KEY) { console.error('DATA_GO_KR_API_KEY 없음 (api.txt)'); process.exit(1) }

const OUT = path.resolve('북한자료-api')
fs.mkdirSync(OUT, { recursive: true })
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const sleep = ms => new Promise(r => setTimeout(r, ms))

function build(url, params) {
  const u = new URL(url)
  u.searchParams.set('serviceKey', KEY)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v === 'TODAY' ? TODAY : String(v))
  return u
}

/** 응답을 형태 무관하게 읽는다 — JSON 이 아니면 XML 일 수 있다 */
async function call(url, params) {
  const r = await fetch(build(url, params), { signal: AbortSignal.timeout(30000) })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* XML 이거나 오류 페이지 */ }
  const code = json?.resultCode ?? json?.response?.header?.resultCode ??
    (text.match(/<resultCode>([^<]*)</) || [])[1] ?? null
  const msg = json?.resultMsg ?? json?.response?.header?.resultMsg ??
    (text.match(/<resultMsg>([^<]*)</) || [])[1] ?? null
  const total = Number(json?.totalCount ?? json?.response?.body?.totalCount ??
    (text.match(/<totalCount>(\d+)</) || [])[1] ?? NaN)
  const items = json?.items ?? json?.response?.body?.items?.item ?? json?.response?.body?.items ?? null
  return { http: r.status, code, msg, total, items, json, text, isXml: !json && /^\s*</.test(text) }
}

const only = process.argv.slice(2).filter(a => !a.startsWith('-'))
const targets = Object.entries(MOU_APIS).filter(([k]) => !only.length || only.includes(k))

const report = {}
console.log(`통일부 OpenAPI 탐색 — ${targets.length}종\n${'─'.repeat(78)}`)

for (const [key, api] of targets) {
  let hit = null
  for (const extra of PARAM_LADDER) {
    const params = { ...BASE_PARAMS, ...(api.extra || {}), ...extra }
    let res
    try { res = await call(api.url, params) } catch (e) {
      console.log(`✗ ${key.padEnd(10)} ${api.name.padEnd(22)} 호출 실패 ${e.message.slice(0, 40)}`)
      report[key] = { ...api, error: e.message }; break
    }
    // resultCode 0 이고 실제로 뭔가 왔으면 채택
    const ok = String(res.code) === '0' || String(res.code) === '00'
    if (ok && (res.total > 0 || (Array.isArray(res.items) && res.items.length))) {
      hit = { params, res }; break
    }
    // 0건이어도 '정상'이면 기록만 하고 다음 조합 시도(날짜 범위 문제일 수 있다)
    if (ok && !hit) hit = { params, res, empty: true }
    await sleep(300)
  }

  if (!hit) { console.log(`✗ ${key.padEnd(10)} ${api.name.padEnd(22)} 통과 조합 없음`); report[key] = { ...api, ok: false }; continue }

  const { params, res } = hit
  const sample = Array.isArray(res.items) ? res.items[0] : (res.items && typeof res.items === 'object' ? res.items : null)
  const fields = sample ? Object.keys(sample) : []
  report[key] = { ...api, ok: true, params, totalCount: res.total, isXml: res.isXml, fields, sample }
  const n = Number.isFinite(res.total) ? res.total.toLocaleString() : '?'
  const flag = hit.empty ? ' (0건 — 파라미터 재검토 필요)' : ''
  console.log(`${hit.empty ? '△' : '✓'} ${key.padEnd(10)} ${api.name.padEnd(22)} ${String(n).padStart(8)}건  ${fields.slice(0, 5).join(',')}${flag}`)
  await sleep(400)
}

fs.writeFileSync(path.join(OUT, '_probe.json'), JSON.stringify(report, null, 2), 'utf8')
console.log('─'.repeat(78))
const ok = Object.values(report).filter(r => r.ok && r.totalCount > 0).length
console.log(` 수집 가능 ${ok}/${targets.length}종 · 상세: 북한자료-api/_probe.json`)
