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
     [8] 덱 상단 「기계가 쓴 요약」이 실제로 렌더되는가 · 줄마다 기준일이 붙는가 ·
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

  /* ══════════ ①b 덱 상단 「기계가 쓴 요약」 ══════════
     이 구획은 **없어도 되는 파일**로 만들어져 있다(deck-summary.json 이 없으면 화면이
     그 자리를 조용히 비운다). 그래서 "요약이 안 뜬다"가 오류로 드러나지 않는다 —
     여기서 재지 않으면 조용히 사라져도 아무도 모른다. */
  if (!AS_JSON) console.log(`\n▶ 덱 상단 요약`)
  if (!summary) {
    check('덱 요약 파일이 있다', false, 'frontend/public/gohyang/deck-summary.json 이 없다')
  } else {
    await cdp.send('Page.navigate', { url: `${BASE}/deck` })
    await waitFor(`document.body.innerText.includes('재본 것과')`)
    const sumUp = await evl(`(() => {
      const sec = document.querySelector('section[aria-label="기계가 쓴 요약"]')
      if (!sec) return null
      const chips = [...sec.querySelectorAll('button[data-summary-chip]')]
      return {
        head: sec.querySelector('h2')?.textContent?.trim() ?? null,
        text: sec.innerText,
        lines: sec.querySelectorAll('ul > li').length,
        chips: chips.length,
        asOfs: chips.map(b => b.getAttribute('data-summary-chip')),
        chipText: chips.map(b => b.textContent.replace(/\\s+/g, ' ').trim()),
      }
    })()`)
    const wantLines = summary.sections.reduce((s, x) => s + x.lines.length, 0)
    check('덱 상단에 요약 구획이 렌더된다', Boolean(sumUp) && sumUp.head === '이 덱이 말하는 것',
      sumUp ? `머리글 "${sumUp.head}" · 줄 ${sumUp.lines}개` : '구획 없음')
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
  const tiny = await evl(`(() => [...document.querySelectorAll('a[href],button,[role=button],input,select,summary')]
    .filter(e => { const r = e.getBoundingClientRect(); return (r.width || r.height) && (r.height < 48 || r.width < 48) })
    .filter(e => !e.closest('svg'))
    .map(e => (e.tagName + ' ' + (e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ')).slice(0, 44)))()`)
  check('누르는 것은 전부 48px 이상이다 (지도 폴리곤 제외)', tiny.length === 0, tiny.slice(0, 3).join(' | ') || '0건')

  /* ── 핀 덱 — 페이지 스크롤이 카드를 넘기고, 카드 경계에 정확히 선다 ── */
  const ROW = `[...document.querySelectorAll('[role=group][aria-roledescription="가로 카드 묶음"]')][0]`
  const deck0 = await evl(`(() => { const row = ${ROW}; if (!row) return null
    const r = row.getBoundingClientRect()
    return { y: Math.round(r.top + scrollY), cards: row.children.length } })()`)
  check('사료 핀 덱이 가로 카드 묶음으로 실재한다', Boolean(deck0 && deck0.cards > 1), deck0 ? `카드 ${deck0.cards}장` : '없음')

  const readDeck = `(() => { const row = ${ROW}
    const cnt = [...document.querySelectorAll('p')].map(p => p.textContent.trim()).filter(t => t.length < 9 && t.indexOf(' / ') > 0)[0] ?? null
    return {
      left: Math.round(row.scrollLeft), mod: Math.round(row.scrollLeft % row.clientWidth), counter: cnt,
      inert: [...row.children].filter(c => c.hasAttribute('inert')).length,
      reachable: [...row.querySelectorAll('a[href],button')].filter(e => !e.closest('[inert]')).length,
    } })()`
  await evl(`window.scrollTo(0, ${(deck0?.y ?? 0) + 400})`)
  await sleep(700)
  const pinA = await evl(readDeck)
  await evl(`window.scrollBy(0, 900)`)
  await sleep(800)
  const pinB = await evl(readDeck)
  check(
    '페이지를 내리면 핀 덱이 실제로 넘어간다',
    Boolean(pinA && pinB && pinB.left > pinA.left && pinB.counter !== pinA.counter),
    `${pinA?.counter} → ${pinB?.counter} (scrollLeft ${pinA?.left} → ${pinB?.left})`,
  )
  check(
    '사상 결과가 카드 경계에 정확히 선다 (반씩 걸치지 않는다)',
    pinA?.mod === 0 && pinB?.mod === 0,
    `나머지 ${pinA?.mod}px · ${pinB?.mod}px`,
  )
  check(
    '화면 밖 카드는 탭 정지점이 아니다 (포커스와 화면이 어긋나지 않는다)',
    Boolean(pinB && deck0 && pinB.inert === deck0.cards - 1 && pinB.reachable <= 4),
    `inert ${pinB?.inert}/${(deck0?.cards ?? 1) - 1}장 · 닿는 링크 ${pinB?.reachable}개`,
  )

  /* ── reduced-motion 폴백 — 런웨이가 풀리고 평범한 가로 snap 행 + 단추만 남는가 ── */
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
