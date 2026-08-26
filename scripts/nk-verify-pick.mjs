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
     [6b] 북BTI 회귀 — 진행(허브 0/4 「참여해서 북BTI를 채워보세요」)→네 게임 완주로 완성(유형 카드
          코드·별칭·범례) · 재미용 구분 문구(심리검사·통일부 자료 아님) · 16유형 분포 화면 수치 =
          bukbti_tally 실응답(글자 단위, 0건 유형 전부 나열·n 상시 병기·as-of) · n=0 「내 기록 포함」
          모순 회귀 · RLS — anon 이 bukbti_event 원시행(0015)을 읽지 못한다
     [6c] AI 스튜디오 회귀 — 위저드 6단계 완주로 템플릿 산출 성립(화면 프롬프트 = 엔진
          buildStudioOutput 글자 단위 · dev 는 /api/llm 없음 = 템플릿 경로) · 고지 3종(개인정보·권리·
          상상 재현) + 신규 3종(연출 설정·시대 일반 표현·재현성) · 시대 단정(1940년대) 없음 ·
          출처 라벨 4종 배지 · 정밀/간단 토글(기본 정밀·48px) · 산출 ⑤네거티브 ⑥재현 설정 구획 ·
          복사 단추가 일곱 구획 전체를 라벨째 실제로 담는다 ·
          상단 배너가 참여·스튜디오 값에 통일부 출처를 부여하지 않는다
     [7] 375px 모바일 — 가로 넘침 0
     [8] 집계 전송 — pick_event 본문 4필드 · pick_balance_answer (q_id·choice) · bukbti_event
         (type_code 1필드)뿐 — 개인 식별·연결키 0
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
/* 엔진을 직접 불러 화면과 글자 단위로 대조한다 — [6c] 스튜디오 템플릿 산출 회귀용.
   nk-studio.mjs 는 의존 0개라 node 에서 그대로 돈다(파일 머리 규약). */
