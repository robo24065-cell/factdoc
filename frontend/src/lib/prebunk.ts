// 프리벙킹(사전예방) — 급증 감염병을 '곧 퍼질 가짜정보' 선행지표로. 시민용 예보 + 담당자 배포 카드 초안.
// 외부데이터 불필요: 급증신호(eidGrowthSignal) + 질병청 공식 증상(symptomsFor)·예방(preventionHint).
import { eidGrowthSignal } from './eidStats'
import { preventionHint } from './prevention'
import { findInText, symptomsFor } from '../engine'

export interface PrebunkItem { name: string; grp: string; growthPct: number; prior: number; recent: number }
export function prebunkRows(n = 6): { week: number; rows: PrebunkItem[] } {
  const g = eidGrowthSignal()
  return { week: g.week, rows: g.rows.slice(0, n).map((r) => ({ name: r.name, grp: r.grp, growthPct: r.growthPct, prior: r.prior, recent: r.recent })) }
}

// 그 질환에 곧 따라붙을 법한 가짜정보 유형 한 줄(시민 경고용) — 단정 아님(예시).
export function fakeClaimHint(name: string): string {
  return `"${name}에 ○○(특정 즙·민간요법·건강식품)가 특효·완치" 같은 미검증 정보가 퍼질 수 있어요. 식품·민간요법이 ${name}을(를) 치료·예방한다고 단정할 수 없어요.`
}

// 질병청 공식 사실(증상·예방) 요약
export function officialFacts(name: string): { symptoms: string[]; prevention: string } {
  const sx = symptomsFor(findInText(name, 'disease')?.canonical ?? name)
  return { symptoms: (sx ?? []).slice(0, 5), prevention: preventionHint(name) || '손위생·기침예절 등 기본 수칙을 지켜주세요' }
}

// 공유/배포용 카드 초안(카톡·담당자 공통)
export function prebunkDraft(name: string): string {
  const { symptoms, prevention } = officialFacts(name)
  return [
    `🚨 ${name} 주의 — 최근 4주 발생이 늘고 있어요`,
    '',
    `⚠ 이런 가짜정보를 조심하세요`,
    `· ${fakeClaimHint(name)}`,
    '',
    `✅ 질병관리청 공식 정보`,
    `· 주요 증상: ${symptoms.length ? symptoms.join(', ') : '국가건강정보포털 참고'}`,
    `· 예방·행동수칙: ${prevention}`,
    '',
    `📞 의심 증상은 의료기관 또는 질병관리청 콜센터(1339)로 문의하세요.`,
    `출처: 질병관리청 국가건강정보포털·감염병포털 (참고용이며 의료 진단이 아닙니다)`,
  ].join('\n')
}
