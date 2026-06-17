// 유병률 정합성 검사기 (§13.9 #2) — 통계/유병률 주장을 질병청 KNHANES 공식 분포와 대조해
// 통계적 outlier(과장·축소)를 자동 판정. LLM 불필요(결정론). 공공데이터(KNHANES) 활용.
// ⚠ 참고용·근사치(KNHANES 만30세이상 기준 등). 큰 이탈만 강하게 판정하고 경계는 보수적으로.
import type { Citation, Judgement, TraceStep, Verdict } from './types'
import { findInText } from './ontology'

const KNHANES: Citation = {
  portal: '질병관리청 국민건강영양조사(KNHANES)',
  title: '주요 만성질환 유병률 통계(연령·성별)',
  url: 'https://knhanes.kdca.go.kr',
}
const DISCLAIMER = '본 결과는 의료 진단이 아니며 참고용입니다. 증상이 의심되면 전문가와 상담하세요.'

// 공식 유병률 범위(%) — KNHANES 근사. [lo, hi]. byAge 키: 20·30·40·50·60·70(대), 65(65세이상)
interface Ref { label: string; overall: [number, number]; byAge?: Record<number, [number, number]> }
const REFERENCE: Record<string, Ref> = {
  제2형당뇨: { label: '당뇨병(30세 이상)', overall: [11, 15], byAge: { 20: [1, 3], 30: [3, 5], 40: [7, 10], 50: [14, 18], 60: [22, 27], 70: [28, 33], 65: [25, 32] } },
  고혈압: { label: '고혈압(30세 이상)', overall: [28, 33], byAge: { 20: [3, 7], 30: [8, 12], 40: [17, 22], 50: [30, 38], 60: [45, 55], 70: [60, 68], 65: [55, 65] } },
  비만: { label: '비만(성인 BMI≥25)', overall: [33, 40], byAge: { 30: [33, 42], 40: [35, 43], 50: [35, 43], 60: [35, 43] } },
  이상지질혈증: { label: '이상지질혈증(30세 이상)', overall: [30, 45] },
}
// 흡연율 등 비-질환 지표(별도)
const SMOKING: Ref = { label: '현재흡연율(성인 남성)', overall: [30, 36] }

// 외부 노출 — 위험도 판독기/대시보드용 KNHANES 유병률 조회. age(만나이) → byAge 키 매핑.
export interface PrevalenceInfo { canonical: string; label: string; range: [number, number]; scope: '연령대' | '전체'; source: string }
export const PREVALENCE_DISEASES = Object.keys(REFERENCE)
export function prevalenceFor(diseaseCanonical: string, age?: number): PrevalenceInfo | null {
  const ref = REFERENCE[diseaseCanonical]
  if (!ref) return null
  let key: number | null = null
  if (age && age > 0) {
    if (age >= 70) key = ref.byAge?.[70] ? 70 : (ref.byAge?.[65] ? 65 : null)
    else if (age >= 20) key = Math.floor(age / 10) * 10
  }
  const hasKey = key != null && !!ref.byAge?.[key]
  const range = hasKey ? ref.byAge![key as number] : ref.overall
  return { canonical: diseaseCanonical, label: ref.label, range, scope: hasKey ? '연령대' : '전체', source: '질병청 국민건강영양조사(KNHANES) 근사' }
}

const num = (s: string) => parseFloat(s.replace(/[^\d.]/g, ''))

// 다양한 한국어 표현에서 퍼센트 추출
function parsePercent(text: string): number | null {
  const t = text.replace(/\s/g, '')
  let m
  if ((m = /(\d+(?:\.\d+)?)\s*(?:%|퍼센트|프로|％)/.exec(text))) return num(m[1])
  if ((m = /(\d+)명?중(\d+)명/.exec(t))) { const a = +m[1], b = +m[2]; if (a > 0) return (b / a) * 100 }
  if ((m = /열에(한|두|세|네|다섯|여섯|일곱|여덟|아홉)/.exec(t))) { const map: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 }; return map[m[1]] * 10 }
  if (/(절반|반|두명중한명|2명중1명)/.test(t)) return 50
  if (/(셋중하나|3명중1명|세명중한명)/.test(t)) return 33
  if (/(넷중하나|4명중1명)/.test(t)) return 25
  return null
}

