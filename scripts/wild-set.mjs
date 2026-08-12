// 실사용 질의 셋 — 답을 정해두지 않는다.
// 사람이 실제로 치는 대로 던지고, '무너지지 않는가'만 본다.
//
// 판정 기준은 정답 문자열이 아니라 행동 규약이다:
//   ① 빈손으로 끝나지 않는가 (도메인 밖이면 빈손이 정답)
//   ② 답에 출처가 붙는가
//   ③ 수치·서술에 시점 고지가 붙는가
//   ④ 엉뚱한 주제로 튀지 않는가
//   ⑤ 정치적 단정을 하지 않는가

export const WILD = [
  // 반말·구어
  { q: '개성공단 아직 하냐', domain: true, expectTopic: 'econ.kaesong' },
  { q: '김정은 요새 뭐함', domain: true },
  { q: '탈북민 몇명임', domain: true, expectTopic: 'def' },
  { q: '북한 사람 얼마나 넘어옴?', domain: true },
  { q: '금강산 가는거 되냐', domain: true, expectTopic: 'econ.kumgang' },
  { q: '남북회담 요즘 함?', domain: true, expectTopic: 'ik.talks' },
  { q: '개성공단 언제 닫았지', domain: true, expectTopic: 'econ.kaesong' },
  { q: '북한이랑 무역 하나', domain: true },
  { q: '탈북민 여자가 많음 남자가 많음', domain: true },
  { q: '김여정 누구임', domain: true },
  { q: '북한 미사일 언제 쐈어', domain: true },
  { q: '이산가족 상봉 아직도 하나', domain: true },

  // 오타·띄어쓰기 붕괴
  { q: '개성공단 입주기엄 몇개', domain: true, expectTopic: 'econ.kaesong' },
  { q: '북한이탈쥬민 통계', domain: true },
  { q: '금강산관광객수', domain: true },
  { q: '개성 공단 생산액 알려주셈', domain: true, expectTopic: 'econ.kaesong' },
  { q: '남북 교역액 얼마', domain: true },
  { q: '북한인물정보', domain: true },

  // 무맥락·초단문
  { q: '개성공단', domain: true, expectTopic: 'econ.kaesong' },
  { q: '탈북민', domain: true },
  { q: '김정은?', domain: true },
  { q: '남북관계', domain: true },

  // 장황·중언부언
  { q: '그 뭐냐 예전에 개성공단이라고 있었잖아 거기 우리 기업들 들어가서 일했던거 그거 지금은 어떻게 됐어?',
    domain: true, expectTopic: 'econ.kaesong' },
  { q: '요즘 뉴스보니까 북한에서 사람들이 많이 내려온다던데 진짜 그런가 몇명이나 되는지 궁금해서요',
    domain: true },
  { q: '아니 그러니까 내 말은 남북이 회담을 마지막으로 한게 언제냐고', domain: true },

  // 애매·주관
  { q: '북한 관련해서 뭐 알려줄거 있어?', domain: true, soft: true },
  { q: '통일 언제됨', domain: true, soft: true, noVerdict: true },
  { q: '북한 무서워?', domain: true, soft: true, noVerdict: true },
  { q: '북한이 나쁜거야?', domain: true, soft: true, noVerdict: true },

  // 도메인 밖 (빈손이 정답)
  { q: '오늘 서울 날씨', domain: false },
  { q: '치킨 맛집 추천', domain: false },
  { q: '아이폰 신제품 언제 나와', domain: false },
  // ── 과잉주장 감시 ─────────────────────────────────────────
  // 답을 정하지 않는다. '무엇이 근거로 붙으면 안 되는가'만 건다.
  // 실측 배경: 수정 전 '북한*' 질의 20건 전부에 인물 3명(김윤심·리성국·강관주)이 붙었다.
  // sourceName '북한 주요 인물'이 본문처럼 색인돼 721명 전원이 '북한'에 걸린 결과다.
  { q: '북한 핵', domain: true, mustNotDataset: ['people'], mustEvidenceAny: ['핵', '비핵'] },
  { q: '북한 핵무기 얼마나 있어', domain: true, mustNotDataset: ['people'] },
  { q: '북한 도발', domain: true, mustNotDataset: ['people'] },
  { q: '북한 수해', domain: true, mustNotDataset: ['people'] },
  { q: '북한 코로나', domain: true, mustNotDataset: ['people'] },
  { q: '북한 미사일 몇번 쐈어', domain: true, mustNotDataset: ['people'] },
  { q: '북한 쌀 지원', domain: true, mustEvidenceAny: ['쌀'] },
  { q: '우라늄 공장 폐수', domain: true, mustNotDataset: ['people'], mustEvidenceAny: ['우라늄'] },
  // 코퍼스에 '방사능' 0건. 답은 하되 '근거를 찾았다'고 말하면 안 된다.
  { q: '북한방사능', domain: true, soft: true, mustNotDataset: ['people'] },
  /* 2026-08-12 갱신: 보도자료·북한동향이 적재되면서 '방사능'이 실제로 코퍼스에 들어왔다
     (북한 외무성의 후쿠시마 오염수 담화 등). 이제 '다루는 분야가 아니다'는 거짓이다.
     테스트를 코드에 맞춘 게 아니라, 데이터가 바뀌어 사실이 바뀐 것이다. */
  { q: '방사능', domain: true },

  // ── 과잉회피 감시 ─────────────────────────────────────────
  // 위 문턱들이 절대 삼켜서는 안 되는 것들. 이쪽이 무너지면 문턱이 과했다는 뜻이다.
  // '북한 요즘 뭐함'은 이 프로젝트가 존재하는 이유 그 자체다.
  { q: '북한 요즘 뭐함', domain: true },
  { q: '북한 최근 어떰', domain: true },
  { q: '북한 굶어죽는대', domain: true },
  { q: '북한 핸드폰 써?', domain: true },
  { q: '북한 잘 사나', domain: true },
  { q: '북한 김치', domain: true },
  { q: '평산 우라늄 어떻게 됐어', domain: true },
  { q: '고농축우라늄', domain: true },
  { q: '남북회담 요즘 함?', domain: true, mustDataset: ['talks'] },
  /* talks 로 못 박았었는데, 보도자료·동향이 들어온 뒤로는 연표의
     「이산가족 상봉 최종명단 교환」이 1순위로 올라온다 — 더 나은 답이다.
     '어느 데이터셋이냐'가 아니라 '이산가족 얘기를 하느냐'로 본다. */
  { q: '이산가족 상봉 아직도 하나', domain: true, mustEvidenceAny: ['이산가족'] },

  // ── 조사 오확장 감시 ──────────────────────────────────────
  // '북한이'(북한+주격조사)가 엔티티 '북한이탈주민'의 부분문자열이라,
  // "북한이 ~" 로 시작하는 모든 질문이 탈북민 통계로 새어 나갔다.
  // 러시아 파병을 물었는데 입국현황 33,501명이 헤드라인이 되는 식이었다.
  { q: '북한이 러시아에 파견했다던데', domain: true, mustNotDataset: ['defectorAge', 'defectorOrigin'] },
  { q: '북한이 남한 공격준비중이라는데 요즘', domain: true, mustNotDataset: ['defectorAge', 'defectorOrigin'] },
  { q: '북한이 미사일 쐈대', domain: true, mustNotDataset: ['defectorAge', 'defectorOrigin'] },
  { q: '북한이 핵실험 또 했어?', domain: true, mustNotDataset: ['defectorAge', 'defectorOrigin'] },
  // 반대 방향 — 진짜 탈북민 질문은 여전히 그 데이터로 답해야 한다
  { q: '북한이탈주민 몇 명이야', domain: true, mustDataset: ['defectorAge'] },
  { q: '탈북민 여자가 몇 명이야', domain: true, mustDataset: ['defectorAge'] },
  // ── 시간 정합성 감시 ──────────────────────────────────────
  // 없는 시점을 물었을 때 '숫자를 지우는 것'도 '그냥 답해버리는 것'도 실패다.
  // 가진 값은 주되(mustNumber) 물어본 시점의 것이 아님을 표시해야 한다(mustOutOfWindow).
  { q: '작년 탈북민은 몇명', domain: true, mustNumber: true, mustOutOfWindow: true },
  { q: '2020년 탈북민은 몇명', domain: true, mustNumber: true, mustOutOfWindow: true,
    topDatasetAny: ['defectorAge', 'defectorOrigin', 'defectorSettle'] },
  { q: '2019년 탈북민 몇명', domain: true, mustNumber: true, mustOutOfWindow: true,
    topDatasetAny: ['defectorAge', 'defectorOrigin', 'defectorSettle'] },
  { q: '내년 탈북민 몇명이야', domain: true, mustNumber: true, mustFuture: true },
  { q: '요즘 탈북민 몇 명이야', domain: true, mustNumber: true, mustOutOfWindow: true },
  // 연도가 검색어로 살아 있으면 제목에 그 연도가 박힌 무관 데이터셋이 1위로 올라온다
  { q: '2018년 남북회담 몇 번 했어', domain: true, topDatasetAny: ['talks'],
    mustNotDataset: ['defectorSettle', 'defectorAge', 'travelAir'] },
  // 반대 방향 — 연도 토큰을 죽이면 이 질의의 재현율이 0이 된다(창내 129건 → 0건)
  { q: '2018년에 남북관계 무슨 일 있었어', domain: true, mustItemsYear: '2018' },
  { q: '2015년 개성공단 생산액', domain: true, expectTopic: 'econ.kaesong',
    topDatasetAny: ['ksFirmsProd', 'ksProduction', 'ksFirms'] },
  // 코퍼스에 '학력' 차원 자료는 0건 — 다른 차원의 수치를 학력인 척 내놓으면 안 된다
  { q: '탈북민 학력 어때', domain: true, mustNoAgg: true },
  // 수량을 묻지 않았다 — 카드로는 남기되 요지가 되면 안 된다
  { q: '탈북했다 다시 월북한다던데', domain: true, mustDemoteNumber: true },

  // ── 과잉회피 감시 (위 시간 조건이 절대 삼켜서는 안 되는 것들) ──
  { q: '탈북민 몇 명이야', domain: true, mustNumber: true, mustNotOutOfWindow: true,
    topDatasetAny: ['defectorAge'] },
  { q: '탈북은 나이 많은 사람이 더 많이 한다며', domain: true, mustNumber: true, mustNotOutOfWindow: true },
  { q: '북한이탈 주민 통계', domain: true, mustNumber: true, mustNotOutOfWindow: true },
  { q: '김정은 최근에 뭐 했어', domain: true },
  { q: '남북교역 규모가 어느 정도야', domain: true },
  { q: '금강산 관광객 지금 얼마나 가', domain: true, expectTopic: 'econ.kumgang' },
  { q: '개성공단에 기업 500개나 있었다던데', domain: true, expectTopic: 'econ.kaesong' },
  // ── 무관 집계 감시 ────────────────────────────────────────
  /* 코퍼스에서 dims 를 가진 measure 는 defectorAge·defectorOrigin 60건뿐이다(실측).
     그 중 한 칸만 상위 40위에 들어오면 질문이 무엇이든 누적 33,501명이 만들어졌다.
     '탈북민 X' 는 한국어에서 가장 흔한 질의형이고, 실측 340건 중 331건이 이 수치를 요지로 내놓았다.
     정답을 못 박지 않는다 — '이 수치가 요지가 되면 안 된다'만 건다(카드로는 남아도 통과). */
  { q: '탈북민 재입북', domain: true, mustDemoteNumber: true },
  { q: '탈북했다 월북한 사례', domain: true, mustDemoteNumber: true },
  { q: '탈북민 자살률', domain: true, mustDemoteNumber: true },
  { q: '탈북민 결혼', domain: true, mustDemoteNumber: true },
  { q: '북한이탈주민 이혼', domain: true, mustDemoteNumber: true },
  { q: '탈북민 주거 통계', domain: true, mustDemoteNumber: true },
  /* ★ 수량 단서가 붙으면 우회된다 — 1차 패치(asksQuantity)와 D1 안이 정확히 여기서 샜다.
     '몇/얼마나/통계/현황' 은 intent 게이트를 켜서 관련성 판정을 건너뛰게 만든다. */
  { q: '탈북민 재입북 몇 명이야', domain: true, mustDemoteNumber: true },
  { q: '탈북민 범죄율 얼마나 돼', domain: true, mustDemoteNumber: true },
  { q: '북한이탈주민 국적 현황', domain: true, mustDemoteNumber: true },
  { q: '탈북민 자녀 학교 몇 명이야', domain: true, mustDemoteNumber: true },
  { q: '탈북민 의료 지원 얼마나 돼', domain: true, mustDemoteNumber: true },
  /* 코퍼스에 답이 있는데(정착현황 12행: 생계급여 수급률 2008 54.8 → 2019 23.8)
     입국 누계로 답하던 질의. 수치를 내리는 것만으로는 절반이다 — 근거가 생계·취업에 닿아야 한다. */
  { q: '탈북민은 뭐먹고 사니', domain: true, mustDemoteNumber: true,
    mustEvidenceAny: ['취업', '생계', '정착', '일자리'] },
  { q: '탈북민 뭐 해서 먹고 살아', domain: true, mustDemoteNumber: true },
  { q: '탈북민 생계급여 받는 사람 몇 명', domain: true, mustDemoteNumber: true },

  // ── 과잉회피 감시 (위 관련성 문턱이 절대 삼켜서는 안 되는 것들) ──
  /* 관련성 문턱은 '설명되지 않는 낱말이 있으면 내린다'이므로 열거에서 빠진 의문 표현이
     전부 '잔여어'가 된다. 사람이 실제로 치는 표현으로 그 구멍을 감시한다. */
  { q: '탈북민 인원 얼마나 돼', domain: true, mustNumber: true },
  { q: '탈북민 규모 알려줘', domain: true, mustNumber: true },
  { q: '탈북민 총 몇명이나 왔어', domain: true, mustNumber: true },
  { q: '탈북민이 몇 명인가요', domain: true, mustNumber: true },
  { q: '탈북민 숫자 알려줘', domain: true, mustNumber: true },
  { q: '탈북민 얼마나 넘어왔어', domain: true, mustNumber: true },
  { q: '북한이탈주민 남녀 각각 몇명', domain: true, mustNumber: true },
]
