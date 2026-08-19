/* ────────────────────────────────────────────────────────────────
   S6 — 사료 핀 (기증 사진 1장 전폭, 핀 가로)

   기록 골든타임 다음, 후손 다리 앞.
   "얼마 안 남았다"를 본 사람이 "무엇이 남아 있나"를 보고, 그다음 "무엇을 할까"로 간다.

   사진 24장은 PinnedDeck(가로 덱 두 곳 중 하나)에 한 장씩 거의 전폭으로 싣는다.
   ★ 2026-08-20 — sticky 런웨이를 걷어냈다. 이 덱 하나가 페이지를 4.8화면 붙잡고 있었고,
   사진을 볼 생각이 없는 사람에게 그건 벽이었다(사용자 지적). 이제 세로 스크롤은 이 씬을
   그냥 지나가고, 가로 넘김은 덱 위의 휠·단추·키보드·손가락에서만 나온다(정보 무손실).
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
        /* 엿보임 7% — 사진은 그 자체가 주인공이라 옆 장을 크게 물리면 지금 장이 잘린 것처럼 읽힌다.
             오른쪽에 다음 사진의 가장자리만 얇게 남겨 「옆으로 더 있다」를 보여주는 정도로 둔다.
             (옛 런웨이 8구간 = 4.8화면을 걷어낸 자리다 — 2026-08-20 재설계) */
        <PinnedDeck
          label="기증 사진"
          peek={0.07}
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
