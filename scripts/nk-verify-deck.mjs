#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   분석 덱(/deck) · 기억 카드 실제 브라우저 검증

   왜 실제 브라우저인가
     타입 검사(tsc)는 "카드가 넘어가는가"를 모른다. canvas.toDataURL 이 데이터 URL 을
     돌려주는지도 모른다. 화면이 하는 일을 화면에서 재야 한다 —
     nk-shot-gohyang.mjs 와 같은 방식(headless Chrome + CDP)이되, 캡처가 아니라 **판정**을 낸다.

   무엇을 재는가
     [1] /deck 이 뜨고 카드 수·진행 표시가 analysis.json 과 일치하는가
     [2] 「다음」 단추로 카드가 실제로 바뀌는가 (제목·진행 표시 둘 다)
     [3] 키보드 ← → 로도 바뀌는가
     [4] 판정 배지가 성립·약함·불가 세 가지로 전부 렌더되는가(불가를 숨기지 않았는가)
     [5] 카드 전부를 한 바퀴 돌 때 SVG/표가 하나라도 그려지는가 · 콘솔 오류 0인가
     [6] 기억 카드: 고향 고르기 → 답 입력 → 미리보기 → PNG 생성
         (canvas.toDataURL 이 data:image/png 로 시작하는 문자열을 돌려주는지 실측)
     [7] 기억 카드 입력이 localStorage 에만 남는가 — 네트워크 요청에 답이 실려 나가지 않았는가

   사용법
     node scripts/nk-verify-deck.mjs [--base http://localhost:5178] [--json]
     (개발 서버가 떠 있어야 한다: .claude/launch.json 의 sasilon, 포트 5178)

   나가는 값: 전부 통과면 0, 하나라도 실패면 1.
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const AS_JSON = argv.includes('--json')
const BASE = (argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : '') || 'http://localhost:5178'
const PORT = 9224

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => fs.existsSync(p))
if (!CHROME) {
  console.error('✗ Chrome 실행 파일을 찾지 못했다.')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail })
  if (!AS_JSON) console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`)
}

/* ── CDP ── */
async function targets() {
  return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
}
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
    } else if (m.method) {
      events.push(m)
    }
  })
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', () => rej(new Error('CDP 연결 실패')))
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id
      pending.set(i, { resolve, reject })
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  return { ready, send, events, close: () => ws.close() }
}

/* ── 원본 자료 — 화면이 이 파일과 같은 말을 하는지 대조한다 ── */
const analysis = JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/gohyang/analysis.json'), 'utf8'))

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-verify-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
    '--force-device-scale-factor=1', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ],
  { stdio: 'ignore' },
)

let cdp
let failed = 0
try {
  let ts = null
  for (let i = 0; i < 60; i++) {
    try { ts = await targets(); if (ts?.length) break } catch { /* 아직 안 떴다 */ }
    await sleep(250)
  }
  if (!ts?.length) throw new Error('CDP 포트가 열리지 않았다')
  cdp = connect(ts.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ts[0].webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })

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

  /* ══════════ ① 분석 덱 ══════════ */
  if (!AS_JSON) console.log(`\n▶ 분석 덱 /deck  (${BASE})`)
  await cdp.send('Page.navigate', { url: `${BASE}/deck` })
  const deckUp = await waitFor(`document.body.innerText.includes('재본 것과')`)
  check('/deck 이 렌더된다', deckUp)

  const total = analysis.cards.length
  const progress = await evl(`(() => {
    const el = [...document.querySelectorAll('p')].find(p => /^\\d+ \\/ \\d+$/.test(p.textContent.trim()))
    return el ? el.textContent.trim() : null
  })()`)
  check(`진행 표시가 카드 수와 일치 (1 / ${total})`, progress === `1 / ${total}`, `화면 표시 "${progress}"`)

  const idxCount = await evl(`document.querySelectorAll('#deck-index ol > li').length`)
  check(`목차에 카드 ${total}장이 전부 있다`, idxCount === total, `목차 ${idxCount}장`)

  const firstTitle = await evl(`document.querySelector('article h2')?.textContent?.trim() ?? null`)
  check('첫 카드 질문이 자료와 같다', firstTitle === analysis.cards[0].question, `화면 "${String(firstTitle).slice(0, 30)}…"`)

  /* 「다음」 단추로 넘긴다 */
  const clickNext = `(() => {
    const b = [...document.querySelectorAll('button')].filter(x => x.textContent.replace(/\\s+/g,'').startsWith('다음') && !x.disabled)[0]
    if (!b) return false; b.click(); return true
  })()`
  await evl(clickNext)
  await sleep(300)
  const p2 = await evl(`[...document.querySelectorAll('p')].find(p => /^\\d+ \\/ \\d+$/.test(p.textContent.trim()))?.textContent.trim()`)
  const t2 = await evl(`document.querySelector('article h2')?.textContent?.trim()`)
  check('「다음」 단추로 카드가 넘어간다', p2 === `2 / ${total}` && t2 === analysis.cards[1].question, `${p2} · "${String(t2).slice(0, 24)}…"`)

  /* 키보드 → ← */
  const key = async (k, code) => {
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: code === 'ArrowRight' ? 39 : 37 })
    }
    await sleep(250)
  }
  await evl(`document.body.focus()`)
  await key('ArrowRight', 'ArrowRight')
  const p3 = await evl(`[...document.querySelectorAll('p')].find(p => /^\\d+ \\/ \\d+$/.test(p.textContent.trim()))?.textContent.trim()`)
  await key('ArrowLeft', 'ArrowLeft')
  const p4 = await evl(`[...document.querySelectorAll('p')].find(p => /^\\d+ \\/ \\d+$/.test(p.textContent.trim()))?.textContent.trim()`)
  check('키보드 ← → 로도 넘어간다', p3 === `3 / ${total}` && p4 === `2 / ${total}`, `→ ${p3} · ← ${p4}`)

  /* 주소에 카드 id 가 남는가 (공유·발표에서 특정 카드를 가리키기 위한 것) */
  const urlHas = await evl(`decodeURIComponent(location.search).includes('카드=')`)
  check('주소에 카드 id 가 남는다', urlHas, await evl(`decodeURIComponent(location.search)`))

  /* 카드 21장을 전부 돌며 그림/표가 있는지, 판정 배지가 붙는지 센다 */
  const sweep = await evl(`(async () => {
    const out = []
    const idx = [...document.querySelectorAll('#deck-index ol > li button')]
    for (let i = 0; i < idx.length; i++) {
      idx[i].click()
      await new Promise(r => setTimeout(r, 60))
      const a = document.querySelector('article')
      const txt = a ? a.innerText : ''
      /* 판정 배지에는 '판정: ' 이라는 화면낭독기용 문구가 들어 있다 —
         sr-only 는 innerText 에 잡히지 않으므로 textContent 로 읽는다 */
      const all = a ? a.textContent : ''
      out.push({
        i,
        h2: a?.querySelector('h2')?.textContent?.trim() ?? null,
        svg: a ? a.querySelectorAll('svg[role="img"]').length : 0,
        table: a ? a.querySelectorAll('table').length : 0,
        verdict: /판정: (성립|약함|불가)/.test(all) ? all.match(/판정: (성립|약함|불가)/)[1] : null,
        hasAsOf: /기준일 \\d{4}-\\d{2}-\\d{2}/.test(txt),
        hasCaveat: txt.includes('이 수치의 한계'),
        hasSource: txt.includes('이 분석이 쓴 자료'),
      })
    }
    return out
  })()`)
  const byVerdict = sweep.reduce((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {})
  const want = analysis.cards.reduce((m, c) => ({ ...m, [c.verdict]: (m[c.verdict] ?? 0) + 1 }), {})
  check(
    `카드 ${total}장 전부 판정 배지 — 성립 ${want['성립'] ?? 0} · 약함 ${want['약함'] ?? 0} · 불가 ${want['불가'] ?? 0}`,
    JSON.stringify(byVerdict) === JSON.stringify(want),
    `화면 ${JSON.stringify(byVerdict)}`,
  )
  const drawn = sweep.filter((r) => r.svg > 0 || r.table > 0).length
  const withFigure = analysis.cards.filter((c) => (c.series ?? []).length > 0 || (c.table ?? []).length > 0).length
  check(`그래프·표가 있는 카드 ${withFigure}장이 전부 그려진다`, drawn === withFigure, `그려진 카드 ${drawn}장`)
  check('모든 카드에 기준일이 붙는다', sweep.every((r) => r.hasAsOf), `누락 ${sweep.filter((r) => !r.hasAsOf).length}장`)
  check('모든 카드에 출처 줄이 붙는다', sweep.every((r) => r.hasSource), `누락 ${sweep.filter((r) => !r.hasSource).length}장`)

  /* ══════════ ② 기억 카드 ══════════ */
  if (!AS_JSON) console.log(`\n▶ 기억 카드 (후손 다리 구획 안)`)
  await evl(`localStorage.removeItem('gohyang_memory_card_v1')`)
  await cdp.send('Page.navigate', { url: `${BASE}/` })
  const homeUp = await waitFor(`document.body.innerText.includes('기억 카드 만들기')`, 120)
  check('후손 다리 안에 「기억 카드 만들기」가 있다', homeUp)

  const privacy = await evl(`document.body.innerText.includes('적으신 내용은 서버로 보내지 않습니다')`)
  check('개인정보 고지가 화면에 있다', privacy)

  /* 고향 고르기 — 「황해도(구)」 단추 (기억 카드 구획 안의 것) */
  const picked = await evl(`(() => {
    const sec = document.querySelector('#memory-card')
    if (!sec) return 'no-section'
    const b = [...sec.querySelectorAll('button')].find(x => x.textContent.includes('황해도'))
    if (!b) return 'no-button'
    b.click(); return 'ok'
  })()`)
  await sleep(500)
  const asked = await evl(`document.querySelector('#memory-card')?.innerText.includes('기억을 여쭙겠습니다') ?? false`)
  check('고향을 고르면 질문 단계로 넘어간다', picked === 'ok' && asked, `단추 ${picked}`)

  /* 데이터가 질문을 만들었는가 — 연표·사료·날씨 단서가 실제로 붙는가 */
  const prompts = await evl(`(() => {
    const t = document.querySelector('#memory-card')?.innerText ?? ''
    return {
      event: t.includes('이 무렵 집안에서 들으신 이야기가 있습니까'),
      relic: t.includes('비슷한 사진이나 물건이 댁에 있습니까'),
      season: t.includes('어떤 계절의 이야기를 들으셨습니까'),
      place: t.includes('마을·거리·산·강 이름'),
      timeline: /\\d{4}년 \\d{1,2}월 \\d{1,2}일/.test(t),
    }
  })()`)
  check('질문 4종이 데이터 단서와 함께 뜬다', Object.values(prompts).every(Boolean), JSON.stringify(prompts))

  /* 답 입력 — React 상태에 들어가도록 네이티브 setter 로 값을 넣고 input 이벤트를 쏜다 */
  const typed = await evl(`(() => {
    const sec = document.querySelector('#memory-card')
    const setV = (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const ins = [...sec.querySelectorAll('input[type=text]')]
    const tas = [...sec.querySelectorAll('textarea')]
    if (ins.length < 2 || tas.length < 4) return 'not-enough-fields:' + ins.length + '/' + tas.length
    setV(ins[0], '김○○')
    setV(ins[1], '할아버지')
    setV(tas[0], '재령벌, 큰내')
    setV(tas[1], '피난 나오시던 해 겨울 이야기를 들었습니다.')
    setV(tas[2], '할아버지 사진 두 장이 집에 있습니다.')
    setV(tas[3], '겨울에 강이 얼면 썰매를 탔다고 하셨습니다.')
    return 'ok'
  })()`)
  await sleep(400)
  check('답을 입력할 수 있다', typed === 'ok', typed)

  const saved = await evl(`(() => {
    const raw = localStorage.getItem('gohyang_memory_card_v1')
    if (!raw) return null
    const d = JSON.parse(raw)
    return { homeId: d.homeId, elder: d.elder, hasSeason: Boolean(d.season), savedAt: d.savedAt }
  })()`)
  check('작성 내용이 localStorage 에 임시 저장된다', Boolean(saved?.homeId && saved?.elder && saved?.hasSeason), JSON.stringify(saved))

  /* 미리보기 */
  await evl(`(() => {
    const b = [...document.querySelector('#memory-card').querySelectorAll('button')].find(x => x.textContent.includes('미리보기'))
    if (b) b.click(); return Boolean(b)
  })()`)
  await sleep(400)
  const preview = await evl(`(() => {
    const el = document.querySelector('.memcard-print')
    return el ? { has: true, text: el.innerText.slice(0, 400) } : { has: false }
  })()`)
  check(
    '미리보기(인쇄 대상)가 뜨고 답이 실린다',
    preview.has && preview.text.includes('썰매') && preview.text.includes('황해도'),
    preview.has ? preview.text.replace(/\n/g, ' / ').slice(0, 90) : '없음',
  )

  /* PNG 생성 — canvas.toDataURL 이 데이터 URL 을 돌려주는지 실측 */
  const before = cdp.events.filter((e) => e.method === 'Network.requestWillBeSent').length
  await evl(`(() => {
    const b = [...document.querySelector('#memory-card').querySelectorAll('button')].find(x => x.textContent.includes('그림 파일로 내려받기'))
    if (b) b.click(); return Boolean(b)
  })()`)
  await sleep(900)
  const pngInfo = await evl(`(() => {
    const a = document.querySelector('[data-memcard-png]')
    if (!a) return null
    const href = a.getAttribute('href') || ''
    return { prefix: href.slice(0, 22), len: href.length, download: a.getAttribute('download') }
  })()`)
  check(
    'canvas.toDataURL 이 PNG 데이터 URL 을 돌려준다',
    Boolean(pngInfo && pngInfo.prefix.startsWith('data:image/png;base64') && pngInfo.len > 20000),
    pngInfo ? `${pngInfo.prefix}… ${Math.round(pngInfo.len / 1024)}KB · 파일명 ${pngInfo.download}` : '링크 없음',
  )

  /* 인쇄 경로 — 내려받기가 막힌 환경의 대체 경로가 실제로 있는가 */
  const printable = await evl(`(() => {
    const b = [...document.querySelector('#memory-card').querySelectorAll('button')].find(x => x.textContent.includes('인쇄하기'))
    return Boolean(b) && Boolean(document.querySelector('.memcard-print'))
  })()`)
  check('인쇄 경로가 함께 있다', printable)

  const donation = await evl(`document.querySelector('#memory-card')?.innerText.includes('이 기록을 국가 기록으로 남기시려면') ?? false`)
  check('완성 카드 아래에 기증 경로가 붙는다', donation)

  /* 개인정보가 밖으로 나가지 않았는가 — 입력 뒤 발생한 요청 URL·본문에 답이 실렸는지 본다 */
  const after = cdp.events.filter((e) => e.method === 'Network.requestWillBeSent')
  const leaked = after.slice(before).filter((e) => {
    const u = decodeURIComponent(e.params?.request?.url ?? '')
    const body = e.params?.request?.postData ?? ''
    return /김○○|할아버지|썰매|재령벌/.test(u + body)
  })
  check('입력한 내용이 네트워크로 나가지 않는다', leaked.length === 0, `의심 요청 ${leaked.length}건`)

  /* 이어 쓰기 — 다시 들어와도 남아 있는가 */
  await cdp.send('Page.navigate', { url: `${BASE}/` })
  await waitFor(`document.body.innerText.includes('기억 카드 만들기')`, 120)
  const resumed = await evl(`(() => {
    const t = document.querySelector('#memory-card')?.innerText ?? ''
    const ta = [...(document.querySelector('#memory-card')?.querySelectorAll('textarea') ?? [])].map(x => x.value)
    return { banner: t.includes('작성 중이던 내용을 불러왔습니다'), values: ta.filter(Boolean).length }
  })()`)
  check('다시 들어오면 이어 쓸 수 있다', resumed.banner && resumed.values >= 3, JSON.stringify(resumed))

  /* 콘솔 오류 */
  const errs = cdp.events
    .filter((e) => e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
    .map((e) => e.params.entry.text)
    /* 박물관 원본 이미지가 개발 서버 경유로에서 502 로 막히는 것은 화면 밖의 일이다(이미지는 감춰진다) */
    .filter((t) => !/museum-img|favicon/.test(t))
  check('콘솔 오류 0건', errs.length === 0, errs.slice(0, 3).join(' | '))

  failed = results.filter((r) => !r.pass).length
} catch (e) {
  check('검증 실행', false, e?.message ?? String(e))
  failed = results.filter((r) => !r.pass).length
} finally {
  try { cdp?.close() } catch { /* 이미 닫혔다 */ }
  chrome.kill()
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* 프로필 정리 실패는 무해하다 */ }
}

if (AS_JSON) {
  console.log(JSON.stringify({ base: BASE, total: results.length, failed, results }))
} else {
  console.log(`\n${failed === 0 ? '✓' : '✗'} ${results.length - failed}/${results.length} 통과\n`)
}
process.exit(failed === 0 ? 0 : 1)
