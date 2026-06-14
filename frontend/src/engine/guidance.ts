// 질환별 표준 관리·식이 안내 (보류여도 도움되는 답). 국가건강정보포털 권고 기반 일반 안내.
// "X질환이면 Y 먹어도 되나요?" 같은 조언 질문에 차갑게 보류 대신 실질 답을 주기 위함. 진단 아님·참고용.
import type { Citation } from './types'
import { findInText } from './ontology'

const kdca = (title: string): Citation => ({ portal: '질병관리청 국가건강정보포털', title, url: 'https://health.kdca.go.kr' })

export interface Guidance { text: string; citation: Citation; avoid?: string[]; good?: string[] }

// 질환 canonical → 안내. avoid=피하면 좋은 것, good=도움되는 것(조언 질문 답에 활용)
export const DISEASE_GUIDANCE: Record<string, Guidance> = {
  제2형당뇨: {
    text: '당뇨는 완치보다 혈당 관리가 핵심이에요. 당류·정제 탄수화물·과식을 줄이고, 채소·통곡물 위주 식사와 규칙적인 운동, 처방 약물을 병행하는 게 표준이에요.',
    citation: kdca('당뇨병 — 식사·운동·약물 관리'),
    avoid: ['설탕', '당류', '단 음식', '정제 탄수화물', '과식', '음주'], good: ['채소', '통곡물', '운동', '식이섬유'],
  },
  고혈압: {
    text: '고혈압은 짠 음식(나트륨)을 줄이고 체중 관리·규칙적 운동·금연·절주로 관리하며, 필요하면 처방약을 꾸준히 복용하는 게 표준이에요.',
    citation: kdca('고혈압 — 생활습관·약물 관리'),
    avoid: ['짠 음식', '나트륨', '소금', '국물', '가공식품', '과음'], good: ['저염식', '채소', '운동', '체중 감량'],
  },
  이상지질혈증: {
    text: '이상지질혈증(고지혈증)은 포화지방·튀긴 음식·트랜스지방을 줄이고, 등푸른 생선·채소·식이섬유를 늘리며 유산소 운동을 하는 게 좋아요. 필요하면 스타틴 등 약물로 관리해요.',
    citation: kdca('이상지질혈증 — 식사·운동·약물 관리'),
    avoid: ['포화지방', '튀긴 음식', '기름진 음식', '트랜스지방', '가공식품', '과음'], good: ['등푸른 생선', '채소', '식이섬유', '유산소 운동'],
  },
  비만: {
    text: '비만은 섭취 열량을 줄이고(특히 당류·고지방·야식·음주) 신체활동을 늘리는 게 기본이에요. 극단적 단식보다 꾸준한 식습관·운동이 안전해요.',
    citation: kdca('비만 — 식사·운동 관리'),
    avoid: ['당류', '고지방', '튀긴 음식', '야식', '음주', '단 음료'], good: ['채소', '단백질', '운동', '규칙적 식사'],
  },
  체지방: {
    text: '체지방·복부비만은 당류·고지방 섭취를 줄이고 유산소·근력 운동을 병행하는 게 효과적이에요.',
    citation: kdca('비만 — 신체활동'), avoid: ['당류', '고지방', '야식'], good: ['유산소 운동', '근력 운동'],
  },
  통풍: {
    text: '통풍은 요산을 높이는 음식(과음·맥주·내장류·등푸른 생선 과다)을 줄이고 물을 충분히 마시며 체중을 관리하는 게 좋아요. 필요시 약물 치료를 합니다.',
    citation: kdca('통풍 — 식사·약물 관리'), avoid: ['과음', '맥주', '내장류', '고기 과다'], good: ['수분 섭취', '체중 관리'],
  },
  위염: {
    text: '위염은 자극적인 음식(맵고 짠 것·카페인·과음·과식)을 피하고 규칙적으로 식사하는 게 도움이 돼요. 증상이 지속되면 진료가 필요합니다.',
    citation: kdca('위장질환 — 식생활 관리'), avoid: ['매운 음식', '카페인', '과음', '과식', '야식'], good: ['규칙적 식사', '소화 잘되는 음식'],
  },
  골다공증: {
    text: '골다공증은 칼슘·비타민D를 충분히 섭취하고 체중 부하 운동(걷기 등)을 하며 금연·절주가 도움이 돼요.',
    citation: kdca('골다공증 — 영양·운동'), avoid: ['과음', '흡연'], good: ['칼슘', '비타민D', '걷기 운동'],
  },
  심혈관질환: {
    text: '심혈관 건강에는 금연·절주, 저염·저지방 식사, 규칙적 운동, 혈압·혈당·콜레스테롤 관리가 중요해요.',
    citation: kdca('심혈관질환 — 위험요인 관리'), avoid: ['흡연', '과음', '포화지방', '짠 음식'], good: ['운동', '채소', '금연'],
  },
  지방간: {
    text: '지방간은 술을 줄이고(금주), 당류·정제 탄수화물·과식을 피하며 체중을 줄이고 운동하는 게 핵심이에요.',
    citation: kdca('간 건강 — 생활관리'), avoid: ['음주', '술', '당류', '과식'], good: ['체중 감량', '운동'],
  },
  간건강: {
    text: '간 건강에는 과음을 피하고(절주·금주) 균형 잡힌 식사와 적정 체중 유지가 도움이 돼요. 검증 안 된 민간요법·고용량 보조제는 오히려 부담이 될 수 있어요.',
    citation: kdca('간 건강 — 생활관리'), avoid: ['과음', '술', '검증 안 된 보조제'], good: ['절주', '균형 식사'],
  },
}

