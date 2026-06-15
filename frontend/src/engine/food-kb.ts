// 음식·성분 → 질병/기능 효과 KB. build-food-kb 워크플로(생성+적대적 검증) 산출. ⚠ 수기 편집 금지(재생성으로 갱신).
// 안전 프레이밍: 치료·완치 단정 없음. level=근거강도(mfds 인정기능성/research 연구됨/folk 민간/caution 주의/none 무관).
// 총 139종 / 371개 효과.
export type FoodLevel = "mfds" | "research" | "folk" | "caution" | "none"
export interface FoodEffect { condition: string; effect: string; level: FoodLevel }
export interface FoodEntry { name: string; aka: string[]; components: string[]; effects: FoodEffect[] }

export const FOOD_KB: FoodEntry[] = [
  { name: "사과", aka: ["애플", "apple", "능금"], components: ["펙틴(식이섬유)", "퀘르세틴", "폴리페놀", "비타민C", "칼륨"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "수용성 식이섬유 펙틴이 콜레스테롤 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "장건강·변비", effect: "펙틴 등 식이섬유가 장운동과 배변 활동에 도움을 줄 수 있어요.", level: "research" },
    { condition: "항산화", effect: "퀘르세틴·폴리페놀 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "바나나", aka: ["banana"], components: ["칼륨", "식이섬유", "비타민B6", "트립토판", "마그네슘"], effects: [
    { condition: "혈압·고혈압", effect: "칼륨이 나트륨 배출·혈압 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님). 신장질환이 있다면 칼륨 섭취에 주의가 필요해요.", level: "research" },
    { condition: "장건강·변비", effect: "식이섬유가 배변 활동에 도움을 줄 수 있어요.", level: "research" },
    { condition: "혈당·당뇨", effect: "잘 익은 바나나는 당 함량이 높아 당뇨가 있다면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "블루베리", aka: ["blueberry", "블루베리농축액"], components: ["안토시아닌", "비타민C", "식이섬유", "비타민K", "폴리페놀"], effects: [
    { condition: "눈건강", effect: "안토시아닌이 눈 건강·눈 피로와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "안토시아닌 등 항산화 성분이 풍부해 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "폴리페놀이 혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "토마토", aka: ["tomato", "방울토마토"], components: ["리코펜", "비타민C", "칼륨", "베타카로틴", "식이섬유"], effects: [
    { condition: "항산화", effect: "리코펜 등 항산화 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "리코펜이 심혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "리코펜이 콜레스테롤 지표와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "키위", aka: ["kiwi", "참다래", "골드키위"], components: ["비타민C", "식이섬유", "악티니딘(효소)", "칼륨", "비타민K"], effects: [
    { condition: "면역", effect: "비타민C가 풍부해 면역 기능과 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "장건강·변비", effect: "식이섬유와 효소가 배변 활동·소화와 관련해 연구된 바 있어요.", level: "research" },
    { condition: "항산화", effect: "비타민C 등 항산화 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "포도", aka: ["grape", "거봉", "샤인머스캣"], components: ["레스베라트롤", "안토시아닌", "폴리페놀", "포도당", "칼륨"], effects: [
    { condition: "항산화", effect: "레스베라트롤·폴리페놀 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "폴리페놀이 혈관·심혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈당·당뇨", effect: "당 함량이 높은 편이라 당뇨가 있다면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "석류", aka: ["pomegranate", "석류즙", "석류농축액"], components: ["엘라그산", "안토시아닌", "폴리페놀", "비타민C"], effects: [
    { condition: "항산화", effect: "엘라그산·폴리페놀 등 항산화 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "폴리페놀이 혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "갱년기·여성건강", effect: "여성 건강에 좋다고 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "감귤", aka: ["귤", "mandarin", "tangerine", "밀감"], components: ["비타민C", "헤스페리딘", "베타크립토잔틴", "식이섬유", "칼륨"], effects: [
    { condition: "면역", effect: "비타민C가 풍부해 면역 기능과 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "비타민C·플라보노이드 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "헤스페리딘이 혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "딸기", aka: ["strawberry"], components: ["비타민C", "안토시아닌", "엘라그산", "식이섬유", "폴리페놀"], effects: [
    { condition: "면역", effect: "비타민C가 풍부해 면역 기능과 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "안토시아닌·비타민C 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "아보카도", aka: ["avocado", "악어배"], components: ["단일불포화지방(올레산)", "칼륨", "식이섬유", "비타민E", "루테인"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "단일불포화지방이 콜레스테롤 지표와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "불포화지방·칼륨이 심혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "지방·열량이 높은 편이라 체중 관리 중이라면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "수박", aka: ["watermelon"], components: ["수분", "리코펜", "시트룰린", "칼륨", "베타카로틴"], effects: [
    { condition: "항산화", effect: "리코펜 등 항산화 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈당·당뇨", effect: "혈당지수가 높은 편이라 당뇨가 있다면 섭취량에 주의가 필요해요.", level: "caution" },
    { condition: "수분보충", effect: "수분 함량이 높아 더운 날 수분 보충에 도움을 줄 수 있어요.", level: "research" },
  ] },
  { name: "배", aka: ["pear", "한국배"], components: ["수분", "식이섬유", "칼륨", "루테올린", "아르부틴"], effects: [
    { condition: "기침·호흡기", effect: "기침·가래 완화에 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "장건강·변비", effect: "식이섬유와 수분이 배변 활동에 도움을 줄 수 있어요.", level: "research" },
    { condition: "혈당·당뇨", effect: "당 함량이 있어 당뇨가 있다면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "자몽", aka: ["grapefruit", "그레이프프루트"], components: ["비타민C", "나린진(플라보노이드)", "리코펜", "식이섬유", "칼륨"], effects: [
    { condition: "약물상호작용", effect: "일부 고혈압·고지혈증 약 등과 상호작용할 수 있어 복용 중이라면 주의가 필요해요.", level: "caution" },
    { condition: "체중·비만", effect: "다이어트에 좋다고 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "항산화", effect: "비타민C·플라보노이드 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "오렌지", aka: ["orange", "발렌시아오렌지"], components: ["비타민C", "헤스페리딘", "엽산", "식이섬유", "칼륨"], effects: [
    { condition: "면역", effect: "비타민C가 풍부해 면역 기능과 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "비타민C·플라보노이드 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "헤스페리딘이 혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "레몬", aka: ["lemon", "레몬즙"], components: ["비타민C", "구연산", "플라보노이드", "칼륨", "펙틴"], effects: [
    { condition: "면역", effect: "비타민C가 풍부해 면역 기능과 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "치아건강", effect: "산도가 높아 원액을 자주 섭취하면 치아 부식에 주의가 필요해요.", level: "caution" },
    { condition: "피로·디톡스", effect: "피로 해소·해독에 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "망고", aka: ["mango"], components: ["베타카로틴", "비타민C", "식이섬유", "망기페린", "칼륨"], effects: [
    { condition: "항산화", effect: "베타카로틴·비타민C 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "눈건강", effect: "베타카로틴(비타민A 전구체)이 눈 건강과 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈당·당뇨", effect: "당 함량이 높은 편이라 당뇨가 있다면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "양배추", aka: ["캐비지", "양배추즙"], components: ["비타민U(S-메틸메티오닌)", "비타민K", "비타민C", "식이섬유", "글루코시놀레이트"], effects: [
    { condition: "위건강·위장", effect: "비타민U(S-메틸메티오닌) 성분이 위 점막과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "변비·장건강", effect: "식이섬유가 풍부해 배변활동에 필요한 영양소를 보충하는 데 도움이 될 수 있는 채소예요.", level: "research" },
    { condition: "혈액응고·약물주의", effect: "비타민K가 많아 혈액응고 관련 약(와파린 등)을 드시면 다량 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "브로콜리", aka: ["브로컬리", "녹색꽃양배추"], components: ["설포라판", "비타민C", "비타민K", "식이섬유", "엽산"], effects: [
    { condition: "항산화", effect: "설포라판·비타민C 등 항산화 성분이 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "면역", effect: "비타민C가 풍부해 정상적인 면역 기능 유지에 필요한 영양소를 보충하는 데 도움이 될 수 있어요.", level: "research" },
    { condition: "혈액응고·약물주의", effect: "비타민K가 많아 항응고제를 복용 중이라면 다량 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "시금치", aka: ["시금치나물"], components: ["철분", "엽산", "루테인", "비타민K", "식이섬유", "옥살산(수산)"], effects: [
    { condition: "눈건강", effect: "루테인이 들어 있어 눈건강과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "빈혈·조혈", effect: "철분·엽산이 들어 있어 혈액 생성에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(빈혈 치료를 대체하지는 않아요).", level: "research" },
    { condition: "신장결석·약물주의", effect: "옥살산(수산)이 많아 신장결석 병력이 있거나 항응고제를 드시면 다량 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "케일", aka: ["케일즙", "녹즙"], components: ["비타민K", "베타카로틴", "루테인", "비타민C", "칼슘", "식이섬유"], effects: [
    { condition: "항산화", effect: "베타카로틴·비타민C 등 항산화 성분이 풍부해 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "눈건강", effect: "루테인·베타카로틴이 들어 있어 눈건강과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "혈액응고·갑상선주의", effect: "비타민K가 매우 많고, 갑상선 기능 저하가 있으면 다량 생식에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "당근", aka: ["홍당무", "당근즙"], components: ["베타카로틴(프로비타민A)", "비타민A", "식이섬유", "칼륨"], effects: [
    { condition: "눈건강", effect: "베타카로틴이 체내에서 비타민A로 바뀌어 눈건강 유지에 필요한 영양소를 보충하는 데 도움이 될 수 있어요.", level: "research" },
    { condition: "항산화", effect: "베타카로틴 등 항산화 성분이 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "피부·과다주의", effect: "지나치게 많이 먹으면 일시적으로 피부가 노랗게 보이는 경우가 있어 과다 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "양파", aka: ["양파즙", "양파껍질차"], components: ["퀘르세틴", "알리신류 황화합물", "식이섬유", "프락토올리고당"], effects: [
    { condition: "혈행·심혈관", effect: "퀘르세틴 등 항산화 성분과 황화합물이 혈행·심혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "민간에서 혈중 지질에 좋다고 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "혈당·당뇨", effect: "민간에서 혈당에 좋다고 쓰이나 공식 효능은 인정되지 않았어요(혈당약을 즙·약초로 대체하면 안 돼요).", level: "folk" },
  ] },
  { name: "마늘", aka: ["흑마늘", "마늘즙", "갈릭"], components: ["알리신", "황화합물", "셀레늄", "비타민B6"], effects: [
    { condition: "혈행·심혈관", effect: "알리신 등 황화합물이 혈행·심혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "면역", effect: "민간에서 면역·기력에 좋다고 널리 쓰이나 식품으로서 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "위장·출혈주의", effect: "공복에 많이 먹으면 속쓰림이 생길 수 있고, 항응고제 복용 시 출혈 경향에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "파프리카", aka: ["피망", "컬러파프리카"], components: ["비타민C", "베타카로틴", "비타민A", "식이섬유"], effects: [
    { condition: "면역", effect: "비타민C 함량이 높아 정상적인 면역 기능 유지에 필요한 영양소를 보충하는 데 도움이 될 수 있어요.", level: "research" },
    { condition: "항산화", effect: "비타민C·베타카로틴 등 항산화 성분이 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "눈건강", effect: "베타카로틴이 들어 있어 눈건강 유지에 필요한 영양소를 보충하는 데 도움이 될 수 있어요.", level: "research" },
  ] },
  { name: "가지", aka: ["가지나물"], components: ["나스닌(안토시아닌)", "식이섬유", "칼륨", "클로로겐산"], effects: [
    { condition: "항산화", effect: "껍질의 안토시아닌(나스닌) 등 항산화 색소가 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "민간에서 혈중 지질에 좋다고 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "체중·비만", effect: "열량이 낮고 식이섬유가 있어 식단 조절 시 부담이 적은 채소예요.", level: "research" },
  ] },
  { name: "오이", aka: ["물외", "오이냉국"], components: ["수분(약 95%)", "칼륨", "비타민K", "식이섬유"], effects: [
    { condition: "수분·갈증", effect: "수분 함량이 매우 높아 수분 보충에 도움이 될 수 있는 채소예요.", level: "research" },
    { condition: "체중·비만", effect: "열량이 낮아 식단 조절 시 부담이 적은 채소로 알려져 있어요.", level: "research" },
    { condition: "혈압·고혈압", effect: "칼륨이 들어 있으나 그 자체로 혈압을 낮추거나 치료한다는 공식 효능은 알려져 있지 않아요.", level: "none" },
  ] },
  { name: "셀러리", aka: ["샐러리", "셀러리주스"], components: ["칼륨", "식이섬유", "비타민K", "아피게닌(플라보노이드)"], effects: [
    { condition: "혈압·고혈압", effect: "민간에서 혈압에 좋다고 쓰이나 식품으로서 공식 효능은 인정되지 않았어요(혈압약을 대체하면 안 돼요).", level: "folk" },
    { condition: "체중·비만", effect: "열량이 낮고 식이섬유가 있어 식단 조절 시 부담이 적은 채소예요.", level: "research" },
    { condition: "알레르기주의", effect: "셀러리는 알레르기 유발 식품 중 하나로, 민감한 분은 주의가 필요해요.", level: "caution" },
  ] },
  { name: "비트", aka: ["비트뿌리", "레드비트", "비트즙"], components: ["질산염", "베타레인(색소)", "엽산", "철분", "식이섬유"], effects: [
    { condition: "혈행·심혈관", effect: "질산염 성분이 혈류·운동수행과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "항산화", effect: "베타레인 등 항산화 색소가 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "신장결석·소변색주의", effect: "옥살산이 있어 신장결석 병력이 있으면 다량 섭취에 주의가 필요하고, 먹은 뒤 소변·대변이 붉게 보일 수 있어요.", level: "caution" },
  ] },
  { name: "깻잎", aka: ["들깻잎"], components: ["베타카로틴", "칼슘", "철분", "비타민K", "로즈마린산"], effects: [
    { condition: "항산화", effect: "베타카로틴·로즈마린산 등 항산화 성분이 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "뼈건강", effect: "칼슘이 비교적 풍부한 잎채소로 칼슘 보충에 도움이 될 수 있어요.", level: "research" },
    { condition: "혈액응고·약물주의", effect: "비타민K가 들어 있어 항응고제를 복용 중이라면 다량 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "무", aka: ["무우", "동치미무", "무즙"], components: ["디아스타제(소화효소)", "비타민C", "식이섬유", "이소티오시아네이트"], effects: [
    { condition: "소화·위장", effect: "전분 분해 효소(디아스타제)가 들어 있어 소화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "기침·가래", effect: "민간에서 무즙·무꿀이 기침·가래에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "갑상선주의", effect: "갑상선 기능 저하가 있는 분은 십자화과 채소의 다량 생식에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "여주", aka: ["여주즙", "여주차", "비터멜론", "bitter melon"], components: ["카란틴", "모모르데신", "비타민C"], effects: [
    { condition: "혈당·당뇨", effect: "여주 성분이 혈당과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "간건강", effect: "과다 섭취 시 위장 장애·간 부담이 보고된 바 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "돼지감자", aka: ["뚱딴지", "돼지감자즙", "돼지감자차"], components: ["이눌린(식이섬유)", "칼륨", "올리고당"], effects: [
    { condition: "혈당·당뇨", effect: "이눌린 등 식이섬유가 식후 혈당과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "장건강", effect: "이눌린은 장내 유익균의 먹이가 되는 식이섬유로 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "변비", effect: "이눌린 과다 섭취 시 가스·복부팽만이 생길 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "우엉", aka: ["우엉뿌리", "우엉조림"], components: ["이눌린(식이섬유)", "리그난", "사포닌", "폴리페놀"], effects: [
    { condition: "장건강", effect: "이눌린·식이섬유가 장운동과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "폴리페놀 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "우엉차", aka: ["볶은우엉차", "우엉뿌리차"], components: ["이눌린", "폴리페놀", "사포닌"], effects: [
    { condition: "변비·장건강", effect: "민간에서 변비·장건강에 쓰이나 차 형태의 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "항산화", effect: "폴리페놀 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "도라지", aka: ["길경", "도라지즙", "도라지청", "도라지차"], components: ["플라티코딘(사포닌)", "이눌린", "식이섬유"], effects: [
    { condition: "호흡기·기침가래", effect: "도라지(길경) 사포닌 성분이 기침·가래 완화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "면역", effect: "민간에서 목 건강·환절기 관리에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "생강", aka: ["생강차", "ginger", "건강(말린생강)"], components: ["진저롤", "쇼가올", "정유성분"], effects: [
    { condition: "소화·메스꺼움", effect: "진저롤·쇼가올 성분이 메스꺼움·소화 불편 완화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "민간에서 몸을 따뜻하게 하는 데 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "위장질환", effect: "위염·역류·담석이 있거나 혈액응고제 복용 시 과다 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "강황", aka: ["커큐민", "울금", "turmeric", "curcumin"], components: ["커큐민", "정유성분", "폴리페놀"], effects: [
    { condition: "관절건강", effect: "커큐민이 관절 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "커큐민의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "간건강", effect: "고용량 보충제 섭취 시 간 관련 이상이 보고된 바 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "연근", aka: ["연뿌리", "연근조림", "연근차"], components: ["식이섬유", "비타민C", "탄닌", "철분"], effects: [
    { condition: "장건강", effect: "식이섬유가 장운동과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "비타민C·탄닌 등 항산화 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "마", aka: ["산약", "참마", "마즙", "마가루"], components: ["뮤신(점액질)", "전분", "디오스게닌", "식이섬유"], effects: [
    { condition: "소화·위장", effect: "민간에서 위 점막 보호·소화에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "혈당·당뇨", effect: "마의 식이섬유·점액질이 혈당과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "칡", aka: ["갈근", "칡즙", "칡차", "칡뿌리"], components: ["이소플라본(푸에라린·다이드제인)", "전분", "사포닌"], effects: [
    { condition: "갱년기·여성건강", effect: "칡의 이소플라본 성분이 갱년기 증상과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "숙취·간건강", effect: "민간에서 숙취 해소에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "결명자", aka: ["결명자차", "초결명"], components: ["안트라퀴논", "에모딘", "식이섬유"], effects: [
    { condition: "눈건강", effect: "민간에서 눈 피로에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "변비", effect: "안트라퀴논 성분이 배변과 관련해 연구된 바 있으나, 과다 섭취 시 설사·복통이 생길 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "둥굴레", aka: ["둥굴레차", "옥죽", "황정"], components: ["사포닌", "다당류", "비타민A"], effects: [
    { condition: "피로·기력", effect: "민간에서 자양·기력 보충 음료로 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "항산화", effect: "둥굴레 다당류·사포닌의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "옥수수수염", aka: ["옥수수수염차", "옥수수염차", "남바수"], components: ["칼륨", "플라보노이드", "사포닌"], effects: [
    { condition: "부종·이뇨", effect: "민간에서 이뇨·부종 완화 음료로 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "혈압·고혈압", effect: "신장질환이 있거나 이뇨제를 복용 중이면 과다 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "보리차", aka: ["볶은보리차", "보리숭늉"], components: ["수분", "소량의 미네랄", "볶은 곡물 향성분"], effects: [
    { condition: "수분보충", effect: "카페인이 없는 음료로 일상 수분 보충에 무난하나 특정 질환에 대한 공식 효능은 알려져 있지 않아요.", level: "none" },
    { condition: "혈당·당뇨", effect: "보리차 자체가 혈당을 낮춘다는 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "더덕", aka: ["사삼", "더덕구이", "더덕즙"], components: ["사포닌", "이눌린", "식이섬유"], effects: [
    { condition: "호흡기·기관지", effect: "민간에서 도라지처럼 목·기관지 관리에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "항산화", effect: "사포닌 등 성분의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "도라지차", aka: ["길경차", "도라지배차"], components: ["플라티코딘(사포닌)", "이눌린"], effects: [
    { condition: "호흡기·기침가래", effect: "도라지(길경) 사포닌이 기침·가래와 관련해 연구된 바 있어요(차 형태의 공식 효능 인정은 아님).", level: "research" },
    { condition: "면역", effect: "민간에서 환절기 목 건강에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "현미", aka: ["현미밥", "brown rice", "통곡물 쌀"], components: ["식이섬유", "비타민 B군", "마그네슘", "감마오리자놀", "전분(복합탄수화물)"], effects: [
    { condition: "혈당·당뇨", effect: "백미 대신 통곡물을 먹으면 식후 혈당 상승이 완만해지는 것과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "변비·장건강", effect: "식이섬유가 풍부해 배변·장운동에 도움을 줄 수 있어요.", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "통곡물 섭취가 혈중 콜레스테롤 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "귀리", aka: ["오트밀", "오트", "oat", "압착귀리"], components: ["베타글루칸(수용성 식이섬유)", "단백질", "식이섬유", "철분", "아베난쓰라마이드"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "귀리·보리 유래 베타글루칸은 식약처가 '혈중 콜레스테롤 개선에 도움을 줄 수 있음'으로 인정한 기능성 원료예요(가공 보충제 기준).", level: "mfds" },
    { condition: "혈당·당뇨", effect: "베타글루칸이 식후 혈당 상승을 완만하게 하는 것과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "변비·장건강", effect: "수용성·불용성 식이섬유가 풍부해 배변에 도움을 줄 수 있어요.", level: "research" },
  ] },
  { name: "보리", aka: ["겉보리", "쌀보리", "보리밥", "barley", "통보리"], components: ["베타글루칸", "식이섬유", "비타민 B군", "셀레늄"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "보리 유래 베타글루칸은 식약처가 '혈중 콜레스테롤 개선에 도움을 줄 수 있음'으로 인정한 기능성 원료예요(가공 보충제 기준).", level: "mfds" },
    { condition: "혈당·당뇨", effect: "통보리의 수용성 섬유가 식후 혈당 반응과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "변비·장건강", effect: "식이섬유가 많아 배변과 포만감에 도움을 줄 수 있어요.", level: "research" },
  ] },
  { name: "메밀", aka: ["메밀쌀", "buckwheat", "메밀가루", "타타리메밀"], components: ["루틴(플라보노이드)", "단백질(필수아미노산)", "식이섬유", "마그네슘"], effects: [
    { condition: "혈행·심혈관", effect: "메밀 속 루틴이 혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "민간에서 혈압에 좋다고 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "혈당·당뇨", effect: "통곡물 메밀이 혈당 반응과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "검은콩", aka: ["서리태", "흑태", "약콩", "black soybean", "쥐눈이콩"], components: ["식물성 단백질", "이소플라본", "안토시아닌(검은 껍질)", "식이섬유", "사포닌"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "콩 단백질·식이섬유가 콜레스테롤 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "검은 껍질의 안토시아닌이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "탈모·모발", effect: "민간에서 모발에 좋다고 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "두부", aka: ["순두부", "연두부", "tofu", "콩두부"], components: ["식물성 단백질", "이소플라본", "칼슘", "철분", "레시틴"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "콩 단백질이 콜레스테롤 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "고단백·저칼로리로 포만감을 줘 체중 관리 식단에 활용된다고 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "통풍·신장", effect: "신장질환·통풍이 있으면 단백질 섭취량 조절이 필요해 주의가 필요해요.", level: "caution" },
  ] },
  { name: "낫토", aka: ["청국장(유사)", "natto", "발효 콩"], components: ["나토키나제(효소)", "비타민 K2", "이소플라본", "식물성 단백질", "프로바이오틱스(바실러스)"], effects: [
    { condition: "혈행·심혈관", effect: "나토키나제가 혈행과 관련해 연구된 바 있으나 공식 효능 인정은 아니에요.", level: "research" },
    { condition: "장건강", effect: "발효 과정의 균과 식이섬유가 장 환경과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈액응고·약물", effect: "비타민 K2가 많아 항응고제(와파린) 복용 중이면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "호두", aka: ["월넛", "walnut", "가래"], components: ["오메가3 지방산(ALA)", "불포화지방", "단백질", "비타민 E", "폴리페놀"], effects: [
    { condition: "혈행·심혈관", effect: "견과류의 불포화지방이 심혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "견과류 섭취가 혈중 지질 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "영양은 풍부하나 열량이 높아 과다 섭취 시 주의가 필요해요.", level: "caution" },
  ] },
  { name: "아몬드", aka: ["almond", "구운 아몬드", "생아몬드"], components: ["비타민 E", "불포화지방", "단백질", "식이섬유", "마그네슘"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "아몬드의 불포화지방이 혈중 콜레스테롤 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "비타민 E가 풍부해 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "포만감은 주지만 열량이 높아 한 줌 정도로 양 조절에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "아마씨", aka: ["플랙시드", "아마인", "flaxseed", "linseed"], components: ["오메가3 지방산(ALA)", "리그난", "수용성 식이섬유", "단백질"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "아마씨의 ALA·섬유가 혈중 지질과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "변비·장건강", effect: "수용성 식이섬유가 배변에 도움을 줄 수 있어요.", level: "research" },
    { condition: "섭취·안전", effect: "생아마씨를 갈지 않고 다량 섭취하면 소화·갑상선 관련 주의가 필요해요.", level: "caution" },
  ] },
  { name: "치아씨", aka: ["치아시드", "chia seed", "차전자(유사)"], components: ["오메가3 지방산(ALA)", "수용성 식이섬유", "단백질", "칼슘", "항산화 폴리페놀"], effects: [
    { condition: "변비·장건강", effect: "물을 흡수해 부피가 늘고 식이섬유가 많아 배변에 도움을 줄 수 있어요.", level: "research" },
    { condition: "체중·비만", effect: "수분을 머금어 포만감을 줘 체중 관리 식단에 활용된다고 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "섭취·안전", effect: "물 없이 마른 채 많이 먹으면 팽창해 목·식도에 걸릴 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "들깨", aka: ["들기름", "들깻가루", "perilla", "들깨가루"], components: ["오메가3 지방산(ALA)", "불포화지방", "비타민 E", "로즈마린산"], effects: [
    { condition: "혈행·심혈관", effect: "들깨의 오메가3(ALA)가 심혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "불포화지방이 혈중 지질 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "보관·산패", effect: "들기름은 산패가 빨라 개봉 후 냉장·조기 소비 등 보관에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "잣", aka: ["잣알", "pine nut", "백자"], components: ["불포화지방", "단백질", "비타민 E", "마그네슘", "피놀렌산"], effects: [
    { condition: "혈행·심혈관", effect: "잣의 불포화지방이 심혈관 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "기력·영양", effect: "민간에서 기력 보충에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "체중·비만", effect: "열량과 지방이 높아 과다 섭취 시 주의가 필요해요.", level: "caution" },
  ] },
  { name: "땅콩", aka: ["피넛", "peanut", "낙화생", "볶은 땅콩"], components: ["불포화지방", "단백질", "비타민 E", "나이아신", "레스베라트롤"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "땅콩의 불포화지방이 혈중 지질 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "알레르기", effect: "대표적 알레르기 식품으로 알레르기가 있으면 심각한 반응이 생길 수 있어 주의가 필요해요.", level: "caution" },
    { condition: "곰팡이·보관", effect: "습하게 보관하면 곰팡이독소(아플라톡신) 위험이 있어 보관에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "병아리콩", aka: ["병아리콩", "chickpea", "이집트콩", "가르반조"], components: ["식물성 단백질", "식이섬유", "엽산", "철분", "복합탄수화물"], effects: [
    { condition: "혈당·당뇨", effect: "저혈당지수 식품으로 식후 혈당 반응과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "변비·장건강", effect: "식이섬유가 풍부해 배변에 도움을 줄 수 있어요.", level: "research" },
  ] },
  { name: "녹차", aka: ["green tea", "녹차잎", "세작", "현미녹차"], components: ["카테킨(EGCG)", "카페인", "테아닌(L-theanine)", "폴리페놀"], effects: [
    { condition: "항산화", effect: "녹차 카테킨은 항산화에 도움을 줄 수 있어요(식약처 인정기능성).", level: "mfds" },
    { condition: "체중·비만", effect: "녹차 카테킨은 체지방 감소에 도움을 줄 수 있어요(식약처 인정기능성).", level: "mfds" },
    { condition: "콜레스테롤·이상지질혈증", effect: "녹차 추출물·카테킨이 혈중 콜레스테롤 개선과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "카페인·수면", effect: "카페인이 들어 있어 과다 섭취나 늦은 시간 음용 시 불면·심계항진 등에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "홍차", aka: ["black tea", "다르질링", "아쌈", "실론티"], components: ["테아플라빈", "테아루비긴", "카페인", "플라보노이드"], effects: [
    { condition: "항산화", effect: "홍차의 플라보노이드가 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "홍차 섭취와 심혈관 건강의 관련성이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "카페인·수면", effect: "카페인이 들어 있어 과다 섭취나 늦은 시간 음용 시 수면 방해에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "보이차", aka: ["흑차", "pu-erh", "푸얼차", "발효차"], components: ["폴리페놀", "카페인", "갈산(gallic acid)", "발효 미생물 대사산물"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "발효차인 보이차가 혈중 지질과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "보이차가 체중·지방 대사와 관련해 연구된 바 있으나 공식 효능은 아니에요.", level: "research" },
    { condition: "소화", effect: "식후 소화를 돕는다고 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "우롱차", aka: ["oolong", "오룡차", "청차", "반발효차"], components: ["폴리페놀", "카테킨", "카페인", "테아닌"], effects: [
    { condition: "체중·비만", effect: "반발효차인 우롱차가 체지방·에너지 대사와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈당·당뇨", effect: "우롱차 폴리페놀이 식후 혈당과 관련해 연구된 바 있으나 공식 효능은 아니에요.", level: "research" },
  ] },
  { name: "커피", aka: ["coffee", "원두커피", "아메리카노", "에스프레소"], components: ["카페인", "클로로겐산", "디테르펜(카페스톨)", "폴리페놀"], effects: [
    { condition: "항산화", effect: "커피의 클로로겐산 등 폴리페놀이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "각성·집중", effect: "카페인이 일시적 각성·집중과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "카페인 과다 섭취는 일시적 혈압 상승·불면·심계항진을 부를 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "히비스커스차", aka: ["hibiscus", "무궁화차류", "로젤차", "히비스커스"], components: ["안토시아닌", "유기산", "폴리페놀", "비타민C"], effects: [
    { condition: "혈압·고혈압", effect: "히비스커스차가 혈압과 관련해 연구된 바 있으나 공식 효능은 인정되지 않았어요.", level: "research" },
    { condition: "항산화", effect: "안토시아닌 등 색소 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "위·소화기", effect: "산미가 강해 빈속 음용이나 과다 섭취 시 속쓰림에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "캐모마일차", aka: ["chamomile", "카모마일", "저먼캐모마일"], components: ["아피제닌(apigenin)", "비사볼롤", "플라보노이드", "정유 성분"], effects: [
    { condition: "수면·이완", effect: "캐모마일이 진정·수면과 관련해 연구된 바 있으나 공식 효능은 인정되지 않았어요.", level: "research" },
    { condition: "소화·복부불편", effect: "소화를 돕고 속을 편하게 한다고 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "알레르기", effect: "국화과 식물 알레르기가 있으면 알레르기 반응에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "페퍼민트차", aka: ["peppermint", "박하차", "민트차", "페퍼민트"], components: ["멘톨", "멘톤", "로즈마린산", "정유 성분"], effects: [
    { condition: "소화·복부팽만", effect: "페퍼민트가 소화불량·복부 불편과 관련해 연구된 바 있으나 공식 효능은 아니에요.", level: "research" },
    { condition: "구취·청량감", effect: "입안을 개운하게 하려고 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "역류성식도질환", effect: "위식도역류가 있으면 멘톨이 증상을 악화시킬 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "레몬차", aka: ["lemon", "레몬", "레몬수", "레몬에이드(무가당)"], components: ["비타민C", "구연산", "플라보노이드(헤스페리딘)", "칼륨"], effects: [
    { condition: "항산화·면역", effect: "비타민C가 풍부해 항산화·면역과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "피로·컨디션", effect: "구연산이 들어간 레몬차를 피로 시 민간에서 즐겨 마시나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "치아·위", effect: "산도가 높아 자주·과다 음용 시 치아 부식이나 속쓰림에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "꿀차", aka: ["honey", "벌꿀", "꿀물", "허니"], components: ["과당", "포도당", "소량 효소·항산화물질", "미네랄"], effects: [
    { condition: "인후·기침", effect: "목이 칼칼할 때 꿀을 민간에서 쓰나 질환 치료 효능이 공식 인정된 것은 아니에요.", level: "folk" },
    { condition: "혈당·당뇨", effect: "당분이 많아 당뇨가 있거나 혈당 관리 중이면 섭취량에 주의가 필요해요.", level: "caution" },
    { condition: "영유아", effect: "돌 이전 영아에게는 보툴리누스 위험이 있어 절대 주지 않도록 주의가 필요해요.", level: "caution" },
  ] },
  { name: "식초음료(음용 식초)", aka: ["식초물", "사과식초 음료", "마시는 식초", "apple cider vinegar"], components: ["아세트산(초산)", "유기산", "(과실식초의)폴리페놀"], effects: [
    { condition: "혈당·당뇨", effect: "식초의 아세트산이 식후 혈당과 관련해 연구된 바 있으나 공식 효능은 인정되지 않았어요.", level: "research" },
    { condition: "체중·비만", effect: "체중·식욕과 관련해 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "치아·위·식도", effect: "원액·고농도 음용은 치아 부식과 식도·위 자극을 줄 수 있어 희석하고 양에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "생강차", aka: ["ginger", "생강", "진저티", "생강즙차"], components: ["진저롤", "쇼가올", "정유 성분"], effects: [
    { condition: "메스꺼움·소화", effect: "생강이 메스꺼움·소화 불편과 관련해 연구된 바 있으나 공식 효능은 아니에요.", level: "research" },
    { condition: "감기·몸살", effect: "몸을 따뜻하게 하려고 민간에서 즐겨 마시나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "위·복용약", effect: "위가 예민하거나 항응고제 등 약 복용 중이면 다량 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "둥굴레차", aka: ["둥굴레", "황정차", "옥죽차"], components: ["다당류", "사포닌", "식이섬유", "폴리페놀"], effects: [
    { condition: "항산화", effect: "둥굴레 추출물이 항산화와 관련해 연구된 바 있으나 공식 효능은 인정되지 않았어요.", level: "research" },
    { condition: "갈증·기력", effect: "구수한 맛으로 물 대신 즐겨 마시나 특정 질환에 대한 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "김치", aka: ["배추김치", "kimchi"], components: ["유산균(락토바실러스)", "식이섬유", "비타민C", "캡사이신", "나트륨"], effects: [
    { condition: "장건강", effect: "발효 과정의 유산균과 식이섬유가 장내 환경에 미치는 영향이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "면역", effect: "발효 유산균이 면역과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "나트륨 함량이 높아 고혈압이 있거나 짜게 드시는 분은 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "청국장", aka: ["담뿍장", "cheonggukjang"], components: ["바실러스균", "식물성 단백질", "이소플라본", "식이섬유", "나토키나제 유사 효소", "나트륨"], effects: [
    { condition: "장건강", effect: "발효균과 식이섬유가 장내 환경과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈당·당뇨", effect: "콩 발효식품의 식이섬유·단백질이 식후 혈당과 관련해 연구된 바 있어요(공식 효능 인정은 아니며 당뇨 치료를 대체하지 않아요).", level: "research" },
    { condition: "혈압·고혈압", effect: "전통 청국장은 나트륨이 많을 수 있어 고혈압이 있으면 간을 줄여 드시는 등 주의가 필요해요.", level: "caution" },
  ] },
  { name: "된장", aka: ["재래된장", "doenjang"], components: ["식물성 단백질", "이소플라본", "아미노산", "식이섬유", "발효 미생물", "나트륨"], effects: [
    { condition: "항산화", effect: "콩 발효 과정에서 생기는 성분의 항산화 관련 연구가 보고된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "장건강", effect: "발효 미생물과 식이섬유가 장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "나트륨이 높은 편이라 고혈압이 있거나 국·찌개로 많이 드시면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "요거트", aka: ["요구르트", "발효유", "yogurt"], components: ["유산균(프로바이오틱스)", "칼슘", "단백질", "유당", "비타민B군"], effects: [
    { condition: "장건강", effect: "프로바이오틱스(유산균)는 식약처 인정 기능성으로 유산균 증식·유해균 억제를 통한 원활한 배변·장 건강에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "면역", effect: "일부 유산균 균주가 면역과 관련해 연구된 바 있어요(균주마다 다르며 공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "가당 제품은 당과 열량이 높을 수 있어 체중 관리 중이라면 무가당 선택 등 주의가 필요해요.", level: "caution" },
  ] },
  { name: "식초", aka: ["발효식초", "현미식초", "사과식초", "vinegar"], components: ["아세트산(초산)", "유기산", "폴리페놀(원료에 따라)"], effects: [
    { condition: "혈당·당뇨", effect: "식사 중 식초의 식후 혈당 관련 연구가 보고된 바 있어요(공식 효능 인정은 아니며 당뇨 치료를 대체하지 않아요).", level: "research" },
    { condition: "위·식도 건강", effect: "산도가 높아 공복에 원액으로 많이 마시면 위·식도·치아 자극이 있을 수 있어 희석과 적정량 등 주의가 필요해요.", level: "caution" },
  ] },
  { name: "콤부차", aka: ["발효홍차", "kombucha"], components: ["유기산(아세트산·글루콘산)", "발효 균막(SCOBY)", "폴리페놀(차 유래)", "미량 카페인", "미량 알코올"], effects: [
    { condition: "항산화", effect: "차에서 유래한 폴리페놀의 항산화 관련 연구가 보고된 바 있어요(콤부차 자체의 공식 효능 인정은 아님).", level: "research" },
    { condition: "장건강", effect: "발효 음료라 장 건강과 연결해 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "간건강", effect: "가당·산도·미량 알코올이 있어 과음, 임산부, 간질환·면역저하자는 주의가 필요해요.", level: "caution" },
  ] },
  { name: "사우어크라우트", aka: ["양배추절임", "독일식 김치", "sauerkraut"], components: ["유산균", "식이섬유", "비타민C", "비타민K", "나트륨"], effects: [
    { condition: "장건강", effect: "발효 유산균과 식이섬유가 장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "면역", effect: "발효 양배추의 비타민C·유산균이 면역과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "소금 절임이라 나트륨이 많을 수 있어 고혈압이 있으면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "케피어", aka: ["케피르", "kefir", "발효유"], components: ["다양한 유산균·효모(케피어 그레인)", "칼슘", "단백질", "비타민B군", "유당(소량)"], effects: [
    { condition: "장건강", effect: "다양한 프로바이오틱스 균주를 함유한 발효유로 장내 환경과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "면역", effect: "발효유의 유산균이 면역과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "미소", aka: ["미소된장", "miso", "일본식 된장"], components: ["식물성 단백질", "이소플라본", "발효 미생물(누룩곰팡이·효모)", "아미노산", "나트륨"], effects: [
    { condition: "장건강", effect: "발효 미생물이 풍부한 콩 발효식품으로 장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "국물로 자주 먹으면 나트륨 섭취가 늘 수 있어 고혈압이 있으면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "템페", aka: ["템페이", "tempeh", "인도네시아 콩발효"], components: ["식물성 단백질", "식이섬유", "이소플라본", "발효균(리조푸스)", "프리바이오틱스 성분"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "콩 단백질·식이섬유가 콜레스테롤과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "장건강", effect: "발효 콩의 식이섬유·발효 성분이 장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "막걸리", aka: ["탁주", "makgeolli", "발효주"], components: ["효모·유산균(발효 부산물)", "알코올", "유기산", "식이섬유(쌀 유래)", "당분"], effects: [
    { condition: "장건강", effect: "발효 과정의 유산균·효모와 연관 지어 민간에서 이야기되나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "간건강", effect: "알코올 음료이므로 과음 시 간 등 건강에 해로울 수 있고 임산부·운전·간질환자는 주의가 필요해요.", level: "caution" },
  ] },
  { name: "강황(울금)", aka: ["울금", "터메릭", "turmeric", "심황"], components: ["커큐민", "투메론", "데메톡시커큐민"], effects: [
    { condition: "항산화", effect: "커큐민이 항산화 작용과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "관절·염증", effect: "커큐민이 관절 불편감·염증 지표와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "간건강", effect: "고용량 커큐민 보충제는 드물게 간 수치 이상이 보고되어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "계피(시나몬)", aka: ["시나몬", "cinnamon", "육계"], components: ["신남알데하이드", "쿠마린", "프로안토시아니딘"], effects: [
    { condition: "혈당·당뇨", effect: "계피가 식후 혈당 반응과 관련해 연구된 바 있어요(공식 효능 인정은 아니며 약을 대체하지 않아요).", level: "research" },
    { condition: "항산화", effect: "폴리페놀 성분의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "간건강", effect: "카시아 계피의 쿠마린은 과다 섭취 시 간에 부담이 될 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "고추(고춧가루)", aka: ["캡사이신", "칠리", "chili", "홍고추"], components: ["캡사이신", "비타민C", "카로티노이드"], effects: [
    { condition: "체중·비만", effect: "캡사이신이 에너지대사·포만감과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "위·소화기", effect: "위염·위궤양·역류성 식도질환이 있으면 자극이 될 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "후추(흑후추)", aka: ["블랙페퍼", "black pepper", "통후추"], components: ["피페린", "정유"], effects: [
    { condition: "흡수·생체이용률", effect: "피페린이 커큐민 등 일부 성분의 흡수와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "위·소화기", effect: "위장이 예민하거나 위질환이 있으면 다량 섭취 시 자극에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "정향", aka: ["클로브", "clove", "정향나무꽃봉오리"], components: ["유게놀", "탄닌", "플라보노이드"], effects: [
    { condition: "항산화", effect: "유게놀 등 폴리페놀의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "구강·치통", effect: "민간에서 치통 완화에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "간건강", effect: "정향 오일을 농축해 다량 섭취하면 간 등에 부담이 될 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "로즈마리", aka: ["rosemary", "만년로"], components: ["로즈마린산", "카르노식산", "1,8-시네올"], effects: [
    { condition: "항산화", effect: "로즈마린산 등 폴리페놀의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "인지·집중", effect: "민간·향기요법에서 집중·기억과 연관 지어 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "바질", aka: ["basil", "스위트바질", "홀리바질"], components: ["유게놀", "리날룰", "로즈마린산"], effects: [
    { condition: "항산화", effect: "폴리페놀 성분의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "스트레스·이완", effect: "민간(특히 홀리바질)에서 이완 목적에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "민트(페퍼민트)", aka: ["페퍼민트", "박하", "mint", "peppermint"], components: ["멘톨", "멘톤", "로즈마린산"], effects: [
    { condition: "소화·복부불편", effect: "페퍼민트(오일)가 과민성 장 증상·복부 불편감과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "위·역류", effect: "역류성 식도질환이 있으면 하부식도괄약근을 이완시켜 증상이 악화될 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "카다멈", aka: ["카다몬", "소두구", "cardamom"], components: ["1,8-시네올", "테르피닐아세테이트", "정유"], effects: [
    { condition: "구취·소화", effect: "민간에서 입냄새 완화·소화에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "항산화", effect: "정유 성분의 항산화 작용이 일부 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
  ] },
  { name: "오레가노", aka: ["oregano", "와일드마조람"], components: ["카바크롤", "티몰", "로즈마린산"], effects: [
    { condition: "항산화", effect: "카바크롤·티몰의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "항균", effect: "실험실(시험관) 연구에서 항균 작용이 보고된 바 있으나 사람 대상 공식 효능은 인정되지 않았어요.", level: "research" },
  ] },
  { name: "사프란", aka: ["saffron", "샤프란"], components: ["크로신", "사프라날", "피크로크로신"], effects: [
    { condition: "기분·우울", effect: "사프란 추출물이 기분·정서와 관련해 연구된 바 있어요(공식 효능 인정은 아니며 치료를 대체하지 않아요).", level: "research" },
    { condition: "안전·과다", effect: "고용량(하루 수 g 이상)은 독성이 보고되어 주의가 필요하고 임신 중에는 피하는 것이 좋아요.", level: "caution" },
  ] },
  { name: "파슬리", aka: ["parsley", "이탈리안파슬리"], components: ["아피올", "아피게닌", "비타민K", "비타민C"], effects: [
    { condition: "항산화", effect: "플라보노이드(아피게닌 등)의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "이뇨·붓기", effect: "민간에서 이뇨·붓기 완화에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "혈액응고", effect: "비타민K가 많아 와파린 등 항응고제 복용자는 섭취량 변화에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "미역", aka: ["미역국", "건미역", "생미역"], components: ["요오드", "식이섬유(알긴산)", "칼슘", "후코이단"], effects: [
    { condition: "변비·장건강", effect: "식이섬유가 풍부해 배변 활동과 장 환경에 도움을 줄 수 있어요.", level: "research" },
    { condition: "갑상선 기능", effect: "요오드 함량이 높아 갑상선 질환이 있거나 갑상선약 복용 시 과다 섭취에 주의가 필요해요.", level: "caution" },
    { condition: "콜레스테롤·이상지질혈증", effect: "알긴산 등 수용성 식이섬유가 콜레스테롤과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "다시마", aka: ["건다시마", "다시마환", "곤포"], components: ["알긴산", "요오드", "후코이단", "식이섬유"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "수용성 식이섬유(알긴산)가 콜레스테롤·혈중 지질과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "갑상선 기능", effect: "요오드가 매우 많아 다량·장기 섭취 시 갑상선 기능에 영향을 줄 수 있어 주의가 필요해요.", level: "caution" },
    { condition: "변비·장건강", effect: "식이섬유가 풍부해 배변과 장건강에 도움을 줄 수 있어요.", level: "research" },
  ] },
  { name: "김", aka: ["조미김", "마른김", "돌김"], components: ["단백질", "비타민A", "엽산", "식이섬유", "요오드"], effects: [
    { condition: "눈건강", effect: "비타민A가 풍부해 눈건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "조미김은 소금 함량이 높을 수 있어 혈압이 높은 경우 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "매생이", aka: ["매생이국", "생매생이"], components: ["식이섬유", "철분", "엽록소", "비타민A"], effects: [
    { condition: "변비·장건강", effect: "식이섬유가 풍부해 배변 활동과 장건강에 도움을 줄 수 있어요.", level: "research" },
    { condition: "빈혈·철분", effect: "철분이 들어 있어 빈혈과 관련해 식품으로 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "표고버섯", aka: ["건표고", "생표고", "표고"], components: ["베타글루칸", "에리타데닌", "식이섬유", "비타민D(건조 시)"], effects: [
    { condition: "면역", effect: "베타글루칸이 면역과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "에리타데닌·식이섬유가 콜레스테롤과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "느타리버섯", aka: ["느타리", "새송이와 혼동주의"], components: ["베타글루칸", "식이섬유", "단백질", "비타민B군"], effects: [
    { condition: "면역", effect: "베타글루칸 등 성분이 면역과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "열량이 낮고 식이섬유가 있어 체중 관리 식단에 활용할 수 있어요.", level: "research" },
  ] },
  { name: "영지버섯", aka: ["영지", "불로초", "reishi"], components: ["베타글루칸", "트리테르펜", "다당류"], effects: [
    { condition: "면역", effect: "다당류 성분이 면역과 관련해 연구된 바 있으나 공식 효능은 인정되지 않았어요.", level: "research" },
    { condition: "혈압·고혈압", effect: "민간에서 혈압 관리에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "간건강", effect: "약 복용 중이거나 간질환이 있으면 상호작용 가능성이 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "상황버섯", aka: ["상황", "목질진흙버섯"], components: ["베타글루칸", "다당류", "폴리페놀"], effects: [
    { condition: "면역", effect: "다당류가 면역과 관련해 연구된 바 있으나 공식 효능은 인정되지 않았어요.", level: "research" },
    { condition: "항산화", effect: "폴리페놀 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "간건강", effect: "민간에서 간 보호 목적으로 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "연어", aka: ["생연어", "훈제연어", "salmon"], components: ["오메가3(EPA·DHA)", "단백질", "비타민D", "아스타잔틴"], effects: [
    { condition: "콜레스테롤·중성지방", effect: "오메가3(EPA·DHA)가 풍부한 생선으로, 혈중 중성지방과 관련해 연구된 바 있어요(생선 자체가 식약처 인정기능성을 갖는 것은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "오메가3가 혈행·심혈관 건강과 관련해 연구된 바 있어요(생선 자체가 공식 효능 인정을 받은 것은 아님).", level: "research" },
    { condition: "눈건강", effect: "DHA가 눈건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "훈제·나트륨", effect: "훈제연어 등 가공품은 나트륨이 높을 수 있어 혈압이 높으면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "고등어", aka: ["참고등어", "구운고등어", "간고등어"], components: ["오메가3(EPA·DHA)", "단백질", "비타민D", "비타민B12"], effects: [
    { condition: "콜레스테롤·중성지방", effect: "오메가3(EPA·DHA)가 풍부한 생선으로, 혈중 중성지방과 관련해 연구된 바 있어요(생선 자체가 식약처 인정기능성을 갖는 것은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "오메가3가 혈행·심혈관 건강과 관련해 연구된 바 있어요(생선 자체가 공식 효능 인정을 받은 것은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "간고등어 등 염장 가공품은 나트륨이 높을 수 있어 혈압이 높으면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "정어리", aka: ["통조림정어리", "sardine"], components: ["오메가3(EPA·DHA)", "칼슘(뼈째)", "단백질", "비타민D"], effects: [
    { condition: "콜레스테롤·중성지방", effect: "오메가3(EPA·DHA)가 풍부한 생선으로, 혈중 중성지방과 관련해 연구된 바 있어요(생선 자체가 식약처 인정기능성을 갖는 것은 아님).", level: "research" },
    { condition: "뼈건강", effect: "뼈째 먹으면 칼슘 섭취에 도움을 줄 수 있어요.", level: "research" },
    { condition: "통풍·요산", effect: "퓨린이 많은 편이라 통풍이 있는 경우 과다 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "참치", aka: ["참치회", "참치캔", "tuna"], components: ["오메가3(DHA)", "단백질", "셀레늄"], effects: [
    { condition: "혈행·심혈관", effect: "오메가3가 혈행 개선과 관련해 연구된 바 있어요(섭취량에 따라 다름).", level: "research" },
    { condition: "임신·수은", effect: "대형 참치는 수은이 축적될 수 있어 임산부·어린이는 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "굴", aka: ["생굴", "석화", "oyster"], components: ["아연", "철분", "타우린", "비타민B12"], effects: [
    { condition: "면역", effect: "아연이 풍부한 식품으로, 아연은 정상적인 면역 기능에 필요한 영양소예요(식품 자체가 면역 효능을 인정받은 것은 아님).", level: "research" },
    { condition: "빈혈·철분", effect: "철분이 들어 있어 빈혈과 관련해 식품으로 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "식중독", effect: "익히지 않은 생굴은 식중독 위험이 있어 면역저하자·임산부는 주의가 필요해요.", level: "caution" },
  ] },
  { name: "꽁치", aka: ["과메기", "꽁치통조림", "saury"], components: ["오메가3(EPA·DHA)", "단백질", "비타민D", "비타민B12"], effects: [
    { condition: "콜레스테롤·중성지방", effect: "오메가3(EPA·DHA)가 풍부한 생선으로, 혈중 중성지방과 관련해 연구된 바 있어요(생선 자체가 식약처 인정기능성을 갖는 것은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "오메가3가 혈행·심혈관 건강과 관련해 연구된 바 있어요(생선 자체가 공식 효능 인정을 받은 것은 아님).", level: "research" },
  ] },
  { name: "여주(쓴오이)", aka: ["여주", "쓴오이", "고야", "bitter melon", "여주차"], components: ["카란틴(charantin)", "폴리펩타이드-P", "모모르데신", "비타민C"], effects: [
    { condition: "혈당·당뇨", effect: "여주의 카란틴·폴리펩타이드-P 성분이 혈당과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "당뇨약 병용", effect: "혈당강하제와 함께 먹으면 저혈당 위험이 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "바나바잎", aka: ["바나바", "바나바차", "banaba"], components: ["코로솔산(corosolic acid)", "엘라그산", "타닌류"], effects: [
    { condition: "혈당·당뇨", effect: "바나바잎의 코로솔산이 혈당과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "당뇨약 병용", effect: "혈당강하제와 같이 먹으면 혈당이 과도하게 떨어질 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "헛개나무(지구자)", aka: ["헛개", "헛개나무", "지구자", "헛개차", "헛개수"], components: ["암펠롭신(디하이드로미리세틴)", "호베니틴스", "플라보노이드"], effects: [
    { condition: "간건강", effect: "헛개나무과병추출물은 알코올성 손상으로부터 간 보호에 도움을 줄 수 있는 식약처 인정 기능성 원료예요.", level: "mfds" },
    { condition: "음주·숙취", effect: "숙취 해소 목적으로 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "간질환 환자", effect: "이미 간질환이 있는 경우 고농축 제품은 오히려 부담이 될 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "민들레", aka: ["민들레", "민들레차", "포공영", "dandelion"], components: ["타락사신", "이눌린", "비타민A", "칼륨", "플라보노이드"], effects: [
    { condition: "간건강", effect: "민들레는 민간에서 간·소화에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "이뇨·부종", effect: "이뇨 작용이 민간에서 활용되나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "신장질환·이뇨제 복용", effect: "칼륨이 많아 신장질환이 있거나 이뇨제를 복용 중이면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "쑥", aka: ["쑥", "쑥차", "애엽", "약쑥", "mugwort"], components: ["시네올", "탄닌", "비타민A·C", "클로로필"], effects: [
    { condition: "항산화", effect: "쑥의 폴리페놀·클로로필 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "소화·위장", effect: "소화·여성 건강 목적으로 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "임신", effect: "고용량은 자궁 수축과 관련될 수 있어 임신 중에는 주의가 필요해요.", level: "caution" },
  ] },
  { name: "인진쑥(사철쑥)", aka: ["인진쑥", "사철쑥", "인진", "더위지기", "인진차"], components: ["스코파론(scoparone)", "쿠마린류", "클로로겐산", "플라보노이드"], effects: [
    { condition: "간건강", effect: "인진쑥은 전통적으로 간·황달에 쓰였고 간 관련 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "장기 다량 섭취", effect: "장기간 많은 양을 달여 먹으면 간에 부담이 될 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "엉겅퀴(밀크씨슬)", aka: ["엉겅퀴", "밀크씨슬", "흰무늬엉겅퀴", "실리마린", "milk thistle"], components: ["실리마린(실리빈)", "플라보노리그난", "리놀레산"], effects: [
    { condition: "간건강", effect: "밀크씨슬추출물(실리마린)은 간건강에 도움을 줄 수 있는 식약처 인정 기능성 원료예요.", level: "mfds" },
    { condition: "항산화", effect: "실리마린의 항산화 작용이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "국화과 알레르기", effect: "국화과 식물에 알레르기가 있으면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "오가피(가시오갈피)", aka: ["오가피", "가시오갈피", "시베리아인삼", "오가피차", "eleuthero"], components: ["엘레우테로사이드", "아칸토사이드", "사포닌", "리그난"], effects: [
    { condition: "피로·활력", effect: "오가피는 민간에서 기력·피로 회복에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "면역", effect: "면역 관련 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "고혈압·불면", effect: "자극 작용으로 고혈압이나 불면이 있으면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "구기자", aka: ["구기자", "구기자차", "고지베리", "goji berry", "구기자열매"], components: ["제아잔틴", "베타카로틴", "구기자다당체(LBP)", "비타민C", "루테인"], effects: [
    { condition: "눈건강", effect: "구기자의 제아잔틴·루테인 성분이 눈건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "베타카로틴 등 항산화 성분이 풍부한 것으로 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "와파린 복용", effect: "혈액응고억제제(와파린)와 상호작용이 보고된 바 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "당귀", aka: ["당귀", "참당귀", "당귀차", "dong quai", "안젤리카"], components: ["데쿠르신", "쿠마린류", "페룰산", "폴리아세틸렌"], effects: [
    { condition: "여성건강·혈행", effect: "당귀는 전통적으로 여성 건강·혈행에 쓰였고 일부 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항응고제 병용·임신", effect: "쿠마린 성분으로 혈액응고억제제 복용자나 임신 중에는 주의가 필요해요.", level: "caution" },
  ] },
  { name: "감초", aka: ["감초", "감초차", "licorice", "甘草"], components: ["글리시리진", "리퀴리티게닌", "플라보노이드", "글라브리딘"], effects: [
    { condition: "소화·위장", effect: "감초는 전통적으로 위장·인후 완화에 쓰였고 일부 성분이 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "글리시리진을 많이 섭취하면 혈압 상승·부종·저칼륨혈증을 유발할 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "노니", aka: ["노니", "노니주스", "노니분말", "noni", "모린다"], components: ["이리도이드(데아세틸아스페룰로사이드)", "스코폴레틴", "비타민C", "칼륨"], effects: [
    { condition: "항산화", effect: "노니의 이리도이드 등 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "피로·면역", effect: "면역·피로 목적으로 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "간·신장질환", effect: "간 손상 사례와 높은 칼륨 함량이 보고돼 간·신장질환이 있으면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "달맞이꽃종자유", aka: ["달맞이꽃", "달맞이꽃종자유", "감마리놀렌산", "EPO", "evening primrose"], components: ["감마리놀렌산(GLA)", "리놀레산", "비타민E"], effects: [
    { condition: "혈행·콜레스테롤", effect: "감마리놀렌산 함유 유지는 혈행·혈중 콜레스테롤 개선에 도움을 줄 수 있는 식약처 인정 기능성 원료예요.", level: "mfds" },
    { condition: "월경전증후군·피부", effect: "월경전증후군·피부 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항응고제 병용", effect: "혈액응고억제제와 함께 먹으면 출혈 위험이 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "돼지감자(뚱딴지)", aka: ["돼지감자", "뚱딴지", "이눌린", "jerusalem artichoke", "국우"], components: ["이눌린", "식이섬유", "칼륨", "폴리페놀"], effects: [
    { condition: "혈당·당뇨", effect: "돼지감자는 이눌린이 풍부해 혈당 관리 목적으로 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "장건강·변비", effect: "이눌린은 프리바이오틱스로 장건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "과민성장·가스", effect: "이눌린을 많이 먹으면 복부 팽만·가스가 생길 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "홍삼", aka: ["홍삼농축액", "홍삼정", "red ginseng", "고려홍삼"], components: ["진세노사이드(사포닌)", "폴리페놀", "산성다당체"], effects: [
    { condition: "면역", effect: "식약처 인정기능성으로 면역력 증진에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "피로·기력", effect: "식약처 인정기능성으로 피로 개선에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "혈행·심혈관", effect: "식약처 인정기능성으로 혈소판 응집 억제를 통한 혈행 개선에 도움을 줄 수 있어요.", level: "mfds" },
  ] },
  { name: "오메가3", aka: ["오메가-3", "EPA/DHA", "생선유", "피쉬오일", "fish oil", "어유"], components: ["EPA", "DHA", "불포화지방산"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "식약처 인정기능성으로 혈중 중성지방 개선에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "혈행·심혈관", effect: "식약처 인정기능성으로 혈행 개선에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "눈건강", effect: "건조한 눈 개선과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "가르시니아 캄보지아", aka: ["가르시니아", "HCA", "Garcinia cambogia"], components: ["하이드록시시트르산(HCA)"], effects: [
    { condition: "체중·비만", effect: "식약처 인정기능성으로 체지방 감소에 도움을 줄 수 있어요(효과는 제한적이에요).", level: "mfds" },
    { condition: "간건강", effect: "드물게 간 손상 사례가 보고되어 과다 섭취 시 주의가 필요해요.", level: "caution" },
  ] },
  { name: "글루코사민", aka: ["글루코사민황산염", "glucosamine", "관절영양제"], components: ["글루코사민황산염", "콘드로이친(병용 제품)"], effects: [
    { condition: "관절건강", effect: "식약처 인정기능성으로 관절 및 연골 건강에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "혈당·당뇨", effect: "혈당에 영향을 줄 수 있어 당뇨가 있다면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "밀크씨슬", aka: ["밀크시슬", "실리마린", "silymarin", "milk thistle", "흰무늬엉겅퀴"], components: ["실리마린(플라보노리그난)", "실리빈"], effects: [
    { condition: "간건강", effect: "식약처 인정기능성으로 간 건강에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "항산화", effect: "항산화 작용과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "루테인", aka: ["루테인지아잔틴", "lutein", "지아잔틴"], components: ["루테인", "지아잔틴"], effects: [
    { condition: "눈건강", effect: "식약처 인정기능성으로 노화로 인한 황반색소 밀도 유지에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "항산화", effect: "눈 부위 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "코엔자임Q10", aka: ["코큐텐", "CoQ10", "유비퀴논", "coenzyme Q10"], components: ["코엔자임Q10(유비퀴논)"], effects: [
    { condition: "혈압·고혈압", effect: "식약처 인정기능성으로 높은 혈압 감소에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "항산화", effect: "항산화 작용과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "심장 기능과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "프로바이오틱스", aka: ["유산균", "프로바이오틱", "probiotics", "락토바실러스", "비피더스"], components: ["락토바실러스", "비피도박테리움", "생균"], effects: [
    { condition: "장건강", effect: "식약처 인정기능성으로 유산균 증식과 유해균 억제, 배변 활동 원활에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "면역", effect: "면역 조절과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "변비", effect: "식약처 인정기능성으로 배변 활동 원활에 도움을 줄 수 있어요.", level: "mfds" },
  ] },
  { name: "콜라겐", aka: ["저분자콜라겐", "콜라겐펩타이드", "collagen", "피쉬콜라겐"], components: ["콜라겐펩타이드", "아미노산(글리신·프롤린)"], effects: [
    { condition: "피부건강", effect: "식약처 인정기능성(개별인정형)으로 자외선에 의한 피부 손상으로부터 피부 건강 유지에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "관절건강", effect: "관절·연골 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "쏘팔메토", aka: ["쏘팔메토열매추출물", "saw palmetto", "톱야자"], components: ["쏘팔메토 열매 추출물", "지방산·식물성스테롤"], effects: [
    { condition: "전립선건강", effect: "식약처 인정기능성(개별인정형)으로 전립선 건강 유지에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "배뇨", effect: "중장년 남성의 배뇨 불편 개선과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "MSM", aka: ["엠에스엠", "식이유황", "메틸설포닐메탄", "methylsulfonylmethane"], components: ["메틸설포닐메탄(유기황)"], effects: [
    { condition: "관절건강", effect: "식약처 인정기능성(개별인정형)으로 관절 건강에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "항산화", effect: "항산화·항염과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "비타민D", aka: ["비타민디", "vitamin D", "콜레칼시페롤", "햇빛비타민"], components: ["비타민D3(콜레칼시페롤)"], effects: [
    { condition: "뼈건강", effect: "식약처 인정기능성으로 칼슘 흡수와 뼈 형성에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "면역", effect: "식약처 인정기능성으로 면역 기능에 필요한 영양소예요.", level: "mfds" },
    { condition: "칼슘·과다주의", effect: "과다 섭취 시 고칼슘혈증 등 부작용이 있을 수 있어 권장량 준수에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "마그네슘", aka: ["마그네슘제", "magnesium", "산화마그네슘"], components: ["마그네슘(미네랄)"], effects: [
    { condition: "근육·신경", effect: "식약처 인정기능성으로 신경과 근육 기능 유지에 필요한 영양소예요.", level: "mfds" },
    { condition: "피로", effect: "식약처 인정기능성으로 에너지 생성에 필요한 영양소예요.", level: "mfds" },
    { condition: "변비", effect: "과다 섭취 시 설사를 유발할 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "비타민C", aka: ["비타민씨", "vitamin C", "아스코르브산", "고함량비타민C"], components: ["아스코르브산"], effects: [
    { condition: "항산화", effect: "식약처 인정기능성으로 유해산소로부터 세포를 보호하는 항산화에 도움을 줄 수 있어요.", level: "mfds" },
    { condition: "면역", effect: "식약처 인정기능성으로 면역 기능에 필요한 영양소예요.", level: "mfds" },
    { condition: "신장·과다주의", effect: "고용량 섭취 시 신장결석 위험 등이 있을 수 있어 과다 섭취에 주의가 필요해요.", level: "caution" },
  ] },
]
