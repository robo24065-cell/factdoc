// 감염병·가짜정보 예보(프리벙킹) — 시민용. 급증 감염병 → 곧 퍼질 가짜정보 미리 알기 + 질병청 공식 사실 + 공유.
// 사후검증(팩트체크)을 넘어선 '사전예방'. S1 전략의 사용자 대면 구현.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { prebunkRows, fakeClaimHint, officialFacts, prebunkDraft } from '../lib/prebunk'

export default function Forecast() {
  const { week, rows } = prebunkRows(6)
  const [open, setOpen] = useState<string | null>(rows[0]?.name ?? null)
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (name: string) => { try { await navigator.clipboard.writeText(prebunkDraft(name)); setCopied(name); setTimeout(() => setCopied(null), 2000) } catch { /* */ } }

  return (
    <div>
      <h1 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">감염병·가짜정보 예보 🛰</h1>
      <p className="mt-1.5 text-sm text-slate-500">감염병이 급증하면 <b className="text-slate-700 dark:text-slate-200">곧 관련 가짜정보가 따라 퍼져요.</b> 터지기 전에 미리 알고 대비하세요.</p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          지금은 급증 신호가 잡힌 감염병이 없어요. 질병관리청 전수신고 데이터 기준으로 자동 갱신됩니다.
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-[13px] leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            💡 아래는 <b>최근 4주 발생이 빠르게 늘고 있는 감염병</b>이에요({week}주차 기준). 각 항목에서 <b>곧 퍼질 수 있는 가짜정보</b>와 <b>질병청 공식 사실</b>을 함께 확인하고, 주변에 공유해 미리 막아주세요.
          </div>

          <div className="mt-4 space-y-2.5">
            {rows.map((r) => {
              const isOpen = open === r.name
              const facts = officialFacts(r.name)
              return (
                <div key={r.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <button onClick={() => setOpen(isOpen ? null : r.name)} className="flex w-full items-center gap-2.5 p-4 text-left">
                    <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">급증</span>
                    <span className="flex-1 truncate font-medium text-slate-900 dark:text-white">{r.name}</span>
                    <span className="shrink-0 text-sm font-bold text-rose-600">▲{r.growthPct >= 999 ? '신규' : `${r.growthPct}%`}</span>
                    <span className="shrink-0 text-slate-400 transition" style={{ transform: isOpen ? 'rotate(180deg)' : '' }}>▾</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-800">
                      {/* 곧 퍼질 가짜정보 경고 */}
                      <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/30">
                        <p className="text-[13px] font-semibold text-rose-700 dark:text-rose-300">⚠ 이런 가짜정보를 조심하세요</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-rose-800/90 dark:text-rose-200/90">{fakeClaimHint(r.name)}</p>
                      </div>
                      {/* 질병청 공식 사실 */}
                      <div className="mt-2.5 rounded-xl bg-blue-50 p-3 dark:bg-blue-950/30">
                        <p className="text-[13px] font-semibold text-blue-800 dark:text-blue-200">✅ 질병관리청 공식 사실</p>
                        {facts.symptoms.length > 0 && (
                          <p className="mt-1 text-[13px] leading-relaxed text-blue-900/90 dark:text-blue-100/90"><b>주요 증상</b> · {facts.symptoms.join(', ')}</p>
                        )}
                        <p className="mt-0.5 text-[13px] leading-relaxed text-blue-900/90 dark:text-blue-100/90"><b>예방·수칙</b> · {facts.prevention}</p>
                        <p className="mt-1.5 text-[11px] text-blue-700/60 dark:text-blue-300/60">출처: 질병관리청 국가건강정보포털·감염병포털 · 참고용(의료 진단 아님)</p>
                      </div>
                      {/* 액션 */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link to={`/?q=${encodeURIComponent(`${r.name}에 좋은 민간요법이 있나요`)}`} className="rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white active:scale-95">관련 가짜정보 검증하기</Link>
                        <button onClick={() => copy(r.name)} className="rounded-lg bg-amber-300 px-3 py-2 text-[13px] font-semibold text-amber-900 active:scale-95">{copied === r.name ? '✓ 복사됨 — 붙여넣어 공유' : '📤 공유 카드 복사'}</button>
                        <Link to={`/disease/${encodeURIComponent(r.name)}`} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">질병 정보 →</Link>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
            질병관리청 전수신고 발생현황의 급증 신호를 선행지표로 한 ‘사전예방(프리벙킹)’ 예보예요. 데이터는 자동 갱신되며, 증상이 의심되면 의료기관·질병관리청(1339)에 문의하세요.
          </p>
        </>
      )}
    </div>
  )
}
