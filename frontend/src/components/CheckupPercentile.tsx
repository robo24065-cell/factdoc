// 건강검진 수치 → 또래(연령·성별) 분포 백분위 카드. KOSIS 도수분포(checkup-dist) 기반. PII 미전송(로컬 계산)·진단 아님.
import { useState } from 'react'
import { percentile, metabolicSyndrome, CHECKUP_INPUTS, type Sex } from '../lib/checkup'
import { CHECKUP_YEAR as YEAR } from '../data/checkup-dist'

const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

export default function CheckupPercentile({ age, sex }: { age: number; sex: Sex | '' }) {
  const [vals, setVals] = useState<Record<string, string>>({})
  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }))
  const ready = age > 0 && (sex === 'M' || sex === 'F')

  if (!ready) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4 text-sm dark:border-violet-950 dark:bg-violet-950/20">
        <p className="font-medium text-violet-900 dark:text-violet-200">🧪 내 건강검진 수치, 또래 중 어디쯤?</p>
        <p className="mt-1 text-[13px] text-violet-800/80 dark:text-violet-200/80">위에서 <b>만 나이·성별</b>을 입력하면, 건강검진 수치(혈압·혈당·콜레스테롤 등)를 또래 분포의 백분위로 보여드려요. (국민건강보험 건강검진통계 {YEAR})</p>
      </div>
    )
  }

  const num = (k: string) => { const n = parseFloat(vals[k]); return Number.isFinite(n) && n > 0 ? n : undefined }
  const results = CHECKUP_INPUTS.map((inp) => ({ inp, r: num(inp.key) != null ? percentile(inp.key, age, sex as Sex, num(inp.key)!) : null }))
  const anyVal = results.some((x) => x.r)
  const met = metabolicSyndrome(sex as Sex, { waist: num('waist'), sbp: num('sbp'), dbp: num('dbp'), fbs: num('fbs'), hdl: num('hdl'), tg: num('tg') })

  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 dark:border-violet-950 dark:bg-violet-950/20">
      <div className="flex items-center justify-between">
        <p className="font-medium text-violet-900 dark:text-violet-200">🧪 내 검진수치 또래 비교</p>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">건강검진통계 {YEAR}</span>
      </div>
      <p className="mt-1 text-[12px] text-violet-800/70 dark:text-violet-200/70">최근 검진 수치를 입력하면 <b>같은 연령·성별 또래 분포</b>에서 내 위치(백분위)를 보여드려요. (아는 것만 입력 · 서버 전송 없음)</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CHECKUP_INPUTS.map((inp) => (
          <label key={inp.key} className="block text-[13px]">
            <span className="text-slate-600 dark:text-slate-300">{inp.label} <span className="text-slate-400">{inp.unit}</span></span>
            <input type="number" inputMode="decimal" value={vals[inp.key] ?? ''} onChange={(e) => set(inp.key, e.target.value)} placeholder={inp.placeholder} className={field} />
          </label>
        ))}
      </div>

      {anyVal && (
        <div className="mt-4 space-y-3">
          {results.filter((x) => x.r).map(({ r }) => {
            const pr = r!
            const pos = Math.round(pr.point * 100)
            const worse = Math.round(pr.worsePct * 100)
            return (
              <div key={pr.key}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="text-slate-700 dark:text-slate-200">{pr.label} <b>{pr.value}{pr.unit}</b></span>
                  <span className={pr.flagged ? 'font-semibold text-rose-600' : 'text-slate-500'}>
                    또래 {pr.worseSide} {worse}%{pr.flagged ? ` · ${pr.cutLabel}` : ''}
                  </span>
                </div>
                {/* 분포 막대: 0(낮음)~100(높음) 위치 */}
                <div className="relative mt-1 h-2.5 rounded-full bg-gradient-to-r from-emerald-200 via-amber-200 to-rose-300 dark:from-emerald-900/40 dark:via-amber-900/40 dark:to-rose-900/40">
                  <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow dark:border-slate-900" style={{ left: `${Math.max(2, Math.min(98, pos))}%`, background: pr.flagged ? '#e11d48' : '#7c3aed' }} />
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">또래 {pr.band} {pr.sexLabel} 중 낮은 쪽에서 {pos}% 지점 · {pr.binLabel} 구간</p>
              </div>
            )
          })}

          {/* 대사증후군 종합 */}
          {met.total >= 3 && (
            <div className={`mt-2 rounded-xl p-3 text-[13px] ${met.risk ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}`}>
              <p className={`font-semibold ${met.risk ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                🩺 대사증후군 진단기준 {met.metCount}/{met.total}개 충족 {met.risk ? '— 위험(3개 이상)' : '— 현재 기준 미만'}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {met.items.map((it) => (
                  <span key={it.label} className={`rounded px-1.5 py-0.5 text-[11px] ${it.met ? 'bg-rose-200 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{it.label} {it.met ? '✓' : '·'} <span className="opacity-70">{it.note}</span></span>
                ))}
              </p>
              {met.risk && <p className="mt-1.5 text-[12px] text-rose-800/80 dark:text-rose-200/80">대사증후군은 당뇨·심뇌혈관질환 위험을 크게 높여요. ‘약 평생복용은 거짓’ 같은 가짜정보에 흔들리지 말고 정기검진·생활습관 관리와 전문가 상담을 권합니다.</p>}
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-violet-900/50 dark:text-violet-200/50">
        ※ 출처: 국민건강보험공단 건강검진통계({YEAR}, KOSIS). 또래 분포 백분위는 참고용이며 개인 의료 진단이 아닙니다. 입력값은 서버로 전송되지 않습니다.
      </p>
    </div>
  )
}
