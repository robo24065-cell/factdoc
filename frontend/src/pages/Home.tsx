import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adviceAnswer, analyzeProduct, checkStatClaim, classifyIntent, explainLocal, findInText, judge, parseClaim, symptomsFor, targetMatchNote, type Judgement, type ProductAnalysis, type Verdict } from '../engine'
import { variantsOf } from '../engine/ontology'
import { mergeTriples } from '../engine/fromRaw'
import { geminiTriples } from '../lib/parseRemote'
import { fetchGroundedAnswer, logQuery, type GroundedPassage } from '../lib/db'
import { getCachedVerdict, getSemanticCachedVerdict, cacheVerdict } from '../lib/cache'
import { embedText } from '../lib/embed'
import { type EvidenceChunk } from '../lib/search'
import { preventionHint } from '../lib/prevention'
import { fetchDiseaseSections, explainDiseaseInfo, type InfoAnswer } from '../lib/info'
import { explainVerdict } from '../lib/explain'
import WhyTrace from '../components/WhyTrace'
import Highlight from '../components/Highlight'

const VUI: Record<Verdict, { label: string; sub: string; text: string; bg: string; accent: string }> = {
  true: { label: '사실이에요', sub: '국가 공식 근거와 일치해요', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/30', accent: 'bg-emerald-500' },
  partial: { label: '일부만 맞아요', sub: '과장되었거나 조건이 빠졌어요', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/30', accent: 'bg-amber-500' },
  false: { label: '사실이 아니에요', sub: '국가 공식 근거와 달라요', text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-950/30', accent: 'bg-rose-500' },
  unverified: { label: '확인이 어려워요', sub: '공식 데이터에 근거가 없어요', text: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800/60', accent: 'bg-slate-400' },
}

const EXAMPLES = ['당뇨는 △△즙으로 완치된대요', '설탕 많이 먹으면 당뇨 걸리나요', '뎅기열이 뭔가요?', 'E형 간염이 뭔가요?']

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
  const [grounded, setGrounded] = useState<GroundedPassage[]>([])
  const [info, setInfo] = useState<InfoAnswer | null>(null)
  const [product, setProduct] = useState<{ a: ProductAnalysis; note: string | null } | null>(null)
  const [infoSummarizing, setInfoSummarizing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function check(text: string) {
    const claim = text.trim()
    if (!claim) return
    setLoading(true); setExplanation(null); setExplaining(false); setEvidence([]); setHitKind(null)
    setInfo(null); setInfoSummarizing(false); setResult(null); setProduct(null); setGrounded([])

    // 0a-1) 제품/성분 질문이면 성분 분석(제품 효과 단정 X, 성분 효능만) — 제품명은 항상, 성분은 질환 없을 때
    const prodA = analyzeProduct(claim)
    if (prodA && (prodA.kind === 'product' || !findInText(claim, 'disease'))) {
      setProduct({ a: prodA, note: targetMatchNote(prodA, claim) }); setLoading(false)
      void logQuery(claim, 'unverified', 'product')
      return
    }

    // 0a) 통계/유병률 주장이면 KNHANES 정합성 판정(정보분류·캐시보다 우선) — 결정론
    const stat = checkStatClaim(claim)
    if (stat) {
      const local = explainLocal(stat)
      setResult(stat); setHitKind(null); setLoading(false); setExplanation(local)
      void logQuery(claim, stat.verdict)
      void cacheVerdict(claim, stat, local)
      return
    }

    // 0b) 의도 분류 — "X가 뭔가요/증상/예방" 정보질문이면 공식정보로 바로 응답(판정 아님)
    const intent = classifyIntent(claim)
    if (intent.intent === 'info' && intent.disease) {
      const disease = intent.disease
      const adv = adviceAnswer(claim) // 조언/관리 안내(결정론, 있으면 즉시)
      const sections = await fetchDiseaseSections(disease)
      setInfo({ disease, summary: adv?.text ?? '', sections, hasOfficial: sections.length > 0, citation: adv?.citation, isGuidance: !!adv })
      setLoading(false)
      void logQuery(claim, 'unverified', 'info')
      if (!adv) { // 정의형 질문이면 Gemini 요약
        setInfoSummarizing(true)
        const summary = await explainDiseaseInfo(disease, sections)
        setInfo((prev) => (prev && prev.disease === disease ? { ...prev, summary } : prev))
        setInfoSummarizing(false)
      }
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
        return
      }
    }

    // 3) 미스 → 규칙 + Gemini 파싱 결합 → 룰·그래프 판정
    const triples = mergeTriples(parseClaim(claim), await geminiTriples(claim))
    let j = judge(triples, claim)
    let local = explainLocal(j)
    setResult(j); setHitKind(null); setLoading(false); setExplanation(local)
    void logQuery(claim, j.verdict)

    // 3.5) 코퍼스 그라운딩 — 질병 인식 시 그 질병의 공식 본문에서만 관련 자료를 가져와 표시(무관 자료 방지).
    //      보류면 치료맥락 본문으로 판정 보강(손코딩 트리플 없어도 실제 KDCA 본문으로 답).
    const dz = findInText(claim, 'disease')
    const subjE = findInText(claim, 'subject')
    if (dz) {
      const g = await fetchGroundedAnswer(variantsOf(dz.canonical), subjE ? variantsOf(subjE.canonical) : [])
      if (g.length) {
        setGrounded(g)
        if (j.verdict === 'unverified') {
          const beneficial = /(효과|좋|낫|도움|바르|치료|관리|개선|쓰)/.test(claim) && !/(안\s|못\s|효과 ?없|소용없|거짓|아니)/.test(claim)
          const sN = subjE ? subjE.canonical.toLowerCase().replace(/\s+/g, '') : ''
          const treHit = g.find((x) => x.treatment && (!sN || x.text.toLowerCase().replace(/\s+/g, '').includes(sN)))
          if (treHit && subjE && beneficial) {
            j = { ...j, verdict: 'true', confidence: 0.72, citations: [{ portal: treHit.portal, title: `${dz.canonical} — 질병청 공식 정보`, url: treHit.url ?? undefined }] }
            local = `질병관리청 공식 자료에 따르면 ${subjE.canonical}은(는) ${dz.canonical}의 치료·관리에 쓰여요. 아래 공식 자료를 확인하세요.`
            setResult(j); setExplanation(local)
          } else {
            local = `이 주장만으로 단정하긴 어렵지만, ${dz.canonical} 관련 질병관리청 공식 자료에 참고할 내용이 있어요. 아래를 확인해보세요.`
            setExplanation(local)
          }
        }
      }
    }

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
    const src = result.citations[0]?.portal
    const text = `[FactDoc 팩트체크]\n"${result.claimText}"\n→ ${VUI[result.verdict].label}\n\n${explanation ?? '국가 공식데이터로 확인했어요.'}${src ? `\n📌 출처: ${src}` : ''}\n\n※ 의료 진단이 아니며 참고용입니다.`
    const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1800) }
    if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ text }).then(flash).catch(() => {})
    else navigator.clipboard?.writeText(text).then(flash).catch(() => {})
  }

  const vui = result ? VUI[result.verdict] : null
  const steps = result ? result.trace.filter((s) => s.outcome && s.kind !== 'normalize') : []
  // 근거 하이라이트(Span Grounding)용 — 주장의 질병·주체 표면형
  const highlightTerms = result
    ? [...new Set(result.triples.flatMap((t) => [...variantsOf(t.objectDisease), ...variantsOf(t.subject)]).filter((x) => x && x !== '(미상)'))]
    : []

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

      {/* 제품/성분 분석 카드 — 성분별 효능(제품 효과 단정 X) */}
      {product && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 bg-violet-50 p-4 dark:bg-violet-950/30">
            <div className="h-11 w-1.5 rounded-full bg-violet-500" />
            <div>
              <p className="text-lg font-semibold text-violet-700 dark:text-violet-300">{product.a.name}</p>
              <p className="text-xs text-slate-500">
                {product.a.kind === 'product'
                  ? `${product.a.maker ? product.a.maker + ' · ' : ''}${product.a.category ?? ''}`
                  : '성분 정보'}
              </p>
            </div>
            <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">성분 분석</span>
          </div>
          <div className="p-4">
            <p className="text-sm text-slate-500">주요 성분과 일반적으로 알려진 효능이에요.</p>
            <ul className="mt-2 space-y-2">
              {product.a.ingredients.map((ing, i) => (
                <li key={i} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                    {ing.name}
                    {ing.info.mfds && <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">식약처 인정기능성</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{ing.info.efficacy}</p>
                  {ing.info.caution && <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">⚠ {ing.info.caution}</p>}
                </li>
              ))}
            </ul>
            {product.note && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">{product.note}</p>}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              특정 제품의 효과를 보장하는 정보가 아니라 ‘성분’의 일반적 효능 정보예요. 정확한 효능·복용은 제품 표시사항과 전문가 상담을 따르세요. 출처: 식품의약품안전처 인정기능성 등.
            </p>
          </div>
        </div>
      )}

      {/* 정보질문 응답 카드 (질병청 공식 정보) */}
      {info && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 bg-blue-50 p-4 dark:bg-blue-950/30">
            <div className="h-11 w-1.5 rounded-full bg-blue-500" />
            <div>
              <p className="text-lg font-semibold text-blue-700 dark:text-blue-300">{info.disease}</p>
              <p className="text-xs text-slate-500">{info.isGuidance ? '질병관리청 건강관리 안내' : '질병관리청 공식 건강정보'}</p>
            </div>
            <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">{info.isGuidance ? '관리 안내' : '정보'}</span>
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
            {info.summary && info.citation && (
              <p className="mt-1.5 text-[11px] text-slate-400">출처: {info.citation.portal} — {info.citation.title}</p>
            )}

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

            {symptomsFor(info.disease) && (
              <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">🩺 주요 증상 (자가 참고용)</p>
                <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {symptomsFor(info.disease)!.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />{s}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-slate-400">진단이 아니에요. 증상이 의심되면 의료기관에서 확인하세요.</p>
              </div>
            )}

            {preventionHint(info.disease) && (
              <details className="group mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  🛡 예방·관리 수칙 보기
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <p className="px-3 pb-3 text-sm text-slate-600 dark:text-slate-300">{preventionHint(info.disease)}</p>
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

            {grounded.length > 0 && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-950 dark:bg-blue-950/20">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">📄 질병청 공식 자료</p>
                <ul className="mt-1.5 space-y-2">
                  {grounded.slice(0, 2).map((g, i) => (
                    <li key={i} className="text-sm">
                      {g.section && <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{g.section}</span>}
                      <p className="mt-0.5 leading-relaxed text-slate-700 dark:text-slate-200"><Highlight text={cleanSnippet(g.text, 220)} terms={highlightTerms} /></p>
                      {g.url && <a href={g.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline dark:text-blue-400">원문 →</a>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
                      <p className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300"><Highlight text={cleanSnippet(e.text)} terms={highlightTerms} /></p>
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
              className="mt-4 w-full rounded-xl bg-amber-300 py-3 text-sm font-semibold text-amber-900 transition active:scale-[0.99]">
              {copied ? '✓ 복사됐어요 — 붙여넣어 공유하세요' : '카카오톡으로 공유하기'}
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{result.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  )
}
