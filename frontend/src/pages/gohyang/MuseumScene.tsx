/* ────────────────────────────────────────────────────────────────
   S6 — 사료 핀 (기증 사진 1장 전폭, 핀 가로)

   기록 골든타임 다음, 후손 다리 앞.
   "얼마 안 남았다"를 본 사람이 "무엇이 남아 있나"를 보고, 그다음 "무엇을 할까"로 간다.

   사진 24장은 PinnedDeck(핀 가로 넘김 두 곳 중 하나)에 한 장씩 전폭으로 싣는다.
   런웨이는 6구간으로 묶는다 — 24장 × 60vh 면 이 씬 하나가 14화면이 되어
   씬 서사 전체의 압축 목표를 무너뜨린다. 스크롤이 끝나도 행은 실재하므로
   단추·스와이프·키보드로 24장 전부에 닿는다(정보 무손실).
   기존 MuseumTour(박물관 묶음)는 씬 꼬리 뒤 일반 구획으로 유지한다.
   ──────────────────────────────────────────────────────────────── */

import { useMemo } from 'react'
import MuseumTour from '../../components/MuseumTour'
import PinnedDeck from '../../components/gohyang/PinnedDeck'
import type { MuseumRec, Pack } from '../../components/gohyang/pack-types'
import { nf, clean, museumDate } from '../../components/gohyang/format'
import { PROSE, OutLink } from '../../components/gohyang/bits'
import { SURFACE, TYPE, TEXT, FONT } from '../../theme/gohyang'
import { imgSrcOf } from '../../components/gohyang/model'

/* 사진 한 장 전폭 — 감정을 연출하지 않는다. 사진을 크게 놓을 뿐,
   설명에는 사실(제목·생산일·기증자·지역)만 적는다. */
function PhotoCard({ r, eager }: { r: MuseumRec; eager: boolean }) {
  const src = imgSrcOf(r)
  return (
    <figure className={`overflow-hidden ${SURFACE.card}`}>
      {/* ★ 자리표시 높이를 고정한다 — 가로로 밀린 카드는 세로 스크롤로 뷰포트에 들어오지
            않아 lazy 로드가 걸리지 않고, 그 사이 링크 높이가 0px 로 무너졌다(실측 14개).
            앞의 몇 장은 eager 로 받아 첫인상이 비지 않게 한다. */}
      <a
        href={r.recordUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-[38svh] items-center justify-center bg-[#f0f1f3]"
      >
        {src && (
          <img
            src={src}
            alt={clean(r.title)}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className="mx-auto max-h-[52svh] w-full object-contain"
          />
        )}
      </a>
      <figcaption className={`border-t p-3.5 ${SURFACE.hair}`}>
        {/* 사료 제목은 사람이 남긴 말 — 명조(19px 이상에서만) */}
        <p className={`text-[1.1875rem] font-bold leading-snug ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
          {clean(r.title)}
        </p>
        <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          {museumDate(r.producedOn)}
          {r.donor ? ` · ${clean(r.donor)}님 기증` : ''}
          {r.regions?.length ? ` · ${r.regions[0]}` : ''}
          {' · '}
          <OutLink href={r.recordUrl}>박물관에서 보기</OutLink>
        </p>
      </figcaption>
    </figure>
  )
}

export default function MuseumScene({ pack }: { pack: Pack }) {
  /* MuseumBanner 와 같은 고르기 규칙 — 사진으로 확인되는 것만 24장.
     지도·문서가 전폭에 걸리면 "왜 이게 크지?"가 된다. */
  const shots = useMemo(() => {
    const isPhoto = (r: MuseumRec) => /사진/.test(r.form || '') || (!r.form && /사진/.test(r.title || ''))
    const seen = new Set<number>()
    return pack.museum.records
      .filter(r => r.imageUrl && r.recordUrl && isPhoto(r) && !seen.has(r.iId) && seen.add(r.iId))
      .slice(0, 24)
  }, [pack])

  return (
    <>
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>통일부 남북이산가족 디지털박물관</p>
        <h2 className={`mt-1.5 ${TYPE.h2} ${TEXT.ink}`}>기증해 주신 사진</h2>
        <p className={`mt-1 ${TYPE.sub} ${TEXT.soft}`}>
          실향민과 가족이 맡기신 기록물입니다. 지금 {nf(pack.tour.totalRecords)}건이 박물관에 공개되어 있습니다.
        </p>
      </header>

      {shots.length > 0 && (
        /* 런웨이 구간 6 → 8: 6이면 휠 한 노치(120px)가 카드 1.33장을 넘겨 사진 한 장 앞에
             멈출 수가 없었다(실측). 8이면 카드당 약 132px 로 한 노치가 한 장 아래로 내려온다. */
        <PinnedDeck
          label="기증 사진"
          segments={8}
          className="mt-3"
          items={shots.map((r, i) => <PhotoCard key={r.iId} r={r} eager={i < 3} />)}
        />
      )}

      <p className={`mt-3 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        사진은 박물관 원본을 그대로 불러온 것이며, 본 화면은 저장하거나 다시 배포하지 않습니다 —
        기증자의 저작물이기 때문입니다. 이미지가 보이지 않으면 박물관이 외부 참조를 막은 것입니다.
      </p>

      {/* ── 박물관 묶음 — 씬 꼬리 뒤 일반 구획(승격하지 않는다) ── */}
      <div className="mt-5">
        <MuseumTour data={pack.tour} />
      </div>
    </>
  )
}
