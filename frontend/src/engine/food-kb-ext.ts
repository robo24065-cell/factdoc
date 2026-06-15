// 음식 KB 확장(일상 주식·육류·유제품·해산물·추가 과일채소) — expand-food-kb 워크플로(생성+적대검증). ⚠ 수기편집 금지.
import type { FoodEntry } from "./food-kb"

export const FOOD_KB_EXT: FoodEntry[] = [
  { name: "단호박", aka: ["밤호박", "kabocha", "sweet pumpkin", "미니단호박"], components: ["베타카로틴", "식이섬유", "칼륨", "비타민C", "복합탄수화물"], effects: [
    { condition: "항산화", effect: "베타카로틴 등 항산화 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "장건강·변비", effect: "식이섬유가 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "부종", effect: "민간에서 산후 부기·붓기에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "밤", aka: ["chestnut", "군밤", "맛밤"], components: ["복합탄수화물", "식이섬유", "비타민C", "칼륨", "비타민B군"], effects: [
    { condition: "장건강·변비", effect: "식이섬유가 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "면역", effect: "비타민C가 들어 있어 면역 기능과 관련해 알려져 있으나 공식 효능 인정은 아니에요.", level: "research" },
    { condition: "체중·비만", effect: "견과류치고 탄수화물·열량이 있는 편이라 많이 먹으면 체중 관리에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "통밀빵", aka: ["통밀식빵", "whole wheat bread", "wholegrain bread", "전립분빵"], components: ["복합탄수화물", "식이섬유", "단백질", "비타민B군", "마그네슘"], effects: [
    { condition: "장건강·변비", effect: "통밀의 식이섬유가 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈당·당뇨", effect: "통곡물이 흰빵보다 혈당 변동이 완만하다고 연구된 바 있으나(공식 효능 인정은 아님), 당뇨가 있다면 섭취량에 주의가 필요해요.", level: "research" },
    { condition: "셀리악·글루텐과민", effect: "밀의 글루텐이 들어 있어 글루텐 과민증·셀리악병이 있다면 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "미숫가루", aka: ["미수가루", "미싯가루", "선식", "roasted grain powder"], components: ["복합탄수화물(곡물·콩)", "식물성 단백질", "식이섬유", "비타민B군"], effects: [
    { condition: "근육·단백질", effect: "콩·곡물의 식물성 단백질이 들어 있어 단백질 보충과 관련해 알려져 있으나 공식 효능 인정은 아니에요.", level: "research" },
    { condition: "장건강·변비", effect: "통곡물 식이섬유가 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈당·당뇨", effect: "꿀·설탕을 타서 마시면 당이 늘어나니 당뇨가 있다면 가당과 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "수수", aka: ["sorghum", "고량", "찰수수", "수수쌀"], components: ["복합탄수화물", "식이섬유", "폴리페놀(탄닌)", "단백질", "무기질"], effects: [
    { condition: "항산화", effect: "탄닌 등 폴리페놀 항산화 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "장건강·변비", effect: "식이섬유가 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "셀리악·글루텐과민", effect: "글루텐이 없는 곡물이라 글루텐 과민증이 있는 사람의 대체 곡물로 알려져 있어요.", level: "folk" },
  ] },
  { name: "조", aka: ["좁쌀", "millet", "foxtail millet", "차조"], components: ["복합탄수화물", "식이섬유", "단백질", "마그네슘", "비타민B군"], effects: [
    { condition: "장건강·변비", effect: "식이섬유가 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈당·당뇨", effect: "잡곡으로 흰쌀 대비 혈당 변동이 완만하다고 알려져 있으나(공식 효능 인정은 아님), 당뇨가 있다면 섭취량에 주의가 필요해요.", level: "research" },
    { condition: "셀리악·글루텐과민", effect: "글루텐이 없는 곡물이라 글루텐 과민증이 있는 사람의 대체 곡물로 알려져 있어요.", level: "folk" },
  ] },
  { name: "토란", aka: ["taro", "토란대", "토련"], components: ["복합탄수화물", "식이섬유", "칼륨", "점액질(뮤신류)", "비타민B6"], effects: [
    { condition: "장건강·변비", effect: "식이섬유가 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "칼륨이 들어 있어 혈압 관리와 관련해 알려져 있으나(공식 효능 인정은 아님), 신장질환이 있다면 칼륨 섭취에 주의가 필요해요.", level: "research" },
    { condition: "안전·조리", effect: "생것은 옥살산칼슘 등으로 아리고 가려움을 일으킬 수 있어 충분히 익혀 드시는 등 주의가 필요해요.", level: "caution" },
  ] },
  { name: "계란", aka: ["달걀", "egg", "에그", "닭알"], components: ["완전단백질(필수아미노산)", "콜린", "루테인·제아잔틴", "비타민B12", "셀레늄"], effects: [
    { condition: "근육·단백질", effect: "필수아미노산이 고루 든 양질의 단백질원으로, 근육 유지·합성과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "눈건강", effect: "노른자의 루테인·제아잔틴이 눈 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "노른자에 콜레스테롤이 있어 이상지질혈증이 있다면 섭취량에 주의가 필요할 수 있어요. 다만 최근 연구는 건강한 사람에서 영향이 크지 않다고 보고하기도 해요.", level: "caution" },
  ] },
  { name: "닭가슴살", aka: ["치킨브레스트", "chicken breast", "닭가슴", "흰살닭고기"], components: ["저지방 단백질", "비타민B6", "나이아신", "셀레늄", "인"], effects: [
    { condition: "근육·단백질", effect: "지방이 적고 단백질이 풍부해 근육 유지·체중 관리 식단과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "지방·열량이 낮은 편이라 체중 관리 식단에 활용되곤 하나, 효능이 공식 인정된 것은 아니에요.", level: "folk" },
    { condition: "신장·콩팥", effect: "단백질이 많아 신장질환이 있다면 단백질 섭취량을 전문가와 상의해 조절할 필요가 있어요.", level: "caution" },
  ] },
  { name: "우유", aka: ["milk", "흰우유", "생우유", "저지방우유"], components: ["칼슘", "단백질(카제인·유청)", "비타민B2", "비타민D", "유당(락토오스)"], effects: [
    { condition: "뼈건강", effect: "칼슘이 풍부해 뼈 건강·골다공증 예방과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "근육·단백질", effect: "양질의 단백질이 들어 있어 근육 유지와 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "소화·유당불내증", effect: "유당불내증이 있다면 복부 팽만·설사가 생길 수 있어 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "그릭요거트", aka: ["greek yogurt", "그릭요구르트", "농축요거트"], components: ["단백질", "칼슘", "프로바이오틱스(유산균)", "비타민B12", "리보플라빈(B2)"], effects: [
    { condition: "근육·단백질", effect: "단백질 함량이 높은 편이라 근육 유지와 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "장건강·변비", effect: "유산균이 장내 환경·배변 활동과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "뼈건강", effect: "칼슘이 풍부해 뼈 건강과 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "두유", aka: ["soy milk", "콩물", "콩국"], components: ["식물성단백질", "이소플라본", "불포화지방", "칼슘(강화)", "레시틴"], effects: [
    { condition: "콜레스테롤·이상지질혈증", effect: "콩단백·불포화지방이 콜레스테롤 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "갱년기·여성건강", effect: "이소플라본이 갱년기 여성 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "근육·단백질", effect: "식물성 단백질원으로 근육 유지와 관련해 알려져 있어요(공식 효능 인정은 아님). 유당불내증이 있어도 부담이 적은 편이에요.", level: "research" },
  ] },
  { name: "순두부", aka: ["sundubu", "soft tofu", "초당두부"], components: ["식물성단백질", "이소플라본", "칼슘", "마그네슘", "수분"], effects: [
    { condition: "근육·단백질", effect: "부드러운 식물성 단백질원으로 소화가 편하고 근육 유지와 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "열량이 낮고 단백질이 있어 체중 관리 식단에 활용되곤 해요.", level: "folk" },
    { condition: "콜레스테롤·이상지질혈증", effect: "콩단백이 콜레스테롤 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "연두부", aka: ["soft tofu", "실키두부", "찐두부"], components: ["식물성단백질", "이소플라본", "칼슘", "올리고당", "수분"], effects: [
    { condition: "근육·단백질", effect: "소화가 부드러운 식물성 단백질원으로 근육 유지와 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "갱년기·여성건강", effect: "이소플라본이 갱년기 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "신장·콩팥", effect: "신장질환으로 단백질 제한이 필요하면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "두부면", aka: ["tofu noodle", "두부국수", "포두부", "건두부"], components: ["식물성단백질", "이소플라본", "식이섬유", "저탄수화물", "칼슘"], effects: [
    { condition: "체중·비만", effect: "밀가루면 대비 열량·탄수화물이 낮은 편이라 체중 관리 식단에 활용되곤 해요.", level: "folk" },
    { condition: "근육·단백질", effect: "식물성 단백질이 풍부해 근육 유지와 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈당·당뇨", effect: "탄수화물이 낮은 편이라 혈당 관리 식단으로 쓰이기도 하나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "콩비지", aka: ["soy pulp", "비지", "오카라", "콩찌꺼기"], components: ["식이섬유", "식물성단백질", "이소플라본", "칼슘", "올리고당"], effects: [
    { condition: "장건강·변비", effect: "식이섬유가 풍부해 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "열량이 낮고 포만감이 있어 체중 관리 식단에 활용되곤 해요.", level: "folk" },
    { condition: "콜레스테롤·이상지질혈증", effect: "식이섬유·콩단백이 콜레스테롤 관리와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "코티지치즈", aka: ["cottage cheese", "코티지"], components: ["단백질(카제인)", "칼슘", "저지방", "나트륨", "비타민B12"], effects: [
    { condition: "근육·단백질", effect: "단백질 함량이 높고 지방이 낮은 편이라 근육 유지·체중 관리 식단에 활용되곤 해요(공식 효능 인정은 아님).", level: "research" },
    { condition: "뼈건강", effect: "칼슘이 들어 있어 뼈 건강과 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "제품에 따라 나트륨이 높을 수 있어 고혈압이 있다면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "분유", aka: ["milk powder", "전지분유", "탈지분유", "조제분유"], components: ["칼슘", "단백질", "유당", "비타민D", "무기질"], effects: [
    { condition: "뼈건강", effect: "칼슘이 농축돼 있어 뼈 건강과 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "근육·단백질", effect: "양질의 단백질이 들어 있어 근육 유지와 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "소화·유당불내증", effect: "유당이 농축돼 있어 유당불내증이 있다면 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "유부", aka: ["fried tofu", "유부주머니", "두부튀김"], components: ["식물성단백질", "이소플라본", "지방(튀김)", "칼슘", "나트륨"], effects: [
    { condition: "근육·단백질", effect: "콩단백 식품으로 근육 유지와 관련해 알려져 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "기름에 튀겨 지방·열량이 높은 편이라 심혈관·체중 관리 중이라면 주의가 필요해요.", level: "caution" },
    { condition: "혈압·고혈압", effect: "조미 양념·간장으로 나트륨이 높을 수 있어 고혈압이 있다면 주의가 필요해요.", level: "caution" },
  ] },
  { name: "새우", aka: ["대하", "흰다리새우", "shrimp", "prawn"], components: ["단백질", "아스타잔틴", "콜레스테롤", "셀레늄", "키토산(껍질)"], effects: [
    { condition: "근육·단백질", effect: "양질의 단백질이 많아 근육·신체 구성에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "붉은 색소인 아스타잔틴이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "콜레스테롤이 비교적 많은 편이라 이상지질혈증이 있다면 섭취량에 주의가 필요해요.", level: "caution" },
    { condition: "알레르기", effect: "갑각류 알레르기가 있다면 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "멸치", aka: ["잔멸치", "디포리", "anchovy"], components: ["칼슘", "단백질", "오메가3(EPA·DHA)", "나트륨(건멸치)", "철분"], effects: [
    { condition: "뼈건강", effect: "뼈째 먹어 칼슘이 풍부해 뼈 건강에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "오메가3 지방산이 혈중 중성지방·혈행과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "혈압·고혈압", effect: "마른 멸치·육수는 나트륨이 높을 수 있어 고혈압이 있다면 간·섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "조개", aka: ["대합", "백합", "clam", "shellfish"], components: ["단백질", "타우린", "철분", "아연", "비타민B12"], effects: [
    { condition: "빈혈·철분", effect: "철분·비타민B12가 들어 있어 혈액 생성에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(빈혈 치료를 대체하지는 않으며 공식 효능 인정은 아님).", level: "research" },
    { condition: "피로·간건강", effect: "타우린이 피로·간 기능과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "식중독·신선도", effect: "여름철·익히지 않은 조개는 비브리오 등 식중독 위험이 있어 신선도와 충분한 가열에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "바지락", aka: ["바지라기", "manila clam"], components: ["타우린", "철분", "비타민B12", "단백질", "베타인"], effects: [
    { condition: "간건강·피로", effect: "타우린·베타인이 간 기능·피로와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "빈혈·철분", effect: "철분·비타민B12가 들어 있어 혈액 생성에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(빈혈 치료를 대체하지는 않으며 공식 효능 인정은 아님).", level: "research" },
    { condition: "식중독·신선도", effect: "익히지 않거나 상한 조개류는 식중독 위험이 있어 신선도와 충분한 가열에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "게", aka: ["꽃게", "대게", "킹크랩", "crab"], components: ["단백질", "키틴·키토산(껍질)", "아연", "셀레늄", "오메가3"], effects: [
    { condition: "근육·단백질", effect: "저지방 고단백 식품이라 근육·신체 구성에 필요한 단백질을 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "면역", effect: "아연·셀레늄이 들어 있어 정상적인 면역 기능 유지에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "통풍·요산", effect: "내장·알 부위는 퓨린·콜레스테롤이 있어 통풍·이상지질혈증이 있다면 섭취에 주의가 필요해요.", level: "caution" },
    { condition: "알레르기", effect: "갑각류 알레르기가 있다면 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "문어", aka: ["참문어", "왜문어", "octopus"], components: ["단백질", "타우린", "구리", "셀레늄", "비타민B12"], effects: [
    { condition: "근육·단백질", effect: "저지방 고단백 식품이라 근육·신체 구성에 필요한 단백질을 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "피로·간건강", effect: "타우린이 피로·간 기능과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "콜레스테롤·이상지질혈증", effect: "콜레스테롤이 있는 편이라 이상지질혈증이 있다면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "가리비", aka: ["관자", "scallop"], components: ["단백질", "타우린", "마그네슘", "오메가3", "비타민B12"], effects: [
    { condition: "근육·단백질", effect: "저지방 고단백 식품이라 근육·신체 구성에 필요한 단백질을 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈행·심혈관", effect: "오메가3 지방산이 혈행과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "식중독·신선도", effect: "익히지 않은 패류는 식중독 위험이 있어 신선도와 충분한 가열에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "미꾸라지", aka: ["추어", "추어탕", "loach"], components: ["단백질", "칼슘", "불포화지방", "비타민A", "비타민D"], effects: [
    { condition: "기력·회복", effect: "추어탕으로 보양·기력 보충에 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "뼈건강", effect: "통째로 갈아 먹어 칼슘이 풍부해 뼈 건강에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "근육·단백질", effect: "단백질이 풍부해 근육·신체 구성에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "홍합", aka: ["담치", "섭", "mussel"], components: ["단백질", "타우린", "철분", "비타민B12", "오메가3"], effects: [
    { condition: "빈혈·철분", effect: "철분·비타민B12가 들어 있어 혈액 생성에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(빈혈 치료를 대체하지는 않으며 공식 효능 인정은 아님).", level: "research" },
    { condition: "피로·간건강", effect: "타우린이 피로·간 기능과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "식중독·신선도", effect: "봄철 패류독소(마비성 패독)·미가열 섭취 위험이 있어 산지 정보와 충분한 가열에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "꼬막", aka: ["새꼬막", "참꼬막", "피꼬막", "cockle"], components: ["철분", "비타민B12", "타우린", "단백질", "아연"], effects: [
    { condition: "빈혈·철분", effect: "철분·비타민B12가 풍부해 혈액 생성에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(빈혈 치료를 대체하지는 않으며 공식 효능 인정은 아님).", level: "research" },
    { condition: "피로·간건강", effect: "타우린이 피로·간 기능과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "식중독·신선도", effect: "살짝만 데치는 조리 특성상 신선도·위생에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "애호박", aka: ["주키니", "zucchini", "courgette"], components: ["수분", "식이섬유", "베타카로틴", "비타민C", "칼륨"], effects: [
    { condition: "장건강·변비", effect: "수분과 식이섬유가 들어 있어 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "체중·비만", effect: "열량이 낮고 포만감을 줘 체중 관리 식단에 활용되나, 식품으로서 공식 효능이 인정된 것은 아니에요.", level: "folk" },
    { condition: "혈압·고혈압", effect: "칼륨이 들어 있어 나트륨 배출과 관련해 알려져 있으나 공식 효능 인정은 아니에요. 신장질환이 있다면 칼륨 섭취에 주의가 필요해요.", level: "research" },
  ] },
  { name: "늙은호박", aka: ["청둥호박", "호박", "pumpkin", "호박즙"], components: ["베타카로틴", "식이섬유", "칼륨", "비타민C", "당분"], effects: [
    { condition: "항산화", effect: "베타카로틴 등 항산화 성분이 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "부종·이뇨", effect: "산후 부기·붓기에 좋다고 민간에서 호박즙으로 널리 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "혈당·당뇨", effect: "잘 익은 호박은 당 함량이 있는 편이라 당뇨가 있다면 호박즙 등 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "콩나물", aka: ["대두나물", "soybean sprouts"], components: ["아스파라긴산", "비타민C", "식이섬유", "단백질", "엽산"], effects: [
    { condition: "피로·숙취", effect: "아스파라긴산이 들어 있어 숙취·피로 해소에 좋다고 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "면역", effect: "비타민C가 들어 있어 정상적인 면역 기능 유지에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "근육·단백질", effect: "콩에서 자란 나물이라 식물성 단백질을 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "청경채", aka: ["봉채", "bok choy", "pak choi", "청경채나물"], components: ["베타카로틴", "비타민C", "칼슘", "비타민K", "식이섬유"], effects: [
    { condition: "뼈건강", effect: "칼슘·비타민K가 들어 있어 뼈 건강 유지에 필요한 영양소를 보충하는 데 도움이 될 수 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "항산화", effect: "베타카로틴·비타민C 등 항산화 성분이 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "갑상선주의", effect: "배추속 채소라 갑상선 기능 저하가 있으면 다량 생식에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "쑥갓", aka: ["국화나물", "crown daisy", "garland chrysanthemum"], components: ["베타카로틴", "비타민C", "식이섬유", "칼륨", "엽록소"], effects: [
    { condition: "항산화", effect: "베타카로틴 등 항산화 성분이 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "장건강·변비", effect: "식이섬유가 들어 있어 배변 활동·장 건강과 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "소화·식욕", effect: "특유의 향이 소화·식욕에 좋다고 민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
  ] },
  { name: "미나리", aka: ["water dropwort", "돌미나리"], components: ["베타카로틴", "비타민C", "식이섬유", "칼륨", "플라보노이드"], effects: [
    { condition: "간건강·해독", effect: "간 해독·숙취에 좋다고 민간에서 널리 쓰이나 식품으로서 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "항산화", effect: "베타카로틴·플라보노이드 등 항산화 성분이 들어 있어 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "위생·기생충주의", effect: "물에서 자라 기생충·이물이 있을 수 있으니 생식할 경우 깨끗이 씻어 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "숙주", aka: ["숙주나물", "녹두나물", "mung bean sprouts"], components: ["수분", "비타민C", "식이섬유", "엽산", "칼륨"], effects: [
    { condition: "체중·비만", effect: "열량이 매우 낮고 수분이 많아 체중 관리 식단에 활용되나, 식품으로서 공식 효능이 인정된 것은 아니에요.", level: "folk" },
    { condition: "피로·해독", effect: "열을 내리고 해독에 좋다고 한방·민간에서 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "식중독·위생주의", effect: "생숙주는 식중독균이 번식하기 쉬워 충분히 익히거나 신선하게 보관해 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "해삼", aka: ["sea cucumber", "건해삼", "홍해삼"], components: ["단백질(콜라겐)", "사포닌(홀로톡신)", "콘드로이틴", "칼슘", "철분"], effects: [
    { condition: "기력·회복", effect: "예로부터 자양·보양 식품으로 쓰이나 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "관절건강", effect: "콘드로이틴 등 성분이 관절과 관련해 연구된 바 있어요(공식 효능 인정은 아니에요).", level: "research" },
    { condition: "체중·비만", effect: "지방·열량이 낮은 편이라 체중 관리 중 단백질 보충 식품으로 활용할 수 있어요(공식 효능 인정은 아님).", level: "research" },
  ] },
  { name: "죽순", aka: ["bamboo shoot", "대나무순"], components: ["식이섬유", "칼륨", "단백질", "타이로신", "수분"], effects: [
    { condition: "장건강·변비", effect: "식이섬유가 풍부해 배변 활동에 필요한 영양소를 보충하는 데 도움이 될 수 있어요.", level: "research" },
    { condition: "체중·비만", effect: "열량이 낮고 포만감을 줘 체중 관리 식단에 활용되나, 식품으로서 공식 효능이 인정된 것은 아니에요.", level: "folk" },
    { condition: "위장·조리주의", effect: "생죽순에는 아린맛 성분이 있어 충분히 삶아 조리해야 하며, 과다 섭취 시 소화에 부담이 될 수 있어 주의가 필요해요.", level: "caution" },
  ] },
  { name: "두릅", aka: ["참두릅", "aralia sprout", "두릅순"], components: ["사포닌", "단백질", "비타민C", "식이섬유", "칼슘"], effects: [
    { condition: "혈당·당뇨", effect: "사포닌이 들어 있어 혈당과 관련해 민간·전통적으로 쓰이나 공식 효능은 인정되지 않았어요(혈당약을 나물로 대체하면 안 돼요).", level: "folk" },
    { condition: "피로·기력", effect: "봄나물로 입맛·기력에 좋다고 민간에서 쓰이나 식품으로서 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "조리주의", effect: "생두릅에는 아린 성분이 있어 데쳐서 조리하는 것이 좋고 과다 생식에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "상추", aka: ["lettuce", "잎상추", "꽃상추"], components: ["수분", "식이섬유", "베타카로틴", "비타민K", "락투카리움"], effects: [
    { condition: "수면·진정", effect: "락투카리움 성분 때문에 잠이 잘 온다고 민간에서 알려져 있으나 식품으로서 공식 효능은 인정되지 않았어요.", level: "folk" },
    { condition: "체중·비만", effect: "열량이 낮고 수분·식이섬유가 많아 체중 관리 식단에 활용되나, 식품으로서 공식 효능이 인정된 것은 아니에요.", level: "folk" },
    { condition: "혈액응고·약물주의", effect: "비타민K가 들어 있어 항응고제(와파린 등)를 복용 중이라면 다량 섭취에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "멜론", aka: ["melon", "머스크멜론", "cantaloupe"], components: ["수분", "베타카로틴", "비타민C", "칼륨", "식이섬유"], effects: [
    { condition: "항산화", effect: "베타카로틴·비타민C 등 항산화 성분이 항산화와 관련해 연구된 바 있어요(공식 효능 인정은 아님).", level: "research" },
    { condition: "혈압·고혈압", effect: "칼륨이 나트륨 배출과 관련해 알려져 있으나 공식 효능 인정은 아니며, 신장질환이 있다면 칼륨 섭취에 주의가 필요해요.", level: "research" },
    { condition: "혈당·당뇨", effect: "당 함량이 높은 편이라 당뇨가 있다면 섭취량에 주의가 필요해요.", level: "caution" },
  ] },
  { name: "스테비아", aka: ["stevia", "스테비아잎", "스테비올배당체"], components: ["스테비올배당체(천연 감미료)", "0kcal에 가까움"], effects: [
    { condition: "혈당·당뇨", effect: "열량이 거의 없는 천연 감미료로 설탕 대체 시 혈당·열량 부담을 줄이는 것과 관련해 연구된 바 있어요(질병 치료 효능 아님).", level: "research" },
    { condition: "체중·비만", effect: "설탕 대신 쓰면 당·열량 섭취를 줄일 수 있으나, 단맛 자체에 의존하기보다 식습관 전반이 중요해요.", level: "folk" },
  ] },
]
