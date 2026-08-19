/* ────────────────────────────────────────────────────────────────
   S3 — 지도 + 지역 패널 (도구 씬 · 씬 규칙 면제 · 무모션 구역)

   GohyangOn.tsx 에서 순수 이동 — 동작 무변경.
   지도·패널·GuideBox·날씨가 이 파일에 있다. 손이 닿는 도구는 움직이지 않는다:
   이 씬 안에서는 리빌·핀 어떤 모션도 쓰지 않는다.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { Link } from 'react-router-dom'
import { coverageEndOf, datasetLabel } from '../../engine/nk-search.mjs'
import { SURFACE, TYPE, TEXT, ASOF, BTN, josa } from '../../theme/gohyang'
import type { Level, MapCity, Mode, MuseumRec, Pack, Sel } from '../../components/gohyang/pack-types'
import { PACK } from '../../components/gohyang/pack-types'
import { nf, nf1, ymKo, ymdKo, gapText, clean, museumDate, formKo, notice } from '../../components/gohyang/format'
import {
  FOCUS, CARD, PROSE, TONE, CHORO, CHORO_SWATCH,
  AsOfPill, AsOfLine, OutLink, Block, StatRow,
} from '../../components/gohyang/bits'
import { membersOf, buildPanel, museumFor, imgSrcOf } from '../../components/gohyang/model'
import { scrollToEl, prefersReduced } from '../../components/gohyang/motion'

/* 고향 도우미(페르소나 AI) — LLM 4원칙(CLAUDE.md §5)의 화면 쪽 절반.
   사실 묶음은 buildGuideFacts 가 데이터 팩에서 만들고, LLM 은 프록시(/api/llm, kind='guide')를
   거쳐 문장으로 엮기만 한다. 검증 실패·네트워크 실패는 전부 fallbackGuide(규칙 문장)로 되돌린다. */
import { buildGuideFacts, fallbackGuide } from '../../engine/nk-guide.mjs'
import { probe as probeLLM, guideWithLLM } from '../../engine/nk-llm-proxy.mjs'
/* 기상은 화면이 직접 부르는 유일한 계열 — 지도와 기억 카드가 같은 호출을 쓴다 */
import { useLiveWeather } from '../../lib/gohyangWeather'

/* ══════════════════════ 지도 ══════════════════════ */

type Shape = {
  key: string           // 선택 키 (modern=지역명, old=구역id)
  label: string
  paths: string[]
  marker?: { cx: number; cy: number; r: number }
  centroid: [number, number]
  value: number | null  // 채색 지표 (null = 해당 축에 집계 항목 없음)
  step: number
  tipRows: string[]
}

function tone(v: number | null, max: number): number {
  if (v == null || v <= 0 || max <= 0) return 0
  /* 제곱근 눈금 — 함경북도 19,760 이 나머지를 전부 눌러 버려서
     선형으로 칠하면 다른 10곳이 한 색이 된다(실측). */
  const t = Math.sqrt(v / max)
  return Math.min(5, Math.max(1, Math.ceil(t * 5)))
}

function useShapes(pack: Pack | null, mode: Mode): { shapes: Shape[]; max: number; metric: string; metricAsOf: string } {
  return useMemo(() => {
    if (!pack) return { shapes: [], max: 0, metric: '', metricAsOf: '' }
    const byOrigin = new Map(pack.isan.latest.survivors.byOrigin.entries.map(e => [e.label, e]))

    if (mode === 'old') {
      const raw = pack.map.regionsOld.map(o => {
        const memberNames = Object.keys(pack.region.regions).filter(k => pack.region.regions[k].isanOrigin?.key === o.id)
        const latestKey = memberNames.map(n => pack.region.regions[n].isanOrigin?.latestKey).find(Boolean)
        const e = latestKey ? byOrigin.get(latestKey) : undefined
        return { o, memberNames, value: e ? e.n : null, pct: e ? e.pct : null }
      })
      const max = Math.max(...raw.map(r => r.value ?? 0), 1)
      return {
        metric: '이 지역이 고향인 이산가족 생존 신청자',
        metricAsOf: pack.isan.latest.asOf,
        max,
        shapes: raw.map(({ o, memberNames, value, pct }) => ({
          key: o.id,
          label: o.name,
          paths: o.paths,
          marker: o.marker,
          centroid: o.centroid,
          value,
          step: tone(value, max),
          tipRows: [
            value == null ? '이산가족 생존자 — 집계 항목 없음' : `이산가족 생존자 ${nf(value)}명 (${nf1(pct)}%)`,
            `현행 ${memberNames.join('·') || '대응 구역 없음'}`,
          ],
        })),
      }
    }

    const raw = Object.keys(pack.region.regions).map(name => {
      const r = pack.region.regions[name]
      const geo = r.mapRegionId ? pack.map.regionsModern.find(m => m.id === r.mapRegionId) : null
      const city = pack.map.cities.find(c => c.name === name)
      return { name, r, geo, city }
    })
    const max = Math.max(...raw.map(x => x.r.defectorOrigin?.total ?? 0), 1)
    return {
      metric: '탈북민 재북 출신지 (누적)',
      metricAsOf: raw.find(x => x.r.defectorOrigin)?.r.defectorOrigin?.asOf ?? '',
      max,
      shapes: raw
        .filter(x => x.geo || x.city)
        .map(({ name, r, geo, city }) => ({
          key: name,
          label: name,
          paths: geo ? [geo.path] : [],
          marker: geo ? undefined : { cx: city!.x, cy: city!.y, r: 11 },
          centroid: (geo ? geo.centroid : [city!.x, city!.y]) as [number, number],
          value: r.defectorOrigin?.total ?? null,
          step: tone(r.defectorOrigin?.total ?? null, max),
          tipRows: [
            r.defectorOrigin ? `탈북민 출신 ${nf(r.defectorOrigin.total)}명` : '탈북민 출신지 — 집계 항목 없음',
            `연표 ${nf(r.events.total)}건 · 보도 ${nf(r.briefings)}건 · 동향 ${nf(r.trends)}건`,
          ],
        })),
    }
  }, [pack, mode])
}

