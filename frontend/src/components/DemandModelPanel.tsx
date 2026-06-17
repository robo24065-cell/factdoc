// 다중변수 가중치 수요예측 모델 — 변수·가중치 조절 → 융합 → 내년 발주량·시점(액션플랜) 산출. 사용자가 "계산식·인사이트가 보이는" 예측시스템 요청.
import { useState } from 'react'
import { demandPlan, MODEL_DISEASES, MODEL_FC_YEAR } from '../lib/demandModel'

const field = 'rounded-lg border border-slate-300 bg-white p-1.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
// 감염병 → 대표 방역물자(예시 품목)
const SUPPLY: Record<string, string> = {
  '말라리아': '방역키트·모기 기피제', '뎅기열': '모기 방제·기피제', '쯔쯔가무시증': '진드기 기피제·보호의',
  '수두': '백신·격리용품', '성홍열': '항생제·마스크', '백일해': '백신·마스크', 'A형간염': '백신·소독',
  '카바페넴내성장내세균목(CRE) 감염증': '격리·소독·보호구', '레지오넬라증': '소독·수질관리', '폐렴구균 감염증': '백신·해열제',
}
const dirTone: Record<string, string> = { '대폭증량': 'bg-rose-600', '증량': 'bg-amber-500', '유지': 'bg-slate-400', '감축': 'bg-blue-500' }

