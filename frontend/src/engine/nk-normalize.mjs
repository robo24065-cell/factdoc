// 중간계층 — 자유 질의를 닫힌 스키마로 정규화
//
// 문제: 같은 뜻인데 표현이 무한하다.
//   "몇 명이야" / "몇 분이나 되나요" / "얼마나 넘어왔대" / "규모가 어느 정도"
//   "이틀" / "2일" / "사흘째"
//   규칙으로 전부 덮으면 사전이 무한히 늘고, 못 덮으면 "자료 없음"이 뜬다.
//
// 해결: 규칙이 빠르게 잡을 수 있는 건 규칙이 잡고(무료·결정론),
//       못 잡은 것만 LLM이 '닫힌 스키마'로 번역한다.
//       LLM은 해석만 하고 판정하지 않는다 — 출력이 스키마 밖이면 폐기.

export const QUERY_SCHEMA = {
  intent:    ['lookup', 'compare', 'timeline', 'claim_check', 'definition', 'unknown'],
  aggregate: ['none', 'sum', 'max', 'min', 'latest', 'distribution'],
  dimension: ['연령대', '성별', '출신지역', '학력', '직업', '연도', '월', '품목', '유형'],
}

// ── 규칙 계층 (빠른 경로) ───────────────────────────────────
const RULES = {
  // 성별 분해
  성별: [
    [/여자|여성|여자분|여성분|여성들|여자들/, '여'],
    [/남자|남성|남자분|남성분|남성들|남자들/, '남'],
  ],
  // 집계 의도
  aggregate: [
    [/총|전체|합쳐|합해|모두\s*합|다\s*해서|통틀어/, 'sum'],
    [/가장\s*많|제일\s*많|최다|최대|최고/, 'max'],
    [/가장\s*적|제일\s*적|최소|최저/, 'min'],
    [/분포|비율|구성|어느\s*쪽이|더\s*많|많은\s*편|경향/, 'distribution'],
    [/최신|마지막|현재/, 'latest'],
  ],
  // 차원 지목
  dimension: [
    [/나이|연령|나이대|연령대|고령|젊은|어린|노인/, '연령대'],
    [/남자|여자|성별|남녀/, '성별'],
    [/출신|지역|어디\s*출신|고향/, '출신지역'],
    [/학력|공부|대학|고졸/, '학력'],
    [/직업|무슨\s*일/, '직업'],
  ],
}

// 수량을 묻는 다양한 표현 — '명'을 안 써도 인원 질의로 인식
const QUANT_PHRASE =
  /몇\s*(명|분|사람|번|건|개|곳|회|차례|가지)?|얼마(나|였|입니까|인가|정도)?|어느\s*정도|규모가|어느\s*만큼|얼마만큼|몇이나/
const PERSON_HINT = /명|분|사람|인원|넘어온|넘어오신|입국|들어온|온\s*사람/

export function normalizeByRule(q) {
  const out = { intent: 'unknown', aggregate: 'none', dims: {}, dimensionAsked: null,
    unitFamily: null, resolvedBy: 'rule', confidence: 0 }
  let hits = 0

  /* 남·여를 함께 물으면(‘남자 여자가 몇 명이야’, ‘남녀 각각’) 한쪽만 골라 합산하면 안 된다.
     먼저 걸린 규칙이 이겨 '여자만 24,147명'을 전체인 양 내놓던 자리다. → 성별 지정 없음(전체)으로 둔다. */
  const askedF = /여자|여성|여자분|여성분|여성들|여자들/.test(q)
  const askedM = /남자|남성|남자분|남성분|남성들|남자들/.test(q)
  if (askedF && askedM) { out.dimensionAsked = '성별'; hits++ }
  else for (const [re, v] of RULES.성별) if (re.test(q)) { out.dims.성별 = v; hits++; break }
  for (const [re, v] of RULES.aggregate) if (re.test(q)) { out.aggregate = v; hits++; break }
  for (const [re, v] of RULES.dimension) if (re.test(q)) { out.dimensionAsked = v; hits++; break }

  if (QUANT_PHRASE.test(q)) { out.intent = 'lookup'; hits++ }
  if (PERSON_HINT.test(q)) { out.unitFamily = 'person'; hits++ }
  if (/뭐\s*했|무슨\s*일|동향|근황|행보|나열|목록/.test(q)) { out.intent = 'timeline'; hits++ }
  if (/다며|맞아|사실이야|사실인가|진짜야|라던데|카더라/.test(q)) { out.intent = 'claim_check'; hits++ }
  if (/뭐야|무슨\s*뜻|의미|정의|어떤\s*거/.test(q)) { out.intent = 'definition'; hits++ }

  // 분포 질의는 차원 없이 성립하지 않음 → 차원 미지정이면 연령대 기본값 금지(추측 방지)
  if (out.aggregate === 'distribution' && !out.dimensionAsked) out.aggregate = 'none'

  out.confidence = Math.min(1, hits / 3)
  return out
}

// ── LLM 계층 (규칙이 못 잡은 것만) ──────────────────────────
export const LLM_NORMALIZE_PROMPT = `너는 질의 정규화기다. 사용자 질문을 아래 닫힌 스키마로만 번역한다.
사실 판단·추론·답변 생성을 하지 마라. 질문이 무엇을 요구하는지만 분류한다.

intent:    lookup(수치·사실 조회) | compare(비교) | timeline(연혁 나열) | claim_check(진위 확인) | definition(용어 뜻) | unknown
aggregate: none | sum(합계) | max | min | latest | distribution(분포·구성비)
dims:      {"성별":"남|여|전체"} 또는 {"연령대":"..."} 등. 지목 없으면 {}
dimensionAsked: 연령대 | 성별 | 출신지역 | 학력 | 직업 | 연도 | 월 | null
unitFamily: person(사람 수) | count(건수·개수) | money | ratio | null

규칙:
- 스키마에 없는 값을 만들지 마라. 모르면 null 또는 unknown.
- "몇 분이나 되나요" = person 수 조회, "이틀" = 2일 처럼 표현만 정규화한다.
- 질문에 없는 차원을 추측해 넣지 마라.
JSON만 출력.

예시:
"넘어오신 분이 몇 분이나 되나요" → {"intent":"lookup","aggregate":"sum","dims":{},"dimensionAsked":null,"unitFamily":"person"}
"여자가 몇 명이야"               → {"intent":"lookup","aggregate":"sum","dims":{"성별":"여"},"dimensionAsked":null,"unitFamily":"person"}
"탈북은 나이 많은 사람이 더 많다며" → {"intent":"claim_check","aggregate":"distribution","dims":{},"dimensionAsked":"연령대","unitFamily":"person"}`

export function needsLLMNormalize(ruleResult) {
  return ruleResult.confidence < 0.34 || ruleResult.intent === 'unknown'
}

// LLM 출력 검증 — 스키마 밖이면 폐기하고 규칙 결과로 되돌림
export function validateNormalized(o, fallback) {
  if (!o || typeof o !== 'object') return fallback
  const ok = QUERY_SCHEMA.intent.includes(o.intent) &&
             QUERY_SCHEMA.aggregate.includes(o.aggregate) &&
             (o.dimensionAsked === null || QUERY_SCHEMA.dimension.includes(o.dimensionAsked))
  if (!ok) return fallback
  return { intent: o.intent, aggregate: o.aggregate, dims: o.dims || {},
    dimensionAsked: o.dimensionAsked ?? null, unitFamily: o.unitFamily ?? null,
    resolvedBy: 'llm', confidence: 0.9 }
}
