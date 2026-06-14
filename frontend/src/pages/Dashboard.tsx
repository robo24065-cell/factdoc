import { useEffect, useState, type ReactNode } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
  assetCounts, evalReport, f1Avg, verdictDist, weeklyMisinfo,
  diabetesPrevalence, outbreakTrend, topMisinfo, outbreakList,
} from './dashboardData'
import { fetchDbStats, type DbStats } from '../lib/db'
import type { Verdict } from '../engine'

const axis = { fontSize: 12, fill: '#94a3b8' }
const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }

export default function Dashboard() {
  const [db, setDb] = useState<DbStats | null>(null)
  useEffect(() => { fetchDbStats().then(setDb) }, [])

  const useDbDist = !!db && db.queries > 0
  const distData = useDbDist ? verdictDist.map((d) => ({ ...d, value: db!.verdictDist[d.key as Verdict] })) : verdictDist
  const distTotal = distData.reduce((s, d) => s + d.value, 0)
  const triples = db?.triples ?? assetCounts.triples
  const terms = db?.terms ?? assetCounts.terms

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-medium text-slate-900 dark:text-white">대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">국가 공식데이터 기반 건강정보 검증 현황 · 반응형(PC 3열·태블릿 2열·모바일 1열)</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs ${db ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
            {db ? '● DB 연결됨' : '○ 로컬 모드'}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800">일부 패널은 데모 데이터</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="누적 검증" value={db ? db.queries.toLocaleString() : '1,284'} hint={db ? '실시간(query_log)' : '이번 주 +312'} accent="text-indigo-600" demo={!db} />
        <Kpi label="판정 정확도" value={`${(evalReport.accuracy * 100).toFixed(0)}%`} hint={`시드 ${evalReport.correct}/${evalReport.total}`} accent="text-emerald-600" />
        <Kpi label="인용 정확도" value={`${(evalReport.citationCoverage * 100).toFixed(0)}%`} hint="출처 보유율" accent="text-emerald-600" />
        <Kpi label="근거 트리플" value={`${triples}`} hint={db ? '실시간(claim_triple)' : '시드'} accent="text-blue-600" demo={!db} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
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

        <Panel title="주간 가짜정보 추세" desc="질문 로그에서 검출된 의심 주장 (트렌드 레이더)" badge="데모" span="lg:col-span-2">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyMisinfo} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
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
            <Metric label="판정 정확도" value={evalReport.accuracy} />
            <Metric label="인용 정확도" value={evalReport.citationCoverage} />
            <Metric label="평균 F1" value={f1Avg} />
            <p className="pt-1 text-xs text-slate-400">진실판단은 룰·그래프 · LLM 아님</p>
          </div>
        </Panel>

        <Panel title="연령대별 당뇨 유병률" desc="질병청 KNHANES 통계 (제2형당뇨, %)" badge="데모">
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

        <Panel title="🚨 실시간 유행 감염병" desc="감염병포털 — 클릭 시 가짜뉴스 팩트체크 + 공식 수칙" badge="데모">
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={outbreakTrend} margin={{ top: 4, right: 6, left: -28, bottom: 0 }}>
                <XAxis dataKey="week" tick={axis} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="인플루엔자" stroke="#f43f5e" strokeWidth={2} fill="#f43f5e" fillOpacity={0.12} />
                <Area type="monotone" dataKey="코로나19" stroke="#6366f1" strokeWidth={2} fill="#6366f1" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {outbreakList.map((o) => (
              <li key={o.name} className="flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-200">{o.name}</span>
                <span className={`text-xs font-medium ${o.color}`}>{o.level} · {o.trend}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="클레임그래프 자산" desc="손이 많이 가 못 베끼는 모트 — 정량 지표" badge="실데이터" span="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Asset n={triples} label="근거 트리플" />
            <Asset n={terms} label="온톨로지 용어" />
            <Asset n={assetCounts.synonyms} label="동의어 매핑" />
            <Asset n={assetCounts.diseases} label="질환" />
            <Asset n={assetCounts.rules} label="판정 룰" />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {db ? 'Supabase claim_triple·ontology_term 라이브 집계' : '파이프라인 1회 실행마다 누적(자동·미검증 → 검증완료 승격)'}
          </p>
        </Panel>

        <Panel title="주간 가짜정보 TOP 5" desc="확산 중인 의심 주장" badge="데모">
          <ol className="space-y-2 text-sm">
            {topMisinfo.map((t) => (
              <li key={t.rank} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t.rank}</span>
                <span className="text-slate-700 dark:text-slate-200">{t.claim}</span>
                <span className="ml-auto text-xs text-slate-400">{t.delta}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  )
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