export default function DemandModelPanel() {
  const [disease, setDisease] = useState('말라리아')
  const [baseline, setBaseline] = useState(100000)
  const [wBase, setWBase] = useState(40)
  const [wEnv, setWEnv] = useState(30)
  const [wEpi, setWEpi] = useState(30)
  const [envPct, setEnvPct] = useState(0)
  const [basePct, setBasePct] = useState(0)
  const p = demandPlan(disease, baseline, { base: wBase, env: wEnv, epi: wEpi }, envPct, basePct)
  const supply = SUPPLY[disease] || '관련 방역·의료 물자'
  const nf = (n: number) => n.toLocaleString()
  const Wrow = ({ label, sub, w, set, color }: { label: string; sub: string; w: number; set: (n: number) => void; color: string }) => (
    <div className="flex items-center gap-2">
      <span className="w-2 shrink-0"><span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} /></span>
      <span className="w-40 shrink-0 text-[12px] text-slate-600 dark:text-slate-300">{label}<span className="block text-[10px] text-slate-400">{sub}</span></span>
      <input type="range" min={0} max={100} step={5} value={w} onChange={(e) => set(+e.target.value)} className="flex-1 accent-indigo-500" />
      <span className="w-10 shrink-0 text-right text-[12px] font-medium tabular-nums text-slate-700 dark:text-slate-200">{w}%</span>
    </div>
  )

  return (
    <div className="rounded-2xl border border-indigo-200 bg-white p-5 dark:border-indigo-900 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-slate-900 dark:text-white">🧮 {MODEL_FC_YEAR} 다중변수 가중치 수요예측 모델</h2>
          <p className="mt-0.5 text-xs text-slate-500">병무(기본수요)·기상(환경위험)·질병청(유행가속)을 가중 융합 → 내년 발주량·시점 액션플랜</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">실데이터+모델</span>
      </div>

      {/* STEP 1 — 변수·가중치 */}
      <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <p className="mb-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">STEP 1 · 변수 설정 + 가중치 조절</p>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">대상 감염병
            <select value={disease} onChange={(e) => setDisease(e.target.value)} className={field}>{MODEL_DISEASES.map((d) => <option key={d} value={d}>{d.replace(/^@/, '')}</option>)}</select>
          </label>
          <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">예년 평균 발주량
            <input type="number" value={baseline} onChange={(e) => setBaseline(Math.max(0, +e.target.value || 0))} className={`${field} w-28`} />개
          </label>
        </div>
        <div className="mt-2 space-y-1.5">
          <Wrow label="A. 기본수요" sub="병무 입영 코호트·인구" w={wBase} set={setWBase} color="bg-indigo-500" />
          <Wrow label="B. 환경위험" sub="기상 폭염·강수(연동대기)" w={wEnv} set={setWEnv} color="bg-amber-500" />
          <Wrow label="C. 유행가속" sub="질병청 발생 추세" w={wEpi} set={setWEpi} color="bg-rose-500" />
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-slate-500">
          <label className="flex items-center gap-1">기상 환경위험 가산
            <input type="number" value={envPct} onChange={(e) => setEnvPct(+e.target.value || 0)} className={`${field} w-16`} />%
            <span className="text-[10px] text-amber-500">기상청 연동 시 자동</span>
          </label>
          <label className="flex items-center gap-1">인구·코호트 변화
            <input type="number" value={basePct} onChange={(e) => setBasePct(+e.target.value || 0)} className={`${field} w-16`} />%
          </label>
        </div>
      </div>

      {/* STEP 2 — 융합 분석 */}
      <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <p className="mb-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">STEP 2 · 데이터 융합 분석</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-[12px]">
          <div className="rounded-lg bg-white p-2 dark:bg-slate-900"><p className="text-rose-600 dark:text-rose-400">C 유행가속 <span className="font-bold">{p.weights.epi * 100 | 0}%</span></p><p className="mt-0.5 text-slate-600 dark:text-slate-300">{p.epi.latestYear} {nf(p.epi.latest)}건 → {p.fcYear} {nf(p.epi.fc)}건 <b className={p.epi.deltaPct >= 0 ? 'text-rose-600' : 'text-blue-600'}>({p.epi.deltaPct > 0 ? '+' : ''}{p.epi.deltaPct}%)</b></p></div>
          <div className="rounded-lg bg-white p-2 dark:bg-slate-900"><p className="text-amber-600 dark:text-amber-400">B 환경위험 <span className="font-bold">{p.weights.env * 100 | 0}%</span></p><p className="mt-0.5 text-slate-600 dark:text-slate-300">기상 가산 {envPct > 0 ? '+' : ''}{envPct}% {envPct === 0 && <span className="text-[10px] text-amber-500">(연동대기)</span>}</p></div>
          <div className="rounded-lg bg-white p-2 dark:bg-slate-900"><p className="text-indigo-600 dark:text-indigo-400">A 기본수요 <span className="font-bold">{p.weights.base * 100 | 0}%</span></p><p className="mt-0.5 text-slate-600 dark:text-slate-300">인구·코호트 {basePct > 0 ? '+' : ''}{basePct}%</p></div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[12px] text-slate-500">가중 융합 조정률</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><span className={`block h-2.5 rounded-full ${dirTone[p.dir]}`} style={{ width: `${Math.min(100, Math.abs(p.adjPct))}%` }} /></span>
          <span className={`text-sm font-bold ${p.adjPct >= 0 ? 'text-rose-600' : 'text-blue-600'}`}>{p.adjPct > 0 ? '+' : ''}{p.adjPct}%</span>
        </div>
      </div>

      {/* STEP 3 — 액션플랜 */}
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="mb-1.5 text-[12px] font-semibold text-emerald-800 dark:text-emerald-200">STEP 3 · {p.fcYear} 발주 액션플랜</p>
        <p className="text-[13px] leading-relaxed text-emerald-900 dark:text-emerald-100">
          분석 결과 <b>{p.fcYear}년 {disease.replace(/^@/, '')}</b> {p.dir === '감축' ? '발생 감소' : p.dir === '유지' ? '발생 안정' : p.epi.deltaPct >= 30 ? '대유행' : '발생 증가'} 예상.
          {' '}예년 발주량 <b>{nf(p.baseline)}개</b> 대비 <b className={p.adjPct >= 0 ? 'text-rose-700 dark:text-rose-300' : 'text-blue-700 dark:text-blue-300'}>{p.adjPct > 0 ? '+' : ''}{p.adjPct}% {p.dir}</b>한
          {' '}<b className="text-lg">{nf(p.recommendedQty)}개</b>({supply})를,
          {p.peak > 0 ? <> 통상 정점월(<b>{p.monthLabel}</b>) 대비 리드타임 고려 <b>{p.orderLabel}</b> {p.orderMonth && p.peak && p.orderLabel !== p.monthLabel ? '조기 ' : ''}발주 권장.</> : ' 적정 시점에 발주 권장.'}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-emerald-800/60 dark:text-emerald-200/60">
          📐 조정률 = Σ(가중치×변수변화). 유행가속=질병청 발생 추세 회귀 외삽(실데이터), 환경위험=기상청 연동 시 자동(현재 수동), 발주시점=질병청 월별 계절성 정점−리드타임. 발주량은 입력한 예년 평균 기준 가정. 물자기획 보조이며 의학 판정 아님.
        </p>
      </div>
    </div>
  )
}
