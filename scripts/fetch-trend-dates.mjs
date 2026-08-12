// 북한정보포털 동향 — 등록일 취득
//
// 왜 필요한가: API #111(통합검색)이 주는 동향 42,813건에는 **날짜 필드가 없다.**
//   그런데 같은 응답의 url 이 가리키는 포털 상세페이지에는 `등록일`이 찍혀 있다.
//   pk 순서로 날짜를 추정하는 방법은 쓸 수 없다 — 이 구간은 인물별 배치 입력이라
//   pk 가 시간순이 아니다(실증: pk 109,506 이 김정일 사망 이후 번호인데 내용은 3월).
//   추정이 아니라 **취득**해야 한다.
//
// 무엇을 얻는가: `[인물명 동향]` 14,468건(566명, pk 104,315~121,809)에 날짜가 붙으면
//   김정일 사망(2011-12) → 김정은 권력 공고화 4년 10개월의 엘리트 수행 일지가 된다.
//   직접 확인한 것 — 리영호 2012-07-15(해임 당일) · 장성택 2013-12-07(실각 1일 전)
//   · 김경희 2013-09-09(소멸 시점) · 현영철 2015-04-25(처형 ~5일 전).
//   통일부가 인물별로 채록을 끊은 날이 그 인물이 사라진 날이다.
//
//   node scripts/fetch-trend-dates.mjs            인물동향 전량 (기본)
//   node scripts/fetch-trend-dates.mjs --all      42,813건 전량
//   node scripts/fetch-trend-dates.mjs --last     인물별 마지막 1건만 (566건, 빠른 확인용)
//
// 재개 가능: 200건마다 저장한다. 4.6시간짜리라 중단은 예외가 아니라 전제다.
// 공공 서버 예의: 기본 간격 800ms, 실패 시 지수 백오프, 연속 실패 20회면 중단.

import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('북한자료-api/nkinfoTrend.json')
const OUT = path.resolve('북한자료-api/nkinfoTrendDates.json')
const BASE = 'https://nkinfo.unikorea.go.kr/nkp/trend/view.do'
const H = { 'user-agent': 'Mozilla/5.0 (compatible; sasilon-research/1.0)' }

const GAP = Number(process.env.NK_GAP || 800)
const SAVE_EVERY = 50
const argv = process.argv.slice(2)
const MODE = argv.includes('--all') ? 'all' : argv.includes('--last') ? 'last' : 'person'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const PERSON = /\[([^\]]+?)\s*동향\]/

const items = JSON.parse(fs.readFileSync(SRC, 'utf8')).items
const persons = items.filter(x => PERSON.test(x.sj || ''))

let targets
if (MODE === 'all') targets = items
else if (MODE === 'person') targets = persons
else {
  // 인물별 마지막(=최대 pk) 1건만
  const byName = new Map()
  for (const x of persons) {
    const n = (x.sj.match(PERSON) || [])[1].trim()
    const pk = Number(x._pk)
    if (!byName.has(n) || pk > Number(byName.get(n)._pk)) byName.set(n, x)
  }
  targets = [...byName.values()]
}

const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { dates: {}, failed: {} }
store.dates ||= {}; store.failed ||= {}

const todo = targets.filter(x => !store.dates[x._pk])
console.log(`모드 ${MODE} · 대상 ${targets.length.toLocaleString()}건 · 이미 확보 ${Object.keys(store.dates).length.toLocaleString()}건`)
console.log(`남은 ${todo.length.toLocaleString()}건 · 예상 ${(todo.length * (GAP + 350) / 3600000).toFixed(1)}시간`)
console.log('─'.repeat(72))

const save = () => fs.writeFileSync(OUT, JSON.stringify(store), 'utf8')

/* 상세페이지에서 등록일·보도일을 뽑는다.
   등록일 = 연월일 (통일부가 채록한 날) · 보도일 = 월.일 + 매체 (연도가 없다 — 통일부도 안 붙인다) */
function parse(html) {
  const s = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  const reg = s.match(/등록일\s*:?\s*(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/)
  const rep = s.match(/보도일\s*:?\s*([\d.]+)\s*\(([^)]{1,30})\)/)
  return {
    reg: reg ? `${reg[1]}-${String(reg[2]).padStart(2, '0')}-${String(reg[3]).padStart(2, '0')}` : null,
    rep: rep ? rep[1].replace(/\.$/, '') : null,
    src: rep ? rep[2].trim() : null,
  }
}

let done = 0, ok = 0, miss = 0, streak = 0
const t0 = Date.now()

for (const x of todo) {
  const pk = x._pk
  let got = null
  for (let a = 0; a < 3 && !got; a++) {
    if (a) await sleep(2000 * 2 ** a)
    try {
      const r = await fetch(`${BASE}?trendMngNo=${pk}&menuId=MENU_395`, { headers: H, signal: AbortSignal.timeout(30000) })
      if (r.status === 200) got = parse(await r.text())
    } catch { /* 다음 시도 */ }
  }
  done++
  if (got?.reg) {
    store.dates[pk] = got.reg + (got.rep ? `|${got.rep}|${got.src || ''}` : '')
    ok++; streak = 0
  } else {
    store.failed[pk] = (store.failed[pk] || 0) + 1
    miss++; streak++
    if (streak >= 20) { console.log('\n연속 실패 20회 — 중단한다. 서버 상태를 확인하고 다시 실행하면 이어받는다.'); break }
  }

  if (done % SAVE_EVERY === 0) {
    save()
    const el = (Date.now() - t0) / 1000
    const rate = done / el
    const eta = (todo.length - done) / rate / 60
    process.stdout.write(`\r  ${done.toLocaleString()}/${todo.length.toLocaleString()} · 성공 ${ok.toLocaleString()} · 실패 ${miss} · ${rate.toFixed(1)}건/s · 남은 ${eta.toFixed(0)}분   `)
  }
  await sleep(GAP)
}

save()
console.log(`\n${'─'.repeat(72)}`)
console.log(` 확보 ${Object.keys(store.dates).length.toLocaleString()}건 · 이번 실행 성공 ${ok.toLocaleString()} / 실패 ${miss}`)
console.log(` 소요 ${((Date.now() - t0) / 60000).toFixed(1)}분 · 출력 ${OUT}`)

// 날짜가 붙은 결과를 바로 요약해 보여준다 — 4시간 기다린 뒤에야 결과를 아는 건 낭비다
const ds = Object.values(store.dates).map(v => String(v).slice(0, 10)).filter(d => /^\d{4}-/.test(d)).sort()
if (ds.length) console.log(` 기간 ${ds[0]} ~ ${ds.at(-1)}`)
