// 시도별 감염병 사망률 패널 — 통계청 KOSIS 사망원인통계(DT_1B34E11). 감염병지도 발생수(질병청)와 별개 지표.
// ⚠ 출처·집계기준·대상질병 다름 → 치명률(사망/발생) 직접산출 안 함. 사인셋은 KOSIS에 사망분류 있는 주요 감염사인 고정.
import { useMemo, useState } from 'react'
import { DEATH_REGION, DEATH_REGION_YEAR } from '../data/death-region'

const SHORT = (s: string) => s.replace(/특별자치도|특별자치시|특별시|광역시/, '').replace(/^(충청|전라|경상)(북|남)도$/, (_, a, b) => a[0] + b)
  .replace(/도$/, '').replace('경기', '경기').replace('강원', '강원')
// EID 지도 질병 → KOSIS 사인 매핑(겹치는 것만; 없으면 null → 안내).
function mapCause(label: string): string | null {
  if (/말라리아/.test(label)) return '말라리아'
  if (/간염/.test(label)) return '바이러스 간염'
  if (/결핵/.test(label)) return '결핵(호흡기)'
  if (/코로나|covid/i.test(label)) return '코로나19'
  if (/인플루엔자|독감/.test(label)) return '인플루엔자'
  if (/폐렴/.test(label)) return '폐렴'
  return null
}

export default function DeathRegionPanel({ diseaseLabel }: { diseaseLabel: string }) {
  const mapped = mapCause(diseaseLabel)
  const [cause, setCause] = useState(mapped ?? '폐렴')
  const [metric, setMetric] = useState<'rate' | 'count'>('rate')
  const row = DEATH_REGION.find((c) => c.name === cause) ?? DEATH_REGION[0]
  const ranked = useMemo(() => {
    if (!row) return []
    return Object.entries(row.sido).filter(([s]) => !/전국|계/.test(s))
      .map(([s, v]) => ({ sido: SHORT(s), v: metric === 'rate' ? v.rate : v.deaths }))
      .sort((a, b) => b.v - a.v)
  }, [row, metric])
  const max = Math.max(...ranked.map((r) => r.v), 1)
  const unit = metric === 'rate' ? '/10만' : '명'

  if (!DEATH_REGION.length) return null
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-3 2xl:col-span-1 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-white">🕯 시도별 감염병 사망률</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">통계청 KOSIS 사망원인통계 · {DEATH_REGION_YEAR}년</p>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200 text-[11px] dark:border-slate-700">
          <button onClick={() => setMetric('rate')} className={`px-2 py-1 ${metric === 'rate' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500'}`}>사망률</button>
          <button onClick={() => setMetric('count')} className={`px-2 py-1 ${metric === 'count' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500'}`}>사망자수</button>
        </div>
      </div>

      <select value={cause} onChange={(e) => setCause(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {DEATH_REGION.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
      </select>

      {!mapped && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          ℹ️ 지도에서 고른 <b>{diseaseLabel}</b>은 KOSIS 사망분류에 별도 집계가 없어, 사망은 <b>폐렴·코로나·패혈증 등 주요 감염사인</b>으로 제공합니다(발생수와 출처·대상질병이 다른 별개 지표).
        </p>
      )}

      <div className="mt-2 space-y-1">
        {ranked.slice(0, 10).map((r, i) => (
          <div key={r.sido} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-right text-[11px] text-slate-400">{i + 1}</span>
            <span className="w-9 shrink-0 truncate text-[12px] text-slate-600 dark:text-slate-300">{r.sido}</span>
            <span className="h-3 flex-1 rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-3 rounded-full bg-rose-500/80" style={{ width: `${Math.max(3, (r.v / max) * 100)}%` }} /></span>
            <span className="w-14 shrink-0 text-right text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-200">{r.v.toLocaleString()}{unit}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        출처: 통계청 KOSIS 사망원인통계(DT_1B34E11). 위 지도의 <b>발생수(질병관리청)</b>와 출처·집계기준이 달라 <b>별개 지표</b>이며, 치명률(사망/발생)을 직접 계산하지 않습니다. 사망률은 인구 10만 명당.
      </p>
    </div>
  )
}
