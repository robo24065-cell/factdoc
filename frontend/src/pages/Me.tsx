import { useEffect, useState } from 'react'
import { compareToMma } from '../engine/mma-bodyspec'
import { bodyStandard } from '../data/bodyspec'

const AGE_BANDS = ['10대', '20대', '30대', '40대', '50대', '60대', '70대 이상']
const KEY = 'factdoc_profile'

// 대한비만학회 기준(아시아인) BMI 분류
function bmiCategory(bmi: number): { label: string; tone: string; note: string } {
  if (bmi < 18.5) return { label: '저체중', tone: 'text-amber-700 dark:text-amber-300', note: '저체중도 영양·면역 등 건강 위험이 있을 수 있어요.' }
  if (bmi < 23) return { label: '정상', tone: 'text-emerald-700 dark:text-emerald-300', note: '현재 정상 범위예요. 꾸준한 식이·운동으로 유지하세요.' }
  if (bmi < 25) return { label: '비만 전단계(과체중)', tone: 'text-amber-700 dark:text-amber-300', note: '체중 관리(식이·운동)가 당뇨·고혈압·이상지질혈증 위험을 낮추는 데 도움이 돼요.' }
  if (bmi < 30) return { label: '1단계 비만', tone: 'text-rose-700 dark:text-rose-300', note: '비만은 당뇨·고혈압·이상지질혈증의 주요 위험요인이에요. 표준 관리(식이·운동·필요시 진료)를 권장해요.' }
  return { label: '2단계 이상 비만', tone: 'text-rose-700 dark:text-rose-300', note: '합병증 위험이 높아 전문가 상담을 권합니다. 임의 단식·극단 요법은 피하세요.' }
}

