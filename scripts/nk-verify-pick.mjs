#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   참여(/pick) 실제 브라우저 검증 — 월드컵 3종 + 기억 밸런스

   왜 실제 브라우저인가 (nk-verify-deck.mjs 와 같은 이유·같은 방식: headless Chrome + CDP)
     "결승까지 돌아간다"는 코드가 있다는 말이지 돌아갔다는 말이 아니다.
     세 월드컵을 **15번 실제로 눌러 끝까지** 가고, 결과 화면의 수치를
     analysis.json 확정값과 글자 단위로 대조한다.

   무엇을 재는가
     [1] /pick 허브 — 우선순위 표 7행이 analysis.json legacy-priority 순서·값과 일치
     [2] 음식 월드컵 — 되돌리기·키보드 ←·15연타 완주 · 결과 수치 = analysis.json
     [3] 공유 PNG — canvas 가 data:image/png 를 실제로 돌려주는가 (파일로 저장)
     [4] 풍경 월드컵 — 제공처 표기 · 완주 · 결과 수치 대조 (사진 로드 실패에도 완주)
     [5] 말 월드컵 — 완주 · 「지역 통계를 붙이지 않습니다」 · 순위 구획이 없어야 한다
     [6] 밸런스 — 8문항 + 고향 선택 → 경로 카드(paths.json 연락처) · 지역 수치 대조
     [7] 375px 모바일 — 가로 넘침 0
     [8] 집계 전송 — supabase POST 본문에 허용 4필드 외 아무것도 없는가(개인정보 0)
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
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*rest/v1/pick_event*' }] })
  const FETCH_CORS = [
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: '*' },
    { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
  ]
  let pumpOn = true
  let pumpSeen = 0
  const pump = (async () => {
    while (pumpOn) {
      while (pumpSeen < cdp.events.length) {
        const ev = cdp.events[pumpSeen++]
        if (ev.method !== 'Fetch.requestPaused') continue
        const p = ev.params
        try {
          if (p.request.method === 'OPTIONS') {
            await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, responseHeaders: FETCH_CORS })
          } else {
            await cdp.send('Fetch.fulfillRequest', {
              requestId: p.requestId, responseCode: 201,
              responseHeaders: [...FETCH_CORS, { name: 'Content-Type', value: 'application/json' }],
              body: Buffer.from('[]').toString('base64'),
            })
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
  const tallyShown = (await body()).includes('지금까지 많이 뽑힌 것')
  check('참여 통계 구획 — 표본 없으면 감춤 · 있으면 표본 병기', !tallyShown || (await body()).includes('판 기준'), tallyShown ? '표시됨(표본 병기 확인)' : '감춰짐')

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
    /* 완주 — 남은 판을 전부 누른다 */
    let winner = null
    for (let i = 0; i < 20; i++) {
      const name = await evl(clickPick)
      if (name == null) break
      winner = name
      await sleep(160)
    }
    const doneText = await body()
    return { up: true, undoOk: after1 === 1 && afterUndo === 0, keyOk: afterKey === 1, winner, finished: doneText.includes('마지막까지 남은 것'), doneText }
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

  /* ══════════ [7] 375px 모바일 ══════════ */
  console.log('\n▶ 375px 모바일 가로 넘침')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
  for (const p of ['/pick', '/pick/food', '/pick/balance']) {
    await cdp.send('Page.navigate', { url: `${BASE}${p}` })
    await sleep(1200)
    const over = await evl(`Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth`)
    check(`${p} 가로 넘침 0 (375px)`, typeof over === 'number' && over <= 0, `넘침 ${over}px`)
  }

  /* ══════════ [8] 집계 전송 본문 — 허용 4필드뿐인가 ══════════ */
  const posts = []
  for (const ev of cdp.events) {
    if (ev.method === 'Network.requestWillBeSent') {
      const r = ev.params.request
      if (r.method === 'POST' && /supabase\.co\/rest\/v1\/pick_event/.test(r.url)) posts.push(r.postData ?? '')
    }
  }
  if (posts.length) {
    const ok = posts.every((p) => {
      try {
        const j = JSON.parse(p)
        const rows = Array.isArray(j) ? j : [j]
        return rows.every((row) => Object.keys(row).every((k) => ['game', 'winner_key', 'winner_label', 'home_old'].includes(k)))
      } catch { return false }
    })
    check(`집계 전송 ${posts.length}건 — 본문이 (게임·항목·고향) 4필드뿐`, ok)
  } else {
    check('집계 전송 — 이번 실행에서 전송 없음(supabase 미설정·표식 존재·테이블 없음 중 하나). 게임은 그와 무관하게 완주했다', true)
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
