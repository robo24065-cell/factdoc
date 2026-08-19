// 고향ON 화면 캡처 — 기획서 별첨용
//
// shot.mjs 와 같은 CDP 방식이되, 질의(?q=)가 아니라 **화면 상태**를 만든다:
// 지역 클릭·구획 스크롤·보기 모드 전환. 캡처는 뷰포트 단위다(전체 페이지가
// 아니라) — A4 에 넣을 그림이라 한 화면이 한 장이어야 한다.
//
//   node scripts/nk-shot-gohyang.mjs [출력디렉터리] [--base http://localhost:5178]
//   → 기획서-캡처/gohyang/*.png

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const OUT = path.resolve(process.argv[2] || '기획서-캡처/gohyang')
const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : '') || 'http://localhost:5178'
const PORT = 9223
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(p => fs.existsSync(p))
if (!CHROME) { console.error('Chrome 없음'); process.exit(1) }

/* 시나리오 — steps 는 순서대로: click(텍스트로 버튼 찾기) · scroll(셀렉터/좌표) · wait(ms) */
const SHOTS = [
  { name: '01-홈-한눈에', steps: [] },
  {
    name: '02-고향패널-황해도',
    steps: [{ click: '황해도(구)' }, { wait: 1800 }, { scroll: '[data-shot="panel"], aside, section' }],
  },
  { name: '03-소멸시계', steps: [{ scroll: '#extinction' }, { wait: 800 }] },
  { name: '04-후손다리', steps: [{ scroll: '#descendant' }, { wait: 800 }] },
  {
    name: '05-한걸음씩',
    pre: `localStorage.setItem('gohyang_view','step')`,
    steps: [{ wait: 1200 }],
  },
  {
    name: '06-한걸음씩-사료묶음',
    pre: `localStorage.setItem('gohyang_view','step')`,
    steps: [
      { click: '황해도(구)' }, { wait: 1400 },
      { scrollText: '그 고향에서 온 기록물' }, { wait: 900 },
    ],
  },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function targets() { return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json() }
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0; const pending = new Map()
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
  })
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('CDP 연결 실패'))) })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
  return { ready, send, close: () => ws.close() }
}

fs.mkdirSync(OUT, { recursive: true })
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--disable-extensions', '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(OUT, '.chrome-profile')}`,
  'about:blank',
], { stdio: 'ignore' })

let cdp
try {
  let ts = null
  for (let i = 0; i < 60; i++) { try { ts = await targets(); if (ts?.length) break } catch {} await sleep(250) }
  if (!ts?.length) throw new Error('CDP 포트가 열리지 않았습니다')
  cdp = connect(ts.find(t => t.type === 'page')?.webSocketDebuggerUrl ?? ts[0].webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 2, mobile: false, screenWidth: 1280, screenHeight: 860 })
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })

  const evl = async expression => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result?.value

  for (const s of SHOTS) {
    if (s.pre) { await cdp.send('Page.navigate', { url: BASE + '/' }); await sleep(800); await evl(s.pre) }
    await cdp.send('Page.navigate', { url: BASE + '/' })
    // 데이터 로드 대기 — 히어로 수치가 렌더되면 준비된 것
    for (let i = 0; i < 60; i++) {
      await sleep(250)
      if (await evl(`document.body.innerText.includes('33,272') || document.body.innerText.includes('남았습니다')`)) break
    }
    await sleep(700)

    for (const st of s.steps || []) {
      if (st.click) {
        await evl(`(() => {
          const els = [...document.querySelectorAll('button, a')]
          const el = els.find(e => e.textContent.replace(/\\s+/g,'').includes(${JSON.stringify(st.click.replace(/\s+/g, ''))}))
          if (el) { el.click(); return true } return false
        })()`)
        await sleep(600)
      }
      if (st.scroll) {
        await evl(`(() => {
          const el = document.querySelector(${JSON.stringify(st.scroll)})
          if (el) el.scrollIntoView({ block: 'start' })
          window.scrollBy(0, -70)   // sticky 헤더만큼 되올림
        })()`)
        await sleep(500)
      }
      if (st.scrollText) {
        await evl(`(() => {
          const p = [...document.querySelectorAll('h2,h3,p')].find(e => e.textContent.includes(${JSON.stringify(st.scrollText)}))
          const card = p && p.closest('section, article, [data-step]') || p
          if (card) card.scrollIntoView({ block: 'center' })
        })()`)
        await sleep(600)
      }
      if (st.wait) await sleep(st.wait)
    }

    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })  // 뷰포트만
    fs.writeFileSync(path.join(OUT, `${s.name}.png`), Buffer.from(data, 'base64'))
    console.log(' ✓', s.name)
  }
  console.log('→', OUT)
} finally {
  cdp?.close(); chrome.kill()
  await sleep(1200)   // 크롬이 프로필 잠금을 놓을 때까지 — 실패해도 무해(.chrome-profile 은 gitignore)
  try { fs.rmSync(path.join(OUT, '.chrome-profile'), { recursive: true, force: true }) } catch {}
}
