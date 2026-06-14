import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchDiseaseInfo, fetchOutbreak, type DiseaseSection, type OutbreakRow } from '../lib/db'
import { preventionHint } from '../lib/prevention'

export default function Disease() {
  const { name = '' } = useParams()
  const [sections, setSections] = useState<DiseaseSection[] | null>(null)
  const [outbreak, setOutbreak] = useState<OutbreakRow | null>(null)

  useEffect(() => {
    fetchDiseaseInfo(name).then(setSections)
    fetchOutbreak().then((rows) =>
      setOutbreak(rows?.find((r) => r.disease.includes(name) || name.includes(r.disease)) ?? null),
    )
  }, [name])

  const cards = (sections ?? []).filter((s) => s.text && s.text.length > 40).slice(0, 6)

  return (
    <div>
      <Link to="/trending" className="text-sm text-slate-400">← 유행</Link>
      <h1 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">{name}</h1>

      {outbreak && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="font-medium text-slate-800 dark:text-slate-100">발생 현황</p>
          <p className="mt-1 text-slate-500">
            {outbreak.period} 기준 {(outbreak.case_count ?? 0).toLocaleString()}건 (
            {outbreak.trend === 'up' ? '증가' : outbreak.trend === 'down' ? '감소' : '유지'})
          </p>
          <p className="mt-1 text-[11px] text-slate-400">출처: 질병관리청 감염병포털</p>
        </div>
      )}

      {sections === null ? (
        <p className="mt-4 text-sm text-slate-400">불러오는 중…</p>
      ) : cards.length > 0 ? (
        <div className="mt-3 space-y-2">
          {cards.map((s, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              {s.section && <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{s.section}</p>}
              <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{s.text}</p>
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
