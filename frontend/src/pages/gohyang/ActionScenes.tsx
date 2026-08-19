/* ────────────────────────────────────────────────────────────────
   S10 기증 · S11 창구 핀 · S12 정직(닫힌 것)

   위의 '후손 다리'는 **진단**이다 — 후손이 이어받고 싶어 하는데 수단이 없다는 것.
   진단만 하고 끝내면 화면이 후손에게 아무것도 주지 않는다. 그래서 이 층을 붙인다.

   ★ 기증 경로가 맨 앞이다 (S10).
     실태조사에서 이산가족이 1순위로 요청한 사업이 「사진·물건 등 기록물 수집 보존」 59.9% 였고,
     후손이 조부모의 사진을 기증하는 것이 그 요청에 직접 답하는 행동이기 때문이다.
     우리가 고른 순서가 아니라 이산가족이 고른 순서다.
     S10 꼬리에는 통일부 안내 4링크와 8촌 안내를 둔다(옛 후손 다리 머리에서 이관 — 삭제 0건).

   S11 — 나머지 열린 8경로는 PinnedDeck(가로 덱 두 곳 중 하나).
     ★ 2026-08-20 — 여기도 sticky 런웨이를 걷어냈다(사료 덱과 같은 이유). 창구 8곳을
     다 넘길 때까지 페이지가 4.8화면 붙잡혀 있었다. 지금은 세로 스크롤이 그냥 지나간다.
     카드 무대면 = 제목 + 자격 배지 + 한 줄 설명 + 신청 단추.
     상세(자격 근거·주관·문의·법적 근거·절차·유의)는 카드 안 details — 정보 무손실.

   S12 — 닫힌 것을 그대로 적는다.
     · 아직 후손에게 열려 있지 않은 지점 11가지 (paths.gaps)
     · 접수 창구 자체가 없거나 사라진 2건 (actionable=false)

    정직성 두 가지
     ① actionable 은 **창구가 살아 있다**는 뜻이지 **성사된다**는 뜻이 아니다(예: 북한방문).
     ② '후손 가능' 판정 다수는 법령 정의에서 도출한 것이지 안내 페이지가 그렇게 쓴 것이 아니다.
        "법적으로는 이미 대상 / 안내에는 없음"을 붙여 보여야 오해가 없다.
   ──────────────────────────────────────────────────────────────── */

import { SURFACE, TYPE, TEXT, ASOF, BTN, josa } from '../../theme/gohyang'
import type { DescData, PathData, PathItem } from '../../components/gohyang/pack-types'
import { nf, nf1, plain } from '../../components/gohyang/format'
import { FOCUS, PROSE, TONE, OutLink } from '../../components/gohyang/bits'
import { DONATION_FIRST } from '../../components/gohyang/model'
import PinnedDeck from '../../components/gohyang/PinnedDeck'

const ELIG: Record<string, { glyph: string; label: string; chip: string }> = {
  '후손 가능': { glyph: '◆', label: '후손도 신청 주체가 될 수 있음', chip: TONE.blue.chip },
  '불명': { glyph: '◇', label: '후손 대상 여부가 안내에 없음', chip: ASOF.stale.chip },
  '1세대만': { glyph: '■', label: '이산 1세대 본인만', chip: ASOF.frozen.chip },
}

