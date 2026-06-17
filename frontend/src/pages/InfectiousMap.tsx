// 감염병 발생 현황판 — 질병관리청 감염병포털 EDW(시도×연 + 시도×주).
// 연간/주별 토글: 연간=연도 슬라이더 다년 지도, 주별=주차 슬라이더가 지도를 직접 변경(시도×주). 발생수/발생률 칩, 에피데믹 커브, 분석 패널.
// 데이터: 배치 정적 캐시(eid-region.ts), 지도경계: kr-geo.ts. per-request 외부호출 없음(§13.7).
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, LabelList, ReferenceLine, PieChart, Pie,
  ScatterChart, Scatter, ZAxis,
} from 'recharts'
import {
  EID_YEARS, EID_PARTIAL_YEAR, EID_CUR_YEAR, EID_CUR_WEEK, EID_SIDO, EID_DISEASES, EID_GROUP,
  EID_WEEKLY_DISEASES, EID_COUNT, EID_RATE, EID_WK_SIDO, EID_WK_NAT,
  EID_NAT_DAILY, EID_NAT_MONTH, EID_NAT_YEAR, EID_SEXAGE, EID_PTNT, EID_AREA,
} from '../data/eid-region'
import { KR_GEO, KR_VIEWBOX } from '../data/kr-geo'
import { eidGrowthSignal } from '../lib/eidStats'
import { openInfectionReport, type InfectionReportData } from '../lib/infectionReport'
import InfoTip, { GLOSSARY } from '../components/InfoTip'

