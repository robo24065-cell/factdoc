/* ────────────────────────────────────────────────────────────────
   S9 — 기억 카드 (도구 씬 · 무모션 구역 · 견본 먼저)

   S8이 "이산가족이 기록 보존을 1순위로 요청했다"는 근거를 보였으니,
   여기가 그 요청에 오늘 답할 수 있는 자리다.

   ★ 견본이 먼저 온다 — 빈 도구부터 내밀면 "이걸 채우면 무엇이 되는가"를
     모른 채 시작해야 한다. 완성된 모양을 한 장 보여 주고 나서 도구를 준다.
     견본의 답변은 실제 기록이 아니라 **입력 칸의 예시 문구를 그대로 옮긴 것**이고,
     화면에 「견본」이라고 적는다(있는 척하지 않는다). 수치(생존 신청자 수)와
     기준일만 실측이다.

   재료 계산(memoryHomes 등)은 옛 DescendantScenes 에서 그대로 옮겨 왔다 —
   동작 무변경. MemoryCard 도구 자체(#memory-card 앵커 포함)는 무접촉이다.
   ──────────────────────────────────────────────────────────────── */

import { useMemo } from 'react'
import { coverageEndOf } from '../../engine/nk-search.mjs'
import { SURFACE, TYPE, TEXT, FONT } from '../../theme/gohyang'
import type { IsanData, Pack, PathItem, Sel } from '../../components/gohyang/pack-types'
import { nf, clean, plain, museumDate } from '../../components/gohyang/format'
import { PROSE } from '../../components/gohyang/bits'
import { buildPanel, museumFor, imgSrcOf, DONATION_FIRST } from '../../components/gohyang/model'
import MemoryCard, { QUESTIONS, CARD_TITLE, CARD_SUB, type MemoryHome, type MemoryDonation } from '../../components/MemoryCard'

