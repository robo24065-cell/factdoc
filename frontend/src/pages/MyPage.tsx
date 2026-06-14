import { useState } from 'react'

const AGE_BANDS = ['10대', '20대', '30대', '40대', '50대', '60대', '70대 이상']

export default function MyPage() {
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')

  const h = parseFloat(height)
  const w = parseFloat(weight)
  const bmi = h > 0 && w > 0 ? w / (h / 100) ** 2 : null

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-medium text-slate-900 dark:text-white">마이페이지 (선택 입력)</h1>
      <p className="mt-1 text-sm text-slate-500">
        입력 정보로 판정 결과에 KNHANES 통계 기반 ‘맞춤 위험맥락’을 더합니다. 개인 진단이 아니며, 정보는 브라우저에만 보관됩니다.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-slate-700 dark:text-slate-300">연령대</span>
          <select
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">선택 안 함</option>
            {AGE_BANDS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="text-slate-700 dark:text-slate-300">성별</span>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">선택 안 함</option>
            <option value="male">남성</option>
            <option value="female">여성</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="text-slate-700 dark:text-slate-300">키 (cm)</span>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder="예: 170"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>

        <label className="text-sm">
          <span className="text-slate-700 dark:text-slate-300">몸무게 (kg)</span>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="예: 68"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-800/50">
        <p className="font-medium text-slate-700 dark:text-slate-200">맞춤 위험맥락 (미리보기)</p>
        {bmi !== null ? (
          <p className="mt-1 text-slate-500">
            BMI {bmi.toFixed(1)} · {age || '연령 미입력'} {sex === 'male' ? '남성' : sex === 'female' ? '여성' : ''} — 판정 시 해당
            집단의 KNHANES 유병률·관리율 맥락이 결과 카드에 함께 표시됩니다.
          </p>
        ) : (
          <p className="mt-1 text-slate-500">키·몸무게를 입력하면 BMI와 맞춤 맥락 미리보기가 표시됩니다.</p>
        )}
        <p className="mt-2 text-xs text-slate-400">※ 인구통계 ‘맥락’ 정보이며 개인 의료 진단이 아닙니다.</p>
      </div>
    </div>
  )
}
