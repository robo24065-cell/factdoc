/* ────────────────────────────────────────────────────────────────
   S4 — 기록 골든타임 (GohyangOn.tsx 에서 순수 이동, 동작 무변경)

   실측(2017-07~2025-08 등록현황 CSV 98개월 + 2026-03~05 공표 HWP 3개월)과
   추계(2026~2050)를 한 축 위에 올린다.
    추계는 통일부 공표 통계가 아니라 이 시제품의 계산 결과다 — 선 모양·배지·각주 3중으로 구분한다.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { IsanData, ProjData } from '../../components/gohyang/pack-types'
import { nf, ymKo } from '../../components/gohyang/format'
import { CARD, PROSE, OutLink } from '../../components/gohyang/bits'
import { TYPE, TEXT } from '../../theme/gohyang'
import { FOCUS } from '../../components/gohyang/bits'

export default function ClockScene({ isan, proj }: { isan: IsanData; proj: ProjData }) {
  const W = 960, H = 340
  const PAD = { l: 62, r: 20, t: 20, b: 40 }
  const X0 = 2017.4, X1 = 2050.7
  const Y1 = 62000

  const tOf = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})/)
    return m ? Number(m[1]) + (Number(m[2]) - 1) / 12 : NaN
  }
  const x = (t: number) => PAD.l + ((t - X0) / (X1 - X0)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - (v / Y1) * (H - PAD.t - PAD.b)

  const csv = isan.monthly.map(m => ({ t: tOf(m.month), v: m.total }))
  const hwp = [...(isan.latest.previousMonths ?? []), isan.latest]
    .map(s => ({ t: tOf(s.asOf), v: s.survivors.total, asOf: s.asOf }))
    .sort((a, b) => a.t - b.t)
  const fut = proj.byYear.map(r => ({ t: tOf(r.asOf), lo: r.expected, hi: r.expectedCalibrated }))

  const path = (pts: Array<{ t: number; v: number }>) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')

  const bandPath =
    fut.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.hi).toFixed(1)}`).join(' ') +
    ' ' +
    [...fut].reverse().map(p => `L${x(p.t).toFixed(1)},${y(p.lo).toFixed(1)}`).join(' ') +
    ' Z'

  const yTicks = [0, 10000, 20000, 30000, 40000, 50000, 60000]
  const xTicks = [2020, 2025, 2030, 2035, 2040, 2045, 2050]

  /* 값이 보이게 — 손가락/커서/키보드로 짚으면 그 시점의 수를 띄운다.
     그래프가 모양만 보여주고 "이 지점이 몇 명인지 모르겠다"는 지적(2026-08-19)의 답. */
  const scrubPts = useMemo(() => ([
    ...csv.map((d, i) => ({ t: d.t, v: d.v, label: ymKo(isan.monthly[i]?.month), kind: 'real' as const })),
    ...hwp.map(d => ({ t: d.t, v: d.v, label: `${ymKo(d.asOf)} 공표`, kind: 'real' as const })),
    ...fut.map((d, i) => ({ t: d.t, v: Math.round((d.lo + d.hi) / 2), label: `${proj.byYear[i]?.year}년 (계산)`, kind: 'proj' as const })),
  ].filter(q => Number.isFinite(q.t)).sort((a, b) => a.t - b.t)), [csv, hwp, fut, isan, proj])
  const lastRealIdx = useMemo(() => {
    for (let i = scrubPts.length - 1; i >= 0; i--) if (scrubPts[i].kind === 'real') return i
    return 0
  }, [scrubPts])
  const [scrub, setScrub] = useState(lastRealIdx)
  const [scrubbing, setScrubbing] = useState(false)
  useEffect(() => { setScrub(lastRealIdx) }, [lastRealIdx])
  const svgRef = useRef<SVGSVGElement>(null)
  const pickAt = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !r.width) return
    const vx = ((clientX - r.left) / r.width) * W
    let best = 0, bd = Infinity
    scrubPts.forEach((q, i) => { const d = Math.abs(x(q.t) - vx); if (d < bd) { bd = d; best = i } })
    setScrub(best)
  }
  const sc = scrubPts[scrub]

  /* 1만 명 하회 구간 — 원값 시나리오(빠른 쪽)와 교정 시나리오(느린 쪽)의 두 해 사이 */
  const [m10a, m10b] = proj.milestoneRange.below10000.split('~').map(Number)
  const seam = tOf(isan.latest.asOf)

  /* ★ 아래 그래프의 aria-label 은 화면낭독기에만 가는 문장이라 눈으로는 안 잡힌다 —
     그 문장에서도 공표 채널을 섞지 않는다. 등록현황 월별 자료(CSV) 끝점끼리 잇고,
     게시판 공표 값은 채널을 밝혀 따로 말한다. */
  return (
    <section>
      {/* ── 시선 경로: eyebrow → 주인공(2038~2041) → 계산 결과 필 → 보조 2줄 ──
            공표 생존자·2040 전망 타일은 보조로 격하하고, 이정표 4종은 꼬리로 내린다.
            무대 위 숫자: 2038~2041(주인공) + 공표 생존자 + 2040 전망 = 3. */}
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>기록 골든타임 — 고향을 기억하는 사람이 남아 있는 시간</p>
        <p className={`mt-3 ${TYPE.figure} ${TEXT.ink}`}>
          {proj.headline.below10000Year}
          <span className="ml-2 align-baseline text-[1.375rem] font-bold">년</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-500`}>
            공식 통계 아님 · 계산 결과
          </span>
          <span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>기준 인원 {ymKo(proj.headline.asOf)} 공표</span>
        </div>
        <p className={`mt-3 max-w-[46rem] ${TYPE.body} ${TEXT.soft}`}>
          이 무렵이 되면 살아 계신 신청자가 1만 명보다 적어질 것으로 계산됩니다.
          지금 공표 생존자는 <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf(proj.headline.survivors)}명</b>,
          {' '}2040년 전망은 <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{proj.headline.survivors2040}명</b>(범위)입니다.
        </p>
        <p className={`mt-1 max-w-[46rem] ${TYPE.sub} ${TEXT.faint}`}>
          실측 {nf(isan.monthly.length)}개월(2017~2025) + 공표 3개월(2026) 위에 생잔 추계를 얹은 것입니다.
        </p>
      </header>

      <div className={`mt-4 max-w-5xl ${CARD} p-4`}>
        <div className="overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[560px] touch-none select-none"
            tabIndex={0}
            onPointerDown={e => { setScrubbing(true); pickAt(e.clientX); (e.target as Element).setPointerCapture?.(e.pointerId) }}
            onPointerMove={e => { if (scrubbing || e.pointerType === 'mouse') pickAt(e.clientX) }}
            onPointerUp={() => { setScrubbing(false); setScrub(lastRealIdx) }}
            onPointerLeave={() => { if (!scrubbing) setScrub(lastRealIdx) }}
            onKeyDown={e => {
              if (e.key === 'ArrowLeft') { e.preventDefault(); setScrub(i => Math.max(0, i - 1)) }
              if (e.key === 'ArrowRight') { e.preventDefault(); setScrub(i => Math.min(scrubPts.length - 1, i + 1)) }
            }}
            role="img"
            aria-label={`이산가족 생존 신청자 추이와 전망. 등록현황 월별 자료로는 ${ymKo(isan.monthly[0]?.month)} ${nf(isan.monthly[0]?.total)}명에서 ${ymKo(isan.monthly.at(-1)?.month)} ${nf(isan.monthly.at(-1)?.total)}명으로 줄었습니다. 게시판 공표 자료로는 ${ymKo(isan.latest.asOf)} ${nf(isan.latest.survivors.total)}명입니다. 추계로는 ${proj.milestoneRange.below10000}년에 1만 명을 밑돌 것으로 계산됩니다.`}
          >
            {/* 가로 눈금 */}
            {yTicks.map(v => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
                <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="text-[13px] tabular-nums fill-[#767676]">
                  {v === 0 ? '0' : `${v / 10000}만`}
                </text>
              </g>
            ))}
            {xTicks.map(t => (
              <text key={t} x={x(t)} y={H - PAD.b + 20} textAnchor="middle" className="text-[13px] tabular-nums fill-[#767676]">
                {t}
              </text>
            ))}

            {/* 1만 명 기준선 + 하회 구간 */}
            <rect x={x(m10a)} y={PAD.t} width={Math.max(2, x(m10b) - x(m10a))} height={H - PAD.t - PAD.b} className="fill-[#4b79bb]/10" />
            <line x1={PAD.l} x2={W - PAD.r} y1={y(10000)} y2={y(10000)} className="stroke-[#4b79bb]" strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={x(m10b) + 6} y={y(10000) - 8} className="text-[13px] font-semibold fill-[#14407f] dark:fill-[#7aa9e8]">
              1만 명 하회 {proj.milestoneRange.below10000}
            </text>

            {/* 추계 범위 밴드 */}
            <path d={bandPath} className="fill-slate-400/25" />
            <path d={path(fut.map(p => ({ t: p.t, v: p.lo })))} fill="none" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth={2} strokeDasharray="7 5" />
            <path d={path(fut.map(p => ({ t: p.t, v: p.hi })))} fill="none" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth={2} strokeDasharray="7 5" />

            {/* 실측 — 등록현황 CSV */}
            <path d={path(csv)} fill="none" className="stroke-[#1a4e9c] dark:stroke-[#7aa9e8]" strokeWidth={2.5} strokeLinejoin="round" />

            {/* 실측 — 공표 HWP 3개월 (다른 채널이므로 이어 붙이지 않고 점으로 찍는다) */}
            {hwp.map(p => (
              <circle key={p.asOf} cx={x(p.t)} cy={y(p.v)} r={3.5} className="fill-[#14407f] stroke-white dark:fill-[#7aa9e8] dark:stroke-slate-900" strokeWidth={1.2} />
            ))}

            {/* 실측 / 추계 경계 */}
            <line x1={x(seam)} x2={x(seam)} y1={PAD.t} y2={H - PAD.b} className="stroke-[#767676]" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(seam) - 6} y={PAD.t + 12} textAnchor="end" className="text-[12px] fill-slate-500">← 실측</text>
            <text x={x(seam) + 6} y={PAD.t + 12} className="text-[12px] fill-slate-500">추계 →</text>

            <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1} />

            {/* 짚은 지점의 값 — 마지막 실측값을 기본으로 늘 하나는 떠 있다 */}
            {sc && (() => {
              const cx = x(sc.t), cy = y(sc.v)
              const bw = 150, bh = 44
              const bx = Math.min(Math.max(cx - bw / 2, PAD.l), W - PAD.r - bw)
              const by = cy - bh - 12 < PAD.t ? cy + 14 : cy - bh - 12
              return (
                <g>
                  <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b} className="stroke-[#1a4e9c] dark:stroke-[#7aa9e8]" strokeWidth={1} strokeDasharray="3 3" />
                  <circle cx={cx} cy={cy} r={5.5} fill="#fff" className={sc.kind === 'proj' ? 'stroke-slate-500' : 'stroke-[#1a4e9c]'} strokeWidth={2.5} />
                  <rect x={bx} y={by} width={bw} height={bh} rx={5} fill="#fff" className="stroke-slate-300" />
                  <text x={bx + 10} y={by + 17} className="text-[12px] fill-slate-500">{sc.label}</text>
                  <text x={bx + 10} y={by + 36} className="text-[16px] font-bold fill-slate-900">
                    {nf(sc.v)}명{sc.kind === 'proj' ? ' (계산)' : ''}
                  </text>
                </g>
              )
            })()}
          </svg>
        </div>
        <p className={`mt-1.5 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
          그래프를 손가락으로 짚거나 커서를 올리면 그 시점의 인원이 나옵니다. 키보드 좌우 화살표로도 움직입니다.
        </p>

        {/* 범례 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" className="stroke-[#1a4e9c] dark:stroke-[#7aa9e8]" strokeWidth="2.5" /></svg>실측 — 등록현황 월별 자료 (2017.7~{ymKo(isan.monthly.at(-1)?.month)})
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <svg width="22" height="8" aria-hidden="true"><circle cx="11" cy="4" r="3.5" className="fill-[#14407f] dark:fill-[#7aa9e8]" /></svg>실측 — 게시판 공표 3개월 (2026.3~5)
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" className="stroke-slate-500" strokeWidth="2" strokeDasharray="7 5" /></svg>추계 범위 (생명표 원값 ~ 실측 교정)
          </span>
        </div>

        {/* 각주(꼬리) — 이정표·가정·출처. 이정표 4종은 무대 숫자 상한(3)에 걸려
            타일에서 캡션 한 줄로 격하했다 — 값은 전부 그대로 남는다. */}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className={`text-[11px] leading-relaxed tabular-nums text-slate-500 ${PROSE}`}>
            <b className="font-semibold text-slate-600 dark:text-slate-300">하회 전망</b> —
            {' '}2만 명 {proj.milestoneRange.below20000}년 · 1만 명 {proj.milestoneRange.below10000}년
            {' '}· 5천 명 {proj.milestoneRange.below5000}년 · 1천 명 {proj.milestoneRange.below1000}년
          </p>
          <p className={`max-w-prose text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
            <b className="font-semibold text-slate-600 dark:text-slate-300">방법</b> — {proj.method.summary}
          </p>
          <p className={`mt-1 max-w-prose text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
            <b className="font-semibold text-slate-600 dark:text-slate-300">두 시나리오</b> — 위쪽 선: {proj.method.scenarios.expectedCalibrated} /
            아래쪽 선: {proj.method.scenarios.expected} · {proj.milestoneRange.note}
          </p>
          <details className="mt-2">
            <summary className={`inline-flex min-h-[48px] cursor-pointer list-none items-center text-[11px] font-medium text-[#1a4e9c] dark:text-[#7aa9e8] [&::-webkit-details-marker]:hidden ${FOCUS}`}>가정 {proj.assumptions.length}가지 전부 보기 ▾
            </summary>
            <ul className="mt-1.5 space-y-1">
              {proj.assumptions.map((a, i) => (
                <li key={i} className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>· {a}</li>
              ))}
            </ul>
          </details>
          {/* 표 코드(tblId)는 통계청 내부 식별자다 — 화면에는 연도와 최종수정일만 남긴다 */}
          <p className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>생명표: {proj.sources[0]?.name} ({proj.lifeTable.year}년 · 최종수정 {proj.lifeTable.published}) ·{' '}
            <OutLink href={proj.sources[0]?.url}>원본 데이터</OutLink>
            {' · '}기준 인원: 통일부 이산가족 신청 현황 {proj.headline.asOf} ·{' '}
            <OutLink href={isan.latest.attachment}>공표 원문</OutLink>
          </p>
          <p className={`mt-1.5 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 ${PROSE}`}><b className="font-medium">이 곡선의 미래 구간은 통일부가 발표한 값이 아니라 본 시제품이 계산한 추계</b>입니다.{' '}
            {proj.headline.note}
          </p>
        </div>
      </div>
    </section>
  )
}
