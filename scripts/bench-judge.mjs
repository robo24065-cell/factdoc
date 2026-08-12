// 리랭킹·의도분류 벤치마크 — 규칙만 vs LLM 포함을 나란히 잰다
//
// 왜 이 파일이 따로 필요한가: eval/wild 는 규칙 계층의 회귀를 지킨다(네트워크 없이 돈다).
// 이 벤치는 **LLM 계층이 실제로 값을 더하는지**를 잰다. 값을 더하지 못하면 넣을 이유가 없다.
//
// 질문 세트를 만들 때의 원칙 — 사용자 지시:
//   "너가 짠 로직을 알잖아. 그에 맞춘 문장을 넣지말고 의미는 같되 여러 표현법,
//    또는 사람이 타이핑하며 맞춤법이 살짝 달라지는등, 서술어의 차이 등등"
//   → 아래 질문은 **내가 정규식에 넣지 않은 표현**으로만 썼다.
//     정규식을 자기 자신으로 시험하면 언제나 100%가 나온다. 그건 측정이 아니다.
//
//   node scripts/bench-judge.mjs           전체
//   node scripts/bench-judge.mjs --rules   LLM 없이 규칙만 (대조군)

import fs from 'node:fs'
import { buildIndex, answer, answerAsync } from '../frontend/src/engine/nk-search.mjs'
import * as LLM from '../frontend/src/engine/nk-llm.mjs'

const RULES_ONLY = process.argv.includes('--rules')

// ── 키 ──────────────────────────────────────────────────────
let keys = []
try {
  const j = JSON.parse(fs.readFileSync('.gemini-keys.tmp.json', 'utf8'))
  keys = Array.isArray(j) ? j : (j.keys || Object.values(j).flat())
} catch { /* 아래에서 api.txt 시도 */ }
if (!keys.length) {
  try { keys = [...fs.readFileSync('api.txt', 'utf8').matchAll(/AIza[0-9A-Za-z_-]{35}/g)].map(m => m[0]) } catch { /* 없으면 규칙만 */ }
}
LLM.setKeys(keys)

const data = JSON.parse(fs.readFileSync('frontend/src/data/nk-index.json', 'utf8'))
const GP = '북한자료-api/nk-graph.json'
if (fs.existsSync(GP)) data.graph = JSON.parse(fs.readFileSync(GP, 'utf8'))
const LP = '북한자료-api/nk-lexicon.json'
if (fs.existsSync(LP)) data.lexicon = JSON.parse(fs.readFileSync(LP, 'utf8'))
const ix = buildIndex(data)

/* ── 질문 세트 ──────────────────────────────────────────────
   want 는 '무엇이 나와야 하는가'가 아니라 '무엇이 나오면 안 되는가'를 함께 건다. */
const CASES = [
  // ① 동음이의어 — 낱말은 같고 뜻이 다르다. 근거가 붙으면 실패.
  { g: '동음이의', q: '안녕하세요 북한말로?', want: 'noEvidence' },
  { g: '동음이의', q: '오징어를 북에서는 뭐라 그러나', want: 'noEvidence' },
  { g: '동음이의', q: '이거 북한식으로 하면 어떻게 말해', want: 'noEvidence' },
  { g: '동음이의', q: '북에서 쓰는 말 알려줘', want: 'noEvidence' },

  // ② 관계 — 내가 REL_ASK 에 넣지 않은 표현들
  { g: '관계-윗선', q: '장성택 상관이 누구야', want: 'relation', subj: '장성택', dir: 'up' },
  { g: '관계-윗선', q: '장성택 누구 밑에 있었어', want: 'relation', subj: '장성택', dir: 'up' },
  { g: '관계-윗선', q: '장성택 윗선이 누구', want: 'relation', subj: '장성택', dir: 'up' },
  /* "황병서 모신 사람" 은 한국어에서 '황병서를 모신 사람'(아랫선)으로 읽히는 게 자연스럽다.
     내가 처음에 윗선으로 기대했는데 그건 **내 기대가 틀린 것**이었다 — 분류기는 down 을 냈고
     그게 맞다. 윗선을 묻는 표현은 아래처럼 분명한 것으로 따로 건다. */
  { g: '관계-윗선', q: '황병서는 누구를 모셨어', want: 'relation', subj: '황병서', dir: 'up' },
  { g: '관계-윗선', q: '김여정 누구 따라다녀', want: 'relation', subj: '김여정', dir: 'up' },
  { g: '관계-아랫선', q: '김정은 심복이 누구야', want: 'relation', subj: '김정은', dir: 'down' },
  { g: '관계-아랫선', q: '김정은 오른팔', want: 'relation', subj: '김정은', dir: 'down' },
  { g: '관계-아랫선', q: '김정은 데리고 다니는 사람', want: 'relation', subj: '김정은', dir: 'down' },
  { g: '관계-아랫선', q: '김정은이랑 붙어다니는 사람', want: 'relation', subj: '김정은' },
  { g: '관계-아랫선', q: '김정은 핵심 인물들', want: 'relation', subj: '김정은' },
  { g: '관계-쌍', q: '최룡해하고 장성택 엮인적 있나', want: 'relation' },

  // ③ 오타·띄어쓰기 붕괴 — 뜻은 같다
  { g: '오타', q: '장성택 누구랑 댕겼어', want: 'relation', subj: '장성택' },
  { g: '오타', q: '김정읁 측근', want: 'any' },
  { g: '오타', q: '장성택누구랑다녔어', want: 'relation', subj: '장성택' },

  // ④ 관계가 **아닌데** 인물 이름이 있는 질문 — 관계 카드가 붙으면 과잉주장
  { g: '비관계', q: '김여정 나이가 몇이야', want: 'noRelation' },
  { g: '비관계', q: '장성택 언제 처형됐지', want: 'noRelation' },
  { g: '비관계', q: '김정은 몇 년생이야', want: 'noRelation' },

  // ⑤ 정상 질문 — 리랭킹이 멀쩡한 답까지 지우면 안 된다(과잉회피 감시)
  { g: '정상', q: '개성공단 아직 하냐', want: 'evidence' },
  { g: '정상', q: '탈북민 몇 명이야', want: 'evidence' },
  { g: '정상', q: '북한 핵실험 몇 번 했어', want: 'evidence' },
  { g: '정상', q: '금강산 관광객 얼마나 갔었어', want: 'evidence' },
  { g: '정상', q: '2018년에 남북관계 무슨 일 있었어', want: 'evidence' },
  { g: '정상', q: '북한 요즘 뭐함', want: 'evidence' },

  /* ⑥ 열린 질문 — 특정 사실을 콕 집지 않는다. 리랭커가 '주제만 겹침'으로 전부 지우면
     빈손이 되는데, 자료는 실제로 있다. 이 프로젝트가 갈아엎은 실패가 정확히 그것이다. */
  { g: '열린질문', q: '북한 최근 어떰', want: 'evidence' },
  { g: '열린질문', q: '북한에 무슨 일 있어', want: 'evidence' },
  { g: '열린질문', q: '요즘 북한 어떻게 돌아가', want: 'evidence' },
  { g: '열린질문', q: '북한 소식 좀', want: 'evidence' },
]

