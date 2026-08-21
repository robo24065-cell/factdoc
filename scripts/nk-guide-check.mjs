#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   고향 안내인(nk-guide.mjs) 검증 하니스

   무엇을 재는가
     ① 규칙 계층 — 데이터 팩의 모든 지역(구 7 + 현행 13)에 대해
        buildGuideFacts → fallbackGuide 가 항상 2~4문장을 만들고,
        그 문장이 validateGuide(자기 사실 대조)를 통과하는지. LLM 4원칙 ④의 증거다.
     ② 폐기 규칙 — 만들어 낸 숫자·스키마 밖 출력·이모지가 정말 폐기되는지(음성 대조군).
     ③ (--llm) 실호출 — GUIDE_PROMPT 를 systemInstruction 으로 Gemini 를 실제로 불러
        원출력이 validateGuide 를 통과하는지. 키는 .gemini-keys.tmp.json(gitignore)에서
        읽고 **어떤 경로로도 출력하지 않는다.**

   사용
     node scripts/nk-guide-check.mjs            # 규칙 계층만 (네트워크 없음)
     node scripts/nk-guide-check.mjs --llm      # + Gemini 실호출 1건 (키 필요)

   나가는 값: 전부 통과 0, 실패 있으면 1.
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GUIDE_PROMPT, buildGuideFacts, fallbackGuide, validateGuide,
} from '../frontend/src/engine/nk-guide.mjs'
import { coverageEndOf } from '../frontend/src/engine/nk-search.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WITH_LLM = process.argv.includes('--llm')

const load = (n) =>
  JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/gohyang', n + '.json'), 'utf8'))
const pack = {
  map: load('map'), region: load('region'), isan: load('isan'),
  proj: load('projection'), museum: load('museum'), paths: load('paths'),
}
/* 화면(GuideBox)이 넣는 것과 같은 부가 사실 — 합산 계열의 확인 하한 + 비교 확정값 */
const extra = {
  eventsAsOf: coverageEndOf('timeline', 'briefing', 'nkinfoTrend'),
  analysis: load('analysis'),
}

let pass = 0, fail = 0
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.error(`  ✗ ${label}`) }
}

/* ── ① 규칙 계층 — 전 지역 ── */
console.log('▶ ① 규칙 계층 (전 지역, 네트워크 없음)')
const sels = [
  ...pack.map.regionsOld.map((o) => ({ mode: 'old', id: o.id, label: o.name })),
  ...Object.keys(pack.region.regions).map((k) => ({ mode: 'modern', key: k, label: k })),
]
let allGood = true
for (const s of sels) {
  /* extra 있음(화면 경로) · 없음(analysis 지연 fetch 전/실패 경로) 둘 다 항상 성립해야 한다 */
  for (const ex of [extra, null]) {
    const f = buildGuideFacts(s, pack, ex)
    const g = f && fallbackGuide(f)
    const valid = g && validateGuide(g, f)
    if (!f || !g || !valid || g.lines.length < 2 || g.lines.length > 4) {
      allGood = false
      console.error(`    실패: ${s.label}${ex ? ' (extra)' : ' (extra 없음)'}`)
      if (g) console.error('      ' + g.lines.join(' / '))
    }
  }
}
ok(allGood, `지역 ${sels.length}곳 전부 × extra 유/무 — facts 생성 · 규칙 문장 2~4줄 · 자기검증 통과`)
const maxLen = Math.max(...sels.map((s) => JSON.stringify(buildGuideFacts(s, pack, extra)).length))
ok(maxLen < 2000, `facts 최대 길이 ${maxLen}자 < 프록시 상한 2000자`)
const cmpAll = pack.map.regionsOld.every(
  (o) => buildGuideFacts({ mode: 'old', id: o.id }, pack, extra)?.compare != null,
)
ok(cmpAll, '구행정구역 7곳 전부 compare(순위·격차·극단) 적재')
const cmpLine = pack.map.regionsOld.every((o) => {
  const f = buildGuideFacts({ mode: 'old', id: o.id }, pack, extra)
  return fallbackGuide(f).lines.some((l) => /곳 가운데/.test(l))
})
ok(cmpLine, '규칙 문장에도 비교 문장(…곳 가운데)이 들어간다')

