// 음식·성분 효과 답변 — "사과/여주/바나나가 ○○에 효과있나" 류를 KB로 추론(성분·효과·근거레벨).
// AI 강점: 임의 음식도 성분·효과로 안전하게 설명. 치료 단정 X(명예훼손·부당광고 회피).
import { FOOD_KB as FOOD_KB_BASE, type FoodEffect, type FoodEntry, type FoodLevel } from './food-kb'
import { FOOD_KB_EXT } from './food-kb-ext'
import { FOOD_KB_COMMON } from './food-kb-common'
import { FOOD_KB_GEN, FOOD_GEN_NEW } from './food-kb-gen'
import { findInText, variantsOf } from './ontology'
import { isCureClaim } from './relationLex'

// 본체 139 + 확장(일상) + 흔한 정크/일상푸드 + 생성·검증 신규 — §13.1 폭
const FOOD_KB: FoodEntry[] = [...FOOD_KB_BASE, ...FOOD_KB_EXT, ...FOOD_KB_COMMON, ...FOOD_GEN_NEW].map((f) => {
  const extra = FOOD_KB_GEN[f.name] // 워크플로 검증 연관(여드름·탈모·부종 등) 병합
  return extra ? { ...f, effects: [...f.effects, ...extra] } : f
})

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
  { cond: /피부|여드름/, dz: /피부|아토피|여드름|건선|습진|두드러기|무좀/ },
  { cond: /전립선/, dz: /전립선/ },
  { cond: /빈혈|조혈|철분/, dz: /빈혈/ },
  { cond: /탈모|모발|두피|머리카락/, dz: /탈모|모발|두피/ },
  { cond: /부종|붓기|이뇨|수분배출/, dz: /부종|붓기|림프부종/ },
  { cond: /피로|기력|피곤|활력/, dz: /피로|만성피로|기력/ },
  { cond: /구취|입냄새/, dz: /구취|입냄새/ },
  { cond: /수면|불면|숙면/, dz: /불면|수면/ },
]

function condMatches(condition: string, diseaseCanonical: string): boolean {
  const c = norm(condition)
  const keys = [...new Set([...(COND_SYN[diseaseCanonical] ?? []), ...variantsOf(diseaseCanonical), diseaseCanonical])]
  if (keys.some((k) => k && c.includes(norm(k)))) return true
  // 도메인 매칭(일반화): condition과 질병이 같은 건강 영역이면 매칭
  return DOMAINS.some((d) => d.cond.test(condition) && d.dz.test(diseaseCanonical))
}

