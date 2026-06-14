// 성분·제품 분석 — "박카스/비타500/○○제품 먹으면 효과 있나?" 류 질문 대응.
// ★법적 안전: 제품의 효과를 단정하지 않고 '성분의 일반적 효능'만 안내(명예훼손·부당광고 회피).
// 데이터: 식약처 인정기능성(공개 사실) + 일반에 널리 알려진 성분 정보. 라이브 식약처 API는 키 활용신청 후 연동 예정.
import { findInText } from './ontology'

export interface IngredientInfo { efficacy: string; mfds?: boolean; caution?: string }

// 성분 → 효능(‘도움이 될 수 있다’ 톤). mfds=식약처 인정기능성
export const INGREDIENTS: Record<string, IngredientInfo> = {
  타우린: { efficacy: '피로 개선·간 기능 보조에 흔히 쓰이는 아미노산이에요.' },
  카페인: { efficacy: '일시적인 각성·졸음 해소에 도움이 될 수 있어요.', caution: '과다 섭취 시 두근거림·불면에 주의' },
  '비타민B군': { efficacy: '에너지(탄수화물·단백질) 대사에 필요한 영양소예요.', mfds: true },
  이노시톨: { efficacy: '지질 대사에 관여하는 성분이에요.' },
  비타민C: { efficacy: '항산화 작용과 결합조직·면역 기능 유지에 도움이 될 수 있어요.', mfds: true },
  비타민D: { efficacy: '칼슘 흡수와 뼈 건강에 도움이 될 수 있어요.', mfds: true },
  칼슘: { efficacy: '뼈와 치아 형성에 필요한 영양소예요.', mfds: true },
  마그네슘: { efficacy: '에너지 대사와 신경·근육 기능에 필요해요.', mfds: true },
  아연: { efficacy: '정상적인 면역 기능과 세포 분열에 필요해요.', mfds: true },
  홍삼: { efficacy: '면역력 증진·피로 개선·혈행 개선·항산화에 도움을 줄 수 있어요.', mfds: true },
  오메가3: { efficacy: '혈중 중성지방 개선·혈행 개선에 도움을 줄 수 있어요.', mfds: true },
  가르시니아: { efficacy: '체지방 감소에 도움을 줄 수 있어요.', mfds: true },
  글루코사민: { efficacy: '관절·연골 건강에 도움을 줄 수 있어요.', mfds: true },
  밀크씨슬: { efficacy: '간 건강에 도움을 줄 수 있어요(실리마린).', mfds: true },
  루테인: { efficacy: '눈의 황반색소 밀도 유지에 도움을 줄 수 있어요.', mfds: true },
  유산균: { efficacy: '유익균 증식·배변활동 원활(장 건강)에 도움을 줄 수 있어요.', mfds: true },
  '코엔자임Q10': { efficacy: '항산화와 높은 혈압 감소에 도움을 줄 수 있어요.', mfds: true },
  쏘팔메토: { efficacy: '전립선 건강에 도움을 줄 수 있어요.', mfds: true },
  콜라겐: { efficacy: '피부 보습에 도움을 줄 수 있어요.', mfds: true },
  은행잎추출물: { efficacy: '혈행 개선·기억력 개선에 도움을 줄 수 있어요.', mfds: true },
  헛개: { efficacy: '간 건강(알코올성 손상 보호 등)에 도움을 줄 수 있어요.', mfds: true },
  비타민A: { efficacy: '어두운 곳 시각 적응과 피부·점막 형성에 필요해요.', mfds: true },
  엽산: { efficacy: '세포·혈액 생성과 태아 신경관 발달에 필요해요.', mfds: true },
  철분: { efficacy: '혈액 생성에 필요한 영양소예요.', mfds: true },
  아르기닌: { efficacy: '혈관·혈류와 관련해 흔히 쓰이는 아미노산이에요.' },
  구아라나: { efficacy: '카페인을 함유해 일시적 각성에 쓰여요.', caution: '카페인 과다 주의' },
  프로폴리스: { efficacy: '구강에서의 항균 작용에 도움을 줄 수 있어요.', mfds: true },
}

