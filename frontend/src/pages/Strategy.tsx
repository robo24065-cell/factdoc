// 전략 분석 — 관리자 콘솔의 B2G 관제 탭. 서브탭으로 3개 기능. (개인화 위험도는 마이페이지로 이전)
//  ① 인포데믹 조기경보·프리벙킹  ② 병무청×질병청 군 방역·괴담 통제  ③ 기관융합 물자 수요예측
// 원칙: 라이브로 계산 가능한 건 실데이터(EID·KNHANES·MMA·네이버·조달청)로, 외부 미연동(방사청·기상청)은 정직하게 '로드맵' 분리(§10 날조 금지).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Panel from '../components/Panel'
import { prebunkRows, fakeRumors, genericCaution, officialFacts, prebunkDraft } from '../lib/prebunk'
import { eidPeerTop } from '../lib/eidStats'
import { fusionBrief } from '../lib/fusion'
import { NAVER_TRENDS } from '../data/naver-trends'
import { uniformDemand, jointUniformDemand, HW_RHO } from '../lib/uniformDemand'
import { supplyForecast } from '../lib/supplyForecast'
import DemandModelPanel from '../components/DemandModelPanel'
import { PROCURE_BY_CAT, PROCURE_RECENT, PROCURE_SCANNED, PROCURE_HITS, PROCURE_UPDATED } from '../data/procurement'

type TabKey = 'early' | 'cohort' | 'supply'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'early', label: '① 조기경보·프리벙킹' },
  { key: 'cohort', label: '② 군 방역·괴담 통제' },
  { key: 'supply', label: '③ 기관융합 물자예측' },
]

export default function Strategy() {
  const [tab, setTab] = useState<TabKey>('early')
  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-medium text-slate-900 dark:text-white">전략 분석</h1>
          <p className="mt-1 text-sm text-slate-500">주최기관(질병청·병무청+방사·조달) 데이터를 엮어 ‘사후 검증’을 넘어선 예측·통제·수요예측으로 확장. (개인 건강 위험도는 마이페이지)</p>
        </div>
      </div>

      {/* 서브탭 */}
      <div className="mt-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-200 dark:border-slate-800 [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.key ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'early' && <EarlyWarning />}
        {tab === 'cohort' && <MilitaryCohort />}
        {tab === 'supply' && <SupplyForecast />}
      </div>
    </div>
  )
}