function NkMapView({
  pack, mode, sel, onSelect,
}: {
  pack: Pack; mode: Mode; sel: Sel | null; onSelect: (s: Sel) => void
}) {
  const { shapes, max, metric, metricAsOf } = useShapes(pack, mode)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; key: string } | null>(null)
  const selKey = sel ? (sel.mode === 'modern' ? sel.key : sel.id) : null
  const hovered = tip ? shapes.find(s => s.key === tip.key) : null

  const move = (e: ReactMouseEvent, key: string) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    setTip({ x: Math.min(Math.max(e.clientX - r.left, 96), Math.max(96, r.width - 96)), y: e.clientY - r.top, key })
  }
  const pick = (key: string) => onSelect(mode === 'modern' ? { mode: 'modern', key } : { mode: 'old', id: key })

  /* 도시 표시 — 현행 지도에서만. 남포·개성은 별도 폴리곤이 없어 이 점이 유일한 클릭 지점이다. */
  const cities = mode === 'modern' ? pack.map.cities : []
  const cityTarget = (c: MapCity) =>
    pack.region.regions[c.name]
      ? c.name
      : Object.keys(pack.region.regions).find(k => pack.region.regions[k].mapRegionId === c.regionId) ?? null

  return (
    <div>
      <div ref={wrapRef} className="relative">
        <svg
          viewBox={pack.map.viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="h-auto w-full max-h-[68vh] select-none"
          role="group"
          aria-label={`북한 ${mode === 'old' ? '광복 당시 구행정구역' : '현행 행정구역'} 지도. 지역 ${shapes.length}곳. 각 지역을 선택하면 오른쪽에 상세 정보가 열립니다.`}
          onMouseLeave={() => setTip(null)}
        >
          {shapes.map(s => {
            const on = s.key === selKey
            const hot = tip?.key === s.key
            return (
              <g
                key={s.key}
                tabIndex={0}
                role="button"
                aria-label={`${s.label}. ${s.tipRows.join('. ')}`}
                aria-pressed={on}
                className={`cursor-pointer outline-none ${FOCUS}`}
                onClick={() => pick(s.key)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s.key) }
                }}
                onMouseMove={e => move(e, s.key)}
                onMouseEnter={e => move(e, s.key)}
                onFocus={() => setTip({ x: s.centroid[0], y: 0, key: s.key })}
                onBlur={() => setTip(t => (t?.key === s.key ? null : t))}
              >
                {s.paths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fillRule="evenodd"
                    className={`${CHORO[s.step]} ${
                      on
                        ? 'stroke-blue-800 dark:stroke-blue-300'
                        : hot
                          ? 'stroke-slate-900 dark:stroke-white'
                          : 'stroke-white dark:stroke-slate-900'
                    } transition-[stroke]`}
                    strokeWidth={on ? 3 : hot ? 2 : 0.8}
                    strokeLinejoin="round"
                  />
                ))}
                {s.marker && (
                  <circle
                    cx={s.marker.cx}
                    cy={s.marker.cy}
                    r={s.marker.r}
                    fillRule="evenodd"
                    className={`${CHORO[s.step]} ${on ? 'stroke-blue-800 dark:stroke-blue-300' : 'stroke-slate-500'}`}
                    strokeWidth={on ? 3 : 1.6}
                    strokeDasharray="4 3"
                  />
                )}
                {/* 라벨 — 폴리곤이 없는 마커형도 이름이 보여야 클릭 대상이 된다 */}
                <text
                  x={s.centroid[0]}
                  y={s.centroid[1]}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={`pointer-events-none text-[15px] font-semibold ${
                    s.step >= 4 ? 'fill-white' : 'fill-slate-700 dark:fill-slate-100'
                  }`}
                  style={{ paintOrder: 'stroke', strokeWidth: s.step >= 4 ? 0 : 3 }}
                >
                  {s.label}
                </text>
              </g>
            )
          })}

          {cities.map(c => {
            const target = cityTarget(c)
            const own = pack.region.regions[c.name] != null
            if (!target) return null
            return (
              <g
                key={c.name}
                className={`cursor-pointer outline-none ${FOCUS}`}
                tabIndex={own ? 0 : -1}
                role={own ? 'button' : undefined}
                aria-label={own ? `${c.name} — 별도 지역 데이터가 있습니다` : undefined}
                onClick={() => pick(target)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(target) }
                }}
                onMouseMove={e => move(e, target)}
              >
                <circle cx={c.x} cy={c.y} r={own ? 6 : 4} className="fill-slate-900 stroke-white dark:fill-white dark:stroke-slate-900" strokeWidth={1.5} />
                <text
                  x={c.x + 9}
                  y={c.y + 4}
                  className="pointer-events-none text-[13px] fill-slate-600 dark:fill-slate-300"
                  style={{ paintOrder: 'stroke', strokeWidth: 3 }}
                >
                  {c.name}
                </text>
              </g>
            )
          })}
        </svg>

        {hovered && tip && (
          <div
            className="pointer-events-none absolute z-20 w-48 -translate-x-1/2 -translate-y-[115%] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
            style={{ left: tip.x, top: Math.max(tip.y, 8) }}
            role="status"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{hovered.label}</p>
            {hovered.tipRows.map((t, i) => (
              <p key={i} className={`mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>{t}</p>
            ))}
            <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">눌러서 자세히 보기 →</p>
          </div>
        )}
      </div>

      {/* 범례 — 무엇으로 칠했는지, 그 값이 언제 것인지 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
        <span className={`text-[11px] font-medium text-slate-600 dark:text-slate-300 ${PROSE}`}>색 = {metric}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="text-[11px] tabular-nums text-slate-400">0</span>
          {CHORO_SWATCH.slice(1).map(c => <span key={c} className={`h-3 w-5 rounded-sm ${c}`} />)}
          <span className="text-[11px] tabular-nums text-slate-400">{nf(max)}명</span>
        </span>
        {metricAsOf && <span className="text-[11px] tabular-nums text-slate-500">기준 {ymKo(metricAsOf)}</span>}
        <AsOfPill level={notice(metricAsOf || pack.region.builtAt, 'live').level as Level} size="sm" />
      </div>
    </div>
  )
}

/* ══════════════════════ 실시간 기상 ══════════════════════
   좌표표와 호출 규약은 lib/gohyangWeather.ts 하나뿐이다 — 기억 카드도 같은 것을 쓴다.
   빌드에 굽지 않고 브라우저가 직접 부르는 이유는 그 파일 머리에 적어 두었다. */

function LiveWeatherRows({ names }: { names: string[] }) {
  const { rows, state } = useLiveWeather(names)
  if (state === 'loading') {
    return <p className="text-[11px] text-slate-400">현재 기상을 불러오는 중…</p>
  }
  if (state !== 'ok') return null  // 실패하면 조용히 사라진다 — 아래 NOAA 최종 관측이 남는다

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2">
        <AsOfPill level="live" size="sm" />
        <span className={`text-sm font-semibold ${TONE.emerald.text} ${PROSE}`}>지금 이 시각 고향의 날씨</span>
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map(w => (
          <li key={w.name} className="flex items-baseline justify-between gap-2">
            <span className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>
              {w.name}
              <span className="ml-1 text-[11px] text-slate-400">
                {w.at ? `${w.at.slice(5, 10).replace('-', '월 ')}일 ${w.at.slice(11, 16)} 평양시각` : ''}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <b className="text-base font-semibold tabular-nums text-slate-900 dark:text-white">{nf1(w.tempC)}℃</b>
              {Number.isFinite(w.maxC) && (
                <span className="ml-1 text-[11px] tabular-nums text-slate-400">최고 {nf1(w.maxC)} · 최저 {nf1(w.minC)}</span>
              )}
              {w.prcpMm > 0 && <span className="ml-1 text-[11px] tabular-nums text-blue-600">비 {nf1(w.prcpMm)}㎜</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>오늘 고향의 날씨입니다. <b className="font-medium">지금 관측된 값을 그대로 가져왔습니다.</b>
        {' '}이 값만은 저장하지 않고 화면을 열 때마다 새로 받습니다.
      </p>
      <p className="mt-1.5">
        <span className="text-[11px] text-slate-400">출처 Open-Meteo (무료·인증 없음) · </span>
        <OutLink href="https://open-meteo.com/">원본 API</OutLink>
      </p>
    </div>
  )
}

function Spark({ rows, label }: { rows: Array<{ month: string; v: number }>; label: string }) {
  if (rows.length < 2) return null
  const W = 320, H = 72, P = 4
  const max = Math.max(...rows.map(r => r.v))
  const x = (i: number) => P + (i / (rows.length - 1)) * (W - P * 2)
  const y = (v: number) => H - P - (v / (max || 1)) * (H - P * 2)
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(rows.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`
  const first = rows[0], last = rows[rows.length - 1]
  const drop = first.v > 0 ? Math.round((1 - last.v / first.v) * 100) : 0
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`${label} 월별 추이. ${ymKo(first.month)} ${nf(first.v)}명에서 ${ymKo(last.month)} ${nf(last.v)}명으로 ${drop}% 감소.`}>
        <path d={area} className="fill-blue-500/15" />
        <path d={line} fill="none" className="stroke-blue-600 dark:stroke-blue-400" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(rows.length - 1)} cy={y(last.v)} r={3} className="fill-blue-600 dark:fill-blue-400" />
      </svg>
      <figcaption className="mt-1 flex items-baseline justify-between text-[11px] tabular-nums text-slate-500">
        <span>{ymKo(first.month)} {nf(first.v)}명</span>
        <span className="font-medium text-slate-600 dark:text-slate-300">-{drop}%</span>
        <span>{ymKo(last.month)} {nf(last.v)}명</span>
      </figcaption>
    </figure>
  )
}

/* ══════════════════════ 박물관 사료 ══════════════════════

   ★ 이미지는 저장하지 않는다.
     기증자 저작물이고 개방형 라이선스(공공누리) 표기를 수집 단계에서 확인하지 못했다.
     그래서 박물관 원본 URL 을 <img> 로 그대로 참조하고, 자세히 보기는 박물관 페이지로 보낸다.
     정부 서버가 언제든 막을 수 있으므로 실패하면 이미지 자리를 통째로 감춘다
     (깨진 이미지 아이콘은 "자료가 없다"는 거짓 신호가 된다). */

/** 사료 한 장. 이미지가 죽으면 그림 자리를 감추고 제목만 남긴다. */
export function MuseumCard({ r, mark }: { r: MuseumRec; mark: string | null }) {
  const [broken, setBroken] = useState(false)
  const src = imgSrcOf(r)
  const showImg = Boolean(src) && !broken
  return (
    <li className={`overflow-hidden ${SURFACE.card}`}>
      {showImg && (
        <img
          src={src!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className={`block h-32 w-full border-b object-cover ${SURFACE.hair}`}
        />
      )}
      <div className="p-2.5">
        {mark && (
          <span className={`mb-1 inline-block rounded px-1.5 py-0.5 ${TYPE.cap} font-semibold ${ASOF.stale.chip}`}>{mark}</span>
        )}
        <p className={`${TYPE.sub} font-medium ${TEXT.ink} ${PROSE}`}>{clean(r.title)}</p>
        <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          {museumDate(r.producedOn)}
          {r.form ? ` · ${formKo(r.form)}` : ''}
          {r.donor ? ` · 기증 ${clean(r.donor)}` : ''}
        </p>
        <p className="mt-1.5">
          <OutLink href={r.recordUrl}>박물관에서 보기</OutLink>
        </p>
      </div>
    </li>
  )
}

function MuseumBlock({ pack, sel }: { pack: Pack; sel: Sel }) {
  const b = useMemo(() => museumFor(sel, pack), [sel, pack])
  /* 사료 격자는 **가로 스와이프**다(사용자 직접 요청 — 세로 「더 보기」 펼침 제거).
     6장씩 한 면으로 묶은 평범한 snap 행 + 좌우 단추 + "n/전체" 표시.
     패널 안이므로 핀이 아니다 — 손이 닿는 도구는 움직이지 않는다. */
  const rowRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0); rowRef.current?.scrollTo({ left: 0 }) }, [sel])

  const m = pack.museum
  const src = m.sources[0]
  /* 이 사료 더미의 as-of 는 '언제 받아왔나'가 아니라 '가장 최근 것이 언제 만들어졌나'다.
     실측: 기록관 공개 사료의 최신 생산일 2018-07-27 — 그 뒤로 공개된 것이 있는지는 모른다(stale). */
  const newest = pack.paths.meta.measured?.archiveNewestProducedOn ?? null
  const n = newest ? notice(newest, 'stale') : null

  const rows = [
    ...b.hometown.map(r => ({ r, mark: null as string | null })),
    ...b.venue.map(r => ({ r, mark: '상봉 장소 표기' })),
    ...b.historic.map(r => ({ r, mark: `${b.historicKeys.join('·')} 표기` })),
  ]
  const PER = 6
  const pages: Array<typeof rows> = []
  for (let i = 0; i < rows.length; i += PER) pages.push(rows.slice(i, i + PER))
  const goPage = (d: number) => {
    const el = rowRef.current
    if (!el || !el.clientWidth) return
    const t = Math.max(0, Math.min(pages.length - 1, page + d))
    el.scrollTo({ left: t * el.clientWidth, behavior: prefersReduced() ? 'auto' : 'smooth' })
  }
  const onRowScroll = () => {
    const el = rowRef.current
    if (!el || !el.clientWidth) return
    setPage(Math.max(0, Math.min(pages.length - 1, Math.round(el.scrollLeft / el.clientWidth))))
  }

  return (
    <Block
      tag="사료"
      tone="blue"
      title="이 고향에서 온 기록물"
      sub={`통일부 남북이산가족 디지털박물관 공개 사료 ${nf(m.archive.totCnt)}건 중 이 구역에 걸린 것`}
    >
      {rows.length === 0 ? (
        <>
          <p className={`${TYPE.body} ${TEXT.soft} ${PROSE}`}>이 고향의 사료는 아직 공개 목록에 없습니다.</p>
          <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            사료가 없다는 뜻이 아니라, 공개된 {nf(m.archive.totCnt)}건의 제목·내용에서 이 지역 이름이 확인되지 않았다는 뜻입니다.
            {' '}{nf(m.meta.slim.totalRecords - m.meta.slim.keptRecords)}건은 본문에 지명이 적혀 있지 않아 어느 고향에도 걸지 못했습니다.
          </p>
        </>
      ) : (
        <>
          <p className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
            <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf(rows.length)}건</b>
            {b.venue.length > 0 && <> · 이 가운데 {nf(b.venue.length)}건은 고향이 아니라 <b className="font-medium">상봉 장소</b>(금강산 면회소)로 잡힌 것입니다</>}
            {b.historic.length > 0 && <> · {nf(b.historic.length)}건은 광복 당시 구(舊)도명으로만 적힌 것입니다</>}
          </p>

          {/* 가로 snap 행 — 6장이 한 면. 스와이프·단추·키보드 세 경로 모두 통한다 */}
          <div
            ref={rowRef}
            onScroll={onRowScroll}
            role="group"
            aria-label={`이 고향의 기록물 ${nf(rows.length)}건 — ${PER}장씩 가로로 넘겨 봅니다`}
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'ArrowLeft') { e.preventDefault(); goPage(-1) }
              if (e.key === 'ArrowRight') { e.preventDefault(); goPage(1) }
            }}
            className={`mt-3 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain ${FOCUS}`}
          >
            {pages.map((pg, i) => (
              <ul key={i} className="grid w-full shrink-0 snap-start grid-cols-2 content-start gap-2.5 px-0.5 sm:grid-cols-3">
                {pg.map(({ r, mark }) => <MuseumCard key={r.iId} r={r} mark={mark} />)}
              </ul>
            ))}
          </div>

          {pages.length > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => goPage(-1)}
                disabled={page === 0}
                className={`${BTN.ghost} min-h-[48px] min-w-[48px] disabled:opacity-35`}
              >
                ← 이전 {PER}장
              </button>
              <p className={`shrink-0 text-center text-sm font-bold tabular-nums ${TEXT.ink}`} aria-live="polite">
                {page * PER + 1}–{Math.min(rows.length, (page + 1) * PER)}
                <span className={`ml-1 font-normal ${TEXT.faint}`}>/ 전체 {nf(rows.length)}건</span>
              </p>
              <button
                type="button"
                onClick={() => goPage(1)}
                disabled={page >= pages.length - 1}
                className={`${BTN.primary} min-h-[48px] min-w-[48px] disabled:opacity-35`}
              >
                다음 {PER}장 →
              </button>
            </div>
          )}

          {b.historic.length > 0 && (
            <p className={`mt-3 rounded-md border-l-[3px] border-[#dcdfe4] pl-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              {m.meta.historicNote}
            </p>
          )}
          {b.venue.length > 0 && m.meta.kangwonVenueOnly && (
            <p className={`mt-2 rounded-md border-l-[3px] border-[#dcdfe4] pl-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              {m.meta.kangwonVenueOnly.note}
            </p>
          )}
        </>
      )}

      {n && (
        <div className="mt-3">
          <AsOfLine n={n} />
        </div>
      )}

      <div className={`mt-3 space-y-1 border-t pt-2.5 ${SURFACE.hair}`}>
        <p className={`${TYPE.cap} ${TEXT.faint}`}>
          출처 통일부 남북이산가족 디지털박물관 · 수집 {m.builtAt} ·{' '}
          <OutLink href={src?.url}>박물관 원문</OutLink>
        </p>
        <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          사진은 <b className="font-medium">박물관 원본을 그대로 불러온 것</b>입니다.
          {' '}본 화면은 사료 이미지를 내려받아 저장하거나 다시 배포하지 않습니다 — 기증자의 저작물이기 때문입니다.
          {' '}이미지가 보이지 않으면 박물관이 외부 참조를 막은 것이며, 제목과 원문 링크는 그대로 남습니다.
        </p>
      </div>
    </Block>
  )
}