/* ── 기증 카드(S10) — 큰 카드, 상세가 다 펼쳐져 있다 ── */
function DonationCard({ p }: { p: PathItem }) {
  const e = ELIG[p.eligibility] ?? ELIG['불명']
  const apply = p.applyUrl || p.url
  return (
    <li className={`${SURFACE.card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className={`min-w-0 flex-1 text-[1.1875rem] font-bold leading-snug ${TEXT.ink} ${PROSE}`}>{plain(p.title)}</h4>
        <span className={`shrink-0 rounded px-2 py-0.5 ${TYPE.cap} font-semibold ${e.chip}`}>
          <span aria-hidden="true">{e.glyph}</span> {e.label}
        </span>
      </div>
      <p className={`mt-1.5 ${TYPE.body} ${TEXT.soft} ${PROSE}`}>{plain(p.what)}</p>

      {p.eligibilityQuote && (
        <blockquote className={`mt-2.5 border-l-[3px] border-[#dcdfe4] pl-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE} dark:border-[#2a2f36]`}>
          자격 근거 — “{plain(p.eligibilityQuote)}”
        </blockquote>
      )}

      <dl className={`mt-2.5 space-y-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-semibold">주관</dt>
          <dd className="min-w-0">{plain(p.org)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-semibold">문의</dt>
          <dd className="min-w-0">{plain(p.contact)}</dd>
        </div>
        {p.legalBasis && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-semibold">근거</dt>
            <dd className="min-w-0">{plain(p.legalBasis)}</dd>
          </div>
        )}
      </dl>

      {(p.note || p.counterQuote || (p.how?.length ?? 0) > 0) && (
        <details className="mt-2.5">
          <summary className={`inline-flex min-h-[48px] cursor-pointer list-none items-center ${TYPE.cap} font-medium ${TEXT.blue} [&::-webkit-details-marker]:hidden ${FOCUS}`}>
            신청 전에 알아야 할 것 ▾
          </summary>
          {(p.how?.length ?? 0) > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {p.how!.map((h, i) => (
                <li key={i} className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>· {plain(h)}</li>
              ))}
            </ul>
          )}
          {p.note && <p className={`mt-1.5 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>{plain(p.note)}</p>}
          {p.counterQuote && (
            <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>안내 원문 — “{plain(p.counterQuote)}”</p>
          )}
        </details>
      )}

      <p className="mt-3">
        <a href={apply} target="_blank" rel="noreferrer" className={`${BTN.primary} min-h-[48px] px-5`}>
          신청·안내 페이지 열기 <span aria-hidden="true">↗</span>
        </a>
      </p>
    </li>
  )
}

/* ── 창구 카드(S11 덱) — 무대면은 제목·배지·한 줄·단추, 상세는 details ── */
function ChannelCard({ p }: { p: PathItem }) {
  const e = ELIG[p.eligibility] ?? ELIG['불명']
  const apply = p.applyUrl || p.url
  return (
    /* ★ mx-auto 금지 — 무대는 왼쪽 레일 하나다(theme/gohyang.ts STAGE 주석).
       읽는 폭으로 줄이되 **왼쪽 레일에 붙인 채** 줄인다. 가운데로 모으면 이 덱 카드만
       레일이 +72.3px 어긋나 데스크톱 3폭(1280·1440·1920)에서 제3의 시작점이 생긴다(실측 2026-08-20). */
    <article className={`max-w-[46rem] ${SURFACE.card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className={`min-w-0 flex-1 text-[1.1875rem] font-bold leading-snug ${TEXT.ink} ${PROSE}`}>{plain(p.title)}</h4>
        <span className={`shrink-0 rounded px-2 py-0.5 ${TYPE.cap} font-semibold ${e.chip}`}>
          <span aria-hidden="true">{e.glyph}</span> {e.label}
        </span>
      </div>
      <p className={`mt-2 ${TYPE.body} ${TEXT.soft} ${PROSE}`}>{plain(p.what)}</p>

      <p className="mt-3">
        <a href={apply} target="_blank" rel="noreferrer" className={`${BTN.primary} min-h-[48px] px-5`}>
          신청·안내 페이지 열기 <span aria-hidden="true">↗</span>
        </a>
      </p>

      {/* 상세 — 정보 무손실. 펼쳐야 보이지만 접혀 있을 뿐 다 있다 */}
      <details className="mt-3">
        <summary className={`inline-flex min-h-[48px] cursor-pointer list-none items-center ${TYPE.cap} font-medium ${TEXT.blue} [&::-webkit-details-marker]:hidden ${FOCUS}`}>
          자격 근거·문의처·유의 사항 ▾
        </summary>
        {p.eligibilityQuote && (
          <blockquote className={`mt-2 border-l-[3px] border-[#dcdfe4] pl-2.5 ${TYPE.cap} ${TEXT.faint} ${PROSE} dark:border-[#2a2f36]`}>
            자격 근거 — “{plain(p.eligibilityQuote)}”
          </blockquote>
        )}
        <dl className={`mt-2 space-y-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-semibold">주관</dt>
            <dd className="min-w-0">{plain(p.org)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-semibold">문의</dt>
            <dd className="min-w-0">{plain(p.contact)}</dd>
          </div>
          {p.legalBasis && (
            <div className="flex gap-1.5">
              <dt className="shrink-0 font-semibold">근거</dt>
              <dd className="min-w-0">{plain(p.legalBasis)}</dd>
            </div>
          )}
        </dl>
        {(p.how?.length ?? 0) > 0 && (
          <ul className="mt-2 space-y-0.5">
            {p.how!.map((h, i) => (
              <li key={i} className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>· {plain(h)}</li>
            ))}
          </ul>
        )}
        {p.note && <p className={`mt-1.5 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>{plain(p.note)}</p>}
        {p.counterQuote && (
          <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>안내 원문 — “{plain(p.counterQuote)}”</p>
        )}
      </details>
    </article>
  )
}

