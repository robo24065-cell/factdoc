// 전문용어 [?] 툴팁 — 클릭 토글 팝오버. 관리자·현황판의 전문용어(CRE·병원체보유자·κ 등) 설명.
// 바깥 클릭으로 닫힘. term으로 용어집 조회하거나 children으로 직접 설명 전달.
import { useEffect, useRef, useState } from 'react'

export const GLOSSARY: Record<string, { label: string; desc: string }> = {
  CRE: { label: 'CRE (카바페넴내성장내세균)', desc: '최후 항생제 계열인 카바페넴에 내성을 가진 장내세균. 치료가 매우 어려운 의료관련감염으로 질병관리청 2급 법정감염병입니다.' },
  병원체보유자: { label: '병원체보유자', desc: '증상은 없지만 몸에 병원체를 지녀 전파가 가능한 상태. 증상이 나타난 ‘환자’와 구분됩니다.' },
  발생률: { label: '발생률 (10만 명당)', desc: '인구 10만 명당 환자 수. 인구 규모가 다른 지역·집단의 유행 강도를 공정하게 비교하기 위한 지표입니다.' },
  발생수: { label: '발생 수', desc: '신고된 환자(또는 병원체보유자)의 절대 건수.' },
  전수신고: { label: '전수신고', desc: '진단 즉시 모든 사례를 보건당국에 신고하는 법정감염병 감시 방식(일부만 표본으로 보는 표본감시와 대비).' },
  잠정치: { label: '잠정치', desc: '신고가 계속 들어오는 중이어서 이후 보정될 수 있는 임시 수치. 진행 중인 연도·최근 주차에 해당합니다.' },
  법정감염병급: { label: '법정감염병 급(1~4급)', desc: '위험도·신고 시한에 따른 분류. 1급=즉시 신고·음압격리(에볼라 등), 2급=24시간 내 신고, 3급=발생 감시, 4급=표본감시.' },
  인용정확도: { label: '인용 정확도', desc: '판정에 단 공식 출처에 실제로 그 근거가 존재하는 비율. 엉뚱한 출처를 달면 감점됩니다.' },
  환각률: { label: '환각률', desc: '근거 없이 지어낸 내용이 답변에 섞인 비율. 낮을수록 신뢰할 수 있습니다.' },
  카파: { label: 'κ (코헨 카파)', desc: '두 평가자의 라벨이 우연 일치를 보정하고도 얼마나 일치하는지 나타내는 신뢰도 지표(1에 가까울수록 일치). 0.6 이상이면 양호로 봅니다.' },
  트리플: { label: '근거 트리플', desc: '(주체 — 관계 — 대상질환) 형태로 구조화한 주장·근거의 최소 단위. 판정 엔진이 이 단위로 매칭합니다.' },
  검증완료: { label: '검증완료', desc: '사람이 직접 확인해 승격한 판정. 기본 상태는 ‘자동·미검증’이며, 스팟체크 후 승격합니다.' },
  보류: { label: '공식근거 없음(보류)', desc: '대조할 공식 근거가 코퍼스에 없어 판정을 보류한 결과. 시스템 실패가 아니라 정직한 1급 결과입니다.' },
  부실의심: { label: '부실 의심', desc: '사용자가 👎 불만족을 누른 답변을 AI·규칙이 1차 검토해 ‘부실 가능성 있음’으로 분류한 항목.' },
}

export default function InfoTip({ term, label, children, className = '' }: { term?: keyof typeof GLOSSARY | string; label?: string; children?: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const entry = term ? GLOSSARY[term] : undefined
  const head = label ?? entry?.label
  const body = children ?? entry?.desc ?? ''
  return (
    <span ref={ref} className={`relative inline-block align-middle ${className}`}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} aria-label="용어 설명"
        className={`ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] font-bold leading-none transition ${open ? 'border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-950/50' : 'border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 dark:border-slate-600'}`}>?</button>
      {open && (
        <span className="absolute left-1/2 top-5 z-[70] block w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-[11px] font-normal leading-relaxed text-slate-600 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {head && <b className="mb-0.5 block text-slate-800 dark:text-slate-100">{head}</b>}
          {body}
        </span>
      )}
    </span>
  )
}