/* ══════════════════════ 고향 안내인 (페르소나 AI) ══════════════════════

   지역을 고른 사람에게 그 지역의 **우리 데이터만 근거로** 말을 거는 도우미.

   LLM 4원칙이 코드에 그대로 박혀 있다 (CLAUDE.md §5 — 타협 대상 아님):
     ① 규칙이 먼저 — 수치·사건·사료는 전부 buildGuideFacts 가 데이터 팩에서 꺼낸다.
     ② LLM 은 해석만 — validateGuide(프록시 어댑터 내부)가 사실 묶음에 없는 숫자를
        하나라도 발견하면 출력 전체를 폐기한다. LLM 이 수치를 만들 문법이 없다.
     ③ 스키마 밖이면 폐기 — guideWithLLM 은 닫힌 스키마(lines 2~4 + next 1)가 아니면 null.
     ④ 네트워크가 죽어도 동작 — 화면은 fallbackGuide(규칙 문장)로 먼저 채우고,
        LLM 이 검증을 통과한 경우에만 그 자리를 바꾼다. 빈 화면이 되는 경로가 없다.

   시각 구분 — AI/규칙이 만든 문장은 **점선 상자** 안에만 산다. 공식 수치(실선 구획)와
   같은 표면에 두지 않는다. 라벨과 "자동 작성" 고지를 항상 붙인다. */

