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
  { q: '북한방사능', domain: true, soft: true, expectGenericOnly: true, mustNotDataset: ['people'] },
  { q: '방사능', domain: false },

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
  { q: '이산가족 상봉 아직도 하나', domain: true, mustDataset: ['talks'] },

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
]