/* ── ② 폐기 규칙 — 음성 대조군 ── */
console.log('▶ ② 폐기 규칙 (스키마 밖이면 null 이어야 한다)')
const f = buildGuideFacts({ mode: 'old', id: 'hwanghae-old' }, pack, extra)
const N = { target: 'events', label: '기록 보기' }
ok(validateGuide({ lines: ['안내입니다.', '신청자는 9,999명입니다.'], next: N }, f) === null, '사실에 없는 숫자 → 폐기')
ok(validateGuide({ lines: ['a', 'b', 'c', 'd', 'e'], next: N }, f) === null, '5문장(스키마 밖) → 폐기')
ok(validateGuide({ lines: ['안내입니다.'], next: N }, f) === null, '1문장(스키마 밖) → 폐기')
ok(validateGuide({ lines: ['안내입니다.', '보십시오.'], next: { target: 'chat', label: 'x' } }, f) === null, '닫힌 target 밖 → 폐기')
ok(validateGuide({ lines: ['안내입니다 \u{1F338}', '보십시오.'], next: N }, f) === null, '이모지 → 폐기')
ok(validateGuide(null, f) === null, 'null → 폐기')
ok(validateGuide(fallbackGuide(f), f) !== null, '규칙 문장 자신 → 통과 (양성 대조군)')

/* ── ②-b 결합 검사 — 남의 축 기준일을 빌려 쓰면 폐기 (실측 사고의 재현) ── */
console.log('▶ ②-b 숫자-기준일 결합 (오귀속이면 null 이어야 한다)')
const svLine = `이곳이 고향인 생존 신청자는 ${f.survivors.n.toLocaleString('ko-KR')}명입니다(2026년 5월 기준).`
ok(
  validateGuide({ lines: [svLine, `기록물은 ${f.museum.total}건입니다(2026년 5월 31일 기준).`], next: N }, f) === null,
  '사료 건수에 생존 신청자의 기준일(2026-05-31) → 폐기 (수집일 2026-08-19 이어야 한다)',
)
ok(
  validateGuide({ lines: [svLine, `공식 기록에는 ${f.events.total.toLocaleString('ko-KR')}건 언급되어 있습니다(2026년 5월 31일 기준).`], next: N }, f) === null,
  '합산 기록 건수에 생존 신청자의 기준일 → 폐기 (합산값의 확인 하한과 다르다)',
)
ok(
  validateGuide({ lines: [svLine, `기록물은 ${f.museum.total}건입니다(2026년 8월 19일 수집 기준).`], next: N }, f) !== null,
  '사료 건수 + 수집일 → 통과 (양성 대조군)',
)
ok(
  validateGuide({ lines: [svLine, `공식 기록에는 ${f.events.total.toLocaleString('ko-KR')}건 언급되어 있습니다(여러 자료를 합친 값 · 2025년 10월까지 확인된 기준).`], next: N }, f) !== null,
  '합산 기록 + 확인 하한(2025-10) → 통과 (양성 대조군)',
)
ok(
  validateGuide({ lines: [svLine, '이 자료는 2020년 1월 기준으로 공표되었습니다.'], next: N }, f) === null,
  '어느 축에도 없는 기준일(2020-01) → 폐기',
)
const fNoAsOf = buildGuideFacts({ mode: 'old', id: 'hwanghae-old' }, pack) // extra 없음 → events.asOf null
ok(
  validateGuide({ lines: [`공식 기록 ${fNoAsOf.events.total.toLocaleString('ko-KR')}건이 있습니다(2025년 10월 기준).`, svLine], next: N }, fNoAsOf) === null,
  'events.asOf 가 null 이면 합산 건수에 어떤 날짜도 못 붙인다 → 폐기',
)

/* ── ②-c 축이 둘 이상인 문장 — 하나의 「기준」을 붙이면 폐기 (교집합 규칙) ──
   실측 사고 재현: 예전 pool(합집합) 규칙은 축이 둘이어도 그중 **하나**와만 맞으면 통과시켜,
   GUIDE_PROMPT 가 못박은 「기준일이 다른 수치들을 한 문장으로 묶지 마라」를 전혀 막지 못했다.
   아래 네 문장은 전부 실제로 통과했던 것들이다. */
console.log('▶ ②-c 축 혼합 문장 (한 문장 두 축이면 null 이어야 한다)')
const fHam = buildGuideFacts({ mode: 'old', id: 'hamgyong-n-old' }, pack, extra)
const A1 = `생존 신청자는 ${f.survivors.n.toLocaleString('ko-KR')}명이고 기록물은 ${f.museum.total}건입니다(2026년 5월 31일 기준).`
ok(validateGuide({ lines: ['안내입니다.', A1], next: N }, f) === null,
  '생존 신청자(2026-05) + 사료 건수(2026-08 수집)를 한 문장에 → 폐기')
