const PANELS = [
  { title: '클레임그래프', desc: '주장 → 트리플 → 룰·근거 연결 구조 시각화 (구조 가시화)' },
  { title: '트렌드 레이더 · 주간 가짜정보 TOP 10', desc: '질문 로그 군집화 (B2G·언론용 산출물)' },
  { title: '판정 분포 · 인용정확도 · 환각률', desc: '평가 수치 가시화 (AI 성능 검증)' },
  { title: '질병청 통계', desc: '연령·성별 유병률 등 KNHANES·만성질환통계 viz' },
  { title: '🚨 실시간 유행/주의 감염병 트렌드', desc: '감염병포털 — 클릭 시 가짜뉴스 팩트체크 + 질병청 공식 증상·예방 카드' },
]

export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-medium text-slate-900 dark:text-white">대시보드</h1>
      <p className="mt-1 text-sm text-slate-500">반응형 레이아웃 — PC 3열 · 태블릿 2열 · 모바일 1열</p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PANELS.map((p) => (
          <section
            key={p.title}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-base font-medium text-slate-900 dark:text-white">{p.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{p.desc}</p>
            <div className="mt-3 flex h-28 items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400 dark:bg-slate-800/50">
              데이터 연결 예정
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
