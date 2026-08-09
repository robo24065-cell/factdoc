// 화면 캡처 — CDP 디바이스 에뮬레이션
//
// 왜 CDP 인가: `chrome --headless --window-size=375,…` 는 이 플랫폼에서 창 너비를
// 최소 500px 로 강제한다(실측 innerWidth=500). 그러면 500px 레이아웃을 375px 로 '잘라낸'
// 이미지가 나와서, 멀쩡한 화면이 깨진 것처럼 보인다. 실제 뷰포트를 바꾸려면 CDP 가 필요하다.
//
//   node scripts/shot.mjs <outDir> [--base http://localhost:5178]
//
// 캡처 목록은 SHOTS 에 있다. 질의는 ?q= 퍼머링크로 주입한다.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p))
if (!CHROME) { console.error('Chrome/Edge 를 찾지 못했습니다.'); process.exit(1) }

const OUT = path.resolve(process.argv[2] || 'shots')
const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : '') || 'http://localhost:5178'
const PORT = 9222 + (process.pid % 400)

const DESKTOP = { width: 1280, height: 900, scale: 1, mobile: false }
const MOBILE  = { width: 375,  height: 812, scale: 2, mobile: true }

const SHOTS = [
  { name: '01-홈-라이트',        q: '',                                   dev: DESKTOP, dark: false },
  { name: '02-홈-다크',          q: '',                                   dev: DESKTOP, dark: true  },
  { name: '03-종료된사안',       q: '개성공단 아직 하냐',                  dev: DESKTOP, dark: false },
  { name: '04-분포-주장반박',    q: '탈북은 나이 많은 사람이 더 많이 한다며', dev: DESKTOP, dark: false },
  { name: '05-연혁',             q: '김정은 최근에 뭐 했어',                dev: DESKTOP, dark: false },
  { name: '06-수치대조',         q: '개성공단에 기업 500개나 있었다던데',    dev: DESKTOP, dark: false },
  { name: '07-도메인밖',         q: '오늘 저녁 뭐 먹지',                    dev: DESKTOP, dark: false },
  { name: '11-북한핵',           q: '북한 핵',                              dev: DESKTOP, dark: false },
  { name: '12-우라늄폐수',       q: '우라늄 공장 폐수',                     dev: DESKTOP, dark: false },
  { name: '13-변별신호없음',     q: '북한방사능',                           dev: DESKTOP, dark: false },
  { name: '08-모바일-종료된사안', q: '개성공단 아직 하냐',                  dev: MOBILE,  dark: false },
  { name: '09-모바일-분포',      q: '탈북은 나이 많은 사람이 더 많이 한다며', dev: MOBILE,  dark: false },
  { name: '10-종료된사안-다크',  q: '개성공단 아직 하냐',                  dev: DESKTOP, dark: true  },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function cdpTargets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return r.json()
}

/** 최소 CDP 클라이언트 — Node 22+ 의 전역 WebSocket 사용 */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const events = []
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
    } else if (m.method) events.push(m)
  })
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', () => rej(new Error('CDP 연결 실패')))
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id
    pending.set(myId, { resolve, reject })
    ws.send(JSON.stringify({ id: myId, method, params }))
  })
  return { ready, send, events, close: () => ws.close() }
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
  // 디버깅 포트가 열릴 때까지
  let targets = null
  for (let i = 0; i < 60; i++) {
    try { targets = await cdpTargets(); if (targets?.length) break } catch { /* 아직 */ }
    await sleep(250)
  }
  if (!targets?.length) throw new Error('CDP 포트가 열리지 않았습니다')

  const page = targets.find(t => t.type === 'page') ?? targets[0]
  cdp = connect(page.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  for (const s of SHOTS) {
    const { width, height, scale, mobile } = s.dev
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: scale, mobile,
      screenWidth: width, screenHeight: height,
    })
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: s.dark ? 'dark' : 'light' }],
    })

    const url = s.q ? `${BASE}/?q=${encodeURIComponent(s.q)}` : `${BASE}/`
    await cdp.send('Page.navigate', { url })
    // 인덱스(13MB) 로드 + 검색 완료를 폴링으로 기다린다 — 고정 sleep 보다 정확하다
    let ok = false
    for (let i = 0; i < 80; i++) {
      await sleep(250)
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const hasStat = !!document.querySelector('[data-shot="stats"], main, body');
          const answered = !${JSON.stringify(!!s.q)} || !!document.querySelector('[data-shot="answer"]') ||
            document.body.innerText.includes('사실은ON 확인 결과') ||
            document.body.innerText.includes('찾지 못했') ||
            document.body.innerText.includes('다루는 분야가 아닙니다');
          return hasStat && answered && document.body.innerText.length > 200;
        })()`,
        returnByValue: true,
      })
      if (result.value) { ok = true; break }
    }
    await sleep(600) // 전이 애니메이션 정착

    // 모바일에서는 앱이 결과로 자동 스크롤한다. 전체 페이지 캡처에서 sticky 헤더가
    // 스크롤된 위치에 박제되므로, 찍기 전에 최상단으로 되돌린다.
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' })
    await sleep(400)

    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
    })
    const file = path.join(OUT, `${s.name}.png`)
    fs.writeFileSync(file, Buffer.from(data, 'base64'))

    // 캡처와 함께 레이아웃 건강검진 — 가로 오버플로가 있으면 그 자리에서 잡는다
    const { result: audit } = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const de = document.documentElement, vw = de.clientWidth;
        const bad = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width && r.right + scrollX > vw + 1)
            bad.push(el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 60));
        }
        return { vw, sw: de.scrollWidth, over: de.scrollWidth - vw, bad: bad.slice(0, 4),
                 h: document.body.scrollHeight };
      })()`,
      returnByValue: true,
    })
    const a = audit.value
    const flag = a.over > 0 ? `  ⚠ 가로초과 ${a.over}px ${a.bad.join(' ')}` : ''
    console.log(`${ok ? '✓' : '⚠'} ${s.name.padEnd(22)} ${a.vw}×${a.h}${flag}`)
  }
} catch (e) {
  console.error('실패:', e.message)
  process.exitCode = 1
} finally {
  try { cdp?.close() } catch { /* noop */ }
  try { await fetch(`http://127.0.0.1:${PORT}/json/close`) } catch { /* noop */ }
  chrome.kill()
}
console.log(`\n출력: ${OUT}`)