const A2 = `기록물 ${f.museum.total}건과 공식 기록 ${f.compare.density.v ? f.events.total.toLocaleString('ko-KR') : ''}건이 남아 있습니다(2026년 8월 19일 수집 기준).`
ok(validateGuide({ lines: ['안내입니다.', A2], next: N }, f) === null,
  '사료 건수(수집일) + 합산 기록(확인 하한)을 한 문장에 → 폐기')
const A3 = `생존 신청자는 ${fHam.survivors.n.toLocaleString('ko-KR')}명, 북한이탈주민은 ${fHam.defector.total.toLocaleString('ko-KR')}명입니다(2026년 5월 31일 기준).`
ok(validateGuide({ lines: ['안내입니다.', A3], next: N }, fHam) === null,
  '생존 신청자(2026-05) + 탈북민(2020-03)을 한 문장에 → 폐기')
const C1 = `생존 신청자 평균 나이는 ${fHam.avgAge.v}세입니다(2026년 5월 31일 기준).`
ok(validateGuide({ lines: ['안내입니다.', C1], next: N }, fHam) === null,
  '평균 나이(2025-08)에 신청현황 기준일(2026-05) → 폐기 — 화면 S1 이 이 조합을 쓰고 있었다')
const C2 = `전체 생존 신청자는 ${f.aliveTotal.n.toLocaleString('ko-KR')}명이고 평균 나이는 ${f.avgAge.v}세입니다(2026년 5월 31일 기준).`
ok(validateGuide({ lines: ['안내입니다.', C2], next: N }, f) === null,
  '전체 생존 신청자(2026-05) + 평균 나이(2025-08)를 한 문장에 → 폐기')

/* ── ②-d compare 축 분리 — 탈북민 비중에는 탈북민 축의 날짜만 붙는다 ── */
console.log('▶ ②-d compare 축 분리 (이산가족 축 ≠ 탈북민 축)')
ok(
  validateGuide({ lines: ['안내입니다.', `이 고향 출신 북한이탈주민은 전체의 ${fHam.compare.maps.defectorPct}%입니다(2025년 8월 기준).`], next: N }, fHam) === null,
  '탈북민 비중에 이산가족 기준일(2025-08) → 폐기',
)
ok(
  validateGuide({ lines: ['안내입니다.', `탈북민 재북 출신 비중은 ${fHam.compare.maps.defectorPct}%입니다(2020년 3월 기준).`], next: N }, fHam) !== null,
  '탈북민 비중 + 탈북민 축 기준일(2020-03) → 통과 (양성 대조군)',
)
ok(
  validateGuide({ lines: ['안내입니다.', `이산가족 원적 비중은 ${fHam.compare.maps.isanPct}%이고 탈북민 비중은 ${fHam.compare.maps.defectorPct}%입니다(2025년 8월 기준).`], next: N }, fHam) === null,
  'compare 안에서도 축이 다른 두 값을 한 기준일로 묶으면 → 폐기',
)

/* ── ②-d2 밀도 축 — 분모·분자의 기준일이 달라 **어떤 기준일도 못 붙인다** ──
   실측 사고 재현(2026-08-21): 화면의 고향 안내인이
     「생존자 한 분당 남은 공식 기록은 0.14건으로 … 가장 적습니다(2025년 8월 기준).」
   라고 말했다. 그 0.14 의 분자 957건에는 2026-08-21 수집분 128건과 확인 하한 2026-08-11 의
   동향 426건이 들어 있다. 2025-08-31 은 **분모(생존자)의 날짜**일 뿐이다.
   카드 자신의 caveat 는 그 어긋남을 인정하는데 화면 문장만 그 사실을 지웠다 —
   이 프로젝트의 as-of 규약(숫자-기준일 결합)이 막으려던 바로 그 형태다. */
console.log('▶ ②-d2 밀도 축 (분모·분자 기준일이 달라 날짜 금지)')
const dHw = f.compare.density
ok(dHw.mixedAsOf === true && dHw.asOfDenominator === extra.analysis.cards.find(c => c.id === 'record-density-gap').asOfAxes.denominator.asOf,
  `밀도가 단일 기준일 없음으로 표시되고 분모의 기준일(${dHw.asOfDenominator})을 따로 갖는다`)