export default function Me() {
  const [age, setAge] = useState('')
  const [manAge, setManAge] = useState('') // 정확한 만 나이(선택) — 좁은 또래 비교용
  const [sex, setSex] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [cleared, setCleared] = useState('')
  function clearRecent() { try { localStorage.removeItem('factdoc_recent') } catch { /* */ } setCleared('최근 검색 기록을 지웠어요.'); setTimeout(() => setCleared(''), 2500) }
  function clearProfile() { try { localStorage.removeItem(KEY) } catch { /* */ } setAge(''); setManAge(''); setSex(''); setHeight(''); setWeight(''); setCleared('내 정보를 초기화했어요.'); setTimeout(() => setCleared(''), 2500) }

  // 로컬 저장(기기에만) 로드/세이브
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || '{}')
      if (p.age) setAge(p.age); if (p.sex) setSex(p.sex); if (p.manAge) setManAge(p.manAge)
      if (p.height) setHeight(p.height); if (p.weight) setWeight(p.weight)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ age, manAge, sex, height, weight })) } catch { /* ignore */ }
  }, [age, manAge, sex, height, weight])

  const h = parseFloat(height)
  const w = parseFloat(weight)
  const bmi = h > 0 && w > 0 ? w / (h / 100) ** 2 : null
  const cat = bmi != null ? bmiCategory(bmi) : null
  const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`)
  // ★좁은 또래 비교 — 정확 만나이 입력 시 그 나이의 표준(질병청 성장도표/병무)과 비교(성장기 1세 차이도 큼).
  const ageNum = parseInt(manAge, 10)
  const ageStd = sex === 'male' && ageNum > 0 ? bodyStandard('M', ageNum, 1) : null
  // 병무청 또래(만19세) 비교 — 정확 만나이가 없을 때의 폴백(남성 10·20대·미선택).
  const mmaAgeOk = age === '' || age === '20대' || age === '10대'
  const mma = !ageStd && sex === 'male' && mmaAgeOk ? compareToMma(h, w) : null

  const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <div>
      <h1 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">내 정보</h1>
      <p className="mt-1.5 text-sm text-slate-500">입력하면 검증 결과에 ‘나에게 맞는 위험 정보’를 더해드려요. (선택 · 이 기기에만 저장)</p>

      <div className="mt-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      {/* 좌측 — 입력 + 기록 관리 */}
      <div className="min-w-0 space-y-3">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-300">연령대</span>
          <select value={age} onChange={(e) => setAge(e.target.value)} className={field}>
            <option value="">선택 안 함</option>
            {AGE_BANDS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">성별</span>
            <select value={sex} onChange={(e) => setSex(e.target.value)} className={field}>
              <option value="">선택 안 함</option>
              <option value="male">남성</option>
              <option value="female">여성</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">만 나이 <span className="text-[11px] text-slate-400">(또래 비교)</span></span>
            <input type="number" inputMode="numeric" value={manAge} onChange={(e) => setManAge(e.target.value)} placeholder="예: 17" className={field} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">키 (cm)</span>
            <input type="number" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="170" className={field} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">몸무게 (kg)</span>
            <input type="number" inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="68" className={field} />
          </label>
        </div>
      </div>

      {/* 기록 관리 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">기록 관리</p>
        <p className="mt-0.5 text-[12px] text-slate-500">이 기기에 저장된 기록을 지웁니다.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={clearRecent} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">🕘 최근 검색 기록 초기화</button>
          <button type="button" onClick={clearProfile} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">내 정보 초기화</button>
        </div>
        {cleared && <p className="mt-2 text-[12px] text-emerald-600 dark:text-emerald-400">✓ {cleared}</p>}
      </div>
      </div>{/* /좌측 컬럼 */}

      {/* 우측 — 위험 정보 + 병무청 또래 비교 */}
      <div className="mt-3 min-w-0 space-y-3 lg:mt-0">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm dark:border-blue-950 dark:bg-blue-950/30">
        <p className="font-medium text-blue-900 dark:text-blue-200">나에게 맞는 위험 정보</p>
        {bmi != null && cat ? (
          <>
            <p className="mt-1 text-blue-800/90 dark:text-blue-200/90">
              BMI <b>{bmi.toFixed(1)}</b> · <span className={cat.tone}>{cat.label}</span>
              {(age || sex) && <span className="text-blue-800/70 dark:text-blue-200/70"> · {age}{age && sex ? ' ' : ''}{sex === 'male' ? '남성' : sex === 'female' ? '여성' : ''}</span>}
            </p>
            <p className="mt-1 text-blue-800/80 dark:text-blue-200/80">{cat.note}</p>
          </>
        ) : (
          <p className="mt-1 text-blue-800/80 dark:text-blue-200/80">키·몸무게를 입력하면 BMI 분류와 맞춤 건강 정보를 볼 수 있어요.</p>
        )}
        <p className="mt-2 text-[11px] text-blue-900/50 dark:text-blue-200/50">※ 인구통계·BMI 참고 정보이며 개인 의료 진단이 아닙니다. 입력값은 서버로 전송되지 않습니다.</p>
      </div>

      {/* ★좁은 또래(만 나이) 신체 비교 — 정확 나이의 질병청 성장도표/병무 표준과 비교(성장기 1세 차이도 큼) */}
      {ageStd && h > 0 && (() => {
        const dH = +(h - ageStd.heightCm).toFixed(1)
        const dW = ageStd.weightKg != null && w > 0 ? +(w - ageStd.weightKg).toFixed(1) : null
        const pos = (delta: number, range: number) => 50 + Math.max(-48, Math.min(48, (delta / range) * 50))
        const Row = ({ label, you, unit, ref, delta, range }: { label: string; you: number; unit: string; ref: number; delta: number; range: number }) => (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">{label}</span>
              <span className="text-slate-900 dark:text-white"><b>{you}{unit}</b> <span className="text-slate-400">· 또래 {ref}{unit} ({fmt(delta)}{unit})</span></span>
            </div>
            <div className="relative mt-1.5 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-slate-400" style={{ left: '50%' }} />
              <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow dark:border-slate-900" style={{ left: `${pos(delta, range)}%` }} />
            </div>
          </div>
        )
        return (
          <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 dark:border-emerald-950 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between">
              <p className="font-medium text-emerald-900 dark:text-emerald-200">또래(만 {ageNum}세 남성) 신체 비교</p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">{ageNum <= 18 ? '질병청 성장도표' : '병무청'}</span>
            </div>
            <p className="mt-1 text-[12px] text-emerald-800/70 dark:text-emerald-200/70">만 {ageStd.age}세 표준 — 키 {ageStd.heightCm}cm{ageStd.weightKg != null ? ` · 몸무게 ${ageStd.weightKg}kg` : ''}</p>
            <Row label="키" you={h} unit="cm" ref={ageStd.heightCm} delta={dH} range={12} />
            {dW != null ? <Row label="몸무게" you={w} unit="kg" ref={ageStd.weightKg!} delta={dW} range={18} /> : (w > 0 && <p className="mt-3 text-[12px] text-emerald-800/70 dark:text-emerald-200/70">※ 만 {ageNum}세 체중 표준은 공식 수치 확보 후 자동 추가될 예정이에요(키만 비교).</p>)}
            <p className="mt-3 text-[11px] text-emerald-900/50 dark:text-emerald-200/50">
              ※ 출처: {ageStd.source}. {ageNum <= 18 ? '소아청소년 성장도표 50백분위(중앙값)' : '병역판정검사 평균'} 기준 ‘또래 비교’이며 개인 의료 진단이 아닙니다. 통계는 자동 갱신돼요.
            </p>
          </div>
        )
      })()}

      {/* 병무청 또래 신체스펙 비교 (남성 · 만나이 미입력 폴백) — 주최기관(병무청) 데이터 */}
      {mma && (() => {
        const pos = (delta: number, range: number) => 50 + Math.max(-48, Math.min(48, (delta / range) * 50))
        const Row = ({ label, you, unit, delta, range, band }: { label: string; you: number; unit: string; delta: number; range: number; band: string }) => (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">{label}</span>
              <span className="text-slate-900 dark:text-white"><b>{you}{unit}</b> <span className="text-slate-400">· 또래 평균 {fmt(delta)}{unit}</span></span>
            </div>
            <div className="relative mt-1.5 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-slate-400" style={{ left: '50%' }} />
              <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-500 shadow dark:border-slate-900" style={{ left: `${pos(delta, range)}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-indigo-600 dark:text-indigo-300">{band}</p>
          </div>
        )
        return (
          <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-950 dark:bg-indigo-950/20">
            <div className="flex items-center justify-between">
              <p className="font-medium text-indigo-900 dark:text-indigo-200">병무청 또래 신체스펙 비교</p>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">병무청 데이터</span>
            </div>
            <p className="mt-1 text-[12px] text-indigo-800/70 dark:text-indigo-200/70">
              또래 평균(병역판정검사 수검자, 주로 19세 남성) — 키 {mma.ref.meanHeight}cm · 몸무게 {mma.ref.meanWeight}kg · BMI {mma.ref.meanBmi}
            </p>
            <Row label="키" you={h} unit="cm" delta={mma.dHeight} range={15} band={mma.heightBand} />
            <Row label="몸무게" you={w} unit="kg" delta={mma.dWeight} range={25} band={mma.weightBand} />
            <p className="mt-3 text-[12px] text-indigo-800/80 dark:text-indigo-200/80">
              BMI <b>{mma.bmi}</b> — 또래 평균({mma.ref.meanBmi})보다 {fmt(mma.dBmi)}
            </p>
            <p className="mt-2 text-[11px] text-indigo-900/50 dark:text-indigo-200/50">
              ※ 출처: {mma.ref.source}. 병역판정검사는 사실상 남성 대상이라 여성에는 표시하지 않아요. 또래 평균과의 ‘비교 참고’이며 개인 의료 진단이 아닙니다.
            </p>
          </div>
        )
      })()}
      </div>{/* /우측 컬럼 */}
      </div>{/* /그리드 */}

      <p className="mt-5 text-center text-[11px] text-slate-400">
        본 서비스는 의료 진단이 아니며 참고용입니다 · 출처 질병관리청 · 식품의약품안전처 · 병무청
      </p>
    </div>
  )
}
