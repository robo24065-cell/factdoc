import { useEffect, useState } from 'react'

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
  const [sex, setSex] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')

  // 로컬 저장(기기에만) 로드/세이브
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || '{}')
      if (p.age) setAge(p.age); if (p.sex) setSex(p.sex)
      if (p.height) setHeight(p.height); if (p.weight) setWeight(p.weight)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ age, sex, height, weight })) } catch { /* ignore */ }
  }, [age, sex, height, weight])

  const h = parseFloat(height)
  const w = parseFloat(weight)
  const bmi = h > 0 && w > 0 ? w / (h / 100) ** 2 : null
  const cat = bmi != null ? bmiCategory(bmi) : null

  const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <div>
      <h1 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">내 정보</h1>
      <p className="mt-1.5 text-sm text-slate-500">입력하면 검증 결과에 ‘나에게 맞는 위험 정보’를 더해드려요. (선택 · 이 기기에만 저장)</p>

      <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-300">연령대</span>
          <select value={age} onChange={(e) => setAge(e.target.value)} className={field}>
            <option value="">선택 안 함</option>
            {AGE_BANDS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-300">성별</span>
          <select value={sex} onChange={(e) => setSex(e.target.value)} className={field}>
            <option value="">선택 안 함</option>
            <option value="male">남성</option>
            <option value="female">여성</option>
          </select>
        </label>
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

      <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm dark:border-blue-950 dark:bg-blue-950/30">
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

      <p className="mt-5 text-center text-[11px] text-slate-400">
        본 서비스는 의료 진단이 아니며 참고용입니다 · 출처 질병관리청 · 식품의약품안전처
      </p>
    </div>
  )
}
