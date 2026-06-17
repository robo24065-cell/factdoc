// 감염병 사망현황 패널 — 통계청 KOSIS 사망원인통계(연도별 사망자수·사망률). 질병청 '발생수'와 출처 분리.
import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import Panel from './Panel'
import { DEATH_BY_DISEASE, DEATH_YEARS, DEATH_LATEST_YEAR } from '../data/death-eid'

const nf = (n: number) => n.toLocaleString()
// 합계/전체 행은 추세 기본선택에서 제외(개별 질병이 더 의미). 순위에선 전체 제외.
const RANK = DEATH_BY_DISEASE.filter((r) => r.code !== '1' && r.code !== '104' && r.code !== '105')

export default function DeathTrendPanel() {
  const [sel, setSel] = useState(RANK[0]?.code ?? DEATH_BY_DISEASE[0]?.code ?? '')
  const row = DEATH_BY_DISEASE.find((r) => r.code === sel) ?? RANK[0]
  const data = row ? DEATH_YEARS.map((y) => ({ y, deaths: row.years[y]?.deaths ?? null })).filter((d) => d.deaths != null) : []
  const latest = DEATH_LATEST_YEAR
  const maxDeaths = Math.max(...RANK.map((r) => r.years[latest]?.deaths ?? 0)) || 1

  return (
    <Panel title="🕯 감염병 사망현황" desc={`통계청 KOSIS 사망원인통계 · 주요 감염성 사인 연도별 사망자(${DEATH_YEARS[0]}~${latest})`} badge="실데이터" span="lg:col-span-2">
      <p className="mb-3 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50">
        ℹ️ 사망자수는 <b>통계청 KOSIS</b>(질병청 감염병포털 ‘발생수’와 출처·집계기준이 달라 별도 표기). 발생수÷사망의 치명률 직접 산출은 지양합니다(출처 충실).
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {/* 최신연도 사망 순위 */}
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">{latest}년 사망자 순위 (클릭 → 추세)</p>
          <div className="space-y-1.5">
            {RANK.slice(0, 8).map((r) => {
              const d = r.years[latest]?.deaths ?? 0
              return (
                <button key={r.code} type="button" onClick={() => setSel(r.code)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${sel === r.code ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                  <span className="w-24 shrink-0 truncate text-[13px] text-slate-700 dark:text-slate-200" title={r.name}>{r.name}</span>
                  <span className="h-2.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                    <span className="block h-2.5 rounded-full bg-rose-500" style={{ width: `${Math.max(2, (d / maxDeaths) * 100)}%` }} />
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{nf(d)}</span>
                </button>
              )
            })}
          </div>
        </div>
        {/* 선택 질병 연도별 추세 */}
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">{row?.name} 연도별 사망자 추세</p>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                <XAxis dataKey="y" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={44} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v) => [`${nf(Number(v))}명`, '사망자']} labelFormatter={(l) => `${l}년`} />
                <Line type="monotone" dataKey="deaths" stroke="#f43f5e" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {row && data.length ? `${data[0].y}년 ${nf(data[0].deaths!)}명 → ${latest}년 ${nf(row.years[latest]?.deaths ?? 0)}명 · 사망률 ${row.years[latest]?.rate ?? '—'}/10만명` : ''}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">출처: 통계청 KOSIS 사망원인통계(DT_1B34E01) · 연 1회 공표 · GitHub Actions 월1회 자동 갱신 · 참고용(의료 진단 아님)</p>
    </Panel>
  )
}
