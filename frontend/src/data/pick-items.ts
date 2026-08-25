/* 자동 생성 파일 — 손으로 고치지 마라. scripts/nk-pick-items.mjs 가 재생성한다.
   음식 16(문화적 통설·통일부 자료 아님) · 풍경 16(통일부 게재·저작권은 제공처·이미지 비보관)
   · 북녘 말 16(통일부 「남북한 언어비교」 원문). 지역 축은 map.json regionsOld 7종. */
const data = {
 "builtAt": "2026-08-25",
 "generator": "scripts/nk-pick-items.mjs",
 "note": "참여(/pick) 월드컵 항목. 말은 통일부 공공데이터 원문, 풍경은 통일부 게재·제공처 저작(이미지 비보관), 음식 지역 귀속은 문화적 통설이며 통일부 공표 자료가 아니다 — 화면에서 이 셋을 섞지 않는다.",
 "regionsOld": [
  {
   "id": "hwanghae-old",
   "name": "황해도(구)"
  },
  {
   "id": "pyongan-s-old",
   "name": "평안남도(구)"
  },
  {
   "id": "pyongan-n-old",
   "name": "평안북도(구)"
  },
  {
   "id": "hamgyong-s-old",
   "name": "함경남도(구)"
  },
  {
   "id": "hamgyong-n-old",
   "name": "함경북도(구)"
  },
  {
   "id": "gyeonggi-unrec",
   "name": "미수복경기"
  },
  {
   "id": "gangwon-unrec",
   "name": "미수복강원"
  }
 ],
 "crosswalkNote": "1945년 이전 구행정구역과 현행 북한 행정구역의 근사 대응입니다. 실제 경계는 일치하지 않습니다(예: 구 평안북도 일부 군이 현 량강도에, 구 함경남도 일부가 현 강원도에 편입).",
 "foods": [
  {
   "id": "food-pyeongyang-naengmyeon",
   "name": "평양냉면",
   "region": "평안남도(구)",
   "desc": "메밀 사리에 차게 식힌 고기 국물과 동치미 국물을 부어 낸 평양의 국수",
   "basis": "향토음식 통설(평양)",
   "source": "https://encykorea.aks.ac.kr/Article/E0059956",
   "sourceName": "한국민족문화대백과사전",
   "regionId": "pyongan-s-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-eobok-jaengban",
   "name": "어복쟁반",
   "region": "평안남도(구)",
   "desc": "놋쟁반에 소 편육과 버섯·달걀을 둘러 담고 육수를 부어 여럿이 함께 먹는 평양 음식",
   "basis": "향토음식 통설(평양)",
   "source": "https://www.seouland.com/arti/culture/culture_general/3326.html",
   "sourceName": "서울&(한겨레)",
   "regionId": "pyongan-s-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-chalgangnaengi-tteok",
   "name": "찰강냉이떡",
   "region": "평안북도(구)",
   "desc": "찰옥수수 가루로 쳐서 만드는 의주·벽동 지방의 떡",
   "basis": "향토음식 통설(의주·벽동)",
   "source": "https://lampcook.com/food_story/northfood_story_view.php?idx_no=2-2",
   "sourceName": "램프쿡 북한전통음식(평안북도)",
   "regionId": "pyongan-n-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-ganggye-guksu",
   "name": "강계 느릅쟁이국수",
   "region": "평안북도(구)",
   "desc": "느릅나무 즙 가루를 옥수수·메밀가루에 섞어 눌러 낸 강계·만포의 질긴 국수",
   "basis": "강계·만포는 현행 자강도 — 자강도는 1949년 신설, 광복 당시에는 평안북도",
   "source": "https://lampcook.com/food_story/northfood_story_view.php?idx_no=2-4",
   "sourceName": "램프쿡 북한전통음식(자강도)",
   "regionId": "pyongan-n-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-hamhung-naengmyeon",
   "name": "함흥냉면(농마국수)",
   "region": "함경남도(구)",
   "desc": "감자 녹말로 뽑아 발이 가늘고 질긴 함흥의 국수 — 본래 회를 얹은 회국수",
   "basis": "향토음식 통설(함흥)",
   "source": "https://encykorea.aks.ac.kr/Article/E0062286",
   "sourceName": "한국민족문화대백과사전",
   "regionId": "hamgyong-s-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-gajami-sikhae",
   "name": "가자미식해",
   "region": "함경남도(구)",
   "desc": "가자미에 조밥·엿기름·무채·고춧가루를 섞어 삭힌 함남 해안(신포·홍원·단천)의 밥반찬",
   "basis": "향토음식 통설(함남 해안)",
   "source": "https://encykorea.aks.ac.kr/Article/E0000318",
   "sourceName": "한국민족문화대백과사전",
   "regionId": "hamgyong-s-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-myeongtae-sundae",
   "name": "명태순대(동태순대)",
   "region": "함경북도(구)",
   "desc": "명태 속을 비우고 소를 채워 쪄 낸 함경도·강원 동해안 북부의 겨울 음식",
   "basis": "통설은 「함경도 동해안」 — 명태 이름이 함북 명천 유래(임하필기)라 함북 축에 두되 한계를 남긴다",
   "source": "https://encykorea.aks.ac.kr/Article/E0016834",
   "sourceName": "한국민족문화대백과사전",
   "regionId": "hamgyong-n-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-yeongchae-kimchi",
   "name": "영채김치",
   "region": "함경북도(구)",
   "desc": "갓 계통 영채로 담가 누르스름하고 맵고 상쾌한 길주·명천의 김치",
   "basis": "향토음식 통설(길주·명천)",
   "source": "http://lampcook.com/food_story/northfood_story_view.php?idx_no=2-5",
   "sourceName": "램프쿡 북한전통음식(함경북도)",
   "regionId": "hamgyong-n-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-haeju-bibimbap",
   "name": "해주비빔밥(해주교반)",
   "region": "황해도(구)",
   "desc": "돼지기름에 볶은 밥에 수양산 고사리와 옹진 김을 얹는 해주의 비빔밥",
   "basis": "해동죽지에 해주 명물로 기록",
   "source": "https://encykorea.aks.ac.kr/Article/E0079943",
   "sourceName": "한국민족문화대백과사전",
   "regionId": "hwanghae-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-kimchi-mari",
   "name": "김치말이",
   "region": "황해도(구)",
   "desc": "차게 식힌 김칫국물에 밥이나 국수를 말아 먹는 황해도 주식",
   "basis": "황해도 주식류 통설 — 평안도에도 같은 이름의 음식이 있다",
   "source": "https://www.lampcook.com/food/food_city10.php",
   "sourceName": "램프쿡 북한전통음식(황해도)",
   "regionId": "hwanghae-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-nammae-juk",
   "name": "남매죽",
   "region": "황해도(구)",
   "desc": "팥죽에 밀가루 반죽을 떼어 넣어 곡물과 팥을 함께 끓이는 황해도 죽",
   "basis": "황해도 주식류 통설",
   "source": "https://www.lampcook.com/food/food_city10.php",
   "sourceName": "램프쿡 북한전통음식(황해도)",
   "regionId": "hwanghae-old",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-joraengi-tteokguk",
   "name": "조랭이떡국",
   "region": "미수복경기",
   "desc": "가래떡을 대나무칼로 눌러 누에고치 모양으로 빚어 끓이는 개성의 설 떡국",
   "basis": "향토음식 통설(개성)",
   "source": "https://ncms.nculture.org/food/story/1756",
   "sourceName": "지역N문화(한국문화원연합회)",
   "regionId": "gyeonggi-unrec",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-gaeseong-pyeonsu",
   "name": "개성편수",
   "region": "미수복경기",
   "desc": "소를 다지지 않고 채 쳐 넣어 네모지게 빚는 개성의 여름 만두",
   "basis": "향토음식 통설(개성)",
   "source": "https://encykorea.aks.ac.kr/Article/E0059843",
   "sourceName": "한국민족문화대백과사전",
   "regionId": "gyeonggi-unrec",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-gaeseong-juak",
   "name": "개성주악(우메기)",
   "region": "미수복경기",
   "desc": "찹쌀 반죽을 기름에 지져 꿀에 재우는 개성의 폐백·이바지 과줄",
   "basis": "향토음식 통설(개성)",
   "source": "https://www.munhwa.com/article/11508070",
   "sourceName": "문화일보",
   "regionId": "gyeonggi-unrec",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-geumgang-jatjuk",
   "name": "금강잣죽",
   "region": "미수복강원",
   "desc": "쌀에 잣을 섞어 쑤는 금강·고성 지방의 죽",
   "basis": "향토음식 통설(금강·고성)",
   "source": "https://www.lampcook.com/food_story/northfood_story_view.php?idx_no=2-8",
   "sourceName": "램프쿡 북한전통음식(강원도)",
   "regionId": "gangwon-unrec",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  },
  {
   "id": "food-goseong-haesamtang",
   "name": "고성 해삼탕",
   "region": "미수복강원",
   "desc": "금강산 앞바다 고성에서 나는 해삼으로 끓이는 지방 특산 국",
   "basis": "고성군은 광복 당시 강원도 — 현재 남북으로 갈려 있다",
   "source": "https://www.lampcook.com/food_story/northfood_story_view.php?idx_no=2-8",
   "sourceName": "램프쿡 북한전통음식(강원도)",
   "regionId": "gangwon-unrec",
   "attribution": {
    "kind": "folk",
    "label": "문화적 통설 · 통일부 자료 아님"
   }
  }
 ],
 "sceneries": [
  {
   "id": "scene-F000280740",
   "fileId": "F000280740",
   "name": "청천강 승리다리(박천군)",
   "caption": "평안북도 박천군 청천강 승리다리 도로 (제공 : 평화문제연구소)",
   "region": "평안북도(구)",
   "regionId": "pyongan-n-old",
   "regionBasis": "caption:「평안북도」",
   "provider": "평화문제연구소",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280740.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280740.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_02.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 평화문제연구소",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280220",
   "fileId": "F000280220",
   "name": "묘향산 불영대(향산군)",
   "caption": "묘향산(妙香山) 불영대(佛影臺) - 평안북도 향산군 (제공 : 미디어한국학)",
   "region": "평안북도(구)",
   "regionId": "pyongan-n-old",
   "regionBasis": "areaRaw:평안북도→crosswalk",
   "provider": "미디어한국학",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280220.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280220.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_02.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 미디어한국학",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280345",
   "fileId": "F000280345",
   "name": "영변읍성 육승정",
   "caption": "평안북도 영변읍성 안 육승정 전경 (제공 : 미디어한국학)",
   "region": "평안북도(구)",
   "regionId": "pyongan-n-old",
   "regionBasis": "caption:「평안북도」",
   "provider": "미디어한국학",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280345.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280345.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_02.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 미디어한국학",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280733",
   "fileId": "F000280733",
   "name": "대동강에 비친 석양(평양)",
   "caption": "대동강에 비친 석양 (제공 : 평화문제연구소)",
   "region": "평안남도(구)",
   "regionId": "pyongan-s-old",
   "regionBasis": "areaRaw:평양시→crosswalk",
   "provider": "평화문제연구소",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280733.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280733.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_02.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 평화문제연구소",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280241",
   "fileId": "F000280241",
   "name": "대동문(평양)",
   "caption": "대동문(大同門) - 평양시 (제공 : 미디어한국학)",
   "region": "평안남도(구)",
   "regionId": "pyongan-s-old",
   "regionBasis": "areaRaw:평양시→crosswalk",
   "provider": "미디어한국학",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280241.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280241.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_02.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 미디어한국학",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280741",
   "fileId": "F000280741",
   "name": "함흥 성천교와 만세교",
   "caption": "함흥시 성천교(좌)와 만세교 교각(우) (제공 : 평화문제연구소)",
   "region": "함경남도(구)",
   "regionId": "hamgyong-s-old",
   "regionBasis": "areaRaw:함흥시→현행 함경남도→crosswalk",
   "provider": "평화문제연구소",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280741.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280741.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_01.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 평화문제연구소",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280201",
   "fileId": "F000280201",
   "name": "백두산(삼지연)",
   "caption": "백두산(白頭山) - 양강도 삼지연시 (제공 : 영남통일교육센터)",
   "region": "함경남도(구)",
   "regionId": "hamgyong-s-old",
   "regionBasis": "areaRaw:양강도→crosswalk",
   "provider": "영남통일교육센터",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280201.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280201.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_01.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 영남통일교육센터",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280192",
   "fileId": "F000280192",
   "name": "칠보산(명천군)",
   "caption": "칠보산(七寶山) - 함경북도 명천군 (제공 : 미디어한국학)",
   "region": "함경북도(구)",
   "regionId": "hamgyong-n-old",
   "regionBasis": "areaRaw:함경북도→crosswalk",
   "provider": "미디어한국학",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280192.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280192.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_01.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 미디어한국학",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280248",
   "fileId": "F000280248",
   "name": "두만강 상류(무산군)",
   "caption": "두만강 상류 북중 국경지역 풍경 - 함경북도 무산군 (제공 : 평화문제연구소)",
   "region": "함경북도(구)",
   "regionId": "hamgyong-n-old",
   "regionBasis": "areaRaw:함경북도→crosswalk",
   "provider": "평화문제연구소",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280248.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280248.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_01.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 평화문제연구소",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280285",
   "fileId": "F000280285",
   "name": "구월산 전경",
   "caption": "구월산 전경 - 황해남도 (제공 : 미디어한국학)",
   "region": "황해도(구)",
   "regionId": "hwanghae-old",
   "regionBasis": "areaRaw:황해남도→crosswalk",
   "provider": "미디어한국학",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280285.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280285.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_03.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 미디어한국학",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280717",
   "fileId": "F000280717",
   "name": "몽금포 전경",
   "caption": "황해남도 용연군 몽금포 전경 (제공 : 미디어한국학)",
   "region": "황해도(구)",
   "regionId": "hwanghae-old",
   "regionBasis": "areaRaw:황해남도→crosswalk",
   "provider": "미디어한국학",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280717.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280717.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_03.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 미디어한국학",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280218",
   "fileId": "F000280218",
   "name": "수양산성(해주)",
   "caption": "수양산성(首陽山城) - 황해남도 해주시 (제공 : 평화문제연구소)",
   "region": "황해도(구)",
   "regionId": "hwanghae-old",
   "regionBasis": "areaRaw:황해남도→crosswalk",
   "provider": "평화문제연구소",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280218.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280218.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_03.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 평화문제연구소",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280226",
   "fileId": "F000280226",
   "name": "선죽교(개성)",
   "caption": "개성에 위치한 선죽교(善竹橋) (제공 : 미디어한국학)",
   "region": "미수복경기",
   "regionId": "gyeonggi-unrec",
   "regionBasis": "tab:경기도",
   "provider": "미디어한국학",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280226.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280226.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_04.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 미디어한국학",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280207",
   "fileId": "F000280207",
   "name": "박연폭포(개성)",
   "caption": "박연폭포(朴淵瀑布) - 개성시 (제공 : 미디어한국학)",
   "region": "미수복경기",
   "regionId": "gyeonggi-unrec",
   "regionBasis": "areaRaw:개성시→crosswalk",
   "provider": "미디어한국학",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280207.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280207.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_04.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 미디어한국학",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280277",
   "fileId": "F000280277",
   "name": "금강산 삼일포",
   "caption": "금강산 삼일포 - 강원도 (제공 : 미디어한국학)",
   "region": "미수복강원",
   "regionId": "gangwon-unrec",
   "regionBasis": "areaRaw:강원도→crosswalk",
   "provider": "미디어한국학",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280277.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280277.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_05.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 미디어한국학",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  },
  {
   "id": "scene-F000280204",
   "fileId": "F000280204",
   "name": "금강산 해금강(고성군)",
   "caption": "금강산(金剛山) 해금강(海金江) - 강원도 고성군 (제공 : 영남통일교육센터)",
   "region": "미수복강원",
   "regionId": "gangwon-unrec",
   "regionBasis": "areaRaw:강원도→crosswalk",
   "provider": "영남통일교육센터",
   "thumbUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/thumb/F000280204.jpg",
   "viewUrl": "https://reunion.unikorea.go.kr/reuni/atchfile/view/F000280204.jpg",
   "sourceUrl": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_05.do?mid=SM00000283",
   "attribution": {
    "kind": "site",
    "label": "제공: 영남통일교육센터",
    "note": "통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)"
   }
  }
 ],
 "words": {
  "nonRegional": true,
  "note": "문화어-표준어 대응(통일부 「남북한 언어비교」 21,985쌍) — 지역 방언이 아니므로 고향 축을 붙이지 않는다.",
  "source": "북한자료-api/wordCmp.json",
  "total": 21985,
  "attribution": {
   "kind": "mou",
   "label": "통일부 공공데이터 「남북한 언어비교」"
  },
  "pairs": [
   {
    "id": "word-도시락|곽밥",
    "ko": "도시락",
    "nk": "곽밥",
    "pk": "도시락|곽밥"
   },
   {
    "id": "word-누룽지|가마치",
    "ko": "누룽지",
    "nk": "가마치",
    "pk": "누룽지|가마치"
   },
   {
    "id": "word-노크|손기척",
    "ko": "노크",
    "nk": "손기척",
    "pk": "노크|손기척"
   },
   {
    "id": "word-젤리|단묵",
    "ko": "젤리",
    "nk": "단묵",
    "pk": "젤리|단묵"
   },
   {
    "id": "word-도넛|가락지빵",
    "ko": "도넛",
    "nk": "가락지빵",
    "pk": "도넛|가락지빵"
   },
   {
    "id": "word-주스|과일단물",
    "ko": "주스",
    "nk": "과일단물",
    "pk": "주스|과일단물"
   },
   {
    "id": "word-수제비|뜨더국",
    "ko": "수제비",
    "nk": "뜨더국",
    "pk": "수제비|뜨더국"
   },
   {
    "id": "word-달걀|닭알",
    "ko": "달걀",
    "nk": "닭알",
    "pk": "달걀|닭알"
   },
   {
    "id": "word-거위|게사니",
    "ko": "거위",
    "nk": "게사니",
    "pk": "거위|게사니"
   },
   {
    "id": "word-원피스|달린옷",
    "ko": "원피스",
    "nk": "달린옷",
    "pk": "원피스|달린옷"
   },
   {
    "id": "word-주차장|차마당",
    "ko": "주차장",
    "nk": "차마당",
    "pk": "주차장|차마당"
   },
   {
    "id": "word-헬리콥터|직승기",
    "ko": "헬리콥터",
    "nk": "직승기",
    "pk": "헬리콥터|직승기"
   },
   {
    "id": "word-볼펜|원주필",
    "ko": "볼펜",
    "nk": "원주필",
    "pk": "볼펜|원주필"
   },
   {
    "id": "word-골키퍼|문지기",
    "ko": "골키퍼",
    "nk": "문지기",
    "pk": "골키퍼|문지기"
   },
   {
    "id": "word-어묵|물고기떡",
    "ko": "어묵",
    "nk": "물고기떡",
    "pk": "어묵|물고기떡"
   },
   {
    "id": "word-에스컬레이터|계단승강기",
    "ko": "에스컬레이터",
    "nk": "계단승강기",
    "pk": "에스컬레이터|계단승강기"
   }
  ]
 },
 "gallerySource": {
  "url": "https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/info.do?mid=SM00000283",
  "collectedAt": "2026-08-21"
 }
}

export default data
