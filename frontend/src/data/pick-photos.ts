/* 자동 생성 파일 — 손으로 고치지 마라. scripts/nk-pick-images.mjs 가 재생성한다.
   위키미디어 공용에서 라이선스를 재검증(PD·CC0·CC-BY·CC-BY-SA 만)하고 640px 파생본을
   frontend/public/pick-img/ 에 저장한 항목만 들어 있다. 없는 항목은 글자 카드가 설계다.
   CC 라이선스 표시 의무: 화면에서 author·license 를 반드시 함께 보여 줄 것.
   생성 2026-08-25 · 항목 27/27 (음식 11/16 · 말 16/16) */

export type PickPhoto = {
  /** frontend/public 기준 경로 — 640px 이하 파생본(소형 원본은 그대로) */
  src: string
  /** 캡션 — 「참고 사진」 여부와 실물과의 차이를 정직하게 적은 줄 */
  caption: string
  author: string
  license: string
  licenseUrl: string | null
  /** 위키미디어 공용 파일 페이지 — 저작자 표시 링크는 결과 화면에서만 건다 */
  sourcePage: string
}

const PICK_PHOTOS: Record<string, PickPhoto> = {
  "food-pyeongyang-naengmyeon": {
    "src": "/pick-img/food-pyeongyang-naengmyeon.jpg",
    "caption": "평양 현지에서 촬영된 평양랭면 — 참고 사진",
    "author": "東京のエビフライ at Japanese Wikipedia",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Pyongyang_raengmyon_20150503.jpg"
  },
  "food-hamhung-naengmyeon": {
    "src": "/pick-img/food-hamhung-naengmyeon.jpg",
    "caption": "남한식 함흥냉면 — 참고 사진",
    "author": "Mobius6",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Hamhung_naengmyeon_20221209_001.jpg"
  },
  "food-gajami-sikhae": {
    "src": "/pick-img/food-gajami-sikhae.jpg",
    "caption": "가자미식해 — 참고 사진",
    "author": "kyungeun",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Gajamisikhae_(fermented_righteye_flounders).jpg"
  },
  "food-yeongchae-kimchi": {
    "src": "/pick-img/food-yeongchae-kimchi.jpg",
    "caption": "참고 사진: 갓김치 — 영채는 갓 계통 채소이며, 영채김치 그 자체의 사진은 아닙니다",
    "author": "kimsco",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Gat-gimchi_2.jpg"
  },
  "food-haeju-bibimbap": {
    "src": "/pick-img/food-haeju-bibimbap.jpg",
    "caption": "참고 사진: 일반 비빔밥 — 해주교반과 조리법이 다릅니다",
    "author": "Chloe Lim",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Bibimbap_7.jpg"
  },
  "food-kimchi-mari": {
    "src": "/pick-img/food-kimchi-mari.jpg",
    "caption": "김치말이국수 — 참고 사진",
    "author": "대경라이프",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Gimchi-mari-guksu_1.jpg"
  },
  "food-nammae-juk": {
    "src": "/pick-img/food-nammae-juk.jpg",
    "caption": "참고 사진: 팥죽 — 남매죽은 팥죽에 밀반죽을 넣은 형태입니다",
    "author": "wizdata",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Patjuk.jpg"
  },
  "food-joraengi-tteokguk": {
    "src": "/pick-img/food-joraengi-tteokguk.jpg",
    "caption": "참고 사진: 일반 떡국 — 조랭이떡은 누에고치 모양으로 다릅니다",
    "author": "soscs",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tteokguk.jpg"
  },
  "food-gaeseong-pyeonsu": {
    "src": "/pick-img/food-gaeseong-pyeonsu.jpg",
    "caption": "편수 — 참고 사진",
    "author": "행복가족",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Pyeonsu.jpg"
  },
  "food-gaeseong-juak": {
    "src": "/pick-img/food-gaeseong-juak.jpg",
    "caption": "개성주악 — 참고 사진",
    "author": "CooGuy",
    "license": "CC BY-SA 2.0 kr",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/kr/deed.en",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:%EA%B0%9C%EC%84%B1_%EC%A3%BC%EC%95%85.jpg"
  },
  "food-geumgang-jatjuk": {
    "src": "/pick-img/food-geumgang-jatjuk.jpg",
    "caption": "참고 사진: 잣죽 — 금강·고성 지역에서 촬영된 것은 아닙니다",
    "author": "맘앤쿡",
    "license": "CC BY 2.0 kr",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0/kr/deed.en",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Jatjuk.jpg"
  },
  "word-도시락|곽밥": {
    "src": "/pick-img/word-dosirak.jpg",
    "caption": "도시락",
    "author": "Sharon Ang",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Dosirak.jpg"
  },
  "word-누룽지|가마치": {
    "src": "/pick-img/word-nurungji.jpg",
    "caption": "누룽지",
    "author": "Hyeon-Jeong Suk",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Nurungji.jpg"
  },
  "word-노크|손기척": {
    "src": "/pick-img/word-knock.jpg",
    "caption": "손 모양 문 두드리개(노커)",
    "author": "OliBac from FRANCE",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:La_main_qui_frappe_the_knocking_hand_(1112900443).jpg"
  },
  "word-젤리|단묵": {
    "src": "/pick-img/word-jelly.jpg",
    "caption": "젤리(곰젤리)",
    "author": "Mx. Granger",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Shameless_Snacks_gummy_bears.jpg"
  },
  "word-도넛|가락지빵": {
    "src": "/pick-img/word-doughnut.jpg",
    "caption": "고리 모양 도넛",
    "author": "작자 미상",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Glazed_doughnut_(1387272).jpg"
  },
  "word-주스|과일단물": {
    "src": "/pick-img/word-juice.jpg",
    "caption": "과일 주스(오렌지 주스)",
    "author": "Agency of the United States Department of Agriculture Edited Version by: Arad",
    "license": "Public domain",
    "licenseUrl": null,
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Orange_juice_1_edit1.jpg"
  },
  "word-수제비|뜨더국": {
    "src": "/pick-img/word-sujebi.jpg",
    "caption": "수제비",
    "author": "Steve Longus",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Korean.cuisine-Sujebi-01.jpg"
  },
  "word-달걀|닭알": {
    "src": "/pick-img/word-egg.jpg",
    "caption": "달걀",
    "author": "Batholith (talk)",
    "license": "Public domain",
    "licenseUrl": null,
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Chicken_eggs_20101113.jpg"
  },
  "word-거위|게사니": {
    "src": "/pick-img/word-goose.jpg",
    "caption": "거위",
    "author": "JJ Harrison",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Domestic_Goose.jpg"
  },
  "word-원피스|달린옷": {
    "src": "/pick-img/word-dress.jpg",
    "caption": "원피스(위아래가 하나로 달린 옷)",
    "author": "Peachyeung316",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Black_Floral_Long_Dress_with_comfortable_hat_in_the_fashion_shop_at_Tuen_Mun.jpg"
  },
  "word-주차장|차마당": {
    "src": "/pick-img/word-parking.jpg",
    "caption": "차를 세워 둔 주차장",
    "author": "Dolev",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tel_Aviv_parking_lot.jpg"
  },
  "word-헬리콥터|직승기": {
    "src": "/pick-img/word-helicopter.jpg",
    "caption": "비행 중인 헬리콥터",
    "author": "Vyacheslav Argenberg",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tengboche,_Helicopter_in_flight,_Mountains_of_Nepal.jpg"
  },
  "word-볼펜|원주필": {
    "src": "/pick-img/word-ballpoint.jpg",
    "caption": "볼펜",
    "author": "Augustus Binu : flickr",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Ballpoint_Pen_DS.jpg"
  },
  "word-골키퍼|문지기": {
    "src": "/pick-img/word-goalkeeper.jpg",
    "caption": "공을 막는 골키퍼",
    "author": "Master Sgt. Lance Cheung of U.S. Air Force",
    "license": "Public domain",
    "licenseUrl": null,
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Soccer_goalkeeper.jpg"
  },
  "word-어묵|물고기떡": {
    "src": "/pick-img/word-eomuk.jpg",
    "caption": "어묵 꼬치",
    "author": "최광모 (Choe Kwangmo)",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Eomuk-kkochi.jpg"
  },
  "word-에스컬레이터|계단승강기": {
    "src": "/pick-img/word-escalator.jpg",
    "caption": "에스컬레이터",
    "author": "Basile Morin",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Front_view_of_an_illuminated_outdoor_escalator,_Shinjuku_Station,_Tokyo.jpg"
  }
}

export default PICK_PHOTOS
