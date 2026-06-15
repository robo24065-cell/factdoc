// 음식·성분 효과 답변 — "사과/여주/바나나가 ○○에 효과있나" 류를 KB로 추론(성분·효과·근거레벨).
// AI 강점: 임의 음식도 성분·효과로 안전하게 설명. 치료 단정 X(명예훼손·부당광고 회피).
import { FOOD_KB, type FoodEffect, type FoodEntry } from './food-kb'
import { findInText, variantsOf } from './ontology'

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

function condMatches(condition: string, diseaseCanonical: string): boolean {
  const c = norm(condition)
  const keys = [...new Set([...(COND_SYN[diseaseCanonical] ?? []), ...variantsOf(diseaseCanonical), diseaseCanonical])]
  return keys.some((k) => k && c.includes(norm(k)))
}

export interface FoodResult { name: string; components: string[]; effects: FoodEffect[]; disease: string | null; matched: boolean }

// 강한 허위주장(완치·특효·치료단정·약대체)은 음식카드 대상 아님 → 룰엔진(허위) 경로로.
const CURE_CLAIM = /(완치|특효|치료한다|치료된다|치료해 ?준|뿌리 ?뽑|뿌리째|약 ?끊|약 ?안 ?먹|대체|싹 ?낫|100\s*%|단번에|확실히 ?낫)/

export function foodAnswer(claim: string): FoodResult | null {
  if (CURE_CLAIM.test(claim)) return null
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
