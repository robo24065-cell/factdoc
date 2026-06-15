// 감염병 발생 현황판 — 질병관리청 전수신고 감염병 발생현황(시도별·질병별·연도별).
// 선거개표식 시도 choropleth + 질병 선택 + 연도 슬라이더(재생) + 호버 툴팁 + 분석 차트.
// 데이터: 배치 정적 캐시(eid-region.ts), 지도: 시도 경계 path(kr-geo.ts). per-request 외부호출 없음(§13.7).
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, LabelList,
} from 'recharts'
import { EID_YEARS, EID_SIDO, EID_DISEASES, EID_GROUP, EID_DATA } from '../data/eid-region'
import { KR_GEO, KR_VIEWBOX } from '../data/kr-geo'

const ALL = '__ALL__'
const cleanName = (d: string) => d.replace(/^@/, '')
const nf = (n: number) => n.toLocaleString('ko-KR')
// 은/는 조사(마지막 한글 음절 받침 기준; 비한글 종결은 '는')
function eunNeun(word: string): string {
  const m = word.replace(/[)\]\s]+$/, '')
  const c = m.charCodeAt(m.length - 1)
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0 ? '은' : '는'
  return '는'
}
const SIDO_NAME: Record<string, string> = Object.fromEntries(EID_SIDO.map((s) => [s.code, s.name]))

// 발생수 조회 ('00'=전국). disease=ALL 이면 전 질병 합산.
function valueFor(disease: string, year: string, sido: string): number {
  const yd = EID_DATA[year]
  if (!yd) return 0
  if (disease === ALL) {
    let s = 0
    for (const d of EID_DISEASES) s += yd[d]?.[sido] ?? 0
    return s
  }
  return yd[disease]?.[sido] ?? 0
}

// 색상 램프(발생강도): 회색→앰버→오렌지→레드. sqrt 스케일로 분포 펼침.
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

const CHIPS = [ALL, '말라리아', 'E형간염', '레지오넬라증', '신증후군출혈열', '뎅기열', '중증열성혈소판감소증후군(SFTS)']

// 수도권 등 작은 시도 라벨 겹침 보정(dx, dy)
const LABEL_OFFSET: Record<string, [number, number]> = {
  '08': [26, 34], // 경기 — 서울 피해 남동쪽으로
  '04': [-16, 4], // 인천 — 서해 쪽으로
  '17': [-2, -7], // 세종 — 위로
  '06': [10, 6], // 대전 — 우하
  '07': [13, 2], // 울산 — 동해 쪽
}

