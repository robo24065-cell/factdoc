// FactDoc 판정 엔진 — 타입 (CLAUDE.md §13.4 스키마와 정합)

export type Relation =
  | 'cures' | 'prevents' | 'reduces_risk' | 'increases_risk' | 'manages'
  | 'no_effect' | 'insufficient_evidence' | 'causes_or_worsens' | 'diagnoses' | 'replaces_treatment'

export type Polarity = 'assert' | 'negate'
export type Strength = 'absolute' | 'strong' | 'moderate' | 'weak'

export type EvidenceLevel =
  | 'official_guideline'  // 표준치료/공식권고 (국가건강정보포털)
  | 'statistics'          // 통계근거 (KNHANES/만성질환통계)
  | 'mfds_approved'       // 식약처 인정기능성
  | 'regulatory_counter'  // 반증·규제근거 (식약처 부당광고)
  | 'limited'             // 제한적·관찰
  | 'none'                // 근거없음 → 보류

export type Verdict = 'true' | 'partial' | 'false' | 'unverified'
export type Tier = 'auto_unverified' | 'verified'

export interface Citation {
  portal: string
  title: string
  url?: string
  snippet?: string
}

export interface Triple {
  subject: string          // 정규화 엔티티 (사람/브랜드명 금지)
  subjectSurface?: string
  relation: Relation
  objectDisease: string    // 정규화 질환
  objectSurface?: string
  polarity: Polarity
  strength: Strength
  qualifier?: string | null
  claimText?: string
}

export interface EvidenceRecord {  // 클레임그래프 노드(근거)
  subject: string
  relation: Relation
  objectDisease: string
  evidenceLevel: EvidenceLevel
  strength: Strength
  citation: Citation
  note?: string
}

export type TraceKind = 'normalize' | 'rule' | 'graph_match' | 'boundary' | 'coverage'

export interface TraceStep {  // Why-Trace 한 단계
  kind: TraceKind
  label: string
  detail?: string
  outcome?: string
}

export interface Judgement {
  claimText: string
  triples: Triple[]
  verdict: Verdict
  confidence: number       // 0~1 (보류=0)
  citations: Citation[]
  trace: TraceStep[]
  tier: Tier
  warning?: string         // 위험경고(예: 약물 임의중단)
  disclaimer: string
}
