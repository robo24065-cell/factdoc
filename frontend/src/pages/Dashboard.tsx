import { useEffect, useState, type ReactNode } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
  assetCounts, evalReport, f1Avg, verdictDist, weeklyMisinfo,
  diabetesPrevalence, topMisinfo,
} from './dashboardData'
import { fetchDbStats, fetchOutbreak, fetchTopMisinfo, fetchWeeklyMisinfo, type DbStats, type OutbreakRow, type TopClaim } from '../lib/db'
import { eidLatestOutbreak, eidGrowthSignal } from '../lib/eidStats'
import { Link } from 'react-router-dom'
import type { Verdict } from '../engine'

const axis = { fontSize: 12, fill: '#94a3b8' }
const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }

export default function Dashboard() {
  const [db, setDb] = useState<DbStats | null>(null)
  const [outbreak, setOutbreak] = useState<OutbreakRow[] | null>(null)
  const [top, setTop] = useState<TopClaim[] | null>(null)
  const [wmis, setWmis] = useState<{ day: string; count: number }[] | null>(null)
  useEffect(() => { fetchDbStats().then(setDb); fetchOutbreak().then(setOutbreak); fetchTopMisinfo().then(setTop); fetchWeeklyMisinfo().then(setWmis) }, [])

  const useDbDist = !!db && db.checks > 0
  const distData = useDbDist ? verdictDist.map((d) => ({ ...d, value: db!.verdictDist[d.key as Verdict] })) : verdictDist
  const distTotal = distData.reduce((s, d) => s + d.value, 0)
  const triples = db?.triples ?? assetCounts.triples

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-medium text-slate-900 dark:text-white">대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">국가 공식데이터 기반 건강정보 검증 현황 · 폼팩터별 레이아웃(데스크톱 3열 다패널 / 태블릿 2열 / 모바일 1열·핵심카드 우선)</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs ${db ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
            {db ? '● DB 연결됨' : '○ 로컬 모드'}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800">일부 패널은 데모 데이터</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="검증한 주장" value={db ? db.checks.toLocaleString() : '1,284'} hint={db ? '고유 주장(verdict_cache)' : '이번 주 +312'} accent="text-indigo-600" demo={!db} />
        <Kpi label="판정 정확도" value={`${(evalReport.byTier.verified.acc * 100).toFixed(0)}%`} hint={`검증코어 ${evalReport.byTier.verified.n}건 · 광역 ${(evalReport.accuracy * 100).toFixed(0)}%(복문=Gemini)`} accent="text-emerald-600" />
        <Kpi label="인용 정확도" value={`${(evalReport.citationCoverage * 100).toFixed(0)}%`} hint="출처 보유율" accent="text-emerald-600" />
        <Kpi label="근거 트리플" value={`${triples}`} hint={db ? '실시간(claim_triple)' : '시드'} accent="text-blue-600" demo={!db} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Panel title="판정 분포" desc={useDbDist ? '실제 검증 로그의 4단계 비율' : '시드 라벨 기준 비율'} badge="실데이터">
          <div className="relative h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={72} paddingAngle={2} stroke="none">
                  {distData.map((e) => <Cell key={e.key} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-medium text-slate-900 dark:text-white">{distTotal}</span>
              <span className="text-xs text-slate-400">건</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 text-xs">
            {distData.map((e) => (
              <div key={e.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
                <span className="text-slate-500">{e.name}</span>
                <span className="ml-auto font-medium text-slate-700 dark:text-slate-200">{e.value}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="주간 가짜정보 추세" desc={wmis ? '최근 7일 query_log 의심주장(허위·과장) 일별' : '질문 로그에서 검출된 의심 주장 (트렌드 레이더)'} badge={wmis ? '실데이터' : '데모'} span="lg:col-span-2 order-last md:order-none">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={wmis ?? weeklyMisinfo} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="AI 성능 검증" desc="시드 라벨셋 자동 채점 결과" badge="실데이터">
          <div className="space-y-3 pt-1">
            <Metric label="판정 정확도(검증코어)" value={evalReport.byTier.verified.acc} />
            <Metric label="인용 정확도" value={evalReport.citationCoverage} />
            <Metric label="평균 F1" value={f1Avg} />
            <p className="pt-1 text-xs text-slate-400">
              광역 듀얼라벨 {evalReport.byTier.dual.n}건(κ {evalReport.meta.kappa?.toFixed(2) ?? '—'}) {(evalReport.byTier.dual.acc * 100).toFixed(0)}% · 복문은 Gemini 파서 영역. 진실판단은 룰·그래프(LLM 아님).
            </p>
          </div>
        </Panel>

        <Panel title="연령대별 당뇨 유병률" desc="질병청 KNHANES 공식 통계 (제2형당뇨, %)" badge="실데이터">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={diabetesPrevalence} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="age" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#94a3b820' }} />
                <Bar dataKey="rate" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {(() => {
          const eid = eidLatestOutbreak()
          // EID 최신 주차(자동갱신)를 우선 — Supabase outbreak_trend는 보조 폴백(정적/구버전일 수 있음)
          const obRows = eid.rows.length
            ? eid.rows.map((o) => ({ name: o.name, count: o.count, trend: o.trend, pct: o.pct as number | null }))
            : (outbreak ?? []).map((o) => ({ name: o.disease, count: o.case_count ?? 0, trend: o.trend ?? 'flat', pct: null as number | null }))
          const max = Math.max(...obRows.map((x) => x.count), 1)
          const live = obRows.length > 0
          return (
            <Panel title="🚨 실시간 유행 감염병" desc={`질병청 감염병포털 · ${eid.year}년 ${eid.week}주차 최근4주`} badge={live ? '실데이터' : '데모'} span="order-first md:order-none">
              <ul className="space-y-2.5 text-sm">
                {obRows.slice(0, 8).map((r) => {
                  const t = trendInfo(r.trend)
                  return (
                    <li key={r.name}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-slate-700 dark:text-slate-200">{r.name}</span>
                        <span className={`shrink-0 text-xs font-medium ${t.color}`}>{t.arrow} {r.count.toLocaleString()}건{r.pct != null ? <span className="ml-1 font-normal text-slate-400">({r.pct > 0 ? '+' : ''}{r.pct}%)</span> : null}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-1.5 rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: t.bar }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
              <Link to="/map" className="mt-3 inline-block text-xs font-medium text-blue-600 dark:text-blue-400">감염병 현황판에서 지도·추이 보기 →</Link>
            </Panel>
          )
        })()}

        {(() => {
          const g = eidGrowthSignal()
          if (!g.rows.length) return null
          return (
            <Panel title="🔔 급증 주의 신호" desc={`최근 4주 vs 직전 4주 증가율 (${g.week}주차 기준) — 조기경보`} badge="실데이터">
              <ul className="space-y-2 text-sm">
                {g.rows.slice(0, 6).map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-700 dark:text-slate-200">{r.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-rose-600">▲{r.growthPct >= 999 ? '신규' : `${r.growthPct}%`} <span className="font-normal text-slate-400">({r.prior}→{r.recent}건)</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400">증가율 높은 순 · 방역 우선순위 참고(B2G)</p>
            </Panel>
          )
        })()}

        <Panel title="클레임그래프 자산" desc="손이 많이 가 못 베끼는 모트 — 정량 지표" badge="실데이터" span="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Asset n={assetCounts.triples} label="근거 트리플" />
            <Asset n={assetCounts.terms} label="온톨로지 용어" />
            <Asset n={assetCounts.synonyms} label="동의어 매핑" />
            <Asset n={assetCounts.diseases} label="질환" />
            <Asset n={assetCounts.rules} label="판정 룰" />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            엔진 클레임그래프·한국어 온톨로지·판정 룰(손이 많이 가 못 베끼는 코드 자산) {db ? `· 코퍼스 적재 트리플 ${triples}건` : ''}
          </p>
        </Panel>

        <Panel title="주간 가짜정보 TOP 5" desc="실제 빈출 허위·과장 주장" badge={top && top.length ? '실데이터' : '데모'}>
          <ol className="space-y-2 text-sm">
            {(top && top.length ? top.map((t) => ({ claim: t.claim, count: t.count })) : topMisinfo.map((t) => ({ claim: t.claim, count: 0 }))).map((t, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{i + 1}</span>
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{t.claim}</span>
                {t.count ? <span className="text-xs text-slate-400">{t.count}회</span> : null}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  )
}

function trendInfo(trend: string | null) {
  if (trend === 'up') return { arrow: '▲', color: 'text-rose-600', bar: '#f43f5e' }
  if (trend === 'down') return { arrow: '▼', color: 'text-blue-600', bar: '#3b82f6' }
  return { arrow: '—', color: 'text-slate-500', bar: '#94a3b8' }
}

function Panel({ title, desc, badge, span, children }: { title: string; desc: string; badge: '실데이터' | '데모'; span?: string; children: ReactNode }) {
  const tag = badge === '실데이터'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${span ?? ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${tag}`}>{badge}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Kpi({ label, value, hint, accent, demo }: { label: string; value: string; hint: string; accent: string; demo?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{label}</p>
        {demo && <span className="text-[10px] text-slate-300 dark:text-slate-600">데모</span>}
      </div>
      <p className={`mt-1 text-3xl font-medium ${accent}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium text-slate-700 dark:text-slate-200">{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  )
}

function Asset({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/50">
      <p className="text-2xl font-medium text-slate-900 dark:text-white">{n}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  )
}
