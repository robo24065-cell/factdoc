// 관계망 검증 — 만든 걸 믿지 말고 재본다
//
// 세 가지를 묻는다.
//   ① pk 가 인물 안에서 시간순인가? → 맞으면 아직 안 받은 13,468건 날짜를 보간할 수 있다.
//      (전체 pk 는 시간순이 아님을 이미 확인했다. 인물 안에서는 배치 입력이라 다를 수 있다)
//   ② 알려진 숙청 4건의 마지막 기록일이 실제 소멸 시점과 맞는가? → 아이디어의 근거
//   ③ 간선이 헛것인가? — 무작위 표본을 원문 제목과 대조한다
//
//   node scripts/verify-nk-graph.mjs

import fs from 'node:fs'
import path from 'node:path'

const API = path.resolve('북한자료-api')
const read = f => JSON.parse(fs.readFileSync(path.join(API, f), 'utf8'))
const clean = s => String(s || '').replace(/，/g, ', ').replace(/\s+/g, ' ').trim()
const PERSON = /\[([^\[\]]+?)\s*동향\]/

const trend = read('nkinfoTrend.json').items
const dates = read('nkinfoTrendDates.json').dates
const graph = read('nk-graph.json')

let pass = 0, fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++ }

// ── 인물별 (pk, 날짜) 쌍 ────────────────────────────────────
const byPerson = new Map()
for (const r of trend) {
  const m = String(r.sj || '').match(PERSON); if (!m) continue
  const nm = m[1].trim()
  const d = String(dates[r._pk] || '').slice(0, 10)
  if (!/^\d{4}-/.test(d)) continue
  if (!byPerson.has(nm)) byPerson.set(nm, [])
  byPerson.get(nm).push({ pk: Number(r._pk), d, sj: clean(r.sj) })
}

console.log('═'.repeat(72))
console.log(` ① pk 가 인물 안에서 시간순인가  (날짜 확보 ${Object.keys(dates).length.toLocaleString()}건)`)
console.log('═'.repeat(72))

// 켄달 타우 — 같은 인물의 모든 (i,j) 쌍에서 pk 순서와 날짜 순서가 일치하는 비율
let conc = 0, disc = 0, usable = 0
for (const [, rows] of byPerson) {
  if (rows.length < 3) continue
  usable++
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const dp = Math.sign(rows[i].pk - rows[j].pk)
      const dd = Math.sign(rows[i].d.localeCompare(rows[j].d))
      if (!dp || !dd) continue
      dp === dd ? conc++ : disc++
    }
}
const tau = (conc - disc) / (conc + disc || 1)
console.log(`  비교 인물 ${usable}명 · 쌍 ${(conc + disc).toLocaleString()}개`)
console.log(`  일치 ${conc.toLocaleString()} · 역전 ${disc.toLocaleString()} · 켄달 타우 ${tau.toFixed(3)}`)
/* 보간 판단 — 통과/실패가 아니라 결정이다.
   역전율이 곧 보간 오류율이다. 6.7% 틀린 날짜로 '소멸 시점'을 주장할 수는 없다.
   기준을 0.95로 두는 이유: 566명 × 평균 26건에서 5% 역전이면 약 750건이 어긋난다. */
const errRate = disc / (conc + disc || 1)
console.log(`  → 보간 오류율 ${(errRate * 100).toFixed(1)}%  ${tau >= 0.95 ? '(보간 가능)' : '(보간 불가 — 전량 수집한다)'}`)

// 전체 pk 로도 같은 계산 — 대조군
let gc = 0, gd = 0
const flat = [...byPerson.values()].flat().slice(0, 900)
for (let i = 0; i < flat.length; i++)
  for (let j = i + 1; j < flat.length; j++) {
    const dp = Math.sign(flat[i].pk - flat[j].pk)
    const dd = Math.sign(flat[i].d.localeCompare(flat[j].d))
    if (!dp || !dd) continue
    dp === dd ? gc++ : gd++
  }
const gtau = (gc - gd) / (gc + gd || 1)
console.log(`  [대조군] 인물 구분 없이 전체: 타우 ${gtau.toFixed(3)}`)
ok(tau > gtau, `인물 안 순서가 전체 순서보다 시간을 잘 설명한다 (${tau.toFixed(3)} > ${gtau.toFixed(3)}) — 인물별 배치 입력 구조 확인`)

// ── ② 알려진 숙청 ──────────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log(' ② 마지막 기록일 vs 실제 소멸 시점')
console.log('═'.repeat(72))

/* ★ 우측 절단(right-censoring) — 이 검증의 전제다.
   인물동향 채록은 2001-02-18 ~ **2015-10-17** 에서 끝난다(실측, 14,468건).
   그 시점까지 활동 중이던 사람은 마지막 기록이 채록 종료일에 걸린다.
   그건 그 사람이 사라진 것이 아니라 **자료가 끝난 것**이다.
   실측: 566명 중 90명(16%)이 여기 해당한다. 김원홍(2015-10-10)·박봉주(2015-10-17)가 그 예로,
   실제로는 각각 2017년·2021년까지 활동했다.
   이들을 섞어 재면 방법이 틀린 것처럼 보인다 — 판정 모집단에서 제외해야 한다.
   판정 가능한 모집단은 채록 종료 이전에 기록이 끊긴 476명이다. */
const CORPUS_END = '2015-10-17'
const CENSOR_FROM = '2015-10'          // 이 달에 마지막 기록이 있으면 절단으로 본다

