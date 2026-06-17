// 전략 분석 — 관리자 콘솔의 '아이디어 구현' 탭. 내부 서브탭으로 4개 기능을 각각 페이지화.
//  ① 인포데믹 조기경보·프리벙킹  ② 병무청×질병청 군 방역·괴담 통제  ③ KNHANES 초개인화 위험도  ④ 기관융합 물자 수요예측(로드맵)
// 원칙: 라이브로 계산 가능한 건 실데이터(EID·KNHANES·MMA·네이버)로, 외부 미연동(방사청·조달청·기상청)은 정직하게 '로드맵' 분리(§10 날조 금지).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Panel from '../components/Panel'
import { prebunkRows, fakeRumors, genericCaution, officialFacts, prebunkDraft } from '../lib/prebunk'
import { eidPeerTop } from '../lib/eidStats'
import { fusionBrief } from '../lib/fusion'
import { prevalenceFor, rumorsFor } from '../engine'
import { NAVER_TRENDS } from '../data/naver-trends'
import CheckupPercentile from '../components/CheckupPercentile'
import { uniformDemand } from '../lib/uniformDemand'
import { supplyForecast } from '../lib/supplyForecast'
import DemandModelPanel from '../components/DemandModelPanel'
import { PROCURE_BY_CAT, PROCURE_RECENT, PROCURE_SCANNED, PROCURE_HITS, PROCURE_UPDATED } from '../data/procurement'

type TabKey = 'early' | 'cohort' | 'risk' | 'supply'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'early', label: '① 조기경보·프리벙킹' },
  { key: 'cohort', label: '② 군 방역·괴담 통제' },
  { key: 'risk', label: '③ 개인화 위험도' },
  { key: 'supply', label: '④ 기관융합 물자예측' },
]

