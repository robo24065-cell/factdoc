import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchDiseaseFakeClaims, fetchDiseaseInfo, type DiseaseFakeClaim, type DiseaseSection } from '../lib/db'
import { eidDiseaseLatest } from '../lib/eidStats'
import { preventionHint } from '../lib/prevention'
import { variantsOf } from '../engine/ontology'
import { findInText, symptomsFor } from '../engine'
import Highlight from '../components/Highlight'

export default function Disease() {
  const { name = '' } = useParams()
  const [sections, setSections] = useState<DiseaseSection[] | null>(null)
  const [fakes, setFakes] = useState<DiseaseFakeClaim[]>([])

  useEffect(() => {
    fetchDiseaseInfo(name).then(setSections)
    fetchDiseaseFakeClaims(name).then(setFakes)
  }, [name])

  // 발생 현황 — 질병청 감염병포털 EDW 최신 주차(2026 현재) 기준 최근 4주(옛 Supabase 2024 테이블 대체)
  const latest = eidDiseaseLatest(name)
  const cards = (sections ?? []).filter((s) => s.text && s.text.length > 40).slice(0, 6)

  return (
    <div>
      <Link to="/trending" className="text-sm text-slate-400">← 유행</Link>
      <h1 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">{name}</h1>

      {latest && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="font-medium text-slate-800 dark:text-slate-100">발생 현황</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">{latest.year}년 {latest.week}주차</span>
          </div>
          <p className="mt-1 text-slate-500">
            최근 4주 <b className="text-slate-700 dark:text-slate-200">{latest.count.toLocaleString()}건</b> · 직전 4주 대비{' '}
            <span className={latest.trend === 'up' ? 'text-rose-500' : latest.trend === 'down' ? 'text-blue-500' : 'text-slate-400'}>
              {latest.pct > 0 ? `▲ ${latest.pct}%` : latest.pct < 0 ? `▼ ${Math.abs(latest.pct)}%` : '유지'}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-slate-400">출처: 질병관리청 감염병포털(전수신고 발생현황)</p>
        </div>
      )}

      {(() => { const sx = symptomsFor(findInText(name, 'disease')?.canonical ?? name); return sx && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">🩺 주요 증상 (자가 참고용)</p>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {sx.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />{s}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-slate-400">진단이 아니에요. 증상이 의심되면 의료기관에서 확인하세요.</p>
        </div>
      ); })()}

      {/* §13.10a 퍼널: 이 질병 관련 가짜정보 먼저 → 탭하면 검증 */}
      {fakes.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">⚠️ 이 질병 관련 가짜정보</h2>
          <div className="mt-2 space-y-2">
            {fakes.map((f, i) => (
              <Link key={i} to={`/?q=${encodeURIComponent(f.claim)}`}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${f.verdict === 'false' ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40'}`}>
                  {f.verdict === 'false' ? '허위' : '과장'}
                </span>
                <span className="flex-1 truncate text-sm text-slate-800 dark:text-slate-100">{f.claim}</span>
                <span className="text-slate-300">›</span>
              </Link>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">탭하면 근거와 함께 검증 결과를 볼 수 있어요.</p>
        </div>
      )}

      <h2 className="mt-5 text-sm font-medium text-slate-700 dark:text-slate-200">📘 질병청 공식 정보</h2>
      {sections === null ? (
        <p className="mt-4 text-sm text-slate-400">불러오는 중…</p>
      ) : cards.length > 0 ? (
        <div className="mt-3 space-y-2">
          {cards.map((s, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              {s.section && <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{s.section}</p>}
              <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200"><Highlight text={s.text} terms={[name, ...variantsOf(name)]} /></p>
              {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-blue-600 dark:text-blue-400">원문 보기 →</a>}
            </div>
          ))}
          <p className="text-center text-[11px] text-slate-400">출처: 질병관리청 국가건강정보포털</p>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          {preventionHint(name) && <p className="text-slate-700 dark:text-slate-200">예방: {preventionHint(name)}</p>}
          <p className="mt-2 text-slate-500">이 질병의 공식 상세 정보(증상·예방·치료)는 질병관리청 국가건강정보포털에서 확인할 수 있어요.</p>
          <a href="https://health.kdca.go.kr" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-blue-600 dark:text-blue-400">
            질병관리청 국가건강정보포털 →
          </a>
        </div>
      )}

      <Link to="/" className="mt-5 block rounded-xl bg-blue-600 py-3.5 text-center text-base font-semibold text-white">
        이 주제 가짜정보 검증하기
      </Link>
      <p className="mt-3 text-center text-[11px] text-slate-400">본 정보는 의료 진단이 아니며 참고용입니다.</p>
    </div>
  )
}
