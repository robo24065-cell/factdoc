// 다중변수 가중치 수요예측 모델 — 질병군별 변수-적합도(전파경로 기반)로 가중을 달리해 융합 → 내년 발주량·시점.
//   ❶ 로버스트 예측: '평년(중앙값)·유행대비(최근 피크)·추세방향' 3신호. 단순 직선 외삽의 이상치 과대예측(예: 백일해 일회성 급증)을 배제.
//   ❷ 질병군별 변수 적합도 매트릭스: 매개체=기상↑·의료감염=기상 비활성 등. 무관 변수는 0%(비활성)로 미스매치 제거.
//   ❸ 기상(환경위험)은 #40 기상청 API 연동 전까지 '시나리오 레버'(측정값 아님 명시). 발주시점=질병청 월별 계절성 정점−리드타임.
// ⚠ 발생 추세 기반 '방향·우선순위' 보조 모델. 절대 발주량은 입력 baseline(예년 발주량) 기준 가정. 의학 판정 아님.
import { EID_NAT_YEAR, EID_NAT_MONTH } from '../data/eid-region'

export const MODEL_FC_YEAR = 2027
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

// ───────────────────────── 질병군 + 변수-적합도 매트릭스 ─────────────────────────
// 가중치는 '전파경로' 기반 도메인 프라이어(질병청 감염병 분류). 측정 상관계수가 아니라 '어느 변수가 영향을 주는가'의 근거 매핑.
// env/cohort 가중치 0 = 그 변수는 이 군에 영향 없음(UI에서 비활성·회색). 사용자는 조절 가능하나 기본값은 군에 맞게 설정.
export interface GroupProfile {
  key: string; label: string; supplies: string
  weights: { epi: number; env: number; cohort: number } // 기본 가중치(%). 0이면 비활성 변수
  envLabel: string; cohortLabel: string
  rationale: string  // 왜 이 가중인가(출처/근거)
  peakSeason: string
  members: string[]
}
export const GROUPS: GroupProfile[] = [
  {
    key: 'vector', label: '매개체(모기·진드기)', supplies: '기피제·방제·보호의',
    weights: { epi: 30, env: 50, cohort: 20 }, envLabel: '기온·강수(매개생물 활동)', cohortLabel: '야외훈련·전방부대',
    rationale: '매개생물(모기·진드기) 활동이 기온·강수에 좌우 → 기상 변수 결정적. (질병청 매개체 감염병)',
    peakSeason: '여름~초가을', members: ['말라리아', '뎅기열', '쯔쯔가무시증', '중증열성혈소판감소증후군(SFTS)', '신증후군출혈열', '렙토스피라증', '라임병', '큐열'],
  },
  {
    key: 'resp', label: '호흡기·비말', supplies: '마스크·해열제·신속항원키트',
    weights: { epi: 50, env: 10, cohort: 40 }, envLabel: '한파·일교차', cohortLabel: '신병교육대 입영 밀집',
    rationale: '비말·밀집 전파 → 유행 추세와 단체생활 밀집도가 핵심. 날씨는 보조. (질병청 호흡기 감염병)',
    peakSeason: '늦가을~겨울', members: ['수두', '성홍열', '유행성이하선염', '백일해', '폐렴구균 감염증', '수막구균 감염증', '홍역'],
  },
  {
    key: 'enteric', label: '수인성·접촉(소화기)', supplies: '소독제·손위생·정수',
    weights: { epi: 40, env: 30, cohort: 30 }, envLabel: '하절기 수질·기온', cohortLabel: '단체급식·집단생활',
    rationale: '식품·물 매개 → 유행 추세 + 하절기 환경 + 단체급식 밀집. (질병청 수인성·식품매개)',
    peakSeason: '여름', members: ['A형간염', 'E형간염', '장출혈성대장균감염증', '세균성이질', '장티푸스', '파라티푸스'],
  },
  {
    key: 'hai', label: '의료감염·내성균', supplies: '진단·격리·소독·보호구',
    weights: { epi: 60, env: 0, cohort: 40 }, envLabel: '—(영향 없음)', cohortLabel: '의료·요양 인프라',
    rationale: '항생제 내성·의료관련 감염 → 기상·입영 코호트와 무관. 유행 추세 + 의료환경이 결정. (질병청 의료감염)',
    peakSeason: '계절성 약함', members: ['카바페넴내성장내세균목(CRE) 감염증', '레지오넬라증'],
  },
  {
    key: 'blood', label: '혈액·성매개', supplies: '검사키트·예방',
    weights: { epi: 70, env: 0, cohort: 30 }, envLabel: '—(영향 없음)', cohortLabel: '인구·행동',
    rationale: '혈액·성 접촉 매개 → 기상·계절과 무관. 유행 추세와 인구 행동이 결정. (질병청 성매개·혈액매개)',
    peakSeason: '계절성 없음', members: ['C형간염', '매독', '매독(선천성)'],
  },
]
const OTHER: GroupProfile = { key: 'other', label: '기타', supplies: '관련 방역·의료 물자', weights: { epi: 100, env: 0, cohort: 0 }, envLabel: '—', cohortLabel: '—', rationale: '전파경로 분류 외 — 유행 추세만으로 평가.', peakSeason: '—', members: [] }
export function groupOf(disease: string): GroupProfile { return GROUPS.find((g) => g.members.includes(disease)) ?? OTHER }

