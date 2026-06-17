// 통합 물자 수요예측(군별 개요) — 질병군별 로버스트 3신호(평년/유행대비/추세)로 방역물자 수요 방향을 제시.
//   단순 직선 외삽(이상치 과대예측·진짜 유행 누락) 대신 demandModel.robustForecast 공유 사용.
//   조달청 현재 발주(procurement)와 교차해 "유행 추세 → 내년 방역물자 수요"를 통합. 병무(군복)는 별도(uniformDemand).
// ⚠ 발생 추세 기반 '방향·우선순위'. 절대 발주량은 조달 이력 연동 시 정밀화. 의학근거 아님(물자기획 보조).
import { GROUPS, robustForecast, type RobustForecast } from './demandModel'

export const SUPPLY_FC_YEAR = 2027
export { GROUPS as DISEASE_GROUPS }

export interface GroupForecast {
  key: string; label: string; supplies: string
  rf: RobustForecast
  base: number; surge: number; current: number; currentYear: number
  histMax: number; histMaxYear: number
  trendDir: RobustForecast['trendDir']; trendPct: number
  outbreaks: { year: number; value: number }[]
  note: string                     // 군별 한 줄 인사이트(데이터에서 도출)
}

function noteFor(rf: RobustForecast): string {
  const ob = rf.outbreaks[0]
  if (rf.sustained) return `매년 꾸준히 증가 중 — 추세적 수요 상승, 지속 증액 필요`
  if (ob) return `평년 ${rf.base.toLocaleString()}건이나 ${ob.year}년 ${ob.value.toLocaleString()}건 일회성 급증 — 유행 대비 버퍼 필수`
  if (rf.histMax > rf.surge * 1.3) return `평년 ${rf.base.toLocaleString()}건이나 ${rf.histMaxYear}년 ${rf.histMax.toLocaleString()}건 대유행 이력 — 서지 대비`
  if (rf.trendDir === '감소') return `발생 안정~감소 추세 — 평년 수준 비축으로 충분`
  return `발생 안정 — 평년 ${rf.base.toLocaleString()}건 수준 비축`
}

export function supplyForecast(): GroupForecast[] {
  return GROUPS.map((g) => {
    const rf = robustForecast(g.members)
    return {
      key: g.key, label: g.label, supplies: g.supplies, rf,
      base: rf.base, surge: rf.surge, current: rf.current, currentYear: rf.currentYear,
      histMax: rf.histMax, histMaxYear: rf.histMaxYear,
      trendDir: rf.trendDir, trendPct: rf.trendPct, outbreaks: rf.outbreaks,
      note: noteFor(rf),
    }
  }).sort((a, b) => b.surge - a.surge)
}
