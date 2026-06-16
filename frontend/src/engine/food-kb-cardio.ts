// DASH·심혈관 식단 식품의 질환 도메인별 효과 — 잘 확립된 역학/임상 연구 근거 수준(대부분 research, 일부 식약처 고시 mfds, 약한 건 folk).
// 모든 효과는 '도움이 될 수 있다·연구된 바 있다' 수준 + "(공식 효능 인정은 아님)" 한정. 치료·완치·예방 단정 금지(부당광고 회피, §13.8).
// condition 라벨에 질환 canonical(고혈압·이상지질혈증·제2형당뇨·심혈관질환·비만·장건강·골다공증)을 포함 → verifyOne의 도메인 매칭.
// 출처 성격: KNHANES·대한고혈압학회·DASH 연구 등 공개 역학근거를 요약(원문 재배포 아님). 양배추·오렌지는 생성+적대검증 워크플로 통과분.
import type { FoodEntry } from './food-kb'

export const FOOD_CARDIO: FoodEntry[] = [
  { name: '현미', aka: ['현미밥', 'brown rice', '현미쌀'], components: ['식이섬유', '칼륨', '마그네슘'], effects: [
    { condition: '혈압·고혈압', effect: '칼륨·마그네슘과 식이섬유가 풍부한 통곡물로, 흰쌀 대신 섭취 시 혈압 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '제2형당뇨·혈당', effect: '정제곡물보다 혈당지수가 낮고 식이섬유가 많아 식후 혈당 상승 완화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '이상지질혈증·콜레스테롤', effect: '식이섬유가 콜레스테롤 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '장건강·변비', effect: '식이섬유가 배변 활동·장 건강에 도움이 될 수 있어요.', level: 'research' },
  ] },
  { name: '보리', aka: ['보리밥', '겉보리', '쌀보리', 'barley'], components: ['베타글루칸', '식이섬유'], effects: [
    { condition: '이상지질혈증·콜레스테롤', effect: '보리의 베타글루칸은 혈중 콜레스테롤 개선과 관련해 식약처가 기능성을 인정한 원료예요(다만 식단 보조 수준이며 질병 치료는 아님).', level: 'mfds' },
    { condition: '혈압·고혈압', effect: '칼륨·식이섬유가 풍부한 통곡물로 혈압 관리 식단에서 활용되곤 해요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '제2형당뇨·혈당', effect: '베타글루칸·식이섬유가 식후 혈당 상승 완화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '장건강·변비', effect: '식이섬유가 배변 활동에 도움이 될 수 있어요.', level: 'research' },
  ] },
  { name: '귀리', aka: ['오트밀', '귀리밥', 'oat', 'oatmeal', '압착귀리'], components: ['베타글루칸', '식이섬유'], effects: [
    { condition: '이상지질혈증·콜레스테롤', effect: '귀리 베타글루칸은 혈중 콜레스테롤 개선과 관련해 식약처가 기능성을 인정한 원료예요(식단 보조 수준이며 질병 치료는 아님).', level: 'mfds' },
    { condition: '제2형당뇨·혈당', effect: '베타글루칸이 식후 혈당 상승을 완만하게 하는 것과 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '혈압·고혈압', effect: '통곡물 섭취가 혈압 관리와 관련해 역학적으로 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '장건강·변비', effect: '식이섬유가 배변 활동·포만감에 도움이 될 수 있어요.', level: 'research' },
  ] },
  { name: '통밀', aka: ['통밀빵', '통밀가루', 'whole wheat'], components: ['식이섬유'], effects: [
    { condition: '심혈관질환', effect: '통곡물(통밀) 섭취가 심혈관 위험요인 관리와 관련해 역학적으로 연구된 바 있어요(단일 식품의 직접 효과로 단정하긴 어려움, 공식 효능 인정은 아님).', level: 'research' },
    { condition: '제2형당뇨·혈당', effect: '정제 밀가루보다 식이섬유가 많아 혈당 관리 식단에서 권장되곤 해요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '장건강·변비', effect: '식이섬유가 배변 활동에 도움이 될 수 있어요.', level: 'research' },
  ] },
  { name: '시금치', aka: ['시금치나물', 'spinach'], components: ['칼륨', '질산염', '마그네슘', '비타민K'], effects: [
    { condition: '혈압·고혈압', effect: '칼륨·마그네슘과 식이질산염이 혈관 이완·혈압 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '심혈관질환', effect: '잎채소 섭취가 심혈관 건강과 관련해 역학적으로 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '골다공증·뼈', effect: '비타민K가 정상적인 뼈 건강 유지와 관련해 알려져 있어요(공식 효능 인정은 아님).', level: 'folk' },
  ] },
  { name: '케일', aka: ['kale'], components: ['칼륨', '비타민K', '항산화성분'], effects: [
    { condition: '혈압·고혈압', effect: '칼륨이 풍부한 잎채소로 혈압 관리 식단(DASH)에서 활용되곤 해요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '심혈관질환', effect: '십자화과·잎채소 섭취가 심혈관 건강과 관련해 역학적으로 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
  ] },
  { name: '양파', aka: ['양파즙', 'onion'], components: ['케르세틴', '황화합물'], effects: [
    { condition: '혈압·고혈압', effect: '케르세틴 등 플라보노이드가 혈압 관리와 관련해 일부 연구에서 검토된 바 있어요(근거 제한적, 공식 효능 인정은 아님).', level: 'research' },
    { condition: '이상지질혈증·콜레스테롤', effect: '황화합물·케르세틴이 혈중 지질과 관련해 연구된 바 있으나 근거는 제한적이에요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '심혈관질환', effect: '항산화 성분이 혈관 건강과 관련해 검토된 바 있어요(인과적 예방·치료 효과를 뜻하지 않음).', level: 'folk' },
  ] },
  { name: '마늘', aka: ['생마늘', '마늘즙', 'garlic'], components: ['알리신', '황화합물'], effects: [
    { condition: '혈압·고혈압', effect: '마늘(알리신 등)이 혈압 관리와 관련해 여러 연구에서 검토되었고 일부 메타분석에서 소폭 관련성이 보고됐어요(공식 효능 인정은 아님, 보조적).', level: 'research' },
    { condition: '이상지질혈증·콜레스테롤', effect: '혈중 지질과 관련해 연구된 바 있으나 결과는 일관되지 않아요(근거 제한적, 공식 효능 인정은 아님).', level: 'research' },
    { condition: '심혈관질환', effect: '항산화·황화합물이 혈관 건강과 관련해 검토된 바 있어요(인과적 효과로 단정하긴 어려움).', level: 'folk' },
  ] },
  { name: '바나나', aka: ['banana'], components: ['칼륨', '식이섬유'], effects: [
    { condition: '혈압·고혈압', effect: '칼륨이 풍부해 나트륨 배출·혈압 관리와 관련해 연구된 바 있어요(신장질환이 있으면 칼륨 섭취 주의, 공식 효능 인정은 아님).', level: 'research' },
    { condition: '장건강·변비', effect: '식이섬유가 배변 활동에 도움이 될 수 있어요.', level: 'folk' },
  ] },
  { name: '토마토', aka: ['방울토마토', 'tomato'], components: ['칼륨', '리코펜'], effects: [
    { condition: '혈압·고혈압', effect: '칼륨이 혈압 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '심혈관질환', effect: '리코펜 등 항산화 성분이 심혈관 위험요인과 관련해 역학적으로 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
  ] },
  { name: '블루베리', aka: ['blueberry', '베리류'], components: ['안토시아닌', '항산화성분'], effects: [
    { condition: '심혈관질환', effect: '안토시아닌 등 폴리페놀이 혈관 기능·심혈관 위험요인과 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '혈압·고혈압', effect: '베리류 섭취가 혈압 관리와 관련해 일부 연구에서 검토된 바 있어요(근거 제한적).', level: 'folk' },
  ] },
  { name: '연어', aka: ['salmon', '훈제연어'], components: ['오메가3', 'EPA', 'DHA'], effects: [
    { condition: '심혈관질환', effect: '오메가3(EPA·DHA)가 풍부한 등푸른생선으로, 오메가3는 혈중 중성지방 개선·혈행에 도움과 관련해 식약처가 기능성을 인정한 성분이에요(식품 보조 수준, 질병 치료는 아님).', level: 'research' },
    { condition: '이상지질혈증·콜레스테롤', effect: '오메가3 지방산이 혈중 중성지방 관리와 관련해 연구된 바 있어요(공식 효능 인정은 성분 기준이며 식품 단독 치료는 아님).', level: 'research' },
  ] },
  { name: '고등어', aka: ['mackerel', '간고등어'], components: ['오메가3', 'EPA', 'DHA'], effects: [
    { condition: '심혈관질환', effect: '오메가3가 풍부한 등푸른생선으로 심혈관 위험요인(중성지방 등) 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님, 보조적).', level: 'research' },
    { condition: '이상지질혈증·콜레스테롤', effect: '오메가3 지방산이 혈중 중성지방과 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
  ] },
  { name: '호두', aka: ['walnut'], components: ['오메가3', '불포화지방'], effects: [
    { condition: '이상지질혈증·콜레스테롤', effect: '불포화지방·식물성 오메가3가 혈중 지질과 관련해 연구된 바 있어요(열량이 높아 하루 한 줌 수준, 공식 효능 인정은 아님).', level: 'research' },
    { condition: '심혈관질환', effect: '견과류 섭취가 심혈관 건강과 관련해 역학적으로 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
  ] },
  { name: '아몬드', aka: ['almond'], components: ['불포화지방', '비타민E', '마그네슘'], effects: [
    { condition: '이상지질혈증·콜레스테롤', effect: '불포화지방·식이섬유가 혈중 LDL 콜레스테롤과 관련해 연구된 바 있어요(열량 높아 과다섭취 주의, 공식 효능 인정은 아님).', level: 'research' },
    { condition: '심혈관질환', effect: '견과류 섭취가 심혈관 위험요인과 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
  ] },
  { name: '우유', aka: ['저지방우유', '무지방우유', '저지방 우유', '탈지우유', '저지방유제품', '유제품'], components: ['칼슘', '단백질'], effects: [
    { condition: '혈압·고혈압', effect: '저지방 유제품은 칼슘 공급원으로 DASH 식단에 포함되며 혈압 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '골다공증·뼈', effect: '칼슘이 정상적인 뼈 건강 유지에 필요해요(과다 아닌 적정 섭취 기준).', level: 'research' },
  ] },
  { name: '두부', aka: ['연두부', '순두부', '콩두부', 'tofu'], components: ['식물성단백', '이소플라본'], effects: [
    { condition: '이상지질혈증·콜레스테롤', effect: '대두 단백·이소플라본이 혈중 지질과 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '심혈관질환', effect: '동물성 지방 대신 식물성 단백 공급원으로 심혈관 건강 식단에 활용되곤 해요(공식 효능 인정은 아님).', level: 'research' },
  ] },
  { name: '대두', aka: ['콩', '메주콩', '백태', 'soybean'], components: ['식물성단백', '이소플라본', '식이섬유'], effects: [
    { condition: '이상지질혈증·콜레스테롤', effect: '대두 단백이 혈중 콜레스테롤과 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '제2형당뇨·혈당', effect: '식이섬유·식물성 단백이 혈당 관리 식단에서 활용되곤 해요(공식 효능 인정은 아님).', level: 'folk' },
    { condition: '골다공증·뼈', effect: '이소플라본이 뼈 건강과 관련해 연구된 바 있으나 근거는 제한적이에요(공식 효능 인정은 아님).', level: 'folk' },
  ] },
  { name: '고구마', aka: ['군고구마', '찐고구마', 'sweet potato'], components: ['칼륨', '식이섬유'], effects: [
    { condition: '혈압·고혈압', effect: '칼륨이 풍부해 나트륨 배출·혈압 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '장건강·변비', effect: '식이섬유가 배변 활동에 도움이 될 수 있어요.', level: 'research' },
  ] },
  { name: '미역', aka: ['미역국', '건미역', 'seaweed'], components: ['식이섬유', '칼륨'], effects: [
    { condition: '장건강·변비', effect: '수용성 식이섬유가 배변 활동·장 건강에 도움이 될 수 있어요(공식 효능 인정은 아님).', level: 'folk' },
    { condition: '혈압·고혈압', effect: '칼륨·식이섬유가 혈압 관리와 관련해 언급되나 근거는 제한적이고, 요오드 과다 섭취엔 주의가 필요해요(공식 효능 인정은 아님).', level: 'folk' },
  ] },
  // ── 생성+적대검증 워크플로 통과분 ──
  { name: '양배추', aka: ['양배추쌈', 'cabbage'], components: ['칼륨', '식이섬유', '비타민C'], effects: [
    { condition: '혈압·고혈압', effect: '양배추에 든 칼륨이 나트륨 배출을 도와 혈압 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '이상지질혈증·콜레스테롤', effect: '식이섬유가 장에서 콜레스테롤 흡수를 줄이는 기전으로 관리와 관련해 연구된 바 있어요(단독 효과 근거는 제한적, 공식 효능 인정은 아님).', level: 'research' },
    { condition: '장건강·변비', effect: '수분과 식이섬유가 풍부해 장운동·배변 활동에 도움이 될 수 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '제2형당뇨·혈당', effect: '식이섬유가 식후 혈당 상승 완화에 도움이 될 수 있다고 연구된 바 있으나 근거는 제한적이에요(공식 효능 인정은 아님).', level: 'research' },
  ] },
  { name: '오렌지', aka: ['오렌지주스', '오렌지즙', 'orange'], components: ['칼륨', '비타민C', '헤스페리딘', '펙틴'], effects: [
    { condition: '혈압·고혈압', effect: '풍부한 칼륨이 나트륨 배출을 도와 혈압 관리와 관련해 연구된 바 있어요(통식품 자체의 공식 효능 인정은 아니며 일부 연구 단계의 관련성).', level: 'research' },
    { condition: '이상지질혈증·콜레스테롤', effect: '수용성 식이섬유 펙틴과 헤스페리딘이 LDL 콜레스테롤과 관련해 일부 연구에서 검토된 바 있어요(공식 효능 인정은 아님).', level: 'research' },
    { condition: '심혈관질환', effect: '비타민C·플라보노이드와 칼륨이 혈관 건강·심혈관 위험요인과 관련해 연구된 바 있어요(인과적 예방·치료를 뜻하지 않음).', level: 'research' },
  ] },
]