// 감염병 등(식이 질문이 적은) 일반 안내 — 가벼운 fallback
const INFECTIOUS_GUIDANCE: Guidance = {
  text: '감염병은 손 씻기·기침 예절·예방접종 등 기본 수칙이 예방에 도움이 되고, 걸렸을 때는 충분한 휴식과 수분 섭취가 회복에 좋아요. 특정 음식이 직접 치료·악화시킨다는 공식 근거는 대개 없습니다.',
  citation: kdca('감염병 — 예방·생활수칙'),
}

export function guidanceFor(diseaseCanonical: string): Guidance | null {
  if (DISEASE_GUIDANCE[diseaseCanonical]) return DISEASE_GUIDANCE[diseaseCanonical]
  // 감염병류는 일반 안내
  const e = findInText(diseaseCanonical, 'disease')
  if (e?.tags?.includes('infectious')) return INFECTIOUS_GUIDANCE
  return null
}

// "X질환이면 Y 먹어도 되나?" 류 조언 질문 → 질환 관리 안내(+음식별 한 줄). 질환 미인식·안내없음 시 null.
export function adviceAnswer(claim: string): { disease: string; text: string; citation: Citation } | null {
  const d = findInText(claim, 'disease')
  if (!d) return null
  const g = guidanceFor(d.canonical)
  if (!g) return null
  const subj = findInText(claim, 'subject')
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
  let lead = ''
  if (subj && subj.canonical !== d.canonical) {
    const name = subj.canonical
    const inAvoid = g.avoid?.some((a) => norm(claim).includes(norm(a)) || norm(name).includes(norm(a)) || norm(a).includes(norm(name)))
    const inGood = g.good?.some((a) => norm(claim).includes(norm(a)) || norm(name).includes(norm(a)) || norm(a).includes(norm(name)))
    if (inAvoid) lead = `${name}은(는) ${d.canonical}에 좋지 않아 줄이는 게 좋아요. `
    else if (inGood) lead = `${name}은(는) ${d.canonical} 관리에 도움이 될 수 있어요. `
    else lead = `‘${name}’이(가) ${d.canonical}에 직접 해롭다는 공식 근거는 뚜렷하지 않아요. `
  }
  return { disease: d.canonical, text: lead + g.text, citation: g.citation }
}
