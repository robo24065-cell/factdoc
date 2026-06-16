// 감염병 발생 현황판 — 질병관리청 감염병포털 EDW(시도×연 + 시도×주).
// 연간/주별 토글: 연간=연도 슬라이더 다년 지도, 주별=주차 슬라이더가 지도를 직접 변경(시도×주). 발생수/발생률 칩, 에피데믹 커브, 분석 패널.
// 데이터: 배치 정적 캐시(eid-region.ts), 지도경계: kr-geo.ts. per-request 외부호출 없음(§13.7).
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, LabelList, ReferenceLine, PieChart, Pie,
} from 'recharts'
import {
  EID_YEARS, EID_PARTIAL_YEAR, EID_CUR_YEAR, EID_CUR_WEEK, EID_SIDO, EID_DISEASES, EID_GROUP,
  EID_WEEKLY_DISEASES, EID_COUNT, EID_RATE, EID_WK_SIDO, EID_WK_NAT,
  EID_NAT_DAILY, EID_NAT_MONTH, EID_NAT_YEAR, EID_SEXAGE, EID_PTNT, EID_AREA,
} from '../data/eid-region'
import { KR_GEO, KR_VIEWBOX } from '../data/kr-geo'
import { eidGrowthSignal } from '../lib/eidStats'

type Metric = 'count' | 'rate'
const ALL = '__ALL__'
const cleanName = (d: string) => d.replace(/^@/, '')
const nf = (n: number) => n.toLocaleString('ko-KR')
const SIDO_NAME: Record<string, string> = Object.fromEntries(EID_SIDO.map((s) => [s.code, s.name]))
const fmt = (v: number, m: Metric) => m === 'count' ? nf(Math.round(v)) : (v >= 10 ? v.toFixed(1) : v.toFixed(2))
const unitSuffix = (m: Metric) => m === 'count' ? '건' : '명/10만'

function eunNeun(word: string): string {
  const m = word.replace(/[)\]\s]+$/, '')
  const c = m.charCodeAt(m.length - 1)
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0 ? '은' : '는'
  return '는'
}

// 연간 값(발생수/발생률) — '00'=전국
function annualVal(metric: Metric, disease: string, year: string, sido: string): number {
  const yd = (metric === 'rate' ? EID_RATE : EID_COUNT)[year]
  if (!yd) return 0
  if (disease === ALL) { let s = 0; for (const d of EID_DISEASES) s += yd[d]?.[sido] ?? 0; return s }
  return yd[disease]?.[sido] ?? 0
}
// 현재년 주별 시도 발생수
function weekVal(disease: string, week: number, sido: string): number {
  if (disease === ALL) { let s = 0; for (const d of EID_WEEKLY_DISEASES) s += EID_WK_SIDO[d]?.[week]?.[sido] ?? 0; return s }
  return EID_WK_SIDO[disease]?.[week]?.[sido] ?? 0
}
const weeklyAvail = (disease: string) => disease === ALL || !!EID_WK_SIDO[disease]
// 전국 인구(연도별) — 시도 발생률은 합산 불가하므로, 시도별 인구(=발생수/발생률×10만)를 역산·합산해 전국 인구 추정.
function nationalPop(year: string): number {
  let pop = 0
  for (const s of EID_SIDO) {
    let c = 0, r = 0
    for (const d of EID_DISEASES) { c += EID_COUNT[year]?.[d]?.[s.code] ?? 0; r += EID_RATE[year]?.[d]?.[s.code] ?? 0 }
    if (r > 0) pop += (c / r) * 100000
  }
  return pop || 51000000
}

const RAMP: [number, [number, number, number]][] = [
  [0, [238, 242, 247]], [0.16, [254, 240, 199]], [0.36, [253, 211, 90]],
  [0.56, [249, 145, 58]], [0.78, [236, 72, 60]], [1, [150, 24, 28]],
]
function rampColor(t: number): string {
  t = Math.max(0, Math.min(1, t))
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [a, ca] = RAMP[i - 1]; const [b, cb] = RAMP[i]
      const f = (b - a) === 0 ? 0 : (t - a) / (b - a)
      const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * f))
      return `rgb(${c[0]},${c[1]},${c[2]})`
    }
  }
  const last = RAMP[RAMP.length - 1][1]
  return `rgb(${last[0]},${last[1]},${last[2]})`
}

const CHIPS = [ALL, ...EID_DISEASES.slice(0, 6)]
const LABEL_OFFSET: Record<string, [number, number]> = {
  '08': [26, 34], '04': [-16, 4], '17': [-2, -7], '06': [10, 6], '07': [13, 2],
}
const GRP_COLOR: Record<string, string> = { '1급': '#dc2626', '2급': '#f97316', '3급': '#eab308', '4급': '#3b82f6' }