export default function InfectiousMap() {
  const [disease, setDisease] = useState<string>(ALL)
  const [yearIdx, setYearIdx] = useState(EID_YEARS.length - 1)
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; code: string } | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const year = EID_YEARS[yearIdx]
  const diseaseLabel = disease === ALL ? '전체 감염병' : cleanName(disease)

  // 연도 자동재생
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setYearIdx((i) => (i + 1) % EID_YEARS.length), 1100)
    return () => clearInterval(id)
  }, [playing])

  // 시도별 값 + 최대값(전국 제외)
  const { perSido, maxV, nationTotal } = useMemo(() => {
    const per: Record<string, number> = {}
    let mx = 0
    for (const s of EID_SIDO) { const v = valueFor(disease, year, s.code); per[s.code] = v; if (v > mx) mx = v }
    return { perSido: per, maxV: mx || 1, nationTotal: valueFor(disease, year, '00') }
  }, [disease, year])

  // 시도 순위(내림차순)
  const ranking = useMemo(
    () => EID_SIDO.map((s) => ({ code: s.code, name: s.name, value: perSido[s.code] || 0 }))
      .sort((a, b) => b.value - a.value),
    [perSido],
  )
  const topSido = ranking[0]

  // 연도별 전국 추이(+ 선택 시도 오버레이)
  const trend = useMemo(() => EID_YEARS.map((y) => {
    const row: Record<string, number | string> = { year: y, 전국: valueFor(disease, y, '00') }
    if (selected) row[SIDO_NAME[selected]] = valueFor(disease, y, selected)
    return row
  }), [disease, selected])
  const prevTotal = yearIdx > 0 ? valueFor(disease, EID_YEARS[yearIdx - 1], '00') : null
  const yoy = prevTotal && prevTotal > 0 ? Math.round(((nationTotal - prevTotal) / prevTotal) * 100) : null

  // 자동 분석 인사이트(결정론 — 지역 집중도·증감 한 줄 요약)
  const insight = useMemo(() => {
    if (nationTotal <= 0) return `${year}년 ${diseaseLabel}의 전수신고 발생 기록이 없습니다.`
    const top3 = ranking.slice(0, 3).filter((r) => r.value > 0)
    const top3Share = Math.round((top3.reduce((s, r) => s + r.value, 0) / nationTotal) * 100)
    const lead = topSido ? `${topSido.name}(${nf(topSido.value)}건, 전국의 ${Math.round((topSido.value / nationTotal) * 100)}%)` : ''
    const conc = top3Share >= 60 ? '특정 지역에 집중' : top3Share >= 40 ? '일부 지역에 편중' : '전국에 비교적 고르게 분포'
    const yoyTxt = yoy === null ? '' : yoy > 0 ? ` 전년 대비 ${yoy}% 증가했습니다.` : yoy < 0 ? ` 전년 대비 ${Math.abs(yoy)}% 감소했습니다.` : ' 전년과 비슷한 수준입니다.'
    return `${year}년 ${diseaseLabel}${eunNeun(diseaseLabel)} 전국 ${nf(nationTotal)}건 발생했고, ${lead}에서 가장 많았습니다. 상위 3개 시·도(${top3.map((t) => t.name).join('·')})가 전체의 ${top3Share}%로 ${conc}되어 있습니다.${yoyTxt}`
  }, [disease, year, nationTotal, ranking, topSido, yoy])

  // 선택 시도의 질병 구성(드릴다운)
  const sidoBreakdown = useMemo(() => {
    if (!selected) return []
    return EID_DISEASES.map((d) => ({ name: cleanName(d), value: valueFor(d, year, selected) }))
      .filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [selected, year])

  function onEnter(code: string, e: React.MouseEvent) {
    setHover(code)
    const r = mapRef.current?.getBoundingClientRect()
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, code })
  }

  return (
    <div className="lg:w-screen lg:max-w-none lg:relative lg:left-1/2 lg:right-1/2 lg:-ml-[50vw] lg:-mr-[50vw] lg:px-6">
      <div className="mx-auto max-w-7xl">
        {/* 헤더 */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
              <span className="text-rose-500">🦠</span> 감염병 발생 현황판
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              질병관리청 <b>전수신고 감염병 발생현황</b> · 전국 17개 시·도 · {EID_YEARS[0]}–{EID_YEARS[EID_YEARS.length - 1]}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            출처: 질병관리청 감염병포털
          </span>
        </div>

        {/* 컨트롤: 질병 선택 + 연도 슬라이더 */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">감염병</label>
            <select
              value={disease}
              onChange={(e) => setDisease(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value={ALL}>전체 감염병 (합계)</option>
              {EID_DISEASES.map((d) => (
                <option key={d} value={d}>{cleanName(d)} · {EID_GROUP[d]}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => setDisease(c)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    disease === c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {c === ALL ? '전체' : cleanName(c).length > 7 ? 'SFTS' : cleanName(c)}
                </button>
              ))}
            </div>
            <span className="ml-auto hidden text-xs text-slate-400 sm:block">지도 아래 <b className="text-slate-500">기간 바</b>로 연도를 넘겨보세요 ▾</span>
          </div>
        </div>

        {/* 자동 분석 인사이트 */}
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-slate-200">
          <span className="mt-0.5 text-base">📊</span>
          <p><b className="text-blue-700 dark:text-blue-300">한눈에</b> · {insight}</p>
        </div>

        {/* 본문: 지도(좌) + 분석(우) */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* 지도 */}
          <div className="lg:col-span-7">
            <div ref={mapRef} className="relative rounded-2xl border border-slate-200 bg-gradient-to-b from-sky-50 to-white p-3 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900">
              <div className="mb-1 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{diseaseLabel} · {year}년 시·도 분포</h2>
                {selected && (
                  <button onClick={() => setSelected(null)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-200 dark:bg-slate-800">전국 보기 ✕</button>
                )}
              </div>
              <svg viewBox={KR_VIEWBOX} className="h-auto w-full" style={{ maxHeight: 560 }}>
                {KR_GEO.map((g) => {
                  const v = perSido[g.code] || 0
                  const t = Math.sqrt(v / maxV)
                  const isSel = selected === g.code
                  const isHov = hover === g.code
                  return (
                    <path
                      key={g.code} d={g.d} fill={v === 0 ? '#eef2f7' : rampColor(t)}
                      stroke={isSel ? '#0f172a' : isHov ? '#334155' : '#ffffff'}
                      strokeWidth={isSel ? 2.6 : isHov ? 1.8 : 0.8}
                      style={{ cursor: 'pointer', filter: isHov && !isSel ? 'brightness(1.08)' : undefined, transition: 'fill .35s' }}
                      onMouseMove={(e) => onEnter(g.code, e)}
                      onMouseLeave={() => { setHover(null); setTip(null) }}
                      onClick={() => setSelected((s) => (s === g.code ? null : g.code))}
                    />
                  )
                })}
                {/* 라벨 */}
                {KR_GEO.map((g) => {
                  const v = perSido[g.code] || 0
                  const [dx, dy] = LABEL_OFFSET[g.code] || [0, 0]
                  const lx = g.cx + dx, ly = g.cy + dy
                  return (
                    <g key={'l' + g.code} pointerEvents="none" style={{ paintOrder: 'stroke' }}>
                      {(dx || dy) ? <line x1={g.cx} y1={g.cy} x2={lx} y2={ly - 2} stroke="#94a3b8" strokeWidth={0.6} /> : null}
                      <text x={lx} y={ly - 4} textAnchor="middle" fontSize={13} fontWeight={600}
                        stroke="#fff" strokeWidth={3} fill="#1e293b">{g.name}</text>
                      <text x={lx} y={ly + 11} textAnchor="middle" fontSize={12} fontWeight={700}
                        stroke="#fff" strokeWidth={3} fill={v > maxV * 0.5 ? '#7f1d1d' : '#334155'}>{nf(v)}</text>
                    </g>
                  )
                })}
              </svg>

              {/* 범례 */}
              <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-500">
                <span>적음</span>
                <div className="h-2.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.3)}, ${rampColor(0.55)}, ${rampColor(0.8)}, ${rampColor(1)})` }} />
                <span>많음</span>
                <span className="ml-1 tabular-nums text-slate-400">최대 {nf(maxV)}건</span>
              </div>

              {/* 기간 바(타임라인) — 지도 아래 */}
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm text-white hover:bg-blue-700"
                    title={playing ? '일시정지' : '연도별 재생'}
                  >
                    {playing ? '❚❚' : '▶'}
                  </button>
                  <div className="flex-1">
                    <input
                      type="range" min={0} max={EID_YEARS.length - 1} step={1} value={yearIdx}
                      onChange={(e) => { setPlaying(false); setYearIdx(Number(e.target.value)) }}
                      className="w-full accent-blue-600"
                      aria-label="연도 선택"
                    />
                    <div className="mt-0.5 flex justify-between px-0.5">
                      {EID_YEARS.map((y, i) => (
                        <button key={y} onClick={() => { setPlaying(false); setYearIdx(i) }}
                          className={`text-xs font-semibold tabular-nums ${i === yearIdx ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>{y}</button>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-900 px-3 py-1 text-lg font-bold tabular-nums text-white dark:bg-white dark:text-slate-900">{year}</span>
                </div>
              </div>

              {/* 호버 툴팁 */}
              {tip && (
                <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900/95 px-3 py-2 text-xs text-white shadow-lg"
                  style={{ left: tip.x, top: tip.y - 8 }}>
                  <div className="font-bold">{SIDO_NAME[tip.code]}</div>
                  <div className="mt-0.5 text-slate-300">{diseaseLabel}</div>
                  <div className="mt-0.5 text-base font-bold tabular-nums text-amber-300">{nf(perSido[tip.code] || 0)}<span className="ml-0.5 text-xs font-normal text-slate-400">건</span></div>
                  <div className="text-[10px] text-slate-400">전국의 {nationTotal ? Math.round(((perSido[tip.code] || 0) / nationTotal) * 100) : 0}%</div>
                </div>
              )}
            </div>
          </div>

          {/* 분석 패널 */}
          <div className="space-y-4 lg:col-span-5">
            {/* KPI */}
            <div className="grid grid-cols-3 gap-2">
              <Kpi label="전국 발생수" value={nf(nationTotal)} unit="건" tone="slate" />
              <Kpi label="최다 발생지" value={topSido && topSido.value > 0 ? topSido.name : '—'} unit={topSido && topSido.value > 0 ? `${nf(topSido.value)}건` : '발생 없음'} tone="rose" />
              <Kpi label="전년 대비" value={yoy === null ? '—' : `${yoy > 0 ? '▲' : yoy < 0 ? '▼' : ''}${Math.abs(yoy)}%`} unit={year === EID_YEARS[0] ? '기준' : '증감'} tone={yoy === null ? 'slate' : yoy > 0 ? 'red' : 'blue'} />
            </div>

            {/* 시도 순위 */}
            <Panel title={`시·도 발생 순위 — ${diseaseLabel} (${year})`}>
              <ResponsiveContainer width="100%" height={Math.max(220, ranking.filter((r) => r.value > 0).length * 18 + 20)}>
                <BarChart data={ranking.filter((r) => r.value > 0)} layout="vertical" margin={{ top: 0, right: 34, left: 6, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={36} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <RTooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} formatter={(v) => [nf(Number(v)) + '건', diseaseLabel]} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} onClick={(d) => { const c = (d as unknown as { code?: string; payload?: { code?: string } }); const code = c.code ?? c.payload?.code; if (code) setSelected(code) }} cursor="pointer">
                    {ranking.filter((r) => r.value > 0).map((r) => (
                      <Cell key={r.code} fill={selected === r.code ? '#0f172a' : rampColor(Math.sqrt(r.value / maxV))} />
                    ))}
                    <LabelList dataKey="value" position="right" formatter={(v) => nf(Number(v))} style={{ fontSize: 10, fill: '#94a3b8' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            {/* 연도 추이 */}
            <Panel title={`연도별 추이 — ${diseaseLabel}${selected ? ` · ${SIDO_NAME[selected]} 비교` : ' (전국)'}`}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend} margin={{ top: 8, right: 14, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <RTooltip formatter={(v, n) => [nf(Number(v)) + '건', String(n)]} />
                  <Line type="monotone" dataKey="전국" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  {selected && <Line type="monotone" dataKey={SIDO_NAME[selected]} stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} />}
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            {/* 드릴다운: 선택 시도 질병 구성 */}
            {selected && (
              <Panel title={`${SIDO_NAME[selected]} 주요 감염병 (${year})`}>
                {sidoBreakdown.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">해당 연도 발생 데이터가 없습니다.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={sidoBreakdown.length * 26 + 16}>
                    <BarChart data={sidoBreakdown} layout="vertical" margin={{ top: 0, right: 36, left: 6, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <RTooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} formatter={(v) => [nf(Number(v)) + '건', SIDO_NAME[selected!]]} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#6366f1">
                        <LabelList dataKey="value" position="right" formatter={(v) => nf(Number(v))} style={{ fontSize: 10, fill: '#94a3b8' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Panel>
            )}
          </div>
        </div>

        {/* 안내/면책 */}
        <p className="mx-auto mt-5 max-w-3xl text-center text-[11px] leading-relaxed text-slate-400">
          본 현황판은 질병관리청 「전수신고 감염병 발생현황」 공공데이터를 시각화한 참고 정보입니다(공공누리 제4유형, 출처표시·변경 요약).
          전수신고 대상 법정감염병 기준이며, 인플루엔자·수두 등 표본감시 감염병은 포함되지 않습니다. 진단·의료적 판단을 대체하지 않습니다.
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