// 효능/기능성 텍스트가 해당 질병과 같은 건강 영역인지 — 성분카드 판단의 '무관 질병 효과 단정' 방지에 사용.
// 예: 프로폴리스(구강 항균) ↔ 암 = false(무관) → "도움" 단정 금지(식약처 부당광고 회피).
export function sharesDomain(text: string, diseaseCanonical: string): boolean {
  if (!text || !diseaseCanonical) return false
  const variants = variantsOf(diseaseCanonical)
  if (variants.some((v) => v.length >= 2 && text.includes(v))) return true
  return DOMAINS.some((d) => d.cond.test(text) && d.dz.test(diseaseCanonical))
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

// ── "○○에 좋은 음식은?" — 그 질병에 도움된다고 연구·인정된 음식 추천(mfds 우선) ──
export function foodsFor(diseaseCanonical: string, max = 8): { name: string; level: FoodLevel; effect: string }[] {
  const seen = new Set<string>(); const out: { name: string; level: FoodLevel; effect: string }[] = []
  for (const f of FOOD_KB) {
    const e = f.effects.find((ef) => (ef.level === 'mfds' || ef.level === 'research') && condMatches(ef.condition, diseaseCanonical))
    if (e && !seen.has(f.name)) { seen.add(f.name); out.push({ name: f.name, level: e.level, effect: e.effect }) }
  }
  return out.sort((a, b) => (a.level === 'mfds' ? 0 : 1) - (b.level === 'mfds' ? 0 : 1)).slice(0, max)
}

// ── 임의 음식(KB 미수록)도 이름으로 영양 속성 추론 → 질병별 주의(대개편: 짬뽕·짜장면 등도 대응) ──
const DISH_ATTRS: { attr: string; label: string; re: RegExp }[] = [
  { attr: 'sodium', label: '나트륨(염분)', re: /짬뽕|짜장|짜파|라면|라멘|우동|국수|칼국수|쌀국수|냉면|찌개|국밥|곰탕|설렁탕|전골|부대|젓갈|장아찌|햄|소시지|베이컨|어묵|만두|육수|국물|장조림|간장|된장|고추장|찜닭|족발|보쌈|짠|절임/ },
  { attr: 'refinedCarb', label: '정제 탄수화물', re: /짜장|짬뽕|라면|라멘|국수|우동|칼국수|냉면|파스타|스파게티|떡볶|떡|흰빵|흰쌀|흰밥|쌀밥|밀가루|만두|튀김|과자|케이크|도넛|피자|햄버거|버거|토스트|베이글/ },
  { attr: 'fat', label: '지방·기름', re: /튀김|부침개|파전|볶음|탕수|돈가스|돈까스|치킨|피자|삼겹|족발|보쌈|곱창|막창|버거|마요|크림|치즈|짜장|탕수육|깐풍|유린기|튀긴|기름진/ },
  { attr: 'sugar', label: '당분', re: /케이크|사탕|초콜릿|아이스크림|음료|주스|탄산|콜라|사이다|시럽|도넛|꿀|잼|디저트|빙수|마카롱|쿠키|단팥|약과|라떼|버블티|에이드/ },
  { attr: 'spicy', label: '맵고 자극적', re: /매운|매콤|얼큰|불닭|마라|떡볶|불막창|낙지볶음|쭈꾸미|닭발|불족발|매콤/ },
  { attr: 'alcohol', label: '알코올', re: /소주|맥주|와인|막걸리|위스키|보드카|사케|하이볼|칵테일|양주|폭탄주|술/ },
  { attr: 'purine', label: '퓨린(요산↑)', re: /맥주|곱창|막창|내장|등푸른|고등어|꽁치|멸치육수|삼겹|소고기|돼지고기|새우|조개|홍합|곱창전골|간(?!장)/ },
]
const DZ_SENSITIVE: { re: RegExp; attrs: string[]; advice: string }[] = [
  { re: /고혈압|혈압/, attrs: ['sodium', 'fat'], advice: '국물·소금을 줄이고 양을 조절하면' },
  { re: /당뇨|혈당/, attrs: ['sugar', 'refinedCarb'], advice: '양을 줄이고 잡곡·채소를 곁들이면' },
  { re: /지질|콜레스테롤|고지혈/, attrs: ['fat'], advice: '튀김·기름진 부분을 줄이면' },
  { re: /신장|콩팥|신증|사구체|콩팥병/, attrs: ['sodium', 'purine'], advice: '나트륨·단백 과잉을 피하면' },
  { re: /통풍|요산/, attrs: ['purine', 'alcohol'], advice: '과음·내장·진한 육수를 줄이면' },
  { re: /위염|위궤양|역류|식도|속쓰림|장염/, attrs: ['spicy', 'alcohol', 'fat'], advice: '맵고 자극적인 것·술·기름진 것을 줄이면' },
  { re: /비만|체중|체지방|과체중|다이어트/, attrs: ['fat', 'sugar', 'refinedCarb'], advice: '열량·당·기름을 줄이면' },
  { re: /간염|간경변|지방간|간건강|숙취/, attrs: ['alcohol', 'fat'], advice: '금주하고 기름진 음식을 줄이면' },
  { re: /심혈관|심장|동맥|협심|심근|뇌졸중|부정맥/, attrs: ['sodium', 'fat'], advice: '염분·포화지방을 줄이면' },
]
const ATTR_LABEL: Record<string, string> = Object.fromEntries(DISH_ATTRS.map((a) => [a.attr, a.label]))

export function dishCaution(text: string, diseaseCanonical: string): { attrs: string[]; msg: string } | null {
  const sens = DZ_SENSITIVE.find((s) => s.re.test(diseaseCanonical))
  if (!sens) return null
  const present = [...new Set(DISH_ATTRS.filter((a) => sens.attrs.includes(a.attr) && a.re.test(text)).map((a) => a.attr))]
  if (!present.length) return null
  const labels = present.map((a) => ATTR_LABEL[a]).join('·')
  return { attrs: present, msg: `${labels} 함량이 높은 편이에요. ${diseaseCanonical} 관리 중이라면 ${sens.advice} 부담을 줄일 수 있어요. (음식 이름으로 추정한 일반 정보예요. 개인차가 있고 진단·치료를 대체하지 않아요.)` }
}
