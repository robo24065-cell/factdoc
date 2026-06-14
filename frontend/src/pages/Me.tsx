import { useState } from 'react'

const AGE_BANDS = ['10대', '20대', '30대', '40대', '50대', '60대', '70대 이상']

export default function Me() {
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')

  const h = parseFloat(height)
  const w = parseFloat(weight)
  const bmi = h > 0 && w > 0 ? w / (h / 100) ** 2 : null

  const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <div>
      <h1 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">내 정보</h1>
      <p className="mt-1.5 text-sm text-slate-500">입력하면 검증 결과에 ‘나에게 맞는 위험 정보’를 더해드려요. (선택 · 기기에만 저장)</p>

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
        {bmi != null ? (
          <p className="mt-1 text-blue-800/80 dark:text-blue-200/80">
            BMI {bmi.toFixed(1)} · {age || '연령 미입력'} {sex === 'male' ? '남성' : sex === 'female' ? '여성' : ''} — 검증할 때 해당 집단의 질병청 통계(유병률 등)를 함께 보여드려요.
          </p>
        ) : (
          <p className="mt-1 text-blue-800/80 dark:text-blue-200/80">키·몸무게를 입력하면 BMI와 맞춤 정보를 미리 볼 수 있어요.</p>
        )}
        <p className="mt-2 text-[11px] text-blue-900/50 dark:text-blue-200/50">※ 인구통계 참고 정보이며 개인 의료 진단이 아닙니다.</p>
      </div>

      <p className="mt-5 text-center text-[11px] text-slate-400">
        본 서비스는 의료 진단이 아니며 참고용입니다 · 출처 질병관리청 · 식품의약품안전처
      </p>
    </div>
  )
}