// 제품 → {제조사, 분류, 성분}. 널리 알려진 제품 중심(라이브 API 연동 전 큐레이션).
export interface ProductInfo { maker?: string; category: string; ingredients: string[] }
export const PRODUCTS: Record<string, ProductInfo> = {
  박카스: { maker: '동아제약', category: '의약외품(자양강장 드링크)', ingredients: ['타우린', '카페인', '비타민B군', '이노시톨'] },
  비타500: { maker: '광동제약', category: '비타민 음료', ingredients: ['비타민C'] },
  비타오백: { maker: '광동제약', category: '비타민 음료', ingredients: ['비타민C'] },
  컨디션: { maker: 'HK이노엔', category: '숙취해소 음료', ingredients: ['헛개'] },
  여명808: { category: '숙취해소 음료', ingredients: ['헛개'] },
  모닝케어: { maker: '동아제약', category: '숙취해소 음료', ingredients: ['헛개'] },
  아로나민골드: { maker: '일동제약', category: '의약품(종합비타민)', ingredients: ['비타민B군', '비타민C', '비타민E'] },
  삐콤씨: { maker: '유한양행', category: '의약품(비타민)', ingredients: ['비타민B군', '비타민C'] },
  센트룸: { category: '종합비타민·미네랄', ingredients: ['비타민C', '비타민D', '아연', '마그네슘', '철분'] },
  우루사: { maker: '대웅제약', category: '의약품(간 기능)', ingredients: ['타우린'] },
  레모나: { maker: '경남제약', category: '비타민C 보충제', ingredients: ['비타민C', '비타민B군'] },
  정관장: { maker: '한국인삼공사', category: '건강기능식품(홍삼)', ingredients: ['홍삼'] },
  홍삼정: { category: '건강기능식품(홍삼)', ingredients: ['홍삼'] },
  헛개수: { category: '음료', ingredients: ['헛개'] },
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

export interface ProductAnalysis {
  kind: 'product' | 'ingredient'
  name: string
  maker?: string
  category?: string
  ingredients: { name: string; info: IngredientInfo }[]
}

// 텍스트에서 제품 또는 성분을 인식해 성분별 효능 분석을 돌려줌. 없으면 null.
export function analyzeProduct(text: string): ProductAnalysis | null {
  const t = norm(text)
  // 1) 제품명(최장 일치)
  let bestP: { name: string; info: ProductInfo; len: number } | undefined
  for (const [name, info] of Object.entries(PRODUCTS)) {
    if (t.includes(norm(name)) && (!bestP || name.length > bestP.len)) bestP = { name, info, len: name.length }
  }
  if (bestP) {
    return {
      kind: 'product', name: bestP.name, maker: bestP.info.maker, category: bestP.info.category,
      ingredients: bestP.info.ingredients.map((n) => ({ name: n, info: INGREDIENTS[n] ?? { efficacy: '일반적으로 알려진 효능 정보가 충분치 않아요.' } })),
    }
  }
  // 2) 성분 직접 언급(최장 일치)
  let bestI: { name: string; len: number } | undefined
  for (const name of Object.keys(INGREDIENTS)) {
    if (t.includes(norm(name)) && (!bestI || name.length > bestI.len)) bestI = { name, len: name.length }
  }
  if (bestI) {
    return { kind: 'ingredient', name: bestI.name, ingredients: [{ name: bestI.name, info: INGREDIENTS[bestI.name] }] }
  }
  return null
}

// 질문에 특정 효능/질환 의도가 있으면, 그 성분 중 관련된 게 있는지 짚어줌(없으면 honest).
export function targetMatchNote(a: ProductAnalysis, claim: string): string | null {
  const disease = findInText(claim, 'disease')
  if (!disease) return null
  // 성분 효능 텍스트에 질환/기능 키워드가 들어있나(느슨)
  const dz = disease.canonical
  const hit = a.ingredients.find((i) => i.info.efficacy.includes(dz) || (dz === '비만' && /체지방/.test(i.info.efficacy)) || (dz === '면역기능' && /면역/.test(i.info.efficacy)) || (dz === '간건강' && /간/.test(i.info.efficacy)))
  if (hit) return `이 중 ${hit.name}은(는) ${dz} 관련으로 알려진 성분이에요. 다만 제품의 효과를 보장하는 건 아니에요.`
  return `‘${dz}’에 직접 효과가 인정된 성분은 뚜렷이 보이지 않아요. 표시된 효능·효과와 전문가 안내를 확인하세요.`
}