type Metric = 'count' | 'rate'
const ALL = '__ALL__'
const cleanName = (d: string) => d.replace(/^@/, '')
const nf = (n: number) => n.toLocaleString('ko-KR')
const SIDO_NAME: Record<string, string> = Object.fromEntries(EID_SIDO.map((s) => [s.code, s.name]))
// 시도 면적(㎢, 공개 행정구역 면적 근사 — 인구밀도 산출용 고정값). 이름 부분일치로 매칭(강원특별자치도 등).
const SIDO_AREA_KM2: Record<string, number> = {
  서울: 605, 부산: 770, 대구: 1499, 인천: 1067, 광주: 501, 대전: 539, 울산: 1062, 세종: 465,
  경기: 10195, 강원: 16826, 충북: 7407, 충남: 8247, 전북: 8073, 전남: 12361, 경북: 19036, 경남: 10540, 제주: 1850,
}
const areaOf = (name: string): number => { const k = Object.keys(SIDO_AREA_KM2).find((x) => name.includes(x)); return k ? SIDO_AREA_KM2[k] : 0 }
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
// 인구추정 안정화 — 진행중 잠정연도(2026) 제외 최신 전체연도. 주별 발생률은 이 인구로 환산(주별엔 rate 필드가 없어 발생수÷인구로 산출).
const POP_YEAR = [...EID_YEARS].reverse().find((y) => y !== EID_PARTIAL_YEAR) || EID_YEARS[EID_YEARS.length - 1]
// 시도 인구(=발생수/발생률×10만, 전 질병 합산으로 역산). 주별 발생률 환산용.
function sidoPop(sido: string): number {
  let c = 0, r = 0
  for (const d of EID_DISEASES) { c += EID_COUNT[POP_YEAR]?.[d]?.[sido] ?? 0; r += EID_RATE[POP_YEAR]?.[d]?.[sido] ?? 0 }
  return r > 0 ? (c / r) * 100000 : 1
}
// 전국 값 — 발생률은 EID_RATE에 '00'(전국) 행이 없어 0이 됨 → 전국발생수÷전국인구×10만으로 산출.
function natVal(metric: Metric, disease: string, year: string): number {
  if (metric === 'rate') return (annualVal('count', disease, year, '00') / nationalPop(year)) * 100000
  return annualVal('count', disease, year, '00')
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
  const effMetric: Metric = metric // 주별에서도 발생률 허용(해당 주 인구10만명당 = 주발생수÷시도인구)
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
    const per: Record<string, number> = {}; let mx = 0; let wkCountSum = 0
    for (const s of EID_SIDO) {
      let v: number
      if (inWeek) { const c = weekVal(disease, week, s.code); wkCountSum += c; v = effMetric === 'rate' ? (c / sidoPop(s.code)) * 100000 : c }
      else v = annualVal(effMetric, disease, year, s.code)
      per[s.code] = v; if (v > mx) mx = v
    }
    const sum = EID_SIDO.reduce((t, s) => t + (per[s.code] || 0), 0)
    let nat: number
    if (inWeek) nat = effMetric === 'rate' ? (wkCountSum / nationalPop(POP_YEAR)) * 100000 : wkCountSum
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
    const row: Record<string, number | string> = { year: y, 전국: natVal(effMetric, disease, y) }
    if (selected) row[SIDO_NAME[selected]] = annualVal(effMetric, disease, y, selected)
    return row
  }), [effMetric, disease, selected])

  // 전기간 대비(연간=전년, 주별=전주)
  const prevTotal = inWeek
    ? (weekIdx > 0 ? EID_SIDO.reduce((t, s) => t + weekVal(disease, week - 1, s.code), 0) : null)
    : (yearIdx > 0 ? natVal(effMetric, disease, EID_YEARS[yearIdx - 1]) : null)
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

  // 📄 PDF 리포트 — 현재 선택(감염병·기간·지표)을 A4 양식으로 새 창에 렌더 + 인쇄
  function generateReport() {
    const svg = mapRef.current?.querySelector('svg')
    const g = eidGrowthSignal()
    const data: InfectionReportData = {
      diseaseLabel,
      periodLabel,
      metricLabel: effMetric === 'count' ? '발생 수' : '인구 10만 명당 발생률',
      unit: u,
      nationTotal: fmt(nationTotal, effMetric),
      topName: topSido && topSido.value > 0 ? topSido.name : '—',
      topValue: topSido && topSido.value > 0 ? `${fmt(topSido.value, effMetric)}${u}` : '발생 없음',
      yoyLabel: inWeek ? '전주 대비' : '전년 대비',
      yoyBadge,
      yoyIsUp: yoy === null ? null : yoy > 0 ? true : yoy < 0 ? false : null,
      insight,
      ranking: rankPos.map((r) => ({ name: r.name, value: r.value, valueFmt: `${fmt(r.value, effMetric)}${u}` })),
      trend: trend.map((t) => ({ year: String(t.year), value: fmt(Number(t.전국), effMetric) })),
      growth: g.rows.slice(0, 6).map((r) => ({ grp: r.grp, name: r.name, growthPct: r.growthPct, prior: r.prior, recent: r.recent })),
      growthWeek: g.rows.length ? g.week : null,
      mapSvg: svg ? svg.outerHTML : null,
      isPartial,
    }
    const ok = openInfectionReport(data)
    if (!ok) alert('팝업이 차단되었어요. 브라우저 주소창의 팝업 허용을 켜고 다시 시도해 주세요.')
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
              질병관리청 <b>감염병포털 발생현황</b><InfoTip term="전수신고" /> · 전국 17개 시·도 · 시도별 <b>주(週) 단위</b>까지
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={generateReport}
              className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
              title="현재 선택(감염병·기간·지표)을 A4 분석 리포트로 저장">
              <span>📄</span> 리포트(PDF) 저장
            </button>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">출처: 질병관리청 감염병포털</span>
          </div>
        </div>

        {/* 컨트롤 */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <label className="shrink-0 text-xs font-semibold text-slate-500">감염병</label>
            <select value={disease} onChange={(e) => setDisease(e.target.value)}
              className="min-w-0 max-w-full flex-1 truncate rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 focus:border-blue-500 focus:outline-none sm:flex-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
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
                  <button key={mk} onClick={() => setMetric(mk)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${metric === mk ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}>
                    {mk === 'count' ? '발생 수' : '인구 10만 명당 발생률'}
                  </button>
                ))}
              </div>
              <InfoTip term="발생률" />
            </div>
            <span className="text-[11px] text-slate-400">{effMetric === 'count' ? (inWeek ? '시도×주 발생수 — 주차 슬라이더가 지도를 바꿉니다' : '신고된 환자 수') : (inWeek ? `해당 주 인구10만명당 발생률(인구는 ${POP_YEAR}년 기준) — 인구 적은 지역 유행강도까지 공정비교` : '인구 대비 발생률 — 인구 적은 지역 유행강도까지 공정비교')}</span>
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
                  {diseaseLabel}{/CRE|카바페넴/.test(diseaseLabel) && <InfoTip term="CRE" />} · {periodLabel} 시·도 {effMetric === 'count' ? '발생 분포' : '발생률(10만명당) 분포'}
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

          {/* 보조 분석 (급증 신호는 우측 레일로 이동) */}
          <div className="space-y-4 lg:col-span-12">
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
            <EpiTrend disease={disease} diseaseLabel={diseaseLabel} inWeek={inWeek} selWeek={week} selSido={selected} />
          </div>
        </div>
        </div>

        {/* 인구학·역학 심층 분석 + 급증 신호 — 우측 레일(와이드)·하단 3열(그 외). 지도 연도와 연동, 전국 기준 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 2xl:col-span-3 2xl:grid-cols-1 2xl:content-start">
          {/* 🔔 급증 주의 신호 — 우측 레일 1열(좌측존에서 이동, 빈 공간 채움) */}
          {(() => {
            const g = eidGrowthSignal()
            if (!g.rows.length) return null
            return (
              <div className="sm:col-span-3 2xl:col-span-1">
                <Panel title={`🔔 급증 주의 신호(전국) — 최근 4주 vs 직전 4주 (${EID_CUR_YEAR}년 ${g.week}주차)`}>
                  <div className="space-y-0.5">
                    {g.rows.slice(0, 6).map((r) => (
                      <button key={r.name} onClick={() => { const code = EID_DISEASES.find((d) => cleanName(d) === r.name); if (code) setDisease(code) }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span className="flex items-center gap-1.5 truncate text-sm text-slate-700 dark:text-slate-200">
                          <span className="rounded px-1 text-[10px] font-semibold text-white" style={{ background: GRP_COLOR[r.grp] || '#94a3b8' }}>{r.grp}</span>{r.name}
                        </span>
                        <span className="shrink-0 text-xs font-bold text-rose-600">▲{r.growthPct >= 999 ? '신규' : `${r.growthPct}%`}<span className="ml-1 font-normal text-slate-400">{r.prior}→{r.recent}</span></span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 px-1 text-[11px] text-slate-400">최근 4주 발생이 직전 4주보다 늘어난 감염병(증가율 순). 조기경보 참고 · 신고지연으로 잠정.</p>
                </Panel>
              </div>
            )
          })()}
          {selected && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 sm:col-span-3 2xl:col-span-1 dark:bg-amber-950/30 dark:text-amber-300">ℹ️ 성별·연령·환자분류·감염지역은 질병관리청이 <b>전국 단위로만</b> 제공해, {SIDO_NAME[selected]} 선택과 무관하게 전국 기준으로 표시됩니다. (시도별 분포는 위 지도·순위·추이를 참고)</p>}
          <SexAgePyramid disease={disease} diseaseLabel={diseaseLabel} year={year} />
          <DonutPanel title="환자분류" tip="병원체보유자" year={year} data={aggRecord(disease, EID_PTNT, year)} colors={['#14b8a6', '#3b82f6']} note="병원체보유자=증상 없이 균 보유 / 환자=증상 발현 · 전국" />
          <DonutPanel title="추정 감염지역" year={year} data={aggRecord(disease, EID_AREA, year)} colors={['#0ea5e9', '#f59e0b']} note="국내 감염 vs 해외 유입 추정 · 전국" />
        </div>
        </div>

        {/* 고급 분석(발생률 히트맵·위험지수·계절성·지역 클러스터링) */}
        <AdvancedAnalytics year={inWeek ? EID_CUR_YEAR : year} disease={disease} diseaseLabel={diseaseLabel} />

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

function Panel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
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

// 시도별 — 주별(EID_WK_SIDO 보유)·연도별(EID_COUNT 보유). 월/일별 시도는 미수집(전국만).
function weeklySidoArr(disease: string, sido: string): number[] {
  const len = EID_CUR_WEEK; const arr = new Array(len).fill(0)
  const add = (d: string) => { const w = EID_WK_SIDO[d]; if (w) for (let wk = 1; wk <= len; wk++) arr[wk - 1] += w[wk]?.[sido] || 0 }
  if (disease === ALL) EID_WEEKLY_DISEASES.forEach(add); else add(disease)
  return arr
}
function yearSidoVal(disease: string, year: string, sido: string): number {
  if (disease === ALL) { let s = 0; for (const d of EID_DISEASES) s += EID_COUNT[year]?.[d]?.[sido] || 0; return s }
  return EID_COUNT[year]?.[disease]?.[sido] || 0
}

type TPt = { x: number | string; label: string; actual: number | null; pred: number | null; dow?: string; full?: string }
const DOW = ['일', '월', '화', '수', '목', '금', '토']
// 데이터 점 간격(집계 단위) 선택 — '보이는 기간'이 아니라 '점 간격'을 고른다. 보이는 범위는 드래그·휠·스크롤바.
type IntervalK = 'day' | 'week' | 'month' | 'quarter' | 'half' | 'year'
const INTERVALS: { k: IntervalK; t: string }[] = [
  { k: 'day', t: '1일' }, { k: 'week', t: '1주' }, { k: 'month', t: '1개월' },
  { k: 'quarter', t: '3개월' }, { k: 'half', t: '6개월' }, { k: 'year', t: '1년' },
]
const WIN_DEFAULT: Record<IntervalK, number> = { day: 30, week: 26, month: 12, quarter: 8, half: 6, year: 99 }
const quarterMonths = (q: number) => [q * 3 - 3, q * 3 - 2, q * 3 - 1] // q:1..4 → 0-based 월 인덱스
function EpiTrend({ disease, diseaseLabel, inWeek, selWeek, selSido }: { disease: string; diseaseLabel: string; inWeek: boolean; selWeek: number; selSido: string | null }) {
  const [iv, setIv] = useState<IntervalK>('week')
  const tg = iv
  const baseWin = WIN_DEFAULT[iv]
  const cur = EID_CUR_YEAR
  const scope = selSido ? SIDO_NAME[selSido] : '전국'
  // 시도 선택 시 일/월/분기/반기는 시도별 미수집 → 전국으로 폴백(주·년만 시도별).
  const regionFallback = !!selSido && iv !== 'week' && iv !== 'year'

  // 전체 감염병일 때: 그 시점(빈)의 상위 발생 감염병 Top5 — 호버 툴팁에 표시
  function top5For(pt: TPt): { name: string; value: number }[] {
    const list = (val: (d: string) => number) => EID_DISEASES.map((d) => ({ name: cleanName(d), value: val(d) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)
    const xs = String(pt.x)
    if (tg === 'day') { const i = Number(pt.x); return list((d) => EID_NAT_DAILY[d]?.[i] || 0) }
    if (tg === 'week') { const w = Number(pt.x); return list((d) => EID_WK_NAT[d]?.[w - 1] || 0) }
    if (tg === 'month') { const [y, mm] = xs.split('-'); const m = Number(mm) - 1; return list((d) => EID_NAT_MONTH[d]?.[y]?.[m] || 0) }
    if (tg === 'quarter') { const [y, q] = xs.split('-Q'); const ms = quarterMonths(Number(q)); return list((d) => ms.reduce((s, m) => s + (EID_NAT_MONTH[d]?.[y]?.[m] || 0), 0)) }
    if (tg === 'half') { const [y, h] = xs.split('-H'); const base = (Number(h) - 1) * 6; return list((d) => { let s = 0; for (let m = base; m < base + 6; m++) s += EID_NAT_MONTH[d]?.[y]?.[m] || 0; return s }) }
    return list((d) => EID_NAT_YEAR[d]?.[xs] || 0)
  }
  // 호버 툴팁 — 기간·건수 + (전체 감염병이면) 그 시점 상위 감염병 Top5
  const renderTip = (o: { active?: boolean; payload?: { payload?: TPt }[] }) => {
    if (!o.active || !o.payload || !o.payload.length) return null
    const pt = o.payload[0].payload; if (!pt) return null
    const isPred = pt.actual == null && pt.pred != null
    const val = pt.actual ?? pt.pred
    const top = disease === ALL ? top5For(pt) : []
    return (
      <div className="rounded-lg bg-slate-900/95 px-3 py-2 text-xs text-white shadow-lg">
        <div className="font-bold">{(pt.full || pt.label)}{pt.dow ? ` (${pt.dow})` : ''}{isPred ? <span className="ml-1 font-normal text-rose-300">예측</span> : ''}</div>
        <div className="mt-0.5">{scope} {diseaseLabel} <b className="text-amber-300">{val != null ? nf(val) : '-'}</b>건</div>
        {top.length > 0 && (
          <div className="mt-1.5 border-t border-white/15 pt-1.5">
            <div className="mb-0.5 text-[10px] text-slate-400">이 시점 상위 감염병 Top{top.length}</div>
            {top.map((r, i) => (<div key={r.name} className="flex justify-between gap-3 tabular-nums"><span className="text-slate-200">{i + 1}. {r.name}</span><b className="text-amber-200">{nf(r.value)}</b></div>))}
          </div>
        )}
      </div>
    )
  }

  const built = useMemo(() => {
    const fbNote = regionFallback ? ' · 전국(이 단위 시도별 미제공)' : ''
    // 일(日) — 전국 일별(시도 미제공 → 전국)
    if (tg === 'day') {
      const arr = trimZeros(aggArr(disease, EID_NAT_DAILY))
      const data: TPt[] = arr.map((v, i) => { const dt = new Date(+cur, 0, 1 + i); return { x: i, label: `${dt.getMonth() + 1}/${dt.getDate()}`, full: `${cur}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일`, dow: DOW[dt.getDay()], actual: v, pred: null } })
      return { data, predicted: false, sel: 0, note: '일(日) 단위 · 평일/주말 신고 편차' + fbNote, minGap: 30 }
    }
    // 주(週)
    if (tg === 'week') {
      if (selSido) { // 시도 주별(예측 없음)
        const arr = trimZeros(weeklySidoArr(disease, selSido))
        const data: TPt[] = arr.map((v, i) => ({ x: i + 1, label: `${i + 1}주`, full: `${cur}년 ${i + 1}주차`, actual: v, pred: null }))
        return { data, predicted: false, sel: inWeek ? selWeek : 0, note: `주(週) 단위 · ${scope}`, minGap: 8 }
      }
      const arr = trimZeros(aggArr(disease, EID_WK_NAT)); const k = arr.length - 1
      const { est, hasPrior } = estimateAnnual(disease); const { share } = seasonalShare(disease)
      const ytd = arr.reduce((s, v) => s + v, 0); const remaining = Math.max(0, est - ytd)
      const wkMonth = (w: number) => Math.min(11, Math.floor((w - 1) / (52 / 12)))
      let futSum = 0; for (let w = k + 2; w <= 52; w++) futSum += share[wkMonth(w)]
      const data: TPt[] = []
      for (let w = 1; w <= 52; w++) {
        const actual = w <= k + 1 ? (arr[w - 1] ?? 0) : null
        let pred: number | null = null
        if (hasPrior && remaining > 0) { if (w === k + 1) pred = arr[k] ?? 0; else if (w > k + 1 && futSum > 0) pred = Math.round(remaining * share[wkMonth(w)] / futSum) }
        data.push({ x: w, label: `${w}주`, full: `${cur}년 ${w}주차`, actual, pred })
      }
      return { data, predicted: hasPrior && remaining > 0, sel: inWeek ? selWeek : 0, note: `주(週) 단위${inWeek ? ' · 지도 슬라이더 연동' : ''}`, minGap: 8 }
    }
    // 월(月) — 다년
    if (tg === 'month') {
      const yrs = (MONTH_YEARS.length ? MONTH_YEARS : [cur]).filter((y) => +y <= +cur)
      const curM = aggMonth(disease, cur); let k = -1; for (let m = 11; m >= 0; m--) if (curM[m] > 0) { k = m; break }
      const { est, hasPrior } = estimateAnnual(disease); const { share } = seasonalShare(disease)
      const data: TPt[] = []
      for (const y of yrs) {
        const mArr = aggMonth(disease, y); const isCur = +y === +cur
        for (let m = 0; m < 12; m++) {
          const actual = !isCur ? (mArr[m] ?? 0) : (m <= k ? curM[m] : null)
          let pred: number | null = null
          if (isCur && hasPrior && k >= 0 && k < 11) { if (m === k) pred = curM[k]; else if (m > k) pred = Math.round(est * share[m]) }
          data.push({ x: `${y}-${m + 1}`, label: `${String(y).slice(2)}.${m + 1}`, full: `${y}년 ${m + 1}월`, actual, pred })
        }
      }
      return { data, predicted: hasPrior && k >= 0 && k < 11, sel: 0, note: '월(月) 단위 · 다년' + fbNote, minGap: 14 }
    }
    // 분기(3개월)·반기(6개월) — 다년, 월별 합산
    if (tg === 'quarter' || tg === 'half') {
      const size = tg === 'quarter' ? 3 : 6
      const yrs = (MONTH_YEARS.length ? MONTH_YEARS : [cur]).filter((y) => +y <= +cur)
      const data: TPt[] = []
      for (const y of yrs) {
        const mArr = aggMonth(disease, y); const isCur = +y === +cur
        for (let b = 0; b < 12 / size; b++) {
          let sum = 0, hasAny = false
          for (let m = b * size; m < b * size + size; m++) { sum += mArr[m] || 0; if ((mArr[m] || 0) > 0) hasAny = true }
          const xk = tg === 'quarter' ? `${y}-Q${b + 1}` : `${y}-H${b + 1}`
          const label = tg === 'quarter' ? `${String(y).slice(2)} ${b + 1}Q` : `${String(y).slice(2)} ${b === 0 ? '상' : '하'}`
          const full = tg === 'quarter' ? `${y}년 ${b + 1}분기` : `${y}년 ${b === 0 ? '상반기' : '하반기'}`
          data.push({ x: xk, label, full, actual: (isCur && !hasAny) ? null : sum, pred: null })
        }
      }
      return { data, predicted: false, sel: 0, note: (tg === 'quarter' ? '분기(3개월) 단위 · 다년' : '반기(6개월) 단위 · 다년') + fbNote, minGap: 1 }
    }
    // 년(年) — 다년
    const years = MONTH_YEARS.length ? MONTH_YEARS : (EID_YEARS as readonly string[]).slice()
    if (selSido) {
      const data: TPt[] = years.map((y) => ({ x: y, label: y, full: `${y}년`, actual: yearSidoVal(disease, y, selSido), pred: null }))
      return { data, predicted: false, sel: 0, note: `연(年) 단위 · ${scope}`, minGap: 6 }
    }
    const { est, hasPrior } = estimateAnnual(disease)
    const data: TPt[] = years.map((y) => ({ x: y, label: y, full: `${y}년`, actual: aggYearVal(disease, y), pred: (+y === +cur && hasPrior) ? Math.round(est) : null }))
    for (let i = 0; i < data.length; i++) if (data[i].pred != null && i > 0) data[i - 1].pred = data[i - 1].actual
    return { data, predicted: hasPrior, sel: 0, note: '연(年) 단위 · 올해는 예측 연간총계', minGap: 6 }
  }, [disease, tg, inWeek, selWeek, cur, selSido, scope, regionFallback])

  const totalActual = built.data.reduce((s, r) => s + (r.actual || 0), 0)
  const peak = built.data.reduce<TPt>((m, r) => ((r.actual || 0) > (m.actual || 0) ? r : m), { x: 0, label: '', actual: 0, pred: null })
  const hasData = built.data.some((r) => r.actual != null)

  // 주식차트식: 표시기한 칩이 표시개수 결정 → 데이터를 win으로 잘라 보여줌. 차트 본체 드래그·휠줌·스크롤바로 이동/확대.
  const n = built.data.length
  const MINWIN = 4
  const latestEnd = useMemo(() => {
    let la = n - 1; for (let i = n - 1; i >= 0; i--) if (built.data[i].actual != null) { la = i; break }
    return built.predicted ? Math.min(n - 1, la + 4) : la
  }, [built, n])
  const [win, setWin] = useState<{ s: number; e: number }>({ s: 0, e: 0 })
  const showPan = n > 1
  // 표시기한/데이터 바뀌면 최근 baseWin개로 리셋
  useEffect(() => {
    const sz = Math.max(MINWIN, Math.min(n, baseWin))
    setWin({ s: Math.max(0, latestEnd - sz + 1), e: latestEnd })
  }, [iv, tg, baseWin, latestEnd, n])
  const clampWin = (s: number, e: number) => { const sz = e - s + 1; if (s < 0) { s = 0; e = sz - 1 } if (e > n - 1) { e = n - 1; s = e - sz + 1 } return { s: Math.max(0, s), e: Math.min(n - 1, e) } }
  const toLatest = () => setWin((w) => { const sz = Math.max(MINWIN, w.e - w.s + 1); return { s: Math.max(0, latestEnd - sz + 1), e: latestEnd } })
  // 본체 잡아끌기(드래그) → win 이동
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; s: number; e: number } | null>(null)
  const onDown = (e: RPointerEvent) => {
    if (!showPan) return
    drag.current = { x: e.clientX, s: win.s, e: win.e }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const onMove = (e: RPointerEvent) => {
    if (!drag.current || !wrapRef.current) return
    const w = wrapRef.current.clientWidth || 1
    const ws = drag.current.e - drag.current.s + 1
    const d = Math.round(-((e.clientX - drag.current.x) / w) * ws)
    setWin(clampWin(drag.current.s + d, drag.current.e + d))
  }
  const onUp = () => { drag.current = null }
  // 휠 줌(논패시브) — 위로 확대(개수↓), 아래로 축소(개수↑), 중심 고정
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const onWheel = (ev: WheelEvent) => {
      if (n <= MINWIN) return
      ev.preventDefault()
      setWin((w) => {
        const ws = w.e - w.s + 1
        const nws = Math.max(MINWIN, Math.min(n, Math.round(ws * (ev.deltaY > 0 ? 1.3 : 0.77))))
        const c = (w.s + w.e) / 2
        return clampWin(Math.round(c - nws / 2), Math.round(c - nws / 2) + nws - 1)
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])
  // 자연스러운 스크롤바(트랙+썸) — 클릭·드래그로 이동
  const barRef = useRef<HTMLDivElement>(null)
  const barDrag = useRef(false)
  const fromBar = (clientX: number) => setWin((w) => {
    if (!barRef.current) return w
    const r = barRef.current.getBoundingClientRect(); const ws = w.e - w.s + 1
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const s = Math.round(frac * (n - 1) - ws / 2); return clampWin(s, s + ws - 1)
  })
  const onBarDown = (e: RPointerEvent) => { barDrag.current = true; fromBar(e.clientX); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* */ } }
  const onBarMove = (e: RPointerEvent) => { if (barDrag.current) fromBar(e.clientX) }
  const onBarUp = () => { barDrag.current = false }
  const view = built.data.slice(win.s, win.e + 1) // 표시 구간만 렌더(Brush 불필요)
  const rangeLabel = built.data[win.s] && built.data[win.e] ? `${built.data[win.s].full || built.data[win.s].label} ~ ${built.data[win.e].full || built.data[win.e].label}` : ''

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">📈 {scope} 발생 추이 — {diseaseLabel}</h3>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-400 xl:inline">{built.note} · 누적 {nf(totalActual)}건{peak.label ? ` · 최다 ${peak.label}` : ''}</span>
          {rangeLabel && <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">📅 {rangeLabel}</span>}
          <button onClick={toLatest} title="가장 최근 기간으로" className="rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600 transition active:scale-95 dark:bg-blue-950/40 dark:text-blue-300">현재</button>
          <span className="text-[10px] font-semibold text-slate-400">점 간격</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {INTERVALS.map((g) => (<button key={g.k} onClick={() => setIv(g.k)} title="점 간격(집계 단위) 선택 — 보이는 기간은 드래그·휠·스크롤바" className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${iv === g.k ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}>{g.t}</button>))}
          </div>
        </div>
      </div>
      {hasData ? (
        <>
        <div ref={wrapRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
          className={showPan ? 'cursor-grab touch-pan-y select-none active:cursor-grabbing' : ''}>
        <ResponsiveContainer width="100%" height={228}>
          <LineChart data={view} margin={{ top: 8, right: 18, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={built.minGap} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <RTooltip content={(props) => renderTip(props as unknown as { active?: boolean; payload?: { payload?: TPt }[] })} />
            {built.predicted && <Line type="monotone" dataKey="pred" stroke="#f43f5e" strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.65} dot={false} connectNulls name="pred" isAnimationActive={false} />}
            <Line type="monotone" dataKey="actual" stroke="#2563eb" strokeWidth={2.4} dot={tg === 'year' || tg === 'quarter' || tg === 'half' ? { r: 3 } : false} activeDot={{ r: 5 }} connectNulls name="actual" />
            {built.sel ? <ReferenceLine x={`${built.sel}주`} stroke="#2563eb" strokeOpacity={0.5} strokeWidth={1.5} label={{ value: `${built.sel}주`, fontSize: 10, fill: '#2563eb', position: 'top' }} /> : null}
          </LineChart>
        </ResponsiveContainer>
        </div>
        {/* 자연스러운 스크롤바 — 전체기간 중 표시 위치/폭. 클릭·드래그로 이동 */}
        {showPan && n > baseWin && (
          <div className="mt-1.5 px-1">
            <div ref={barRef} onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerLeave={onBarUp}
              className="relative h-2.5 cursor-pointer touch-none rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="absolute top-0 h-2.5 rounded-full bg-blue-400/80 transition-[left,width] duration-75 dark:bg-blue-600/80"
                style={{ left: `${(win.s / Math.max(1, n)) * 100}%`, width: `${Math.max(6, ((win.e - win.s + 1) / Math.max(1, n)) * 100)}%` }} />
            </div>
          </div>
        )}
        </>
      ) : <p className="py-8 text-center text-sm text-slate-400">{diseaseLabel}의 {cur}년 데이터가 없습니다.</p>}

      <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-slate-400">
        {built.predicted ? <><b className="text-rose-500">─ ─ 점선 = 예측치</b>(과거 같은 시기 패턴 추정값, 실제와 다를 수 있어요). </> : null}
        실선=실제 발생수. <b className="text-slate-500 dark:text-slate-300">점 간격 칩</b>으로 일·주·월·분기·반기·년 집계 전환, <b className="text-slate-500 dark:text-slate-300">끌거나 휠·아래 막대</b>로 보이는 기간 이동·확대.{disease === ALL ? <> 점에 <b className="text-blue-500">마우스를 올리면</b> 그 시점 상위 감염병 Top5가 떠요.</> : null} 출처: 질병관리청 감염병포털.
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
    <Panel title={`성별·연령 분포 — ${diseaseLabel} · 전국 (연간 ${year})`}>
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

function DonutPanel({ title, data, colors, note, year, tip }: { title: string; data: { name: string; value: number }[]; colors: string[]; note: string; year: string; tip?: keyof typeof GLOSSARY }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <Panel title={<>{title} (연간 {year}){tip && <InfoTip term={tip} />}</>}>
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

// ════════ 고급 분석 ════════
const GRADE_W: Record<string, number> = { '1급': 1, '2급': 0.7, '3급': 0.5, '4급': 0.3 }
function topDzByCount(year: string, n: number): string[] {
  return EID_DISEASES.map((d) => ({ d, c: annualVal('count', d, year, '00') })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c).slice(0, n).map((x) => x.d)
}
function kmeans(pts: number[][], k: number, iters = 14): number[] {
  const n = pts.length; if (n < k) return pts.map((_, i) => i % k)
  const dim = pts[0].length
  const cent = Array.from({ length: k }, (_, i) => pts[Math.round((i * (n - 1)) / (k - 1))].slice())
  const asg = new Array(n).fill(0)
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) { let b = 0, bd = Infinity; for (let c = 0; c < k; c++) { let s = 0; for (let j = 0; j < dim; j++) { const e = pts[i][j] - cent[c][j]; s += e * e } if (s < bd) { bd = s; b = c } } asg[i] = b }
    const sum = Array.from({ length: k }, () => new Array(dim).fill(0)); const cnt = new Array(k).fill(0)
    for (let i = 0; i < n; i++) { cnt[asg[i]]++; for (let j = 0; j < dim; j++) sum[asg[i]][j] += pts[i][j] }
    for (let c = 0; c < k; c++) if (cnt[c]) for (let j = 0; j < dim; j++) cent[c][j] = sum[c][j] / cnt[c]
  }
  return asg
}

function AdvancedAnalytics({ year, disease, diseaseLabel }: { year: string; disease: string; diseaseLabel: string }) {
  const cur = EID_CUR_YEAR
  const heat = useMemo(() => {
    const dz = topDzByCount(year, 8)
    const colMax = dz.map((d) => Math.max(...EID_SIDO.map((s) => EID_RATE[year]?.[d]?.[s.code] || 0), 0.0001))
    return { dz, colMax }
  }, [year])

  const risk = useMemo(() => {
    const g = eidGrowthSignal(0); const gmap = new Map(g.rows.map((r) => [r.name, r.growthPct]))
    const items = EID_DISEASES.map((d) => ({ name: cleanName(d), grp: EID_GROUP[d], cnt: annualVal('count', d, year, '00'), gr: gmap.get(cleanName(d)) ?? 0 })).filter((x) => x.cnt > 0)
    const maxC = Math.max(...items.map((x) => x.cnt), 1), maxG = Math.max(...items.map((x) => x.gr), 1)
    return items.map((x) => ({ ...x, score: Math.round((0.45 * (x.cnt / maxC) + 0.35 * Math.max(0, x.gr) / maxG + 0.2 * (GRADE_W[x.grp] || 0.3)) * 100) })).sort((a, b) => b.score - a.score).slice(0, 8)
  }, [year])

  const season = useMemo(() => {
    const { share, hasPrior } = seasonalShare(disease)
    const idx = share.map((s) => Math.round(s * 12 * 100))
    let peak = 0; idx.forEach((v, i) => { if (v > idx[peak]) peak = i })
    return { idx, peak, hasPrior, max: Math.max(...idx, 1) }
  }, [disease])

  const cluster = useMemo(() => {
    const dz = topDzByCount(year, 6); if (dz.length < 3) return null
    const colMax = dz.map((d) => Math.max(...EID_SIDO.map((s) => EID_RATE[year]?.[d]?.[s.code] || 0), 0.0001))
    const pts = EID_SIDO.map((s) => dz.map((d, j) => (EID_RATE[year]?.[d]?.[s.code] || 0) / colMax[j]))
    const asg = kmeans(pts, 3)
    return [0, 1, 2].map((c) => {
      const idxs = EID_SIDO.map((_, i) => i).filter((i) => asg[i] === c)
      let best = 0, bv = -1
      dz.forEach((_, j) => { const m = idxs.reduce((t, i) => t + pts[i][j], 0) / (idxs.length || 1); if (m > bv) { bv = m; best = j } })
      return { members: idxs.map((i) => EID_SIDO[i].name), feature: cleanName(dz[best]) }
    }).filter((c) => c.members.length)
  }, [year])

  // E. 인구밀도 × 발생률(확산위험) — 시도 면적(고정값)+인구추정으로 밀도 산출, 발생률과의 상관(참고).
  const density = useMemo(() => {
    const rows = EID_SIDO.map((s) => {
      const area = areaOf(s.name); const pop = sidoPop(s.code)
      const count = annualVal('count', disease, year, s.code)
      const rate = pop > 0 ? (count / pop) * 100000 : 0
      const dens = area > 0 ? pop / area : 0
      return { name: s.name, density: Math.round(dens), rate: Math.round(rate * 10) / 10 }
    }).filter((r) => r.density > 0 && r.rate > 0)
    // 피어슨 상관(밀도 vs 발생률)
    const n = rows.length
    let r = 0
    if (n >= 3) {
      const mx = rows.reduce((s, v) => s + v.density, 0) / n, my = rows.reduce((s, v) => s + v.rate, 0) / n
      let sxy = 0, sxx = 0, syy = 0
      for (const v of rows) { const dx = v.density - mx, dy = v.rate - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
      r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
    }
    return { rows, r: Math.round(r * 100) / 100, n }
  }, [year, disease])

  // F·G. 시간에 따른 확산 속도 — 시도별 주간 누적 발생률(기울기=초기 확산속도) + 도달시간 vs 밀도(전파력)
  const spread = useMemo(() => {
    const weeklyOk = disease === ALL || EID_WEEKLY_DISEASES.includes(disease)
    if (!weeklyOk) return null
    const sidos = EID_SIDO.map((s) => {
      const arr = weeklySidoArr(disease, s.code); const pop = sidoPop(s.code); const area = areaOf(s.name)
      const dens = area > 0 ? pop / area : 0
      let cum = 0; const cumRate = arr.map((c) => { cum += c; return pop > 0 ? (cum / pop) * 100000 : 0 })
      return { code: s.code, name: s.name, density: dens, cumRate, finalRate: cumRate[cumRate.length - 1] || 0 }
    }).filter((s) => s.density > 0 && s.finalRate > 0)
    if (sidos.length < 4) return null
    // 도달시간 임계값 = 시도별 최종 누적발생률의 중앙값(절반 정도가 도달 → 측정 가능)
    const fr = sidos.map((s) => s.finalRate).sort((a, b) => a - b)
    const thr = fr[Math.floor(fr.length / 2)] || 0
    const reach = sidos.map((s) => { let wk: number | null = null; for (let i = 0; i < s.cumRate.length; i++) if (s.cumRate[i] >= thr) { wk = i + 1; break } return { name: s.name, density: Math.round(s.density), weeks: wk } }).filter((s): s is { name: string; density: number; weeks: number } => s.weeks != null)
    // density↔도달시간 피어슨(음수=밀도 높을수록 빨리 도달)
    let r = 0
    if (reach.length >= 3) { const n = reach.length, mx = reach.reduce((a, b) => a + b.density, 0) / n, my = reach.reduce((a, b) => a + b.weeks, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (const v of reach) { const dx = v.density - mx, dy = v.weeks - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy } r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0 }
    // 선그래프: 고밀도 상위3 + 저밀도 하위3
    const byD = [...sidos].sort((a, b) => b.density - a.density)
    const pick = [...byD.slice(0, 3), ...byD.slice(-3)]
    const maxW = Math.max(...pick.map((s) => s.cumRate.length))
    const lineData = Array.from({ length: maxW }, (_, i) => { const row: Record<string, number> = { w: i + 1 }; pick.forEach((s) => { row[s.name] = Math.round((s.cumRate[i] ?? s.cumRate[s.cumRate.length - 1]) * 10) / 10 }); return row })
    return { pick, lineData, reach, thr: Math.round(thr * 10) / 10, r: Math.round(r * 100) / 100 }
  }, [disease])
  const SPREAD_COLORS = ['#dc2626', '#f97316', '#f59e0b', '#3b82f6', '#0ea5e9', '#6366f1'] // 고밀도(붉음)→저밀도(푸름)

  // 히트맵 호버 툴팁(인앱) — 빈 셀이라 native title이 안 떠서 직접 구현
  const heatRef = useRef<HTMLDivElement>(null)
  const [heatTip, setHeatTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const showHeat = (e: React.MouseEvent, text: string) => { const r = heatRef.current?.getBoundingClientRect(); if (r) setHeatTip({ x: e.clientX - r.left, y: e.clientY - r.top, text }) }

  return (
    <div className="mt-4">
      <h3 className="mb-2 px-1 text-sm font-bold text-slate-700 dark:text-slate-200">🔬 고급 분석</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* A. 발생률 히트맵 */}
        <Panel title={`발생률 히트맵 — 시도 × 주요 감염병 (연간 ${year}, 10만명당)`}>
          <div ref={heatRef} className="relative overflow-x-auto" onMouseLeave={() => setHeatTip(null)}>
            <table className="w-full border-collapse text-[10px]">
              <thead><tr><th className="p-1" /><th className="p-0.5 font-normal text-slate-300" />{EID_SIDO.map((s) => <th key={s.code} className="p-0.5 font-normal text-slate-400">{s.name}</th>)}</tr></thead>
              <tbody>
                {heat.dz.map((d, ri) => (
                  <tr key={d}>
                    <td className="whitespace-nowrap py-0.5 pr-2 text-right text-slate-600 dark:text-slate-300" colSpan={2}>{cleanName(d).length > 7 ? cleanName(d).slice(0, 7) : cleanName(d)}</td>
                    {EID_SIDO.map((s) => { const v = EID_RATE[year]?.[d]?.[s.code] || 0; const t = v / heat.colMax[ri]; const txt = `${s.name} · ${cleanName(d)} · ${v.toFixed(1)}/10만명` ; return <td key={s.code} onMouseEnter={(e) => showHeat(e, txt)} onMouseMove={(e) => showHeat(e, txt)} style={{ background: v ? rampColor(Math.sqrt(t)) : undefined }} className="h-5 cursor-crosshair border border-white/60 dark:border-slate-800/60" /> })}
                  </tr>
                ))}
              </tbody>
            </table>
            {heatTip && (
              <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-slate-900/95 px-2 py-1 text-[10px] font-medium text-white shadow-lg" style={{ left: heatTip.x, top: heatTip.y - 6 }}>{heatTip.text}</div>
            )}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-slate-400">행(질병)별 정규화 — 색이 진할수록 그 감염병이 해당 시도에서 상대적으로 높음. 칸 위에 마우스를 올리면 수치.</p>
        </Panel>

        {/* B. 위험도 종합지수 */}
        <Panel title={`위험도 종합지수 (연간 ${year})`}>
          <div className="space-y-1.5">
            {risk.map((r, i) => (
              <div key={r.name} className="flex items-center gap-2">
                <span className="w-4 text-xs font-bold text-slate-400">{i + 1}</span>
                <span className="w-7 shrink-0 rounded px-1 text-center text-[10px] font-semibold text-white" style={{ background: GRP_COLOR[r.grp] || '#94a3b8' }}>{r.grp}</span>
                <span className="w-24 shrink-0 truncate text-xs text-slate-700 dark:text-slate-200">{r.name}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-600" style={{ width: `${r.score}%` }} /></span>
                <span className="w-7 text-right text-xs font-bold tabular-nums text-rose-600">{r.score}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-slate-400">발생수(0.45)+최근 증가율(0.35)+심각도(급, 0.20) 가중 합성. 방역 우선순위 참고.</p>
        </Panel>

        {/* C. 계절성 패턴 */}
        <Panel title={`계절성 패턴 — ${diseaseLabel}`}>
          {season.hasPrior ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={season.idx.map((v, m) => ({ m: `${m + 1}`, v, peak: m === season.peak }))} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <RTooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} formatter={(v) => [`${v} (평균월=100)`, '계절지수']} labelFormatter={(m) => `${m}월`} />
                  <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                    {season.idx.map((_, m) => <Cell key={m} fill={m === season.peak ? '#e11d48' : '#93c5fd'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1.5 px-1 text-[11px] text-slate-400">{diseaseLabel}은(는) 보통 <b className="text-rose-600">{season.peak + 1}월</b>경 가장 많아요. 과거 연도 평균 월별 패턴(평균월=100 지수).</p>
            </>
          ) : <p className="py-8 text-center text-sm text-slate-400">계절성 산출에 필요한 과거 연도 데이터가 부족합니다.</p>}
        </Panel>

        {/* D. 지역 클러스터링 */}
        <Panel title={`지역 클러스터링 — 감염병 프로파일 (연간 ${year})`}>
          {cluster ? (
            <div className="space-y-2">
              {cluster.map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">유형 {i + 1} <span className="font-normal text-slate-400">· 특징: {c.feature} 상대적 높음</span></div>
                  <div className="mt-1 flex flex-wrap gap-1">{c.members.map((m) => <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{m}</span>)}</div>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-sm text-slate-400">데이터 부족</p>}
          <p className="mt-1.5 px-1 text-[11px] text-slate-400">상위 6개 감염병의 시도별 발생률 프로파일을 k-means(k=3)로 군집화. 비슷한 감염병 양상의 지역끼리 묶임.</p>
        </Panel>

        {/* E. 인구밀도 × 확산 위험 */}
        <Panel title={<>인구밀도 × 발생률 — {diseaseLabel} (연간 {year})<InfoTip label="인구밀도 × 발생률" >시도별 인구밀도(인구/면적)와 인구 10만 명당 발생률의 관계. 밀도가 높을수록 접촉이 잦아 전파가 빠를 수 있다는 가설을 데이터로 살펴봅니다. 상관(association)이며 인과(causation)는 아닙니다.</InfoTip></>}>
          {density.rows.length >= 3 ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <ScatterChart margin={{ top: 8, right: 14, left: 0, bottom: 14 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" dataKey="density" name="인구밀도" unit="" tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={(v) => nf(Number(v))} axisLine={false} tickLine={false}
                    label={{ value: '인구밀도(명/㎢)', position: 'insideBottom', offset: -6, fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis type="number" dataKey="rate" name="발생률" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                    label={{ value: '10만명당', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                  <ZAxis range={[60, 60]} />
                  <RTooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => [n === '인구밀도' ? `${nf(Number(v))} 명/㎢` : `${v} 명/10만`, String(n)]}
                    labelFormatter={() => ''} content={({ payload }) => { const p = payload && payload[0] && payload[0].payload as { name: string; density: number; rate: number }; return p ? <div className="rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-xs text-white shadow-lg"><b>{p.name}</b><br />밀도 {nf(p.density)}명/㎢<br />발생률 {p.rate}/10만</div> : null }} />
                  <Scatter data={density.rows} fill="#6366f1">
                    {density.rows.map((r) => <Cell key={r.name} fill={rampColor(Math.sqrt(r.rate / (density.rows.reduce((m, v) => Math.max(m, v.rate), 1))))} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-slate-400">
                밀도↔발생률 상관계수 <b className={density.r >= 0.3 ? 'text-rose-600' : density.r <= -0.3 ? 'text-blue-600' : 'text-slate-500'}>r = {density.r.toFixed(2)}</b>
                {density.r >= 0.3 ? ' — 밀도 높은 지역일수록 발생률이 높은 경향(양의 상관).' : density.r <= -0.3 ? ' — 밀도와 발생률이 반대 경향.' : ' — 뚜렷한 선형 관계는 약함.'}
                {' '}⚠ <b>상관</b>이지 인과가 아니며, 면적은 행정구역 근사·인구는 통계 추정값입니다.
              </p>
            </>
          ) : <p className="py-8 text-center text-sm text-slate-400">이 감염병·연도는 밀도-발생률 산출 데이터가 부족합니다.</p>}
        </Panel>

        {/* F. 시간에 따른 확산 속도(누적 발생률 기울기) — 고밀도 vs 저밀도 */}
        <Panel title={<>확산 속도 — 시도별 누적 발생률 추이 ({cur}년 주별)<InfoTip label="확산 속도(기울기)">시도별 주간 누적 발생률(10만명당). 초기 기울기가 가파를수록 확산이 빠릅니다. 인구밀도 상위 3개(붉은 계열)와 하위 3개(푸른 계열)를 비교해 "밀도 높은 곳이 더 빨리 퍼지는지"를 봅니다.</InfoTip></>}>
          {spread ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={spread.lineData} margin={{ top: 8, right: 14, left: -4, bottom: 14 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="w" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} label={{ value: '주차', position: 'insideBottom', offset: -6, fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} label={{ value: '누적/10만', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                  <RTooltip formatter={(v, n) => [`${v}/10만`, String(n)]} labelFormatter={(w) => `${w}주차`} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  {spread.pick.map((s, i) => <Line key={s.name} type="monotone" dataKey={s.name} stroke={SPREAD_COLORS[i] || '#94a3b8'} strokeWidth={2} dot={false} connectNulls />)}
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 px-1">
                {spread.pick.map((s, i) => <span key={s.name} className="flex items-center gap-1 text-[10px] text-slate-500"><span className="inline-block h-2 w-2.5 rounded-sm" style={{ background: SPREAD_COLORS[i] }} />{s.name}<span className="text-slate-400">({nf(s.density)}/㎢)</span></span>)}
              </div>
              <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-slate-400">붉은 계열=고밀도, 푸른 계열=저밀도. 초기 기울기가 가파를수록 확산이 빠름. 누적 발생률(10만명당)·{cur}년 주별. ⚠ 신고지연으로 최근 주는 잠정.</p>
            </>
          ) : <p className="py-8 text-center text-sm text-slate-400">이 감염병은 시도별 주간 데이터가 없어 확산속도 분석이 어렵습니다(상단에서 전체 또는 주별 수집 감염병 선택).</p>}
        </Panel>

        {/* G. 확산 도달시간 × 인구밀도 */}
        <Panel title={<>확산 도달시간 × 인구밀도 ({cur}년)<InfoTip label="도달시간 × 밀도">특정 누적 발생률(중앙값)에 도달하기까지 걸린 '주수'와 인구밀도의 관계. 밀도가 높을수록 도달이 빠르면(음의 상관) 밀집이 전파를 가속한다는 근거가 됩니다.</InfoTip></>}>
          {spread && spread.reach.length >= 3 ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <ScatterChart margin={{ top: 8, right: 14, left: 0, bottom: 14 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" dataKey="density" name="인구밀도" tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={(v) => nf(Number(v))} axisLine={false} tickLine={false} label={{ value: '인구밀도(명/㎢)', position: 'insideBottom', offset: -6, fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis type="number" dataKey="weeks" name="도달주수" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} label={{ value: '도달 주수', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                  <ZAxis range={[55, 55]} />
                  <RTooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => { const p = payload && payload[0] && payload[0].payload as { name: string; density: number; weeks: number }; return p ? <div className="rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-xs text-white shadow-lg"><b>{p.name}</b><br />밀도 {nf(p.density)}명/㎢<br />{spread.thr}/10만 도달 {p.weeks}주</div> : null }} />
                  <Scatter data={spread.reach} fill="#6366f1" />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-slate-400">
                기준 누적발생률 <b>{spread.thr}/10만</b> 도달까지 걸린 주수. 밀도↔도달시간 <b className={spread.r <= -0.3 ? 'text-rose-600' : spread.r >= 0.3 ? 'text-blue-600' : 'text-slate-500'}>r = {spread.r.toFixed(2)}</b>
                {spread.r <= -0.3 ? ' — 밀도 높을수록 더 빨리 도달(전파 빠름).' : spread.r >= 0.3 ? ' — 의외로 밀도 낮을수록 빨리 도달.' : ' — 뚜렷한 관계는 약함.'}
                {' '}⚠ 상관·근사(면적 행정구역값) 참고.
              </p>
            </>
          ) : <p className="py-8 text-center text-sm text-slate-400">도달시간 산출 데이터가 부족합니다.</p>}
        </Panel>
      </div>
    </div>
  )
}