type GuideMsg = { lines: string[]; next: { target: string; label: string } }

/* next.target → 대시보드 구획 앵커 (한걸음씩 모드는 onGo 로 카드 번호에 따로 잇는다) */
const GUIDE_ANCHOR: Record<string, string> = {
  weather: 'g-weather', events: 'g-events', museum: 'g-museum', clock: 'extinction', action: 'actions',
}

/* analysis.json(확정 분석값 — 순위·격차·극단)은 첫 화면에 필요 없다.
   안내인이 처음 그려질 때 한 번만 지연 fetch 해서 모듈에 캐시한다 — 초기 팩 로딩을 늦추지 않는다.
   실패해도 안내인은 비교 없는 사실 묶음으로 그대로 동작한다(원칙 ④). */
let analysisPromise: Promise<unknown | null> | null = null
function loadAnalysisLazy(): Promise<unknown | null> {
  if (!analysisPromise) {
    analysisPromise = fetch(`${PACK}/analysis.json`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
  }
  return analysisPromise
}

export function GuideBox({ pack, sel, onGo }: { pack: Pack; sel: Sel; onGo?: (target: string) => void }) {
  /* undefined=지연 fetch 확정 전 · null=실패(비교 없이 간다) · 객체=적재됨 */
  const [ana, setAna] = useState<unknown>(undefined)
  useEffect(() => {
    let alive = true
    loadAnalysisLazy().then(a => { if (alive) setAna(a) })
    return () => { alive = false }
  }, [])

  const facts = useMemo(
    () => buildGuideFacts(sel, pack, {
      /* 합산 계열(연표·보도자료·동향)의 확인 하한 — 병합 기준일은 min 이 정직한 값이다.
         nk-guide 는 의존 0개(브라우저·CF Functions 공용)라 여기서 계산해 넣는다. */
      eventsAsOf: coverageEndOf('timeline', 'briefing', 'nkinfoTrend'),
      analysis: ana ?? null,
    }),
    [sel, pack, ana],
  )
  const [g, setG] = useState<GuideMsg | null>(() => (facts ? (fallbackGuide(facts) as GuideMsg) : null))
  const [via, setVia] = useState<'rule' | 'llm'>('rule')

  useEffect(() => {
    let alive = true
    if (!facts) { setG(null); return }
    setG(fallbackGuide(facts) as GuideMsg)          // ④ 네트워크와 무관하게 화면부터 채운다
    setVia('rule')
    /* analysis 확정 전에는 LLM 왕복을 아낀다 — 확정되면 facts 가 바뀌어 이 효과가 다시 돈다.
       (비교 재료 없이 한 번, 있고 나서 또 한 번 부르는 이중 호출을 막는다) */
    if (ana === undefined) return
    ;(async () => {
      try {
        await probeLLM()
        /* guideWithLLM 은 호출 실패·스키마 위반·수치 생성·기준일 오귀속 전부 null 로 돌려준다 */
        const ok = (await guideWithLLM(facts)) as GuideMsg | null
        if (alive && ok) { setG(ok); setVia('llm') }
      } catch { /* 규칙 문장 유지 — 화면은 이미 차 있다 */ }
    })()
    return () => { alive = false }
  }, [facts, ana])

  if (!g) return null
  const go = (t: string) => {
    if (onGo) { onGo(t); return }
    scrollToEl(document.getElementById(GUIDE_ANCHOR[t] ?? ''))
  }
  return (
    <div
      className={`rounded-md border border-dashed ${SURFACE.line} ${SURFACE.inset} p-4`}
      role="note"
      aria-label="고향 안내인의 자동 작성 안내문"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 ${TYPE.cap} font-semibold ${TONE.slate.chip}`}>고향 안내인</span>
        <span className={`${TYPE.cap} ${TEXT.faint}`}>{via === 'llm' ? 'AI 보조 문장 · 수치 검증 통과' : '규칙 기반 문장'}</span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {g.lines.map((l, i) => (
          <p key={i} className={`${TYPE.body} ${TEXT.soft} ${PROSE}`}>{l}</p>
        ))}
      </div>
      <p className="mt-3">
        <button type="button" onClick={() => go(g.next.target)} className={BTN.ghost}>
          {g.next.label} <span aria-hidden="true">→</span>
        </button>
      </p>
      <p className={`mt-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        이 안내문은 아래 자료만 근거로 자동 작성됐습니다. 공식 수치는 실선 구획의 값을 보십시오.
      </p>
    </div>
  )
}

/* ══════════════════════ 우측 패널 ══════════════════════ */

function RegionPanel({ pack, sel, onClose }: { pack: Pack; sel: Sel; onClose: () => void }) {
  const p = useMemo(() => buildPanel(sel, pack), [sel, pack])
  const [allEvents, setAllEvents] = useState(false)
  useEffect(() => { setAllEvents(false) }, [sel])

  if (!p) {
    return (
      <div className={`${CARD} p-4`}>
        <p className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>선택한 구역에 연결된 지역 데이터가 없습니다.
        </p>
      </div>
    )
  }

  const isan = pack.isan
  const originEntry = p.isanKey ? isan.latest.survivors.byOrigin.entries.find(e => e.label === p.isanKey!.latestKey) : undefined
  const monthlyRows = p.isanKey
    ? isan.monthly.map(m => ({ month: m.month, v: m.origin[p.isanKey!.monthlyKey] ?? 0 })).filter(r => Number.isFinite(r.v))
    : []
  const csvAsOf = isan.monthly.at(-1)?.month ?? ''

  /* 기록(연표·보도자료·동향·개황) — 네 계열을 **합쳐** 보여 주는 구획이라 단일 기준일이 없다.
     예전 코드는 sources.find(coverageEnd 있는 첫 항목)로 동향(2026-08-11)을 집었는데,
     가장 낡은 계열(개황 2025-05-31)이 291일 더 오래돼 배지가 과대(live)로 찍혔다.
     병합 기준일은 coverageEndOf 의 min 이 정직한 값이다 — 배지는 min 으로 뒤집고,
     계열별 기준일은 표의 각 행에 병기한다(합산 블록의 정공법). */
  const recEnds = {
    timeline: coverageEndOf('timeline'),
    briefing: coverageEndOf('briefing'),
    trend: coverageEndOf('nkinfoTrend'),
    overview: coverageEndOf('nkinfoOverview'),
  }
  const recMerged = coverageEndOf('timeline', 'briefing', 'nkinfoTrend', 'nkinfoOverview')
  const recOldestName =
    recMerged === recEnds.timeline ? datasetLabel('timeline')
      : recMerged === recEnds.briefing ? datasetLabel('briefing')
        : recMerged === recEnds.trend ? datasetLabel('nkinfoTrend')
          : recMerged === recEnds.overview ? datasetLabel('nkinfoOverview') : null
  const recordEnd = recMerged ?? pack.region.builtAt
  const recNotice = notice(recordEnd, 'live')
  const wxNotice = notice(pack.region.meta.weather.latestObsDate, 'stale')
  const isanNotice = notice(isan.latest.asOf, 'live')
  const csvNotice = notice(csvAsOf, 'live')
  const defNotice = p.defector ? notice(p.defector.asOf, 'stale') : null

  const events = allEvents ? p.events : p.events.slice(0, 8)

  return (
    /* 전폭에서는 2열 그리드 — 좁은 기둥에 길게 쌓이는 대신 나란히 놓인다.
       머리·종료 공지·안내인·사료는 전폭(col-span-2), 관측·이산가족·탈북민·기록은 반폭. */
    <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
      {/* ── 머리 ── */}
      <div className={`${CARD} p-4 lg:col-span-2`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-blue-700 dark:text-blue-400">
              {p.kind === 'old' ? '광복 당시 구행정구역 (이산가족 고향 축)' : '현행 행정구역'}
            </p>
            <h2 className={`mt-0.5 text-2xl font-semibold leading-snug text-slate-900 dark:text-white ${PROSE}`}>{p.title}</h2>
            <p className={`mt-0.5 text-sm leading-relaxed text-slate-500 ${PROSE}`}>{p.sub}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-500 dark:border-slate-700 ${FOCUS}`}
          >닫기
          </button>
        </div>
        {p.note && (
          <p className={`mt-2 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 ${PROSE}`}>{p.note}
          </p>
        )}
      </div>

      {/* ──  종료 공지가 있으면 무엇보다 먼저 ──
          주제 단위 frozen 은 데이터셋 단위보다 우선한다. 통계가 없어서가 아니라
          '활동이 끝나서 없다'는 것을 먼저 말해야 한다. */}
      {p.frozen.map(f => {
        const n = notice(f.since, 'frozen', f.reason)
        return (
          <div key={f.topic} className={`overflow-hidden ${CARD} lg:col-span-2`}>
            <div className={`flex items-center gap-2 p-3 ${TONE.violet.band}`}>
              <AsOfPill level="frozen" />
              <span className={`text-sm font-semibold ${TONE.violet.text} ${PROSE}`}>
                {f.region} — {f.topic === 'econ.kaesong' ? '개성공단' : f.topic === 'econ.kumgang' ? '금강산 관광' : f.topic}
              </span>
            </div>
            <div className="p-3">
              <AsOfLine n={n} verbose />
            </div>
          </div>
        )
      })}

      {/* ── 고향 안내인 — AI/규칙 문장은 점선 상자에만 산다. 공식 수치와 섞이지 않는다 ── */}
      <div className="lg:col-span-2"><GuideBox pack={pack} sel={sel} /></div>

      {/* ── 날씨 ── */}
      <div id="g-weather" className="scroll-mt-24">
      <Block
        tag="관측"
        tone="slate"
        title="최근 확인된 기상 관측"
        sub={`실시간 관측 + NOAA 관측지점 ${p.weather.length}곳`}
      >
        {/* ① 지금 — 브라우저가 직접 부른다. 기상만은 실시간이어야 as-of 가 지켜진다. */}
        <div className="mb-3">
          <LiveWeatherRows names={membersOf(sel, pack.region)} />
        </div>

        {/* ② 마지막으로 확인된 지상 관측 — 실측 정지 상태를 감추지 않는다 */}
        {p.weather.length === 0 ? (
          <p className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>이 구역에 현행 관측지점이 없습니다.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {p.weather.map(w => (
                <li key={`${w.station}-${w.date}`} className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
                  <span className={`text-sm text-slate-600 dark:text-slate-300 ${PROSE}`}>
                    {w.station}
                    <span className="ml-1 text-[11px] text-slate-400">{ymdKo(w.date)} 관측</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <b className="text-base font-semibold tabular-nums text-slate-900 dark:text-white">{nf1(w.tempC)}℃</b>
                    <span className="ml-1 text-[11px] tabular-nums text-slate-400">최고 {nf1(w.maxC)} · 최저 {nf1(w.minC)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <AsOfLine n={wxNotice} verbose />
            </div>
            <p className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
              {pack.region.meta.weather.asOfNote}
            </p>
            <p className="mt-1.5">
              <span className="text-[11px] text-slate-400">출처 NOAA Global Summary of the Day · </span>
              <OutLink href="https://www.ncei.noaa.gov/data/global-summary-of-the-day/">원본 데이터</OutLink>
            </p>
          </>
        )}
      </Block>
      </div>

      {/* ── 이산가족: 이 지역이 고향인 생존 신청자 ── */}
      <Block
        tag="이산가족"
        tone="blue"
        title="이 지역이 고향인 생존 신청자"
        sub={p.isanKey ? `이산가족 출신지 축 「${p.isanKey.name}」 기준` : '대응하는 출신지 항목이 없습니다'}
      >
        {originEntry ? (
          <>
            <p className={`text-3xl font-semibold tabular-nums text-slate-900 dark:text-white`}>
              {nf(originEntry.n)}
              <span className="ml-1 text-base font-medium text-slate-500">명</span>
              <span className="ml-2 text-sm font-medium text-slate-400">전체 생존자의 {nf1(originEntry.pct)}%</span>
            </p>
            <div className="mt-2">
              <AsOfLine n={isanNotice} verbose />
            </div>
            <p className="mt-1.5">
              <span className="text-[11px] text-slate-400">통일부 「{isan.latest.title}」 ({isan.latest.postedAt} 게시) ·{' '}
              </span>
              <OutLink href={isan.latest.attachment}>공표 원문(HWP)</OutLink>
              <span className="text-[11px] text-slate-400"> · </span>
              <OutLink href={isan.latest.boardUrl}>게시판 {nf(isan.latest.boardTotalPosts)}건</OutLink>
            </p>

            {/*  같은 통계인데 채널이 둘이고 기준일이 9개월 다르다 — 이 화면이 보여주려는 것 */}
            {monthlyRows.length > 1 && (
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className={`text-sm font-medium text-slate-700 dark:text-slate-200 ${PROSE}`}>월별 추이 — 공공데이터포털 등록현황 CSV
                </p>
                <Spark rows={monthlyRows} label={`${p.isanKey?.name ?? p.title} 출신 생존자`} />
                <div className="mt-2">
                  <AsOfLine n={csvNotice} />
                </div>
                <p className={`mt-1.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 ${PROSE}`}>위 <b className="font-semibold">{nf(originEntry.n)}명({ymKo(isan.latest.asOf)})</b>과 이 그래프의 마지막 값
                  <b className="font-semibold"> {nf(monthlyRows.at(-1)?.v)}명({ymKo(csvAsOf)})</b>은
                  <b className="font-semibold"> 같은 통계의 서로 다른 공표 채널</b>입니다.
                  파일데이터(포털)가 게시판 공표보다 {gapText(Math.round((new Date(isan.latest.asOf).getTime() - new Date(csvAsOf).getTime()) / 864e5))} 뒤처져 있어
                  두 값을 한 문장에 섞어 쓰면 기준일이 깨집니다.
                </p>
                <p className="mt-1.5">
                  <span className="text-[11px] text-slate-400">출처 {isan.sources[0]?.name} · 자료 기준일 {isan.sources[0]?.asOf} ·{' '}
                  </span>
                  <OutLink href={isan.sources[0]?.landing}>원본 데이터</OutLink>
                </p>
              </div>
            )}

            <p className={`mt-3 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 ${PROSE}`}>이산가족 출신지는 <b className="font-medium">광복 당시 구행정구역</b> 7종으로만 공표됩니다.
              {p.kind === 'modern' && (() => {
                const names = membersOf({ mode: 'old', id: p.isanKey!.key }, pack.region).join('·')
                return ` 그래서 현행 ${names}${josa(names, '은', '는')} 같은 값(${p.isanKey!.name})을 공유합니다.`
              })()}
              {' '}또한 이 7종의 합({nf(isan.latest.survivors.byOrigin.entries.filter(e => e.label !== '기타').reduce((s, e) => s + e.n, 0))}명)은
              전체 생존자 {nf(isan.latest.survivors.total)}명보다 작습니다 — 「기타」가
              {' '}{nf(isan.latest.survivors.byOrigin.entries.find(e => e.label === '기타')?.n)}명({nf1(isan.latest.survivors.byOrigin.entries.find(e => e.label === '기타')?.pct)}%)이라
              지역별 비율의 분모로 쓸 수 없습니다.
            </p>
          </>
        ) : (
          <p className={`text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>이산가족 출신지 공표 항목에 이 구역에 대응하는 분류가 없습니다.
          </p>
        )}
      </Block>

      {/* ── 탈북민 재북 출신지 ── */}
      <Block tag="탈북민" tone="blue" title="이 지역이 재북 출신지인 탈북민" sub="입국 누적 인원">
        {p.defector && defNotice ? (
          <>
            <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">
              {nf(p.defector.total)}
              <span className="ml-1 text-base font-medium text-slate-500">명</span>
            </p>
            <div className="mt-2 space-y-0">
              <StatRow label="남" value={`${nf(p.defector.male)}명`} />
              <StatRow label="여" value={`${nf(p.defector.female)}명`} />
            </div>
            <p className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${PROSE}`}>
              {p.defector.cumulativeSince.slice(0, 4)}년 이후 누적{p.defectorMissing.length ? ` · ${p.defectorMissing.join('·')}는 이 축에 별도 항목이 없습니다` : ''}
            </p>
            <div className="mt-2">
              <AsOfLine n={defNotice} verbose />
            </div>
            <p className="mt-1.5">
              <span className="text-[11px] text-slate-400">출처 통일부 북한이탈주민 재북 출신지역별 현황 · </span>
              <OutLink href="https://www.data.go.kr/data/15090949/fileData.do">원본 데이터</OutLink>
            </p>
          </>
        ) : (
          <p className={`text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>공표 출신지 13개 축에 이 지역 항목이 없습니다{p.title === '라선' ? ' (역사적으로 함경북도에 포함됩니다)' : ''}.
            없다는 뜻이 아니라 <b className="font-medium">이 분류로는 집계되지 않았다</b>는 뜻입니다.
          </p>
        )}
      </Block>

      {/* ── 이 지역의 기록 ── */}
      <div id="g-events" className="scroll-mt-24">
      <Block
        tag="기록"
        tone="blue"
        title="이 지역의 공식 기록"
        sub={`통일부 자료에서 이 지역이 언급된 건수`}
      >
        <div className="grid grid-cols-2 gap-x-4">
          {/* 계열마다 기준일이 다르다 — 행에 병기해야 합산 블록이 한 날짜를 참칭하지 않는다 */}
          <StatRow label="남북관계 연표" value={`${nf(p.eventsTotal)}건`} sub={recEnds.timeline ? `기준 ${recEnds.timeline}` : undefined} />
          <StatRow label="보도·설명자료" value={`${nf(p.briefings)}건`} sub={recEnds.briefing ? `기준 ${recEnds.briefing}` : undefined} />
          <StatRow label="북한 동향" value={`${nf(p.trends)}건`} sub={recEnds.trend ? `기준 ${recEnds.trend}` : undefined} />
          <StatRow label="북한개황 문서" value={`${nf(p.overviews)}건`} sub={recEnds.overview ? `기준 ${recEnds.overview}` : undefined} />
        </div>

        <div className="mt-3">
          <AsOfLine n={recNotice} />
          <p className={`mt-1 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
            네 계열을 합쳐 보여 주는 구획이라 단일 기준일이 없습니다. 위 배지는 가장 오래된 계열
            {recOldestName ? `(${recOldestName})` : ''} 기준이고, 계열별 기준일은 각 행에 있습니다.
          </p>
        </div>

        {p.events.length > 0 ? (
          <>
            <p className={`mt-4 text-sm font-medium text-slate-700 dark:text-slate-200 ${PROSE}`}>최근 사건 (최신순 · 상위 {nf(p.events.length)}건 수록)
            </p>
            <ol className="relative mt-2 ml-1 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
              {events.map((e, i) => (
                <li key={`${e.date}-${i}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" aria-hidden="true" />
                  <time className="text-[11px] font-medium tabular-nums text-slate-500" dateTime={e.date}>{e.date}</time>
                  <p className={`text-sm leading-relaxed text-slate-800 dark:text-slate-100 ${PROSE}`}>{clean(e.title)}</p>
                </li>
              ))}
            </ol>
            {p.events.length > 8 && (
              <button
                type="button"
                onClick={() => setAllEvents(v => !v)}
                className={`mt-3 w-full rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300 ${FOCUS}`}
              >
                {allEvents ? '접기' : `나머지 ${nf(p.events.length - 8)}건 더 보기`}
              </button>
            )}
            {p.eventsTotal > p.events.length && (
              <p className={`mt-2 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>전체 {nf(p.eventsTotal)}건 중 최신 {nf(p.events.length)}건만 이 화면에 수록돼 있습니다.
                나머지는 사실은ON 검색에서 확인할 수 있습니다.
              </p>
            )}
          </>
        ) : (
          <p className={`mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>날짜가 확인되는 연표 기록이 없습니다.
          </p>
        )}

        <div className="mt-4 space-y-1 border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <p className="text-[11px] text-slate-400">연표·보도자료 —{' '}
            <OutLink href="https://www.data.go.kr/data/15090949/fileData.do">공공데이터포털</OutLink>
          </p>
          <p className="text-[11px] text-slate-400">동향·북한개황 —{' '}
            <OutLink href="https://nkinfo.unikorea.go.kr">북한정보포털</OutLink>
          </p>
          <p className={`mt-1 leading-relaxed text-[11px] text-slate-400 ${PROSE}`}>지역 귀속은 지역명·도시명 문자열 매칭 결과입니다. {pack.region.meta.matching.caveats[0]}
          </p>
        </div>

        <p className="mt-3">
          <Link to={`/factcheck?q=${encodeURIComponent(p.title.replace(/\(구\)$/, ''))}`} className={`inline-flex items-center gap-1 rounded text-sm font-medium text-blue-700 underline underline-offset-2 dark:text-blue-400 ${FOCUS}`}>사실은ON에서 「{p.title}」 검색하기 →
          </Link>
        </p>
      </Block>
      </div>

      {/* ── 박물관 사료 ──
          위의 '기록'이 이 지역이 **몇 번 언급됐는지**를 세는 것이라면,
          이 구획은 이 지역에서 실제로 나온 **물건**을 보여준다. 숫자 다음에 얼굴이 와야 한다. */}
      <div id="g-museum" className="scroll-mt-24 lg:col-span-2">
        <MuseumBlock pack={pack} sel={sel} />
      </div>
    </div>
  )
}