// 연령대 추출 → byAge 키
function parseAgeKey(text: string): number | null {
  const t = text.replace(/\s/g, '')
  let m
  if ((m = /(\d0)대/.exec(t))) return +m[1] // 20대,30대...
  if (/(65세이상|65세\+|노인|어르신|고령)/.test(t)) return 65
  if (/(70세이상|80세이상)/.test(t)) return 70
  return null // 30세이상 등 전체는 overall 사용
}

// 담금주·보양주 등 민간 약술 효능 주장 — 공식 근거 없음(보류) + 알코올 안전경고.
// 예: "말벌주가 관절염에 좋나요", "뱀술 효능", "산수유주 보양". 코퍼스 미수록이라 백과로 새지 않게 선검출.
const FOLK_LIQUOR_RE = /(말벌|땅벌|뱀|살모사|독사|지네|굼벵이|불개미|왕지네|전갈|해마|녹용|산수유|더덕|마가목|오가피|하수오|구기자|복분자|머루|다래|개구리|두꺼비|지렁이|불나방|사슴|고삼|인삼|홍삼|도라지|당귀|천마|영지|상황|동충하초|벌집|봉독)\s*(주|술)|(담금주|보양주|약술|약주|뱀술|불로주|산삼주)/
// 효능·건강 맥락 표지(이게 있어야 '검증 대상')
const FOLK_HEALTH_RE = /(효능|효과|좋|낫|치료|예방|보양|기력|정력|관절|면역|혈액순환|피로|몸에)/
// 독(곤충·파충류 독)을 함유한 재료 + 알레르기성 피부질환 — 질병청 공식정보상 '유발 요인'이라 효능 주장은 오히려 위험.
const VENOM_AGENT_RE = /(말벌|땅벌|벌집|봉독|벌|뱀|살모사|독사|지네|왕지네|전갈|불개미|개미)/
const ALLERGY_DZ_RE = /(두드러기|담마진|알레르기|아나필락시스|피부\s*발진|가려움|과민반응)/
export function checkFolkRemedyClaim(text: string): Judgement | null {
  if (!FOLK_LIQUOR_RE.test(text)) return null
  if (!FOLK_HEALTH_RE.test(text)) return null
  // 알코올 주류 여부(대부분 술) — 경고 강도 결정
  const isLiquor = /(주|술)/.test(text)
  // ★독 함유 재료 + 알레르기성 질환(두드러기 등): 질병청 두드러기/벌 쏘임 정보상 '곤충·동물의 독'은 두드러기·알레르기를 '유발'하는 요인.
  //   → '좋다/치료'는 방향이 정반대라 보류가 아니라 '역효과 위험경고'로 답해야 함(사용자 피드백: '확인 어려움'은 부적절).
  if (VENOM_AGENT_RE.test(text) && ALLERGY_DZ_RE.test(text)) {
    return {
      claimText: text, triples: [], verdict: 'false', confidence: 0.78,
      citations: [{ portal: '질병관리청 국가건강정보포털', title: '두드러기 — 원인(곤충·동물의 독 등 알레르기 유발 요인)', url: 'https://health.kdca.go.kr' }],
      trace: [
        { kind: 'normalize', label: '독 함유 민간 약술 + 알레르기성 질환 인식', detail: '벌독·뱀독 등 독을 함유한 재료의 두드러기·알레르기 효능 주장' },
        { kind: 'graph_match', label: '질병청 공식 근거 대조', detail: '질병청 두드러기 정보: 곤충·동물의 독은 두드러기·알레르기 반응을 유발할 수 있는 요인', outcome: '효능과 방향 반대 → 역효과 위험(허위)' },
      ],
      tier: 'auto_unverified',
      warning: '벌·뱀 등의 독은 질병관리청 공식 정보상 두드러기·알레르기(심하면 아나필락시스)를 오히려 유발할 수 있는 요인이에요. 두드러기·알레르기 체질이라면 효능을 기대해 섭취·접촉하지 마세요. 호흡곤란·얼굴부종 등 전신 증상은 즉시 119·응급실.',
      disclaimer: '효능 근거가 없을 뿐 아니라, 공식 정보상 오히려 유발 요인이라 권장되지 않습니다. ' + DISCLAIMER,
    }
  }
  const cite: Citation = { portal: '질병관리청 국가건강정보포털', title: '민간요법·약술의 효능은 공식 의학근거로 확립되지 않음', url: 'https://health.kdca.go.kr' }
  const trace: TraceStep[] = [
    { kind: 'normalize', label: '민간 약술·보양주 주장 인식', detail: '담금주/보양주류의 건강 효능 주장' },
    { kind: 'graph_match', label: '공식 근거 대조', detail: '국가 공식데이터(질병청·식약처)에 해당 효능 근거 없음', outcome: '공식근거 없음 → 보류' },
  ]
  const warning = isLiquor
    ? '술(담금주)입니다. 알코올은 과음 시 간·혈압·통풍 등에 해롭고, 약 복용 중이면 상호작용 위험이 있어요. 효능을 기대해 음용량을 늘리지 마세요.'
    : '민간요법은 공식 효능이 확립되지 않았어요. 표준 치료를 대체하지 마세요.'
  return {
    claimText: text, triples: [], verdict: 'unverified', confidence: 0.55,
    citations: [cite], trace, tier: 'auto_unverified',
    warning,
    disclaimer: '이 효능은 국가 공식데이터로 확인되지 않아 보류합니다(효과를 보장하지도, 부정하지도 않음). ' + DISCLAIMER,
  }
}