// ───────────────────────── 로버스트 예측(평년/유행대비/추세) ─────────────────────────
function median(a: number[]): number { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2 }
function completeYears(): number[] {
  const ys = new Set<number>()
  for (const d of Object.values(EID_NAT_YEAR)) for (const y of Object.keys(d)) ys.add(+y)
  return [...ys].sort((a, b) => a - b).slice(0, -1) // 진행중(최신) 연도 제외
}

export interface RobustForecast {
  series: { year: number; value: number }[]   // 일관감시 구간(선행 0 제거)
  base: number; surge: number                  // 평년(최근5년 중앙값) · 유행대비(최근6년 최대)
  current: number; currentYear: number
  histMax: number; histMaxYear: number         // 역대 최대(피크 기억)
  trendDir: '지속증가' | '상승' | '안정' | '감소'
  trendPct: number                             // 표시용(±60% 클램프 — 무한 외삽 금지)
  sustained: boolean                           // 단조 증가(추세가 진짜)
  outbreaks: { year: number; value: number }[] // 일회성 급증(평년 1.8배 초과)
}

// members 합산 시계열로 로버스트 신호 산출. 단일 질병은 [disease].
export function robustForecast(members: string[]): RobustForecast {
  const years = completeYears()
  let series = years.map((y) => ({ year: y, value: members.reduce((s, m) => s + (EID_NAT_YEAR[m]?.[String(y)] ?? 0), 0) }))
  const firstNz = series.findIndex((p) => p.value > 0); if (firstNz > 0) series = series.slice(firstNz) // 전수감시 시작 전 선행 0 제거(예: 매독 2015~16)
  const n = series.length
  const last5 = series.slice(-5).map((p) => p.value)
  const last6 = series.slice(-6)
  const base = Math.round(median(last5))
  const surge = Math.max(0, ...last6.map((p) => p.value))
  const cur = series[n - 1]
  let histMax = 0, histMaxYear = 0; for (const p of series) if (p.value > histMax) { histMax = p.value; histMaxYear = p.year }
  // 지속증가: 최근6 단조 비감소(소폭 dip 허용) & 최근값이 시작값의 1.2배↑
  const w = last6.map((p) => p.value)
  const sustained = w.length >= 4 && w.every((v, i) => i === 0 || v >= w[i - 1] * 0.95) && w[w.length - 1] > w[0] * 1.2
  // 방향: 최근3 중앙값 vs 직전3 중앙값(이상치 둔감)
  const lm = median(series.slice(-3).map((p) => p.value)), pm = median(series.slice(-6, -3).map((p) => p.value))
  const rawPct = pm > 0 ? Math.round(((lm - pm) / pm) * 100) : (lm > 0 ? 100 : 0)
  const trendPct = Math.max(-60, Math.min(60, rawPct))
  const trendDir: RobustForecast['trendDir'] = sustained ? '지속증가' : rawPct >= 15 ? '상승' : rawPct <= -15 ? '감소' : '안정'
  const outbreaks = sustained ? [] : last6.filter((p) => p.value > base * 1.8).map((p) => ({ year: p.year, value: p.value }))
  return { series, base, surge, current: cur?.value ?? 0, currentYear: cur?.year ?? MODEL_FC_YEAR - 1, histMax, histMaxYear, trendDir, trendPct, sustained, outbreaks }
}
export const robustForecastDisease = (disease: string) => robustForecast([disease])