/* ══════════════════════ S3 씬 — 지도 + 패널 배치 ══════════════════════
   지역을 고르기 전에는 지도 옆 좁은 안내 기둥이 맞다. 그런데 고른 뒤에도
   그 기둥에 모든 구획을 쌓으면 좁은 곳에 길게 늘어지고 지도 아래가 통째로
   빈다(실측 지적, 2026-08-19). 선택 후에는 패널이 지도 아래 전폭으로 내려와
   2열 그리드로 펼쳐진다. */

export default function MapScene({
  pack, mode, sel, panelRef, topOld, onSwitchMode, onSelect, onClose, onPickOld,
}: {
  pack: Pack
  mode: Mode
  sel: Sel | null
  panelRef: RefObject<HTMLDivElement | null>
  topOld: Array<{ id: string; name: string; n: number }>
  onSwitchMode: (m: Mode) => void
  onSelect: (s: Sel) => void
  onClose: () => void
  onPickOld: (id: string) => void
}) {
  return (
    <div className={`mt-8 ${sel ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]'}`}>
      <div className="min-w-0">
        <div className={`overflow-hidden ${CARD}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
            <div role="group" aria-label="지도 종류" className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {([['modern', '현행 행정구역'], ['old', '고향 지도 (광복 당시)']] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onSwitchMode(k)}
                  aria-pressed={mode === k}
                  className={`inline-flex min-h-[48px] items-center rounded-lg px-4 py-2 text-sm font-medium transition ${FOCUS} ${
                    mode === k
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">지역을 누르면 그 지역의 자료가 아래에 열립니다</p>
          </div>

          <div className="p-3">
            {/* 전폭이 되면 지도가 화면 높이를 넘겨 버린다(가로 800×세로 834 비율) — 폭을 묶는다 */}
            <div className="mx-auto w-full max-w-3xl">
              <NkMapView pack={pack} mode={mode} sel={sel} onSelect={onSelect} />
            </div>
          </div>

          <div className="border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
            <p className={`text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
              {mode === 'old' ? (
                <>구역 안의 가는 선은 <b className="font-medium">현행 도 경계</b>입니다 — 구행정구역 폴리곤이 따로 없어 현행 구역을 묶어 근사한 것입니다.
                  {' '}미수복경기는 개성 위치의 <b className="font-medium">원형 마커</b>로 대신했습니다(별도 지오메트리 없음). {pack.map.crosswalk.note}
                </>
              ) : (
                <>남포·개성은 이 지오메트리 판본에 별도 폴리곤이 없어 <b className="font-medium">도시 점</b>으로 표시했습니다(각각 평안남도·황해북도 폴리곤에 포함).
                  {' '}검은 점은 주요 도시이며, 누르면 소속 지역이 열립니다.
                </>
              )}
            </p>
            <p className={`mt-1 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>지도 지오메트리 — {pack.map.sources[0]?.name} ({pack.map.sources[0]?.license}) ·{' '}
              <OutLink href={pack.map.sources[0]?.url}>원본 데이터</OutLink>
            </p>
          </div>
        </div>
      </div>

      {/* ── 패널: 선택 전엔 우측 기둥, 선택 후엔 지도 아래 전폭 ── */}
      <div ref={panelRef} className={sel ? 'mt-6 min-w-0' : 'mt-4 min-w-0 lg:mt-0'}>
        {sel ? (
          <RegionPanel pack={pack} sel={sel} onClose={onClose} />
        ) : (
          <div className={`${CARD} p-4`}>
            <p className={`text-base font-semibold text-slate-900 dark:text-white ${PROSE}`}>고향을 하나 골라 보세요
            </p>
            <p className={`mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${PROSE}`}>지도에서 고향을 누르면 이 자리에 그 고향의 자료가 열립니다. 이산가족 신청 현황, 그 지역이 출신지인 북한이탈주민, 공식 기록에 남은 일, 오늘 날씨까지 — 자료마다 기준일이 달라 날짜를 함께 적습니다.
            </p>
            <p className={`mt-4 text-sm font-medium text-slate-700 dark:text-slate-200 ${PROSE}`}>이산가족 생존 신청자가 많은 고향 ({ymKo(pack.isan.latest.asOf)} 기준)
            </p>
            <ul className="mt-2 space-y-1.5">
              {topOld.map(o => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onPickOld(o.id)}
                    className={`flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left dark:border-slate-800 ${FOCUS}`}
                  >
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{o.name}</span>
                    <span className="text-sm font-semibold tabular-nums text-blue-700 dark:text-blue-400">{nf(o.n)}명</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className={`mt-3 text-[11px] leading-relaxed text-slate-400 ${PROSE}`}>
              「기타」 {nf(pack.isan.latest.survivors.byOrigin.entries.find(e => e.label === '기타')?.n)}명은
              공표 출신지 7종에 속하지 않아 지도에 표시할 수 없습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
