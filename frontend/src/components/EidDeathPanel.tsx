// 법정감염병 사망 패널 — 질병청 /death(EID와 동일 분류). 지도에서 고른 감염병의 사망이 그대로 연동.
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { EID_DEATH, EID_DEATH_YEARS, EID_DEATH_LATEST } from '../data/death-eid-legal'

const nf = (n: number) => n.toLocaleString()
const norm = (s: string) => s.replace(/^@/, '').replace(/\s*·\s*\d급$/, '').trim()

export default function EidDeathPanel({ diseaseLabel, isAll }: { diseaseLabel: string; isAll: boolean }) {
  if (!EID_DEATH.length) return null
  const latest = EID_DEATH_LATEST
  // 전체: 최신연도 사망 상위 랭킹. 특정 질병: 그 질병 연도별 추세.
  const target = isAll ? null : EID_DEATH.find((r) => norm(r.name) === norm(diseaseLabel))
  const ranked = EID_DEATH.filter((r) => (r.years[latest] ?? 0) > 0).slice(0, 10)
  const maxRank = Math.max(...ranked.map((r) => r.years[latest] ?? 0), 1)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-3 2xl:col-span-1 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-white">🕯 감염병 사망 {isAll ? '현황' : `— ${norm(diseaseLabel)}`}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">질병관리청 전수신고 /death · 법정감염병 종류별 · {EID_DEATH_YEARS[0]}~{latest}</p>
        </div>
        <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">질병청 사망</span>
      </div>

      {isAll ? (
        <div className="mt-2 space-y-1">
          <p className="mb-1 text-[12px] text-slate-500">{latest}년 사망자 상위 법정감염병</p>
          {ranked.map((r, i) => (
            <div key={r.name} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-right text-[11px] text-slate-400">{i + 1}</span>
              <span className="flex-1 truncate text-[12px] text-slate-700 dark:text-slate-200" title={r.name}>{norm(r.name)}</span>
              <span className="h-3 w-20 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-3 rounded-full bg-rose-500/80" style={{ width: `${Math.max(4, ((r.years[latest] ?? 0) / maxRank) * 100)}%` }} /></span>
              <span className="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-200">{nf(r.years[latest] ?? 0)}명</span>
            </div>
          ))}
        </div>
      ) : target ? (() => {
        const data = EID_DEATH_YEARS.map((y) => ({ y, deaths: target.years[y] ?? 0 }))
        const cur = target.years[latest] ?? 0
        const total = data.reduce((s, d) => s + d.deaths, 0)
        if (total === 0) return <p className="mt-3 text-[13px] text-slate-500">최근 {EID_DEATH_YEARS[0]}~{latest}년 <b>{norm(diseaseLabel)}</b> 사망 보고는 0명입니다(전수신고 기준).</p>
        return (
          <div className="mt-2">
            <p className="text-[13px] text-slate-700 dark:text-slate-200">{latest}년 사망 <b className="text-rose-600">{nf(cur)}명</b> <span className="text-[11px] text-slate-400">· {target.grp}</span></p>
            <div style={{ height: 150 }} className="mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                  <XAxis dataKey="y" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={32} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v) => [`${nf(Number(v))}명`, '사망']} labelFormatter={(l) => `${l}년`} />
                  <Line type="monotone" dataKey="deaths" stroke="#f43f5e" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })() : (
        <p className="mt-3 text-[13px] text-slate-500"><b>{norm(diseaseLabel)}</b>은 전수신고 사망 집계에 없거나 사망 0명입니다.</p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        출처: 질병관리청 전수신고 감염병 발생현황(/death). 위 지도의 발생수와 같은 질병 분류 — 선택한 감염병의 사망이 함께 연동됩니다. 참고용(의료 진단 아님).
      </p>
    </div>
  )
}