/* ── 견본 카드 — 예시 문구(입력 칸 placeholder 와 같은 문장)로 채운 한 장 ── */
function SampleCard({ home, asOf }: { home: MemoryHome; asOf: string }) {
  const Q = QUESTIONS.heard
  /* 답변 예시는 MemoryCard 입력 칸의 placeholder 문구 그대로다 — 새 내용을 지어내지 않는다 */
  const sample = [
    { q: Q.place, a: '재령벌, 신천 온천, 큰내' },
    { q: Q.relic, a: '할아버지 사진 두 장, 편지 한 통, 놋그릇' },
    { q: Q.season, a: '겨울에 강이 얼면 썰매를 탔다고 하셨습니다' },
  ]
  return (
    <article className={`rounded-md border bg-white p-5 ${SURFACE.line}`} aria-label="기억 카드 견본">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-[1.375rem] font-bold leading-snug ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
          {CARD_TITLE}
        </p>
        <span className={`rounded border border-[#dcdfe4] px-2 py-0.5 ${TYPE.cap} font-semibold ${TEXT.faint}`}>
          견본 — 답변은 예시 문구입니다
        </span>
      </div>
      <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{CARD_SUB}</p>
      <div className="mt-2 border-t-2 border-[#1a4e9c]" aria-hidden="true" />
      <p className={`mt-2.5 text-[1.1875rem] font-bold ${TEXT.blue} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
        {home.name}
      </p>
      <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        이 고향이 원적인 이산가족 생존 신청자 {nf(home.survivors)}명 ({asOf} 기준)
      </p>
      <dl className={`mt-2 divide-y ${SURFACE.hair}`}>
        {sample.map((r, i) => (
          <div key={i} className="py-2">
            <dt className={`${TYPE.cap} font-semibold ${TEXT.faint} ${PROSE}`}>{r.q}</dt>
            <dd className={`mt-0.5 text-[1.3125rem] leading-[1.7] ${TEXT.soft} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
              {r.a}
            </dd>
          </div>
        ))}
      </dl>
      <p className={`mt-2 border-t pt-2 ${SURFACE.hair} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        이렇게 한 장이 됩니다. 그림 파일(PNG)로 내려받거나 종이로 인쇄해 기증 창구에 첨부하실 수 있습니다.
      </p>
    </article>
  )
}

export default function MemoryScene({ pack, isan }: { pack: Pack; isan: IsanData }) {
  /* ── 기억 카드가 쓸 재료 (옛 DescendantScenes 에서 순수 이동) ──
     아래 도구가 후손이 무언가를 남기는 자리인데, 빈 칸을 주면 아무도 못 쓰므로
     **질문을 데이터가 만든다**. 여기서는 팩에서 재료만 뽑아 넘긴다 —
     계산하지 않는다(패널·사료 조인은 기존 함수 그대로). */
  const memoryHomes = useMemo<MemoryHome[]>(() => {
    const byOrigin = new Map(isan.latest.survivors.byOrigin.entries.map(e => [e.label, e.n]))
    /* 기억을 끌어내는 단서로 쓸 사건을 고른다.
       그냥 최신순으로 두면 미사일 발사·현지지도가 앞에 오는데, 그건 후손이 집안에서
       들었을 이야기의 실마리가 되지 못한다. 그래서 ① 이산가족·교류가 걸린 사건,
       ② 그다음 왕래·개성공단·금강산처럼 사람이 오간 사건, ③ 그래도 없으면 가장 오래된 사건
       순으로 고른다. **사건을 만들어 내지 않는다** — 순서만 바꾼다. */
    const STRONG = /이산가족|상봉|방문단|적십자|면회소|서신|왕래|교류/
    const WEAK = /개성공단|금강산|방북|방남|협력|경의선|동해선|철도/
    const cueEvents = (evs: Array<{ date: string; title: string }>) => {
      const asc = [...evs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      const strong = asc.filter(e => STRONG.test(e.title))
      const weak = asc.filter(e => !STRONG.test(e.title) && WEAK.test(e.title))
      const seen = new Set<string>()
      return [...strong, ...weak, ...asc]
        .filter(e => {
          const k = `${e.date}|${e.title}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        .slice(0, 2)
    }
    return pack.map.regionsOld
      .map(o => {
        const sel: Sel = { mode: 'old', id: o.id }
        const p = buildPanel(sel, pack)
        const mu = museumFor(sel, pack)
        const latestKey = p?.isanKey?.latestKey
        const relics = [
          ...mu.hometown.map(r => ({ r, historic: false })),
          ...mu.historic.map(r => ({ r, historic: true })),
        ].slice(0, 2)
        return {
          id: o.id,
          name: o.name,
          survivors: latestKey ? (byOrigin.get(latestKey) ?? 0) : 0,
          members: p?.memberNames ?? [],
          events: cueEvents(p?.events ?? []).map(e => ({ date: e.date, title: clean(e.title) })),
          eventsTotal: p?.eventsTotal ?? 0,
          relics: relics.map(({ r, historic }) => ({
            iId: r.iId,
            title: plain(r.title),
            producedOn: r.producedOn ? museumDate(r.producedOn) : null,
            imgSrc: imgSrcOf(r),
            recordUrl: r.recordUrl,
            historic,
          })),
          relicsTotal: mu.total,
        }
      })
    /* ★ 정렬하지 않는다 — regionsOld 의 차례가 곧 이산가족 공표 축의 차례다
         (황해·평남·평북·함남·함북·경기·강원).
       생존자 수 내림차순으로 늘어놓으면 「내 고향을 고르는 자리」가
       「어느 고향에 몇 분 남았나 둘러보는 순위표」가 된다. 당사자는 자기 고향을 이미 안다. */
  }, [pack, isan])

  /* 기증 2경로 — 실태조사 1순위 요청(기록물 수집 보존)에 직접 답하는 창구다.
     목록은 paths.json 이 정하고, 화면은 그중 기증만 골라 카드 옆에 둔다. */
  const memoryDonations = useMemo<MemoryDonation[]>(
    () =>
      DONATION_FIRST.map(id => pack.paths.paths.find(p => p.id === id))
        .filter((p): p is PathItem => Boolean(p))
        .map(p => ({ id: p.id, title: plain(p.title), org: plain(p.org), what: plain(p.what), url: p.applyUrl || p.url, contact: plain(p.contact) })),
    [pack],
  )

  /* ★ 기억 카드의 기준일 — **보여 준 것의 출처**에서 뽑는다.
       여기 실리는 사건(events)은 nk-build-region 이 timeline 레코드만 모은 것이다
       (보도자료는 건수만 세고 사건 목록에는 들어가지 않는다). 그러므로 기준일은
       남북관계연표의 coverageEnd 이고, 카탈로그가 그 단일 진실 소스다.
       museum 은 coverageEnd 가 아니라 **우리가 수집을 돌린 날**이다 — 이름을 갈라 부른다. */
  const memoryAsOf = {
    survivors: isan.latest.asOf,
    events: coverageEndOf('timeline') ?? pack.region.builtAt,
    museumCollected: pack.museum.builtAt,
  }

  return (
    <section>
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>오늘 답할 수 있는 자리</p>
        <h2 className={`mt-1.5 ${TYPE.h2} ${TEXT.ink}`}>이런 카드가 만들어집니다 — 견본</h2>
        <p className={`mt-1 max-w-[46rem] ${TYPE.sub} ${TEXT.soft}`}>
          먼저 완성된 모양을 보여 드립니다. 아래 도구에서 고향을 고르고 질문에 답하시면
          이 모양의 카드가 됩니다.
        </p>
      </header>

      {memoryHomes[0] && (
        <div className="mt-3 max-w-[46rem]">
          <SampleCard home={memoryHomes[0]} asOf={memoryAsOf.survivors} />
        </div>
      )}

      {/* ── 도구 — 손이 닿는 도구는 움직이지 않는다(무모션). #memory-card 앵커 유지 ── */}
      <MemoryCard homes={memoryHomes} donations={memoryDonations} asOf={memoryAsOf} />
    </section>
  )
}
