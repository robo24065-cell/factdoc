import { useEffect, useState } from 'react'
import { SURFACE, TYPE, TEXT, PROSE } from '../../theme/gohyang'
import { loadPickStats, lastHome, type PickStats } from '../../lib/pickData'
import TallyDeck from './TallyDeck'

/* ────────────────────────────────────────────────────────────────
   참여 허브 사이드바 — 두 층 (출처가 절대 섞이지 않게 표면·머리띠로 가른다)
     (가) 기록 계승 우선순위 표 — 통일부 실측(analysis.json), 항상 표시. SURFACE.slab.
     (나) 실시간 실선택 순위덱 — Supabase 실집계(TallyDeck). SURFACE.card.
          0판도 「아직 참여 기록이 없습니다」로 정직하게 보여 주고(구 20판 문턱 폐지),
          읽기 실패면 덱이 스스로 조용히 사라진다. 「가장 많이 뽑힌 고향」은 덱 꼬리로 흡수.
   ──────────────────────────────────────────────────────────────── */

const nf = (v: number) => (Number.isFinite(v) ? v.toLocaleString('ko-KR') : '—')

export default function PickSidebar() {
  const [stats, setStats] = useState<PickStats | null>(null)
  const mine = lastHome()

  useEffect(() => {
    let alive = true
    void loadPickStats().then(s => { if (alive) setStats(s) })
    return () => { alive = false }
  }, [])

  return (
    <aside className="space-y-4" aria-label="기록 계승 우선순위와 참여 통계">
      {/* ── (가) 통일부 실측 — 항상 표시 ── */}
      {stats && (
        <section className={`${SURFACE.slab} p-4`}>
          <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>통일부 공표 자료 기반</p>
          <h3 className={`mt-1 ${TYPE.h3} ${TEXT.ink}`}>기록 계승 우선순위</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className={`border-b ${SURFACE.line}`}>
                  <th scope="col" className={`py-1.5 pr-2 ${TYPE.cap} font-semibold ${TEXT.faint}`}>순위</th>
                  <th scope="col" className={`py-1.5 pr-2 ${TYPE.cap} font-semibold ${TEXT.faint}`}>고향</th>
                  <th scope="col" className={`py-1.5 pr-2 text-right ${TYPE.cap} font-semibold ${TEXT.faint}`}>1인당 기록</th>
                  <th scope="col" className={`py-1.5 text-right ${TYPE.cap} font-semibold ${TEXT.faint}`}>남은 분</th>
                </tr>
              </thead>
              <tbody>
                {stats.regions.map(r => (
                  <tr key={r.id} className={`border-b ${SURFACE.hair} ${mine === r.id ? 'bg-[#eef3fb] dark:bg-[#16202c]' : ''}`}>
                    <td className={`py-1.5 pr-2 ${TYPE.cap} tabular-nums ${TEXT.soft}`}>{r.rank}</td>
                    <td className={`py-1.5 pr-2 ${TYPE.cap} ${TEXT.ink} ${PROSE}`}>
                      {r.name}
                      {mine === r.id && (
                        <span className={`ml-1 ${TYPE.cap} font-bold ${TEXT.blue}`}>
                          <span aria-hidden="true">●</span> 내가 고른 고향
                        </span>
                      )}
                    </td>
                    <td className={`py-1.5 pr-2 text-right ${TYPE.cap} tabular-nums ${TEXT.soft}`}>{r.density}건</td>
                    <td className={`py-1.5 text-right ${TYPE.cap} tabular-nums ${TEXT.soft}`}>{nf(r.survivors)}명</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            일곱 고향을 줄 세운 값이라 점수가 아니라 순서입니다 — 줄어드는 속도·기록 공백·식별 공백 세 축의 순위합.
            {/* 「남은 분」은 원적 확인분만 센다 — 홈의 전체 생존 신청자 수와 어긋나 보이지 않게 그 사실을 적는다 */}
            {' '}남은 분은 원적이 확인된 생존 신청자만 센 수입니다(전체 생존 신청자의 51.8%).
            {' '}생존자 기준일 {stats.asOf}.
          </p>
        </section>
      )}

      {/* ── (나) 실시간 실선택 순위덱 — 실집계. 읽기 실패면 덱이 스스로 사라진다 ── */}
      <TallyDeck games={['food', 'scene', 'word', 'balance']} variant="sidebar" />
    </aside>
  )
}