const KNOWN = [
  { n: '리영호', when: '2012-07-15', what: '총참모장 전격 해임' },
  { n: '장성택', when: '2013-12-08', what: '정치국 확대회의서 체포' },
  { n: '현영철', when: '2015-04-30', what: '처형 (국정원 발표 5.13)' },
  { n: '김경희', when: '2013-09-09', what: '공개활동 소멸' },
  { n: '김원홍', when: '2017-01-31', what: '보위상 해임' },
  { n: '박봉주', when: '2021-01-10', what: '8차 당대회 후 퇴진' },
]
let judged = 0, hitN = 0, censored = 0
for (const k of KNOWN) {
  const rows = (byPerson.get(k.n) || []).sort((a, b) => a.d.localeCompare(b.d))
  const allPk = trend.filter(r => (String(r.sj || '').match(PERSON) || [])[1]?.trim() === k.n).length
  const cov = allPk ? rows.length / allPk : 0
  /* ★ 커버리지 가드 — 마지막 기록일은 **전부 받은 뒤에만** 의미가 있다.
     수집이 pk 순으로 진행되므로 절반만 받은 상태의 '마지막'은 그냥 중간이다.
     실측 사고: 리영호를 10/132건만 받은 상태로 재서 -430일이 나왔는데,
     포털을 직접 열어 확인한 실제 마지막은 2012-07-15(차이 0일)였다. */
  if (cov < 0.8) {
    console.log(`  … ${k.n.padEnd(4)} ${rows.length}/${allPk}건(${(cov * 100).toFixed(0)}%) — 판정 보류, 80% 이상 필요`)
    continue
  }
  const last = rows.at(-1)
  if (last.d.slice(0, 7) >= CENSOR_FROM) {
    console.log(`  ⊘ ${k.n.padEnd(4)} 마지막 ${last.d} — 채록 종료(${CORPUS_END})에 걸림. 절단이므로 판정 제외`)
    console.log(`      (실제 ${k.when} ${k.what} — 채록이 끝난 뒤의 일이라 이 자료로는 알 수 없다)`)
    censored++
    continue
  }
  const gap = Math.round((new Date(last.d) - new Date(k.when)) / 86400000)
  const mark = Math.abs(gap) <= 60 ? '★' : ' '
  judged++; if (Math.abs(gap) <= 60) hitN++
  console.log(`  ${mark} ${k.n.padEnd(4)} 마지막 ${last.d} · 실제 ${k.when}(${k.what}) · 차이 ${gap > 0 ? '+' : ''}${gap}일  [${rows.length}/${allPk}건 확보]`)
}
console.log(`
  판정 ${judged}건 중 60일 이내 일치 ${hitN}건 · 절단으로 제외 ${censored}건`)
ok(judged > 0 && hitN === judged, `채록 기간 안에서 사라진 인물은 마지막 기록일이 실제 시점과 맞는다 (${hitN}/${judged})`)

// ── ③ 간선이 헛것인가 ──────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log(' ③ 간선 표본 대조 — 원문 제목에 두 이름이 실제로 함께 있는가')
console.log('═'.repeat(72))

const titles = trend.map(r => clean(r.sj))
const sample = graph.edges.filter(e => e.type === 'escort').slice(0, 200)
  .filter((_, i) => i % 17 === 0).slice(0, 8)
let good = 0
for (const e of sample) {
  const a = e.a.split(':')[1], b = e.b.split(':')[1]
  const hit = titles.find(t => t.includes(a) && t.includes(b) && /수행|동행/.test(t))
  if (hit) good++
  console.log(`  ${hit ? '✓' : '✗'} ${a}—${b} (w=${e.w})`)
  if (hit) console.log(`      "${hit.slice(0, 66)}"`)
}
ok(good === sample.length, `표본 ${sample.length}쌍 전부 원문에서 확인됨`)

// 자기참조·유령 노드
const nodeIds = new Set(graph.nodes.map(n => n.id))
const orphan = graph.edges.filter(e => !nodeIds.has(e.a) || !nodeIds.has(e.b))
ok(orphan.length === 0, `노드에 없는 간선 ${orphan.length}개`)
const selfLoop = graph.edges.filter(e => e.a === e.b)
ok(selfLoop.length === 0, `자기참조 간선 ${selfLoop.length}개`)
/* 마스터(721명)에 없다고 결함이 아니다 — 마스터는 현직 중심, 동향은 14년치다.
   실측: 미등재 244명 중 238명이 정상 한글 3자 이름(박근광 63건, 채춘희 20건 …).
   진짜 결함은 **인명이 아닌 것이 인물 노드가 되는 것**이다. 그걸 잰다. */
const persons = graph.nodes.filter(n => n.type === 'person')
const malformed = persons.filter(n => !/^[가-힣]{2,4}$/.test(n.name))
ok(malformed.length === 0,
   `인명 모양이 아닌 인물 노드 ${malformed.length}개${malformed.length ? ' — ' + malformed.slice(0, 3).map(x => x.name).join(', ') : ''}`)
console.log(`    (인물 ${persons.length}명 중 마스터 미등재 ${persons.filter(n => n.known === false).length}명 — 퇴장 인물이라 정상)`)

console.log('\n' + '═'.repeat(72))
console.log(` ${pass}/${pass + fail} 통과`)
console.log('═'.repeat(72))
process.exitCode = fail ? 1 : 0
