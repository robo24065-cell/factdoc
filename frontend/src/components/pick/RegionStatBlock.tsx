import { SURFACE, TYPE, TEXT, PROSE } from '../../theme/gohyang'
import type { PickStats, RegionStat } from '../../lib/pickData'

/* ────────────────────────────────────────────────────────────────
   결과 화면의 주인공 구획 — 통일부 실측 (analysis.json 확정값 옮겨 적기)

   · 「기록 계승 우선순위 전국 N위 / 7」 — legacy-priority 의 순위합 정렬.
     「소멸 위기」류 단정 딱지를 붙이지 않는다. n=7 이라 점수가 아니라 순서다
     — 그 주의를 카드 자신이 caveat 로 확정해 두었고, 여기서도 그대로 싣는다.
   · 격차 배수(13.9배)는 최상위-최하위 쌍의 확정값이므로 최하위 고향에서만 인용한다.
     다른 고향에 대해 새 배수를 계산하지 않는다(재계산 금지).
   ──────────────────────────────────────────────────────────────── */

const nf = (v: number) => (Number.isFinite(v) ? v.toLocaleString('ko-KR') : '—')

export default function RegionStatBlock({ stat, stats }: { stat: RegionStat; stats: PickStats }) {
  const isMax = stat.id === stats.densityMax.id
  const isMin = stat.density === Math.min(...stats.regions.map(r => r.density))
  return (
    <section className={`${SURFACE.slab} p-4`} aria-label="이 고향의 기록, 통일부 실측">
      <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>이 고향의 기록 — 통일부 공표 자료 기반</p>
      <p className={`mt-1.5 ${TYPE.figure} ${TEXT.ink}`}>
        전국 {stat.rank}위 <span className={`${TYPE.figureSm} ${TEXT.faint}`}>/ 7</span>
      </p>
      <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
        기록 계승 우선순위 — 줄어드는 속도·기록 공백·식별 공백 세 축의 순위합 {nf(stat.rankSum)} (작을수록 급함)
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-3 sm:justify-start">
          <dt className={`${TYPE.sub} ${TEXT.soft}`}>이 고향이 원적인 생존 신청자</dt>
          <dd className={`${TYPE.sub} font-bold tabular-nums ${TEXT.ink}`}>{nf(stat.survivors)}명</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 sm:justify-start">
          <dt className={`${TYPE.sub} ${TEXT.soft}`}>생존자 1인당 공식 기록</dt>
          <dd className={`${TYPE.sub} font-bold tabular-nums ${TEXT.ink}`}>{stat.density}건</dd>
        </div>
      </dl>
      <p className={`mt-2 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
        {isMax
          ? '일곱 고향 가운데 1인당 기록이 가장 많은 곳입니다 — 여유가 있다는 뜻이지 충분하다는 뜻이 아닙니다.'
          : isMin && stats.gapValue
            ? `1인당 기록이 가장 많은 ${stats.densityMax.name}(${stats.densityMax.density}건)과의 격차는 ${stats.gapValue}입니다.`
            : `1인당 기록이 가장 많은 곳은 ${stats.densityMax.name}(${stats.densityMax.density}건)입니다 — 나란히 두고 보십시오.`}
      </p>
      <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        {/* caveat 의 뜻(n=7 — 점수 아님)은 보존하되 어미만 높임말로 옮긴다 — 원문은 반말이라 화면 톤과 어긋났다.
            기준일은 축을 명시한다: 분모(생존자)만 이 날짜이고 분자(기록 수)는 계열마다 수집일이 다르다(record-density-gap caveat). */}
        일곱 고향을 줄 세운 값이라 점수가 아니라 순서입니다. 생존자 기준일 {stats.asOf} · 기록 수는 계열마다 수집일이 달라
        단일 기준일이 없습니다 · 출처 통일부 공공데이터(이산가족 등록현황 월별·남북관계 연표·디지털박물관 등).
      </p>
    </section>
  )
}
