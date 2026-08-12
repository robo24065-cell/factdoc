# 통일부 OpenAPI 원본 보관소

> 사용자 지시: *"나중에라도 필요해보이는거도 긁어놓자. 나중에 필요할때 받아쓰려면 또 수집시간이 걸리니까"*
>
> 이 API 들은 **몇 주간 전부 504 로 죽어 있었다.** 살아 있을 때 받아서 원본 그대로 남긴다.
> 파일을 지우지 말 것 — 다시 받으려면 서버가 살아 있어야 하고, 그 보장이 없다.

```bash
node scripts/probe-mou-api.mjs      # 18종 상태 점검 → _probe.json
node scripts/fetch-mou-api.mjs      # 확인된 것 전량 수집 (증분 병합)
node scripts/fetch-mou-api.mjs briefing   # 일부만
```

`fetch-mou-api.mjs` 는 **append-only** 다. 다시 돌리면 기존 항목 위에 새 것만 얹는다.
서버가 죽어 절반만 받아도 나중에 재실행하면 이어서 채워진다.

---

## 수집 현황 (2026-08-12)

| 키 | 데이터 | 건수 | 기간 | 상태 |
|---|---|---|---|---|
| `briefing` | 통일부 보도자료 | **2,670** | 2010-01-05 ~ **2025-10-24** | ✅ 전량 |
| `trend` | 북한 동향 | **4,126** | 2021-11-21 ~ **2026-08-11** | ✅ 전량(일일분) |
| `wordCmp` | 남북한 언어비교 | 600 / 22,192 | — | ⚠ **미완** — 서버 `db_error` |

### ⚠ briefing 은 2025-10-24 에서 멈춰 있다
통일부 누리집에는 2026-08-03 「인천 강화 서검도 우라늄 초과 관련」 보도설명자료가 올라와 있는데
**API 에는 없다.** 자료가 없는 게 아니라 **API 갱신이 뒤처진 것**이다.
→ 카탈로그 `coverageEnd` 를 2025-10-24 로 잡고 as-of 를 정직하게 표기할 것. `live` 로 두면 거짓이 된다.

### ⚠ trend 는 일일(ARGUMENT_DAIL)만 들어왔다
`cl` 의 다른 값(주간·월간 추정)은 응답이 비어 있었다. 값 목록을 확정하지 못했다.

---

## 호출 규약 (실측으로 확정 — 추측 아님)

| 키 | 엔드포인트 | 필수 파라미터 | 특이사항 |
|---|---|---|---|
| `briefing` | `1250000/nesdta/getNesdta` | `bgng_ymd`,`end_ymd`,`type=json` | `cn` 에 **본문 전체**. 페이징 동작 |
| `trend` | `1250000/trend/getTrend` | `cl`,`bgng_ymd`,`end_ymd`,`type=json` | `cn` 에 본문. `cl=ARGUMENT_DAIL` |
| `wordCmp` | `1250000/nskwordcmp/getNskwordCmp` | `sj`,`type=json` | `{catgory, koword, nkword}` 남북 단어쌍 |

**공통 함정**
- `totalCount` 가 **반환 건수와 같다** — 총량이 아니다. 끝까지 페이징해야 전량을 안다.
- 간헐적으로 **빈 배열**을 준다. 한 번으로 끝내면 0건으로 잘못 끝난다(briefing 이 실제로 그랬다).
  → 두 번 연속 빈 응답일 때만 종료한다.
- `resultCode:"2" db_error` 가 뜬다 — 서버 문제다. 나중에 재실행.

---

## 아직 못 받은 것

### 활용신청이 필요하다 (HTTP 403) — 사용자만 할 수 있음
공공데이터포털에 로그인해 각 페이지에서 **활용신청**을 눌러야 한다.

| 데이터 | ID | 신청 링크 |
|---|---|---|
| 김정은 공개활동 | 15108096 | https://www.data.go.kr/data/15108096/openapi.do |
| 북한 약사(略史) | 15079276 | https://www.data.go.kr/data/15079276/openapi.do |
| 북한 TV 프로그램 편성표 | 15079329 | https://www.data.go.kr/data/15079329/openapi.do |
| 북한교과서·어린이도서 | 15079243 | https://www.data.go.kr/data/15079243/openapi.do |
| 북한 및 국내외 연속간행물 | 15079299 | https://www.data.go.kr/data/15079299/openapi.do |
| 연도별 인기 대출 도서 | 15079804 | https://www.data.go.kr/data/15079804/openapi.do |
| 신착자료 | 15108105 | https://www.data.go.kr/data/15108105/openapi.do |
| 통일부 채용공고 | 15079125 | https://www.data.go.kr/data/15079125/openapi.do |

### 구독은 됐는데 필수 파라미터를 못 찾았다 (resultCode 11)
상세페이지의 요청 명세가 JS 렌더링이라 자동 추출이 안 된다. 사람이 페이지를 열어
**요청 파라미터 표**를 확인하는 것이 가장 빠르다.

| 데이터 | ID | 엔드포인트 |
|---|---|---|
| 남북관계 남북합의서 | 15131895 | `1250000/nktalkmng/getNktalkmng` |
| 북한 인물 | 15079264 | `1250000/prsn/getPrsn` |
| 북한 개황 | 15108107 | `1250000/nkinfo/getNkinfo` |
| 허가법인 | 15108108 | `1250000/prmisncpr/getPrmisncpr` |
| 북한정보포털 통합검색 | 15079225 | `1250000/search/getSearch` |
| 북한 연구자료 | 15131892 | `1250000/udbresearch/getUdbresearch` |
| 북한 용어사전 | 15151324 | `1250000/nkword/getNkword` |

---

## 기존 카탈로그의 오류 (수정 완료)
- `nkinfo/getNkinfo` 를 '북한정보포털 통합검색'으로 등록했으나 그 데이터셋(15108107)은 **북한 개황**이다.
  진짜 통합검색은 `search/getSearch`(15079225).
- `accord` 의 문서 URL 이 15079225(통합검색)를 가리키고 있었다. 실제는 **15131895**.
