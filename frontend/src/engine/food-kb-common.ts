// 흔한 일상·정크푸드 KB(수기 큐레이션) — "고지혈증에 삼겹살", "당뇨에 콜라" 등 캐주얼 질문 대응.
// 안전 프레이밍: 대부분 '주의(caution)' 수준. 치료·완치 단정 없음(§10·§13.8).
import type { FoodEntry } from './food-kb'

export const FOOD_KB_COMMON: FoodEntry[] = [
  { name: '삼겹살', aka: ['돼지고기', '목살', '오겹살', 'pork belly'], components: ['포화지방', '단백질', '콜레스테롤', '비타민B1'],
    effects: [
      { condition: '콜레스테롤·이상지질혈증', effect: '포화지방·콜레스테롤이 많은 편이라 이상지질혈증이 있다면 섭취량에 주의가 필요해요.', level: 'caution' },
      { condition: '심혈관·혈관', effect: '포화지방을 많이 먹으면 심혈관 건강에 부담이 될 수 있어 굽는 방식·섭취량에 주의가 필요해요.', level: 'caution' },
      { condition: '근육·단백질', effect: '단백질원이지만 지방·열량이 높아 살코기 위주·적정량이 권장돼요.', level: 'research' },
    ] },
  { name: '라면', aka: ['컵라면', '봉지라면', '인스턴트라면', 'ramen'], components: ['나트륨', '정제 탄수화물', '포화지방(유탕면)'],
    effects: [
      { condition: '혈압·고혈압', effect: '나트륨(소금)이 매우 많은 편이라 고혈압이 있다면 국물·스프 섭취에 특히 주의가 필요해요.', level: 'caution' },
      { condition: '혈당·당뇨', effect: '정제 탄수화물 위주라 혈당이 빠르게 오를 수 있어 당뇨가 있다면 섭취량에 주의가 필요해요.', level: 'caution' },
      { condition: '체중·비만', effect: '열량·지방이 높은 편이라 자주 먹으면 체중 관리에 주의가 필요해요.', level: 'caution' },
    ] },
  { name: '치킨', aka: ['후라이드치킨', '튀긴 닭', '닭튀김', 'fried chicken'], components: ['포화지방(튀김)', '단백질', '나트륨'],
    effects: [
      { condition: '콜레스테롤·이상지질혈증', effect: '튀김 기름의 포화지방이 많아 이상지질혈증이 있다면 섭취량에 주의가 필요해요.', level: 'caution' },
      { condition: '체중·비만', effect: '튀김 옷·기름으로 열량이 높아 체중 관리 중이라면 주의가 필요해요.', level: 'caution' },
    ] },
  { name: '피자', aka: ['pizza'], components: ['포화지방(치즈)', '나트륨', '정제 탄수화물'],
    effects: [
      { condition: '콜레스테롤·이상지질혈증', effect: '치즈·가공육의 포화지방이 많아 이상지질혈증이 있다면 주의가 필요해요.', level: 'caution' },
      { condition: '혈압·고혈압', effect: '나트륨이 높은 편이라 고혈압이 있다면 섭취량에 주의가 필요해요.', level: 'caution' },
    ] },
  { name: '햄버거', aka: ['버거', 'hamburger', '패스트푸드'], components: ['포화지방', '나트륨', '정제 탄수화물'],
    effects: [
      { condition: '심혈관·혈관', effect: '포화지방·나트륨이 높은 편이라 자주 먹으면 심혈관 건강에 부담이 될 수 있어요.', level: 'caution' },
      { condition: '체중·비만', effect: '열량이 높아 체중 관리 중이라면 빈도·양에 주의가 필요해요.', level: 'caution' },
    ] },
  { name: '콜라', aka: ['탄산음료', '사이다', '소다', 'cola', '청량음료'], components: ['첨가당(액상과당)', '카페인(콜라)', '인산'],
    effects: [
      { condition: '혈당·당뇨', effect: '첨가당이 많아 혈당을 빠르게 올릴 수 있어 당뇨가 있다면 주의가 필요해요(제로/무가당 제외).', level: 'caution' },
      { condition: '체중·비만', effect: '당으로 인한 열량이 높아 자주 마시면 체중 관리에 주의가 필요해요.', level: 'caution' },
      { condition: '치아·뼈건강', effect: '당과 산이 치아 부식과 관련될 수 있어 섭취 후 양치 등 관리가 필요해요.', level: 'caution' },
    ] },
  { name: '소주', aka: ['술', '음주', '알코올', '맥주', '막걸리', '와인', '위스키'], components: ['알코올(에탄올)'],
    effects: [
      { condition: '간건강', effect: '알코올은 간에 부담을 주어 간건강이 좋지 않다면 절주·금주가 권장돼요.', level: 'caution' },
      { condition: '통풍·요산', effect: '특히 맥주·과음은 요산을 높여 통풍을 악화시킬 수 있어 주의가 필요해요.', level: 'caution' },
      { condition: '혈압·고혈압', effect: '과음은 혈압을 올릴 수 있어 고혈압이 있다면 절주가 권장돼요.', level: 'caution' },
    ] },
  { name: '흰빵', aka: ['식빵', '흰쌀밥', '백미', '흰 빵'], components: ['정제 탄수화물', '글루텐(빵)'],
    effects: [
      { condition: '혈당·당뇨', effect: '정제 탄수화물이라 혈당이 빠르게 오를 수 있어 당뇨가 있다면 통곡물 대체·섭취량 조절이 권장돼요.', level: 'caution' },
    ] },
  { name: '떡볶이', aka: ['분식', '떡뽁이'], components: ['정제 탄수화물(떡)', '당(양념)', '나트륨'],
    effects: [
      { condition: '혈당·당뇨', effect: '떡·양념의 탄수화물·당이 많아 혈당이 오를 수 있어 당뇨가 있다면 주의가 필요해요.', level: 'caution' },
      { condition: '혈압·고혈압', effect: '나트륨이 높은 편이라 고혈압이 있다면 섭취량에 주의가 필요해요.', level: 'caution' },
    ] },
  { name: '아이스크림', aka: ['빙과', '하드', '소프트아이스크림'], components: ['첨가당', '포화지방(유지방)'],
    effects: [
      { condition: '혈당·당뇨', effect: '당이 많아 혈당을 올릴 수 있어 당뇨가 있다면 섭취량에 주의가 필요해요.', level: 'caution' },
      { condition: '체중·비만', effect: '당·지방으로 열량이 높아 자주 먹으면 체중 관리에 주의가 필요해요.', level: 'caution' },
    ] },
  { name: '가공육', aka: ['햄', '소시지', '베이컨', '핫도그', '스팸'], components: ['나트륨', '아질산염', '포화지방'],
    effects: [
      { condition: '암·항산화', effect: '가공육은 세계보건기구가 대장암 위험과 관련해 분류한 식품으로, 자주·많이 먹는 것은 주의가 필요해요.', level: 'caution' },
      { condition: '혈압·고혈압', effect: '나트륨이 많아 고혈압이 있다면 섭취량에 주의가 필요해요.', level: 'caution' },
    ] },
  { name: '과자', aka: ['스낵', '감자칩', '비스킷', '쿠키'], components: ['당', '트랜스지방·포화지방', '나트륨'],
    effects: [
      { condition: '혈당·당뇨', effect: '당·정제 탄수화물이 많아 혈당을 올릴 수 있어 당뇨가 있다면 주의가 필요해요.', level: 'caution' },
      { condition: '콜레스테롤·이상지질혈증', effect: '일부 과자의 트랜스·포화지방은 혈중 지질에 좋지 않아 섭취량에 주의가 필요해요.', level: 'caution' },
    ] },
  { name: '감자튀김', aka: ['프렌치프라이', '감자칩', 'french fries'], components: ['포화지방(튀김)', '나트륨', '정제 탄수화물'],
    effects: [
      { condition: '콜레스테롤·이상지질혈증', effect: '튀김 기름의 지방이 많아 이상지질혈증이 있다면 섭취량에 주의가 필요해요.', level: 'caution' },
      { condition: '혈압·고혈압', effect: '소금이 많이 들어가 고혈압이 있다면 주의가 필요해요.', level: 'caution' },
    ] },
  { name: '사탕', aka: ['캔디', '젤리', '카라멜'], components: ['당(설탕)'],
    effects: [
      { condition: '혈당·당뇨', effect: '거의 순수한 당이라 혈당을 빠르게 올려 당뇨가 있다면 주의가 필요해요.', level: 'caution' },
      { condition: '치아', effect: '당이 치아 우식(충치)과 관련돼 섭취 후 양치 등 관리가 필요해요.', level: 'caution' },
    ] },
  { name: '에너지드링크', aka: ['에너지음료', '핫식스', '레드불', '몬스터'], components: ['카페인', '첨가당', '타우린'],
    effects: [
      { condition: '수면·불면', effect: '카페인이 많아 늦은 시간 섭취 시 불면·심계항진에 주의가 필요해요.', level: 'caution' },
      { condition: '혈당·당뇨', effect: '당이 많은 제품은 혈당을 올릴 수 있어 당뇨가 있다면 주의가 필요해요.', level: 'caution' },
    ] },
]