ok(
  validateGuide({ lines: ['안내입니다.', `생존자 한 분당 남은 공식 기록은 ${dHw.v}건으로 가장 적습니다(2025년 8월 기준).`], next: N }, f) === null,
  '밀도에 분모의 기준일(2025-08) → 폐기 — 화면이 실제로 쓰던 문장이다',
)
ok(
  validateGuide({ lines: ['안내입니다.', `생존자 한 분당 남은 공식 기록은 ${dHw.v}건입니다(2026년 8월 21일 수집 기준).`], next: N }, f) === null,
  '밀도에 신규 수집분의 수집일(2026-08-21) → 폐기 — 분자 한 계열의 날짜일 뿐이다',
)
ok(
  validateGuide({ lines: ['안내입니다.', `광복 당시 고향 ${f.compare.of}곳의 기록 격차는 ${dHw.gapX}배입니다(2025년 8월 기준).`], next: N }, f) === null,
  '격차 배수에 기준일 → 폐기 (밀도와 같은 축이다)',
)
/* 순위합은 한 자리 수일 때 축 판별에 쓸 수 없다(토큰 길이 2 이상만 쓴다 — 한 자리는 너무 흔하다).
   그래서 두 자리 순위합을 가진 고향으로 시험한다. 한 자리 고향에서는 이 조합이 통과할 수 있고,
   그것은 알고 있는 한계다 — 규칙 문장이 애초에 그런 문장을 만들지 않는 것으로 막는다(아래 마지막 시험). */
{
  const two = pack.map.regionsOld
    .map((o) => buildGuideFacts({ mode: 'old', id: o.id }, pack, extra))
    .find((g) => (g?.compare?.priority?.sum ?? 0) >= 10)
  ok(
    two != null
    && validateGuide({ lines: ['안내입니다.', `기록 우선순위의 순위합은 ${two.compare.priority.sum}입니다(2025년 8월 기준).`], next: N }, two) === null,
    `순위합(${two?.compare?.priority?.sum ?? '—'})에 기준일 → 폐기 (밀도 순위로 만든 값이라 같은 축이다)`,
  )
}
ok(
  validateGuide({ lines: ['안내입니다.', `생존자 한 분당 남은 공식 기록은 ${dHw.v}건으로 가장 적습니다. 분모는 2025년 8월 생존자 수이고, 분자는 계열마다 기준일이 다릅니다.`], next: N }, f) !== null,
  '수치 문장에 날짜 주장을 두지 않고 축을 밝히면 → 통과 (양성 대조군 · 규칙 문장이 쓰는 형태)',
)
ok(
  pack.map.regionsOld.every((o) => {
    const g = buildGuideFacts({ mode: 'old', id: o.id }, pack, extra)
    const line = fallbackGuide(g).lines.find((l) => /곳 가운데|순위합/.test(l)) ?? ''
    return !/기준\)/.test(line) && /분자는 계열마다 기준일이 다릅니다/.test(line)
  }),
  '규칙 문장의 비교 줄은 단일 기준일을 붙이지 않고 축이 다르다는 사실을 함께 적는다',
)

/* ── ②-e 발표되지 않은 순위를 만들지 않는다 ── */
console.log('▶ ②-e 순위 정책 (발표된 자리만 순위로)')
const pubOnly = pack.map.regionsOld.every((o) => {
  const g = buildGuideFacts({ mode: 'old', id: o.id }, pack, extra)
  const line = fallbackGuide(g).lines.find((l) => /곳 가운데/.test(l)) ?? ''
  /* 「N위」는 발표된 자리(1순위·2순위·가장 여유 있는 곳)가 아닌 곳에서 나오면 안 된다 */
  return !/\d+위/.test(line)
})
ok(pubOnly, '규칙 문장이 발표되지 않은 순위(3~6위)를 만들어 내지 않는다')
const sumNoted = pack.map.regionsOld.every((o) => {
  const g = buildGuideFacts({ mode: 'old', id: o.id }, pack, extra)
  const line = fallbackGuide(g).lines.find((l) => /순위합/.test(l))
  return !line || /점수가 아닙니다/.test(line)
})
ok(sumNoted, '순위합을 옮길 때는 「점수가 아닙니다」 caveat 가 반드시 붙는다')

/* ── ②-f 현행 행정구역을 골라도 어느 축의 값인지 밝힌다 ── */
console.log('▶ ②-f 축 표기 (현행 행정구역 → 광복 당시 구행정구역 축)')
const modernOk = Object.keys(pack.region.regions).every((k) => {
  const g = buildGuideFacts({ mode: 'modern', key: k }, pack, extra)
  if (!g || !g.originLabel || !g.survivors) return true
  return fallbackGuide(g).lines[0].includes(`광복 당시 ${g.originLabel} 기준으로만 공표됩니다`)
})
ok(modernOk, '현행 행정구역 안내는 첫 문장에서 공표 축(구행정구역)을 밝힌다')