// 백신 유해/괴담 주장 — 확립된 반증이 있는 거짓 인과를 허위로(안전 최우선). parse가 '백신→prevents'로 오판하기 전에 선검출.
const VAX_RE = /(백신|예방\s*접종|예방주사|백신\s*접종)/
export function checkVaccineClaim(text: string): Judgement | null {
  if (!VAX_RE.test(text)) return null
  const mk = (outcome: string, title: string): Judgement => ({
    claimText: text, triples: [], verdict: 'false', confidence: 0.9,
    citations: [{ portal: '질병관리청', title, url: 'https://nip.kdca.go.kr' }],
    trace: [
      { kind: 'normalize', label: '백신 유해 주장 인식', detail: '백신 관련 인과 주장' },
      { kind: 'graph_match', label: '예방접종 안전성 반증 룰', detail: title, outcome: '허위' },
    ],
    tier: 'auto_unverified',
    warning: outcome,
    disclaimer: '백신 안전성은 국가 예방접종 근거에 기반합니다. 개인 접종 판단은 의료진과 상담하세요.',
  })
  // 1) DNA·유전자 변형
  if (/(dna|디엔에이|유전자|유전체|rna)/i.test(text) && /(변형|변이|조작|바꾸|바뀌|손상|편집|바꾼다)/.test(text))
    return mk('mRNA·코로나19 백신은 세포질에서 단백질 설계도로만 작용하고 핵 속 DNA(유전정보)에 들어가 바꾸지 않습니다. 백신이 유전자를 변형시킨다는 주장은 과학적 근거가 없는 허위입니다.', '코로나19 백신 — 유전자(DNA) 변형 무관')
  // 2) 확립된 디벙크 유해설
  if (/(자폐|아스퍼거|autism|불임|난임|마이크로\s*칩|마이크로칩|자석|5g|중금속|수은)/i.test(text))
    return mk('백신이 자폐·불임·마이크로칩·자석 등을 유발한다는 주장은 대규모 역학연구로 반증된 잘못된 정보입니다(질병관리청·식약처·WHO).', '예방접종 안전성 — 허위정보 반증')
  // 3) 백신이 '그 대상 질병'을 유발(오히려 걸린다) — 예방/부정 맥락이면 제외
  if (!/(안|못|예방|막아|막는|덜)\s*걸|예방(되|된|할|돼)/.test(text)
    && /(오히려|도리어|때문에|탓에|부작용으로|역효과|맞아서|맞고\s*나서|맞으면).{0,12}(걸린|걸리|걸려|유발|생기|감염|발병)|유발(한다|하|해|된다)|일으킨다|걸리게\s*하|감염\s*시킨/.test(text))
    return mk('불활화·성분 기반 예방백신에는 살아있는 병원체가 없어 백신 자체가 그 감염병을 유발하지 않습니다. 접종 후 미열·근육통은 면역이 형성되는 정상 반응이며 감염이 아닙니다(질병관리청).', '예방접종 — 백신이 대상 질병을 유발하지 않음')
  return null
}