/* ══════════════════════ S10 — 기증: 가장 먼저 할 수 있는 일 ══════════════════════ */

export function DonateScene({ paths, desc }: { paths: PathData; desc: DescData }) {
  const actionable = paths.paths.filter(p => p.actionable)
  const donation = DONATION_FIRST.map(id => actionable.find(p => p.id === id)).filter((p): p is PathItem => Boolean(p))
  const top = desc.recordPrograms.기록및공감대[0]

  return (
    <section>
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>지금 하실 수 있는 일</p>
        <h2 className={`mt-1.5 ${TYPE.h2} ${TEXT.ink}`}>가장 먼저 — 집안의 사진과 편지를 나라에 맡기기</h2>
        <p className={`mt-2 max-w-[46rem] ${TYPE.body} ${TEXT.soft}`}>
          {top && (
            <>
              이산가족이 1순위로 요청한 사업은 「{plain(top.label)}」{josa(plain(top.label), '이', '가')}{' '}
              <b className={`font-semibold tabular-nums ${TEXT.ink}`}>{nf1(top.pct)}%</b>였습니다.
            </>
          )}
          {' '}<b className={`font-semibold ${TEXT.ink}`}>후손이 조부모의 사진을 기증하는 것이 그 요청에 직접 답하는 행동입니다</b> —
          {' '}1세대가 원한 일을, 1세대가 없어도 후손이 대신 할 수 있는 유일한 자리이기 때문입니다.
        </p>
      </header>

      {/* ── 기증 2경로 — 큰 카드 ── */}
      <ul className="mt-4 grid max-w-5xl gap-3 lg:grid-cols-2">
        {donation.map(p => <DonationCard key={p.id} p={p} />)}
      </ul>

      {/* ── 꼬리 — 통일부 안내 4링크 + 8촌 안내 (옛 후손 다리 머리에서 이관) ── */}
      <div className={`mt-4 max-w-5xl ${SURFACE.inset} p-4`}>
        <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>통일부 안내로 바로 가기</p>
        <p className={`mt-1 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          신청과 교류는 통일부 이산가족정보통합시스템에서 이루어집니다. 아래에서 바로 열립니다.
        </p>
        {/* 「후손」으로만 부르면 자녀가 없는 집안이 빠진다.
             이산가족법 제2조는 이산가족을 8촌 이내로 정의한다 — 조카·사촌도 당사자다. */}
        <p className={`mt-2 rounded-md border-l-[3px] border-[#1a4e9c] bg-[#eef3fb] px-3 py-2 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          자녀나 손자녀가 아니어도 괜찮습니다. 이산가족법은 이산가족을 <b className={`font-semibold ${TEXT.ink}`}>8촌 이내 친족</b>으로
          정하고 있어, 조카와 사촌도 같은 자격으로 신청하고 기록을 맡기실 수 있습니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ['이산가족 신청·교류 안내', 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_info/view.do?mid=SM00000118'],
            ['이산가족찾기 신청·취소', 'https://reunion.unikorea.go.kr/reuni/home/fml/registee/main.do?mid=SM00000119'],
            ['기록물 기증 안내', 'https://reunion.unikorea.go.kr/reuni/home/museum/archive/DonationInfo.do?mid=SM00000265'],
            ['상담 창구 안내', 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_counsel/view.do?mid=SM00000126'],
          ] as const).map(([label, href]) => (
            <a key={href} href={href} target="_blank" rel="noreferrer" className={`${BTN.ghost} min-h-[48px]`}>
              {label} ↗
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ══════════════════════ S11 — 창구 핀: 열린 8경로 ══════════════════════ */

export function ChannelsScene({ paths }: { paths: PathData }) {
  const actionable = paths.paths.filter(p => p.actionable)
  const donationIds = new Set(DONATION_FIRST)
  const rest = actionable.filter(p => !donationIds.has(p.id))

  return (
    <section>
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>가족 이름으로 신청할 수 있는 창구</p>
        <h2 className={`mt-1.5 ${TYPE.h2} ${TEXT.ink}`}>기증 말고도 {nf(rest.length)}곳이 더 열려 있습니다</h2>
        {/* 확인 건수·링크 생존은 캡션급 — 무대 숫자에 끼지 않는다 */}
        <p className={`mt-1 max-w-[46rem] ${TYPE.cap} ${TEXT.faint}`}>
          {nf(paths.summary.totalPaths)}건을 확인해 {nf(actionable.length)}건이 열려 있었습니다 ·
          {' '}링크 {nf(paths.meta.checkedUrls)}개 가운데 {nf(paths.meta.liveUrls)}개가 지금도 열립니다 ({paths.builtAt} 실측)
        </p>
      </header>

      {/* 엿보임 14% — 사진 덱(7%)보다 두껍게 문다. 정보 카드는 글이라 옆 장의 제목 첫 글자가
            보이는 편이 「여덟 곳이 옆으로 이어진다」를 더 정직하게 알린다. 잘려도 읽는 데
            손해가 없는 종류의 카드이기도 하다(상세는 카드 안 details 에 그대로 있다). */}
      <PinnedDeck
        label="신청 창구"
        peek={0.14}
        className="mt-3"
        items={rest.map(p => <ChannelCard key={p.id} p={p} />)}
      />

      {/* ── 꼬리 — 판정 기준을 밝힌다 ── */}
      <div className={`mt-4 max-w-[46rem] rounded-md border ${ASOF.stale.edge} ${ASOF.stale.band} p-4`}>
        <p className={`${TYPE.eyebrow} ${TEXT.stale} ${PROSE}`}>이 목록을 읽을 때 반드시 알아야 할 것</p>
        <ul className={`mt-1.5 space-y-1 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          <li>
            · <b className="font-semibold">「열려 있다」는 창구가 살아 있다는 뜻이지 성사된다는 뜻이 아닙니다.</b> {plain(paths.meta.actionableCriterion)}
          </li>
          <li>
            · <b className="font-semibold">「후손도 신청 주체가 될 수 있음」의 다수는 법령 정의에서 나온 판정</b>이며, 안내 페이지가 「후손도 됩니다」라고 쓴 것이 아닙니다.
            {' '}법적으로는 이미 대상인데 안내에는 없습니다.
          </li>
          <li>· 근거 — {plain(paths.meta.legalRoot)}</li>
          {paths.meta.caveats.map((c, i) => (
            <li key={i}>· {plain(c)}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ══════════════════════ S12 — 정직: 닫혀 있는 것 ══════════════════════ */

export function ClosedScene({ paths }: { paths: PathData }) {
  const closed = paths.paths.filter(p => !p.actionable)

  return (
    <section>
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>감추지 않는다</p>
        {/* 무대 수치(11가지·2건)에도 기준일이 붙는다 — 이 조사가 언제 실측된 것인지 없이는 셋 다 공중에 뜬다 */}
        <h2 className={`mt-1.5 ${TYPE.h2} ${TEXT.ink}`}>아직 후손에게 열려 있지 않은 것 {nf(paths.gaps.length)}가지
          {' '}<span className={`${TYPE.cap} font-normal tabular-nums ${TEXT.faint}`}>({paths.builtAt} 실측 기준)</span>
        </h2>
        <p className={`mt-1 max-w-[46rem] ${TYPE.sub} ${TEXT.faint} ${PROSE}`}>
          제도가 없어서가 아니라, 있는 제도가 후손에게 닿지 않는 지점입니다.
          고치자는 제안이 아니라 이번 조사에서 실제로 확인된 사실만 적었습니다.
        </p>
      </header>

      {/* 11가지를 한 기둥으로 쌓으면 이 씬만 2.6화면이 된다(실측) — 넓은 화면에서는 두 기둥 */}
      <ul className="mt-2 grid max-w-5xl gap-x-8 lg:grid-cols-2">
        {paths.gaps.map(g => (
          <li key={g.id} className={`border-b py-3 ${SURFACE.hair}`}>
            <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{plain(g.title)}</p>
            <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{plain(g.fact)}</p>
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>→ {plain(g.consequence)}</p>
            {g.evidence && <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>확인 근거 — {plain(g.evidence)}</p>}
          </li>
        ))}
      </ul>

      {/* ── 헛걸음 방지 — 접수 창구 자체가 없거나 사라진 것 ── */}
      <details className={`mt-4 max-w-[46rem] ${SURFACE.card} p-4`}>
        <summary className={`inline-flex min-h-[48px] cursor-pointer list-none items-center ${TYPE.h3} ${TEXT.ink} [&::-webkit-details-marker]:hidden ${FOCUS} ${PROSE}`}>
          지금은 신청할 수 없는 것 {nf(closed.length)}건
          {' '}<span className={`${TYPE.cap} font-normal tabular-nums ${TEXT.faint}`}>({paths.builtAt} 실측 기준)</span> ▾
        </summary>
        <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          이 조사에서 <b className="font-medium">「이산 1세대 본인만 가능」으로 판정된 제도는 {nf(paths.summary.gen1OnlyCount)}건</b>입니다 ({paths.builtAt} 실측 기준).
          {' '}아래 {nf(closed.length)}건은 후손의 자격이 막혀서가 아니라 <b className="font-medium">접수할 창구 자체가 없거나 사라졌기</b> 때문에 신청할 수 없습니다.
          {' '}헛걸음하지 않도록 따로 묶어 둡니다.
        </p>
        <ul className="mt-3 space-y-3">
          {closed.map(p => (
            <li key={p.id} className={`${SURFACE.inset} p-3`}>
              <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{plain(p.title)}</p>
              <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{plain(p.what)}</p>
              {p.note && <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{plain(p.note)}</p>}
              <p className="mt-1.5">
                <OutLink href={p.url}>해당 페이지 보기</OutLink>
              </p>
            </li>
          ))}
        </ul>
      </details>

      <p className="mt-4">
        <span className={`${TYPE.cap} ${TEXT.faint}`}>
          출처 {plain(paths.sources[0]?.name)} 외 {nf(paths.sources.length - 1)}종 · 링크 생존 확인 {paths.builtAt} ·{' '}
        </span>
        <OutLink href={paths.sources[0]?.url}>이산가족정보통합시스템</OutLink>
      </p>
    </section>
  )
}
