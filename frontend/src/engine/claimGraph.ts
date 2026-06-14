// 시드 클레임그래프 (당뇨·고혈압·감염병/백신 슬라이스) — CLAUDE.md §6①
// 주의: W1 시드용 예시 근거. 실제 코퍼스(질병청·식약처) 적재 시 doc_id·원문 span으로 교체.

import type { EvidenceRecord } from './types'

export const CLAIM_GRAPH: EvidenceRecord[] = [
  // ── 당뇨 ──
  {
    subject: '인슐린', relation: 'manages', objectDisease: '제2형당뇨',
    evidenceLevel: 'official_guideline', strength: 'strong',
    citation: { portal: '질병관리청 국가건강정보포털', title: '당뇨병 — 표준 치료·관리', url: 'https://health.kdca.go.kr' },
    note: '제2형당뇨는 식이·운동·약물로 혈당을 관리한다(완치 아님).',
  },
  {
    subject: '메트포르민', relation: 'manages', objectDisease: '제2형당뇨',
    evidenceLevel: 'official_guideline', strength: 'strong',
    citation: { portal: '질병관리청 국가건강정보포털', title: '당뇨병 — 약물 치료', url: 'https://health.kdca.go.kr' },
  },
  {
    subject: '식이요법', relation: 'manages', objectDisease: '제2형당뇨',
    evidenceLevel: 'official_guideline', strength: 'strong',
    citation: { portal: '질병관리청 국가건강정보포털', title: '당뇨병 — 식사요법', url: 'https://health.kdca.go.kr' },
  },
  {
    subject: '운동요법', relation: 'manages', objectDisease: '제2형당뇨',
    evidenceLevel: 'official_guideline', strength: 'moderate',
    citation: { portal: '질병관리청 국가건강정보포털', title: '당뇨병 — 운동요법', url: 'https://health.kdca.go.kr' },
  },
  {
    subject: '운동요법', relation: 'reduces_risk', objectDisease: '제2형당뇨',
    evidenceLevel: 'statistics', strength: 'moderate',
    citation: { portal: '질병관리청 국민건강영양조사(KNHANES)', title: '신체활동과 당뇨 위험요인', url: 'https://knhanes.kdca.go.kr' },
  },
  // ── 고혈압 ──
  {
    subject: '식이요법', relation: 'manages', objectDisease: '고혈압',
    evidenceLevel: 'official_guideline', strength: 'strong',
    citation: { portal: '질병관리청 국가건강정보포털', title: '고혈압 — 식사·생활습관 관리', url: 'https://health.kdca.go.kr' },
  },
  {
    subject: '운동요법', relation: 'manages', objectDisease: '고혈압',
    evidenceLevel: 'official_guideline', strength: 'moderate',
    citation: { portal: '질병관리청 국가건강정보포털', title: '고혈압 — 운동요법', url: 'https://health.kdca.go.kr' },
  },
  {
    subject: '나트륨', relation: 'increases_risk', objectDisease: '고혈압',
    evidenceLevel: 'official_guideline', strength: 'strong',
    citation: { portal: '질병관리청 국가건강정보포털', title: '고혈압 — 나트륨 과다 섭취 위험', url: 'https://health.kdca.go.kr' },
  },
  // ── 감염병·백신 ──
  {
    subject: '인플루엔자백신', relation: 'prevents', objectDisease: '인플루엔자',
    evidenceLevel: 'official_guideline', strength: 'strong',
    citation: { portal: '질병관리청 감염병포털', title: '인플루엔자 — 예방접종 권고', url: 'https://dportal.kdca.go.kr' },
    note: '예방접종으로 인플루엔자 발병·중증화 위험을 낮춘다.',
  },
  {
    subject: '인플루엔자백신', relation: 'reduces_risk', objectDisease: '인플루엔자',
    evidenceLevel: 'statistics', strength: 'moderate',
    citation: { portal: '질병관리청 감염병포털', title: '인플루엔자 예방접종 효과', url: 'https://dportal.kdca.go.kr' },
  },
  // ── 건강기능식품(식약처 인정기능성) ──
  {
    subject: '홍삼', relation: 'manages', objectDisease: '면역기능',
    evidenceLevel: 'mfds_approved', strength: 'moderate',
    citation: { portal: '식품의약품안전처 건강기능식품', title: '홍삼 — 인정 기능성(면역 기능 개선 도움)', url: 'https://www.foodsafetykorea.go.kr' },
  },
]
