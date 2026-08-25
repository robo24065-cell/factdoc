import { useEffect, useState } from 'react'
import { SURFACE, TYPE, TEXT, PROSE } from '../../theme/gohyang'
import { loadPickStats, lastHome, REGION_NAME, type PickStats } from '../../lib/pickData'
import { readTally, tallyByHome, type PickGame, type Tally } from '../../lib/pickTally'

/* ────────────────────────────────────────────────────────────────
   참여 허브 사이드바 — 두 층
     (가) 기록 계승 우선순위 표 — 통일부 실측(analysis.json), 항상 표시
     (나) 참여 통계 — Supabase 집계, 게임별 표본 20판 이상일 때만.
          미달·실패면 구획째 감춘다. 빈 표·0%·자리표시를 두지 않는다.
   ──────────────────────────────────────────────────────────────── */

const nf = (v: number) => (Number.isFinite(v) ? v.toLocaleString('ko-KR') : '—')

const GAME_LABEL: Record<PickGame, string> = {
  food: '고향의 음식',
  scene: '고향의 풍경',
  word: '북녘의 말',
  balance: '우리 집 기억 밸런스',
}

export default function PickSidebar() {
  const [stats, setStats] = useState<PickStats | null>(null)
  const [tallies, setTallies] = useState<Array<{ game: PickGame; tally: Tally }>>([])
  const mine = lastHome()

  useEffect(() => {
    let alive = true
    void loadPickStats().then(s => { if (alive) setStats(s) })
    void Promise.all(
      (['food', 'scene', 'word', 'balance'] as PickGame[]).map(async g => ({ game: g, tally: await readTally(g) })),
    ).then(rows => {
      if (alive) setTallies(rows.filter((r): r is { game: PickGame; tally: Tally } => r.tally !== null))
    })
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

      {/* ── (나) 참여 통계 — 표본 20판 이상인 게임만, 없으면 구획째 없음 ── */}
      {tallies.length > 0 && (
        <section className={`${SURFACE.card} p-4`}>
          <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>이 화면의 집계 · 통일부 자료 아님</p>
          <h3 className={`mt-1 ${TYPE.h3} ${TEXT.ink}`}>지금까지 많이 뽑힌 것</h3>
          <ul className="mt-2 space-y-3">
            {tallies.map(({ game, tally }) => {
              const byHome = game === 'food' || game === 'scene' ? tallyByHome(tally) : []
              const rows = byHome.length
                ? byHome.slice(0, 3).map(h => ({ label: REGION_NAME.get(h.homeOld) ?? h.homeOld, n: h.n }))
                : tally.rows.slice(0, 3).map(r => ({ label: r.label, n: r.n }))
              if (!rows.length) return null
              return (
                <li key={game}>
                  <p className={`${TYPE.cap} font-semibold ${TEXT.soft}`}>{GAME_LABEL[game]} — 모두 {nf(tally.total)}판 기준</p>
                  <ol className="mt-1 space-y-0.5">
                    {rows.map((r, i) => (
                      <li key={r.label} className={`flex items-baseline justify-between gap-2 ${TYPE.cap} ${TEXT.faint}`}>
                        <span className={PROSE}>{i + 1}. {r.label}</span>
                        <span className="tabular-nums">{nf(r.n)}번</span>
                      </li>
                    ))}
                  </ol>
                </li>
              )
            })}
          </ul>
          <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            이 통계는 이 화면에서 익명으로 모인 선택 횟수이며, 게임 종류·고른 항목·고향 이름 외에는 아무것도 저장하지 않습니다.
          </p>
        </section>
      )}
    </aside>
  )
}