export default function InfectiousMap() {
  const [disease, setDisease] = useState<string>(ALL)
  const [metric, setMetric] = useState<Metric>('count')
  const [gran, setGran] = useState<'year' | 'week'>('year')
  const [yearIdx, setYearIdx] = useState(EID_YEARS.length - 1)
  const [weekIdx, setWeekIdx] = useState(EID_CUR_WEEK - 1)
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; code: string } | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  const inWeek = gran === 'week'
  const effMetric: Metric = inWeek ? 'count' : metric
  const year = inWeek ? EID_CUR_YEAR : EID_YEARS[yearIdx]
  const week = weekIdx + 1
  const isPartial = !inWeek && year === EID_PARTIAL_YEAR
  const wkAvail = weeklyAvail(disease)
  const diseaseLabel = disease === ALL ? '전체 감염병' : cleanName(disease)
  const periodLabel = inWeek ? `${EID_CUR_YEAR}년 ${week}주차` : `${year}년`
  const u = unitSuffix(effMetric)

  // 재생(연간=연도 순환, 주별=주차 순환)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      if (inWeek) setWeekIdx((i) => (i + 1) % EID_CUR_WEEK)
      else setYearIdx((i) => (i + 1) % EID_YEARS.length)
    }, inWeek ? 430 : 1100)
    return () => clearInterval(id)
  }, [playing, inWeek])

  // 시도별 값
  const { perSido, maxV, nationTotal } = useMemo(() => {
    const per: Record<string, number> = {}; let mx = 0
    for (const s of EID_SIDO) {
      const v = inWeek ? weekVal(disease, week, s.code) : annualVal(effMetric, disease, year, s.code)
      per[s.code] = v; if (v > mx) mx = v
    }
    const sum = EID_SIDO.reduce((t, s) => t + (per[s.code] || 0), 0)
    let nat: number
    if (inWeek) nat = sum
    else if (effMetric === 'rate') { const cnt = annualVal('count', disease, year, '00'); nat = cnt / nationalPop(year) * 100000 }
    else nat = annualVal('count', disease, year, '00') || sum
    return { perSido: per, maxV: mx || 1, nationTotal: nat }
  }, [inWeek, disease, week, effMetric, year])

  const ranking = useMemo(
    () => EID_SIDO.map((s) => ({ code: s.code, name: s.name, value: perSido[s.code] || 0 })).sort((a, b) => b.value - a.value),
    [perSido],
  )
  const topSido = ranking[0]
  const rankPos = ranking.filter((r) => r.value > 0)

  // 연도별 추이(다년, 전국+선택시도)
  const trend = useMemo(() => EID_YEARS.map((y) => {
    const row: Record<string, number | string> = { year: y, 전국: annualVal(effMetric, disease, y, '00') }
    if (selected) row[SIDO_NAME[selected]] = annualVal(effMetric, disease, y, selected)
    return row
  }), [effMetric, disease, selected])

  // 전기간 대비(연간=전년, 주별=전주)
  const prevTotal = inWeek
    ? (weekIdx > 0 ? EID_SIDO.reduce((t, s) => t + weekVal(disease, week - 1, s.code), 0) : null)
    : (yearIdx > 0 ? annualVal(effMetric, disease, EID_YEARS[yearIdx - 1], '00') : null)
  const yoy = prevTotal && prevTotal > 0 ? Math.round(((nationTotal - prevTotal) / prevTotal) * 100) : null
  const yoyMult = prevTotal && prevTotal > 0 ? nationTotal / prevTotal : null
  const bigJump = yoyMult !== null && yoyMult >= 6
  const yoyBadge = yoy === null ? '—' : bigJump ? `▲${Math.round(yoyMult!)}배` : `${yoy > 0 ? '▲' : yoy < 0 ? '▼' : ''}${Math.abs(yoy)}%`
  const yoyPhrase = yoy === null ? '' : bigJump ? ` ${inWeek ? '전주' : '전년'} 대비 약 ${Math.round(yoyMult!)}배 급증했습니다.` : yoy > 0 ? ` ${inWeek ? '전주' : '전년'} 대비 ${yoy}% 증가했습니다.` : yoy < 0 ? ` ${inWeek ? '전주' : '전년'} 대비 ${Math.abs(yoy)}% 감소했습니다.` : ` ${inWeek ? '전주' : '전년'}와 비슷합니다.`


  // 인사이트
  const insight = useMemo(() => {
    if (nationTotal <= 0) return `${periodLabel} ${diseaseLabel}의 발생 기록이 없습니다.${inWeek && !wkAvail ? ' (이 감염병은 주별 데이터 미수집 — 연간 보기로 전환하세요.)' : ''}`
    const top3 = ranking.slice(0, 3).filter((r) => r.value > 0)
    const top3Share = Math.round((top3.reduce((s, r) => s + r.value, 0) / (ranking.reduce((s, r) => s + r.value, 0) || 1)) * 100)
    const lead = topSido ? `${topSido.name}(${fmt(topSido.value, effMetric)}${u})` : ''
    const conc = top3Share >= 50 ? '특정 지역에 집중' : top3Share >= 35 ? '일부 지역에 편중' : '비교적 고르게 분포'
    const head = effMetric === 'count'
      ? `${periodLabel} ${diseaseLabel}${eunNeun(diseaseLabel)} 전국 ${fmt(nationTotal, effMetric)}건 발생했고`
      : `${periodLabel} ${diseaseLabel}의 전국 발생률은 인구 10만 명당 ${fmt(nationTotal, effMetric)}명이고`
    const partTxt = isPartial ? ` (${year}년은 진행 중인 잠정 수치입니다.)` : ''
    return `${head}, ${lead}에서 가장 ${effMetric === 'count' ? '많았습니다' : '높았습니다'}. 상위 3개 시·도(${top3.map((t) => t.name).join('·')})가 전체의 ${top3Share}%로 ${conc}되어 있습니다.${yoyPhrase}${partTxt}`
  }, [nationTotal, periodLabel, diseaseLabel, ranking, topSido, effMetric, u, yoyPhrase, isPartial, year, inWeek, wkAvail])

  // 시도 드릴다운 질병 구성(현재 기간)
  const sidoBreakdown = useMemo(() => {
    if (!selected) return []
    const list = inWeek ? EID_WEEKLY_DISEASES : EID_DISEASES
    return list.map((d) => ({ name: cleanName(d), value: inWeek ? weekVal(d, week, selected) : annualVal(effMetric, d, year, selected) }))
      .filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [inWeek, effMetric, selected, year, week])

  // 전국 감염병 Top(현재 기간)
  const diseaseTop = useMemo(() => {
    const scope = selected ?? '00'
    const list = inWeek ? EID_WEEKLY_DISEASES : EID_DISEASES
    return list.map((d) => ({ key: d, name: cleanName(d), grp: EID_GROUP[d], value: inWeek ? weekVal(d, week, scope === '00' ? '00' : scope) : annualVal('count', d, year, scope) }))
      .filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  }, [inWeek, year, week, selected])

  // 급별 구성(현재 기간, 전체 볼 때)
  const groupMix = useMemo(() => {
    const g: Record<string, number> = {}
    const list = inWeek ? EID_WEEKLY_DISEASES : EID_DISEASES
    for (const d of list) {
      const v = inWeek ? weekVal(d, week, selected ?? '00') : annualVal('count', d, year, selected ?? '00')
      if (v > 0) g[EID_GROUP[d]] = (g[EID_GROUP[d]] || 0) + v
    }
    return ['1급', '2급', '3급', '4급'].map((k) => ({ name: k, value: g[k] || 0 })).filter((x) => x.value > 0)
  }, [inWeek, year, week, selected])

  const stats = useMemo(() => {
    const active = rankPos
    return { activeSido: active.length, lowest: active.length ? active[active.length - 1] : null }
  }, [rankPos])

  function onEnter(code: string, e: React.MouseEvent) {
    setHover(code)
    const r = mapRef.current?.getBoundingClientRect()
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, code })
  }

  return (
    <div className="lg:w-screen lg:max-w-none lg:relative lg:left-1/2 lg:right-1/2 lg:-ml-[50vw] lg:-mr-[50vw] lg:px-6">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1760px]">
        {/* 헤더 */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
              <span className="text-rose-500">🦠</span> 감염병 발생 현황판
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              질병관리청 <b>감염병포털 발생현황</b> · 전국 17개 시·도 · 시도별 <b>주(週) 단위</b>까지
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">출처: 질병관리청 감염병포털</span>
        </div>

        {/* 컨트롤 */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">감염병</label>
            <select value={disease} onChange={(e) => setDisease(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <option value={ALL}>전체 감염병 (합계)</option>
              {EID_DISEASES.map((d) => (<option key={d} value={d}>{cleanName(d)} · {EID_GROUP[d]}</option>))}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {CHIPS.map((c) => (
                <button key={c} onClick={() => setDisease(c)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${disease === c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {c === ALL ? '전체' : cleanName(c)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {/* 기간 단위 토글 */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500">기간</label>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                {(['year', 'week'] as const).map((g) => (
                  <button key={g} onClick={() => { setGran(g); setSelected(null); setPlaying(false) }}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${gran === g ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}>
                    {g === 'year' ? '연간' : '주별 (지도 변화)'}
                  </button>
                ))}
              </div>
            </div>
            {/* 지표 토글 */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500">지표</label>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                {(['count', 'rate'] as Metric[]).map((mk) => (
                  <button key={mk} disabled={inWeek && mk === 'rate'} onClick={() => !inWeek && setMetric(mk)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${(inWeek ? 'count' : metric) === mk ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'} ${inWeek && mk === 'rate' ? 'cursor-not-allowed opacity-40' : ''}`}>
                    {mk === 'count' ? '발생 수' : '인구 10만 명당 발생률'}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-[11px] text-slate-400">{inWeek ? '주별은 시도×주 발생수 — 주차 슬라이더가 지도를 바꿉니다' : effMetric === 'count' ? '신고된 환자 수' : '인구 대비 발생률 — 인구 적은 지역 유행강도까지 공정비교'}</span>
          </div>
        </div>

        {/* 인사이트 */}
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-slate-200">
          <span className="mt-0.5 text-base">📊</span>
          <p><b className="text-blue-700 dark:text-blue-300">한눈에</b> · {insight}</p>
        </div>

        {/* 본문: 좌측 메인(지도·분석·추이) + 우측 인구학 레일 — 와이드에서 좌우 분산 */}
        <div className="grid gap-4 2xl:grid-cols-12">
        <div className="2xl:col-span-9">
        <div className="grid gap-4 lg:grid-cols-12">
          {/* 지도 */}
          <div className="lg:col-span-7">
            <div ref={mapRef} className="relative rounded-2xl border border-slate-200 bg-gradient-to-b from-sky-50 to-white p-3 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900">
              <div className="mb-1 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {diseaseLabel} · {periodLabel} 시·도 {effMetric === 'count' ? '발생 분포' : '발생률(10만명당) 분포'}
                </h2>
                {selected && (<button onClick={() => setSelected(null)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-200 dark:bg-slate-800">전국 보기 ✕</button>)}
              </div>
              {inWeek && !wkAvail ? (
                <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
                  <span className="text-3xl">📅</span>
                  이 감염병은 주별 시도 데이터가 수집되지 않았습니다.<br />상단에서 <b className="text-slate-500">연간</b>으로 전환하면 시·도 분포를 볼 수 있어요.
                </div>
              ) : (
                <svg viewBox={KR_VIEWBOX} className="h-auto w-full" style={{ maxHeight: 560 }}>
                  {KR_GEO.map((g) => {
                    const v = perSido[g.code] || 0; const t = Math.sqrt(v / maxV)
                    const isSel = selected === g.code; const isHov = hover === g.code
                    return (
                      <path key={g.code} d={g.d} fill={v === 0 ? '#eef2f7' : rampColor(t)}
                        stroke={isSel ? '#0f172a' : isHov ? '#334155' : '#ffffff'} strokeWidth={isSel ? 2.6 : isHov ? 1.8 : 0.8}
                        style={{ cursor: 'pointer', filter: isHov && !isSel ? 'brightness(1.08)' : undefined, transition: 'fill .3s' }}
                        onMouseMove={(e) => onEnter(g.code, e)} onMouseLeave={() => { setHover(null); setTip(null) }}
                        onClick={() => setSelected((s) => (s === g.code ? null : g.code))} />
                    )
                  })}
                  {KR_GEO.map((g) => {
                    const v = perSido[g.code] || 0; const [dx, dy] = LABEL_OFFSET[g.code] || [0, 0]
                    const lx = g.cx + dx, ly = g.cy + dy
                    return (
                      <g key={'l' + g.code} pointerEvents="none" style={{ paintOrder: 'stroke' }}>
                        {(dx || dy) ? <line x1={g.cx} y1={g.cy} x2={lx} y2={ly - 2} stroke="#94a3b8" strokeWidth={0.6} /> : null}
                        <text x={lx} y={ly - 4} textAnchor="middle" fontSize={13} fontWeight={600} stroke="#fff" strokeWidth={3} fill="#1e293b">{g.name}</text>
                        <text x={lx} y={ly + 11} textAnchor="middle" fontSize={11.5} fontWeight={700} stroke="#fff" strokeWidth={3} fill={v > maxV * 0.5 ? '#7f1d1d' : '#334155'}>{v > 0 ? fmt(v, effMetric) : '-'}</text>
                      </g>
                    )
                  })}
                </svg>
              )}

              {/* 범례 */}
              <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-500">
                <span>{effMetric === 'count' ? '적음' : '낮음'}</span>
                <div className="h-2.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.3)}, ${rampColor(0.55)}, ${rampColor(0.8)}, ${rampColor(1)})` }} />
                <span>{effMetric === 'count' ? '많음' : '높음'}</span>
                <span className="ml-1 tabular-nums text-slate-400">최대 {fmt(maxV, effMetric)}{u}</span>
              </div>

              {/* 기간 바(타임라인) */}
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <button onClick={() => setPlaying((p) => !p)}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-white ${inWeek ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    title={playing ? '일시정지' : '재생'}>{playing ? '❚❚' : '▶'}</button>
                  <div className="flex-1">
                    {inWeek ? (
                      <>
                        <input type="range" min={0} max={EID_CUR_WEEK - 1} step={1} value={weekIdx}
                          onChange={(e) => { setPlaying(false); setWeekIdx(Number(e.target.value)) }} className="w-full accent-rose-600" aria-label="주차 선택" />
                        <div className="mt-0.5 flex justify-between px-0.5 text-[10px] text-slate-400">
                          <span>1주</span><span>{Math.ceil(EID_CUR_WEEK / 2)}주</span><span>{EID_CUR_WEEK}주</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <input type="range" min={0} max={EID_YEARS.length - 1} step={1} value={yearIdx}
                          onChange={(e) => { setPlaying(false); setYearIdx(Number(e.target.value)) }} className="w-full accent-blue-600" aria-label="연도 선택" />
                        <div className="mt-0.5 flex justify-between px-0.5">
                          {EID_YEARS.map((y, i) => (<button key={y} onClick={() => { setPlaying(false); setYearIdx(i) }} className={`text-xs font-semibold tabular-nums ${i === yearIdx ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>{y}</button>))}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-center">
                    <span className={`rounded-lg px-3 py-1 text-lg font-bold tabular-nums text-white ${inWeek ? 'bg-rose-600' : 'bg-slate-900 dark:bg-white dark:text-slate-900'}`}>{inWeek ? `${week}주` : year}</span>
                    <span className="mt-0.5 text-[10px] font-semibold text-slate-400">{inWeek ? `${EID_CUR_YEAR}년` : isPartial ? '잠정·진행중' : ''}</span>
                  </div>
                </div>
              </div>

              {/* 툴팁 */}
              {tip && (() => {
                const cv = inWeek ? weekVal(disease, week, tip.code) : annualVal('count', disease, year, tip.code)
                const rv = inWeek ? 0 : annualVal('rate', disease, year, tip.code)
                const natC = nationTotal || 1
                return (
                  <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900/95 px-3 py-2 text-xs text-white shadow-lg" style={{ left: tip.x, top: tip.y - 8 }}>
                    <div className="font-bold">{SIDO_NAME[tip.code]} <span className="font-normal text-slate-400">· {diseaseLabel}</span></div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-base font-bold tabular-nums text-amber-300">{nf(cv)}</span><span className="text-[10px] text-slate-400">건</span>
                      {!inWeek && <><span className="ml-2 text-base font-bold tabular-nums text-sky-300">{fmt(rv, 'rate')}</span><span className="text-[10px] text-slate-400">명/10만</span></>}
                    </div>
                    <div className="text-[10px] text-slate-400">{inWeek ? `${week}주차 ` : ''}전국의 {Math.round((cv / natC) * 100)}%</div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* 핵심 분석 */}
          <div className="space-y-4 lg:col-span-5">
            <div className="grid grid-cols-3 gap-2">
              <Kpi label={effMetric === 'count' ? '전국 발생수' : '전국 발생률'} value={fmt(nationTotal, effMetric)} unit={effMetric === 'count' ? '건' : '명/10만'} tone="slate" />
              <Kpi label={effMetric === 'count' ? '최다 발생지' : '최고 발생률'} value={topSido && topSido.value > 0 ? topSido.name : '—'} unit={topSido && topSido.value > 0 ? `${fmt(topSido.value, effMetric)}${u}` : '발생 없음'} tone="rose" />
              <Kpi label={inWeek ? '전주 대비' : '전년 대비'} value={yoyBadge} unit={(inWeek ? weekIdx === 0 : yearIdx === 0) ? '기준' : '증감'} tone={yoy === null ? 'slate' : yoy > 0 ? 'red' : 'blue'} />
            </div>
            <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-500">
              <span>발생 시·도 <b className="text-slate-700 dark:text-slate-200">{stats.activeSido}</b>/17곳</span>
              {disease === ALL && <span>대상 감염병 <b className="text-slate-700 dark:text-slate-200">{diseaseTop.length}</b>종</span>}
              {stats.lowest && <span>최저 <b className="text-slate-700 dark:text-slate-200">{stats.lowest.name}</b> ({fmt(stats.lowest.value, effMetric)}{u})</span>}
            </div>

            <Panel title={`시·도 ${effMetric === 'count' ? '발생' : '발생률'} 순위 — ${diseaseLabel} (${periodLabel})`}>
              {rankPos.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">발생 데이터가 없습니다.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(180, rankPos.length * 19 + 20)}>
                  <BarChart data={rankPos} layout="vertical" margin={{ top: 0, right: 42, left: 6, bottom: 0 }}>
                    <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={34} interval={0} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <RTooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} formatter={(v) => [fmt(Number(v), effMetric) + u, diseaseLabel]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} onClick={(d) => { const c = (d as unknown as { code?: string; payload?: { code?: string } }); const code = c.code ?? c.payload?.code; if (code) setSelected(code) }} cursor="pointer">
                      {rankPos.map((r) => (<Cell key={r.code} fill={selected === r.code ? '#0ea5e9' : rampColor(Math.sqrt(r.value / maxV))} stroke={selected === r.code ? '#0369a1' : 'none'} strokeWidth={selected === r.code ? 1.5 : 0} />))}
                      <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v), effMetric)} style={{ fontSize: 10, fontWeight: 600, fill: '#64748b' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title={`연도별 추이 — ${diseaseLabel}${selected ? ` · ${SIDO_NAME[selected]} 비교` : ' (전국)'}`}>
              <ResponsiveContainer width="100%" height={175}>
                <LineChart data={trend} margin={{ top: 8, right: 14, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <RTooltip formatter={(v, n) => [fmt(Number(v), effMetric) + u, String(n)]} />
                  <Line type="monotone" dataKey="전국" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  {selected && <Line type="monotone" dataKey={SIDO_NAME[selected]} stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} />}
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* 보조 분석 */}
          <div className="space-y-4 lg:col-span-12">
            {(() => {
              const g = eidGrowthSignal()
              if (!g.rows.length) return null
              return (
                <Panel title={`🔔 급증 주의 신호 — 최근 4주 vs 직전 4주 (${EID_CUR_YEAR}년 ${g.week}주차)`}>
                  <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {g.rows.slice(0, 6).map((r) => (
                      <button key={r.name} onClick={() => { const code = EID_DISEASES.find((d) => cleanName(d) === r.name); if (code) setDisease(code) }}
                        className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span className="flex items-center gap-1.5 truncate text-sm text-slate-700 dark:text-slate-200">
                          <span className="rounded px-1 text-[10px] font-semibold text-white" style={{ background: GRP_COLOR[r.grp] || '#94a3b8' }}>{r.grp}</span>{r.name}
                        </span>
                        <span className="shrink-0 text-xs font-bold text-rose-600">▲{r.growthPct >= 999 ? '신규' : `${r.growthPct}%`}<span className="ml-1 font-normal text-slate-400">{r.prior}→{r.recent}</span></span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 px-1 text-[11px] text-slate-400">최근 4주 발생이 직전 4주보다 늘어난 감염병(증가율 순). 조기경보 참고용 · 신고지연으로 잠정.</p>
                </Panel>
              )
            })()}
            {disease === ALL && groupMix.length > 0 && (
              <Panel title={`법정 감염병 급(군)별 구성 — ${selected ? SIDO_NAME[selected] : '전국'} (${periodLabel})`}>
                {(() => {
                  const tot = groupMix.reduce((s, g) => s + g.value, 0) || 1
                  return (
                    <div className="px-1">
                      <div className="flex h-5 w-full overflow-hidden rounded-md">
                        {groupMix.map((g) => (<div key={g.name} style={{ width: `${(g.value / tot) * 100}%`, background: GRP_COLOR[g.name] }} title={`${g.name} ${nf(g.value)}건`} className="h-full" />))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {groupMix.map((g) => (<span key={g.name} className="flex items-center gap-1 text-xs text-slate-500"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GRP_COLOR[g.name] }} />{g.name} <b className="tabular-nums text-slate-700 dark:text-slate-200">{nf(g.value)}</b> ({Math.round((g.value / tot) * 100)}%)</span>))}
                      </div>
                    </div>
                  )
                })()}
              </Panel>
            )}

            {disease === ALL && !selected && diseaseTop.length > 0 && (
              <Panel title={`전국 감염병 Top — 발생수 (${periodLabel})`}>
                <div className="space-y-1">
                  {diseaseTop.slice(0, 10).map((d, i) => {
                    const max = diseaseTop[0].value || 1
                    return (
                      <button key={d.key} onClick={() => setDisease(d.key)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span className="w-4 shrink-0 text-xs font-bold text-slate-400">{i + 1}</span>
                        <span className="w-7 shrink-0 rounded px-1 text-center text-[10px] font-semibold text-white" style={{ background: GRP_COLOR[d.grp] || '#94a3b8' }}>{d.grp}</span>
                        <span className="w-28 shrink-0 truncate text-xs text-slate-700 dark:text-slate-200">{d.name}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: rampColor(Math.sqrt(d.value / max)) }} /></span>
                        <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{nf(d.value)}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 px-1 text-[11px] text-slate-400">행을 누르면 해당 감염병 지도로 전환됩니다.</p>
              </Panel>
            )}

            {selected && (
              <Panel title={`${SIDO_NAME[selected]} 주요 감염병 (${periodLabel})`}>
                {sidoBreakdown.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">해당 기간 발생 데이터가 없습니다.</p> : (
                  <ResponsiveContainer width="100%" height={sidoBreakdown.length * 26 + 16}>
                    <BarChart data={sidoBreakdown} layout="vertical" margin={{ top: 0, right: 42, left: 6, bottom: 0 }}>
                      <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <RTooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} formatter={(v) => [fmt(Number(v), effMetric) + u, SIDO_NAME[selected!]]} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#6366f1"><LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v), effMetric)} style={{ fontSize: 10, fill: '#94a3b8' }} /></Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Panel>
            )}
          </div>
          {/* 주식차트식 시계열(일/주/월/년) + 예측 */}
          <div className="lg:col-span-12">
            <EpiTrend disease={disease} diseaseLabel={diseaseLabel} inWeek={inWeek} selWeek={week} />
          </div>
        </div>
        </div>

        {/* 인구학·역학 심층 분석 — 우측 레일(와이드)·하단 3열(그 외). 지도 연도와 연동, 전국 기준 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 2xl:col-span-3 2xl:grid-cols-1 2xl:content-start">
          <SexAgePyramid disease={disease} diseaseLabel={diseaseLabel} year={year} />
          <DonutPanel title="환자분류" year={year} data={aggRecord(disease, EID_PTNT, year)} colors={['#14b8a6', '#3b82f6']} note="병원체보유자=증상 없이 균 보유 / 환자=증상 발현 · 전국" />
          <DonutPanel title="추정 감염지역" year={year} data={aggRecord(disease, EID_AREA, year)} colors={['#0ea5e9', '#f59e0b']} note="국내 감염 vs 해외 유입 추정 · 전국" />
        </div>
        </div>

        <p className="mx-auto mt-5 max-w-3xl text-center text-[11px] leading-relaxed text-slate-400">
          본 현황판은 질병관리청 감염병포털 발생현황 데이터를 시각화한 참고 정보입니다(공공누리 제4유형, 출처표시·요약).
          전수신고 대상 법정감염병 기준이며, 발생률은 인구 10만 명당입니다. 진단·의료적 판단을 대체하지 않습니다.
        </p>
      </div>
    </div>
  )
}

function Kpi({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: 'slate' | 'rose' | 'red' | 'blue' }) {
  const c = { slate: 'text-slate-800 dark:text-slate-100', rose: 'text-rose-600', red: 'text-red-600', blue: 'text-blue-600' }[tone]
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className={`mt-0.5 truncate text-xl font-bold tabular-nums ${c}`}>{value}</div>
      <div className="text-[11px] text-slate-400">{unit}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-2 px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {children}
    </div>
  )
}

// ════════ 심층 분석(전국 시계열·인구학) ════════
const MONTH_YEARS = (() => { const s = new Set<string>(); for (const d of EID_DISEASES) for (const y of Object.keys(EID_NAT_MONTH[d] || {})) s.add(y); return [...s].sort() })()
function aggArr(disease: string, store: Record<string, number[]>): number[] {
  if (disease !== ALL) return store[disease] ? [...store[disease]] : []
  const out: number[] = []
  for (const d of EID_DISEASES) { const a = store[d]; if (a) a.forEach((v, i) => { out[i] = (out[i] || 0) + (v || 0) }) }
  return out
}
function aggMonth(disease: string, year: string): number[] {
  if (disease !== ALL) return EID_NAT_MONTH[disease]?.[year] ? [...EID_NAT_MONTH[disease][year]] : new Array(12).fill(0)
  const out = new Array(12).fill(0)
  for (const d of EID_DISEASES) { const a = EID_NAT_MONTH[d]?.[year]; if (a) a.forEach((v, i) => { out[i] += v || 0 }) }
  return out
}
function aggYearVal(disease: string, year: string): number {
  if (disease !== ALL) return EID_NAT_YEAR[disease]?.[year] || 0
  let s = 0; for (const d of EID_DISEASES) s += EID_NAT_YEAR[d]?.[year] || 0; return s
}
function aggRecord(disease: string, store: Record<string, Record<string, Record<string, number>>>, year: string): { name: string; value: number }[] {
  const acc: Record<string, number> = {}
  const add = (o?: Record<string, number>) => { if (o) for (const [k, v] of Object.entries(o)) acc[k] = (acc[k] || 0) + v }
  if (disease !== ALL) add(store[disease]?.[year]); else for (const d of EID_DISEASES) add(store[d]?.[year])
  return Object.entries(acc).map(([name, value]) => ({ name, value })).filter((x) => x.value > 0)
}
function trimZeros(a: number[]): number[] { let last = -1; for (let i = a.length - 1; i >= 0; i--) if (a[i] > 0) { last = i; break } return last < 0 ? [] : a.slice(0, last + 1) }
function seasonalShare(disease: string): { share: number[]; hasPrior: boolean } {
  const share = new Array(12).fill(0); let cnt = 0
  for (const y of MONTH_YEARS) { if (+y >= +EID_CUR_YEAR) continue; const a = aggMonth(disease, y); const tot = a.reduce((s, v) => s + v, 0); if (tot > 0) { for (let m = 0; m < 12; m++) share[m] += a[m] / tot; cnt++ } }
  if (cnt) for (let m = 0; m < 12; m++) share[m] /= cnt
  return { share, hasPrior: cnt > 0 }
}
function estimateAnnual(disease: string): { est: number; hasPrior: boolean; kMonth: number } {
  const curM = aggMonth(disease, EID_CUR_YEAR)
  let k = -1; for (let m = 11; m >= 0; m--) if (curM[m] > 0) { k = m; break }
  if (k < 0) return { est: 0, hasPrior: false, kMonth: -1 }
  const { share, hasPrior } = seasonalShare(disease)
  if (!hasPrior) return { est: 0, hasPrior: false, kMonth: k }
  const kc = k > 0 ? k - 1 : k
  const ytd = curM.slice(0, kc + 1).reduce((s, v) => s + v, 0)
  const cum = share.slice(0, kc + 1).reduce((s, v) => s + v, 0) || 1
  return { est: ytd / cum, hasPrior: true, kMonth: k }
}

type TPt = { x: number | string; label: string; actual: number | null; pred: number | null }
function EpiTrend({ disease, diseaseLabel, inWeek, selWeek }: { disease: string; diseaseLabel: string; inWeek: boolean; selWeek: number }) {
  const [tg, setTg] = useState<'day' | 'week' | 'month' | 'year'>('week')
  useEffect(() => { if (inWeek) setTg('week') }, [inWeek])
  const cur = EID_CUR_YEAR

  const built = useMemo(() => {
    if (tg === 'day') {
      const arr = trimZeros(aggArr(disease, EID_NAT_DAILY))
      const data: TPt[] = arr.map((v, i) => { const dt = new Date(+cur, 0, 1 + i); return { x: i, label: `${dt.getMonth() + 1}/${dt.getDate()}`, actual: v, pred: null } })
      return { data, predicted: false, sel: 0, tip: (i: number) => `${cur}년 ${data[i]?.label || ''}`, note: '일(日) 단위 · 평일/주말 신고 편차 있음', minGap: 30 }
    }
    if (tg === 'week') {
      const arr = trimZeros(aggArr(disease, EID_WK_NAT)); const k = arr.length - 1
      const { est, hasPrior } = estimateAnnual(disease); const { share } = seasonalShare(disease)
      const ytd = arr.reduce((s, v) => s + v, 0); const remaining = Math.max(0, est - ytd)
      const wkMonth = (w: number) => Math.min(11, Math.floor((w - 1) / (52 / 12)))
      let futSum = 0; for (let w = k + 2; w <= 52; w++) futSum += share[wkMonth(w)]
      const data: TPt[] = []
      for (let w = 1; w <= 52; w++) {
        const actual = w <= k + 1 ? (arr[w - 1] ?? 0) : null
        let pred: number | null = null
        if (hasPrior && remaining > 0) { if (w === k + 1) pred = arr[k] ?? 0; else if (w > k + 1 && futSum > 0) pred = remaining * share[wkMonth(w)] / futSum }
        data.push({ x: w, label: `${w}주`, actual, pred })
      }
      return { data, predicted: hasPrior && remaining > 0, sel: inWeek ? selWeek : 0, tip: (w: number) => `${cur}년 ${w}주차`, note: `주(週) 단위${inWeek ? ' · 지도 슬라이더와 연동' : ''}`, minGap: 8 }
    }
    if (tg === 'month') {
      const curM = aggMonth(disease, cur); let k = -1; for (let m = 11; m >= 0; m--) if (curM[m] > 0) { k = m; break }
      const { est, hasPrior } = estimateAnnual(disease); const { share } = seasonalShare(disease)
      const data: TPt[] = []
      for (let m = 0; m < 12; m++) {
        const actual = m <= k ? curM[m] : null
        let pred: number | null = null
        if (hasPrior && k >= 0 && k < 11) { if (m === k) pred = curM[k]; else if (m > k) pred = est * share[m] }
        data.push({ x: m + 1, label: `${m + 1}월`, actual, pred })
      }
      return { data, predicted: hasPrior && k >= 0 && k < 11, sel: 0, tip: (m: number) => `${cur}년 ${m}월`, note: '월(月) 단위 · 올해 잔여기간 예측', minGap: 6 }
    }
    const years = MONTH_YEARS.length ? MONTH_YEARS : (EID_YEARS as readonly string[]).slice()
    const { est, hasPrior } = estimateAnnual(disease)
    const data: TPt[] = years.map((y) => ({ x: y, label: y, actual: aggYearVal(disease, y), pred: (+y === +cur && hasPrior) ? est : null }))
    for (let i = 0; i < data.length; i++) if (data[i].pred != null && i > 0) data[i - 1].pred = data[i - 1].actual
    return { data, predicted: hasPrior, sel: 0, tip: (y: string) => `${y}년`, note: '연(年) 단위 · 올해는 예측 연간총계', minGap: 6 }
  }, [disease, tg, inWeek, selWeek, cur])

  const totalActual = built.data.reduce((s, r) => s + (r.actual || 0), 0)
  const peak = built.data.reduce<TPt>((m, r) => ((r.actual || 0) > (m.actual || 0) ? r : m), { x: 0, label: '', actual: 0, pred: null })
  const hasData = built.data.some((r) => r.actual != null)
  const TG = [{ k: 'day', t: '일' }, { k: 'week', t: '주' }, { k: 'month', t: '월' }, { k: 'year', t: '년' }] as const

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">📈 전국 발생 추이 — {diseaseLabel}</h3>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-slate-400 sm:inline">{built.note} · 누적 {nf(totalActual)}건{peak.label ? ` · 최다 ${peak.label}` : ''}</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {TG.map((g) => (<button key={g.k} onClick={() => setTg(g.k)} className={`rounded-md px-3 py-1 text-xs font-semibold transition ${tg === g.k ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}>{g.t}</button>))}
          </div>
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={235}>
          <LineChart data={built.data} margin={{ top: 8, right: 18, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={built.minGap} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <RTooltip formatter={(v, n) => [nf(Number(v)) + '건', n === 'pred' ? '예측치' : '실제']} />
            {built.predicted && <Line type="monotone" dataKey="pred" stroke="#f43f5e" strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.65} dot={false} connectNulls name="pred" isAnimationActive={false} />}
            <Line type="monotone" dataKey="actual" stroke="#2563eb" strokeWidth={2.4} dot={tg === 'year' ? { r: 3 } : false} activeDot={{ r: 4 }} connectNulls name="actual" />
            {built.sel ? <ReferenceLine x={`${built.sel}주`} stroke="#2563eb" strokeOpacity={0.5} strokeWidth={1.5} label={{ value: `${built.sel}주`, fontSize: 10, fill: '#2563eb', position: 'top' }} /> : null}
          </LineChart>
        </ResponsiveContainer>
      ) : <p className="py-8 text-center text-sm text-slate-400">{diseaseLabel}의 {cur}년 데이터가 없습니다.</p>}
      <p className="mt-1 px-1 text-[11px] leading-relaxed text-slate-400">
        {built.predicted ? <><b className="text-rose-500">─ ─ 점선 = 예측치</b>(과거 연도의 같은 시기 패턴으로 추정한 값으로 실제와 다를 수 있어요). </> : null}
        실선은 실제 발생수입니다. 일/주/월/년을 눌러 기간 단위를 바꿔보세요. 출처: 질병관리청 감염병포털.
      </p>
    </div>
  )
}

const AGE_ORDER = ['00~09', '10~19', '20~29', '30~39', '40~49', '50~59', '60~69', '70~79', '80~89', '90~99', '100~109', '미입력']
function SexAgePyramid({ disease, diseaseLabel, year }: { disease: string; diseaseLabel: string; year: string }) {
  const { data, totM, totF } = useMemo(() => {
    const acc: Record<string, { m: number; f: number }> = {}
    const add = (o?: Record<string, { m: number; f: number }>) => { if (o) for (const [age, mf] of Object.entries(o)) { (acc[age] ??= { m: 0, f: 0 }); acc[age].m += mf.m; acc[age].f += mf.f } }
    if (disease !== ALL) add(EID_SEXAGE[disease]?.[year]); else for (const d of EID_DISEASES) add(EID_SEXAGE[d]?.[year])
    const rows = Object.keys(acc).sort((a, b) => { const ia = AGE_ORDER.indexOf(a), ib = AGE_ORDER.indexOf(b); return (ib < 0 ? 99 : ib) - (ia < 0 ? 99 : ia) })
      .map((age) => ({ age, 남: -acc[age].m, 여: acc[age].f })).filter((r) => r.남 !== 0 || r.여 !== 0)
    return { data: rows, totM: rows.reduce((s, r) => s - r.남, 0), totF: rows.reduce((s, r) => s + r.여, 0) }
  }, [disease, year])
  return (
    <Panel title={`성별·연령 분포 — ${diseaseLabel} · 전국 (${year})`}>
      {data.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">데이터 없음</p> : (
        <>
          <div className="mb-1 flex justify-center gap-4 text-[11px]"><span className="font-medium text-cyan-600">■ 남 {nf(totM)}</span><span className="font-medium text-pink-500">■ 여 {nf(totF)}</span></div>
          <ResponsiveContainer width="100%" height={Math.max(190, data.length * 20 + 24)}>
            <BarChart data={data} layout="vertical" stackOffset="sign" margin={{ top: 0, right: 6, left: 4, bottom: 0 }}>
              <XAxis type="number" tickFormatter={(v) => nf(Math.abs(Number(v)))} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="age" tick={{ fontSize: 10, fill: '#64748b' }} width={42} axisLine={false} tickLine={false} />
              <RTooltip formatter={(v, n) => [nf(Math.abs(Number(v))) + '명', String(n)]} />
              <Bar dataKey="남" stackId="a" fill="#06b6d4" radius={[3, 0, 0, 3]} />
              <Bar dataKey="여" stackId="a" fill="#ec4899" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </Panel>
  )
}

function DonutPanel({ title, data, colors, note, year }: { title: string; data: { name: string; value: number }[]; colors: string[]; note: string; year: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <Panel title={`${title} (${year})`}>
      {total === 0 ? <p className="py-10 text-center text-sm text-slate-400">데이터 없음</p> : (
        <div className="flex items-center gap-2">
          <ResponsiveContainer width="48%" height={150}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={2}>
                {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
              </Pie>
              <RTooltip formatter={(v, n) => [nf(Number(v)) + '건', String(n)]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1.5">
            {data.map((d, i) => (<div key={d.name} className="flex items-center gap-2 text-xs"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colors[i % colors.length] }} /><span className="flex-1 truncate text-slate-600 dark:text-slate-300">{d.name}</span><b className="tabular-nums text-slate-800 dark:text-slate-100">{Math.round(d.value / total * 100)}%</b></div>))}
          </div>
        </div>
      )}
      <p className="mt-1 px-1 text-[11px] leading-relaxed text-slate-400">{note}</p>
    </Panel>
  )
}
