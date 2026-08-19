/* ────────────────────────────────────────────────────────────────
   S7 후손 반전(+%p 주인공) · S8 근거(59.9%)

   기록 골든타임이 "언제까지 남아 있는가"를 말한다면, 이 두 씬은 "그 다음은 누구인가"를 말한다.

   왜 이 층이 정당한가 — 우리가 만들고 싶어서가 아니라, **통일부 자신의 조사가 요구했다**:
     · 이산가족이 1순위로 원한 사업 = 「사진·물건 등 기록물 수집 보존」 59.9%
     · 위로사업 2위 = 「고향 관련 사진·영상의 수집·제작, 전시」 44.5%
     · 유전자검사 사업은 2025년부터 2~3세대 후손을 대상에 넣었다(사후 가족관계 확인 목적)
   즉 정책은 이미 후손을 향해 있는데, 후손이 접속할 화면이 없다.

    데이터 정직성 — 후손 문항은 **후손 본인 조사가 아니다.**
     자손이 있는 1세대 4,042명이 자기 자손을 평가한 값이다. 화면에 그대로 밝힌다.
     그 한계를 감추면 이 층 전체가 근거를 잃는다.

   씬 전환 2/2 분해: 옛 「후손 다리」 한 구획을 S7(반전)·S8(근거)로 가른다.
     기억 카드(S9)는 MemoryScene.tsx 로, 통일부 안내 4링크·8촌 안내는 S10 꼬리로 이관.
     정보 삭제는 0건 — 자리만 옮긴다.
   ──────────────────────────────────────────────────────────────── */

import { useState } from 'react'
import { SURFACE, TYPE, TEXT, ASOF, FONT, josa } from '../../theme/gohyang'
import type { DescData, DescGap, IsanData } from '../../components/gohyang/pack-types'
import { nf, nf1 } from '../../components/gohyang/format'
import { FOCUS, PROSE, OutLink } from '../../components/gohyang/bits'

