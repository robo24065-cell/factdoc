import { useState } from 'react'
import { FONT, SURFACE, TYPE, TEXT, PROSE } from '../../theme/gohyang'
import type { PickFood, PickScenery, PickWord } from '../../lib/pickData'

/* ────────────────────────────────────────────────────────────────
   참여 월드컵 — 카드 한 장 (음식·풍경·말 공통 틀)

   출처 구분의 시각 문법 (절대규칙: 섞지 않는다)
     · 통일부 자료(말)          = 남색 칩
     · 문화적 통설(음식 지역)   = 회색 칩 + 「통일부 자료 아님」 문구
     · 풍경 사진               = 제공처 표기 필수(저작권자) + 지역은 근사 대응 고지
   명조 = 이름(사람의 말) · 고딕 = 배지·제공처·설명(기계의 값).
   사진이 안 떠도 게임은 계속된다 — onerror 시 회색 상자 + 명소명 유지.
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

export default function ItemCard({ item, big }: { item: CardItem; big?: boolean }) {
  const nameSize = big ? 'text-[1.625rem]' : 'text-[1.3125rem]'
  return (
    <div className={`overflow-hidden ${SURFACE.card}`}>
      {/* ── 그림 구획 ── */}
      {item.game === 'scene' ? (
        <SceneImage scene={item.scene} big={big} />
      ) : (
        <div className={`flex aspect-[4/3] w-full items-center justify-center ${SURFACE.inset} p-4`}>
          <p
            className={`${big ? 'text-[2.125rem]' : 'text-[1.75rem]'} font-bold leading-snug ${TEXT.ink} ${PROSE} text-center`}
            style={{ fontFamily: FONT.serif }}
          >
            {item.game === 'food' ? item.food.name : item.word.nk}
          </p>
        </div>
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
