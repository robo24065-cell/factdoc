import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { classifyIntent, explainLocal, judge, parseClaim, type Judgement, type Verdict } from '../engine'
import { mergeTriples } from '../engine/fromRaw'
import { geminiTriples } from '../lib/parseRemote'
import { logQuery } from '../lib/db'
import { getCachedVerdict, getSemanticCachedVerdict, cacheVerdict } from '../lib/cache'
import { embedText } from '../lib/embed'
import { searchEvidence, type EvidenceChunk } from '../lib/search'
import { fetchDiseaseSections, explainDiseaseInfo, type InfoAnswer } from '../lib/info'
import { explainVerdict } from '../lib/explain'
import WhyTrace from '../components/WhyTrace'

const VUI: Record<Verdict, { label: string; sub: string; text: string; bg: string; accent: string }> = {
  true: { label: '사실이에요', sub: '국가 공식 근거와 일치해요', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/30', accent: 'bg-emerald-500' },
  partial: { label: '일부만 맞아요', sub: '과장되었거나 조건이 빠졌어요', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/30', accent: 'bg-amber-500' },
  false: { label: '사실이 아니에요', sub: '국가 공식 근거와 달라요', text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-950/30', accent: 'bg-rose-500' },
  unverified: { label: '확인이 어려워요', sub: '공식 데이터에 근거가 없어요', text: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800/60', accent: 'bg-slate-400' },
}

const EXAMPLES = ['당뇨는 △△즙으로 완치된대요', '설탕 많이 먹으면 당뇨 걸리나요', '뎅기열이 뭔가요?', 'E형 간염이 뭔가요?']

// 트리플에서 관련성 필터용 용어(질병·주체) 추출
function termsOf(triples: { subject: string; objectDisease: string }[]): string[] {
  return [...new Set(triples.flatMap((t) => [t.objectDisease, t.subject]).filter((x) => x && x !== '(미상)'))]
}
// 스니펫 정리: 선행 "[섹션]" 라벨 제거 + 문장경계로 자연스럽게 절단
function cleanSnippet(text: string, max = 180): string {
  let s = text.replace(/^\s*\[[^\]]+\]\s*/, '').trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('다.'), cut.lastIndexOf('요.'))
  s = lastEnd > max * 0.5 ? cut.slice(0, lastEnd + 1) : cut.trimEnd() + '…'
  return s
}

export default function Home() {
  const [params] = useSearchParams()
  const [input, setInput] = useState('')
  const [result, setResult] = useState<Judgement | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [hitKind, setHitKind] = useState<'exact' | 'semantic' | null>(null)
  const [evidence, setEvidence] = useState<EvidenceChunk[]>([])
  const [info, setInfo] = useState<InfoAnswer | null>(null)
  const [infoSummarizing, setInfoSummarizing] = useState(false)
  const [loading, setLoading] = useState(false)

  async function check(text: string) {
    const claim = text.trim()
    if (!claim) return
    setLoading(true); setExplanation(null); setExplaining(false); setEvidence([]); setHitKind(null)
    setInfo(null); setInfoSummarizing(false); setResult(null)

    // 0) 의도 분류 — "X가 뭔가요/증상/예방" 정보질문이면 공식정보로 바로 응답(판정 아님)
    const intent = classifyIntent(claim)
    if (intent.intent === 'info' && intent.disease) {
      const disease = intent.disease
      const sections = await fetchDiseaseSections(disease) // ① 공식 발췌 먼저
      setInfo({ disease, summary: '', sections, hasOfficial: sections.length > 0 })
      setLoading(false); setInfoSummarizing(true)
      void logQuery(claim, 'unverified', 'info')
      const summary = await explainDiseaseInfo(disease, sections) // ② 요약 채움
      setInfo((prev) => (prev && prev.disease === disease ? { ...prev, summary } : prev))
      setInfoSummarizing(false)
      return
    }

    // 1) 정확 일치 캐시(무료·즉시)
    const cached = await getCachedVerdict(claim)
    if (cached) {
      setResult(cached.judgement); setHitKind('exact')
      setExplanation(cached.explanation ?? explainLocal(cached.judgement)); setLoading(false)
      return // 캐시 히트(중복 질문)는 로그/집계/AI호출 안 함
    }

    // 2) 임베딩 1회 → 의미 캐시(유사 질문) + 하이브리드 근거검색에 재사용
    const vec = await embedText(claim)
    if (vec) {
      const sem = await getSemanticCachedVerdict(claim, vec)
      if (sem) {
        setResult(sem.judgement); setHitKind('semantic')
        setExplanation(sem.explanation ?? explainLocal(sem.judgement)); setLoading(false)
        if (vec) searchEvidence(claim, vec, 3, termsOf(parseClaim(claim))).then(setEvidence)
        return
      }
    }

    // 3) 미스 → 규칙 파서 + Gemini 파서 결합 → 룰·그래프 판정
    const triples = mergeTriples(parseClaim(claim), await geminiTriples(claim))
    const j = judge(triples, claim)
    // 결정론 설명문 즉시 표시(LLM 없어도 항상 진짜 답) → Gemini 되면 더 자연스럽게 교체
    const local = explainLocal(j)
    setResult(j); setHitKind(null); setLoading(false); setExplanation(local)
    void logQuery(claim, j.verdict)

    // 4) 하이브리드 근거검색(관련 공식 자료) — 임베딩 재사용 + 주장 용어로 관련성 필터
    if (vec) searchEvidence(claim, vec, 3, termsOf(j.triples)).then(setEvidence)

    // 5) AI 설명문(되면 교체, 다운/쿼터소진이면 로컬 유지) → 캐시 저장
    setExplaining(true)
    const exp = await explainVerdict(claim, j)
    if (exp) setExplanation(exp)
    setExplaining(false)
    void cacheVerdict(claim, j, exp || local, vec)
  }

  useEffect(() => {
    const q = params.get('q')
    if (q) { setInput(q); void check(q) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  function share() {
    if (!result) return
    const text = `[FactDoc] "${result.claimText}" → ${VUI[result.verdict].label}\n${explanation ?? '국가 공식데이터로 확인했어요.'}`
    if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ text }).catch(() => {})
    else navigator.clipboard?.writeText(text).catch(() => {})
  }

  const vui = result ? VUI[result.verdict] : null
  const steps = result ? result.trace.filter((s) => s.outcome && s.kind !== 'normalize') : []

  return (
    <div>
      <h1 className="mt-2 text-[22px] font-semibold leading-snug text-slate-900 dark:text-white">건강 정보,<br />진짜일까요?</h1>
      <p className="mt-1.5 text-sm text-slate-500">TV·유튜브·단톡방에서 본 건강 주장을 검증하거나, 궁금한 질병·증상 정보를 물어보세요. 국가 공식 데이터로 답해드려요.</p>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="예: 설탕 많이 먹으면 당뇨 걸리나요?"
          className="w-full resize-none rounded-xl bg-transparent p-2 text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
        />
        <button
          type="button"
          onClick={() => check(input)}
          disabled={!input.trim() || loading}
          className="mt-1 w-full rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
        >
          {loading ? '확인 중…' : '확인하기'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => { setInput(ex); check(ex) }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            {ex}
          </button>
        ))}
      </div>

      {/* 정보질문 응답 카드 (질병청 공식 정보) */}
      {info && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 bg-blue-50 p-4 dark:bg-blue-950/30">
            <div className="h-11 w-1.5 rounded-full bg-blue-500" />
            <div>
              <p className="text-lg font-semibold text-blue-700 dark:text-blue-300">{info.disease}</p>
              <p className="text-xs text-slate-500">질병관리청 공식 건강정보</p>
            </div>
            <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">정보</span>
          </div>
          <div className="p-4">
            {info.summary ? (
              <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{info.summary}</p>
            ) : infoSummarizing ? (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                질병청 공식 정보를 정리 중…
              </p>
            ) : info.hasOfficial ? (
              <p className="text-sm text-slate-500">아래 질병관리청 공식 자료를 확인하세요.</p>
            ) : null}

            {info.sections.length > 0 && (
              <details className="group mt-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  📚 공식 자료 {info.sections.length}건
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <ul className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
                  {info.sections.map((s, i) => (
                    <li key={i} className="text-sm">
                      {s.section && <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{s.section}</span>}
                      <p className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300">{s.text.length > 180 ? `${s.text.slice(0, 180)}…` : s.text}</p>
                      {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline dark:text-blue-400">원문 →</a>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {!info.hasOfficial && (
              <p className="mt-3 text-sm text-slate-500">
                이 주제의 상세·최신 공식 정보는 질병관리청 국가건강정보포털에서 확인하실 수 있어요.
              </p>
            )}

            <a href="https://health.kdca.go.kr" target="_blank" rel="noreferrer"
              className="mt-3 inline-block text-sm font-medium text-blue-600 dark:text-blue-400">
              질병관리청 국가건강정보포털에서 더 보기 →
            </a>

            <Link to={`/disease/${encodeURIComponent(info.disease)}`}
              className="mt-4 block rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white active:scale-[0.99]">
              이 주제 관련 가짜정보도 확인하기
            </Link>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              본 정보는 의료 진단이 아니며 참고용입니다. 증상이 의심되면 전문가와 상담하세요.
            </p>
          </div>
        </div>
      )}

      {result && vui && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className={`flex items-center gap-3 p-4 ${vui.bg}`}>
            <div className={`h-11 w-1.5 rounded-full ${vui.accent}`} />
            <div>
              <p className={`text-lg font-semibold ${vui.text}`}>{vui.label}</p>
              <p className="text-xs text-slate-500">{vui.sub}</p>
            </div>
            {hitKind && (
              <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">
                {hitKind === 'semantic' ? '유사 질문 매칭' : '빠른 응답'}
              </span>
            )}
          </div>

          <div className="p-4">
            {/* AI 설명 (주된 답) */}
            {explanation ? (
              <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{explanation}</p>
            ) : explaining ? (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                AI가 쉽게 설명을 작성 중…
              </p>
            ) : (
              <p className="text-sm text-slate-500">{result.disclaimer}</p>
            )}

            <p className="mt-3 text-xs text-slate-400">입력한 내용: “{result.claimText}”</p>

            {result.warning && (
              <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">⚠ {result.warning}</div>
            )}

            {result.citations.length > 0 && (
              <details className="group mt-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  📚 공식 출처 {result.citations.length}곳
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <ul className="space-y-1 border-t border-slate-100 p-3 text-sm dark:border-slate-800">
                  {result.citations.map((c, i) => (
                    <li key={i}>
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{c.portal} — {c.title}</a>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {evidence.length > 0 && (
              <details className="group mt-2 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  🔎 이 주제 관련 공식 자료 {evidence.length}건
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <ul className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
                  {evidence.map((e, i) => (
                    <li key={i} className="text-sm">
                      {e.section && <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{e.section}</span>}
                      <p className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300">{cleanSnippet(e.text)}</p>
                      <span className="text-[11px] text-slate-400">
                        {e.portal || '질병관리청'}
                        {e.url && (<> · <a href={e.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">원문 →</a></>)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="px-3 pb-3 text-[11px] text-slate-400">하이브리드 검색(의미+키워드)으로 찾은 관련 공식 자료입니다. 판정 근거와는 별개의 참고 정보예요.</p>
              </details>
            )}

            {steps.length > 0 && (
              <details className="group mt-2 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-xs font-medium text-slate-500 [&::-webkit-details-marker]:hidden">
                  🧭 판정 과정 보기 (룰·근거 추적)
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <div className="border-t border-slate-100 p-3 dark:border-slate-800">
                  <WhyTrace j={result} />
                </div>
              </details>
            )}

            <button type="button" onClick={share}
              className="mt-4 w-full rounded-xl bg-amber-300 py-3 text-sm font-semibold text-amber-900 active:scale-[0.99]">
              카카오톡으로 공유하기
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{result.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  )
}
