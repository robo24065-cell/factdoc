// 다중변수 가중치 수요예측 모델 — 질병군별 변수 적합도 자동 적용 → 융합 → 평년/유행대비 발주량·시점(액션플랜).
//   ❶ 시나리오 프리셋(여름매개체·호흡기유행·내성균)으로 진입 ❷ 질병군에 맞는 변수만 활성(무관 변수 회색·비활성)
//   ❸ 유행가속=로버스트 추세(직선외삽 아티팩트 아님) ❹ 기상=시나리오 레버(측정값 아님, #40 연동 전) ❺ 평년+유행 2단 권장.
import { useEffect, useState } from 'react'
import { demandPlan, groupOf, MODEL_DISEASES, MODEL_FC_YEAR } from '../lib/demandModel'

const field = 'rounded-lg border border-slate-300 bg-white p-1.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
const SUPPLY: Record<string, string> = {
  '말라리아': '방역키트·모기 기피제', '뎅기열': '모기 방제·기피제', '쯔쯔가무시증': '진드기 기피제·보호의',
  '수두': '백신·격리용품', '성홍열': '항생제·마스크', '백일해': '백신·마스크·해열제', 'A형간염': '백신·소독',
  '카바페넴내성장내세균목(CRE) 감염증': '격리·소독·보호구', '레지오넬라증': '소독·수질관리', '폐렴구균 감염증': '백신·해열제',
}
const dirTone: Record<string, string> = { '대폭증량': 'bg-rose-600', '증량': 'bg-amber-500', '유지': 'bg-slate-400', '감축': 'bg-blue-500' }
// 한국어 조사 — 종성(받침) 기준. 0=없음, 8=ㄹ, 그 외=일반받침.
function jong(w: string): number { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : (/[a-z0-9]/i.test(w.slice(-1)) ? 1 : 0) }
const topic = (w: string) => (jong(w) ? '은' : '는')          // 은/는
const by = (w: string) => { const j = jong(w); return j === 0 || j === 8 ? '로' : '으로' } // 으로/로 (ㄹ받침=로)
// 심사·실무 직관용 시나리오 프리셋(서로 다른 데이터 경로)
const PRESETS = [
  { label: '🦟 여름 매개체 방역', disease: '말라리아', hint: '기상 결정적' },
  { label: '😷 호흡기 유행 대비', disease: '백일해', hint: '밀집+유행' },
  { label: '🏥 의료 내성균', disease: '카바페넴내성장내세균목(CRE) 감염증', hint: '기상 무관·지속증가' },
]

