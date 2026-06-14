// 식약처 룰테이블(백본) — CLAUDE.md §6①, §13.2
import type { Citation } from './types'

export interface MfdsRule {
  id: string
  description: string
  citation: Citation
}

// 식품·건강기능식품은 질병의 직접 치료·예방을 표방할 수 없다(기능성=질병위험감소·생리활성·영양소기능 3종 한정).
export const MFDS_DISEASE_CLAIM_RULE: MfdsRule = {
  id: 'mfds-disease-treatment',
  description: '건강기능식품·일반식품은 질병의 직접 치료·예방을 표방할 수 없습니다(기능성 인정 범위 3종 한정).',
  citation: {
    portal: '식품의약품안전처',
    title: '건강기능식품 기능성 인정 범위 / 부당광고 기준',
    url: 'https://www.foodsafetykorea.go.kr',
  },
}
