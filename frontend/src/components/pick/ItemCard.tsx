import { useState } from 'react'
import { FONT, SURFACE, TYPE, TEXT, PROSE } from '../../theme/gohyang'
import type { PickFood, PickScenery, PickWord } from '../../lib/pickData'
import PICK_PHOTOS, { type PickPhoto } from '../../data/pick-photos'

/* ────────────────────────────────────────────────────────────────
   참여 월드컵 — 카드 한 장 (음식·풍경·말 공통 틀)

   출처 구분의 시각 문법 (절대규칙: 섞지 않는다)
     · 통일부 자료(말)          = 남색 칩
     · 문화적 통설(음식 지역)   = 회색 칩 + 「통일부 자료 아님」 문구
     · 풍경 사진               = 제공처 표기 필수(저작권자) + 지역은 근사 대응 고지
     · 음식·말 참고 사진        = 위키미디어 공용(라이선스 재검증 산출물 pick-photos.ts)
       — 캡션에 「참고 사진」임과 실물과의 차이를 적고, 작가·라이선스를 반드시 병기(CC 표시 의무).
       사진이 없는 항목은 글자 카드가 설계다(엉뚱한 사진을 억지로 붙이는 것이 최악).
   명조 = 이름(사람의 말) · 고딕 = 배지·제공처·설명(기계의 값).
   사진이 안 떠도 게임은 계속된다 — onerror 시 글자 카드로 폴백.
   ★ 이 카드는 Tournament 에서 <button> 안에 렌더된다 — 카드 안에 <a> 금지.
     사진 출처 링크는 결과 화면(PickResult — button 밖)에서만 건다.
   ──────────────────────────────────────────────────────────────── */

export type CardItem =
  | { game: 'food'; food: PickFood }
  | { game: 'scene'; scene: PickScenery }
  | { game: 'word'; word: PickWord }

export function itemName(it: CardItem): string {
  return it.game === 'food' ? it.food.name : it.game === 'scene' ? it.scene.name : it.word.nk
}
export function itemKey(it: CardItem): string {
  return it.game === 'food' ? it.food.id : it.game === 'scene' ? it.scene.id : it.word.id
}
export function itemRegionId(it: CardItem): string | null {
  return it.game === 'food' ? it.food.regionId : it.game === 'scene' ? it.scene.regionId : null
}
export function itemRegionName(it: CardItem): string | null {
  return it.game === 'food' ? it.food.region : it.game === 'scene' ? it.scene.region : null
}

/** 지역 배지 — 문화적 통설(음식)은 회색, 실측 대응(풍경)은 남색 계열이되 근사임을 꼬리에 적는다 */
function RegionChip({ name, folk }: { name: string; folk: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 ${TYPE.cap} font-semibold ring-1 ${
        folk
          ? 'bg-[#eef1f5] text-[#555555] ring-[#dcdfe4] dark:bg-[#1a1f26] dark:text-[#a4acb6] dark:ring-[#2a2f36]'
          : 'bg-[#eef3fb] text-[#1a4e9c] ring-[#cfdcef] dark:bg-[#16202c] dark:text-[#7aa9e8] dark:ring-[#27364a]'
      }`}
    >
      {name}
    </span>
  )
}

function SceneImage({ scene, big }: { scene: PickScenery; big?: boolean }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div className={`flex aspect-[4/3] w-full items-center justify-center ${SURFACE.inset}`}>
        <p className={`${TYPE.sub} ${TEXT.faint} ${PROSE} px-4 text-center`}>사진을 불러오지 못했습니다</p>
      </div>
    )
  }
  return (
    <img
      src={big ? scene.viewUrl : scene.thumbUrl}
      alt={scene.caption}
      loading="lazy"
      className="aspect-[4/3] w-full bg-[#f5f7fa] object-cover"
      onError={() => setBroken(true)}
    />
  )
}

/** 카드에서 쓸 참고 사진 — 라이선스 재검증을 통과해 pick-photos.ts 에 실린 항목만 */
export function photoOf(item: CardItem): PickPhoto | null {
  if (item.game === 'scene') return null
  return PICK_PHOTOS[itemKey(item)] ?? null
}

/** 음식·말 이름 글자 카드 — 사진이 없거나 못 불러온 항목의 기본 모습 */
function TextFace({ item, big }: { item: CardItem; big?: boolean }) {
  return (
    <div className={`flex aspect-[4/3] w-full items-center justify-center ${SURFACE.inset} p-4`}>
      <p
        className={`${big ? 'text-[2.125rem]' : 'text-[1.75rem]'} font-bold leading-snug ${TEXT.ink} ${PROSE} text-center`}
        style={{ fontFamily: FONT.serif }}
      >
        {item.game === 'food' ? item.food.name : item.game === 'word' ? item.word.nk : ''}
      </p>
    </div>
  )
}

/** 음식·말 참고 사진 + 저작자 표시(CC 요구사항 — 글자만, 링크는 결과 화면에서) */
function PhotoFace({ item, photo, big }: { item: CardItem; photo: PickPhoto; big?: boolean }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <TextFace item={item} big={big} />
  const caption =
    item.game === 'word'
      ? `표준어 '${item.word.ko}'의 참고 사진${photo.caption !== item.word.ko ? ` — ${photo.caption}` : ''}`
      : photo.caption
  return (
    <div>
      <img
        src={photo.src}
        alt={caption}
        loading="lazy"
        className="aspect-[4/3] w-full bg-[#f5f7fa] object-cover"
        onError={() => setBroken(true)}
      />
      <p className={`px-3.5 pt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        {caption} · {photo.author} · {photo.license} · 위키미디어 공용
      </p>
    </div>
  )
}

export default function ItemCard({ item, big }: { item: CardItem; big?: boolean }) {
  const nameSize = big ? 'text-[1.625rem]' : 'text-[1.3125rem]'
  const photo = photoOf(item)
  return (
    <div className={`overflow-hidden ${SURFACE.card}`}>
      {/* ── 그림 구획 — 비율 블록(4:3)이 동일해 사진/글자 혼재에도 그리드 균형이 맞는다 ── */}
      {item.game === 'scene' ? (
        <SceneImage scene={item.scene} big={big} />
      ) : photo ? (
        <PhotoFace item={item} photo={photo} big={big} />
      ) : (
        <TextFace item={item} big={big} />
      )}

      {/* ── 글자 구획 ── */}
      <div className="p-3.5">
        <p className={`${nameSize} font-bold leading-snug ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
          {itemName(item)}
        </p>

        {item.game === 'food' && (
          <>
            <p className={`mt-1.5 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{item.food.desc}</p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5">
              <RegionChip name={item.food.region} folk />
              <span className={`${TYPE.cap} ${TEXT.faint}`}>문화적 통설 · 통일부 자료 아님</span>
            </p>
          </>
        )}

        {item.game === 'scene' && (
          <>
            <p className="mt-2 flex flex-wrap items-center gap-1.5">
              <RegionChip name={item.scene.region} folk={false} />
              <span className={`${TYPE.cap} ${TEXT.faint}`}>광복 당시 행정구역으로 옮긴 근사</span>
            </p>
            <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>제공: {item.scene.provider} · 통일부 「나의 살던 고향은」 게재</p>
          </>
        )}

        {item.game === 'word' && (
          <>
            <p className={`mt-1.5 ${TYPE.sub} ${TEXT.soft}`}>표준어: <b className={`font-semibold ${TEXT.ink}`}>{item.word.ko}</b></p>
            <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>통일부 「남북한 언어비교」 21,985쌍 중 · 지역 방언이 아닙니다</p>
          </>
        )}
      </div>
    </div>
  )
}
