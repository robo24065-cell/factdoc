// 프리벙킹(사전예방) — 급증 감염병을 '곧 퍼질 가짜정보' 선행지표로. 시민용 예보 + 담당자 배포 카드 초안.
// 외부데이터 불필요: 급증신호(eidGrowthSignal) + 질병청 공식 증상(symptomsFor)·예방(preventionHint).
import { eidGrowthSignal } from './eidStats'
import { preventionHint } from './prevention'
import { findInText, symptomsFor, rumorsFor } from '../engine'

export interface PrebunkItem { name: string; grp: string; growthPct: number; prior: number; recent: number }
export function prebunkRows(n = 6): { week: number; rows: PrebunkItem[] } {
  const g = eidGrowthSignal()
  return { week: g.week, rows: g.rows.slice(0, n).map((r) => ({ name: r.name, grp: r.grp, growthPct: r.growthPct, prior: r.prior, recent: r.recent })) }
}

// 그 질환에 '실제로 퍼진' 가짜정보 목록(질병 맞춤). 없으면 빈 배열(일반 경고는 genericCaution에서 1회만).
export function fakeRumors(name: string): string[] {
  const canon = findInText(name, 'disease')?.canonical ?? name
  const real = rumorsFor(canon) || rumorsFor(name)
  return real && real.length ? real.slice(0, 3) : []
}
// 구체 루머가 KB에 없을 때 보여줄 '일반 주의 패턴' 1줄 — 전파경로 유형별로 다르게(감염병에 '완치 즙'만 반복되는 범람 방지).
export function genericCaution(name: string): string {
  if (/말라리아|뎅기|쯔쯔가무시|sfts|중증열성|라임|일본뇌염|신증후군출혈열|렙토스피라|발진/i.test(name))
    return `특정 즙·기피제 과신 등 검증되지 않은 예방·치료법, "국내엔 없는 병"이라는 방심 등이 퍼질 수 있어요.`
  if (/간염|이질|장티푸스|파라티푸스|대장균|콜레라|노로|식중독|비브리오/i.test(name))
    return `"건강하면 덜 익혀도 괜찮다"·민간 해독요법 등 잘못된 정보가 퍼질 수 있어요. 익혀 먹기·손위생이 기본이에요.`
  if (/수두|홍역|볼거리|이하선염|백일해|폐렴구균|수막구균|결핵|디프테리아|풍진|성홍열/i.test(name))
    return `백신 무용론·자연치유설·과장된 전염력이나 특정 집단 낙인 등 잘못된 정보가 퍼질 수 있어요.`
  return `${name}에 특정 식품·민간요법이 특효·완치라는 검증되지 않은 정보가 퍼질 수 있어요.`
}
// 한 줄 요약(호환) — 실제 루머가 있으면 그것, 없으면 일반 주의 패턴.
export function fakeClaimHint(name: string): string {
  const r = fakeRumors(name)
  if (r.length) return `${r.map((x) => `‘${x}’`).join(', ')} 같은 미검증 정보가 퍼질 수 있어요. 식품·민간요법이 ${name}을(를) 치료·예방한다고 단정할 수 없습니다.`
  return genericCaution(name)
}

// 질병청 공식 사실(증상·예방) 요약
export function officialFacts(name: string): { symptoms: string[]; prevention: string } {
  const sx = symptomsFor(findInText(name, 'disease')?.canonical ?? name)
  return { symptoms: (sx ?? []).slice(0, 5), prevention: preventionHint(name) || '손위생·기침예절 등 기본 수칙을 지켜주세요' }
}

// 공유/배포용 카드 초안(카톡·담당자 공통)
export function prebunkDraft(name: string): string {
  const { symptoms, prevention } = officialFacts(name)
  const real = fakeRumors(name)
  const rumorLines = real.length
    ? [`⚠ 이런 가짜정보를 조심하세요(실제 유포 사례)`, ...real.map((r) => `· "${r}" — 미검증·거짓`)]
    : [`⚠ 이런 잘못된 정보에 주의하세요`, `· ${genericCaution(name)}`]
  return [
    `🚨 ${name} 주의 — 최근 4주 발생이 늘고 있어요`,
    '',
    ...rumorLines,
    '',
    `✅ 질병관리청 공식 정보`,
    `· 주요 증상: ${symptoms.length ? symptoms.join(', ') : '국가건강정보포털 참고'}`,
    `· 예방·행동수칙: ${prevention}`,
    '',
    `📞 의심 증상은 의료기관 또는 질병관리청 콜센터(1339)로 문의하세요.`,
    `출처: 질병관리청 국가건강정보포털·감염병포털 (참고용이며 의료 진단이 아닙니다)`,
  ].join('\n')
}