function GapBar({ g }: { g: DescGap }) {
  const hi = Math.max(g.a.pct, g.b.pct)
  const w = (v: number) => `${Math.max(2, (v / Math.max(hi, 1)) * 100)}%`
  /* 두 막대는 **같은 축**에서 길이로 비교돼야 의미가 생긴다.
     위(a)는 청록 = 하고 싶다는 쪽, 아래(b)는 먹색 = 실제 쪽.
     색만으로 가르지 않고 라벨에 같은 도형을 붙여 흑백에서도 짝이 보이게 한다. */
  return (
    <li className={`border-b py-3.5 last:border-0 ${SURFACE.hair}`}>
      <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>{g.title}</p>
      <div className="mt-2.5 space-y-1.5">
        {([[g.a, 'bg-[#1a4e9c] dark:bg-[#7aa9e8]', '◆'], [g.b, 'bg-[#b6bcc5] dark:bg-[#39414c]', '◇']] as const).map(([row, color], i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className={`w-14 shrink-0 text-right ${TYPE.figureSm} ${TEXT.ink}`} style={{ fontSize: '1.0625rem' }}>
              {nf1(row.pct)}%
            </span>
            <span className={`h-3 min-w-0 flex-1 overflow-hidden rounded-full ${SURFACE.inset}`}>
              <span className={`block h-full rounded-full ${color}`} style={{ width: w(row.pct) }} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-0.5">
        <p className={`${TYPE.cap} ${TEXT.blue} ${PROSE}`}>◆ {g.a.label}</p>
        <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>◇ {g.b.label}</p>
      </div>
      <p className={`mt-2 rounded-xl border-l-[3px] border-[#1a4e9c] bg-[#eef3fb] px-3 py-2 ${TYPE.cap} ${TEXT.soft} dark:border-[#7aa9e8] dark:bg-[#16202c] ${PROSE}`}>
        <b className={`font-semibold tabular-nums ${TEXT.blue}`}>{g.gapPp > 0 ? '+' : ''}{nf1(g.gapPp)}%p</b> — {g.reading}
      </p>
    </li>
  )
}

/* ══════════════════════ S7 — 후손 반전 ══════════════════════
   무대 숫자 3: 격차 %p(주인공) + 1세대 % + 후손 % — 간극 3종은 막대 차트로 뒤따른다. */

export function DescendantFlipScene({ desc }: { desc: DescData }) {
  const x = desc.descendants.wantsCrossGenerationExchange
  const d = x.descendants - x.gen1
  /* 무대 3수치에 붙는 기준일 — 실태조사 공표일. 수치와 기준일은 붙어 다닌다. */
  const asOf = desc.survey.publishedAt

  return (
    <section>
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>기록을 이어받는 사람들 — 1세대가 떠난 뒤 이 기록은 누구의 것인가</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className={`${TYPE.figure} ${TEXT.blue}`}>
            +{nf1(d)}
            <span className="ml-1 align-baseline text-[1.375rem] font-bold">%p</span>
          </p>
          <span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>{asOf} 공표 기준</span>
        </div>
        {/* ★ 조사가 답한 것만 확정형으로 말한다 — 이 값은 **후손 본인 조사가 아니라**
              자손이 있는 1세대가 자기 자손을 평가한 값이다(desc.caveats·꼬리 참조).
              「후손 세대가 더 바랍니다」로 쓰면 조사가 묻지 않은 것을 확정으로 승격시킨다. */}
        <p
          className={`mt-3 max-w-[46rem] text-[1.3125rem] leading-[1.7] ${TEXT.ink}`}
          style={{ fontFamily: FONT.serif }}
        >
          1세대 사후의 자손 세대 교류를, 자손 세대가 1세대 본인보다 이만큼 더 바라는 것으로
          {' '}1세대가 평가했습니다.
        </p>
        <p className={`mt-2 max-w-[46rem] ${TYPE.body} ${TEXT.soft}`}>
          이산 1세대 <b className={`font-semibold tabular-nums ${TEXT.faint}`}>{nf1(x.gen1)}%</b>,
          {' '}자손 세대 <b className={`font-semibold tabular-nums ${TEXT.blue}`}>{nf1(x.descendants)}%</b>
          {' '}<span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>(둘 다 {asOf} 공표 · 심층 {nf(desc.survey.bases.deep)}명)</span>.
          {' '}{x.note}. <b className={`font-semibold ${TEXT.ink}`}>이 자료로 말할 수 있는 것은 여기까지입니다</b> —
          후손이 무관심하다는 근거도, 이어받을 수단이 있다는 근거도 이 조사에는 없습니다.
        </p>
      </header>

      {/* ── 간극 3종 — 바라는 것과 실제의 거리(막대 차트) ── */}
      <div className="mt-5 max-w-[46rem]">
        <p className={`${TYPE.eyebrow} ${TEXT.faint} ${PROSE}`}>세대 간극 3종</p>
        <ul className="mt-1">
          {desc.gaps.map(g => <GapBar key={g.id} g={g} />)}
        </ul>
      </div>

      {/* ── 꼬리 — 조사의 정체와 성격 ── */}
      <p className={`mt-4 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        {desc.survey.name} · 심층 {nf(desc.survey.bases.deep)}명 ({desc.survey.publishedAt} 공표).
        {' '}후손 문항은 후손 본인 조사가 아니라 자손이 있는 1세대가 자기 자손을 평가한 값입니다.
      </p>
    </section>
  )
}

/* ══════════════════════ S8 — 근거: 이산가족이 1순위로 요청한 사업 ══════════════════════
   주인공은 59.9%. 규모 추정·데이터 한계·출처는 꼬리다. */

export function DescendantEvidenceScene({ desc, isan }: { desc: DescData; isan: IsanData }) {
  const [openAssume, setOpenAssume] = useState(false)
  const alive = isan.latest.overview.cumulative.alive
  const top = desc.recordPrograms.기록및공감대[0]

  return (
    <section>
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>통일부 조사에 적힌 그다음 답</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className={`${TYPE.figure} ${TEXT.ink}`}>
            {nf1(top?.pct)}
            <span className="ml-1 align-baseline text-[1.375rem] font-bold">%</span>
          </p>
          <span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>{desc.survey.publishedAt} 공표 기준</span>
        </div>
        <p className={`mt-3 max-w-[46rem] ${TYPE.body} ${TEXT.soft}`}>
          이산가족이 1순위로 요청한 사업은 「{top?.label}」이었습니다.
          {' '}<b className={`font-semibold ${TEXT.ink}`}>이 화면이 하는 일이 곧 그 요청입니다</b> —
          우리가 고른 주제가 아니라 이산가족이 고른 주제입니다.
        </p>
      </header>

      {/* ── 요청 순위 전체(막대 목록) ── */}
      <div className={`mt-4 max-w-[46rem] ${SURFACE.card} p-4`}>
        <p className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>기록·공감대 사업 요청 순위
          {' '}<span className={`${TYPE.cap} font-normal tabular-nums ${TEXT.faint}`}>({desc.survey.publishedAt} 공표 기준)</span>
        </p>
        <ul className="mt-2 space-y-1.5">
          {desc.recordPrograms.기록및공감대.map((r, i) => (
            <li key={r.label} className="flex items-baseline gap-2">
              <span className={`w-14 shrink-0 text-right text-[1.0625rem] font-semibold tabular-nums ${i === 0 ? TEXT.blue : TEXT.faint}`}>
                {nf1(r.pct)}%
              </span>
              <span className={`${TYPE.sub} ${i === 0 ? 'font-medium ' + TEXT.ink : TEXT.soft} ${PROSE}`}>
                {r.label}
              </span>
            </li>
          ))}
        </ul>
        <p className={`mt-3 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          {(() => {
            const w = desc.recordPrograms.위로사업[1]
            if (!w) return null
            return <>위로사업에서도 「{w.label}」{josa(w.label, '이', '가')} {nf1(w.pct)}%로 2위입니다.</>
          })()}
        </p>
      </div>

      {/* ── 규모(꼬리 쪽) ── */}
      <div className={`mt-3 max-w-[46rem] ${SURFACE.inset} p-4`}>
        {/* ★ 한 문단에 축이 둘이다 — 생존·누계는 신청현황(2026-05-31), 자손 보유율은
              제4차 실태조사(2025-01-24 공표). 기준일을 각 수치 옆에 따로 붙인다. */}
        <p className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>이건 <b className="font-semibold tabular-nums">{nf(alive)}명</b>
          {' '}<span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>({isan.latest.asOf} 기준)</span>의 문제가 아닙니다.
          {' '}1세대 누계 {nf(desc.scale.gen1Cumulative)}명
          {' '}<span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>({isan.latest.asOf} 기준)</span> 중
          {' '}{nf1(desc.scale.withDescendantsRate)}%
          {' '}<span className={`${TYPE.cap} tabular-nums ${TEXT.faint}`}>({desc.survey.publishedAt} 공표 기준)</span>가 자손을 두었으니,
          {' '}<b className="font-semibold">{desc.scale.estimate.phrase}</b>입니다.
        </p>
        <button
          type="button"
          onClick={() => setOpenAssume(v => !v)}
          className={`mt-2.5 inline-flex min-h-[48px] items-center ${TYPE.cap} font-medium underline decoration-dotted underline-offset-2 ${TEXT.blue} ${FOCUS}`}
          aria-expanded={openAssume}
        >이 추정의 가정 {desc.scale.assumptions.length}가지 {openAssume ? '접기 ▴' : '보기 ▾'}
        </button>
        {openAssume && (
          <ul className="mt-2 space-y-1">
            {desc.scale.assumptions.map((a, i) => (
              <li key={i} className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>· {a}</li>
            ))}
          </ul>
        )}
        <p className={`mt-3 ${TYPE.cap} ${TEXT.stale} ${PROSE}`}>후손 규모는 <b className="font-medium">공표값이 아니라 추정</b>입니다. 범위로만 읽어야 합니다.
        </p>
      </div>

      {/* ── 데이터 한계 — 감추면 이 층이 무너진다 ── */}
      <div className={`mt-3 max-w-[46rem] rounded-xl border ${ASOF.stale.edge} ${ASOF.stale.band} p-4`}>
        <p className={`${TYPE.eyebrow} ${TEXT.stale} ${PROSE}`}>이 수치를 읽을 때 반드시 알아야 할 것</p>
        <ul className="mt-1 space-y-1">
          {desc.caveats.map((c, i) => (
            <li key={i} className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>· {c}</li>
          ))}
        </ul>
      </div>

      <p className="mt-3">
        <span className={`${TYPE.cap} ${TEXT.faint}`}>출처 {desc.sources[0]?.name} · </span>
        <OutLink href={desc.sources[0]?.url}>보도자료 원문</OutLink>
        {desc.sources[1]?.url && (
          <>
            <span className={`${TYPE.cap} ${TEXT.faint}`}> · </span>
            <OutLink href={desc.sources[1].url}>요약자료(인포그래픽)</OutLink>
          </>
        )}
      </p>
    </section>
  )
}