import { buildStudioOutput, STUDIO_NOTICES } from '../frontend/src/engine/nk-studio.mjs'

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
/* 북BTI 16유형(코드·별칭) — 데이터 파일(TS)에서 정규식으로 긁는다(verify-bukbti.mjs 관용) */
const bukbtiTs = fs.readFileSync(path.join(root, 'frontend/src/data/bukbti.ts'), 'utf8')
const BUKBTI = [...bukbtiTs.matchAll(/code:\s*'([국찬][산길][밥삶][눈귀])',\s*alias:\s*'([^']+)'/g)].map((m) => ({ code: m[1], alias: m[2] }))
const bukbtiDot = (code) => [...code].join('·')
/* 스튜디오 사료 매니페스트 — [6c]에서 화면과 같은 항목을 골라 엔진 입력을 재구성한다 */
const studioTs = fs.readFileSync(path.join(root, 'frontend/src/data/studio-photos.ts'), 'utf8')
const studioPhotos = JSON.parse(studioTs.slice(studioTs.indexOf('const data = ') + 'const data = '.length, studioTs.indexOf('\n\nexport type')))

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
  /* bukbti_event(0015) — 이 검증이 네 게임을 완주하면 북BTI 4글자가 완성되어 실 Supabase 에
     유형 기록 1행이 쌓인다(새 프로필이라 표식이 없다). 같은 이유로 삼킨다 —
     북BTI 실기록 검증은 별도 하니스(2026-08-26 실측 45/46 + 순서 재확인)가 이미 했다. */
  /* '*pick-img*' 은 [5b] 사진 폴백 검사용 — blockImg 가 켜졌을 때만 실패시키고 평소엔 그대로 통과 */
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*rest/v1/pick_event*' }, { urlPattern: '*rest/v1/pick_balance_answer*' }, { urlPattern: '*rest/v1/bukbti_event*' }, { urlPattern: '*/pick-img/*' }] })
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
  /* ── 회귀 [6b] 전반부: 북BTI 진행판 — 새 프로필이라 반드시 0/4 에서 시작한다 ── */
  {
    const hubText = await body()
    check('북BTI 진행판 — 「참여해서 북BTI를 채워보세요」 + 0/4 채워짐(새 프로필)',
      hubText.includes('참여해서 북BTI를 채워보세요') && hubText.includes('0/4 채워짐'))
    check('북BTI 진행판 — 재미용 구분 문구(「재미로 보는 취향 놀이 · 통일부 자료 아님」 + 심리검사 아님)',
      hubText.includes('재미로 보는 취향 놀이 · 통일부 자료 아님') && hubText.includes('심리검사가 아니며 통일부 자료가 아닙니다'))
    check('북BTI 진행판 — 「마지막 판 기준」 덮어쓰기 정직 고지', hubText.includes('다시 하면 마지막 판 기준으로 글자가 바뀝니다'))
  }
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

  /* ══════════ [6b] 북BTI 회귀 — 네 게임 완주가 곧 완성이다 ══════════
     [2][4][5][6]이 실제로 완주했으므로 이 시점의 localStorage 에는 4글자가 서 있어야 한다.
     완성 코드는 판마다 다르다(승자가 다르므로) — 기대값은 화면이 아니라 기기 상태에서 읽어
     화면·실집계와 삼각 대조한다. bukbti_event POST 는 위 Fetch 인터셉트가 삼켜
     실 DB 를 오염시키지 않으면서 recorded 표식은 화면 쪽에 정상으로 남는다. */
  console.log('\n▶ 북BTI 회귀 /pick/bukbti')
  {
    const stRaw = await evl(`localStorage.getItem('bukbti_v1')`)
    let st = null
    try { st = JSON.parse(stRaw) } catch { /* 아래 check 가 실패로 남긴다 */ }
    const letters = st?.letters ?? {}
    const myCode = ['food', 'scene', 'word', 'balance'].map((g) => letters[g] ?? '').join('')
    const myType = BUKBTI.find((t) => t.code === myCode)
    check('네 게임 완주로 4글자 완성(음식·풍경·말·밸런스 축 순서)', myCode.length === 4 && Boolean(myType), `코드 「${myCode}」`)

    check('/pick/bukbti — 유형 카드(「당신의 북BTI」 + 코드 대활자)', await nav(`${BASE}/pick/bukbti`, `document.body.innerText.includes('당신의 북BTI')`))
    const resText = await body()
    check('유형 카드 — 코드(가운뎃점 표기)·별칭·글자별 범례 4줄(첫째~넷째)',
      Boolean(myType) && resText.includes(bukbtiDot(myCode)) && resText.includes(myType.alias) &&
      ['첫째', '둘째', '셋째', '넷째'].every((w) => resText.includes(w)))
    check('재미용 구분 — 「심리검사가 아니며 통일부 자료가 아닙니다」가 결과 화면에도 있다',
      resText.includes('심리검사가 아니며 통일부 자료가 아닙니다'))
    check('상단 배너가 「모든 값 = 통일부 데이터」를 단정하지 않는다(익명 집계 구분 문구로 교체)',
      !resText.includes('모든 값은 공개된 통일부 데이터') && resText.includes('통일부 공식 서비스가 아니며') && resText.includes('구분해 적습니다'))

    /* ── 분포 실집계 일치 — 화면 수치 = 페이지가 실제로 받은 bukbti_tally 응답 ── */
    const tallyUp = await waitFor(`!!document.querySelector('[data-bukbti-tally]')`, 40)
    if (tallyUp) {
      const respEv = [...cdp.events].reverse().find((e) => e.method === 'Network.responseReceived' && /rest\/v1\/bukbti_tally/.test(e.params.response?.url ?? ''))
      let rows = null
      try {
        const b = await cdp.send('Network.getResponseBody', { requestId: respEv.params.requestId })
        rows = JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body)
      } catch { /* 미포착 — 아래 check 가 실패로 남긴다 */ }
      if (Array.isArray(rows)) {
        const byCode = new Map()
        let total = 0
        for (const r of rows) {
          const c = String(r.type_code ?? '')
          const n = Number(r.n ?? 0)
          if (!BUKBTI.some((t) => t.code === c) || !(n > 0)) continue
          byCode.set(c, (byCode.get(c) ?? 0) + n)
          total += n
        }
        const lis = await evl(`[...document.querySelectorAll('[data-bukbti-tally] ol li')].map(li => li.innerText)`)
        const bad = []
        for (const t of BUKBTI) {
          const li = (lis ?? []).find((s) => s.includes(bukbtiDot(t.code)))
          const n = byCode.get(t.code) ?? 0
          const pct = total > 0 ? Math.round((n / total) * 100) : 0
          if (!li) { bad.push(`${t.code}: 행 없음`); continue }
          if (!li.includes(`${n.toLocaleString('ko-KR')}건`) || !li.includes(`(${pct}%)`)) bad.push(`${t.code}: 화면 「${li.replace(/\n/g, ' ').slice(0, 40)}」 ≠ ${n}건 (${pct}%)`)
        }
        check('16유형 분포 — 0건 유형 포함 16행 전부 나열', Array.isArray(lis) && lis.length === 16, `실측 ${lis?.length}행`)
        check('16유형 분포 — 화면 수치 = bukbti_tally 실응답(각 행 N건 (x%), 글자 단위)', bad.length === 0, bad.join(' | ').slice(0, 200))
        check('내 유형 표식이 내 코드 행에 붙는다', (lis ?? []).some((s) => s.includes(bukbtiDot(myCode)) && s.includes('내 유형')))
        const sect = await evl(`document.querySelector('[data-bukbti-tally]')?.innerText ?? ''`)
        const mTotal = sect.match(/지금까지 ([\d,]+)건 · \d\d:\d\d 불러옴/)
        check('as-of — 「지금까지 N건 · HH:MM 불러옴」의 N = 실응답 총건수',
          Boolean(mTotal) && Number(mTotal[1].replace(/,/g, '')) === total, mTotal ? `화면 ${mTotal[1]}건 · 응답 ${total}건` : 'as-of 미검출')
        check('누적 정직 문구 — 「사람 수가 아니라 북BTI 완성 기록의 누적」', sect.includes('사람 수가 아니라 북BTI 완성 기록의 누적'))
        /* n=0 「내 기록 포함」 모순 회귀 — 부가문은 실집계 1건 이상 + recorded 일 때만.
           이 문장은 집계 도착 후에 그려지므로 본문을 다시 읽는다(resText 는 도착 전 캡처) */
        const mSame = (await body()).match(/같은 유형이 지금까지 ([\d,]+)번 기록되었습니다(\(이번 내 기록 포함\))?/)
        const myN = byCode.get(myCode) ?? 0
        const recorded = st?.recorded === myCode
        check('「같은 유형 N번」의 N = 실응답 · 「(이번 내 기록 포함)」은 N>0 이고 기록됐을 때만',
          Boolean(mSame) && Number(mSame[1].replace(/,/g, '')) === myN && Boolean(mSame[2]) === (myN > 0 && recorded),
          mSame ? `화면 ${mSame[1]}번${mSame[2] ?? ''} · 응답 ${myN}건 · recorded ${recorded}` : '문장 미검출')

        /* ── RLS(0015) — 페이지와 같은 anon 자격으로 bukbti_event 원시행을 두드린다 ── */
        const reqEv = [...cdp.events].reverse().find((e) => e.method === 'Network.requestWillBeSent' && e.params.request.method === 'GET' && /rest\/v1\/bukbti_tally/.test(e.params.request.url))
        const reqId = reqEv?.params.requestId ?? respEv?.params.requestId
        const extraEv = reqId ? cdp.events.find((e) => e.method === 'Network.requestWillBeSentExtraInfo' && e.params.requestId === reqId) : null
        const hdrs = { ...(reqEv?.params.request.headers ?? {}), ...(extraEv?.params.headers ?? {}) }
        const auth = {}
        for (const [k, v] of Object.entries(hdrs)) if (/^(apikey|authorization)$/i.test(k)) auth[k.toLowerCase()] = v
        const tallyUrl = reqEv?.params.request.url ?? respEv?.params.response?.url
        if (tallyUrl && auth.apikey) {
          const origin = new URL(tallyUrl).origin
          const r = await evl(`fetch(${JSON.stringify(`${origin}/rest/v1/bukbti_event?select=*&limit=3`)}, { headers: ${JSON.stringify(auth)} }).then(async (res) => { let len = -1; try { const j = await res.json(); len = Array.isArray(j) ? j.length : -1 } catch { /* 본문 없음 */ } return { status: res.status, len } })`)
          check('RLS — anon 이 bukbti_event 원시행(0015)을 읽지 못한다(4xx 또는 0행)',
            r && !(r.status >= 200 && r.status < 300 && r.len > 0), r ? `HTTP ${r.status} · ${r.len}행` : '요청 실패')
        } else {
          check('RLS — anon 자격 헤더를 포착해 bukbti_event 차단을 확인', false, 'bukbti_tally 요청 미포착')
        }
      } else {
        check('북BTI 분포 — bukbti_tally 응답 본문을 확보해 화면과 대조', false, '응답 미포착')
      }
      /* 기획서 증빙 — 유형 화면 캡처(있으면 덮어쓴다) */
      try {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        const p = path.join(root, '기획서-캡처/bukbti-result.png')
        fs.writeFileSync(p, Buffer.from(shot.data, 'base64'))
        check('북BTI 유형 화면 캡처 저장', fs.statSync(p).size > 10000, path.relative(root, p))
      } catch { check('북BTI 유형 화면 캡처 저장', false, '캡처 실패') }
    } else {
      /* DB 가 죽으면 ②③ 구획만 사라지고 놀이(유형 카드)는 남는 것이 설계다 — 그 사실만 잰다 */
      check('북BTI 분포 — 집계 읽기 실패로 ②③ 구획만 조용히 숨고 유형 카드는 남는다(설계 동작)',
        resText.includes('당신의 북BTI') && !resText.includes('16유형 분포'), '집계 불가')
    }
  }

  /* ══════════ [6c] AI 스튜디오 회귀 — 위저드 완주 = 엔진 산출(글자 단위) ══════════
     dev 에는 /api/llm 이 없으므로 템플릿 경로가 그대로 화면이 된다(LLM 4원칙 ④).
     같은 입력을 엔진(buildStudioOutput)에 직접 넣어 화면 프롬프트와 글자 단위로 대조한다. */
  console.log('\n▶ AI 스튜디오 회귀 /studio')
  {
    check('/studio 렌더 + 저장 안 함 고지', await nav(`${BASE}/studio`, `document.body.innerText.includes('AI 스튜디오')`) && (await body()).includes('이 화면을 떠나면 입력한 내용이 사라집니다'))
    const clickBtn = async (text) => evl(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(text)})); if (!b) return false; b.click(); return true })()`)
    /* ①형식 ②비율 ③고향 */
    check('① 영상 생성', await clickBtn('영상 생성')); await sleep(250)
    check('② 16:9', await clickBtn('가로 — TV·유튜브')); await sleep(250)
    check('③ 황해도(구)', await clickBtn('황해도(구)')); await sleep(250)
    /* ④이야기 — 「장소」 갈래를 펼쳐 「우물가」 칩 하나 */
    check('④ 장소 갈래 펼침', await clickBtn('장소')); await sleep(250)
    check('④ 「우물가」 칩 선택', await clickBtn('우물가')); await sleep(250)
    check('④ 다음', await clickBtn('다음')); await sleep(250)
    /* ⑤분위기 ⑥사료 — 황해도(구)로 걸러진 첫 사료 1장을 화면과 같은 규칙으로 고른다 */
    check('⑤ 옛 사진 다큐', await clickBtn('옛 사진 다큐')); await sleep(300)
    /* 권리 고지 전문(rights)은 ⑥단계 화면의 것이다 — 결과 화면에서는 relicUse 변형이 그 역할을 한다 */
    check('⑥ 권리 고지 전문 — 사료는 보며 참고·본인 가족 소장 사진만', (await body()).includes(STUDIO_NOTICES.rights))
    const relic = studioPhotos.items.find((it) => (it.oldKeys ?? []).includes('hwanghae-old'))
    /* aria-label 에 지역(areaRaw)이 함께 들어간다 — 화면 글자로는 카드에 적히지만
       aria-label 이 그것을 가리므로 라벨 쪽에도 넣어야 스크린리더가 지역을 읽는다 */
    const relicPicked = await evl(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === ${JSON.stringify(`${relic.name} — ${relic.areaRaw} — 참고 사료로 선택`)}); if (!b) return false; b.click(); return true })()`)
    check('⑥ 사료 카드에 지역이 함께 적힌다(무관한 도의 사료를 그 고향의 것으로 오인하지 않게)',
      await evl(`document.body.innerText.includes(${JSON.stringify(`${relic.areaRaw} · `)})`), relic.areaRaw)
    check(`⑥ 사료 1장 선택(「${relic.name}」)`, relicPicked); await sleep(250)
    check('⑥ 1장 골라 프롬프트 만들기', await clickBtn('1장 골라 프롬프트 만들기'))
    await waitFor(`document.body.innerText.includes('산출 ① 최종 프롬프트')`, 40)

    const expect6c = buildStudioOutput({
      medium: 'video', ratio: '16:9', region: { kind: 'old', id: 'hwanghae-old' },
      story: { sceneryOnly: false, picks: [{ group: 'place', chipIds: ['well'], text: '' }] },
      mood: 'docu',
      relics: [{ fileId: relic.fileId, name: relic.name, category: relic.category, provider: relic.provider, sourceUrl: relic.sourceUrl }],
    })
    const stText = await body()
    check('화면 한글 프롬프트 = 엔진 buildStudioOutput(글자 단위)',
      await evl(`[...document.querySelectorAll('p')].some(p => p.innerText === ${JSON.stringify(expect6c.promptKo)})`))
    check('화면 영문 프롬프트 = 엔진 buildStudioOutput(글자 단위)',
      await evl(`[...document.querySelectorAll('p')].some(p => p.innerText === ${JSON.stringify(expect6c.promptEn)})`))
    check('시대 단정 없음 — 화면 어디에도 「1940」이 없다(폭 문구는 엔진 산출에 있음)',
      !stText.includes('1940') && expect6c.promptKo.includes('분단 이전부터 1950년대 초'))
    check('dev = 템플릿 경로 — 「AI로 다듬기」 단추·문구가 화면에 없다(privacyNoLlm 2벌)',
      !stText.includes('AI로 다듬기') && stText.includes(STUDIO_NOTICES.privacyNoLlm))
    check('고지 3종 전문 — 개인정보(무전송)·권리(사료 relicUse 변형)·상상 재현',
      stText.includes(STUDIO_NOTICES.privacyNoLlm) && stText.includes(STUDIO_NOTICES.relicUse) && stText.includes(STUDIO_NOTICES.imagined))
    check('출처 구분 — 사료는 통일부 게재분, 그 밖의 안내는 통일부 자료 아님',
      stText.includes(STUDIO_NOTICES.sourceSplit))
    check('권장 길이 — 16:9 영상 = 30~60초 · 4~6장면(고정 표)', stText.includes('권장 길이 30~60초') && stText.includes('4~6장면'))
    check('상단 배너 — 스튜디오 화면에서도 「모든 값 = 통일부 데이터」 단정 없음',
      !stText.includes('모든 값은 공개된 통일부 데이터') && stText.includes('통일부 공식 서비스가 아니며'))

    /* ── 정밀 프롬프트 — 출처 라벨 4종 · 8구획 값 · 재현 설정 · 시대 일반 표현 고지 ── */
    check('출처 라벨 4종이 화면에 뜬다(이야기·사료·연출·시대 일반)',
      ['● 들려주신 이야기', '● 고른 사료에서', '● 연출 설정', '● 시대 일반 표현'].every((b) => stText.includes(b)))
    check('연출 설정이 사실 주장이 아님을 화면이 밝힌다', stText.includes(STUDIO_NOTICES.directionNote))
    check('「시대 일반 표현」 고지 한 줄이 기존 상상 재현 고지 아래에 붙는다', stText.includes(STUDIO_NOTICES.periodGeneric))
    check('재현성 고지가 과장 없이 그대로 뜬다', stText.includes(STUDIO_NOTICES.reproNote))
    check('네거티브 칸 없는 도구용 폴백 고지 + 긍정 치환문', stText.includes(STUDIO_NOTICES.negFallback) && stText.includes('소달구지 바퀴 자국만 난 흙길'))
    check('산출 ⑤ 네거티브 · ⑥ 재현 설정 구획이 있다', stText.includes('산출 ⑤ 네거티브 프롬프트') && stText.includes('산출 ⑥ 재현 설정'))
    check('권장 시드가 화면 수치로 뜬다', stText.includes(`권장 시드 ${expect6c.seed}`))
    check('프롬프트에 7블록 머리 문자열이 전부 실린다(라벨 뗀 복사본 0)',
      ['[화면]', '[들려주신 이야기', '[고른 사료에서', '[연출 설정', '[시대 일반 표현', '[금지', '[재현 설정'].every((h) => expect6c.promptKo.includes(h)))

    /* ── 날조 방지 회귀 — 화면에서도 출처가 갈리고, 과잉 주장·권리 누락이 없다 ── */
    const sec3 = await evl(`(() => { const s = [...document.querySelectorAll('section')].find(x => x.innerText.startsWith('산출 ③')); return s ? s.innerText : '' })()`)
    check('산출 ③ 각 줄에 출처 배지가 붙는다(이야기·사료·연출 중)',
      ['● 연출 설정', '● 고른 사료에서'].every((b) => sec3.includes(b)), sec3.slice(0, 60).replace(/\n/g, ' '))
    check('산출 ③ 이 지역과 사료를 한 문장에 묶지 않는다(「사료의 지형처럼」 0 · 「가족의 요소」 0)',
      !sec3.includes('사료의 지형') && !sec3.includes('가족의 요소') && sec3.includes('참고 사료: 「'))
    check('권리 고지가 결과 화면에도 남는다(6단계에서만 뜨던 것을 산출 ② 로 옮겼다)',
      stText.includes(STUDIO_NOTICES.rights))
    check('정밀판 안내가 조건 없이 「같은 그림이 잘 나옵니다」라고 말하지 않는다',
      !stText.includes('값이 많은 만큼 같은 그림이 잘 나옵니다') && stText.includes('같은 모델에 같은 시드를 쓰시면 결과가 덜 흔들립니다'))
    check('연출 설정 블록이 갈래 배치를 「흔히 보이는 배치」로 밝혀 싣는다(사료 블록에 두지 않는다)',
      expect6c.blocks.find((b) => b.id === 'direction').bodyKo.includes('흔히 보이는 배치입니다')
      && !expect6c.blocks.find((b) => b.id === 'archive').bodyKo.includes('전경은'))

    /* ── 정밀 ↔ 간단 토글 ── */
    check('정밀/간단 토글 2칸 · 기본 선택은 정밀',
      await evl(`(() => { const b = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === '정밀' || x.textContent.trim() === '간단'); return b.length === 2 && b[0].getAttribute('aria-pressed') === 'true' && b[1].getAttribute('aria-pressed') === 'false' })()`))
    check('토글 단추가 48px 이상',
      await evl(`(() => { const b = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === '정밀' || x.textContent.trim() === '간단'); return b.every(x => x.getBoundingClientRect().height >= 48) })()`))
    await clickBtn('간단'); await sleep(300)
    const simpleText = await body()
    check('간단판으로 바꾸면 간단 프롬프트가 글자 단위로 뜬다',
      await evl(`[...document.querySelectorAll('p')].some(p => p.innerText === ${JSON.stringify(expect6c.promptKoSimple)})`)
      && simpleText.includes('못박은 값이 적어 정밀판보다 결과가 더 흔들립니다'))
    check('간단판도 같은 시드를 쓴다', expect6c.promptKoSimple.includes(String(expect6c.seed)))
    await clickBtn('정밀'); await sleep(300)
    check('정밀로 되돌리면 정밀 프롬프트가 돌아온다',
      await evl(`[...document.querySelectorAll('p')].some(p => p.innerText === ${JSON.stringify(expect6c.promptKo)})`))

    /* ── 복사 단추 — 클립보드를 가로채 7구획 전체가 실제로 담기는지 잰다 ── */
    await evl(`(() => { window.__copied = null; try { navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve() } } catch { /* 무해 */ } return true })()`)
    await evl(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '복사')?.click()`)
    await sleep(400)
    const copied = await evl(`window.__copied`)
    const heads = ['■ 최종 프롬프트 (정밀판 · 한글)', '■ 최종 프롬프트 (정밀판 · 영문)', '■ 사용할 이미지 순서',
      '■ 영상 구성(장면별)', '■ 권장 길이', '■ 네거티브 프롬프트 (한글)', '■ 네거티브 프롬프트 (영문)',
      '■ 재현 설정', '■ 생성형 AI 플랫폼 안내']
    check('복사 — 일곱 구획 머리 전부 + 프롬프트 원문 + 장면 전부 + 고지가 한 문서로 담긴다',
      typeof copied === 'string' && heads.every((h) => copied.includes(h)) && copied.includes(expect6c.promptKo) && copied.includes(expect6c.promptEn)
      && (expect6c.scenes ?? []).every((s) => s.parts.every((p) => copied.includes(p.text))) && copied.includes(STUDIO_NOTICES.imagined)
      && copied.includes(STUDIO_NOTICES.periodGeneric) && copied.includes(STUDIO_NOTICES.reproNote),
      typeof copied === 'string' ? `${copied.length}자` : '클립보드 미포착')
    check('복사본에도 출처 라벨 머리 문자열이 함께 나간다',
      typeof copied === 'string' && copied.includes('[들려주신 이야기 — 적어 주신 말 그대로]') && copied.includes('[연출 설정 —'))
    check('복사 피드백 — 단추가 「복사되었습니다」로 바뀐다', await evl(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === '복사되었습니다')`))
    /* 기획서 증빙 — 산출 화면 캡처 */
    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      const p = path.join(root, '기획서-캡처/studio-output.png')
      fs.writeFileSync(p, Buffer.from(shot.data, 'base64'))
      check('스튜디오 산출 화면 캡처 저장', fs.statSync(p).size > 10000, path.relative(root, p))
    } catch { check('스튜디오 산출 화면 캡처 저장', false, '캡처 실패') }
  }

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
  const bukbtiPosts = []
  for (const ev of cdp.events) {
    if (ev.method === 'Network.requestWillBeSent') {
      const r = ev.params.request
      if (r.method !== 'POST') continue
      if (/supabase\.co\/rest\/v1\/pick_event/.test(r.url)) posts.push(r.postData ?? '')
      else if (/supabase\.co\/rest\/v1\/pick_balance_answer/.test(r.url)) balPosts.push(r.postData ?? '')
      else if (/supabase\.co\/rest\/v1\/bukbti_event/.test(r.url)) bukbtiPosts.push(r.postData ?? '')
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
  check(`북BTI 완성 전송 ${bukbtiPosts.length}건 — 본문이 type_code 1필드뿐(개인 식별·연결키 0)`,
    bukbtiPosts.length >= 1 && bodyFieldsOk(bukbtiPosts, ['type_code']), bukbtiPosts.length ? '' : '전송 미발생(네 게임 완주 후에는 1건이 있어야 한다)')

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
