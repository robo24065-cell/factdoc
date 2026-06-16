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
export function checkFolkRemedyClaim(text: string): Judgement | null {
  if (!FOLK_LIQUOR_RE.test(text)) return null
  if (!FOLK_HEALTH_RE.test(text)) return null
  // 알코올 주류 여부(대부분 술) — 경고 강도 결정
  const isLiquor = /(주|술)/.test(text)
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