// 통계 주장 여부 + 판정. 통계 주장 아니면 null(일반 파이프라인으로).
export function checkStatClaim(text: string): Judgement | null {
  const pct = parsePercent(text)
  if (pct == null) return null

  // 치명률 공포조장 — 계절성 호흡기(독감·코로나·감기)는 공식 치명률 < ~1%. 신종/기타는 천차만별 → 보류.
  if (/치명률/.test(text)) {
    // 신종·변종·대유행·조류/신종플루는 계절성 1% 룰을 적용할 수 없음(CFR 천차만별·공식근거 미수록) → 일반 파이프라인=보류.
    if (/(신종|변종|신변종|대유행|팬데믹|조류|신종플루|미지|정체불명|새로운\s*바이러스)/.test(text)) return null
    if (!/(독감|인플루엔자|코로나|감기|계절성|호흡기)/.test(text)) return null
    const cite: Citation = { portal: '질병관리청', title: '계절성 호흡기 감염병 치명률(통상 1% 미만)', url: 'https://health.kdca.go.kr' }
    const trace: TraceStep[] = [{ kind: 'normalize', label: '치명률 주장 인식', detail: `계절성 호흡기 감염병 치명률 ${pct.toFixed(0)}% 주장` }]
    let verdict: Verdict, outcome: string, confidence: number
    if (pct >= 5) { verdict = 'false'; outcome = '계절성 호흡기 치명률은 통상 1% 미만 — 크게 과장(공포조장)'; confidence = 0.85 }
    else if (pct >= 1) { verdict = 'partial'; outcome = '실제보다 높게 과장(통상 1% 미만)'; confidence = 0.7 }
    else { verdict = 'true'; outcome = '통상 범위(1% 미만)와 부합'; confidence = 0.7 }
    trace.push({ kind: 'graph_match', label: '치명률 정합성 검사', detail: '공식 계절성 호흡기 치명률 ≈ 0.1~1%', outcome })
    return { claimText: text, triples: [], verdict, confidence, citations: [cite], trace, tier: 'auto_unverified', disclaimer: DISCLAIMER }
  }

  const isSmoking = /(흡연율|담배.*피우|흡연)/.test(text)
  const disease = isSmoking ? null : findInText(text, 'disease')
  const ref: Ref | null = isSmoking ? SMOKING : (disease ? REFERENCE[disease.canonical] ?? null : null)
  if (!ref) return null // 대조할 공식 분포 없음 → 일반 파이프라인(보류 등)

  // 유병률/비율 맥락인지(수치만 있고 효능 주장이면 통계 아님)
  if (!/(유병률|율|비율|명중|명꼴|중\s*\d+명|걸린|있대|있다|넘|된대|는다|환자.*\d|확진|발병|치명률|관리율|인지율)/.test(text) && !isSmoking) {
    // 퍼센트는 있으나 통계 주장 표지가 약함 → 보수적으로 일반 파이프라인
    if (!/%|퍼센트|프로/.test(text)) return null
  }

  const ageKey = parseAgeKey(text)
  const range: [number, number] = (ageKey != null && ref.byAge && ref.byAge[ageKey]) ? ref.byAge[ageKey] : ref.overall
  const [lo, hi] = range
  const mid = (lo + hi) / 2

  const trace: TraceStep[] = [{
    kind: 'normalize', label: '통계 주장 인식',
    detail: `${ref.label}${ageKey ? ` · ${ageKey === 65 ? '65세이상' : ageKey === 70 ? '70세이상' : ageKey + '대'}` : ''} — 주장 수치 ${pct.toFixed(0)}%`,
  }]

  let verdict: Verdict
  let outcome: string
  let confidence: number
  if (pct >= lo * 0.7 && pct <= hi * 1.3) {
    verdict = 'true'; outcome = '공식 분포와 부합'; confidence = 0.8
  } else if (pct > hi * 2 || pct < lo * 0.5) {
    verdict = 'false'; outcome = `공식 분포(약 ${lo}~${hi}%)와 크게 어긋남(과대/과소)`; confidence = 0.85
  } else {
    verdict = 'partial'; outcome = `방향은 맞으나 수치 과장/축소(공식 약 ${lo}~${hi}%)`; confidence = 0.7
  }

  trace.push({
    kind: 'graph_match', label: 'KNHANES 정합성 검사',
    detail: `공식 ${ref.label} 유병률 약 ${lo}~${hi}%(중앙 ${mid.toFixed(0)}%) 대비 주장 ${pct.toFixed(0)}%`,
    outcome,
  })

  return {
    claimText: text,
    triples: [],
    verdict,
    confidence,
    citations: [KNHANES],
    trace,
    tier: 'auto_unverified',
    disclaimer: DISCLAIMER,
  }
}