export default function Strategy() {
  const [tab, setTab] = useState<TabKey>('early')
  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-medium text-slate-900 dark:text-white">전략 분석</h1>
          <p className="mt-1 text-sm text-slate-500">주최기관(질병청·병무청+방사·조달) 데이터를 엮어 ‘사후 검증’을 넘어선 예측·통제·개인화·수요예측으로 확장.</p>
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
        {tab === 'risk' && <RiskReader />}
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

// ───────────────────────── ③ KNHANES 기반 초개인화 위험도 판독기 ─────────────────────────
const CONDITIONS: { key: string; label: string }[] = [
  { key: '제2형당뇨', label: '당뇨' }, { key: '고혈압', label: '고혈압' }, { key: '비만', label: '비만' }, { key: '이상지질혈증', label: '이상지질혈증' },
]
function loadProfile(): { age: string; sex: string } {
  try { const p = JSON.parse(localStorage.getItem('factdoc_profile') || '{}'); return { age: String(p.manAge || ''), sex: String(p.sex || '') } } catch { return { age: '', sex: '' } }
}
function dangerOf(rumor: string): { level: '높음' | '중간' | '낮음'; tone: string } {
  if (/완치|끊|중단|대체|단식|안 ?맞|필요\s*없|평생/.test(rumor)) return { level: '높음', tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' }
  if (/즙|민간|특효|보조제|효능|좋다/.test(rumor)) return { level: '중간', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' }
  return { level: '낮음', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
}
function RiskReader() {
  const init = loadProfile()
  const [age, setAge] = useState(init.age)
  const [sex, setSex] = useState(init.sex)
  const [conds, setConds] = useState<string[]>([])
  const ageNum = parseInt(age, 10) || 0
  const ageBand = ageNum >= 20 ? `${Math.min(70, Math.floor(ageNum / 10) * 10)}대` : ''
  const toggle = (k: string) => setConds((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))
  const peer = ageBand && (sex === 'male' || sex === 'female') ? eidPeerTop(ageBand, sex as 'male' | 'female', 3) : null
  const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <div className="space-y-4">
      <Panel title="🧬 KNHANES 초개인화 위험도 판독기" desc="나이·성별·기저질환 → 공식 유병률 맥락 + ‘이 가짜정보가 나에게 위험한 이유’" badge="실데이터">
        <p className="mb-3 rounded-lg bg-blue-50 p-2.5 text-[12px] leading-relaxed text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
          ‘효과 없음’을 넘어, <b>당신 조건에서 그 가짜정보가 얼마나 위험한지</b>를 질병청 KNHANES 유병률로 맥락화합니다. 입력은 <b>이 기기에서만</b> 계산(서버 전송 없음).
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block text-sm"><span className="text-slate-600 dark:text-slate-300">만 나이</span>
            <input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="예: 58" className={field} /></label>
          <label className="block text-sm"><span className="text-slate-600 dark:text-slate-300">성별</span>
            <select value={sex} onChange={(e) => setSex(e.target.value)} className={field}><option value="">선택</option><option value="male">남성</option><option value="female">여성</option></select></label>
          <div className="col-span-2 text-sm"><span className="text-slate-600 dark:text-slate-300">기저질환(선택)</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CONDITIONS.map((c) => (
                <button key={c.key} type="button" onClick={() => toggle(c.key)} className={`rounded-full border px-2.5 py-1 text-xs ${conds.includes(c.key) ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{c.label}</button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* 검진수치 → 또래 분포 백분위(KOSIS 건강검진통계) */}
      <CheckupPercentile age={ageNum} sex={sex === 'male' ? 'M' : sex === 'female' ? 'F' : ''} />

      {/* 내 또래·내 조건 유병률 */}
      {(conds.length > 0 || peer) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="📊 내 또래·내 조건 공식 유병률" desc="질병청 국민건강영양조사(KNHANES) 근사" badge="실데이터">
            {conds.length === 0 ? <p className="text-sm text-slate-400">기저질환을 선택하면 해당 질환의 연령대별 공식 유병률을 보여줍니다.</p> : (
              <div className="space-y-3">
                {conds.map((k) => {
                  const p = prevalenceFor(k, ageNum || undefined)
                  if (!p) return null
                  const mid = (p.range[0] + p.range[1]) / 2
                  return (
                    <div key={k}>
                      <div className="flex justify-between text-[13px]"><span className="text-slate-600 dark:text-slate-300">{p.label}{p.scope === '연령대' && ageBand ? ` · ${ageBand}` : ''}</span><span className="font-semibold text-slate-800 dark:text-slate-100">{p.range[0]}~{p.range[1]}%</span></div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, mid * 1.6)}%` }} /></div>
                    </div>
                  )
                })}
                <p className="text-[11px] text-slate-400">출처: 질병청 KNHANES 근사 · 참고용(개인 진단 아님)</p>
              </div>
            )}
          </Panel>

          <Panel title="🦠 내 또래 지금 유행 감염병" desc={peer ? `${peer.band} ${sex === 'male' ? '남성' : '여성'} 최근 실발생 Top` : '나이·성별 입력 시 표시'} badge="실데이터">
            {peer && peer.rows.length ? (
              <ol className="space-y-1.5 text-sm">
                {peer.rows.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2"><span className="text-slate-400">{i + 1}.</span><span className="flex-1 truncate text-slate-700 dark:text-slate-200">{d.name}</span>{d.surging && <span className="rounded bg-rose-500 px-1 text-[9px] font-bold text-white">급증</span>}<span className="text-xs text-slate-400">{d.count.toLocaleString()}건</span></li>
                ))}
              </ol>
            ) : <p className="text-sm text-slate-400">만 나이·성별을 입력하면 또래 감염병을 보여줍니다.</p>}
          </Panel>
        </div>
      )}

      {/* 내 조건에서 위험한 가짜정보 */}
      {conds.length > 0 && (
        <Panel title="🚨 주의! 내 조건에서 특히 위험한 가짜정보" desc="기저질환 ↔ 실제 유포 루머 매칭 + 개인화 위험도(상대·참고)" badge="실데이터">
          <div className="space-y-3">
            {conds.map((k) => {
              const rumors = rumorsFor(k) ?? []
              const label = CONDITIONS.find((c) => c.key === k)?.label ?? k
              if (!rumors.length) return null
              return (
                <div key={k} className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 dark:border-rose-950 dark:bg-rose-950/20">
                  <p className="text-[13px] font-semibold text-rose-800 dark:text-rose-200">{label} 환자가 특히 조심할 가짜정보</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {rumors.slice(0, 3).map((rm, i) => {
                      const d = dangerOf(rm)
                      return (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-rose-900/90 dark:text-rose-100/90">
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${d.tone}`}>위험 {d.level}</span>
                          <span className="flex-1">“{rm}”</span>
                          <Link to={`/?q=${encodeURIComponent(rm)}`} target="_blank" className="shrink-0 text-xs text-blue-600">검증 →</Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
          <p className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50">
            ⚠ ‘위험도’는 기저질환·루머 유형으로 산출한 <b>상대·참고 지표</b>이며 개인 의료 진단이 아닙니다. 약 복용·치료 중단은 절대 임의로 하지 말고, 증상이 의심되면 전문가·질병관리청(1339)과 상담하세요. 입력값은 서버로 전송되지 않습니다.
          </p>
        </Panel>
      )}
    </div>
  )
}

// ───────────────────────── ④ 기관융합 물자 수요예측 (대부분 로드맵) ─────────────────────────
function DemandTableView({ t }: { t: import('../lib/uniformDemand').DemandTable }) {
  const nf = (n: number) => n.toLocaleString()
  const maxPct = Math.max(...t.rows.map((r) => r.pctFc), 0.01)
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-[12px] font-medium text-slate-600 dark:text-slate-300">{t.dim} 호수 — 평균 {t.meanBase}{t.unit}({t.baseYear}) → <b className="text-indigo-600 dark:text-indigo-400">{t.meanFc}{t.unit}({t.fcYear} 예측)</b></p>
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700"><th className="py-1 pr-2">호수</th><th className="px-2">{t.fcYear} 비중</th><th className="px-2">필요 수량</th><th className="px-2">{t.baseYear} 대비</th></tr></thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.band} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-1 pr-2 text-slate-700 dark:text-slate-200">{r.band}</td>
              <td className="px-2"><div className="flex items-center gap-1.5"><span className="h-2 w-12 rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-2 rounded-full bg-indigo-500" style={{ width: `${(r.pctFc / maxPct) * 100}%` }} /></span><span className="tabular-nums text-slate-500">{(r.pctFc * 100).toFixed(1)}%</span></div></td>
              <td className="px-2 tabular-nums text-slate-700 dark:text-slate-200">{nf(r.qtyFc)}</td>
              <td className={`px-2 tabular-nums font-medium ${r.deltaQty > 0 ? 'text-rose-600' : r.deltaQty < 0 ? 'text-blue-600' : 'text-slate-400'}`}>{r.deltaQty > 0 ? '▲' : r.deltaQty < 0 ? '▼' : ''}{nf(Math.abs(r.deltaQty))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SupplyForecast() {
  const [cohort, setCohort] = useState(250000)
  const dem = uniformDemand(cohort)
  const topCat = PROCURE_BY_CAT[0]
  const fc = supplyForecast()
  const fcYear = dem?.fcYear ?? 2027
  const DIR_TONE: Record<string, string> = { '급증': 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300', '증가': 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', '유지': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', '감소': 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' }
  return (
    <div className="space-y-4">
      {/* ★다중변수 가중치 모델 — 변수·가중치 조절 → 융합 → 발주 액션플랜 */}
      <DemandModelPanel />

      {/* 통합 수요예측 — 다년 유행 추세 → 내년 방역물자 수요(군별 개요) */}
      <Panel title={`🔮 ${fcYear} 감염병군별 수요 방향 — 다년 추세 개요`} desc="질병청 감염병 발생 다년 추세(선형회귀)를 내년으로 외삽 → 방역물자 카테고리별 수요 방향 + 조달청 현재 발주 교차" badge="실데이터">
        <p className="mb-3 rounded-lg bg-violet-50 p-2.5 text-[12px] leading-relaxed text-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
          <b>질병청(유행 추세)</b> + <b>병무청(입영 신체)</b> + <b>조달청(현재 발주)</b>을 통합해 <b>{fcYear}년 물자 수요</b>를 선제 예측합니다. 감염병군별 최근 추세를 회귀로 외삽해 방역물자 수요 방향을 산출하고, 조달청 실제 발주와 교차 검증합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700"><th className="py-1.5 pr-2">감염병군</th><th className="px-2">최신({fc[0]?.latestYear})</th><th className="px-2">{fcYear} 예측</th><th className="px-2">방향</th><th className="px-2">권장 물자</th></tr></thead>
            <tbody>
              {fc.map((g) => (
                <tr key={g.key} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 pr-2 font-medium text-slate-700 dark:text-slate-200">{g.label}</td>
                  <td className="px-2 tabular-nums text-slate-500">{g.latest.toLocaleString()}</td>
                  <td className="px-2 tabular-nums font-semibold text-slate-800 dark:text-slate-100">{g.fc.toLocaleString()}</td>
                  <td className="px-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${DIR_TONE[g.dir]}`}>{g.dir} {g.deltaPct > 0 ? '+' : ''}{g.deltaPct}%</span></td>
                  <td className="px-2 text-[12px] text-slate-500">{g.supplies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50">
          📐 감염병군별 최근 완전연도(질병청 EID_NAT_YEAR) <b>최소제곱 선형회귀 → {fcYear} 외삽</b>. 발생 추세 기반 <b>수요 방향·우선순위</b>이며 절대 발주량은 조달 이력 연동 시 정밀화(아래 조달청). 의학 판정 아님·물자기획 보조.
        </p>
      </Panel>

      <Panel title={`🎖 군복 호수별 수요예측 — 신체 분포 모델 (${fcYear} 예측)`} desc="평균이 아니라 분포로 각 호수 인원 추정 → 추세 외삽으로 내년 발주 수요·증감 예측 (키+몸무게)" badge="실데이터">
        <p className="mb-3 rounded-lg bg-indigo-50 p-2.5 text-[12px] leading-relaxed text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
          평균만으론 발주를 못 합니다 — <b>호수별 인원</b>이 필요하죠. 병무청 실측 평균({dem?.prevYear}→{dem?.baseYear})의 변화 추세를 <b>{dem?.fcYear}년으로 외삽</b>하고, <b>키(길이)·몸무게(체형) 분포</b>를 정규분포로 추정해 호수별 수요·전년대비 증감을 예측합니다.
        </p>
        <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">입영 코호트 규모(가정)
          <input type="number" inputMode="numeric" value={cohort} onChange={(e) => setCohort(Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-32 rounded-lg border border-slate-300 bg-white p-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />명
        </label>
        {dem && (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <DemandTableView t={dem.height} />
            <DemandTableView t={dem.weight} />
          </div>
        )}
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50">
          📐 <b>방법론</b>: 평균 키·몸무게는 병무청 병역판정검사 <b>실측</b>, 추세를 {dem?.fcYear}년으로 선형 외삽. 호수 분포는 <b>정규분포 가정</b>(키 σ=5.6cm·체중 σ=11kg, 문헌 근사·키·체중 독립 가정). 평균이 오르면 큰 호수↑·작은 호수↓. 실측 치수 히스토그램·가슴둘레·키×체중 결합분포는 병무청 상세통계 연동 시 정밀화(로드맵). 수량=가정 코호트×비중.
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
