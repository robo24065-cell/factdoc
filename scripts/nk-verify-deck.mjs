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
     [8] 「기계가 쓴 요약」이 **카드 뷰어 아래에** 실제로 렌더되는가 · 줄마다 기준일이 붙는가 ·
         근거 단추를 누르면 그 카드로 실제로 건너뛰는가 (파일의 cardIds 와 대조)
     [9] 기억 카드가 **지정한 글꼴로 그려지는가** — 폭 실측.
         "명조로 그린다"는 코드가 있다는 말이지 그려졌다는 말이 아니다. 웹폰트가 막히면
         조용히 폴백으로 떨어지고 오류도 안 난다(실측: 같은 문장이 로드 전 738.45px →
         로드 후 697.54px). 그래서 캔버스에서 직접 재서 판정한다.
    [10] 완성 카드의 상자(「이 카드가 쓴 자료」)가 **실제로 쓴 자료만** 대는가 —
         작성 화면의 단서(연표 사건·다른 집안의 기증 사료 제목)가 완성 카드에
         한 글자도 실리지 않는가. 사료 제목에는 기증자 성함이 들어가므로,
         카드에 박혀 인쇄되면 몇 년 뒤 그 집안의 기록으로 오인된다.
    [11] 인쇄본에 기증 문의 창구가 남는가 — 내려받기가 막힌 PC 의 유일한 출구다
    [12] 캔버스 줄바꿈 규칙(lib/wrapLines.mjs) — 단어를 쪼개지 않고 줄 앞에 공백을 남기지 않는가

   사용법
     node scripts/nk-verify-deck.mjs [--base http://localhost:5178] [--json] [--png 경로.png]
     (개발 서버가 떠 있어야 한다: .claude/launch.json 의 sasilon, 포트 5178)
     --png 를 주면 검증 중 만들어진 기억 카드 그림을 그 경로에 저장한다(기획서 별첨용).

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
const PNG_OUT = argv.includes('--png') ? argv[argv.indexOf('--png') + 1] : null
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
const SUM_PATH = path.join(root, 'frontend/public/gohyang/deck-summary.json')
const summary = fs.existsSync(SUM_PATH) ? JSON.parse(fs.readFileSync(SUM_PATH, 'utf8')) : null

/* 기준일의 단일 진실 소스 — 화면이 대는 날짜를 여기에 대고 잰다 */
const { DATASETS } = await import('./nk-catalog.mjs')
/* 캔버스 줄바꿈 규칙 — 브라우저 없이 곧바로 잰다(눈으로는 안 보이는 사고다) */
const { wrapLines } = await import('../frontend/src/lib/wrapLines.mjs')

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

  /* ★ 회귀 방지 — 넘길 때 읽던 자리를 지킨다 (AnalysisDeck.keepPlace)
       예전에는 카드를 넘길 때마다 표제로 scrollIntoView 해서 화면이 맨 위로 튕겼다.
       21장이면 21번이다. "코드에 keepPlace 가 있다"가 아니라 **scrollY 가 안 튄다**를 잰다.
       카드 블록이 이미 보이는 자리(머리글 아래)로 내려두고 「다음」·「이전」을 눌러
       scrollY 가 그대로인지 본다. 0 으로 돌아가면 그것이 회귀다. */
  const keepPlace = await evl(`(() => {
    const deck = document.querySelector('div.scroll-mt-32')
    if (!deck) return null
    /* 카드 블록의 위쪽이 머리글(121px) 아래에 오도록 페이지를 내린다 */
    scrollTo(0, Math.round(deck.getBoundingClientRect().top + scrollY - 200))
    return Math.round(scrollY)
  })()`)
  await sleep(500)
  const beforeY = await evl(`Math.round(scrollY)`)
  await evl(clickNext)
  await sleep(700)
  const afterNextY = await evl(`Math.round(scrollY)`)
  await evl(`(() => {
    const b = [...document.querySelectorAll('button')].filter(x => x.textContent.replace(/\\s+/g,'').startsWith('이전') && !x.disabled)[0]
    if (b) b.click(); return Boolean(b)
  })()`)
  await sleep(700)
  const afterPrevY = await evl(`Math.round(scrollY)`)
  check(
    '분석 덱: 「이전」·「다음」이 화면을 맨 위로 되돌리지 않는다 (읽던 자리를 지킨다)',
    beforeY > 0 && afterNextY === beforeY && afterPrevY === beforeY,
    `내려둔 자리 ${beforeY} → 다음 ${afterNextY} → 이전 ${afterPrevY}`,
  )

  /* ★ 회귀 방지 — DOM 순서: 카드 뷰어가 요약보다 **앞**이다.
       요약이 위에 있던 동안은 카드로 가는 길목을 막고 있었다. 여기서 재는 것은 요약의
       내용이 아니라 **자리**이므로, 요약 파일이 있든 없든 이 검사는 성립해야 한다
       (요약이 없으면 그 자리가 비므로 「앞에 온 카드」만 확인한다). */
  const order = await evl(`(() => {
    const deck = document.querySelector('div.scroll-mt-32')
    const card = deck ? deck.querySelector('article') : null
    const sum = document.getElementById('deck-summary')
    const index = document.getElementById('deck-index')
    if (!deck || !card) return null
    /* 4 = Node.DOCUMENT_POSITION_FOLLOWING */
    return {
      cardInDeck: true,
      sum: sum ? ((deck.compareDocumentPosition(sum) & 4) !== 0) : null,
      index: index ? ((deck.compareDocumentPosition(index) & 4) !== 0) : null,
      sumBeforeIndex: (sum && index) ? ((sum.compareDocumentPosition(index) & 4) !== 0) : null,
    }
  })()`)
  check(
    '분석 덱 DOM 순서: 카드 뷰어 → 요약 → 목차',
    Boolean(order) && order.cardInDeck && order.sum !== false && order.index === true && order.sumBeforeIndex !== false,
    JSON.stringify(order),
  )

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

  /* ══════════ ①b 「기계가 쓴 요약」 — 카드 뷰어 아래 ══════════
     이 구획은 **없어도 되는 파일**로 만들어져 있다(deck-summary.json 이 없으면 화면이
     그 자리를 조용히 비운다). 그래서 "요약이 안 뜬다"가 오류로 드러나지 않는다 —
     여기서 재지 않으면 조용히 사라져도 아무도 모른다.
     자리도 함께 잰다: 요약은 **카드 다음**이다. 위로 올라가면 카드로 가는 길목을 막아
     사용자가 매번 요약을 지나쳐야 한다(그래서 아래로 내렸다). 순서는 문자열로 재지 못하므로
     DOM 위치로 잰다 — article(카드) 뒤에 오는가. */
  if (!AS_JSON) console.log(`\n▶ 덱 요약 (카드 아래)`)
  if (!summary) {
    check('덱 요약 파일이 있다', false, 'frontend/public/gohyang/deck-summary.json 이 없다')
  } else {
    await cdp.send('Page.navigate', { url: `${BASE}/deck` })
    await waitFor(`document.body.innerText.includes('재본 것과')`)
    const sumUp = await evl(`(() => {
      const sec = document.querySelector('section[aria-label="기계가 쓴 요약"]')
      if (!sec) return null
      const chips = [...sec.querySelectorAll('button[data-summary-chip]')]
      const card = document.querySelector('article')
      return {
        /* 4 = Node.DOCUMENT_POSITION_FOLLOWING — 카드보다 뒤에 있는가 */
        afterCard: Boolean(card) && (card.compareDocumentPosition(sec) & 4) !== 0,
        head: sec.querySelector('h2')?.textContent?.trim() ?? null,
        text: sec.innerText,
        lines: sec.querySelectorAll('ul > li').length,
        chips: chips.length,
        asOfs: chips.map(b => b.getAttribute('data-summary-chip')),
        chipText: chips.map(b => b.textContent.replace(/\\s+/g, ' ').trim()),
      }
    })()`)
    const wantLines = summary.sections.reduce((s, x) => s + x.lines.length, 0)
    check('요약 구획이 카드 뷰어 아래에 렌더된다', Boolean(sumUp) && sumUp.head === '이 덱이 말하는 것' && sumUp.afterCard === true,
      sumUp ? `머리글 "${sumUp.head}" · 줄 ${sumUp.lines}개 · 카드 뒤 ${sumUp.afterCard}` : '구획 없음')
    check(`요약 ${wantLines}줄이 전부 그려진다`, sumUp?.lines === wantLines, `화면 ${sumUp?.lines}줄`)
    check('머리 문장이 파일과 한 글자도 다르지 않다',
      Boolean(sumUp) && sumUp.text.includes(summary.headline.text), summary.headline.text.slice(0, 30) + '…')

    /* ★ as-of — 요약 구획만 기준일이 빠져 있던 자리다(CLAUDE.md §9-1).
       칩에 적힌 날짜가 그 카드의 asOf 와 같아야 한다. 「붙어 있다」가 아니라 「맞다」를 잰다. */
    const cited = [summary.headline, ...summary.sections.flatMap((s) => s.lines)]
    const wantAsOf = cited.flatMap((l) => l.cardIds.map((id) => analysis.cards.find((c) => c.id === id)?.asOf ?? '?'))
    check(
      `요약 ${cited.length}줄에 기준일 칩이 전부 붙고 카드 기준일과 일치한다`,
      JSON.stringify(sumUp?.asOfs) === JSON.stringify(wantAsOf),
      `화면 ${JSON.stringify(sumUp?.asOfs)} vs 자료 ${JSON.stringify(wantAsOf)}`,
    )
    check('기준일이 사람이 읽는 문구로도 적힌다',
      (sumUp?.chipText ?? []).every((t) => /기준 \d{4}-\d{2}-\d{2}/.test(t)), (sumUp?.chipText ?? [])[0] ?? '')

    /* 근거 단추 → 그 카드로 실제로 건너뛰는가.
       고지가 "문장 아래의 카드 단추를 누르시면 그 근거로 넘어갑니다"라고 적혀 있으므로
       그 문장이 참인지 화면에서 확인한다. 첫 구획의 마지막 줄을 고른다(1번 카드가 아닌 곳). */
    const target = summary.sections[0].lines.at(-1)
    const targetId = target.cardIds[0]
    const targetIdx = analysis.cards.findIndex((c) => c.id === targetId)
    await evl(`(() => {
      const sec = document.querySelector('section[aria-label="기계가 쓴 요약"]')
      const re = /(^|[^0-9])${targetIdx + 1}번 카드/
      const b = [...sec.querySelectorAll('button[data-summary-chip]')].find(x => re.test(x.textContent))
      if (b) b.click(); return Boolean(b)
    })()`)
    await sleep(400)
    const jumped = await evl(`(() => ({
      p: [...document.querySelectorAll('p')].find(p => /^\\d+ \\/ \\d+$/.test(p.textContent.trim()))?.textContent.trim(),
      h2: document.querySelector('article h2')?.textContent?.trim(),
    }))()`)
    check(
      '요약의 근거 단추를 누르면 그 카드로 건너뛴다',
      jumped.p === `${targetIdx + 1} / ${total}` && jumped.h2 === analysis.cards[targetIdx].question,
      `${jumped.p} · "${String(jumped.h2).slice(0, 24)}…"`,
    )
    /* 고지 문구가 화면 동작과 어긋나면 안 된다 — 주 사용자가 고령이라 거짓 안내의 대가가 크다.
       본문은 일부러 링크가 아니다(잘못 눌러 화면이 튀는 것을 막는다). */
    check('고지가 문장이 아니라 카드 단추를 가리킨다',
      summary.notice.checked.includes('문장 아래의 카드 단추') && !/문장을 누르/.test(summary.notice.checked),
      summary.notice.checked.slice(-34))
  }

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

  /* 데이터가 질문을 만들었는가 — 연표·사료·날씨 단서가 실제로 붙는가.
     사료 단서에는 성격 고지가 함께 있어야 한다(다른 집안의 기증품이라는 사실),
     연표 단서에는 그 출처(남북관계 연표)의 기준일이 카탈로그 값 그대로 있어야 한다. */
  const prompts = await evl(`(() => {
    const t = document.querySelector('#memory-card')?.innerText ?? ''
    return {
      event: t.includes('그 무렵 집안에서 들으신 이야기가 있습니까'),
      relic: t.includes('그 시절 사진이나 물건이 댁에 있습니까'),
      season: t.includes('어떤 계절의 이야기를 들으셨습니까'),
      place: t.includes('마을·거리·산·강 이름'),
      timeline: /\\d{4}년 \\d{1,2}월 \\d{1,2}일/.test(t),
      relicNotice: t.includes('다른 집안이 맡기신 기록입니다'),
      eventsAsOf: t.includes('남북관계 연표 기준일 ${DATASETS.timeline.coverageEnd}'),
    }
  })()`)
  check('질문 4종이 데이터 단서·참고 고지·연표 기준일과 함께 뜬다', Object.values(prompts).every(Boolean), JSON.stringify(prompts))

  /* ★ 단서 원문 채집 — 뒤에서 완성 카드에 "이 문자열이 없다"를 재기 위해,
     지금 작성 화면에 실제로 뜬 연표 사건 줄과 사료 제목을 그대로 집어 둔다. */
  const clueLines = await evl(`(() => {
    const sec = document.querySelector('#memory-card')
    if (!sec) return []
    const events = sec.innerText.match(/\\d{4}년 \\d{1,2}월 \\d{1,2}일 — [^\\n]+/g) ?? []
    const relics = [...sec.querySelectorAll('li > span.min-w-0 > span:first-of-type')]
      .map((x) => (x.textContent ?? '').trim())
      .filter(Boolean)
    return [...events, ...relics]
  })()`)

  /* ★ 목소리 축 — 1세대 당사자가 직접 적으면 질문과 이름표가 함께 바뀌는가.
     후손 전용으로 만들어 두면 살아 계신 당사자에게 "들으셨습니까"라고 묻게 된다. */
  const voiced = await evl(`(() => {
    const sec = document.querySelector('#memory-card')
    if (!sec) return { ok: false, why: 'no-section' }
    const b = [...sec.querySelectorAll('button')].find((x) => x.textContent.includes('제가 고향을 기억합니다'))
    if (!b) return { ok: false, why: 'no-voice-button' }
    b.click()
    return { ok: true }
  })()`)
  await sleep(400)
  const selfQ = await evl(`(() => {
    const t = document.querySelector('#memory-card')?.innerText ?? ''
    return {
      selfEvent: t.includes('그 무렵 고향에서 있었던 일 가운데 기억나시는 것'),
      selfRelic: t.includes('고향에서 가져오셨거나 지금 간직하고 계신'),
      selfSeason: t.includes('어느 계절이 가장 자주 떠오르십니까'),
      selfWho: t.includes('이 기억의 주인'),
      noHeard: !t.includes('집안에서 들으신 이야기') && !t.includes('들려주신 분'),
      noRelation: !t.includes('적으시는 분과의 관계'),
    }
  })()`)
  check('당사자가 직접 적으면 질문과 이름표가 함께 바뀐다',
    voiced.ok && Object.values(selfQ).every(Boolean), JSON.stringify(selfQ))

  await evl(`(() => {
    const sec = document.querySelector('#memory-card')
    const b = [...(sec?.querySelectorAll('button') ?? [])].find((x) => x.textContent.includes('집안 어른께 들었습니다'))
    if (b) b.click()
    return true
  })()`)
  await sleep(400)
  const backQ = await evl(`document.querySelector('#memory-card')?.innerText.includes('그 무렵 집안에서 들으신 이야기가 있습니까') ?? false`)
  check('다시 「들었습니다」로 되돌릴 수 있다', backQ)

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

  /* 만들어진 그림을 파일로 남긴다(요청이 있을 때만) — 기획서 별첨에 그대로 쓴다 */
  if (PNG_OUT && pngInfo) {
    const b64 = await evl(`document.querySelector('[data-memcard-png]').getAttribute('href').split(',')[1]`)
    const out = path.isAbsolute(PNG_OUT) ? PNG_OUT : path.join(root, PNG_OUT)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, Buffer.from(b64, 'base64'))
    check('그림 파일을 저장했다', fs.statSync(out).size > 10000, `${out} (${Math.round(fs.statSync(out).size / 1024)}KB)`)
  }

  /* ★ 글꼴 실측 — "명조로 그린다"는 코드가 있다는 말이지 그려졌다는 말이 아니다.
     웹폰트가 막히면 조용히 폴백으로 떨어지고 오류가 나지 않는다. 그래서 캔버스에서 폭을 잰다.
       ① document.fonts.check 가 그 글자들에 대해 참인가 (서브셋까지 실제로 왔는가)
       ② 명조 폭 ≠ 고딕 폭 (같은 face 로 조용히 떨어지지 않았는가)
       ③ paint() 가 쓰는 **폴백까지 붙은 스택**의 폭 = 웹폰트 단독 폭 (스택의 첫 패밀리가 이겼는가)
     ③ 이 이 검사의 핵심이다 — 스택 순서를 잘못 고치면 오류 없이 글꼴만 바뀐다. */
  const fontProbe = await evl(`(async () => {
    const S = '고향 기억 카드 재령벌 큰내 썰매 0123'
    const WEB = '"Noto Serif KR"'
    const STACK = getComputedStyle(document.querySelector('.memcard-print dd')).fontFamily
    await document.fonts.load('400 21px ' + WEB, S)
    const cv = document.createElement('canvas')
    const ctx = cv.getContext('2d')
    const w = (f) => { ctx.font = '400 21px ' + f; return ctx.measureText(S).width }
    return {
      stack: STACK,
      loaded: document.fonts.check('400 21px ' + WEB, S),
      web: w(WEB),
      stackW: w(STACK),
      gothic: w('"Malgun Gothic", sans-serif'),
      qFont: getComputedStyle(document.querySelector('.memcard-print dt')).fontFamily,
    }
  })()`)
  check(
    '명조 웹폰트가 실제로 로드됐다(서브셋 포함)',
    fontProbe.loaded === true, `document.fonts.check → ${fontProbe.loaded}`,
  )
  check(
    '답변이 지정한 명조로 그려진다 — 폭이 고딕과 다르다',
    Math.abs(fontProbe.web - fontProbe.gothic) > 1,
    `명조 ${fontProbe.web.toFixed(2)}px vs 고딕 ${fontProbe.gothic.toFixed(2)}px`,
  )
  check(
    '폴백까지 붙은 글꼴 스택이 웹폰트로 착지한다',
    Math.abs(fontProbe.stackW - fontProbe.web) < 0.01,
    `스택 ${fontProbe.stackW.toFixed(2)}px vs 웹폰트 ${fontProbe.web.toFixed(2)}px`,
  )
  check(
    '질문은 고딕, 답은 명조 — 묻는 쪽과 답한 쪽이 글꼴로 갈린다',
    /Noto Serif KR/.test(fontProbe.stack) && !/Noto Serif KR/.test(fontProbe.qFont),
    `답 "${fontProbe.stack.slice(0, 20)}…" · 질문 "${fontProbe.qFont.slice(0, 20)}…"`,
  )

  /* ★ 완성 카드의 상자 — 제목이 「이 카드가 쓴 자료」이고 실제로 쓴 것(신청현황 기준일·
     실측 기온)만 대는가. 연표·사료는 작성 화면의 단서일 뿐 카드가 쓰지 않았으므로
     그 계열의 날짜(연표 coverageEnd·동향 coverageEnd)가 완성 카드에 보이면 안 된다.
     (연표 기준일이 카탈로그와 같은지는 위 작성 화면 검사(eventsAsOf)가 잰다.) */
  const wantEventsAsOf = DATASETS.timeline.coverageEnd
  const trendAsOf = DATASETS.nkinfoTrend.coverageEnd
  const asOfSeen = await evl(`(() => {
    const t = document.querySelector('.memcard-print')?.innerText ?? ''
    return {
      boxTitle: t.includes('이 카드가 쓴 자료'),
      oldTitle: t.includes('참고한 공식 기록'),
      survivorsLine: t.includes('기준일 — 이산가족 신청현황'),
      hasTimeline: t.includes('${wantEventsAsOf}'),
      hasTrend: t.includes('${trendAsOf}'),
      sample: (t.match(/기준일 — [^\\n]*/) ?? [''])[0],
    }
  })()`)
  check(
    '완성 카드의 상자가 실제로 쓴 자료(신청현황 기준일)만 댄다',
    asOfSeen.boxTitle && !asOfSeen.oldTitle && asOfSeen.survivorsLine && !asOfSeen.hasTimeline && !asOfSeen.hasTrend,
    `"${asOfSeen.sample}" · 연표일(${wantEventsAsOf}) 노출 ${asOfSeen.hasTimeline} · 동향일(${trendAsOf}) 노출 ${asOfSeen.hasTrend}`,
  )

  /* ★ 남의 집안 기록이 이 카드에 실렸는가 — 작성 화면에서 단서로 보였던
     연표 사건 줄·기증 사료 제목이 완성 카드(인쇄·PNG 의 원본)에 한 글자도 없어야 한다.
     사료 제목에는 기증자 성함이 들어간다(예: 「이오환 님 가족 사진」) — 이 집안의
     카드에 박혀 인쇄되면 몇 년 뒤 그 집안의 기록으로 오인된다. */
  const cardText = await evl(`document.querySelector('.memcard-print')?.innerText ?? ''`)
  const clueArr = Array.isArray(clueLines) ? clueLines : []
  const strayClues = clueArr.filter((s) => s && cardText.includes(s))
  check(
    '완성 카드에 다른 집안의 사료 제목·연표 사건이 실리지 않는다',
    clueArr.length > 0 && strayClues.length === 0 && !/디지털박물관 사료 —|공식 기록에 남은 이 고향/.test(cardText),
    strayClues.length ? `카드에 남음: "${strayClues[0]}"` : `단서 ${clueArr.length}건 전부 카드 밖`,
  )

  /* ★ 기증자 성함 전수 대조 — 단서로 뜬 두 건만이 아니라, 박물관 사료 전체의 기증자 이름이
     완성 카드에 한 명도 없어야 한다. 사료 제목·기증자란에는 실제 성함이 들어가고(예: 「○○○ 님 기증」),
     그것이 이 집안의 카드에 인쇄되면 몇 년 뒤 그 집 기록으로 오인된다.
     3글자 이상 이름만 본다 — 두 글자는 일반 낱말과 겹쳐 오탐이 된다. */
  const museumPack = JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/gohyang/museum.json'), 'utf8'))
  const donors = [...new Set((museumPack.records ?? [])
    .map((r) => String(r.donor ?? '').replace(/\s+/g, ''))
    .filter((d) => d.length >= 3))]
  const strayDonors = donors.filter((d) => cardText.includes(d))
  check(
    `완성 카드에 다른 집안 기증자 성함이 없다 (성함 ${donors.length}명 전수 대조)`,
    donors.length > 0 && strayDonors.length === 0 && !/님 기증/.test(cardText),
    strayDonors.length ? `카드에 남음: "${strayDonors[0]}"` : `${donors.length}명 전부 카드 밖`,
  )

  /* 꼬리말이 카드가 **실제로 쓴 것**만 주장하는가 — 예전 꼬리말은 연표·디지털박물관까지
     근거로 적어, 바로 위 상자가 지킨 배제를 문장 하나로 뒤집고 있었다. */
  check(
    '카드 꼬리말이 실제로 쓴 자료(신청현황)만 근거로 주장한다',
    /이 카드가 쓴 통일부 공공데이터는 이산가족 신청현황 하나이며/.test(cardText)
    && /이 카드에 실리지 않았습니다/.test(cardText)
    && !/기록의 근거는 통일부 공공데이터\(이산가족 신청현황·남북관계 연표/.test(cardText),
    (cardText.split(String.fromCharCode(10)).find((l) => l.includes('이 카드가 쓴 통일부 공공데이터')) ?? '').slice(0, 80),
  )

  /* 인쇄 경로 — 내려받기가 막힌 환경의 대체 경로가 실제로 있는가 */
  const printable = await evl(`(() => {
    const b = [...document.querySelector('#memory-card').querySelectorAll('button')].find(x => x.textContent.includes('인쇄하기'))
    return Boolean(b) && Boolean(document.querySelector('.memcard-print'))
  })()`)
  check('인쇄 경로가 함께 있다', printable)

  /* 인쇄 화면을 실제로 흉내 내 본다 — 인쇄 CSS 가 카드만 남기고 나머지를 지우는지.
     "인쇄 단추가 있다"와 "인쇄하면 카드가 나온다"는 다른 말이다. */
  await cdp.send('Emulation.setEmulatedMedia', { media: 'print' })
  await sleep(300)
  const printView = await evl(`(() => {
    const vis = el => el ? getComputedStyle(el).visibility : null
    const disp = el => el ? getComputedStyle(el).display : null
    return {
      card: vis(document.querySelector('.memcard-print')),
      cardText: vis(document.querySelector('.memcard-print h4')),
      buttons: disp(document.querySelector('.memcard-noprint')),
      header: vis(document.querySelector('header nav')),
    }
  })()`)
  check(
    '인쇄하면 기억 카드만 남는다',
    printView.card === 'visible' && printView.cardText === 'visible' && printView.buttons === 'none' && printView.header === 'hidden',
    JSON.stringify(printView),
  )
  /* ★ 인쇄물에 무엇이 실려 나가는가 — 「인쇄 단추가 있다」와 「인쇄하면 다 나온다」는 다른 말이다.
     내려받기가 막힌 PC 를 위해 둔 것이 인쇄 경로인데, 정작 그 종이에서 기증 창구가
     빠져 있었다(꼬리말 3줄 중 2줄과 표제가 미리보기에 없었다). */
  const printed = await evl(`(() => {
    const el = document.querySelector('.memcard-print')
    const t = el ? el.innerText : ''
    return {
      title: t.includes('고향 기억 카드'),
      sub: t.includes('고향잇기 — 이산가족 기록을 후손에게 잇습니다'),
      donate: t.includes('02-2100-5916'),
      basis: t.includes('이 카드가 쓴 통일부 공공데이터는 이산가족 신청현황 하나이며'),
      privacy: t.includes('서버로 전송되지 않았습니다'),
      len: t.length,
    }
  })()`)
  check(
    '인쇄본에 표제·부제·꼬리말 3줄(기증 문의 전화 포함)이 그대로 실린다',
    printed.title && printed.sub && printed.donate && printed.basis && printed.privacy,
    JSON.stringify(printed),
  )
  await cdp.send('Emulation.setEmulatedMedia', { media: '' })

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

  /* ══════════ ③ 홈 씬 서사 ══════════
     씬은 "있으면 보이는" 것이 아니라 **세어야 보이는** 것이다. 씬 하나가 조용히 빠지거나
     이음새 한 줄이 사라져도 오류가 나지 않는다 — 화면이 그냥 조금 짧아질 뿐이다.
     그래서 씬 수·이음 문구를 화면에서 직접 센다. 핀 덱도 "코드가 있다"가 아니라
     "스크롤로 실제로 넘어간다"를 재고, reduced-motion 에서는 런웨이가 풀리는지 본다. */
  if (!AS_JSON) console.log(`\n▶ 홈 씬 서사 (5막 13씬)`)

  const SEAMS = [
    '그분들의 고향은 일곱 이름으로 기록되어 있습니다.',
    '고향의 오늘을 보셨습니다. 이 기록에는 시한이 있습니다.',
    '숫자는 줄어들지만, 남겨 주신 것이 있습니다.',
    '이 사진들을 맡기신 분들은 1세대였습니다. 다음은 누구입니까.',
    /* S7 은 「이어받을 마음은 확인되었습니다」였다 — 이 조사는 후손 본인에게 묻지 않았고
       자손이 있는 1세대가 자기 자손을 평가한 값이라, 확정형으로 쓰면 조사가 답하지 않은 것을
       승격시킨다. 그래서 평가 주체를 문장에 남긴다. */
    '이어받을 뜻은 1세대의 평가로 확인되었습니다. 통일부 조사에는 그다음 답도 적혀 있습니다.',
    '그 요청에 오늘 답할 수 있는 자리를 여기 두었습니다.',
    '만드신 카드를 맡길 곳이 있습니다.',
    '기증 말고도 가족 이름으로 신청할 수 있는 창구가 여덟 곳 더 있습니다.',
    '열려 있는 곳을 보셨습니다. 닫혀 있는 곳도 그대로 적습니다.',
    '여기 적힌 모든 수치에는 기준일이 있습니다.',
  ]
  const ANCHORS = ['extinction', 'descendant', 'memory-card', 'actions']

  await cdp.send('Page.navigate', { url: `${BASE}/` })
  await waitFor(`document.querySelectorAll('[data-scene]').length >= 13`, 120)
  await sleep(1200)

  const scenes = await evl(`(() => ({
    count: document.querySelectorAll('[data-scene]').length,
    seams: [...document.querySelectorAll('[data-seam]')].map(e => e.getAttribute('data-seam')),
    anchors: ${JSON.stringify(ANCHORS)}.filter(id => document.getElementById(id)),
  }))()`)
  check('홈이 13개 씬으로 렌더된다', scenes.count === 13, `씬 ${scenes.count}개`)
  check(
    `이음새 ${SEAMS.length}줄이 한 글자도 다르지 않게 렌더된다`,
    JSON.stringify(scenes.seams) === JSON.stringify(SEAMS),
    (scenes.seams ?? []).length === SEAMS.length
      ? (scenes.seams.find((v, i) => v !== SEAMS[i]) ?? '일치')
      : `화면 ${scenes.seams?.length}줄`,
  )
  check(`앵커 id ${ANCHORS.length}종이 살아 있다`, scenes.anchors?.length === ANCHORS.length, (scenes.anchors ?? []).join(' · '))

  /* ── 최소 타깃 — 「누르는 것 ≥48px」. 지도 폴리곤만 예외다(지오메트리가 크기를 정한다;
       같은 화면에 지역명·인원이 적힌 48px 목록 단추가 등가 경로로 있다). ── */
  /* 분모(보이는 타깃 수)도 함께 낸다 — 「0건」만 적으면 무엇 중의 0인지 파일에 남지 않는다.
     기획서가 「누르는 자리 165개가 전부 48px 이상」이라고 쓰려면 이 165가 산출물에 있어야 한다. */
  const taps = await evl(`(() => {
    const all = [...document.querySelectorAll('a[href],button,[role=button],input,select,summary')]
      .filter(e => { const r = e.getBoundingClientRect(); return (r.width || r.height) })
      .filter(e => !e.closest('svg'))
    const tiny = all.filter(e => { const r = e.getBoundingClientRect(); return r.height < 48 || r.width < 48 })
    return { total: all.length,
      tiny: tiny.map(e => (e.tagName + ' ' + (e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ')).slice(0, 44)) }
  })()`)
  const tiny = taps.tiny
  check('누르는 것은 전부 48px 이상이다 (지도 폴리곤 제외)', tiny.length === 0,
    tiny.length ? `보이는 타깃 ${taps.total}개 중 ${tiny.length}개 미달: ${tiny.slice(0, 3).join(' | ')}`
      : `보이는 타깃 ${taps.total}개 · 48px 미만 0건`)

  /* ── 가로 덱 — 세로 스크롤은 그냥 지나가고, 가로는 「덱과의 상호작용」에서만 나온다 ──
       ★ 2026-08-20 재계약. 옛 검사는 「페이지를 내리면 덱이 넘어간다」를 쟀다(sticky 런웨이가
         페이지 진행률을 scrollLeft 로 사상). 그 구조는 사진 24장 덱이 페이지를 4.8화면
         붙잡는 벽이어서 걷어냈다(사용자 지적: *"수십개 다 넘길때까지 아래로 못넘기는것도
         스트레스"*). 지금 재는 것은 뒤집힌 계약 셋이다 —
           ① 덱을 지나쳐 페이지가 내려가는 동안 덱은 제자리다(붙잡지 않는다)
           ② 포인터가 덱 위에 있을 때의 휠만 가로로 돌고, 그동안 페이지는 그대로다
           ③ 마지막 장에서는 그 즉시 페이지로 넘어간다(scroll chaining — 갇히는 프레임 0) */
  const ROW = `[...document.querySelectorAll('[role=group][aria-roledescription="가로 카드 묶음"]')][0]`
  const deck0 = await evl(`(() => { const row = ${ROW}; if (!row) return null
    const r = row.getBoundingClientRect()
    return { y: Math.round(r.top + scrollY), cards: row.children.length } })()`)
  check('사료 가로 덱이 카드 묶음으로 실재한다', Boolean(deck0 && deck0.cards > 1), deck0 ? `카드 ${deck0.cards}장` : '없음')

  /* 카드 경계는 clientWidth 가 아니라 **카드 간격(피치)** 으로 잰다 — 엿보임(peek)이 있어
     카드 폭 < 행 폭이다. 옆 카드가 얼마나 물려 보이는지는 덱마다 다르게 정한다. */
  const readDeck = `(() => { const row = ${ROW}
    const r = row.getBoundingClientRect()
    const kids = row.children
    const pitch = kids.length > 1
      ? kids[1].getBoundingClientRect().left - kids[0].getBoundingClientRect().left
      : row.clientWidth
    const off = pitch ? row.scrollLeft % pitch : 0
    return {
      y: Math.round(scrollY), left: Math.round(row.scrollLeft),
      max: Math.round(row.scrollWidth - row.clientWidth),
      offBoundary: Math.round(Math.min(Math.abs(off), Math.abs(pitch - off))),
      counter: [...row.parentElement.querySelectorAll('p')].map(p => p.textContent.trim()).filter(t => t.indexOf(' / ') > 0)[0] ?? null,
      cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
      inert: [...row.children].filter(c => c.hasAttribute('inert')).length,
      reachable: [...row.querySelectorAll('a[href],button')].filter(e => !e.closest('[inert]')).length,
    } })()`
  const centerDeck = async () => {
    await evl(`(() => { const el = ${ROW}.parentElement.parentElement
      const r = el.getBoundingClientRect()
      scrollTo(0, Math.max(0, Math.round(r.top + scrollY - (innerHeight - r.height) / 2))) })()`)
    await sleep(700)
  }
  const wheelOn = (x, y, dy) =>
    cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, pointerType: 'mouse' })

  await centerDeck()
  const pin0 = await evl(readDeck)
  /* ① 페이지가 덱을 그냥 지나간다 */
  await evl(`window.scrollBy(0, 700)`)
  await sleep(600)
  const pinPass = await evl(readDeck)
  /* ② 덱 위 휠 → 가로만 */
  await centerDeck()
  const pinA = await evl(readDeck)
  await wheelOn(pinA.cx, pinA.cy, 120)
  await sleep(900)
  const pinB = await evl(readDeck)
  /* ③ 마지막 장 → 페이지로 넘어간다 */
  await evl(`${ROW}.scrollLeft = ${ROW}.scrollWidth`)
  await sleep(400)
  await centerDeck()
  const pinEnd = await evl(readDeck)
  await wheelOn(pinEnd.cx, pinEnd.cy, 120)
  await sleep(600)
  const pinChain = await evl(readDeck)

  check(
    '가로 덱: 세로 스크롤은 지나가고 · 덱 위 휠만 가로로 돌고 · 끝에서는 페이지로 넘어간다',
    Boolean(pin0 && pinPass && pinA && pinB && pinEnd && pinChain
      && pinPass.left === pin0.left && pinPass.y > pin0.y
      && pinB.left > pinA.left && pinB.y === pinA.y && pinB.counter !== pinA.counter
      && pinChain.left === pinEnd.left && pinChain.y > pinEnd.y),
    `지나감 ${pin0?.left}→${pinPass?.left}(페이지 +${(pinPass?.y ?? 0) - (pin0?.y ?? 0)}) · `
    + `휠 ${pinA?.counter}→${pinB?.counter}(페이지 ${(pinB?.y ?? 0) - (pinA?.y ?? 0)}) · `
    + `끝에서 페이지 +${(pinChain?.y ?? 0) - (pinEnd?.y ?? 0)}`,
  )
  check(
    '카드가 반씩 걸치지 않는다 (엿보임을 뺀 카드 경계에 정확히 선다)',
    (pinA?.offBoundary ?? 99) <= 1 && (pinB?.offBoundary ?? 99) <= 1,
    `경계 어긋남 ${pinA?.offBoundary}px · ${pinB?.offBoundary}px`,
  )
  check(
    '화면 밖 카드는 탭 정지점이 아니다 (포커스와 화면이 어긋나지 않는다)',
    Boolean(pinB && deck0 && pinB.inert === deck0.cards - 1 && pinB.reachable <= 4),
    `inert ${pinB?.inert}/${(deck0?.cards ?? 1) - 1}장 · 닿는 링크 ${pinB?.reachable}개`,
  )

  /* ── ★ 회귀 방지 ⓐ 「덱이 페이지를 붙잡는 총량」에 상한이 있는가 ─────────────
       위 검사는 「끝에 닿으면 페이지로 넘어간다」만 봤다. 그런데 사진 24장 덱은
       **끝까지 가는 데 22회**가 들었다 — 포인터를 화면 한가운데(=덱 위) 두는 기본 자세로
       홈을 훑으면 x=64 경로 128회가 156회가 됐다(실측 2026-08-20 1280×900, delta=100).
       계약은 지켜지는데 사용자 지적 ③ 은 그대로 참인 상태였다.
       그래서 여기서 재는 것은 「끝」이 아니라 **총량**이다: 덱 위에서 같은 방향으로 계속
       굴릴 때, 페이지가 멈춰 있는 휠이 PinnedDeck 의 예산(WHEEL_BUDGET)+여유 안에서
       끝나고 그 뒤로는 페이지가 이어지는가. 덱은 24장이므로 「카드가 떨어져서」 풀리는
       것이 아니다 — 상한이 실제로 걸린 것만 이 검사를 통과한다. ── */
  const TRAP_MAX = 6          // 예산 4장 + 관측 여유 2 — 느슨하게 만들지 말 것
  await evl(`${ROW}.scrollLeft = 0`)
  await sleep(500)
  await centerDeck()
  const trap = []
  let prevY = await evl(`Math.round(scrollY)`)
  for (let i = 0; i < 14; i++) {
    const at = await evl(readDeck)
    await wheelOn(at.cx, Math.max(8, Math.min(892, at.cy)), 100)
    await sleep(120)
    const y = await evl(`Math.round(scrollY)`)
    trap.push({ i, held: y === prevY, y, left: (await evl(readDeck)).left })
    prevY = y
  }
  /* 앞머리에서 페이지가 멈춰 있는 연속 길이 = 덱이 붙잡은 총량 */
  let heldRun = 0
  while (heldRun < trap.length && trap[heldRun].held) heldRun++
  const movedAfter = trap.slice(heldRun).filter((t) => !t.held).length
  const notAtEnd = await evl(`(() => { const r = ${ROW}; return r.scrollLeft < r.scrollWidth - r.clientWidth - 2 })()`)
  check(
    `사진 덱: 휠이 가로로 가고, 붙잡는 총량이 ${TRAP_MAX}회 이하다 (카드가 떨어져서가 아니라 상한으로 풀린다)`,
    heldRun >= 1 && heldRun <= TRAP_MAX && movedAfter >= 4 && notAtEnd === true && trap[0].left > 0,
    `붙잡은 휠 ${heldRun}회 · 그 뒤 페이지가 움직인 휠 ${movedAfter}회 · 덱은 아직 끝이 아님 ${notAtEnd} · 첫 휠 scrollLeft ${trap[0]?.left}`,
  )

  /* ── ★ 회귀 방지 ⓑ 카드 전환에 **중간 프레임**이 있는가 (부드러움) ─────────────
       옛 구현은 `row.scrollLeft = target` 직접 대입이라 중간 프레임이 0 이었다 — 카드가
       뚝뚝 갈렸다(사용자 지적 ②). 「motion.ts 를 쓴다」가 아니라 rAF 로 실제 표본을 걷어
       서로 다른 중간값이 몇 개 나오는지 센다. 값이 두 개(시작·끝)뿐이면 회귀다. ── */
  await evl(`${ROW}.scrollLeft = 0`)
  await sleep(500)
  const frames = await evl(`(async () => {
    const row = ${ROW}
    const btn = [...row.parentElement.querySelectorAll('button')]
      .find(b => b.textContent.replace(/\\s+/g, '').startsWith('다음'))
    if (!btn) return null
    const from = row.scrollLeft
    const s = []
    let go = true
    const tick = () => { s.push(row.scrollLeft); if (go) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    btn.click()
    await new Promise(r => setTimeout(r, 900))
    go = false
    const to = row.scrollLeft
    const lo = Math.min(from, to), hi = Math.max(from, to)
    return {
      from: Math.round(from), to: Math.round(to), n: s.length,
      uniq: new Set(s.map(v => Math.round(v))).size,
      mid: new Set(s.filter(v => v > lo + 1 && v < hi - 1).map(v => Math.round(v))).size,
    }
  })()`)
  check(
    '카드 전환에 중간 프레임이 있다 (직접 대입이 아니라 활강한다)',
    Boolean(frames) && frames.to !== frames.from && frames.uniq >= 6 && frames.mid >= 4,
    frames ? `표본 ${frames.n}개 · 서로 다른 값 ${frames.uniq}개 · 중간값 ${frames.mid}개 (${frames.from}→${frames.to})` : '단추 없음',
  )

  /* ── ★ 회귀 방지 ⓔ 홈의 주요 블록이 **같은 중심선**을 쓰는가 (1280) ─────────────
       theme/gohyang.ts STAGE 주석의 「이 화면에는 좌측 레일이 하나만 있어야 한다」를
       화면에서 잰다. 씬마다 기둥 폭을 따로 주면 기둥이 저마다 가운데로 모이면서
       시작점이 셋으로 갈라진다 — 스크롤을 내리는 동안 글머리가 옮겨 다닌다.
       중심선 하나 + 무대 상자 다섯의 좌/우/폭 일치를 함께 본다. ── */
  const rails = await evl(`(() => {
    const head = document.querySelector('header')
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect()
      return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), c: Math.round((r.left + r.width / 2) * 10) / 10 } }
    const stage = {
      고지띠: box(head?.previousElementSibling?.querySelector('p')),
      머리글행: box(head?.querySelector('div')),
      주메뉴: box(document.querySelector('nav[aria-label="주요 화면"]')),
      본문: box(document.querySelector('main')),
      바닥글: box(document.querySelector('footer > div')),
    }
    const scenes = [...document.querySelectorAll('[data-scene]')].map(e => ({ id: e.getAttribute('data-scene'), ...box(e) }))
    /* 덱 카드 — S11 이 mx-auto 로 가운데 모여 레일을 하나 더 만들었던 자리다 */
    const deckCards = [...document.querySelectorAll('[data-deck-card]:not([inert]) > *')].map(e => box(e).l)
    return { stage, scenes, deckCards: [...new Set(deckCards)].sort((a, b) => a - b) }
  })()`)
  const stageBoxes = Object.values(rails.stage)
  const centers = [...stageBoxes.map((b) => b?.c), ...rails.scenes.map((s) => s.c)]
  const oneCenter = centers.every((c) => c !== null && Math.abs(c - centers[0]) <= 0.5)
  const oneRail = stageBoxes.every((b) => b && b.l === stageBoxes[0].l && b.w === stageBoxes[0].w)
  check(
    '홈 주요 블록이 1280 에서 같은 중심선을 쓴다 (무대 상자 5 + 씬 13)',
    oneCenter && oneRail && rails.scenes.length === 13,
    `중심 ${[...new Set(centers)].join('·')} · 무대 L/W ${stageBoxes[0]?.l}/${stageBoxes[0]?.w} · 씬 ${rails.scenes.length}개`,
  )
  /* 씬 안쪽 — 덱 카드가 씬 레일 밖으로 새 시작점을 만들지 않는가(S11 mx-auto 회귀) */
  const sceneL = rails.scenes[0]?.l
  check(
    '덱 카드가 씬 레일에서 벗어나 새 시작점을 만들지 않는다 (S11 mx-auto 회귀)',
    rails.deckCards.length > 0 && rails.deckCards.every((l) => Math.abs(l - sceneL) <= 4),
    `씬 레일 ${sceneL} · 덱 카드 시작점 ${rails.deckCards.join('·')}`,
  )

  /* ── reduced-motion 폴백 — 런웨이가 없고(항상) 평범한 가로 snap 행 + 단추만 남는가 ── */
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await cdp.send('Page.navigate', { url: `${BASE}/` })
  await waitFor(`document.querySelectorAll('[data-scene]').length >= 13`, 120)
  await sleep(900)
  const reduced = await evl(`(() => { const row = ${ROW}; if (!row) return null
    const stage = row.parentElement
    const runway = stage.parentElement
    return {
      sticky: getComputedStyle(stage).position,
      runwayHeight: runway.style.height || '',
      buttons: [...stage.querySelectorAll('button')].length,
      snap: getComputedStyle(row).scrollSnapType,
    } })()`)
  check(
    'prefers-reduced-motion 이면 런웨이가 풀리고 평범한 가로 snap 행 + 단추만 남는다',
    Boolean(reduced && reduced.runwayHeight === '' && reduced.sticky === 'static' && reduced.buttons >= 2 && /x/.test(reduced.snap)),
    JSON.stringify(reduced),
  )
  await cdp.send('Emulation.setEmulatedMedia', { features: [] })

  /* ── 딥링크 — 주소로 들어온 사람이 그 자리에 서는가 ── */
  const landed = async (url, expr) => {
    await cdp.send('Page.navigate', { url })
    await waitFor(`document.querySelectorAll('[data-scene]').length >= 13`, 120)
    await sleep(1500)
    return evl(expr)
  }
  const inView = `(id => { const el = document.getElementById(id); if (!el) return null
    const r = el.getBoundingClientRect(); return { top: Math.round(r.top), inView: r.top < innerHeight && r.bottom > 0 } })`
  const d1 = await landed(`${BASE}/?${encodeURIComponent('고향')}=hwanghae-old`,
    `(() => ({ y: Math.round(scrollY), t: ${inView}('g-weather') }))()`)
  check('?고향=<id> 로 들어오면 그 고향 패널까지 데려간다', Boolean(d1?.t?.inView && d1.y > 0), JSON.stringify(d1))
  const d2 = await landed(`${BASE}/#extinction`, `(() => ({ y: Math.round(scrollY), t: ${inView}('extinction') }))()`)
  check('#앵커로 들어오면 그 씬까지 데려간다', Boolean(d2?.t?.inView && d2.y > 0), JSON.stringify(d2))
  const d3 = await landed(`${BASE}/?${encodeURIComponent('고향')}=pyongyang`,
    `(() => ({ y: Math.round(scrollY), t: ${inView}('home-pick'), notice: document.body.innerText.includes('이 화면이 아는 이름이 아닙니다') }))()`)
  check('알 수 없는 고향 id 는 조용히 무시하지 않고 고르는 자리로 보낸다', Boolean(d3?.t?.inView && d3.notice), JSON.stringify(d3))

  /* ══════════ ④ 고향 안내인 — 기준일 결합 ══════════
     화면에 실제로 뜬 문장을 그대로 걷어, 같은 사실 묶음으로 validateGuide 를 돌린다.
     "코드에 검증기가 있다"가 아니라 "지금 화면에 뜬 문장이 그 검증을 통과한다"를 잰다.
     규칙 문장이든 LLM 문장이든 통과해야 한다 — 못 하면 화면이 자기 기준을 못 지킨 것이다. */
  if (!AS_JSON) console.log(`\n▶ 고향 안내인 기준일 결합 (축별 asOf)`)
  const { buildGuideFacts, validateGuide, fallbackGuide } = await import('../frontend/src/engine/nk-guide.mjs')
  const { coverageEndOf } = await import('../frontend/src/engine/nk-search.mjs')
  const gload = (n) => JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/gohyang', n + '.json'), 'utf8'))
  const gpack = {
    map: gload('map'), region: gload('region'), isan: gload('isan'),
    proj: gload('projection'), museum: gload('museum'), paths: gload('paths'),
  }
  const gextra = { eventsAsOf: coverageEndOf('timeline', 'briefing', 'nkinfoTrend'), analysis }
  const GUIDE_BOX = `document.querySelector('[aria-label="고향 안내인의 자동 작성 안내문"]')`
  const guideOf = async (id) => {
    await cdp.send('Page.navigate', { url: `${BASE}/?${encodeURIComponent('고향')}=${id}` })
    await waitFor(`${GUIDE_BOX} && ${GUIDE_BOX}.querySelectorAll('p').length > 1`, 120)
    await sleep(1600)
    return evl(`(() => { const b = ${GUIDE_BOX}; if (!b) return null
      return {
        via: b.innerText.includes('AI 보조 문장') ? 'llm' : 'rule',
        lines: [...b.querySelectorAll('p')].map(p => p.textContent.trim()).filter(t => t && !t.startsWith('이 안내문은')),
      } })()`)
  }
  const shownVia = []
  for (const [id, label] of [['gangwon-unrec', '미수복강원'], ['hamgyong-n-old', '함경북도(구)']]) {
    const shown = await guideOf(id)
    shownVia.push({ label, via: shown?.via ?? null, lines: shown?.lines?.length ?? 0 })
    const facts = buildGuideFacts({ mode: 'old', id }, gpack, gextra)
    const verdict = shown && facts
      ? validateGuide({ lines: shown.lines.slice(0, 4), next: { target: 'events', label: '기록 보기' } }, facts)
      : null
    check(
      `${label} — 화면에 뜬 안내문이 축별 기준일 검증을 통과한다`,
      verdict !== null,
      `${shown?.via === 'llm' ? 'AI 문장' : '규칙 문장'} · ${(shown?.lines ?? []).join(' / ').slice(0, 70)}`,
    )
  }
  /* ★ LLM 4원칙 ④ 의 실측 — 개발 서버에는 Cloudflare Pages Function(/api/llm)이 없어 404 가 난다.
     그 상황에서도 안내인이 비지 않고 규칙 문장으로 서는지를 여기서 잰다.
     (배포본에서는 이 경로가 살아 있고, 그때는 LLM 문장이 validateGuide 를 통과해야 한다 —
      위 두 검사는 어느 쪽이든 같은 기준으로 판정한다.) */
  const llmDown = cdp.events.some((e) => e.method === 'Network.responseReceived'
    && /\/api\/llm/.test(e.params?.response?.url ?? '') && (e.params.response.status ?? 0) >= 400)
  check(
    'LLM 경로가 죽어도(개발 서버 /api/llm 404) 안내인이 규칙 문장으로 선다',
    shownVia.every((v) => v.lines >= 2) && (!llmDown || shownVia.every((v) => v.via === 'rule')),
    `${llmDown ? '/api/llm 404 관측 · ' : ''}${shownVia.map((v) => `${v.label}=${v.via}(${v.lines}줄)`).join(' · ')}`,
  )

  /* 음성 대조군 — 축이 다른 두 수치를 한 「기준」으로 묶으면 반드시 폐기돼야 한다.
     (합집합 규칙이던 시절에는 아래 문장들이 전부 통과했다) */
  const fHw = buildGuideFacts({ mode: 'old', id: 'hwanghae-old' }, gpack, gextra)
  const fHn = buildGuideFacts({ mode: 'old', id: 'hamgyong-n-old' }, gpack, gextra)
  const bad = (lines, facts) => validateGuide({ lines, next: { target: 'events', label: '기록 보기' } }, facts) === null
  check(
    '축이 다른 수치를 한 기준일로 묶은 문장은 폐기된다 (생존 신청자 + 사료 수집일)',
    bad(['안내입니다.', `생존 신청자는 ${fHw.survivors.n.toLocaleString('ko-KR')}명이고 기록물은 ${fHw.museum.total}건입니다(2026년 5월 31일 기준).`], fHw),
    `생존 ${fHw.survivors.asOf} · 사료 수집 ${fHw.museum.collectedAt}`,
  )
  check(
    '평균 나이에 신청현황 기준일을 붙이면 폐기된다 (S1 표제가 쓰던 조합)',
    bad(['안내입니다.', `전체 생존 신청자는 ${fHw.aliveTotal.n.toLocaleString('ko-KR')}명이고 평균 나이는 ${fHw.avgAge.v}세입니다(2026년 5월 31일 기준).`], fHw),
    `전체 ${fHw.aliveTotal.asOf} · 평균 나이 ${fHw.avgAge.asOf}`,
  )
  check(
    '탈북민 비중에 이산가족 기준일을 붙이면 폐기된다 (compare 축 분리)',
    bad(['안내입니다.', `탈북민 재북 출신 비중은 ${fHn.compare.maps.defectorPct}%입니다(2025년 8월 기준).`], fHn)
    && !bad(['안내입니다.', `탈북민 재북 출신 비중은 ${fHn.compare.maps.defectorPct}%입니다(2020년 3월 기준).`], fHn),
    `탈북민 축 ${fHn.compare.maps.defectorAsOf} · 이산가족 축 ${fHn.compare.asOf}`,
  )
  check(
    '발표되지 않은 순위를 만들어 내지 않는다 (순위합은 caveat 와 함께)',
    gpack.map.regionsOld.every((o) => {
      const g = buildGuideFacts({ mode: 'old', id: o.id }, gpack, gextra)
      const line = (g && g.compare) ? (fallbackGuide(g).lines.find((l) => l.includes('곳 가운데')) ?? '') : ''
      return !/[0-9]+위/.test(line) || /[12]순위/.test(line)
    }),
    'legacy-priority 가 발표한 자리는 1순위·2순위·가장 여유 있는 곳 셋뿐이다',
  )

  /* ══════════ ⑤ 참여(/pick) 회귀 — 월드컵 3종·출처 구분·48px·키보드 ══════════
     "게임이 돌아간다"는 코드가 있다는 말이지 돌아갔다는 말이 아니다 — 세 월드컵을
     실제로 끝까지 누르고, 결과 수치를 analysis.json 확정값과 대조하고,
     「통일부 자료 아님」 구분이 결과 화면과 공유 PNG(캔버스에 실제로 그려진 글자) 양쪽에
     있는지를 잰다. 집계(tallyLine)는 표본 20판 미만이면 화면에서 사라지는 설계라,
     실 DB 를 기다리면 이 검사가 영원히 잠복한다 — 그래서 Supabase 응답을 CDP Fetch 로
     가로채 합성 집계(표본 24판)를 주입한다. 덤으로 검증 실행이 실 통계에 가짜 행을
     남기지 않게 된다(pick_event POST 도 여기서 201 로 삼킨다). */
  if (!AS_JSON) console.log(`\n▶ 참여 /pick 회귀 (월드컵 3종 · 출처 구분 · 48px · 키보드)`)

  const pickItemsTs = fs.readFileSync(path.join(root, 'frontend/src/data/pick-items.ts'), 'utf8')
  const pickItems = JSON.parse(pickItemsTs.slice(pickItemsTs.indexOf('const data = ') + 'const data = '.length, pickItemsTs.lastIndexOf('\n\nexport default')))
  const lpCard = analysis.cards.find((c) => c.id === 'legacy-priority')
  const rdCard = analysis.cards.find((c) => c.id === 'record-density-gap')
  const rankRows = [...lpCard.series.find((s) => s.key === 'priority').rows].sort((a, b) => a.y - b.y)
  const expectRegion = new Map(rankRows.map((r, i) => {
    const t = rdCard.table.find((x) => x['고향'] === r.x)
    return [r.x, { rank: i + 1, survivors: t['생존자'], density: t['밀도'] }]
  }))
  const regionOfItem = new Map([
    ...pickItems.foods.map((f) => [f.name, f.region]),
    ...pickItems.sceneries.map((s) => [s.name, s.region]),
  ])

  /* ── Supabase 가로채기 — 집계 주입 + 검증 실행의 통계 오염 차단 ── */
  const CORS = [
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: '*' },
    { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
  ]
  /* game 열 필수 — pick_tally 가 게임별 집계로 바뀐 뒤(0013+순위덱) game 없는 행은 버려진다 */
  const fakeTally = JSON.stringify([
    { game: 'food', winner_key: 'syn-a', winner_label: '합성표본A', home_old: 'pyongan-s-old', n: 9 },
    { game: 'food', winner_key: 'syn-b', winner_label: '합성표본B', home_old: 'hwanghae-old', n: 8 },
    { game: 'food', winner_key: 'syn-c', winner_label: '합성표본C', home_old: 'hamgyong-s-old', n: 7 },
  ])
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*rest/v1/pick_event*' }, { urlPattern: '*rest/v1/pick_tally*' }] })
  let pumpOn = true
  let pumpSeen = 0
  let interceptedPosts = 0
  const pump = (async () => {
    while (pumpOn) {
      while (pumpSeen < cdp.events.length) {
        const ev = cdp.events[pumpSeen++]
        if (ev.method !== 'Fetch.requestPaused') continue
        const p = ev.params
        try {
          if (p.request.method === 'OPTIONS') {
            await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, responseHeaders: CORS })
          } else if (/pick_event/.test(p.request.url)) {
            interceptedPosts++
            await cdp.send('Fetch.fulfillRequest', {
              requestId: p.requestId, responseCode: 201,
              responseHeaders: [...CORS, { name: 'Content-Type', value: 'application/json' }],
              body: Buffer.from('[]').toString('base64'),
            })
          } else if (/pick_tally/.test(p.request.url)) {
            await cdp.send('Fetch.fulfillRequest', {
              requestId: p.requestId, responseCode: 200,
              responseHeaders: [...CORS, { name: 'Content-Type', value: 'application/json' }],
              body: Buffer.from(fakeTally).toString('base64'),
            })
          } else {
            await cdp.send('Fetch.continueRequest', { requestId: p.requestId })
          }
        } catch { /* 탭 전환 등으로 이미 사라진 요청 — 무해 */ }
      }
      await sleep(30)
    }
  })()

  const pickBody = () => evl('document.body.innerText')
  const pickCounter = async () => {
    const m = (await pickBody()).match(/(\d+)번 골랐습니다/)
    return m ? Number(m[1]) : null
  }
  const clickPickBtn = `(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'').includes('고르기'))
    if (!b) return null
    const name = (b.getAttribute('aria-label')||'').replace(/^왼쪽 — |^오른쪽 — /,'').replace(/ 고르기$/,'')
    b.click(); return name
  })()`
  const pickNav = async (url, readyText) => {
    await cdp.send('Page.navigate', { url })
    return waitFor(`document.body.innerText.includes('${readyText}')`)
  }
  const finishTournament = async () => {
    let winner = null
    let maxSeen = 0
    for (let i = 0; i < 20; i++) {
      const name = await evl(clickPickBtn)
      if (name == null) break
      winner = name
      await sleep(170)
      const c = await pickCounter()
      if (c != null && c > maxSeen) maxSeen = c
    }
    return { winner, maxSeen, doneText: await pickBody() }
  }

  /* ── (d)-키보드: 자동반복·연타 내성 — /pick/word 에서 잰다 ──
       화살표를 「누르고 있으면」 keydown 이 자동반복으로 몰려온다. e.repeat 가드와
       choose() 멱등 가드가 없으면 15판이 51판이 되고 진행 막대가 넘친다(실측 사고). */
  check('말 월드컵이 뜬다 (/pick/word)', await pickNav(`${BASE}/pick/word`, '북녘의 말 월드컵'))
  await evl(`document.body.focus()`)
  const kbd = async (type, extra = {}) =>
    cdp.send('Input.dispatchKeyEvent', { type, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, ...extra })
  await kbd('keyDown')
  for (let i = 0; i < 19; i++) await kbd('keyDown', { autoRepeat: true })
  await kbd('keyUp')
  await sleep(500)
  const afterHold = await pickCounter()
  const holdText = await pickBody()
  check(
    '화살표를 누르고 있어도(자동반복 20연발) 1판만 고른다 — 진행 표시가 자기모순 없다',
    afterHold === 1 && holdText.includes('모두 15번 고릅니다') && /16강 · 2 \/ 8/.test(holdText),
    `골랐습니다 ${afterHold}판 · ${(holdText.match(/16강 · \d+ \/ \d+/) ?? ['?'])[0]}`,
  )
  /* 되돌리기 뒤 다시 고를 수 있는가 — 멱등 가드가 되돌리기에서 풀리는지(같은 짝을 다시 골라야 한다) */
  await evl(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('한 판 되돌리기'))?.click()`)
  await sleep(250)
  const afterUndo = await pickCounter()
  await kbd('keyDown'); await kbd('keyUp')
  await sleep(350)
  const afterRedo = await pickCounter()
  check('되돌리기 → 같은 짝을 키보드로 다시 고를 수 있다', afterUndo === 0 && afterRedo === 1, `되돌린 뒤 ${afterUndo} → 다시 ${afterRedo}`)
  /* 진행 막대가 100% 를 넘지 않는가 (스타일 방어) */
  const barW = await evl(`(() => {
    const el = [...document.querySelectorAll('div[role="presentation"] > div')].find(d => d.style.width)
    return el ? el.style.width : null
  })()`)
  check('진행 막대 폭이 0~100% 안이다', Boolean(barW) && parseFloat(barW) >= 0 && parseFloat(barW) <= 100, `width ${barW}`)

  /* (a) 말 월드컵 완주 + 지역 축 없음 정직 고지 */
  const wordEnd = await finishTournament()
  check('말 월드컵 15판 완주 — 결과가 뜬다', wordEnd.doneText.includes('마지막까지 남은 것') && wordEnd.maxSeen <= 15,
    `우승 「${wordEnd.winner}」 · 최대 판수 표시 ${wordEnd.maxSeen}`)
  check('말: 지역 통계를 붙이지 않는다고 화면이 말하고, 순위 구획이 없다',
    wordEnd.doneText.includes('지역 통계를 붙이지 않습니다') && !wordEnd.doneText.includes('위 / 7') && wordEnd.doneText.includes('21,985'))

  /* (a)(b) 음식·풍경 완주 + 결과 수치 = analysis.json */
  for (const [slug, title, label] of [['food', '고향의 음식 월드컵', '음식'], ['scene', '고향의 풍경 월드컵', '풍경']]) {
    check(`${label} 월드컵이 뜬다 (/pick/${slug})`, await pickNav(`${BASE}/pick/${slug}`, title))
    const end = await finishTournament()
    const region = regionOfItem.get(end.winner)
    const e = region ? expectRegion.get(region) : null
    check(`${label} 15판 완주 — 결과가 뜬다`, end.doneText.includes('마지막까지 남은 것'), `우승 「${end.winner}」 → ${region}`)
    check(
      `${label} 결과 수치 = analysis.json (전국 ${e?.rank}위/7 · ${e?.survivors?.toLocaleString('ko-KR')}명 · ${e?.density}건 · 기준일 ${lpCard.asOf})`,
      Boolean(e) && end.doneText.includes(`전국 ${e.rank}위`) && end.doneText.includes(`${e.survivors.toLocaleString('ko-KR')}명`)
        && end.doneText.includes(`${e.density}건`) && end.doneText.includes(lpCard.asOf),
    )
    /* as-of 축 명시 — 분모(생존자)와 분자(기록 수)의 기준일이 다르다는 사실이 화면에 있다 */
    check(`${label}: 기준일이 축을 명시한다(생존자 기준일 · 기록 수는 계열마다 수집일이 다름)`,
      end.doneText.includes(`생존자 기준일 ${lpCard.asOf}`) && end.doneText.includes('수집일이 다'))
    if (slug === 'food') {
      /* (c)-화면: 통설(통일부 자료 아님) 구분 + 주입한 집계의 「통일부 자료 아님」 꼬리 */
      check('음식 결과 화면 — 「통일부 자료 아님」 구분이 있다', end.doneText.includes('통일부 자료 아님'))
      /* 결과 화면의 집계는 이제 순위덱(TallyDeck)이 그린다 — 마운트가 900ms 늦으므로 기다렸다 잰다.
         24판 중 9명 = 38% 가 인원수 옆에 그대로 붙어야 한다(n 상시 병기). */
      await waitFor(`document.body.innerText.includes('지금까지 24판')`, 24)
      const resBody = await evl('document.body.innerText')
      check(
        '집계 주입(표본 24판)이 결과 순위덱에 그대로 뜬다(24판 · 합성표본A 9명 (38%) · 「이 화면의 익명 집계 · 통일부 자료 아님」)',
        resBody.includes('지금까지 24판') && resBody.includes('합성표본A') && /9명 \(38%\)/.test(resBody) && resBody.includes('이 화면의 익명 집계 · 통일부 자료 아님'),
        (resBody.match(/지금까지 [^\n]+/) ?? ['집계 줄 없음'])[0].slice(0, 60),
      )

      /* (c)-PNG: 캔버스에 실제로 그려진 글자를 fillText 후킹으로 걷는다 —
         「코드에 문구가 있다」가 아니라 「이 PNG 에 그 글자가 그려졌다」를 잰다 */
      await evl(`(() => {
        window.__painted = []
        const orig = CanvasRenderingContext2D.prototype.fillText
        CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__painted.push(String(t)); return orig.call(this, t, ...a) }
        return true
      })()`)
      await evl(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('공유 그림 저장'))?.click()`)
      const gotPng = await waitFor(`(document.querySelector('a[download]')?.href || '').startsWith('data:image/png')`, 40)
      check('공유 PNG — canvas 가 data:image/png 를 돌려준다', gotPng)
      const painted = (await evl(`window.__painted`)) ?? []
      const iTally = painted.findIndex((t) => t.startsWith('지금까지 24판'))
      const iSep = painted.findIndex((t) => t.includes('고향잇기 참여 익명 집계 · 통일부 자료 아님'))
      check(
        '공유 PNG 에 집계 줄과 「통일부 자료 아님」 구분이 함께 그려진다 (집계 줄 바로 뒤)',
        iTally >= 0 && iSep === iTally + 1,
        `tally@${iTally} · 구분@${iSep} — ${painted[iSep] ?? '없음'}`,
      )
      check('공유 PNG 에 통설 고지(통일부 공표 자료가 아닙니다)와 공공데이터 출처가 갈라져 그려진다',
        painted.some((t) => t.includes('통일부 공표 자료가 아닙니다')) && painted.some((t) => t.includes('수치는 통일부 공공데이터입니다')))
      check('공유 PNG 의 기준일도 축을 명시한다(생존자 기준일)', painted.some((t) => t.includes(`생존자 기준일 ${lpCard.asOf}`)))

      /* (d)-48px: 결과 화면 — 본문 속 출처 링크(귀속 근거·저장 링크)가 15px 였던 회귀 */
      const sweepRes = await evl(`(() => {
        const all = [...document.querySelectorAll('a[href],button,[role=button],input,select,summary')]
          .filter(e => { const r = e.getBoundingClientRect(); return (r.width || r.height) })
          .filter(e => !e.closest('svg'))
        const tiny = all.filter(e => { const r = e.getBoundingClientRect(); return r.height < 48 || r.width < 48 })
        return { total: all.length,
          tiny: tiny.map(e => (e.tagName + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height) + ' ' + (e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ')).slice(0, 44)) }
      })()`)
      check('음식 결과 화면 — 본문 출처 링크까지 전부 48px 이상', sweepRes.tiny.length === 0,
        sweepRes.tiny.length ? `${sweepRes.total}개 중 미달 ${sweepRes.tiny.length}: ${sweepRes.tiny.slice(0, 3).join(' | ')}` : `타깃 ${sweepRes.total}개 전부 통과`)
    }
  }

  /* (d)-48px: 허브·게임 중·결과 화면의 누르는 것 전수 — breadcrumb 「참여」가 22×15 였던 회귀 */
  for (const [url, readyText, name] of [
    [`${BASE}/pick`, '취향으로 먼저', '/pick 허브'],
    [`${BASE}/pick/word`, '북녘의 말 월드컵', '/pick/word 게임 중'],
  ]) {
    await pickNav(url, readyText)
    await sleep(400)
    const sweep48 = await evl(`(() => {
      const all = [...document.querySelectorAll('a[href],button,[role=button],input,select,summary')]
        .filter(e => { const r = e.getBoundingClientRect(); return (r.width || r.height) })
        .filter(e => !e.closest('svg'))
      const tiny = all.filter(e => { const r = e.getBoundingClientRect(); return r.height < 48 || r.width < 48 })
      return { total: all.length,
        tiny: tiny.map(e => (e.tagName + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height) + ' ' + (e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ')).slice(0, 44)) }
    })()`)
    check(`${name} — 누르는 것 전부 48px 이상 (breadcrumb 포함)`, sweep48.tiny.length === 0,
      sweep48.tiny.length ? `${sweep48.total}개 중 미달 ${sweep48.tiny.length}: ${sweep48.tiny.slice(0, 3).join(' | ')}` : `타깃 ${sweep48.total}개 전부 통과`)
  }

  check('검증 실행이 실 집계에 행을 남기지 않았다 (pick_event POST 전부 가로채 201 처리)', interceptedPosts >= 3, `가로챈 POST ${interceptedPosts}건`)
  pumpOn = false
  await pump
  await cdp.send('Fetch.disable')

  /* 콘솔 오류 */
  const errs = cdp.events
    .filter((e) => e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
    /* ★ 텍스트만 보면 "Failed to load resource…" 뿐이라 무엇이 실패했는지 알 수 없다 —
         URL 을 붙여서 판정한다(사료 사진을 eager 로 바꾼 뒤 이 구분이 실제로 필요해졌다). */
    .map((e) => `${e.params.entry.text} ${e.params.entry.url ?? ''}`)
    /* 박물관 원본 이미지가 개발 서버 경유로에서 502·404 로 막히는 것은 화면 밖의 일이다(이미지는 감춰진다) */
    /* /api/llm 은 Cloudflare Pages Function 이라 **개발 서버에 존재하지 않는다**(404).
       그것이 오류로 세어지면 안 되는 이유는 바로 위 검사가 증거다 — 이 경로가 죽은 채로
       안내인이 규칙 문장으로 서는 것을 실측했다(LLM 4원칙 ④). 배포본에는 이 경로가 있다. */
    .filter((t) => !/museum-img|favicon|reunion\.unikorea\.go\.kr|\/api\/llm/.test(t))
  check('콘솔 오류 0건', errs.length === 0, errs.slice(0, 3).join(' | '))

  /* ══════════ ③ 캔버스 줄바꿈 규칙 (브라우저 없이) ══════════
     오류가 안 나서 눈에 안 띄는 종류의 사고다 — 글자가 한 칸 밀리거나 단어가 중간에서 끊길 뿐이라
     캡처를 봐도 넘어간다. 그래서 자로 잰다. 가짜 measureText 는 라틴 10px · 그 밖 20px 로 둔다. */
  if (!AS_JSON) console.log(`\n▶ 캔버스 줄바꿈 규칙 (lib/wrapLines.mjs)`)
  const ruler = { measureText: (s) => ({ width: [...String(s)].reduce((w, ch) => w + (/[ -~]/.test(ch) ? 10 : 20), 0) }) }
  /* 두 문단이 각각 한 가지 실패를 겨눈다 — 고치기 전 코드로 돌리면 둘 다 재현된다:
       1문단 → ["…파하 A", "BC123456 끝."]        (단어 중간 절단)
       2문단 → ["…파하하", " 다음 줄입니다."]      (줄 앞 공백) */
  const wrapped = wrapLines(
    ruler,
    '가나다라마바사아자차카타파하 ABC123456 끝.\n가나다라마바사아자차카타파하하 다음 줄입니다.',
    300,
  )
  check('어느 줄도 공백으로 시작하지 않는다', wrapped.every((l) => !/^\s/.test(l)), JSON.stringify(wrapped))
  /* 쪼개졌다면 어느 줄에도 'ABC123456' 이 통째로 남지 않는다 — 그 한 줄이 판정이다 */
  check('라틴·숫자 덩어리가 단어 중간에서 쪼개지지 않는다',
    wrapped.some((l) => l.includes('ABC123456')),
    JSON.stringify(wrapped))
  check('한 줄도 폭을 넘지 않는다', wrapped.every((l) => ruler.measureText(l).width <= 300),
    `최대 ${Math.max(...wrapped.map((l) => ruler.measureText(l).width))}px`)
  const longTok = wrapLines(ruler, 'A'.repeat(80), 300)
  check('줄보다 긴 덩어리는 그때만 쪼갠다(넘쳐 잘리지 않는다)',
    longTok.length === 3 && longTok.join('') === 'A'.repeat(80), JSON.stringify(longTok.map((l) => l.length)))

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