// 계절성 정점월(평균 월별 프로파일 argmax). 0=정보부족.
export function peakMonth(disease: string): { month: number; profile: number[] } {
  const byYear = EID_NAT_MONTH[disease] ?? {}
  const sum = new Array(12).fill(0); let cnt = 0
  for (const arr of Object.values(byYear)) {
    if (!Array.isArray(arr) || arr.length < 12) continue
    if (arr.reduce((s, v) => s + v, 0) <= 0) continue
    for (let i = 0; i < 12; i++) sum[i] += arr[i]
    cnt++
  }
  if (!cnt) return { month: 0, profile: sum }
  let mi = 0; for (let i = 1; i < 12; i++) if (sum[i] > sum[mi]) mi = i
  return { month: mi + 1, profile: sum }
}

// ───────────────────────── 가중 융합 → 발주 액션플랜 ─────────────────────────
export interface DemandPlan {
  disease: string; gp: GroupProfile; fcYear: number
  rf: RobustForecast
  weights: { epi: number; env: number; cohort: number }   // 정규화된 활성 가중치(비활성=0)
  active: { epi: boolean; env: boolean; cohort: boolean }  // 이 군에서 변수 활성 여부
  envPct: number; cohortPct: number; epiPct: number
  adjPct: number
  baseline: number; qtyBase: number; qtySurge: number; surgeRatio: number
  surgeBeyondStock: boolean   // 유행 규모가 사전 비축 한계(SURGE_CAP) 초과 → 긴급조달·증산 계약 영역
  peak: number; orderMonth: number; monthLabel: string; orderLabel: string
  dir: '대폭증량' | '증량' | '유지' | '감축'
}
// 사전 비축으로 감당 가능한 최대 배수(도메인 가정). 이를 넘는 폭증은 비축이 아니라 긴급조달·증산 계약으로 대응.
const SURGE_CAP = 3

// weightsOverride=null이면 군 기본가중 사용. envPct=기상 시나리오 가산(%), cohortPct=인구·코호트 변화(%).
export function demandPlan(
  disease: string, baseline: number, weightsOverride: { epi: number; env: number; cohort: number } | null = null,
  envPct = 0, cohortPct = 0, fcYear = MODEL_FC_YEAR, lead = 2,
): DemandPlan {
  const gp = groupOf(disease)
  const rf = robustForecastDisease(disease)
  const active = { epi: true, env: gp.weights.env > 0, cohort: gp.weights.cohort > 0 }
  const src = weightsOverride ?? gp.weights
  // 비활성 변수는 융합에서 제외(정규화 분모에서도 빠짐)
  const a = { epi: src.epi, env: active.env ? src.env : 0, cohort: active.cohort ? src.cohort : 0 }
  const wsum = a.epi + a.env + a.cohort || 1
  const w = { epi: a.epi / wsum, env: a.env / wsum, cohort: a.cohort / wsum }
  const epiPct = rf.trendPct  // 유행가속 = 로버스트 추세(클램프). 직선외삽 아티팩트 아님.
  const adjPct = Math.round(w.epi * epiPct + w.env * (active.env ? envPct : 0) + w.cohort * (active.cohort ? cohortPct : 0))
  const qtyBase = Math.max(0, Math.round(baseline * (1 + adjPct / 100)))
  const surgeRatio = rf.base > 0 ? rf.surge / rf.base : 1
  const surgeBeyondStock = surgeRatio > SURGE_CAP   // 예: 백일해 평년 292건→2024년 48,048건(×164) — 비축 불가
  const qtySurge = Math.max(qtyBase, Math.round(baseline * Math.min(surgeRatio, SURGE_CAP)))
  const { month: peak } = peakMonth(disease)
  const orderMonth = peak > 0 ? ((peak - 1 - lead + 12) % 12) + 1 : 0
  const dir: DemandPlan['dir'] = adjPct >= 30 ? '대폭증량' : adjPct >= 8 ? '증량' : adjPct <= -8 ? '감축' : '유지'
  return {
    disease, gp, fcYear, rf, weights: w, active, envPct, cohortPct, epiPct, adjPct,
    baseline, qtyBase, qtySurge, surgeRatio, surgeBeyondStock,
    peak, orderMonth, monthLabel: peak > 0 ? MONTHS[peak - 1] : '—', orderLabel: orderMonth > 0 ? MONTHS[orderMonth - 1] : '—', dir,
  }
}

// 드롭다운 — 군에 속한 대표 감염병 우선(군 순서대로), 그 외는 뒤에.
export const MODEL_DISEASES: string[] = (() => {
  const inGroup = GROUPS.flatMap((g) => g.members).filter((m) => m in EID_NAT_YEAR)
  const rest = Object.keys(EID_NAT_YEAR).filter((d) => !inGroup.includes(d))
  return [...inGroup, ...rest]
})()
