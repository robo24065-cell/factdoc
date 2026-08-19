/* ────────────────────────────────────────────────────────────────
   S5 — 통일 필요성 19년 (GohyangOn.tsx 에서 순수 이동, 동작 무변경)

   기록 골든타임 바로 아래에 온다. 두 곡선을 나란히 두는 것이 요지다 —
   1세대가 줄어드는 선과, 통일이 필요하다는 응답이 내려가는 선.

   ★★ 이 구획만 통일부 자료가 아니다. 서울대학교 통일평화연구원의 통일의식조사다.
      화면 전체가 통일부 공공데이터로 만들어져 있으므로, 여기만 출처가 다르다는 것을
      배지·머리글·출처란 세 곳에서 반복해 밝힌다. 섞이면 이 화면의 신뢰가 통째로 깨진다.

    인과를 주장하지 않는다. "같은 기간에 함께 내려갔다"까지만 쓴다.
     한쪽이 다른 쪽의 원인이라는 근거는 이 자료에 없다.
   ──────────────────────────────────────────────────────────────── */

import { SURFACE, TYPE, TEXT, ASOF, FONT } from '../../theme/gohyang'
import type { IsanData, OpinionData } from '../../components/gohyang/pack-types'
import { nf, nf1, ymKo } from '../../components/gohyang/format'
import { PROSE, OutLink } from '../../components/gohyang/bits'