// ───────────────────────── ① 인포데믹 조기경보·프리벙킹 ─────────────────────────
function EarlyWarning() {
  const { week, rows } = prebunkRows(8)
  const [sel, setSel] = useState(rows[0]?.name ?? '')
  const [copied, setCopied] = useState(false)
  const cur = rows.find((r) => r.name === sel) ?? rows[0]
  const real = cur ? fakeRumors(cur.name) : []
  const facts = cur ? officialFacts(cur.name) : { symptoms: [], prevention: '' }
  const naver = cur ? NAVER_TRENDS.find((n) => cur.name.includes(n.name) || n.name.includes(cur.name)) : undefined
  const copy = async () => { if (!cur) return; try { await navigator.clipboard.writeText(prebunkDraft(cur.name)); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* */ } }

  return (
    <div className="space-y-4">
      <Panel title="🛰 인포데믹 조기경보" desc={`질병청 감염병포털 급증 신호(${week}주차 최근4주 vs 직전4주)를 가짜정보 선행지표로`} badge="실데이터">
        <p className="mb-3 rounded-lg bg-rose-50 p-2.5 text-[12px] leading-relaxed text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          🚨 발생 급증 <b>{rows.length}종</b> 포착 — 과거 패턴상 감염병이 급증하면 곧 관련 <b>가짜정보·민간요법</b>이 따라 퍼집니다. 아래에서 질환을 고르면 <b>예상 유포 가짜정보 + 질병청 공식 사실 + 담당자용 카드뉴스/해명 초안</b>을 즉시 생성합니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => (
            <button key={r.name} type="button" onClick={() => setSel(r.name)}
              className={`rounded-xl border p-2.5 text-left transition ${sel === r.name ? 'border-rose-400 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'}`}>
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={r.name}>{r.name}</p>
              <p className="mt-0.5 text-xs font-bold text-rose-600">▲{r.growthPct >= 999 ? '신규' : `${r.growthPct}%`}</p>
            </button>
          ))}
        </div>
      </Panel>

      {cur && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`⚠ 예상 유포 가짜정보 — ${cur.name}`} desc="발생 급증 + 질병 유형으로 예측한 선제 대응 대상" badge="실데이터">
            {real.length ? (
              <ul className="space-y-1.5">
                {real.map((rm, i) => (
                  <li key={i} className="flex gap-1.5 text-[13px] leading-relaxed text-rose-800/90 dark:text-rose-200/90"><span>·</span><span>“{rm}” <span className="text-rose-500/70">— 미검증·거짓</span></span></li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] leading-relaxed text-rose-800/90 dark:text-rose-200/90">{genericCaution(cur.name)}</p>
            )}
            {naver && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-[12px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                🔎 네이버 검색 신호: 관련어 <b>{naver.name}</b> 최근 검색 {naver.surgePct > 0 ? '▲' : ''}{naver.surgePct}% — 발생·검색이 함께 움직이는지 모니터링.
              </p>
            )}
            <Link to={`/?q=${encodeURIComponent(`${cur.name}에 좋은 민간요법이 있나요`)}`} target="_blank" className="mt-3 inline-block rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white">관련 가짜정보 직접 검증 →</Link>
            <p className="mt-2 text-[11px] text-slate-400">‘2주 뒤 폭증’류 리드타임은 급증추세 외삽 휴리스틱입니다(과거 시계열 학습은 발전가능성).</p>
          </Panel>

          <Panel title="📋 담당자용 배포 초안 (카드뉴스·해명자료)" desc="질병청 공식 증상·예방을 인용해 즉시 배포 가능한 초안 자동생성" badge="실데이터">
            <div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-950/30">
              <p className="text-[13px] font-semibold text-blue-800 dark:text-blue-200">✅ 질병관리청 공식 사실</p>
              {facts.symptoms.length > 0 && <p className="mt-1 text-[13px] text-blue-900/90 dark:text-blue-100/90"><b>주요 증상</b> · {facts.symptoms.join(', ')}</p>}
              <p className="mt-0.5 text-[13px] text-blue-900/90 dark:text-blue-100/90"><b>예방·수칙</b> · {facts.prevention}</p>
            </div>
            <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{prebunkDraft(cur.name)}</pre>
            <button type="button" onClick={copy} className="mt-2 rounded-lg bg-amber-300 px-3 py-2 text-[13px] font-semibold text-amber-900 active:scale-95">{copied ? '✓ 복사됨' : '📤 초안 복사'}</button>
            <p className="mt-2 text-[11px] text-slate-400">출처: 질병관리청 국가건강정보포털·감염병포털 · 참고용(의료 진단 아님)</p>
          </Panel>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── ② 병무청×질병청 군 밀집시설 감염병·괴담 통제 ─────────────────────────
const MILITARY_CLAIMS = [
  '수두는 단체생활에서 일부러 걸려두는 게 낫다',
  '뇌수막염(수막구균) 백신은 부작용이 심해 안 맞는 게 낫다',
  '결핵은 옛날 병이라 군대에선 이제 안 걸린다',
  'A형간염은 같이 밥만 먹어도 무조건 옮는다',
]
function MilitaryCohort() {
  const b = useMemo(() => fusionBrief(8), [])
  const peer = useMemo(() => eidPeerTop('20대', 'male', 8), [])
  return (
    <div className="space-y-4">
      <Panel title="🪖 병무청 × 질병청 — 입영 코호트(20대 남성) 감염병·괴담 통제" desc="군 밀집생활 고위험 감염병 + 군 특화 괴담을 한 코호트로 통합 관제" badge="실데이터">
        <p className="mb-3 rounded-lg bg-indigo-50 p-2.5 text-[12px] leading-relaxed text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
          🎯 주최기관 <b>병무청</b>(입영 코호트 신체) × <b>질병청</b>(이 코호트 실발생 감염병)을 결합. 훈련소 등 밀집생활은 수두·유행성이하선염·수막염류 감염에 취약하고, 군·가족 사이에 백신 괴담이 빠르게 퍼집니다.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 dark:border-indigo-950 dark:bg-indigo-950/20">
            <p className="text-[11px] font-semibold uppercase text-indigo-700 dark:text-indigo-300">병무청 · 입영 신체기준</p>
            {b.mma ? <p className="mt-1.5 text-sm text-indigo-900 dark:text-indigo-100">평균 키 <b>{b.mma.heightCm}cm</b> · 몸무게 <b>{b.mma.weightKg}kg</b><br /><span className="text-xs opacity-70">BMI {b.mma.bmi} · 병역판정검사 {b.mma.year}</span></p> : <p className="text-sm opacity-60">—</p>}
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 md:col-span-2 dark:border-emerald-950 dark:bg-emerald-950/20">
            <p className="text-[11px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">질병청 · 20대 남성 실발생 감염병(최근)</p>
            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {(peer?.rows ?? []).slice(0, 6).map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-[13px] text-emerald-900 dark:text-emerald-100">
                  <span className="opacity-50">{i + 1}.</span>
                  <span className="flex-1 truncate" title={d.name}>{d.name}</span>
                  {d.surging && <span className="rounded bg-rose-500 px-1 text-[9px] font-bold text-white">급증</span>}
                  <span className="opacity-60">{d.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="🛡 군 특화 괴담 팩트체크" desc="군·가족 사이 빈출 괴담을 엔진으로 검증(클릭 시 판정·근거체인)" badge="실데이터">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {MILITARY_CLAIMS.map((c) => (
            <Link key={c} to={`/?q=${encodeURIComponent(c)}`} target="_blank"
              className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
              <span className="mt-0.5 shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">괴담</span>
              <span className="flex-1 text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">“{c}”</span>
              <span className="shrink-0 text-xs text-blue-600">검증 →</span>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          출처: 질병관리청 감염병포털(연령·성별 발생)·병무청 병역판정통계. 시도 단위까지 라이브 — 부대 단위 발생·입소 검진 연계는 국방/병무 비공개 데이터라 로드맵(B2G 국방 협업). 의료 진단 아님.
        </p>
      </Panel>
    </div>
  )
}


// ───────────────────────── ③ 기관융합 물자 수요예측 ─────────────────────────
// 키×체중 결합 분포 히트맵 모델 — 체형 상관(ρ)을 반영한 결합분포로 군복 호수별 수요 + 독립가정 대비 교정 시연.
const BUILD_RGB: Record<string, string> = { '저체중': '14,165,233', '정상': '16,185,129', '과체중': '245,158,11', '비만': '244,63,94' }
function UniformJointModel({ cohort }: { cohort: number }) {
  const [rho, setRho] = useState(HW_RHO)
  const j = jointUniformDemand(cohort, rho)
  const nf = (n: number) => n.toLocaleString()
  if (!j) return null
  const cellAt = (hi: number, wi: number) => j.cells.find((c) => c.hi === hi && c.wi === wi)!
  return (
    <div className="space-y-3">
      {/* ρ 슬라이더 */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/50">
        <span className="text-[12px] font-medium text-slate-700 dark:text-slate-200">키–체중 상관계수 ρ</span>
        <input type="range" min={0} max={0.8} step={0.05} value={rho} onChange={(e) => setRho(+e.target.value)} className="flex-1 accent-indigo-500" />
        <span className="w-12 text-right text-[13px] font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{rho.toFixed(2)}</span>
        <span className="w-full text-[10px] leading-tight text-slate-400">ρ=0이면 키·체중 <b>독립</b>(단순 곱) · ρ↑이면 ‘키 크면 체중도↑’ 체형 상관을 반영. 기본 0.45=20대 남성 문헌 근사. 평균 키 {j.meanH}cm·체중 {j.meanW}kg({j.fcYear} 예측).</span>
      </div>

      {/* 결합 분포 히트맵 (가로=키, 세로=체중) */}
      <div className="overflow-x-auto">
        <p className="mb-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">📊 키 × 체중 결합 분포 — 격자 = 체격별 인원(명), 색 = 체형(BMI)</p>
        <table className="w-full min-w-[34rem] border-collapse text-center text-[11px]">
          <thead>
            <tr><th className="p-1 text-[10px] font-normal text-slate-400">체중↓ \ 키→</th>{j.hBands.map((b, i) => <th key={i} className="p-1 font-medium text-slate-500 dark:text-slate-300">{b.label.replace(/\s*\(.*\)/, '')}<span className="block text-[9px] font-normal text-slate-400">{b.label.match(/\((.*)\)/)?.[1]}</span></th>)}</tr>
          </thead>
          <tbody>
            {[...j.wBands.keys()].reverse().map((wi) => (
              <tr key={wi}>
                <td className="whitespace-nowrap p-1 text-right font-medium text-slate-500 dark:text-slate-300">{j.wBands[wi].label}</td>
                {j.hBands.map((_, hi) => { const c = cellAt(hi, wi); const ratio = c.qty / j.maxQty; return (
                  <td key={hi} className="p-0.5">
                    <div className="rounded-md px-1 py-1.5 leading-tight" style={{ backgroundColor: `rgba(${BUILD_RGB[c.build]}, ${0.1 + 0.62 * ratio})` }} title={`${c.hLabel} × ${c.wLabel} · BMI ${c.bmi} ${c.build}`}>
                      <span className="block font-semibold tabular-nums text-slate-800 dark:text-slate-100">{nf(c.qty)}</span>
                      <span className="block text-[9px] text-slate-500 dark:text-slate-300/70">BMI {c.bmi}</span>
                    </div>
                  </td>
                ) })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">{j.builds.map((b) => <span key={b.type} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: `rgb(${BUILD_RGB[b.type]})` }} />{b.type}</span>)}</div>
      </div>

      {/* 체형 4분류 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {j.builds.map((b) => (
          <div key={b.type} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: `rgb(${BUILD_RGB[b.type]})` }} /><span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{b.type}</span></div>
            <p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-800 dark:text-slate-100">{nf(b.qty)}<span className="text-[11px] font-normal text-slate-400"> 명 · {(b.p * 100).toFixed(1)}%</span></p>
            <p className="text-[10px] text-slate-400">{b.bmiRange} · {b.fit}</p>
          </div>
        ))}
      </div>

      {/* 독립 가정의 함정 */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
        <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-200">⚠ ‘독립 확률의 함정’ 교정 — 키·체중을 따로 보면(ρ=0) 비현실적 체형이 과다·과소 계상</p>
        <ul className="mt-1.5 space-y-1 text-[11px] text-amber-900/90 dark:text-amber-100/90">
          {j.trap.map((t, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-1.5">
              <b>{t.hLabel.replace(/\s*\(.*\)/, '')} × {t.wLabel}</b>
              <span className="text-amber-700/70 dark:text-amber-300/60">독립 {nf(t.indepQty)}명 →</span>
              <span>결합 <b>{nf(t.jointQty)}명</b></span>
              <span className={`rounded px-1 font-bold ${t.diffPct >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'}`}>{t.diffPct > 0 ? '+' : ''}{t.diffPct}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10px] leading-relaxed text-amber-800/60 dark:text-amber-200/60">예: ‘키 큰데 마른형(특대×60kg대)’이나 ‘단신 고도비만형’은 독립 가정에서 과다 계상 → 상관 ρ 반영 시 실제 체형 비중으로 교정. 상·하의 호수 미스매치·재고 낭비를 줄임.</p>
      </div>
    </div>
  )
}

function SupplyForecast() {
  const [cohort, setCohort] = useState(250000)
  const dem = uniformDemand(cohort)
  const topCat = PROCURE_BY_CAT[0]
  const fc = supplyForecast()
  const fcYear = dem?.fcYear ?? 2027
  const DIR_TONE: Record<string, string> = { '지속증가': 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300', '상승': 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', '안정': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', '감소': 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' }
  return (
    <div className="space-y-4">
      {/* ★다중변수 가중치 모델 — 변수·가중치 조절 → 융합 → 발주 액션플랜 */}
      <DemandModelPanel />

      {/* 통합 수요예측 — 군별 로버스트 3신호(평년/유행대비/추세). 단순 직선외삽 폐기. */}
      <Panel title={`🔮 ${fcYear} 감염병군별 방역물자 수요 — 평년·유행대비·추세`} desc="질병청 발생 다년치(2015~)에서 평년(중앙값)·유행대비(최근 피크)·추세방향을 산출 → 조달 '기본 비축 + 유행 버퍼' 직결. 단순 외삽의 이상치 과대예측 배제." badge="실데이터">
        <p className="mb-3 rounded-lg bg-violet-50 p-2.5 text-[12px] leading-relaxed text-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
          조달 실무는 <b>기본 비축 + 유행 버퍼</b>로 운용됩니다. 단일 직선 외삽은 일회성 급증(예: 백일해 2024)을 ‘영구 추세’로 착각해 과대예측하므로, 군별 <b>평년 수요(중앙값)</b> · <b>유행 대비(최근 피크)</b> · <b>추세 방향</b> 3신호로 분리해 제시합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700"><th className="py-1.5 pr-2">감염병군</th><th className="px-2 text-right">평년 비축</th><th className="px-2 text-right">유행 대비</th><th className="px-2">추세</th><th className="px-2">권장 물자</th></tr></thead>
            <tbody>
              {fc.map((g) => (
                <tr key={g.key} className="border-b border-slate-100 align-top dark:border-slate-800">
                  <td className="py-1.5 pr-2 font-medium text-slate-700 dark:text-slate-200">{g.label}<span className="mt-0.5 block max-w-[15rem] text-[10px] font-normal leading-tight text-slate-400">{g.note}</span></td>
                  <td className="px-2 text-right tabular-nums text-slate-500">{g.base.toLocaleString()}<span className="block text-[9px] text-slate-400">건/년</span></td>
                  <td className="px-2 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">{g.surge.toLocaleString()}<span className="block text-[9px] font-normal text-slate-400">×{(g.base > 0 ? g.surge / g.base : 1).toFixed(1)}</span></td>
                  <td className="px-2"><span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold ${DIR_TONE[g.trendDir]}`}>{g.trendDir}{g.trendDir !== '안정' && g.trendDir !== '지속증가' ? ` ${g.trendPct > 0 ? '+' : ''}${g.trendPct}%` : ''}</span></td>
                  <td className="px-2 text-[12px] text-slate-500">{g.supplies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50">
          📐 <b>평년</b>=최근 5년 발생 중앙값(이상치 둔감) · <b>유행 대비</b>=최근 6년 최대(서지 버퍼) · <b>추세</b>=최근3년 vs 직전3년 중앙값(±60% 클램프, 단조증가는 ‘지속증가’). 보고체계 시작 전 선행 0(예: 매독 2015~16)은 제외. 발생 추세 기반 <b>수요 방향</b>이며 절대 발주량은 조달 이력 연동 시 정밀화. 의학 판정 아님·물자기획 보조.
        </p>
      </Panel>

      <Panel title={`🎖 군복 수요예측 — AI 신체 상관성 결합 분포 모델 (${fcYear} 예측)`} desc="키·체중을 따로가 아니라 '체형(결합 분포)'으로 — 상관계수 ρ로 가상 결합분포를 합성해 체격별·체형별 발주량 산출" badge="실데이터">
        <p className="mb-3 rounded-lg bg-indigo-50 p-2.5 text-[12px] leading-relaxed text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
          군복은 <b>체형(키+체중 결합)</b>에 맞춰 발주해야 합니다. 키·체중을 <b>독립</b>으로 보면 ‘키 큰 마른형·단신 고도비만형’이 과다 계상돼 상·하의 호수가 어긋납니다. 병무청 실측 평균({dem?.prevYear}→{dem?.baseYear} 추세를 <b>{dem?.fcYear}</b> 외삽)에 <b>키–체중 상관 ρ</b>로 <b>조건부 정규분포</b>를 적용해 <b>가상 결합분포</b>를 합성하고, 체격별 발주량과 체형 분포를 산출합니다.
        </p>
        <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">입영 코호트 규모(가정)
          <input type="number" inputMode="numeric" value={cohort} onChange={(e) => setCohort(Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-32 rounded-lg border border-slate-300 bg-white p-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />명
        </label>
        <div className="mt-3"><UniformJointModel cohort={cohort} /></div>
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50">
          📐 <b>방법론</b>: 평균 키·체중=병무청 병역판정검사 <b>실측</b>(추세 {dem?.fcYear} 외삽). 결합분포=<b>이변량 정규(조건부 분해)</b> — 체중│키 ~ N(μ<sub>W</sub>+ρ·(σ<sub>W</sub>/σ<sub>H</sub>)(키−μ<sub>H</sub>), σ<sub>W</sub>√(1−ρ²)). ρ=키–체중 상관(문헌 근사 {HW_RHO}, 원시 결합자료 확보 시 실측 대체). σ는 문헌 근사(키 5.6·체중 11). 체형=BMI 기준(대한비만학회/질병청). 근육질/비만 구분·정밀 가슴·허리둘레 호수는 병무청 상세 인체치수 연동 시 정밀화(로드맵). 수량=가정 코호트×결합확률.
        </p>
      </Panel>

      {/* 조달청 — 방역물자 조달 동향(라이브) */}
      <Panel title="📦 조달청 — 방역물자 조달 동향" desc={`나라장터 입찰공고(물품) 최근 ${120}일 ${PROCURE_SCANNED.toLocaleString()}건 중 방역물자 ${PROCURE_HITS}건 · ${PROCURE_UPDATED}`} badge="실데이터">
        <p className="mb-3 rounded-lg bg-emerald-50 p-2.5 text-[12px] leading-relaxed text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          🔗 <b>감염병 유행(질병청) → 방역물자 조달(조달청)</b> 흐름의 외부 선행지표. 마스크·진단키트·소독·해열제 등 정부 방역물자 발주를 추적해 조기경보를 보강합니다. <b>판정 근거가 아니라 조기경보 신호</b>로만 사용.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">카테고리별 방역물자 입찰</p>
            <div className="space-y-1.5">
              {PROCURE_BY_CAT.map((c) => (
                <div key={c.cat} className="flex items-center gap-2 text-[13px]">
                  <span className="w-20 shrink-0 truncate text-slate-700 dark:text-slate-200">{c.cat}</span>
                  <span className="h-2.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-2.5 rounded-full bg-emerald-500" style={{ width: `${(c.n / (topCat?.n || 1)) * 100}%` }} /></span>
                  <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">{c.n}건</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">최근 방역물자 입찰공고</p>
            <ul className="space-y-1">
              {PROCURE_RECENT.slice(0, 6).map((it, i) => (
                <li key={i} className="text-[12px] leading-snug">
                  <span className="text-slate-700 dark:text-slate-200">{it.nm}</span>
                  <span className="ml-1 text-slate-400">· {it.inst} · {it.date}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">출처: 조달청 나라장터 입찰공고정보서비스(물품). 공고명에 방역 키워드 포함분만 집계 · 주1회 자동 갱신 · 조기경보 보조지표(의학근거 아님).</p>
      </Panel>

      <Panel title="🛣 연동 로드맵 — 방위사업청·기상청" desc="추가 연동 시 산출물. 현재 가짜 수치를 만들지 않습니다(§10 날조 금지)." badge="로드맵">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { org: '방위사업청', need: '군 의료/방역 물자 소요 데이터', out: '부대 규모·유행 결합 군 방역물자 소요 예측' },
            { org: '기상청 (보건·생활기상지수)', need: '감기가능지수·체감온도(폭염)·식중독지수 API', out: '폭염→온열손상 키트, 감기가능지수↑→감기 prebunk·해열제 선발주' },
          ].map((r) => (
            <div key={r.org} className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{r.org}</p>
              <p className="mt-1.5 text-[12px] text-slate-500"><b>필요 데이터:</b> {r.need}</p>
              <p className="mt-1 text-[12px] text-slate-500"><b>연동 시 산출:</b> {r.out}</p>
              <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">데이터 미연동</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">병무·질병·조달은 실데이터 연동 완료. 방사청(비공개)·기상청(신청 후)은 발전가능성 단계.</p>
      </Panel>
    </div>
  )
}