export default function DemandModelPanel() {
  const [disease, setDisease] = useState('말라리아')
  const [baseline, setBaseline] = useState(100000)
  const g0 = groupOf(disease)
  const [w, setW] = useState(g0.weights)
  const [envPct, setEnvPct] = useState(0)
  const [cohortPct, setCohortPct] = useState(0)
  // 질병 변경 시 → 그 군의 기본 가중치로 리셋 + 시나리오 입력 초기화(미스매치 방지)
  useEffect(() => { const g = groupOf(disease); setW(g.weights); setEnvPct(0); setCohortPct(0) }, [disease])

  const p = demandPlan(disease, baseline, w, envPct, cohortPct)
  const gp = p.gp
  const supply = SUPPLY[disease] || gp.supplies
  const nf = (n: number) => n.toLocaleString()
  const dn = disease.replace(/^@/, '')

  const Wrow = ({ vkey, label, sub, color }: { vkey: 'epi' | 'env' | 'cohort'; label: string; sub: string; color: string }) => {
    const on = p.active[vkey]
    return (
      <div className={`flex items-center gap-2 ${on ? '' : 'opacity-40'}`}>
        <span className="w-2 shrink-0"><span className={`inline-block h-2.5 w-2.5 rounded-full ${on ? color : 'bg-slate-300'}`} /></span>
        <span className="w-40 shrink-0 text-[12px] text-slate-600 dark:text-slate-300">{label}<span className="block text-[10px] text-slate-400">{on ? sub : '이 감염병엔 영향 없음'}</span></span>
        <input type="range" min={0} max={100} step={5} value={on ? w[vkey] : 0} disabled={!on}
          onChange={(e) => setW({ ...w, [vkey]: +e.target.value })} className="flex-1 accent-indigo-500 disabled:cursor-not-allowed" />
        <span className="w-10 shrink-0 text-right text-[12px] font-medium tabular-nums text-slate-700 dark:text-slate-200">{on ? `${w[vkey]}%` : '—'}</span>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-white p-5 dark:border-indigo-900 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-slate-900 dark:text-white">🧮 {MODEL_FC_YEAR} 다중변수 가중치 수요예측 모델</h2>
          <p className="mt-0.5 text-xs text-slate-500">질병군별 <b>변수 적합도</b>를 자동 적용(매개체=기상↑·의료감염=기상 비활성) → 가중 융합 → 평년·유행대비 발주 액션플랜</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">실데이터+모델</span>
      </div>

      {/* 시나리오 프리셋 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((pr) => (
          <button key={pr.disease} type="button" onClick={() => setDisease(pr.disease)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${disease === pr.disease ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700'}`}>
            {pr.label} <span className="text-slate-400">· {pr.hint}</span>
          </button>
        ))}
      </div>

      {/* STEP 1 — 변수·가중치 */}
      <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <p className="mb-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">STEP 1 · 대상 선택 + 변수 적합도(군 기본값, 조절 가능)</p>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">대상 감염병
            <select value={disease} onChange={(e) => setDisease(e.target.value)} className={field}>{MODEL_DISEASES.map((d) => <option key={d} value={d}>{d.replace(/^@/, '')}</option>)}</select>
          </label>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{gp.label}</span>
          <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">예년 발주량
            <input type="number" value={baseline} onChange={(e) => setBaseline(Math.max(0, +e.target.value || 0))} className={`${field} w-28`} />개
          </label>
        </div>
        <p className="mt-1.5 rounded-md bg-indigo-50/60 px-2 py-1 text-[11px] leading-relaxed text-indigo-900/80 dark:bg-indigo-950/20 dark:text-indigo-200/80">📌 {gp.rationale}</p>
        <div className="mt-2 space-y-1.5">
          <Wrow vkey="epi" label="C. 유행가속" sub="질병청 발생 추세(로버스트)" color="bg-rose-500" />
          <Wrow vkey="env" label="B. 환경위험" sub={`기상 ${gp.envLabel} (시나리오)`} color="bg-amber-500" />
          <Wrow vkey="cohort" label="A. 기본수요" sub={gp.cohortLabel} color="bg-indigo-500" />
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-slate-500">
          {p.active.env && (
            <label className="flex items-center gap-1">기상 시나리오 가산
              <input type="number" value={envPct} onChange={(e) => setEnvPct(+e.target.value || 0)} className={`${field} w-16`} />%
              <span className="text-[10px] text-amber-500">예: 이른 폭염 +30 (측정값 아님)</span>
            </label>
          )}
          {p.active.cohort && (
            <label className="flex items-center gap-1">{gp.cohortLabel} 변화
              <input type="number" value={cohortPct} onChange={(e) => setCohortPct(+e.target.value || 0)} className={`${field} w-16`} />%
            </label>
          )}
        </div>
      </div>

      {/* STEP 2 — 융합 분석 */}
      <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <p className="mb-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">STEP 2 · 데이터 융합 분석</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-[12px]">
          <div className="rounded-lg bg-white p-2 dark:bg-slate-900"><p className="text-rose-600 dark:text-rose-400">C 유행가속 <span className="font-bold">{Math.round(p.weights.epi * 100)}%</span></p><p className="mt-0.5 text-slate-600 dark:text-slate-300">평년 {nf(p.rf.base)}건 · 추세 <b className={p.rf.trendDir === '감소' ? 'text-blue-600' : 'text-rose-600'}>{p.rf.trendDir}{p.rf.trendDir !== '안정' && p.rf.trendDir !== '지속증가' ? ` ${p.epiPct > 0 ? '+' : ''}${p.epiPct}%` : ''}</b></p></div>
          <div className="rounded-lg bg-white p-2 dark:bg-slate-900"><p className="text-amber-600 dark:text-amber-400">B 환경위험 <span className="font-bold">{p.active.env ? `${Math.round(p.weights.env * 100)}%` : '비활성'}</span></p><p className="mt-0.5 text-slate-600 dark:text-slate-300">{p.active.env ? <>기상 시나리오 {envPct > 0 ? '+' : ''}{envPct}% {envPct === 0 && <span className="text-[10px] text-amber-500">(설정)</span>}</> : <span className="text-[10px] text-slate-400">이 군은 기상 무관</span>}</p></div>
          <div className="rounded-lg bg-white p-2 dark:bg-slate-900"><p className="text-indigo-600 dark:text-indigo-400">A 기본수요 <span className="font-bold">{p.active.cohort ? `${Math.round(p.weights.cohort * 100)}%` : '비활성'}</span></p><p className="mt-0.5 text-slate-600 dark:text-slate-300">{p.active.cohort ? <>{gp.cohortLabel} {cohortPct > 0 ? '+' : ''}{cohortPct}%</> : <span className="text-[10px] text-slate-400">—</span>}</p></div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[12px] text-slate-500">가중 융합 조정률</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><span className={`block h-2.5 rounded-full ${dirTone[p.dir]}`} style={{ width: `${Math.min(100, Math.abs(p.adjPct))}%` }} /></span>
          <span className={`text-sm font-bold ${p.adjPct >= 0 ? 'text-rose-600' : 'text-blue-600'}`}>{p.adjPct > 0 ? '+' : ''}{p.adjPct}%</span>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">로버스트 신호 — 평년 <b>{nf(p.rf.base)}</b>건 · 유행대비 <b>{nf(p.rf.surge)}</b>건(×{(p.surgeRatio).toFixed(1)}){p.rf.histMax > p.rf.surge * 1.3 && <> · 역대최대 <b>{nf(p.rf.histMax)}</b>건({p.rf.histMaxYear})</>}</p>
      </div>

      {/* STEP 3 — 액션플랜 */}
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="mb-1.5 text-[12px] font-semibold text-emerald-800 dark:text-emerald-200">STEP 3 · {p.fcYear} 발주 액션플랜</p>
        <p className="text-[13px] leading-relaxed text-emerald-900 dark:text-emerald-100">
          <b>{dn}</b>({gp.label}){topic(gp.label)} {gp.rationale.split(' →')[0]}.
          {' '}발생 추세는 <b>{p.rf.trendDir}</b>{p.active.env && envPct !== 0 ? <>, 기상 시나리오(<b>{envPct > 0 ? '+' : ''}{envPct}%</b>)를 결합하면</> : by(p.rf.trendDir)}
          {' '}예년 발주 <b>{nf(p.baseline)}개</b> 대비 <b className={p.adjPct >= 0 ? 'text-rose-700 dark:text-rose-300' : 'text-blue-700 dark:text-blue-300'}>{p.adjPct > 0 ? '+' : ''}{p.adjPct}% {p.dir}</b>한
          {' '}<b className="text-lg">{nf(p.qtyBase)}개</b>({supply})를 평년 비축으로 권장합니다.
          {p.surgeBeyondStock
            ? <> 다만 {p.rf.outbreaks[0] ? `${p.rf.outbreaks[0].year}년 ${nf(p.rf.outbreaks[0].value)}건(평년의 ${Math.round(p.surgeRatio)}배)` : '과거 대유행'} 같은 폭증은 사전 비축 한계를 넘으므로, 비축 대신 <b>긴급조달·증산 계약</b>을 사전 체결해 대응하는 것을 권장합니다.</>
            : p.surgeRatio >= 1.3 && <> 단, {p.rf.outbreaks[0] ? `${p.rf.outbreaks[0].year}년 ${nf(p.rf.outbreaks[0].value)}건 같은` : '과거'} 유행 발생 시 <b>{nf(p.qtySurge)}개</b>(×{p.surgeRatio.toFixed(1)})까지 서지 대비가 필요합니다.</>}
          {p.peak > 0 ? <> 통상 정점월(<b>{p.monthLabel}</b>) 대비 리드타임을 고려해 <b>{p.orderLabel}</b> {p.orderLabel !== p.monthLabel ? '조기 ' : ''}발주를 권장합니다.</> : ' 적정 시점에 발주를 권장합니다.'}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-emerald-800/60 dark:text-emerald-200/60">
          📐 조정률 = Σ(활성 변수 가중치 × 변수 변화). 유행가속=질병청 발생 <b>로버스트 추세</b>(평년 중앙값·이상치 둔감, 직선외삽 아님), 환경위험=기상 <b>시나리오 레버</b>(측정값 아님, #40 기상청 연동 시 자동), 기본수요=병무 코호트·밀집. 발주시점=질병청 월별 계절성 정점−리드타임. 평년 발주량은 입력 예년 평균 기준 가정. 물자기획 보조이며 의학 판정 아님.
        </p>
      </div>
    </div>
  )
}
