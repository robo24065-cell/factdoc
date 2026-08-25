#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   참여(/pick) 실제 브라우저 검증 — 월드컵 3종 + 기억 밸런스

   왜 실제 브라우저인가 (nk-verify-deck.mjs 와 같은 이유·같은 방식: headless Chrome + CDP)
     "결승까지 돌아간다"는 코드가 있다는 말이지 돌아갔다는 말이 아니다.
     세 월드컵을 **15번 실제로 눌러 끝까지** 가고, 결과 화면의 수치를
     analysis.json 확정값과 글자 단위로 대조한다.

   무엇을 재는가
     [0] 카드 사진 정적 검사 — pick-photos.ts 전 항목: 파일 실존 · 라이선스 화이트리스트
         (PD·CC0·CC-BY·CC-BY-SA) · 작가·출처 페이지 기재 · 항목 id 실재
     [1] /pick 허브 — 우선순위 표 7행이 analysis.json legacy-priority 순서·값과 일치
         + 실선택 순위덱: n 상시 병기(% 단독 금지) · as-of(불러옴 시각) · 빈 상태 문구 · 상세보기 펼침
         + 회귀: 덱 수치 = 페이지가 실제로 받은 pick_tally 응답(화면=DB 글자 단위) · 출처 구획
         + 회귀: RLS — 같은 anon 자격으로 pick_event·pick_balance_answer 원시행 select 가 막혀 있다
     [2] 음식 월드컵 — 되돌리기·키보드 ←·15연타 완주 · 결과 수치 = analysis.json · 참고 사진 렌더
     [3] 공유 PNG — canvas 가 data:image/png 를 실제로 돌려주는가 (파일로 저장)
     [4] 풍경 월드컵 — 제공처 표기 · 완주 · 결과 수치 대조 (사진 로드 실패에도 완주)
     [5] 말 월드컵 — 완주 · 「지역 통계를 붙이지 않습니다」 · 지역 순위 구획이 없어야 한다
         + 우승 카드 사진·위키미디어 저작자 표시·출처 링크 · 저작자 실명이 pick-photos.ts 와 일치
     [5b] 사진 폴백 — pick-img 전 요청을 실패시킨 상태에서도 글자 카드로 서고 게임이 진행된다
     [6] 밸런스 — 8문항 + 고향 선택 → 경로 카드(paths.json 연락처) · 지역 수치 대조 · 순위덱 동반
     [7] 375px 모바일 — 가로 넘침 0
     [8] 집계 전송 — pick_event 본문 4필드 · pick_balance_answer 본문 (q_id·choice)뿐(개인정보 0)
     [9] JS 예외 0 (외부 이미지 404 는 허용 — onerror 폴백이 설계다)

   사용법: node scripts/nk-verify-pick.mjs [--base http://localhost:5178] [--png 경로.png]
   (개발 서버가 떠 있어야 한다: .claude/launch.json 의 sasilon, 포트 5178)
   나가는 값: 전부 통과 0 · 실패 1
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const BASE = (argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : '') || 'http://localhost:5178'
const PNG_OUT = argv.includes('--png') ? argv[argv.indexOf('--png') + 1] : path.join(root, '기획서-캡처/pick-share-sample.png')
const PORT = 9226

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => fs.existsSync(p))
if (!CHROME) { console.error('✗ Chrome 실행 파일을 찾지 못했다.'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail })
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`)
}

/* ── 원본 자료 ── */
const analysis = JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/gohyang/analysis.json'), 'utf8'))
const lp = analysis.cards.find((c) => c.id === 'legacy-priority')
const rd = analysis.cards.find((c) => c.id === 'record-density-gap')
const rankRows = [...lp.series.find((s) => s.key === 'priority').rows].sort((a, b) => a.y - b.y)
const expect = new Map(rankRows.map((r, i) => {
  const t = rd.table.find((x) => x['고향'] === r.x)
  return [r.x, { rank: i + 1, survivors: t['생존자'], density: t['밀도'] }]
}))
/* 항목 자료 — 생성 스크립트 산출물(TS)을 JSON 으로 되읽는다 */
const itemsTs = fs.readFileSync(path.join(root, 'frontend/src/data/pick-items.ts'), 'utf8')
const items = JSON.parse(itemsTs.slice(itemsTs.indexOf('const data = ') + 'const data = '.length, itemsTs.lastIndexOf('\n\nexport default')))
const regionOfName = new Map([
  ...items.foods.map((f) => [f.name, f.region]),
  ...items.sceneries.map((s) => [s.name, s.region]),
])
const paths = JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/gohyang/paths.json'), 'utf8'))
/* 카드 사진 산출물(TS)을 JSON 으로 되읽는다 — nk-pick-images.mjs 생성물 */
const photosTs = fs.readFileSync(path.join(root, 'frontend/src/data/pick-photos.ts'), 'utf8')
const photos = JSON.parse(photosTs.slice(photosTs.indexOf('PickPhoto> = ') + 'PickPhoto> = '.length, photosTs.lastIndexOf('\n\nexport default')))

/* ── CDP ── */
async function targets() { return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json() }
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const events = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
    } else if (m.method) events.push(m)
  })
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', () => rej(new Error('CDP 연결 실패')))
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id
    pending.set(i, { resolve, reject })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  return { ready, send, events, close: () => ws.close() }
}

/* ══════════ [0] 카드 사진 정적 검사 — 브라우저 없이 산출물 자체를 잰다 ══════════ */
console.log('▶ 카드 사진 정적 검사 (pick-photos.ts)')
{
  const LICENSE_OK = (s) => {
    if (/\b(nc|nd)\b/i.test(s)) return false
    return /^public domain/i.test(s) || /^pd\b/i.test(s) || /^cc0\b/i.test(s) || /^cc[ -]?by(-sa)?\b/i.test(s)
  }
  const itemIds = new Set([...items.foods.map((f) => f.id), ...items.words.pairs.map((w) => w.id)])
  const entries = Object.entries(photos)
  const missingFile = entries.filter(([, p]) => !fs.existsSync(path.join(root, 'frontend/public', p.src.replace(/^\//, ''))))
  const badLicense = entries.filter(([, p]) => !LICENSE_OK(String(p.license ?? '')))
  const noCredit = entries.filter(([, p]) => !p.author || !p.sourcePage || !p.caption)
  const orphan = entries.filter(([k]) => !itemIds.has(k))
  check(`사진 ${entries.length}건 — 파생본 파일이 전부 존재한다`, entries.length > 0 && missingFile.length === 0, missingFile.map(([k]) => k).join(',').slice(0, 120))
  check('사진 라이선스가 전부 화이트리스트(PD·CC0·CC-BY·CC-BY-SA) 안이다', badLicense.length === 0, badLicense.map(([k, p]) => `${k}:${p.license}`).join(',').slice(0, 120))
  check('사진 전 항목에 작가·출처 페이지·캡션이 있다(CC 표시 의무)', noCredit.length === 0, noCredit.map(([k]) => k).join(',').slice(0, 120))
  check('사진 키가 전부 실재하는 항목 id 다', orphan.length === 0, orphan.map(([k]) => k).join(',').slice(0, 120))
  const nFood = Object.keys(photos).filter((k) => k.startsWith('food-')).length
  const nWord = Object.keys(photos).filter((k) => k.startsWith('word-')).length
  check('말 16쌍 전부 「그 물건」 사진 확보 · 음식은 확보분만(못 찾은 항목은 글자 카드)', nWord === 16 && nFood >= 1 && nFood <= 16, `음식 ${nFood}/16 · 말 ${nWord}/16`)
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-pick-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
  '--force-device-scale-factor=1', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' })

let cdp
let failed = 0
try {
  let ts = null
  for (let i = 0; i < 60; i++) {
    try { ts = await targets(); if (ts?.length) break } catch { /* 아직 */ }
    await sleep(250)
  }
  if (!ts?.length) throw new Error('CDP 포트가 열리지 않았다')
  cdp = connect(ts.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ts[0].webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })

  /* ★ 실 집계 오염 차단 — 0013 이 실제 Supabase 에 적용된 뒤로는 이 검증이 돌 때마다
     결승 4판이 실 pick_event 에 쌓인다(새 프로필이라 localStorage 표식이 없다).
     반복 실행이 표본 20판을 넘기면 화면에 가짜 「많이 뽑힌 것」이 뜬다 — 그래서
     POST 를 CDP Fetch 로 가로채 201 로 삼킨다. [8]의 본문 4필드 검사는
     Network.requestWillBeSent 가 여전히 발생하므로 그대로 유효하다. */
  /* pick_balance_answer(0014, 문항×선택 8행)도 같은 이유로 삼킨다 — 반복 실행이 실 집계를 오염시키면
     순위덱이 가짜 순위를 보여 주게 된다. 집계 읽기(pick_tally·pick_balance_tally GET)는 실 요청 그대로다. */
  /* '*pick-img*' 은 [5b] 사진 폴백 검사용 — blockImg 가 켜졌을 때만 실패시키고 평소엔 그대로 통과 */
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*rest/v1/pick_event*' }, { urlPattern: '*rest/v1/pick_balance_answer*' }, { urlPattern: '*/pick-img/*' }] })
  const FETCH_CORS = [
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: '*' },
    { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
  ]
  let pumpOn = true
  let pumpSeen = 0
  let blockImg = false
  const pump = (async () => {
    while (pumpOn) {
      while (pumpSeen < cdp.events.length) {
        const ev = cdp.events[pumpSeen++]
        if (ev.method !== 'Fetch.requestPaused') continue
        const p = ev.params
        try {
          if (/\/pick-img\//.test(p.request.url)) {
            if (blockImg) await cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' })
            else await cdp.send('Fetch.continueRequest', { requestId: p.requestId })
          } else if (p.request.method === 'OPTIONS') {
            await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, responseHeaders: FETCH_CORS })
          } else if (p.request.method === 'POST') {
            await cdp.send('Fetch.fulfillRequest', {
              requestId: p.requestId, responseCode: 201,
              responseHeaders: [...FETCH_CORS, { name: 'Content-Type', value: 'application/json' }],
              body: Buffer.from('[]').toString('base64'),
            })
          } else {
            /* GET 은 실서버로 — 삼키면 RLS 원시행 차단 검사가 자기 목업을 재는 헛검사가 된다 */
            await cdp.send('Fetch.continueRequest', { requestId: p.requestId })
          }
        } catch { /* 이미 사라진 요청 — 무해 */ }
      }
      await sleep(30)
    }
  })()

  const evl = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? '평가 실패')
    return r.result?.value
  }
  const waitFor = async (expr, tries = 80) => {
    for (let i = 0; i < tries; i++) {
      try { if (await evl(expr)) return true } catch { /* 렌더 전 */ }
      await sleep(250)
    }
    return false
  }
  const nav = async (url, readyExpr) => {
    await cdp.send('Page.navigate', { url })
    return waitFor(readyExpr)
  }
  const body = () => evl('document.body.innerText')

  /* ══════════ [1] 허브 ══════════ */
  console.log(`\n▶ 참여 허브 /pick  (${BASE})`)
  check('/pick 이 렌더된다', await nav(`${BASE}/pick`, `document.body.innerText.includes('취향으로 먼저')`))
  const tableRows = await evl(`[...document.querySelectorAll('aside table tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()))`)
  const rowsOk = Array.isArray(tableRows) && tableRows.length === 7 && rankRows.every((r, i) => {
    const e = expect.get(r.x)
    const row = tableRows[i] ?? []
    return row[0] === String(i + 1) && row[1].startsWith(r.x) &&
      row[2] === `${e.density}건` && row[3] === `${e.survivors.toLocaleString('ko-KR')}명`
  })
  check('우선순위 표 7행이 legacy-priority 순서·record-density 값과 일치', rowsOk, JSON.stringify(tableRows?.[0] ?? null))
  check(`기준일 ${lp.asOf} 이 표 꼬리에 있다`, (await body()).includes(`기준일 ${lp.asOf}`))
  /* ── 실선택 순위덱 (TallyDeck) — 정직성 규약을 글자 단위로 잰다 ──
     덱은 집계 읽기 실패 시 스스로 사라지는 것이 설계다. 살아 있을 때만 내용을 재고,
     사라져 있으면 그 사실을 기록하고 통과시킨다(게임·표는 그와 무관하게 떠 있어야 한다). */
  await waitFor(`!!document.querySelector('[data-tally-deck]')`, 20)
  const deckText = await evl(`document.querySelector('[data-tally-deck]')?.innerText ?? ''`)
  if (deckText) {
    check('순위덱 — 네 게임 블록이 다 있다', ['고향의 음식', '고향의 풍경', '북녘의 말', '우리 집 기억 밸런스'].every((s) => deckText.includes(s)))
    check('순위덱 — 각 블록에 「지금까지 N판」(n 상시 병기)', (deckText.match(/지금까지 [\d,]+판/g) ?? []).length >= 4)
    check('순위덱 — as-of(HH:MM 불러옴) 동반', /\d\d:\d\d 불러옴/.test(deckText))
    check('순위덱 — 0판 게임은 「아직 참여 기록이 없습니다」, 그 외엔 인원수(명)',
      deckText.includes('아직 참여 기록이 없습니다') || /[\d,]+명/.test(deckText))
    /* % 단독 금지 — 덱 안의 모든 % 는 「N명 (x%)」 짝으로만 나타난다 */
    const bare = deckText.replace(/[\d,]+명 \(\d+%\)/g, '')
    check('순위덱 — % 단독 표기 없음(항상 「N명 (x%)」 쌍)', !bare.includes('%'), (bare.match(/[^\n]{0,24}%[^\n]{0,8}/) ?? [''])[0])
    check('순위덱 — 일일 표식(하루 여러 판 1회 집계) 정직 고지', deckText.includes('한 번만 셉니다'))
    /* 상세보기 — 있으면 펼쳐서 전체 항목(0명 포함) 나열을 확인한다 */
    const hasDetailBtn = await evl(`!![...document.querySelectorAll('[data-tally-deck] button')].find(b => b.textContent.includes('전체 순위 상세보기'))`)
    if (hasDetailBtn) {
      await evl(`[...document.querySelectorAll('[data-tally-deck] button')].find(b => b.textContent.includes('전체 순위 상세보기'))?.click()`)
      await sleep(400)
      const expanded = await evl(`document.querySelector('[data-tally-deck]')?.innerText ?? ''`)
      check('순위덱 상세보기 — 펼침이 동작하고 0명 항목도 「아직 뽑히지 않음」으로 나열',
        expanded.length > deckText.length && (expanded.includes('아직 뽑히지 않음') || expanded.includes('접기')))
    } else {
      check('순위덱 상세보기 — 전 게임 0판이라 펼칠 것이 없음(빈 상태 문구가 그 자리)', deckText.includes('아직 참여 기록이 없습니다'))
    }

    /* ── 회귀: 출처 구획 — 이 덱이 통일부 자료가 아님을 머리에 그대로 밝힌다 ── */
    check('순위덱 — 출처 구획(「이 화면의 익명 집계 · 통일부 자료 아님」)', deckText.includes('이 화면의 익명 집계') && deckText.includes('통일부 자료 아님'))

    /* ── 회귀: 순위덱 실집계 일치 — 화면 수치를 페이지가 실제로 받은 pick_tally 응답과
       글자 단위로 대조한다(총판·1~5위 인원·%). 같은 응답이 근거라 경합·캐시 변명이 없다 ── */
    {
      const respEv = [...cdp.events].reverse().find((e) => e.method === 'Network.responseReceived' && /rest\/v1\/pick_tally/.test(e.params.response?.url ?? ''))
      let rows = null
      try {
        const b = await cdp.send('Network.getResponseBody', { requestId: respEv.params.requestId })
        rows = JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body)
      } catch { /* 미포착 — 아래 check 가 실패로 남긴다 */ }
      const gameLabels = [['food', '고향의 음식'], ['scene', '고향의 풍경'], ['word', '북녘의 말'], ['balance', '우리 집 기억 밸런스']]
      if (Array.isArray(rows)) {
        const fold = (game) => {
          const m = new Map()
          let total = 0
          for (const r of rows) {
            if (r.game !== game || !r.winner_key || !(Number(r.n) > 0)) continue
            const c = m.get(r.winner_key) ?? { n: 0 }
            c.n += Number(r.n)
            m.set(r.winner_key, c)
            total += Number(r.n)
          }
          return { total, top: [...m.values()].map((x) => x.n).sort((a, b) => b - a).slice(0, 5) }
        }
        const block = (label) => {
          const i = deckText.indexOf(label)
          if (i < 0) return ''
          const ends = gameLabels.map(([, l]) => l).filter((l) => l !== label).map((l) => deckText.indexOf(l)).filter((j) => j > i)
          return deckText.slice(i, ends.length ? Math.min(...ends) : undefined)
        }
        const bad = []
        for (const [game, label] of gameLabels) {
          const e = fold(game)
          const blk = block(label)
          const mTotal = blk.match(/지금까지 ([\d,]+)판/)
          const shownTotal = mTotal ? Number(mTotal[1].replace(/,/g, '')) : NaN
          const shownPairs = [...blk.matchAll(/([\d,]+)명 \((\d+)%\)/g)].map((m) => [Number(m[1].replace(/,/g, '')), Number(m[2])])
          const wantPairs = e.top.map((n) => [n, Math.round((n / e.total) * 100)])
          const okRows = e.total === 0
            ? blk.includes('아직 참여 기록이 없습니다')
            : JSON.stringify(shownPairs) === JSON.stringify(wantPairs)
          if (shownTotal !== e.total || !okRows) bad.push(`${game}: 화면 ${shownTotal}판 ${JSON.stringify(shownPairs)} ≠ 응답 ${e.total}판 ${JSON.stringify(wantPairs)}`)
        }
        check('순위덱 — 네 게임 전부 화면 수치 = pick_tally 실응답(총판·1~5위 인원·%)', bad.length === 0, bad.join(' | ').slice(0, 200))
      } else {
        check('순위덱 — pick_tally 응답 본문을 확보해 화면과 대조', false, '응답 미포착')
      }

      /* ── 회귀: RLS 원시행 차단 — 페이지와 같은 anon 자격으로 원시 테이블 select 를 두드려 본다.
         집계 뷰(pick_tally)만 나가고 원시행은 4xx 이거나 0행이어야 한다. 키 값은 출력하지 않는다 ── */
      /* method GET 만 — 같은 URL 의 CORS 사전요청(OPTIONS)에는 apikey 헤더가 없다 */
      const reqEv = [...cdp.events].reverse().find((e) => e.method === 'Network.requestWillBeSent' && e.params.request.method === 'GET' && /rest\/v1\/pick_tally/.test(e.params.request.url))
      /* requestWillBeSent 는 헤더를 다 싣지 않을 수 있다 — 같은 requestId 의 ExtraInfo 에 전체 헤더가 있다 */
      const reqId = reqEv?.params.requestId ?? respEv?.params.requestId
      const extraEv = reqId ? cdp.events.find((e) => e.method === 'Network.requestWillBeSentExtraInfo' && e.params.requestId === reqId) : null
      const hdrs = { ...(reqEv?.params.request.headers ?? {}), ...(extraEv?.params.headers ?? {}) }
      const auth = {}
      for (const [k, v] of Object.entries(hdrs)) if (/^(apikey|authorization)$/i.test(k)) auth[k.toLowerCase()] = v
      const tallyUrl = reqEv?.params.request.url ?? respEv?.params.response?.url
      if (tallyUrl && auth.apikey) {
        const origin = new URL(tallyUrl).origin
        for (const table of ['pick_event', 'pick_balance_answer']) {
          const r = await evl(`fetch(${JSON.stringify(`${origin}/rest/v1/${table}?select=*&limit=3`)}, { headers: ${JSON.stringify(auth)} }).then(async (res) => { let len = -1; try { const j = await res.json(); len = Array.isArray(j) ? j.length : -1 } catch { /* 본문 없음 */ } return { status: res.status, len } })`)
          check(`RLS — anon 이 ${table} 원시행을 읽지 못한다(4xx 또는 0행)`,
            r && !(r.status >= 200 && r.status < 300 && r.len > 0), r ? `HTTP ${r.status} · ${r.len}행` : '요청 실패')
        }
      } else {
        check('RLS — anon 자격 헤더를 포착해 원시행 차단을 확인', false, 'pick_tally 요청 미포착')
      }
    }
  } else {
    check('순위덱 — 집계 읽기 실패로 조용히 감춰짐(설계 동작). 표·게임 카드는 떠 있다', (await body()).includes('기록 계승 우선순위'), '덱 없음')
  }

  /* ══════════ 월드컵 공용 절차 ══════════ */
  const clickPick = `(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'').includes('고르기'))
    if (!b) return null
    const name = (b.getAttribute('aria-label')||'').replace(/^왼쪽 — |^오른쪽 — /,'').replace(/ 고르기$/,'')
    b.click(); return name
  })()`
  const counter = async () => {
    const t = await body()
    const m = t.match(/(\d+)번 골랐습니다/)
    return m ? Number(m[1]) : null
  }
  async function playTournament(slug, readyText) {
    if (!(await nav(`${BASE}/pick/${slug}`, `document.body.innerText.includes('${readyText}')`))) return { up: false }
    /* 되돌리기 */
    await evl(clickPick); await sleep(200)
    const after1 = await counter()
    await evl(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('한 판 되돌리기'))?.click()`)
    await sleep(200)
    const afterUndo = await counter()
    /* 키보드 ← */
    await evl(`document.body.focus()`)
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 })
    await sleep(250)
    const afterKey = await counter()
    /* 완주 — 남은 판을 전부 누른다. 도는 동안 참고 사진 카드가 실제로 떴는지도 누적 관찰 */
    let winner = null
    let sawPhoto = false
    for (let i = 0; i < 20; i++) {
      if (!sawPhoto) sawPhoto = Boolean(await evl(`!!document.querySelector('img[src*="/pick-img/"]')`))
      const name = await evl(clickPick)
      if (name == null) break
      winner = name
      await sleep(160)
    }
    const doneText = await body()
    return { up: true, undoOk: after1 === 1 && afterUndo === 0, keyOk: afterKey === 1, winner, sawPhoto, finished: doneText.includes('마지막까지 남은 것'), doneText }
  }
  /* 결과 화면의 실선택 순위덱 — 마운트 후 한 박자 늦게(자기 판 반영 대기 900ms) 뜬다 */
  const resultDeck = async () => {
    await waitFor(`!!document.querySelector('[data-tally-deck]')`, 24)
    return (await evl(`document.querySelector('[data-tally-deck]')?.innerText ?? ''`)) ?? ''
  }
  function checkResultDeck(game, deck) {
    check(`${game}: 결과 화면 순위덱 — 그 게임 것 하나(판수·불러온 시각 병기 또는 빈 상태)`,
      deck.includes('실시간 실선택 순위') && /지금까지 [\d,]+판/.test(deck) && /\d\d:\d\d 불러옴/.test(deck) &&
      (/[\d,]+명/.test(deck) || deck.includes('아직 참여 기록이 없습니다')),
      deck ? '' : '덱 없음(집계 불가)')
  }
  function checkRegionResult(game, winner, doneText) {
    const region = regionOfName.get(winner)
    const e = region ? expect.get(region) : null
    check(`${game}: 결과 순위 = analysis.json (전국 ${e?.rank}위 / 7)`, e && doneText.includes(`전국 ${e.rank}위`) && doneText.includes('/ 7'), `우승 「${winner}」 → ${region}`)
    check(`${game}: 남은 분 ${e?.survivors?.toLocaleString('ko-KR')}명 · 1인당 ${e?.density}건 이 그대로 적힌다`,
      e && doneText.includes(`${e.survivors.toLocaleString('ko-KR')}명`) && doneText.includes(`${e.density}건`))
    check(`${game}: 기준일 ${lp.asOf} 동반`, doneText.includes(lp.asOf))
    /* analysis.json caveat 원문("점수로 읽을 수 있는 수치가 아니다")이 그대로 실리는지 잰다 */
    check(`${game}: 순위합 주의(점수가 아니라 순서) 동반`, /점수(가|로)[^]{0,20}아니/.test(doneText))
    check(`${game}: 행동 3단추(지도·기억 카드·그 고향의 기록)`,
      doneText.includes('지도로 가기') && doneText.includes('기억 카드 만들기') && doneText.includes('그 고향에서 온 기록 보기'))
  }

  /* ══════════ [2] 음식 ══════════ */
  console.log('\n▶ 음식 월드컵 /pick/food')
  const food = await playTournament('food', '고향의 음식 월드컵')
  check('음식: 화면이 뜬다', food.up)
  check('음식: 한 판 되돌리기가 한 판만 무른다', food.undoOk)
  check('음식: 키보드 ← 로 골라진다', food.keyOk)
  check('음식: 15번 눌러 결승까지 완주', food.finished, `우승 「${food.winner}」`)
  if (food.finished) {
    checkRegionResult('음식', food.winner, food.doneText)
    check('음식: 통설 고지(통일부 자료 아님)가 결과에도 남는다', food.doneText.includes('통일부') && food.doneText.includes('통설'))
    check('음식: 진행 중 참고 사진 카드가 실제로 떴다(확보 항목)', food.sawPhoto)
    {
      const wf = items.foods.find((f) => f.name === food.winner)
      if (wf && photos[wf.id]) {
        check('음식: 우승 카드 저작자 표시(작가·라이선스·위키미디어) + 출처 링크 + 조리법 차이 고지',
          food.doneText.includes('위키미디어 공용') && food.doneText.includes(photos[wf.id].license) &&
          (await body()).includes('사진 출처 열기') && (await body()).includes('조리법 그대로가 아닐 수 있습니다'))
      } else {
        check('음식: 우승 항목은 사진 미확보 — 글자 카드 유지(억지 사진 없음)', !food.doneText.includes('위키미디어 공용') || Boolean(wf && photos[wf.id]), `우승 「${food.winner}」`)
      }
    }
    checkResultDeck('음식', await resultDeck())

    /* ══════════ [3] 공유 PNG ══════════ */
    await evl(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('공유 그림 저장'))?.click()`)
    const gotPng = await waitFor(`(document.querySelector('a[download]')?.href || '').startsWith('data:image/png')`, 40)
    check('공유 PNG — canvas 가 data:image/png 를 돌려준다', gotPng)
    if (gotPng) {
      const dataUrl = await evl(`document.querySelector('a[download]').href`)
      fs.mkdirSync(path.dirname(PNG_OUT), { recursive: true })
      fs.writeFileSync(PNG_OUT, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
      check('공유 PNG 저장', fs.statSync(PNG_OUT).size > 10000, `${path.relative(root, PNG_OUT)} (${Math.round(fs.statSync(PNG_OUT).size / 1024)}KB)`)
    }
  }

  /* ══════════ [4] 풍경 ══════════ */
  console.log('\n▶ 풍경 월드컵 /pick/scene')
  const scene = await playTournament('scene', '고향의 풍경 월드컵')
  check('풍경: 화면이 뜬다', scene.up)
  check('풍경: 완주(사진 로드 여부와 무관하게)', scene.finished, `우승 「${scene.winner}」`)
  if (scene.finished) {
    checkRegionResult('풍경', scene.winner, scene.doneText)
    check('풍경: 제공처 표기가 결과에 남는다', /제공\s*:/.test(scene.doneText))
    check('풍경: 원문 페이지 링크 동반', scene.doneText.includes('통일부 원문 페이지'))
  }

  /* ══════════ [5] 말 ══════════ */
  console.log('\n▶ 말 월드컵 /pick/word')
  const word = await playTournament('word', '북녘의 말 월드컵')
  check('말: 화면이 뜬다', word.up)
  check('말: 완주', word.finished, `우승 「${word.winner}」`)
  if (word.finished) {
    check('말: 지역 통계를 붙이지 않는다고 화면이 말한다', word.doneText.includes('지역 통계를 붙이지 않습니다'))
    check('말: 순위 구획이 없다(지역 축이 없으므로)', !word.doneText.includes('전국 ') && !word.doneText.includes('위 / 7'))
    check('말: 통일부 공공데이터 출처 명기(21,985쌍)', word.doneText.includes('21,985'))
    check('말: 같은 자료의 대응 3쌍을 더 보여 준다', word.doneText.includes('세 쌍 더'))
    check('말: 팩트체커로 잇는다', word.doneText.includes('팩트체커에서 찾아보기'))
    check('말: 우승 카드가 「그 물건」 참고 사진 + 표준어 명기 캡션 + 위키미디어 저작자 표시(16/16 확보)',
      word.sawPhoto && word.doneText.includes("의 참고 사진") && word.doneText.includes('위키미디어 공용'))
    check('말: 사진 출처 링크(결과 화면에서만 — 카드는 button 안이라 글자만)', (await body()).includes('사진 출처 열기'))
    /* 회귀: 저작자 표시 렌더 — 우승 항목의 작가·라이선스 실명이 pick-photos.ts 와 글자 단위 일치 */
    {
      const wWin = items.words.pairs.find((w) => w.nk === word.winner)
      const wp = wWin ? photos[wWin.id] : null
      check('말: 우승 카드 저작자 실명·라이선스 = pick-photos.ts 원문(글자 단위)',
        Boolean(wp) && word.doneText.includes(wp.author) && word.doneText.includes(wp.license),
        wp ? `우승 「${word.winner}」 → ${wp.license}` : `우승 「${word.winner}」 사진 자료 없음`)
    }
    checkResultDeck('말', await resultDeck())
  }

  /* ══════════ [5b] 사진 폴백 — 이미지가 전부 죽어도 글자 카드로 게임이 계속된다 ══════════ */
  console.log('\n▶ 사진 폴백 /pick/word (pick-img 전 요청 차단)')
  {
    blockImg = true
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    try {
      const up = await nav(`${BASE}/pick/word`, `document.body.innerText.includes('북녘의 말 월드컵')`)
      await sleep(1200)   // onerror → TextFace 재렌더 대기
      const leftImgs = await evl(`document.querySelectorAll('img[src*="/pick-img/"]').length`)
      const btns = await evl(`[...document.querySelectorAll('button')].filter(b => (b.getAttribute('aria-label')||'').includes('고르기')).length`)
      const picked = await evl(clickPick)
      check('사진 폴백 — 이미지 전멸에도 글자 카드 2장이 서고 한 판이 골라진다',
        up && leftImgs === 0 && btns === 2 && picked != null, `잔존 img ${leftImgs} · 카드 ${btns} · 선택 「${picked}」`)
    } finally {
      blockImg = false
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
    }
  }

  /* ══════════ [6] 밸런스 ══════════ */
  console.log('\n▶ 우리 집 기억 밸런스 /pick/balance')
  const balUp = await nav(`${BASE}/pick/balance`, `document.body.innerText.includes('우리 집 기억 밸런스')`)
  check('밸런스: 화면이 뜬다', balUp)
  for (let i = 0; i < 8; i++) {
    await evl(`[...document.querySelectorAll('button')].find(b => b.className.includes('min-h-[72px]'))?.click()`)
    await sleep(150)
  }
  const homeStepUp = (await body()).includes('고향이 어디셨습니까')
  check('밸런스: 8문항 뒤 고향 고르기(「모릅니다」 동등 선택지)', homeStepUp && (await body()).includes('모릅니다'))
  await evl(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '황해도(구)')?.click()`)
  await sleep(400)
  const balText = await body()
  check('밸런스: 결과 — 답에서 따라 나온 유형 안내(점수 없음)', balText.includes('중심입니다') && !/\d+점/.test(balText))
  const lrd = paths.paths.find((p) => p.id === 'life-record-donation')
  check('밸런스: 경로 카드가 paths.json 실측(생애기록물 기증 + 연락처)', balText.includes(lrd.title) && balText.includes('02-2100-5916'))
  const hw = expect.get('황해도(구)')
  check(`밸런스: 황해도(구) 수치 = analysis.json (${hw.rank}위 · ${hw.survivors.toLocaleString('ko-KR')}명 · ${hw.density}건)`,
    balText.includes(`전국 ${hw.rank}위`) && balText.includes(`${hw.survivors.toLocaleString('ko-KR')}명`) && balText.includes(`${hw.density}건`))
  check('밸런스: 문항별 집계 고지(여덟 문항의 선택이 집계됨을 정직하게)', balText.includes('여덟 문항의 선택'))
  checkResultDeck('밸런스', await resultDeck())

  /* ══════════ [7] 375px 모바일 ══════════ */
  console.log('\n▶ 375px 모바일 가로 넘침')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
  for (const p of ['/pick', '/pick/food', '/pick/balance']) {
    await cdp.send('Page.navigate', { url: `${BASE}${p}` })
    await sleep(1200)
    const over = await evl(`Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth`)
    check(`${p} 가로 넘침 0 (375px)`, typeof over === 'number' && over <= 0, `넘침 ${over}px`)
  }

  /* ══════════ [8] 집계 전송 본문 — 허용 필드뿐인가(개인정보 0) ══════════ */
  const posts = []
  const balPosts = []
  for (const ev of cdp.events) {
    if (ev.method === 'Network.requestWillBeSent') {
      const r = ev.params.request
      if (r.method !== 'POST') continue
      if (/supabase\.co\/rest\/v1\/pick_event/.test(r.url)) posts.push(r.postData ?? '')
      else if (/supabase\.co\/rest\/v1\/pick_balance_answer/.test(r.url)) balPosts.push(r.postData ?? '')
    }
  }
  const bodyFieldsOk = (list, allow) => list.every((p) => {
    try {
      const j = JSON.parse(p)
      const rows = Array.isArray(j) ? j : [j]
      return rows.every((row) => Object.keys(row).every((k) => allow.includes(k)))
    } catch { return false }
  })
  if (posts.length) {
    check(`집계 전송 ${posts.length}건 — pick_event 본문이 (게임·항목·고향) 4필드뿐`, bodyFieldsOk(posts, ['game', 'winner_key', 'winner_label', 'home_old']))
  } else {
    check('집계 전송 — 이번 실행에서 전송 없음(supabase 미설정·표식 존재·테이블 없음 중 하나). 게임은 그와 무관하게 완주했다', true)
  }
  if (balPosts.length) {
    const rows = balPosts.flatMap((p) => { try { const j = JSON.parse(p); return Array.isArray(j) ? j : [j] } catch { return [{}] } })
    check(`밸런스 문항 전송 ${balPosts.length}건(${rows.length}행) — 본문이 (문항 id·가/나) 2필드뿐 · 판 연결키 없음`,
      bodyFieldsOk(balPosts, ['q_id', 'choice']) && rows.length === 8)
  } else {
    check('밸런스 문항 전송 — 이번 실행에서 전송 없음(표식 존재 등). 게임은 그와 무관하게 완주했다', true)
  }

  /* ══════════ [9] JS 예외 0 ══════════ */
  const errs = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text ?? '')
    .filter((d) => !/Failed to fetch|NetworkError|ERR_/.test(d))   // 집계·외부 이미지의 네트워크 실패는 설계상 무해
  check('JS 예외 0 (네트워크 실패 제외)', errs.length === 0, errs.slice(0, 2).join(' | ').slice(0, 160))
  pumpOn = false
  await pump
  await cdp.send('Fetch.disable')
} catch (e) {
  check('검증 실행', false, String(e?.message ?? e))
} finally {
  try { cdp?.close() } catch { /* 무해 */ }
  chrome.kill()
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* 무해 */ }
}

failed = results.filter((r) => !r.pass).length
console.log(`\n${failed ? '✗' : '✓'} ${results.length - failed}/${results.length} 통과`)
process.exit(failed ? 1 : 0)
