// 음식·성분 효과 답변 — "사과/여주/바나나가 ○○에 효과있나" 류를 KB로 추론(성분·효과·근거레벨).
// AI 강점: 임의 음식도 성분·효과로 안전하게 설명. 치료 단정 X(명예훼손·부당광고 회피).
import { FOOD_KB as FOOD_KB_BASE, type FoodEffect, type FoodEntry } from './food-kb'
import { FOOD_KB_EXT } from './food-kb-ext'
import { findInText, variantsOf } from './ontology'
import { isCureClaim } from './relationLex'

// 본체 139종 + 확장(일상 음식) — §13.1 폭
const FOOD_KB: FoodEntry[] = [...FOOD_KB_BASE, ...FOOD_KB_EXT]

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

// 질병 canonical → 효과 condition 매칭용 키워드(동의어 + 흔한 표현)
const COND_SYN: Record<string, string[]> = {
  제2형당뇨: ['당뇨', '혈당', '인슐린'],
  이상지질혈증: ['콜레스테롤', '중성지방', '고지혈', '이상지질', 'ldl', '혈중지질'],
  고혈압: ['혈압', '고혈압'],
  비만: ['비만', '체중', '체지방', '다이어트', '살'],
  체지방: ['체지방', '복부', '다이어트', '살'],
  심혈관질환: ['심혈관', '혈관', '혈행', '동맥', '심장'],
  면역기능: ['면역'],
  장건강: ['장', '배변', '변비', '소화'],
  간건강: ['간'],
  눈건강: ['눈', '시력', '황반'],
  관절건강: ['관절', '연골'],
  골다공증: ['뼈', '골밀도', '골다공'],
  통풍: ['통풍', '요산'],
  위염: ['위', '소화'],
}

// 도메인 기반 매칭 — 음식 효과 condition ↔ 질병을 '건강 영역'으로 연결(205개 질병 일반화).
const DOMAINS: { cond: RegExp; dz: RegExp }[] = [
  { cond: /혈당|당뇨/, dz: /당뇨|혈당/ },
  { cond: /콜레스테롤|지질|중성지방/, dz: /지질|콜레스테롤|고지혈/ },
  { cond: /혈압/, dz: /혈압/ },
  { cond: /체중|비만|체지방|다이어트|살/, dz: /비만|체중|체지방|과체중/ },
  { cond: /위|소화|속쓰림|위장/, dz: /위염|위궤양|위장|소화|역류|식도|십이지장|속쓰림|담/ },
  { cond: /장건강|변비|배변|장/, dz: /장|변비|설사|대장|과민성|게실|크론|궤양성|치질|치핵/ },
  { cond: /간/, dz: /간염|간경변|지방간|간건강|숙취/ },
  { cond: /눈|시력|황반/, dz: /눈|시력|황반|백내장|녹내장|결막|안구|비문/ },
  { cond: /관절|연골/, dz: /관절|연골|디스크|오십견|통풍|류마|회전근|엘보|근막/ },
  { cond: /뼈|골다공/, dz: /골다공|뼈|골절|골밀도/ },
  { cond: /면역/, dz: /면역|감염|감기|독감|대상포진/ },
  { cond: /심혈관|혈행|혈관|심장|동맥/, dz: /심혈관|심장|동맥|협심|심근|혈관|뇌졸중|부정맥|판막/ },
  { cond: /기침|가래|호흡|기관지|인후|목|코/, dz: /기침|기관지|천식|폐렴|감기|인후|호흡|코로나|독감|비염|축농|편도|copd/ },
  { cond: /근육|단백질/, dz: /근육|근감소|단백/ },
  { cond: /신장|콩팥/, dz: /신장|콩팥|신증|사구체|요로|방광|결석/ },
  { cond: /갱년|여성|월경/, dz: /갱년|여성|월경|생리|난소|자궁/ },
  { cond: /수면|불면|스트레스|긴장/, dz: /불면|수면|공황|불안|우울|스트레스/ },
  { cond: /피부/, dz: /피부|아토피|여드름|건선|습진|두드러기|무좀/ },
  { cond: /전립선/, dz: /전립선/ },
  { cond: /빈혈|조혈/, dz: /빈혈/ },
]

function condMatches(condition: string, diseaseCanonical: string): boolean {
  const c = norm(condition)
  const keys = [...new Set([...(COND_SYN[diseaseCanonical] ?? []), ...variantsOf(diseaseCanonical), diseaseCanonical])]
  if (keys.some((k) => k && c.includes(norm(k)))) return true
  // 도메인 매칭(일반화): condition과 질병이 같은 건강 영역이면 매칭
  return DOMAINS.some((d) => d.cond.test(condition) && d.dz.test(diseaseCanonical))
}

export interface FoodResult { name: string; components: string[]; effects: FoodEffect[]; disease: string | null; matched: boolean }

// 강한 허위주장(완치·특효·치료단정·약대체)은 음식카드 대상 아님 → 룰엔진(허위) 경로로.
// isCureClaim은 relationLex(1,100+ 어간) 기반 — '치료/완치/약끊/대체' 등 무한한 표현 일반화.
export function foodAnswer(claim: string): FoodResult | null {
  if (isCureClaim(claim)) return null
  const t = norm(claim)
  let best: { f: FoodEntry; len: number } | undefined
  for (const f of FOOD_KB) {
    for (const n of [f.name, ...(f.aka ?? [])]) {
      const nn = norm(n)
      if (nn.length >= 2 && t.includes(nn) && (!best || nn.length > best.len)) best = { f, len: nn.length }
    }
  }
  if (!best) return null
  const f = best.f
  const dz = findInText(claim, 'disease')
  let effects = f.effects
  let matched = false
  if (dz) {
    const rel = f.effects.filter((e) => condMatches(e.condition, dz.canonical))
    if (rel.length) { effects = rel; matched = true }
  }
  // 매칭 안 되면(그 질병 효과 정보 없음) 대표 효과 일부만
  if (!matched) effects = f.effects.slice(0, 3)
  return { name: f.name, components: f.components, effects, disease: dz?.canonical ?? null, matched }
}

// 한 문장에 음식이 여러 개일 때 전부 추출(질병 인식 시 해당 효과만 필터). 완치 주장이면 [].
export function foodAnswerAll(claim: string, max = 4): FoodResult[] {
  if (isCureClaim(claim)) return []
  const t = norm(claim)
  const dz = findInText(claim, 'disease')
  // 음식별 최장 매칭 토큰 수집
  const hits: { f: FoodEntry; token: string }[] = []
  for (const f of FOOD_KB) {
    let tok = ''
    for (const n of [f.name, ...(f.aka ?? [])]) {
      const nn = norm(n)
      if (nn.length >= 2 && t.includes(nn) && nn.length > tok.length) tok = nn
    }
    if (tok) hits.push({ f, token: tok })
  }
  // 긴 토큰 우선 + 다른 토큰의 부분문자열이면 제거(도라지 ⊂ 도라지차)
  hits.sort((a, b) => b.token.length - a.token.length)
  const kept: { f: FoodEntry; token: string }[] = []
  for (const h of hits) {
    if (kept.some((k) => k.token.includes(h.token))) continue
    kept.push(h)
    if (kept.length >= max) break
  }
  return kept.map(({ f }) => {
    let effects = f.effects
    let matched = false
    if (dz) {
      const rel = f.effects.filter((e) => condMatches(e.condition, dz.canonical))
      if (rel.length) { effects = rel; matched = true }
    }
    if (!matched) effects = f.effects.slice(0, 3)
    return { name: f.name, components: f.components, effects, disease: dz?.canonical ?? null, matched }
  })
}
