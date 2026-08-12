// 어휘 계층 — "안녕하세요 북한말로?" 에 답하기 위한 자료를 만든다
//
// 왜 별도 계층인가: 이건 **문서 검색으로 풀 수 있는 질문이 아니다.**
//   낱말 하나를 묻는데 BM25 로 문서를 찾으면 「인민의 안녕」 같은 동음이의어에 걸린다.
//   필요한 것은 문서가 아니라 **대응어 사전**이다.
//
// 두 자료를 합친다 (2026-08-12 재수집 — 이전 db_error 는 복구됨)
//   ① 남북한 언어비교 wordCmp  21,985쌍 · koword(남) ↔ nkword(북)
//      → "도시락 → 곽밥/밥곽", "주스 → 과실단물/과즙수". 남↔북 대응이 구조적으로 들어 있다.
//   ② 북한 용어사전 lexicon   177,684건 · word + 설명
//      → 대응어는 없고 뜻풀이가 있다. "X가 무슨 뜻이야" 를 담당한다.
//   둘 다 필요하다. ①은 '뭐라고 부르나', ②는 '무슨 뜻인가' 를 답한다.
//
// ⚠ 없는 것을 있다고 하지 않는다. "안녕하세요" 는 이 자료에 **없다** —
//   남북 표기가 같아서 대응어 목록에 오르지 않은 것이다. 그때는 그렇게 말한다.
//
//   node scripts/build-nk-lexicon.mjs
//   → 북한자료-api/nk-lexicon.json

import fs from 'node:fs'
import path from 'node:path'

const API = path.resolve('북한자료-api')
const OUT = path.join(API, 'nk-lexicon.json')
const read = f => {
  const p = path.join(API, f)
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim()

// ── ① 남북 대응어 ───────────────────────────────────────────
const cmpRaw = read('wordCmp.json')
const pairs = []
const seenPair = new Set()
let dropped = 0
for (const r of cmpRaw?.items ?? []) {
  const ko = clean(r.koword), nk = clean(r.nkword)
  if (!ko || !nk) { dropped++; continue }
  /* 자료에 'test → test' 같은 시험 데이터가 섞여 있다(실측). 걸러낸다.
     남북이 완전히 같은 항목도 뺀다 — '대응어'로서 정보가 없다. */
  if (ko === nk) { dropped++; continue }
  if (/^[a-zA-Z]+$/.test(ko) && ko.toLowerCase() === 'test') { dropped++; continue }
  const k = ko + '|' + nk
  if (seenPair.has(k)) { dropped++; continue }
  seenPair.add(k)
  pairs.push([ko, nk])
}

// ── ② 용어 뜻풀이 ───────────────────────────────────────────
const lexRaw = read('lexicon.json')
const DEF_MAX = 220          // 화면에 보여줄 만큼만. 전량을 웹에 실을 수 없다.
const terms = []
const seenTerm = new Set()
for (const r of lexRaw?.items ?? []) {
  /* word 필드에 '\n단어\n뜻풀이…' 형태로 붙어 오는 행이 있다(실측).
     첫 줄을 표제어로, 나머지를 뜻풀이로 가른다. */
  const raw = String(r.word ?? '')
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const head = clean(lines[0] ?? '')
  const restFromWord = lines.slice(1).join(' ')
  const body = clean(r.descript ?? r.cn ?? r.expln ?? restFromWord)
  if (!head || head.length > 40) continue
  const key = head + '|' + (r.catgory ?? '')
  if (seenTerm.has(key)) continue
  seenTerm.add(key)
  terms.push([head, body.slice(0, DEF_MAX), clean(r.catgory ?? '')])
}

// ── 출력 ────────────────────────────────────────────────────
const out = {
  builtAt: new Date().toISOString().slice(0, 10),
  source: {
    pairs: { name: '남북한 언어비교', provider: '통일부', id: '15151340',
      url: 'https://www.data.go.kr/data/15151340/openapi.do' },
    terms: { name: '북한 용어사전', provider: '통일부', id: '15151324',
      url: 'https://www.data.go.kr/data/15151324/openapi.do' },
  },
  /* 배열의 배열로 싣는다 — 키 이름을 2만 번 반복할 이유가 없다.
     pairs: [남, 북] · terms: [표제어, 뜻풀이, 분류] */
  pairs,
  terms,
}
fs.writeFileSync(OUT, JSON.stringify(out), 'utf8')

const mb = n => (n / 1048576).toFixed(2) + ' MB'
console.log('═'.repeat(72))
console.log(` 남북 대응어 ${pairs.length.toLocaleString()}쌍   (원본 ${(cmpRaw?.items?.length ?? 0).toLocaleString()} · 제외 ${dropped.toLocaleString()})`)
console.log(` 용어 뜻풀이 ${terms.length.toLocaleString()}건   (원본 ${(lexRaw?.items?.length ?? 0).toLocaleString()})`)
console.log(` 크기 ${mb(fs.statSync(OUT).size)} · ${OUT}`)
console.log('═'.repeat(72))
if (!lexRaw) console.log('⚠ lexicon.json 없음 — node scripts/fetch-mou-api.mjs lexicon 을 먼저 돌리면 뜻풀이가 붙는다')

console.log('\n대응어 표본 10')
for (const [ko, nk] of pairs.slice(0, 10)) console.log(`  ${ko.padEnd(14)} → ${nk}`)
console.log('\n찾아보기 (이 서비스가 실제로 받을 질문들)')
for (const w of ['도시락', '주스', '오징어', '안녕하세요', '화장실', '아이스크림']) {
  const hit = pairs.filter(([ko, nk]) => ko === w || nk === w)
  console.log(`  ${w.padEnd(12)} ${hit.length ? hit.map(([k, n]) => `${k}→${n}`).join(' · ') : '※ 대응어 목록에 없음(표기가 같거나 미등재)'}`)
}