const hasEvidence = a => (a.groups?.length ?? 0) > 0 || (a.items?.length ?? 0) > 0 || !!a.agg
/* '근거가 있다'와 '근거라고 부를 수 있다'는 다르다.
   weakMatch 면 화면은 "핵심어에 걸리는 공식 자료를 찾지 못했습니다 — 아래는 참고"라고 쓴다.
   그걸 통과로 세면 리랭커가 다 지워도 벤치가 초록이 된다(실제로 그랬다).
   과잉회피 감시는 **화면에 답으로 보이는가**로 판정해야 한다. */
/* genericOnly(주제 미지정)와 weakMatch(지정했는데 없음)를 구분한다.
   "북한 요즘 뭐함" 은 리랭커와 무관하게 원래부터 genericOnly 다 — 변별 어휘가 없는 질의라
   참고로 표시하는 것이 설계대로다. 그걸 실패로 세면 멀쩡한 동작을 고치려 들게 된다.
   막아야 할 것은 **지정했는데 못 찾았다고 하는 경우**(weakMatch)와 빈손이다. */
const hasRealEvidence = a => hasEvidence(a) && !(a.Q?.weakMatch && !a.Q?.genericOnly)
function judge(c, a) {
  switch (c.want) {
    case 'noEvidence': return !hasEvidence(a)
    case 'evidence': return hasRealEvidence(a)
    case 'relation': return !!a.relation &&
      (!c.subj || a.relation.subject === c.subj) &&
      (!c.dir || a.relation.kind === 'pair' || a.relation.lead === (c.dir === 'up' ? 'serves' : 'served'))
    case 'noRelation': return !a.relation
    default: return true
  }
}

const run = async () => {
  const rows = []
  for (const c of CASES) {
    const t0 = Date.now()
    let a
    if (RULES_ONLY || !keys.length) a = answer(ix, c.q)
    else { try { a = await answerAsync(ix, c.q, { llm: LLM.llmAdapter }) } catch { a = answer(ix, c.q) } }
    rows.push({ c, a, ok: judge(c, a), ms: Date.now() - t0 })
  }

  const mode = (RULES_ONLY || !keys.length) ? '규칙만' : `LLM 포함 (키 ${keys.length}개)`
  console.log('═'.repeat(76))
  console.log(` 리랭킹·의도분류 벤치 — ${mode}`)
  console.log('═'.repeat(76))

  const groups = [...new Set(CASES.map(c => c.g))]
  for (const g of groups) {
    const rs = rows.filter(r => r.c.g === g)
    const ok = rs.filter(r => r.ok).length
    console.log(`\n${g}  ${ok}/${rs.length}`)
    for (const r of rs) {
      const mark = r.ok ? '✓' : '✗'
      const rel = r.a.relation ? `관계=${r.a.relation.subject}/${r.a.relation.lead ?? r.a.relation.kind}` : '관계없음'
      const ev = hasEvidence(r.a) ? `근거${r.a.groups?.length ?? 0}종` : '근거없음'
      const llm = (r.a.llmUsed || []).join('+') || '-'
      console.log(`  ${mark} ${r.c.q.padEnd(26)} ${String(r.a.level).padEnd(15)} ${ev.padEnd(8)} ${rel.padEnd(22)} ${llm}`)
    }
  }

  const ok = rows.filter(r => r.ok).length
  const ms = rows.map(r => r.ms).sort((a, b) => a - b)
  console.log('\n' + '═'.repeat(76))
  console.log(` 합계 ${ok}/${rows.length} (${(ok / rows.length * 100).toFixed(0)}%)`)
  console.log(` 지연 중앙값 ${ms[Math.floor(ms.length / 2)]}ms · 최대 ${ms.at(-1)}ms`)
  console.log('═'.repeat(76))
  process.exitCode = ok === rows.length ? 0 : 1
}
run()