export default function OpinionScene({ opinion, isan }: { opinion: OpinionData; isan: IsanData }) {
  const s = opinion.series.find(x => x.titleKey === 'Uni01' && x.group.menu === 1)
  const ext = s?.extended
  if (!s || !ext || !ext.years.length) return null

  const need = ext.rows.find(r => r.label === '필요하다') ?? ext.rows[0]
  const notNeed = ext.rows.find(r => r.label === '필요하지 않다') ?? ext.rows[ext.rows.length - 1]
  const H0 = opinion.headline.needUnification

  const W = 960, H = 300
  const PAD = { l: 46, r: 116, t: 18, b: 38 }
  const Y1 = 70
  const yrs = ext.years
  const x = (i: number) => PAD.l + (i / Math.max(1, yrs.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - (v / Y1) * (H - PAD.t - PAD.b)
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  /* 출처 전환 지점 — 인포그래픽 XLSX 는 2022 에서 끊기고 그 뒤는 기초보고서 PDF 다.
     한 선으로 그리되 어디서 출처가 바뀌었는지 선 위에 표시한다(데이터가 시킨 것이다). */
  const switchAt = yrs.findIndex(v => ext.sourceByYear[String(v)] !== ext.sourceByYear[String(yrs[0])])
  const yTicks = [0, 20, 40, 60]
  const xTickYears = yrs.filter(v => v % 3 === 1 || v === yrs[yrs.length - 1])

  /* ★ 무대에 세우는 값은 analysis.json opinion-vs-survivors 가 확정한 **겹침 구간**의 값이다.
       그 카드의 caveat 원문: 「장기 계열(2007~2025)은 인포그래픽 XLSX 와 기초보고서 PDF 두 출처를
       이은 것이라(중복 8개 연도에서 최대 1.4%p 차) 상관 계산에는 쓰지 않고 배경으로만 그린다」.
       그런데 무대 타일이 그 배경용 계열의 64.1%→41.1%·-23%p 를 주인공으로 세우고 있었다.
       그래서 단일 출처(기초보고서 표2) 시계열에서 겹침 구간의 첫 해·마지막 해만 뽑아 쓴다 —
       새 값을 만드는 것이 아니라 이미 실린 값을 고르는 것이다. 장기 -23%p 는 배경 곡선 캡션으로 내렸다. */
  const rep = s.reportSeries
  const repNeed = rep?.rows?.find(r => r.label === '필요하다') ?? null
  const OVERLAP_FROM = 2017
  const iFrom = rep?.years?.indexOf(OVERLAP_FROM) ?? -1
  const overlap = rep && repNeed && iFrom >= 0
    ? {
        from: { year: rep.years[iFrom], pct: repNeed.values[iFrom], asOf: rep.asOfByYear?.[String(rep.years[iFrom])] ?? null },
        to: {
          year: rep.years[rep.years.length - 1],
          pct: repNeed.values[repNeed.values.length - 1],
          asOf: rep.asOfByYear?.[String(rep.years[rep.years.length - 1])] ?? null,
        },
      }
    : null
  const overlapDelta = overlap ? Math.round((overlap.to.pct - overlap.from.pct) * 10) / 10 : null

  /* 같은 기간 1세대는 몇 명에서 몇 명이 됐나 — 옆 곡선과 이어 읽히게 하려는 것.
     ★ 두 끝점을 **같은 공표 채널**로 맞춘다: 둘 다 등록현황 월별 CSV 다.
       예전에는 60,130명(CSV 2017-07-31) → 33,272명(게시판 공표 HWP 2026-05-31)을 한 문장에 섞었는데,
       같은 사이트의 지도 패널이 바로 그 조합을 금지한다(「파일데이터가 게시판 공표보다 9개월
       뒤처져 있어 두 값을 한 문장에 섞어 쓰면 기준일이 깨집니다」). */
  const isanFirst = isan.monthly[0]
  const isanLastCsv = isan.monthly[isan.monthly.length - 1]

  return (
    <section>
      {/* ── 시선 경로: eyebrow → 주인공(명조 문장) → 출처 배지 → 보조 3수치 ──
            "두 곡선은 같은 기간에 함께 내려갔습니다"가 이 씬의 주인공이다.
            수치를 잇는 긴 문단은 꼬리로 내렸다 — 삭제하지 않는다. */}
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>같은 기간, 통일이 필요하다는 응답</p>
        <p
          className={`mt-3 max-w-[46rem] text-[1.5rem] font-bold leading-[1.5] sm:text-[1.75rem] ${TEXT.ink}`}
          style={{ fontFamily: FONT.serif }}
        >
          두 곡선은 겹치는 {overlap ? `${overlap.from.year}~${overlap.to.year}` : `${ext.years[0]}~${ext.years[ext.years.length - 1]}`}년에 함께 내려갔습니다.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-md border px-2 py-0.5 ${TYPE.cap} font-semibold ${ASOF.stale.chip}`}>
            통일부 자료 아님 · 서울대학교 통일평화연구원
          </span>
          <span className={`${TYPE.cap} ${TEXT.faint}`}>
            {s.question} · {ext.years[0]}~{ext.years[ext.years.length - 1]}년 {nf(ext.years.length)}개 연도 · 단위 {s.unit}
          </span>
        </div>
        <p className={`mt-2 max-w-[46rem] ${TYPE.sub} ${TEXT.faint}`}>
          여기까지가 자료가 말하는 전부입니다 — 한쪽이 다른 쪽의 원인이라는 근거는 이 자료에 없습니다.
        </p>
      </header>

      <div className="mt-4 max-w-5xl">
        {/* 무대 3수치 — 전부 단일 출처(기초보고서 표2)·겹침 구간. 기준일이 수치에 붙어 다닌다. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={`${SURFACE.inset} p-3`}>
            <p className={`${TYPE.cap} ${TEXT.faint}`}>{overlap?.from.year ?? H0.first.year}년 「{H0.label}」</p>
            <p className={`${TYPE.figureSm} ${TEXT.ink}`}>{nf1(overlap?.from.pct ?? H0.first.pct)}%</p>
            <p className={`mt-0.5 ${TYPE.cap} tabular-nums ${TEXT.faint}`}>조사 기준 {overlap?.from.asOf ?? '미상'}</p>
          </div>
          <div className={`${SURFACE.inset} p-3`}>
            <p className={`${TYPE.cap} ${TEXT.faint}`}>{overlap?.to.year ?? H0.last.year}년 「{H0.label}」</p>
            <p className={`${TYPE.figureSm} ${TEXT.ink}`}>{nf1(overlap?.to.pct ?? H0.last.pct)}%</p>
            <p className={`mt-0.5 ${TYPE.cap} tabular-nums ${TEXT.faint}`}>조사 기준 {overlap?.to.asOf ?? '미상'}</p>
          </div>
          <div className={`${SURFACE.slab} p-3`}>
            <p className={`${TYPE.cap} ${TEXT.faint}`}>겹침 구간 변화폭</p>
            <p className={`${TYPE.figureSm} ${TEXT.blue}`}>{nf1(overlapDelta ?? H0.deltaPp)}%p</p>
            <p className={`mt-0.5 ${TYPE.cap} tabular-nums ${TEXT.faint}`}>
              {overlap ? `${overlap.from.asOf} → ${overlap.to.asOf}` : '기준일 미상'} · 기초보고서 단일 출처
            </p>
          </div>
        </div>
        <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          아래 곡선의 {ext.years[0]}~{ext.years[ext.years.length - 1]}년 장기 계열({nf1(H0.first.pct)}% → {nf1(H0.last.pct)}% · {nf1(H0.deltaPp)}%p)은
          {' '}두 출처를 이어 붙인 것이라 <b className="font-medium">배경</b>으로만 그립니다 — 무대 수치로 쓰지 않습니다.
        </p>

        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[560px]"
            role="img"
            aria-label={`남한 주민의 통일 필요성 응답 추이. 「${H0.label}」는 ${H0.first.year}년 ${nf1(H0.first.pct)}퍼센트에서 ${H0.last.year}년 ${nf1(H0.last.pct)}퍼센트로 ${nf1(Math.abs(H0.deltaPp))}퍼센트포인트 내려갔습니다.`}
          >
            {yTicks.map(v => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
                <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="text-[13px] tabular-nums fill-[#767676]">{v}%</text>
              </g>
            ))}
            {xTickYears.map(t => (
              <text key={t} x={x(yrs.indexOf(t))} y={H - PAD.b + 20} textAnchor="middle" className="text-[13px] tabular-nums fill-[#767676]">{t}</text>
            ))}

            {/* 출처 전환 지점 */}
            {switchAt > 0 && (
              <>
                <line
                  x1={(x(switchAt - 1) + x(switchAt)) / 2}
                  x2={(x(switchAt - 1) + x(switchAt)) / 2}
                  y1={PAD.t}
                  y2={H - PAD.b}
                  className="stroke-[#767676]"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <text x={(x(switchAt - 1) + x(switchAt)) / 2 - 6} y={PAD.t + 12} textAnchor="end" className="text-[12px] fill-slate-500">
                  ← 인포그래픽 XLSX
                </text>
                <text x={(x(switchAt - 1) + x(switchAt)) / 2 + 6} y={PAD.t + 12} className="text-[12px] fill-slate-500">
                  기초보고서 PDF →
                </text>
              </>
            )}

            {/* 필요하지 않다 — 대조선 */}
            <path d={line(notNeed.values)} fill="none" className="stroke-[#767676] dark:stroke-slate-500" strokeWidth={1.8} strokeDasharray="5 4" strokeLinejoin="round" />
            {/* 필요하다 — 주인공 */}
            <path d={line(need.values)} fill="none" className="stroke-[#1a4e9c] dark:stroke-[#7aa9e8]" strokeWidth={2.5} strokeLinejoin="round" />
            {need.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={2.6} className="fill-[#1a4e9c] dark:fill-[#7aa9e8]" />
            ))}

            {/* 끝점 라벨 — 오른쪽 여백에 둔다 */}
            <text x={x(yrs.length - 1) + 8} y={y(need.values[need.values.length - 1]) + 4} className="text-[13px] font-semibold tabular-nums fill-[#14407f] dark:fill-[#7aa9e8]">
              {need.label} {nf1(need.values[need.values.length - 1])}%
            </text>
            <text x={x(yrs.length - 1) + 8} y={y(notNeed.values[notNeed.values.length - 1]) + 4} className="text-[13px] tabular-nums fill-slate-500">
              {notNeed.label} {nf1(notNeed.values[notNeed.values.length - 1])}%
            </text>

            <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1} />
          </svg>
        </div>

        {/* 두 출처를 이어 붙였다는 사실 — 감추면 곡선이 거짓이 된다 */}
        <div className={`mt-3 ${SURFACE.inset} p-3`}>
          <p className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>{ext.note}</p>
          {H0.infographicOnly && H0.basicReportOnly && (
            <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              단일 출처만으로 보면 — 인포그래픽 {H0.infographicOnly.first.year}~{H0.infographicOnly.last.year}년{' '}
              {nf1(H0.infographicOnly.deltaPp)}%p · 기초보고서 {H0.basicReportOnly.first.year}~{H0.basicReportOnly.last.year}년{' '}
              {nf1(H0.basicReportOnly.deltaPp)}%p.
              {s.overlapCheck && ` 두 출처가 겹치는 ${nf(s.overlapCheck.years.length)}개 연도의 최대 차이는 ${nf1(s.overlapCheck.maxAbsDiffPp)}%p입니다.`}
            </p>
          )}
        </div>

        {/* ── 꼬리 — 두 곡선을 수치로 잇는 문단(무대에서 격하, 삭제 아님) ── */}
        <p className={`mt-3 ${SURFACE.inset} p-3 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          위 「기록 골든타임」에서 고향을 기억하는 사람은 등록현황 월별 자료 한 계열로만 보면 {ymKo(isanFirst?.month)}{' '}
          <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf(isanFirst?.total)}명</b>에서 {ymKo(isanLastCsv?.month)}{' '}
          <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf(isanLastCsv?.total)}명</b>으로 줄었습니다
          {' '}(게시판 공표 HWP 는 채널이 달라 여기 끝점으로 섞지 않았습니다).
          {' '}같은 기간 「통일이 필요하다」는 응답은 {overlap?.from.year ?? H0.first.year}년{' '}
          <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf1(overlap?.from.pct ?? H0.first.pct)}%</b>에서 {overlap?.to.year ?? H0.last.year}년{' '}
          <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf1(overlap?.to.pct ?? H0.last.pct)}%</b>로 내려갔습니다
          {' '}(기초보고서 단일 출처).
        </p>

        <div className={`mt-3 border-t pt-3 ${SURFACE.hair}`}>
          <p className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
            <b className={`font-semibold ${TEXT.ink}`}>출처</b> — {opinion.licenseFullText}
          </p>
          <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            {opinion.sources.map((v, i) => (
              <span key={v.name}>
                {i > 0 && ' · '}
                {v.name}
                {v.asOf ? ` (기준 ${v.asOf})` : ''}
              </span>
            ))}
          </p>
          <p className="mt-1.5">
            <OutLink href={opinion.licenseUrl}>통일의식조사 데이터 아카이브</OutLink>
            <span className={`${TYPE.cap} ${TEXT.faint}`}> · </span>
            <OutLink href={s.source.xlsx}>이 지표의 원본 XLSX</OutLink>
          </p>
          <p className={`mt-2 rounded-md p-2 ${SURFACE.inset} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            이 구획의 수치는 <b className="font-medium">통일부 공공데이터가 아닙니다.</b>
            {' '}본 화면의 다른 모든 수치와 <b className="font-medium">출처가 다르며</b>, 조사기관·표본·조사방법이 달라 같은 표에 넣어 계산하면 안 됩니다.
            {' '}여기서는 <b className="font-medium">같은 기간을 나란히 보여주는 참고 자료</b>로만 씁니다.
          </p>
        </div>
      </div>
    </section>
  )
}