/* ── ②-g 상봉 장소 사료를 감추지 않는다 ── */
console.log('▶ ②-g 사료 venue 분기')
const gGw = buildGuideFacts({ mode: 'old', id: 'gangwon-unrec' }, pack, extra)
const gwLine = fallbackGuide(gGw).lines.find((l) => /기록물/.test(l)) ?? ''
ok(
  gGw.museum.venue / gGw.museum.total >= 0.3 && /상봉 장소/.test(gwLine),
  `상봉 장소 비중이 큰 고향은 규칙 문장이 그 사실을 함께 적는다 (${gGw.museum.venue}/${gGw.museum.total})`,
)

/* ── ③ 실호출 (선택) ── */
if (WITH_LLM) {
  console.log('▶ ③ Gemini 실호출 — 프록시와 같은 프롬프트·같은 인자')
  let keys = []
  try { keys = JSON.parse(fs.readFileSync(path.join(root, '.gemini-keys.tmp.json'), 'utf8')) } catch { /* 아래에서 처리 */ }
  if (!Array.isArray(keys) || !keys.length) {
    console.error('  ✗ 키 파일 없음(.gemini-keys.tmp.json) — 실호출 생략')
    fail++
  } else {
    const MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash']
    const callOnce = async (facts) => {
      for (const m of MODELS) {
        for (let i = 0; i < Math.min(2, keys.length); i++) {
          try {
            const r = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(keys[i])}`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: GUIDE_PROMPT }] },
                  contents: [{ role: 'user', parts: [{ text: JSON.stringify(facts) }] }],
                  generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 800 },
                }),
                signal: AbortSignal.timeout(15000),
              },
            )
            if (!r.ok) continue
            const j = await r.json()
            const t = j?.candidates?.[0]?.content?.parts?.[0]?.text
            if (!t) continue
            return { raw: JSON.parse(t), used: m }
          } catch { /* 다음 조합 */ }
        }
      }
      return null
    }
    /* 세 성격의 지역: 밀도 최저(황해) · 상봉장소 사료+frozen(강원) · 이산-탈북 괴리 극단(함북) */
    const trial = [
      { mode: 'old', id: 'hwanghae-old', label: '황해도(구)' },
      { mode: 'old', id: 'gangwon-unrec', label: '미수복강원' },
      { mode: 'old', id: 'hamgyong-n-old', label: '함경북도(구)' },
    ]
    for (const s of trial) {
      const facts = buildGuideFacts(s, pack, extra)
      const got = await callOnce(facts)
      if (!got) {
        console.error(`  ✗ ${s.label} — 전 모델 실패 (화면은 이때 규칙 문장으로 동작한다)`)
        fail++
        continue
      }
      const v = validateGuide(got.raw, facts)
      console.log(`  ── ${s.label} · 모델 ${got.used}`)
      for (const l of got.raw?.lines ?? []) console.log(`     ${l}`)
      console.log(`     next=${got.raw?.next?.target} 「${got.raw?.next?.label}」`)
      ok(v !== null, `${s.label} — LLM 원출력이 validateGuide 통과 (수치·기준일 결합 포함)`)
      const hasCompare = (got.raw?.lines ?? []).some((l) => /곳|순위|위|가장|비중|배/.test(l))
      ok(hasCompare, `${s.label} — 비교·순위 문장이 실제로 있다`)
    }
  }
} else {
  console.log('▶ ③ 실호출 생략 (--llm 플래그 없음) — 이 경로가 죽어도 화면은 ①로 동작한다')
}

console.log(`\n${fail === 0 ? '✓ 통과' : '✗ 실패'} — ${pass}건 통과 · ${fail}건 실패`)

/* 실적을 파일로 남긴다 — 기획서가 「고향 안내인 N/N」을 손으로 적다가 실제 실행 결과와
   어긋났다(29 로 적혀 있었고 실측은 36 이었다). 이제 문서가 이 파일에서 값을 가져온다. */
fs.writeFileSync(
  path.join(root, '북한자료-api', 'guide-check.json'),
  JSON.stringify({ ranAt: new Date().toISOString().slice(0, 10), passed: pass, failed: fail, total: pass + fail }, null, 2) + '\n',
  'utf8',
)
/* fetch 직후 process.exit() 는 Windows 에서 libuv 종료 어서션을 낸다(실측) — exitCode 로 둔다 */
process.exitCode = fail === 0 ? 0 : 1
