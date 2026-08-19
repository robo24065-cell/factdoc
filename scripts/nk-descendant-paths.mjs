// nk-descendant-paths.mjs — 후손 세대가 '지금 실제로 신청·참여할 수 있는' 제도 목록
//
//   node scripts/nk-descendant-paths.mjs            # 링크 생존 확인 후 JSON 생성
//   node scripts/nk-descendant-paths.mjs --no-net   # 네트워크 없이 이전 점검 결과 재사용
//   node scripts/nk-descendant-paths.mjs --built-at=2026-08-19
//   → 북한자료-api/descendant-paths.json
//
// ── 왜 이 파일이 필요한가 ────────────────────────────────────────────
//   isan-descendant.json 은 "후손은 이어받을 의향이 있는데 수단이 없다"는 **진단**만 준다.
//   화면이 진단에서 끝나면 사용자는 아무것도 못 한다. 그래서 **실재하는 제도**만
//   골라 '지금 할 수 있는 일'로 만든다. 없는 제도를 만들어 넣지 않는다.
//
// ── 자격 판정 규칙 (이 파일의 핵심) ──────────────────────────────────
//   eligibility 는 3값만 쓴다: '1세대만' | '후손 가능' | '불명'
//   판정은 **반드시 원문 인용(eligibilityQuote)** 을 동반한다. 인용 없으면 '불명'이다.
//
//   판정의 뿌리는 이산가족법 제2조 정의다:
//     "남북 이산가족"이란 … 8촌 이내의 친척ㆍ인척 및 배우자 또는 배우자이었던 자
//   → 1세대의 손자녀는 재북 종조부와 4촌 안쪽이다. **법적으로 이미 이산가족**이다.
//     '후손은 대상이 아니다'가 아니라, 대상인데 그 사실을 아무도 알려주지 않는 것이
//     실제 문제다. gaps 가 그 지점을 서술한다.
//
//   actionable 기준 (자의적 판단을 막기 위해 명문화):
//     true  = ① 후손이 **자기 이름으로** 신청 주체가 될 수 있고
//             ② 접수 창구(URL·전화·서식)가 **이번 실행에서 실측으로 살아 있음**
//     false = 위 둘 중 하나라도 깨진 경우(창구 소멸, 기고 경로 부재, 1세대 한정 등)
//     실효성(성사 가능성)은 actionable 에 섞지 않는다 — note 와 gaps 로 따로 말한다.
//     이 둘을 섞으면 "제도가 있다/없다"와 "되느냐/안 되느냐"가 뭉개진다.
//
// ── 링크 생존 확인 ───────────────────────────────────────────────────
//   200 만으로는 부족하다. 이 사이트들은 죽은 메뉴에도 200 + 공통 레이아웃을 준다.
//   그래서 URL 마다 `expect` 문자열을 두고 **본문에 실제로 그 문구가 있는지**까지 본다.
//   expect 가 하나라도 안 잡히면 dead 로 본다(HTTP 는 살아 있어도 내용이 바뀐 것).

import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('북한자료-api/descendant-paths.json')
const ARG = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1]
const NO_NET = process.argv.includes('--no-net')
const BUILT_AT = ARG('built-at') || new Date().toISOString().slice(0, 10)

// 통일부 계열 사이트는 체인 인증서가 불완전한 경우가 있어 curl -k 와 동등하게 맞춘다.
// (조사용 GET 만 하고 자격증명을 보내지 않으므로 위험 표면이 없다)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

/* ── 점검 대상 URL ──────────────────────────────────────────────────
   expect: 그 페이지가 '여전히 그 내용'인지 판별하는 지문. 레이아웃 공통문구 금지. */
const CHECKS = [
  { id: 'reunion.home', url: 'https://reunion.unikorea.go.kr/reuni/',
    expect: ['이산가족'] },
  { id: 'reunion.applyInfo', url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_info/view.do?mid=SM00000118',
    // ⚠ expect 는 태그를 건너뛰지 않는다. 원문 "가급적 <b>이산 1세대를…</b>" 처럼 문장 중간에
    //    <b> 가 끼어 있으면 잡히지 않는다 — 태그가 없는 구간만 지문으로 쓴다.
    expect: ['이산가족 1세대 본인 또는 가족으로 1인이상 신청 가능', '이산가족 상봉자 선정시 고령자와 직계가족에 가중치를 부여하므로'] },
  { id: 'reunion.registee', url: 'https://reunion.unikorea.go.kr/reuni/home/fml/registee/main.do?mid=SM00000119',
    expect: ['국내거주신청', '해외거주신청'] },
  { id: 'reunion.visiting', url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_north_visiting/view.do?mid=SM00000120',
    expect: ['북한주민 접촉신고', '북한방문증명서'] },
  { id: 'reunion.contactProc', url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/interchange/5.do?mid=SM00000131',
    expect: ['제9조의2제1항에 따라 미리 신고하려는 남한의 주민', '북한주민접촉 결과보고서'] },
  { id: 'reunion.subsidy', url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/interchange/4.do?mid=SM00000131',
    expect: ['민간교류경비', '최대 600만원'] },
  { id: 'reunion.vleDnaLogin', url: 'https://reunion.unikorea.go.kr/reuni/cmm/login_product.do?mid=SM00000125',
    expect: ['관리번호', '영상편지 제작신청'] },
  { id: 'reunion.donation', url: 'https://reunion.unikorea.go.kr/reuni/home/museum/archive/DonationInfo.do?mid=SM00000265',
    expect: ['여러분의 기록물 기증을 기다립니다', '이산을 기록하는 모든 기록물', '02-2100-5916'] },
  { id: 'reunion.donor', url: 'https://reunion.unikorea.go.kr/reuni/home/museum/archive/Donor.do?mid=SM00000265',
    expect: ['기증자 명단', '개인 기증자'] },
  { id: 'reunion.formLife', url: 'https://reunion.unikorea.go.kr/reuni/home/pds/formula/view.do?id=62&mid=SM00000133',
    expect: ['생애기록물 수집 동의서'] },
  { id: 'reunion.formVle', url: 'https://reunion.unikorea.go.kr/reuni/home/pds/formula/view.do?id=61&mid=SM00000133',
    expect: ['영상편지 제작 신청서'] },
  { id: 'reunion.formDna', url: 'https://reunion.unikorea.go.kr/reuni/home/pds/formula/view.do?id=60&mid=SM00000133',
    expect: ['유전자검사 동의서'] },
  { id: 'reunion.formList', url: 'https://reunion.unikorea.go.kr/reuni/home/pds/formula/list.do?mid=SM00000133',
    expect: ['각종서식관리'] },
  { id: 'reunion.counsel', url: 'https://reunion.unikorea.go.kr/reuni/home/pds/counsel/list.do?mid=SM00000132',
    expect: ['접수상담창구안내'] },
  { id: 'reunion.faq', url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/faq/list_t1.do?mid=SM00000142',
    expect: ['자식, 형제분 등 다른 가족분이 이산가족찾기 신청을 하실 수 있습니다'] },
  { id: 'reunion.qna', url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/qna/list_qna.do?mid=SM00000143',
    expect: ['민원등록', 'epeople.go.kr'] },
  { id: 'reunion.hometownStory', url: 'https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/info.do?mid=SM00000283',
    expect: ['나의 살던 고향은', '사진으로나마 그리운 고향을 만나보실 수 있도록'] },
  { id: 'reunion.archive', url: 'https://reunion.unikorea.go.kr/reuni/home/museum/archive/FrmRecord.do?mid=SM00000264',
    expect: ['기록관'] },
  { id: 'reunion.contest2024', url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/news/view.do?id=5905&mid=SM00000138',
    expect: ['초등ㆍ중고등ㆍ대학생 등 3개 부문', 'isanfilm.or.kr'] },
  { id: 'reunion.dmzWalk2026', url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/news/view.do?id=5931&mid=SM00000138',
    expect: ['2026 DMZ 평화걷기 참여 신청자 모집'] },
  { id: 'mou.reunionOverview', url: 'https://www.unikorea.go.kr/web/unikorea/contents/reunion_current',
    expect: ['이산의 사유와 경위를 불문하고'] },
  { id: 'mou.reunionBuild', url: 'https://www.unikorea.go.kr/web/unikorea/contents/reunion_build',
    expect: ['이산가족 2~3세대로 유전자 검사 대상을 점차 확대하여 나갈 계획', '사후에라도 가족관계를 확인'] },
  { id: 'mou.reunionPlan', url: 'https://www.unikorea.go.kr/web/unikorea/contents/reunion_Promotion',
    expect: ['이산가족 2~3세대 참여에 관한 사항'] },
  { id: 'mou.reunionPrivate', url: 'https://www.unikorea.go.kr/web/unikorea/contents/reunion_private',
    expect: ['생사확인 300만원, 상봉 600만원'] },
  { id: 'tongtong', url: 'https://www.tongtong.go.kr/',
    expect: ['unikoreaWeb'] },      // JS 리다이렉트 스텁 — 그 자체가 지문이다
  { id: 'dmzpeace', url: 'https://www.dmzpeace.co.kr/',
    expect: ['2026 DMZ 평화걷기', '참가신청'] },
  { id: 'law.isan', url: 'https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=259607&type=XML',
    expect: ['8촌 이내의 친척ㆍ인척', '제8조의3(영상편지 제작ㆍ수집 등)'] },
  { id: 'law.isanDecree', url: 'https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=263503&type=XML',
    expect: ['생애기록물의 수집을 신청하려는 자', '영상편지의 제작을 신청하려는 남한의 이산가족'] },
  // 죽은 링크임을 **적극적으로 증명**하기 위해 일부러 넣는다. 2024년 공모전 홈페이지.
  { id: 'contest.isanfilm', url: 'http://www.isanfilm.or.kr/', expect: ['공모'], expectedDead: true },
]

/* ── 후손이 실제로 밟을 수 있는 경로 ────────────────────────────────── */
const PATHS = [
  {
    id: 'isan-apply',
    title: '이산가족찾기 신청(신규 등록)',
    org: '통일부 이산가족납북자과 · 대한적십자사 남북교류팀',
    what: '북에 있는 가족을 찾겠다고 국가에 등록하는 절차로, 여기서 받는 관리번호가 유전자검사·영상편지 신청의 열쇠가 된다.',
    eligibility: '후손 가능',
    eligibilityQuote: '신규신청 : 이산가족 1세대 본인 또는 가족으로 1인이상 신청 가능',
    eligibilityQuote2: '신청하신 분이 사망하셨다면 자식, 형제분 등 다른 가족분이 이산가족찾기 신청을 하실 수 있습니다. (FAQ)',
    counterQuote: '이산가족 상봉자 선정시 고령자와 직계가족에 가중치를 부여하므로, 가급적 이산 1세대를 신청인으로 하여야 컴퓨터 추첨에 유리합니다.',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/home/fml/registee/main.do?mid=SM00000119',
    checkIds: ['reunion.registee', 'reunion.applyInfo', 'reunion.faq'],
    contact: '통일부 이산가족납북자과 02-2100-5896 · 대한적십자사 남북교류팀 02-3705-3652~3',
    legalBasis: '남북 이산가족 생사확인 및 교류 촉진에 관한 법률 제7조제1항 · 같은 법 시행령 제4조제1항 · 별지 제1호서식',
    how: ['온라인: 국내거주신청 / 해외거주신청 버튼 → 6단계 입력 → 등록신청(관리자 승인)',
          '우편·팩스: 별지 제1호서식 작성 후 대한적십자사 남북교류팀 또는 통일부 이산가족납북자과',
          '방문: 전국 265개 접수상담창구(대한적십자사·민주평통 지역협의회·이북5도 시도사무소·통일부)'],
    note: '신청인은 후손 본인이 될 수 있다(본인 성명·주민등록번호로 등록). 다만 상봉 대상자 추첨에서는 고령·직계가족에 가중치가 붙어 후손 명의 신청이 불리하다고 안내 페이지가 명시한다 — 즉 "등록은 되는데 뽑히지는 않는" 구조다.',
  },
  {
    id: 'dna-test',
    title: '이산가족 유전자검사',
    org: '통일부 이산가족납북자과',
    what: '1세대가 세상을 떠난 뒤에도 가족관계를 증명할 수 있도록 유전정보를 국가가 보관하는 사업으로, 통일부가 대상을 2~3세대로 넓히겠다고 공식 문서에 적어 둔 유일한 제도다.',
    eligibility: '후손 가능',
    eligibilityQuote: '이산가족 고령화를 고려하여 이산가족 2~3세대로 유전자 검사 대상을 점차 확대하여 나갈 계획입니다.',
    eligibilityQuote2: '통일부장관은 남북 이산가족의 가족관계 확인을 위하여 남북 이산가족의 신청이 있는 경우 … 유전자검사를 실시할 수 있다. (법 제8조의2제1항) / "남북 이산가족"이란 … 8촌 이내의 친척ㆍ인척 및 배우자 또는 배우자이었던 자를 말한다. (법 제2조제1호)',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/cmm/login_product.do?mid=SM00000125',
    checkIds: ['reunion.vleDnaLogin', 'mou.reunionBuild', 'reunion.formDna', 'law.isan'],
    contact: '통일부 이산가족납북자과 02-2100-5896',
    legalBasis: '이산가족법 제8조의2 · 시행령 제4조의2 · 별지 제2호의2서식(유전자검사 동의서), 별지 제2호의3서식(자료 폐기 요청서)',
    how: ['이산가족찾기 신청으로 관리번호를 먼저 받는다',
          '「신청·안내 → 영상편지/유전자 정보 신청」에 관리번호로 로그인해 신청',
          '또는 별지 제2호의2서식(유전자검사 동의서)을 통일부장관 앞으로 제출'],
    purpose: '이산가족이 사후에라도 가족관계를 확인할 수 있도록',
    stats: { cumulativePersons: 29319, asOf: '2024-12-31', byYear: { 2014: 1211, 2015: 10274, 2016: 10030, 2017: 1178, 2018: 1410, 2019: 20, 2020: 6, 2021: 1020, 2022: 1533, 2023: 1112, 2024: 1525 } },
    note: '통일부 페이지의 문구는 "점차 확대하여 나갈 계획"이다. 몇 년부터 몇 명까지인지는 이 페이지에도, 이산가족법·시행령에도 적혀 있지 않다. 후손 대상 연도별 배정 인원은 이번 조사에서 통일부 원자료로 확인하지 못했다(추정치를 넣지 않았다).',
  },
  {
    id: 'life-record-donation',
    title: '생애기록물 수집 동의(조부모의 사진·편지 기증)',
    org: '통일부 이산가족납북자과',
    what: '조부모가 남긴 사진·편지·자서전·소장품을 국가 기록으로 넘겨 보존시키는 절차로, 시행령이 신청 주체에 신분 제한을 두지 않은 유일한 조항이다.',
    eligibility: '후손 가능',
    eligibilityQuote: '법 제8조의3제1항제2호에 따른 생애기록물의 수집을 신청하려는 자는 별지 제2호의5서식의 생애기록물 수집 동의서를 통일부장관에게 제출해야 한다. (시행령 제4조의3제2항)',
    eligibilityQuote2: '같은 조 제1항은 영상편지에 대해 "신청하려는 남한의 이산가족"으로 주체를 한정하는데, 제2항(생애기록물)은 "신청하려는 자"라고만 쓴다 — 조문 안에서 주체 한정이 의도적으로 빠져 있다.',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/home/pds/formula/view.do?id=62&mid=SM00000133',
    checkIds: ['reunion.formLife', 'law.isanDecree', 'reunion.formList'],
    contact: '통일부 이산가족납북자과 02-2100-5916(기증 문의) · 02-2100-5896(대표)',
    legalBasis: '이산가족법 제8조의3제1항제2호 · 시행령 제4조의3제2항·제4항 · 별지 제2호의5서식(2024-07-02 신설)',
    how: ['별지 제2호의5서식 「남북이산가족 생애기록물 수집 동의서」를 내려받아 작성',
          '수집 유형을 고른다: 수증(소유권 이전) / 수탁(기간 지정) / 기타',
          '제공 목록(명칭·연도·수량·크기·설명)을 적어 통일부장관 앞으로 제출',
          '대리 제출 시 동의인·대리인 신분증 사본과 위임장 등 대리관계 증명서류 첨부'],
    scope: '이산가족의 생애와 관련된 문서, 사진, 시청각자료, 도서ㆍ간행물 및 박물(博物) (시행령 제4조의3제4항)',
    note: '★ 후손이 조부모의 유품을 이어받는 가장 직접적인 법적 통로다. 그런데 서식은 「각종서식관리」 게시판 16번 글에만 있고, 정작 「기증현황」 안내 페이지는 이 서식을 링크하지 않는다. 제도와 안내가 서로를 모른다.',
  },
  {
    id: 'museum-donation',
    title: '디지털박물관 기록물 기증(안내 창구)',
    org: '통일부 이산가족납북자과 · 남북이산가족 디지털박물관',
    what: '이산을 기록한 자료를 연중 아무 때나 받겠다는 박물관의 상시 창구로, 접수 방법은 전화번호 한 줄이 전부다.',
    eligibility: '불명',
    eligibilityQuote: '이산가족 여러분께서 가지고 계신 각종 기록물을 모아 소중히 보존하고 후대에 전달하려고 합니다.',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/home/museum/archive/DonationInfo.do?mid=SM00000265',
    checkIds: ['reunion.donation', 'reunion.donor'],
    contact: '통일부 이산가족납북자과 02-2100-5916',
    legalBasis: null,
    how: ['페이지에 안내된 유일한 방법: 02-2100-5916 으로 전화 문의'],
    scope: '이산을 기록하는 모든 기록물 — 사진, 편지, 자서전, 소장품 등 / 정책·연구·회담 자료, 구술채록, 보도물 등',
    period: '연중',
    note: '문구가 "이산가족 여러분께서"라 후손 포함 여부를 페이지만으로는 판정할 수 없다(그래서 불명). 온라인 신청 폼·이메일·접수 주소가 없고, 기증 절차 4단계(기증신청→소장여부확인→수집→정리 및 보존)는 HTML 주석으로 감춰져 화면에 뜨지 않는다 — 이번 실행에서 소스로 확인했다.',
  },
  {
    id: 'video-letter',
    title: '영상편지 제작 신청',
    org: '통일부 이산가족납북자과',
    what: '북의 가족에게 보낼 영상을 국가 비용으로 찍어 보관하는 사업으로, 남북이 열리면 전달되고 열리지 않아도 기록으로 남는다.',
    eligibility: '후손 가능',
    eligibilityQuote: '법 제8조의3제1항제1호에 따른 영상편지의 제작을 신청하려는 남한의 이산가족은 별지 제2호의4서식의 영상편지 제작 신청서를 통일부장관에게 제출해야 한다. (시행령 제4조의3제1항)',
    eligibilityQuote2: '"남한의 이산가족"의 범위는 법 제2조제1호가 정한 8촌 이내의 친척ㆍ인척이다 — 손자녀는 재북 종조부와 4촌 안쪽이므로 정의상 포함된다.',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/cmm/login_product.do?mid=SM00000125',
    checkIds: ['reunion.vleDnaLogin', 'reunion.formVle', 'mou.reunionBuild', 'law.isanDecree'],
    contact: '통일부 이산가족납북자과 02-2100-5896 · 대한적십자사 02-3705-3652~3',
    legalBasis: '이산가족법 제8조의3제1항제1호 · 시행령 제4조의3제1항 · 별지 제2호의4서식',
    how: ['이산가족찾기 관리번호로 로그인 후 「영상편지/유전자 정보 신청」에서 신청',
          '또는 별지 제2호의4서식 제출(대리 신청 가능 — 위임장 등 대리관계 증명서류 첨부)'],
    stats: { cumulativePersons: 27102, asOf: '2024-12-31' },
    note: '신청서가 "영상편지를 받는 북한의 가족(1명 이상)"과 "신청인과의 관계"를 요구한다 — 후손도 재북 친척을 특정할 수 있으면 채울 수 있는 칸이다. 다만 제도가 후손을 대상으로 명시한 문구는 어디에도 없고, 2005년 이후 제작 실적 27,102명이 세대별로 공표되지 않아 후손 참여분을 분리해 셀 수 없다.',
  },
  {
    id: 'nk-contact-report',
    title: '북한주민 접촉신고',
    org: '통일부 (남북교류협력시스템)',
    what: '재북 친척과 편지·전화·만남 등 어떤 형태로든 연락하려면 미리 내야 하는 신고로, 신고 주체를 "남한의 주민"이라고만 규정해 세대 제한이 없다.',
    eligibility: '후손 가능',
    eligibilityQuote: '『남북교류협력에 관한 법률』제9조의2제1항에 따라 미리 신고하려는 남한의 주민은 접촉 7일 전까지 <북한주민접촉 신고서>에 아래의 서류를 첨부하여 제출하여야 함.',
    eligibilityQuote2: '가족인 북한주민과 회합ㆍ통신하거나 가족의 생사 확인을 위하여 북한주민과 접촉한 경우 … <북한주민사후접촉 신고서>로 사후 신고 가능. (시행령 제16조제2항)',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_north_visiting/view.do?mid=SM00000120',
    applyUrl: 'https://www.tongtong.go.kr/',
    checkIds: ['reunion.visiting', 'reunion.contactProc', 'tongtong'],
    contact: '통일부 이산가족납북자과 02-2100-5896',
    legalBasis: '남북교류협력에 관한 법률 제9조의2 · 같은 법 시행령 제16조 · 이산가족법 시행령 제4조',
    how: ['남북교류협력시스템(tongtong.go.kr)에서 인터넷 신고 — 방문·우편·FAX·재외공관 접수도 가능',
          '접촉 7일 전까지 사전신고, 처리기간 근무일 7일',
          '접촉 후 7일 이내 <북한주민접촉 결과보고서> 제출(서신·사진 사본 첨부)'],
    note: '신고 유효기간 5년, 기간 중에는 신고한 목적 범위 안에서 횟수 제한 없이 접촉할 수 있다. 후손이 조부모를 대신해 재북 친척과 연락하는 법적 통로는 여기가 유일하다.',
  },
  {
    id: 'nk-visit',
    title: '북한방문 신청(북한방문증명서)',
    org: '통일부 (남북교류협력시스템)',
    what: '북한 지역을 직접 방문하려면 받아야 하는 통일부장관 명의 증명서로, 신청 자격은 남한주민이면 되지만 실제 왕래는 사실상 닫혀 있다.',
    eligibility: '후손 가능',
    eligibilityQuote: '[남북교류협력에관한법률] 제9조 제1항은 남한과 북한의 주민이 남한과 북한을 왕래하고자 할 때에는 통일부장관이 발급한 증명서를 소지하여야 한다고 규정하고 있습니다. 따라서, 북한지역을 방문하는 남한주민은 <북한방문증명서>를 … 발급받아 소지하여야 합니다.',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_north_visiting/view.do?mid=SM00000120',
    applyUrl: 'https://www.tongtong.go.kr/',
    checkIds: ['reunion.visiting', 'tongtong'],
    contact: '통일부 이산가족납북자과 02-2100-5896',
    legalBasis: '남북교류협력에 관한 법률 제9조제1항',
    how: ['남북교류협력시스템(tongtong.go.kr)에서 북한방문 신청'],
    note: '창구는 살아 있고 자격에도 세대 제한이 없다. 그러나 통일부 스스로 "이산가족 상봉 행사 등 남북 당국간 이산가족 교류는 북한의 거부로 2018년 8월 이후 중단된 상황"이라고 적고 있다. 신청은 되지만 성사를 기대할 수 있는 상태가 아니다 — actionable 은 창구 생존만 뜻한다.',
  },
  {
    id: 'exchange-subsidy',
    title: '남북 이산가족 민간교류경비 지원',
    org: '통일부 이산가족납북자과',
    what: '민간 경로로 재북 가족의 생사를 확인하거나 만났을 때 든 비용을 국가가 사후에 되돌려주는 제도다.',
    eligibility: '후손 가능',
    eligibilityQuote: '통일부장관은 남한의 이산가족(「북한이탈주민의 보호 및 정착지원에 관한 법률」 제2조제2호에 따른 보호대상자나 보호대상자이었던 사람은 제외한다)이 민간차원에서 다음 각 호의 어느 하나에 해당하는 교류활동을 한 경우 … 민간교류경비를 지원할 수 있다.',
    eligibilityQuote2: '제외 대상으로 명시된 것은 북한이탈주민(보호대상자)뿐이며, 세대에 관한 제한은 없다.',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/interchange/4.do?mid=SM00000131',
    checkIds: ['reunion.subsidy', 'mou.reunionPrivate'],
    contact: '통일부 이산가족납북자과 02-2100-5896 · 대한적십자사 남북교류팀 02-3705-3652',
    legalBasis: '이산가족법 제11조 · 시행령 제6조 · 별지 제3호서식(교류경비 지원금 신청서)',
    how: ['교류활동일로부터 3개월 이내 신청',
          '첨부: 북한주민접촉결과보고서, 재북가족과의 관계를 확인할 수 있는 가족관계기록사항 증명서, 편지·사진·여권 사본 등 교류 증빙'],
    amounts: { 생사확인: 3000000, 상봉: 6000000, 교류지속: 800000, unit: 'KRW', note: '각 1회 한정' },
    note: '⚠ 같은 사이트 안에서 금액이 어긋난다 — 「교류안내」와 통일부 본청 페이지는 300/600/80만원인데, 같은 사이트 FAQ 는 아직 200/500/50만원으로 남아 있다(이번 실행에서 양쪽 실측). 후손이 FAQ 를 먼저 읽으면 틀린 금액을 믿게 된다.',
  },
  {
    id: 'qna-minwon',
    title: '질문과 답변(국민신문고 민원 등록)',
    org: '통일부 · 국민권익위원회 국민신문고',
    what: '이산가족 제도에 대해 후손이 자기 사정을 적어 공식 답변을 받아낼 수 있는, 자격 심사가 전혀 없는 유일한 창구다.',
    eligibility: '후손 가능',
    eligibilityQuote: '질문과 답변 게시판이 국민신문고(epeople.go.kr) 민원신청 폼을 그대로 끼워 넣어 운영된다 — 신청 자격 요건이 페이지에 제시돼 있지 않다.',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/qna/list_qna.do?mid=SM00000143',
    checkIds: ['reunion.qna'],
    contact: '통일부 이산가족납북자과 02-2100-5896',
    legalBasis: null,
    how: ['PC 브라우저에서 「민원등록」 버튼 → 국민신문고 민원신청 폼(통일부 기관코드 1250000)'],
    note: '모바일·태블릿에서는 제공하지 않는다고 페이지가 명시한다. 제도 문의용이지 이어받기 수단은 아니다.',
  },
  {
    id: 'dmz-walk',
    title: '2026 DMZ 평화걷기',
    org: '통일부 (통일부 공고 제2026-92호)',
    what: '접경지역 510km를 걸으며 분단을 몸으로 겪게 하는 통일부 사업으로, 오늘 기준 후손이 실제로 접수할 수 있는 몇 안 되는 참여형 프로그램이다.',
    eligibility: '후손 가능',
    eligibilityQuote: '관심있는 국민 여러분의 많은 참여 바랍니다. … 4차: 2026.9.7.(월) ~ 9.20.(일) (통일부 공고 제2026-92호)',
    actionable: true,
    url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/news/view.do?id=5931&mid=SM00000138',
    applyUrl: 'https://www.dmzpeace.co.kr/',
    checkIds: ['reunion.dmzWalk2026', 'dmzpeace'],
    contact: '2026 DMZ 평화걷기 운영사무국 033-452-0250 · dmzcamp155@naver.com',
    legalBasis: null,
    how: ['통일부 누리집 공지사항 또는 dmzpeace.co.kr 에서 신청',
          '모집 인원 초과 시 성별·연령·참가 동기를 종합 고려해 확정'],
    rounds: [
      { round: 1, target: '청년, 대학생', when: '2026-06-08~06-14', route: '고성~철원', apply: '2026-05-01~05-14' },
      { round: 2, target: '중·고등학생(교사 및 보호자 동반), 대학생, 청년 등', when: '2026-07-04~07-10', route: '고성~파주', apply: '2026-06-01~06-14' },
      { round: 3, target: '외국인, 일반인 등', when: '2026-09-06~09-12', route: '고성~파주', apply: '2026-08-03~08-16' },
      { round: 4, target: '일반 국민', when: '2026-10-18~10-30', route: '고성~강화(12박13일)', apply: '2026-09-07~09-20' },
    ],
    note: '이산가족 후손 전용 프로그램이 아니라 일반 국민 대상이다. 4차 접수(2026-09-07~09-20)는 이 파일의 builtAt 기준으로 아직 시작 전이다.',
  },
  {
    id: 'story-hometown',
    title: '「나의 살던 고향은」 (박물관 스토리)',
    org: '통일부 남북이산가족 디지털박물관',
    what: '함경·평안·황해·경기·강원 다섯 지역의 고향 사진을 보여주는 열람 전용 코너다.',
    eligibility: '불명',
    eligibilityQuote: "'나의 살던 고향은' 코너는 고향을 떠나게 된 이산가족, 실향민분들이 사진으로나마 그리운 고향을 만나보실 수 있도록 기획하였습니다.",
    actionable: false,
    url: 'https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/info.do?mid=SM00000283',
    checkIds: ['reunion.hometownStory'],
    contact: '통일부 이산가족납북자과 02-2100-5896',
    legalBasis: null,
    how: [],
    note: '"만나보실 수 있도록"이라고 쓰여 있듯 보는 코너다. 이번 실행에서 본문 영역에 기고·투고·등록 버튼이 없음을 확인했다(페이지 안의 등록/신청 문자열은 전부 공통 헤더의 로그인·관리번호 모달에서 나온 것). 후손이 조부모의 고향 사진을 여기에 올릴 방법은 없다. 자격 요건 자체가 게시돼 있지 않아 판정 불가 — 그래서 불명이다.',
  },
  {
    id: 'video-contest',
    title: '남북 이산가족 영상편지 공모전(청소년·대학생)',
    org: '통일부',
    what: '초·중·고·대학생이 직접 이산가족 영상편지를 만들어 내는 공모전으로, 후손 세대를 정면으로 겨냥한 유일한 통일부 사업이었으나 2024년 한 번으로 끝났다.',
    eligibility: '후손 가능',
    eligibilityQuote: '이번 공모전은 전국의 초등ㆍ중고등ㆍ대학생 등 3개 부문으로 진행되며, 오는 7.1.(월)~31.(수)까지 공모전 홈페이지(http://www.isanfilm.or.kr)를 통해 접수 가능합니다.',
    eligibilityQuote2: '올해는 처음으로 공모전을 통해 청소년들도 직접 영상편지 제작과정에 참여할 수 있도록 사업방식을 다변화하였습니다. (2024-06-04 보도자료)',
    actionable: false,
    url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/news/view.do?id=5905&mid=SM00000138',
    applyUrl: 'http://www.isanfilm.or.kr/',
    checkIds: ['reunion.contest2024', 'contest.isanfilm'],
    contact: '통일부 이산가족납북자과 02-2100-5896',
    legalBasis: null,
    how: [],
    note: '★ 접수 홈페이지 isanfilm.or.kr 는 DNS 조회 자체가 실패한다(이번 실행에서 실측 — 같은 .or.kr 대조군 koreahana.or.kr 는 정상 응답). 공지사항 368건 전체를 훑어도 2025·2026년 공모전 공고가 없다. 후손을 위해 만들어진 단 하나의 제도가 1회로 끝나고 창구까지 사라진 상태다.',
  },
]

/* ── 후손이 하고 싶어도 제도가 없는 지점 (사실만) ────────────────── */
const GAPS = [
  {
    id: 'no-descendant-registry',
    title: '후손을 후손으로 등록하는 칸이 없다',
    fact: '이산가족찾기 신청서(별지 제1호서식)에는 신청인·신청인의 부모·남한의 가족·찾으려는 북한의 가족 칸만 있다. "신청인이 이산 몇 세대인가"를 적는 칸이 없다.',
    consequence: '통일부의 등록 데이터로는 후손 신청자가 몇 명인지 셀 수 없다. 실태조사가 후손 문항을 1세대에게 대신 물어야 했던 이유가 여기 있다.',
    evidence: '별지 제1호서식(2024-07-02 개정) 전문 확인',
  },
  {
    id: 'eligible-but-unaware',
    title: '법적으로는 이미 이산가족인데, 그렇게 말해 주는 화면이 없다',
    fact: '이산가족법 제2조제1호는 이산가족을 "8촌 이내의 친척ㆍ인척"으로 정의한다. 1세대의 손자녀는 재북 종조부와 4촌 안쪽이므로 정의상 이산가족이다. 그러나 이산가족정보통합시스템의 어느 페이지도 "손자녀도 이산가족입니다"라고 쓰지 않는다.',
    consequence: '자격 있는 사람이 자격 없다고 생각하고 돌아간다. 제도의 문제가 아니라 안내의 문제다.',
    evidence: '법 제2조제1호 원문 · reunion.unikorea.go.kr 전 메뉴 문구 확인',
  },
  {
    id: 'donation-has-no-procedure',
    title: '가장 직접적인 이어받기 통로에 절차가 없다',
    fact: '「기증현황」 안내 페이지에는 수집 대상·기간·전화번호만 있다. 기증 절차 4단계(기증신청→소장여부확인→수집→정리 및 보존)는 HTML 주석 안에 들어가 화면에 렌더링되지 않는다. 온라인 신청 폼도, 접수 이메일도, 우편 주소도 없다.',
    consequence: '후손이 조부모의 사진 상자를 들고도 무엇을 어떻게 해야 하는지 알 수 없다. 유일한 방법이 근무시간 전화 한 통이다.',
    evidence: 'DonationInfo.do 소스 내 <!-- ordinary-step --> 주석 블록',
  },
  {
    id: 'donation-form-not-linked',
    title: '기증 서식과 기증 안내가 서로를 링크하지 않는다',
    fact: '생애기록물 수집 동의서(별지 제2호의5서식, 2024-07-02 신설)는 「각종서식관리」 게시판 16번 글에만 있다. 「기증현황」 안내 페이지는 이 서식을 언급하지도 링크하지도 않는다.',
    consequence: '법이 만들어 준 통로가 사이트 구조 때문에 닫혀 있다. 서식의 존재를 아는 사람만 쓸 수 있다.',
    evidence: 'formula/view.do?id=62 · DonationInfo.do 양쪽 본문 대조',
  },
  {
    id: 'archive-frozen-since-2018',
    title: '기증받은 자료의 공개가 2018년에 멈춰 있는데, 화면은 오늘 날짜를 찍는다',
    // fact/evidence 는 아래에서 measured 값으로 채워진다 — 숫자를 손으로 적어 두지 않는다.
    fact: null,
    factTemplate: '「기증현황」 표의 기준일은 자바스크립트 new Date() 로 접속일이 찍힌다({clientDate}). 표의 수치는 HTML 에 하드코딩돼 있고, 소스에는 원래 문구 "({legacyAsOf})"가 주석으로 남아 있다. 표의 공개건수 합계 {disclosedSum}건은 기록관 실제 조회 결과 {archiveTotal}건과 {matchWord}, 기록관 자료의 최신 생산일은 {newest} 다.',
    consequence: '후손이 기증해도 공개까지 이어진 흔적이 여러 해째 보이지 않는다. 그런데 화면은 오늘 집계한 것처럼 보인다 — 이 서비스가 잡아내려는 as-of 오류의 교과서적 사례다.',
    evidence: 'DonationInfo.do 의 $("#chk-date").text(today) · ArchivesList.do totCnt · 최신 생산일 (모두 이번 실행에서 재측정)',
  },
  {
    id: 'no-contribution-channel',
    title: '박물관 스토리 코너에 일반인·후손이 기고할 길이 없다',
    fact: '「나의 살던 고향은」·「손편지」·「컬렉션」·「시간여행」은 모두 열람 전용이다. 본문 영역에 투고·등록 기능이 없다.',
    consequence: '제4차 실태조사에서 이산가족이 1순위로 요구한 사업이 "사진, 물건 등 기록물 수집 보존"(59.9%)인데, 정작 국민이 자료를 밀어 넣을 입구가 없다.',
    evidence: 'htgallery/info.do 본문 영역 확인 · isan-descendant.json recordPrograms',
  },
  {
    id: 'youth-program-died',
    title: '후손 세대를 겨냥한 단 하나의 사업이 1회로 끝났다',
    fact: '2024년 「남북 이산가족 영상편지 공모전」(초·중·고·대학생 3개 부문)이 유일한 후손 세대 전용 사업이었다. 접수 홈페이지 isanfilm.or.kr 는 현재 DNS 조회에 실패한다. 공지사항 368건에 2025·2026년 후속 공고가 없다.',
    consequence: '후손 수요(세대 간 교류 희망 55.7%)를 향해 정부가 낸 유일한 문이 닫혔고, 그 자리를 대신하는 상시 프로그램이 없다.',
    evidence: '공지사항 id=5905/5911 · isanfilm.or.kr DNS 실패 실측',
  },
  {
    id: 'dna-scale-undisclosed',
    title: '후손 유전자검사의 규모가 공표되지 않는다',
    fact: '통일부는 "이산가족 2~3세대로 유전자 검사 대상을 점차 확대하여 나갈 계획"이라고만 쓴다. 연도별 후손 배정 인원, 신청 자격의 세부 요건, 후손 신청 실적은 통일부 페이지·이산가족법·시행령 어디에도 없다. 연도별 실적표(2014~2024, 누계 29,319명)도 세대 구분이 없다.',
    consequence: '후손이 "나도 대상인가"를 확인할 방법이 공식 자료 안에 없다. 확인 경로는 전화 문의뿐이다.',
    evidence: 'unikorea.go.kr/web/unikorea/contents/reunion_build · 이산가족법 제8조의2 · 시행령 제4조의2',
  },
  {
    id: 'faq-stale-amounts',
    title: '같은 사이트가 서로 다른 금액을 말한다',
    fact: '민간교류경비 지원금이 「교류안내」와 통일부 본청에서는 생사확인 300만원·상봉 600만원·교류지속 80만원인데, 같은 사이트 FAQ 에는 200만원·500만원·50만원으로 남아 있다.',
    consequence: '어느 쪽이 최신인지 화면이 말해 주지 않는다. 기준일 없는 안내가 만드는 전형적 오류다.',
    evidence: 'interchange/4.do · reunion_private · faq/list_t1.do 3자 대조',
  },
  {
    id: 'selection-penalizes-descendants',
    title: '등록은 되지만 뽑히지는 않는다',
    fact: '상봉 대상자 선정은 고령자와 직계가족에 가중치를 준다(가족관계별 가중치: 부모/부부/자식 3, 형제자매 3, 기타 1). 안내 페이지는 "가급적 이산 1세대를 신청인으로 하여야 컴퓨터 추첨에 유리합니다"라고 명시한다.',
    consequence: '후손이 신청인이 되는 순간 추첨에서 불리해진다. 후손에게 열린 것은 등록이지 상봉이 아니다.',
    evidence: 'uf_info/view.do · interchange/view.do 인선 기준',
  },
  {
    id: 'no-descendant-survey',
    title: '후손에게 직접 물어본 조사가 아직 없다',
    fact: '제4차 실태조사(2024)의 후손 문항은 자손이 있는 1세대 4,042명이 자기 자손을 대신 평가한 값이다.',
    consequence: '후손 세대의 실제 인식·수요를 정부가 직접 측정한 데이터가 존재하지 않는다.',
    evidence: 'isan-descendant.json caveats',
  },
]

/* ── 확인했으나 후손 제도가 아닌 것 (조사 범위 기록) ──────────────── */
const NOT_APPLICABLE = [
  {
    org: '남북하나재단(북한이탈주민지원재단)',
    url: 'https://www.koreahana.or.kr/welcome.do',
    finding: '전 사업이 북한이탈주민 및 그 자녀 대상이다(장학사업·디딤돌사업·의료지원 등 사업명에 전부 "북한이탈주민"이 붙는다). 홈페이지 전문에 "이산가족" 문자열이 0회 등장한다(실측). 이산가족 후손 대상 프로그램은 확인되지 않았다.',
  },
  {
    org: '하나원(통일부 소속기관)',
    url: null,
    finding: '북한이탈주민 정착교육기관으로 일반인·후손이 신청하는 프로그램이 아니다. 독립 신청 도메인도 확인되지 않았다(hanawon.unikorea.go.kr 연결 실패).',
  },
  {
    org: '이북5도위원회(행정안전부)',
    url: 'https://www.ibuk5do.go.kr/',
    finding: '통일부 소속이 아니다. 「이북5도 등 명예도민증 수여 규정」이 2025-09-11 제정된 것은 확인했으나, 후손 대상 여부와 신청 절차를 사이트에서 확인하지 못했다 — 판정 불가로 남긴다(추정하지 않았다).',
  },
]

/* ── 링크 생존 확인 ────────────────────────────────────────────────── */
const TIMEOUT_MS = 30000
const RETRY = 2

async function probe(check) {
  const rec = { id: check.id, url: check.url, status: null, bytes: null, ms: null, expectHits: [], expectMiss: [], ok: false, error: null }
  for (let attempt = 0; attempt <= RETRY; attempt++) {
    const t0 = Date.now()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
    try {
      // ⚠ 헤더 값은 ByteString 이다 — 한글을 넣으면 fetch 가 통째로 던진다(실제로 밟았다). ASCII 만 쓴다.
      const res = await fetch(check.url, { redirect: 'follow', signal: ac.signal, headers: { 'user-agent': 'nk-descendant-paths/1.0 (MOU open-data contest research)' } })
      const body = await res.text()
      rec.status = res.status
      rec.bytes = Buffer.byteLength(body)
      rec.ms = Date.now() - t0
      rec.finalUrl = res.url && res.url !== check.url ? res.url : undefined
      for (const e of check.expect || []) (body.includes(e) ? rec.expectHits : rec.expectMiss).push(e)
      rec.ok = res.ok && rec.expectMiss.length === 0
      rec.error = null
      break
    } catch (e) {
      rec.error = e.name === 'AbortError' ? `timeout>${TIMEOUT_MS}ms` : (e.cause?.code || e.code || e.message)
      rec.ms = Date.now() - t0
      rec.ok = false
    } finally { clearTimeout(timer) }
  }
  // 죽어 있어야 정상인 링크(2024 공모전 홈페이지) — 살아나면 그것이 뉴스다
  if (check.expectedDead) rec.expectedDead = true
  return rec
}

async function runChecks() {
  const out = []
  // 같은 호스트에 몰아치지 않도록 4개씩 끊어 돈다
  for (let i = 0; i < CHECKS.length; i += 4) {
    out.push(...await Promise.all(CHECKS.slice(i, i + 4).map(probe)))
  }
  return out
}

function loadPrev() {
  if (!fs.existsSync(OUT)) return null
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')) } catch { return null }
}

/* ── 실측 계층 ───────────────────────────────────────────────────────
   gaps 가 주장하는 숫자를 이 파일이 **스스로 다시 재게** 한다.
   손으로 적어 둔 숫자는 다음 실행에서 조용히 틀려지지만, 여기서 재면 틀려지는 순간 드러난다.
   재기 실패는 null 로 남긴다 — 절대 이전 값으로 메우지 않는다. */
async function measure() {
  const m = {
    donationTable: null,          // 기증현황 표(HTML 하드코딩) 파싱 결과
    donationAsOfIsClientDate: null,
    donationStepBlockCommentedOut: null,
    donationLegacyAsOfInComment: null,
    archivePublicTotal: null,     // 기록관이 실제로 공개 중인 자료 수
    archiveNewestProducedOn: null,
    disclosedSumMatchesArchive: null,
    counselWindows: null,
    errors: [],
  }
  const get = async (url, init) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
    try { const r = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { 'user-agent': 'nk-descendant-paths/1.0 (MOU open-data contest research)' }, ...init }); return await r.text() }
    finally { clearTimeout(t) }
  }

  // ① 기증현황 — 표 수치는 HTML 에 박혀 있고, 기준일은 new Date() 로 접속일이 찍힌다
  try {
    const h = await get('https://reunion.unikorea.go.kr/reuni/home/museum/archive/DonationInfo.do?mid=SM00000265')
    const rows = [...h.matchAll(/<th>([^<]+)<\/th>\s*<td>([\d,]+)[^<]*<\/td>\s*<td>([\d,]+)[^<]*<\/td>/g)]
      .map(([, label, a, b]) => ({ label: label.trim(), collected: +a.replace(/,/g, ''), disclosed: +b.replace(/,/g, '') }))
    if (rows.length) {
      m.donationTable = {
        rows,
        collectedSum: rows.reduce((s, r) => s + r.collected, 0),
        disclosedSum: rows.reduce((s, r) => s + r.disclosed, 0),
      }
    }
    m.donationAsOfIsClientDate = /#chk-date"\)\.text\(today\)/.test(h) && /var\s+today\s*=.*date\.getFullYear\(\)/s.test(h)
    m.donationStepBlockCommentedOut = /<!--\s*<div class="ordinary ordinary-step">/.test(h)
    m.donationLegacyAsOfInComment = (h.match(/\/\*\s*\(([^)]*현재)\)\s*\*\//) || [])[1] || null
  } catch (e) { m.errors.push('donation: ' + (e.cause?.code || e.message)) }

  // ② 기록관 — 공개 중인 자료의 실제 건수와 최신 생산일
  try {
    const body = 'mid=SM00000264&pageIndex=1&i_type=&archiveType=0&listType=&searchType=2&search=&orderType=1&pageUnit=20'
    const h = await get('https://reunion.unikorea.go.kr/reuni/home/museum/archive/ArchivesList.do',
      { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'nk-descendant-paths/1.0 (MOU open-data contest research)' } })
    // 응답은 세션 상태에 따라 totCnt 를 name= 로도, id= 로도 준다(둘 다 실제로 관측했다). 양쪽을 받는다.
    const tot = h.match(/(?:name|id)="totCnt"\s+value="(\d+)"/)
    if (tot) m.archivePublicTotal = +tot[1]
    else m.errors.push('archive: totCnt 를 응답에서 찾지 못함')
    const dates = [...h.matchAll(/>\s*((?:19|20)\d{2}\.\d{1,2}(?:\.\d{1,2})?)\s*</g)].map(x => x[1])
    if (dates.length) m.archiveNewestProducedOn = dates.map(d => d.replace(/\./g, '-')).sort().at(-1)
  } catch (e) { m.errors.push('archive: ' + (e.cause?.code || e.message)) }

  if (m.donationTable != null && m.archivePublicTotal != null) {
    m.disclosedSumMatchesArchive = m.donationTable.disclosedSum === m.archivePublicTotal
  }

  // ③ 전국 접수상담창구 수
  try {
    const h = await get('https://reunion.unikorea.go.kr/reuni/home/pds/counsel/list.do?mid=SM00000132')
    const t = h.match(/총\s*<?[^>]*>?\s*([\d,]+)\s*<?[^>]*>?\s*건/) || h.replace(/<[^>]+>/g, '').match(/총\s*([\d,]+)\s*건/)
    if (t) m.counselWindows = +t[1].replace(/,/g, '')
  } catch (e) { m.errors.push('counsel: ' + (e.cause?.code || e.message)) }

  return m
}

/* ── 실행 ───────────────────────────────────────────────────────────── */
const prev = NO_NET ? loadPrev() : null
const checks = NO_NET ? (prev?.meta?.checks || []) : await runChecks()
if (NO_NET && !checks.length) {
  console.error('--no-net 인데 이전 점검 결과가 없다. 네트워크 없이 만들 수 없다.')
  process.exit(1)
}
const measured = NO_NET ? (prev?.meta?.measured || null) : await measure()
const byId = Object.fromEntries(checks.map(c => [c.id, c]))

// 링크 판정을 paths 에 되먹인다: 창구가 죽었으면 actionable 은 유지될 수 없다.
for (const p of PATHS) {
  const mine = (p.checkIds || []).map(id => byId[id]).filter(Boolean)
  const primary = mine.filter(c => !c.expectedDead)
  p.linkStatus = mine.map(c => ({ id: c.id, status: c.status, ok: c.ok, error: c.error || undefined }))
  const allOk = primary.length > 0 && primary.every(c => c.ok)
  if (p.actionable && !allOk) {
    p.actionable = false
    p.autoDowngraded = true
    p.note = `[자동강등] 이번 실행에서 접수 창구 점검에 실패해 actionable 을 false 로 내렸다(${primary.filter(c => !c.ok).map(c => c.id).join(', ')}). ` + p.note
  }
}

// 숫자가 들어가는 gap 문장은 실측값으로 조립한다. 못 재면 그 사실을 문장에 그대로 쓴다.
{
  const g = GAPS.find(x => x.id === 'archive-frozen-since-2018')
  const m = measured || {}
  const ok = m.donationTable != null && m.archivePublicTotal != null
  g.fact = ok
    ? g.factTemplate
        .replace('{clientDate}', m.donationAsOfIsClientDate ? '실행 시 확인됨' : '이번 실행에서는 확인되지 않음')
        .replace('{legacyAsOf}', m.donationLegacyAsOfInComment || '주석 없음')
        .replace('{disclosedSum}', m.donationTable.disclosedSum.toLocaleString())
        .replace('{archiveTotal}', m.archivePublicTotal.toLocaleString())
        .replace('{matchWord}', m.disclosedSumMatchesArchive ? '정확히 일치하며' : '일치하지 않으며')
        .replace('{newest}', m.archiveNewestProducedOn || '확인 실패')
    : `이번 실행에서 기증현황 표 또는 기록관 건수를 재는 데 실패했다(${(m.errors || []).join(' / ') || '원인 미상'}). 수치를 추정으로 채우지 않는다.`
  delete g.factTemplate
}

const deadUrls = checks.filter(c => !c.ok && !c.expectedDead).map(c => ({ id: c.id, url: c.url, status: c.status, error: c.error, expectMiss: c.expectMiss }))
const confirmedDead = checks.filter(c => c.expectedDead && !c.ok).map(c => c.url)
const revived = checks.filter(c => c.expectedDead && c.ok).map(c => c.url)

const summary = {
  actionableCount: PATHS.filter(p => p.actionable).length,
  gen1OnlyCount: PATHS.filter(p => p.eligibility === '1세대만').length,
  unknownCount: PATHS.filter(p => p.eligibility === '불명').length,
  descendantEligibleCount: PATHS.filter(p => p.eligibility === '후손 가능').length,
  totalPaths: PATHS.length,
  gapCount: GAPS.length,
}

const out = {
  builtAt: BUILT_AT,
  sources: [
    { name: '이산가족정보통합시스템 — 이산가족 신청/교류안내', url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_info/view.do?mid=SM00000118', asOf: BUILT_AT },
    { name: '이산가족정보통합시스템 — 이산가족 신청 및 취소', url: 'https://reunion.unikorea.go.kr/reuni/home/fml/registee/main.do?mid=SM00000119', asOf: BUILT_AT },
    { name: '이산가족정보통합시스템 — 북한주민접촉신고·방문신청', url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/uf_north_visiting/view.do?mid=SM00000120', asOf: BUILT_AT },
    { name: '이산가족정보통합시스템 — 교류안내 > 재북가족과의 접촉', url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/interchange/5.do?mid=SM00000131', asOf: BUILT_AT },
    { name: '이산가족정보통합시스템 — 교류안내 > 교류주선 및 지원', url: 'https://reunion.unikorea.go.kr/reuni/home/cms/page/interchange/4.do?mid=SM00000131', asOf: BUILT_AT },
    { name: '남북이산가족 디지털박물관 — 기증현황(기증 안내)', url: 'https://reunion.unikorea.go.kr/reuni/home/museum/archive/DonationInfo.do?mid=SM00000265', asOf: BUILT_AT },
    { name: '이산가족정보통합시스템 — 각종서식관리(별지 서식)', url: 'https://reunion.unikorea.go.kr/reuni/home/pds/formula/list.do?mid=SM00000133', asOf: '2024-09-05' },
    { name: '이산가족정보통합시스템 — FAQ', url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/faq/list_t1.do?mid=SM00000142', asOf: BUILT_AT },
    { name: '통일부 — 주요사업 > 이산가족 > 교류기반 구축(유전자검사·영상편지)', url: 'https://www.unikorea.go.kr/web/unikorea/contents/reunion_build', asOf: '2025-07-30' },
    { name: '통일부 — 주요사업 > 이산가족 > 교류촉진 기본계획 및 실태조사', url: 'https://www.unikorea.go.kr/web/unikorea/contents/reunion_Promotion', asOf: '2025-07-30' },
    { name: '통일부 — 주요사업 > 이산가족 > 민간교류 지원', url: 'https://www.unikorea.go.kr/web/unikorea/contents/reunion_private', asOf: '2025-07-30' },
    { name: '남북 이산가족 생사확인 및 교류 촉진에 관한 법률 [법률 제20184호]', url: 'https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=259607&type=XML', asOf: '2024-08-07' },
    { name: '같은 법 시행령 [대통령령] — 제4조·제4조의2·제4조의3', url: 'https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=263503&type=XML', asOf: '2024-08-07' },
    { name: '통일부 공고 제2026-92호 — 2026 DMZ 평화걷기 참여 신청자 모집', url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/news/view.do?id=5931&mid=SM00000138', asOf: '2026-04-30' },
    { name: '통일부 보도자료 — 청소년ㆍ대학생 대상 남북 이산가족 영상편지 공모전', url: 'https://reunion.unikorea.go.kr/reuni/home/brd/bbsatcl/news/view.do?id=5905&mid=SM00000138', asOf: '2024-06-11' },
  ],
  paths: PATHS,
  summary,
  gaps: GAPS,
  meta: {
    actionableCriterion: '후손이 자기 이름으로 신청 주체가 될 수 있고(①), 접수 창구가 이번 실행에서 실측으로 살아 있을 때(②) true. 성사 가능성(실효성)은 판정에 넣지 않고 note 와 gaps 로 따로 말한다.',
    eligibilityRule: "'1세대만' | '후손 가능' | '불명' 3값. 판정은 반드시 원문 인용을 동반하며, 인용이 없으면 '불명'으로 남긴다.",
    legalRoot: '이산가족법 제2조제1호 — "남북 이산가족"이란 이산의 사유와 경위를 불문하고, 현재 군사분계선 이남지역과 이북지역으로 흩어져 있는 8촌 이내의 친척ㆍ인척 및 배우자 또는 배우자이었던 자를 말한다.',
    checkedUrls: checks.length,
    liveUrls: checks.filter(c => c.ok).length,
    deadUrls,
    confirmedDead,
    revived,
    checks,
    notApplicable: NOT_APPLICABLE,
    // ↓ 전부 이번 실행에서 다시 잰 값이다. 재기 실패 시 null 이며 이전 값으로 메우지 않는다.
    measured: { ...(measured || {}), measuredAt: NO_NET ? (prev?.meta?.measured?.measuredAt ?? null) : BUILT_AT, formsAddedOn: '2024-07-02 (별지 제2호의2~제2호의5서식 신설·개정)' },
    caveats: [
      '이 파일은 공개 웹페이지·법령 원문에서만 만들었다. 통일부 내부 지침·연도별 사업계획은 열람하지 못했다.',
      '유전자검사의 후손 대상 연도·규모(예: 2025년 1,550명)는 통일부 공개 페이지·법령에서 확인되지 않았다. 확인되지 않은 수치를 채워 넣지 않았다.',
      '「나의 살던 고향은」의 기고 가능 여부는 페이지에 규정이 없어 불명으로 두었다. 기능 부재는 실측했으나 정책상 금지인지는 알 수 없다.',
      '이북5도위원회 명예도민증의 후손 대상 여부는 확인하지 못했다.',
    ],
  },
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8')

/* ── 콘솔 리포트 ───────────────────────────────────────────────────── */
const L = '─'.repeat(72)
console.log('═'.repeat(72))
console.log(' 후손이 지금 신청·참여할 수 있는 통일부 제도')
console.log('═'.repeat(72))
console.log(` 링크 점검  ${out.meta.liveUrls}/${checks.length} 생존` +
  (deadUrls.length ? `  · 실패 ${deadUrls.length}건` : '') +
  (confirmedDead.length ? `  · 소멸확인 ${confirmedDead.length}건` : ''))
for (const d of deadUrls) console.log(`   ✗ ${d.id}  status=${d.status ?? '-'} ${d.error ? '('+d.error+')' : ''} ${d.expectMiss?.length ? 'miss='+d.expectMiss.length : ''}`)
for (const u of confirmedDead) console.log(`   † 소멸 확인  ${u}`)
for (const u of revived) console.log(`   ! 죽은 줄 알았던 링크가 살아났다 — 확인 필요: ${u}`)
console.log(L)
console.log(` 경로 ${summary.totalPaths}건 · 후손 가능 ${summary.descendantEligibleCount} · 불명 ${summary.unknownCount} · 1세대만 ${summary.gen1OnlyCount}`)
console.log(` ★ 지금 할 수 있는 일 (actionable) : ${summary.actionableCount}건`)
console.log(L)
for (const p of PATHS.filter(x => x.actionable)) {
  console.log(`  ○ ${p.title}`)
  console.log(`      ${p.what}`)
  console.log(`      [${p.eligibility}] ${p.contact || ''}`)
}
const blocked = PATHS.filter(x => !x.actionable)
if (blocked.length) {
  console.log(L)
  console.log(' 후손에게 열려 있지 않은 것')
  for (const p of blocked) console.log(`  ✗ ${p.title}  [${p.eligibility}]`)
}
console.log(L)
const M = measured || {}
console.log(' 실측')
console.log(`   기증현황 표(HTML 하드코딩)   수집 ${M.donationTable ? M.donationTable.collectedSum.toLocaleString() : '?'}건 · 공개 ${M.donationTable ? M.donationTable.disclosedSum.toLocaleString() : '?'}건`)
console.log(`   기록관 실제 공개 자료        ${M.archivePublicTotal?.toLocaleString() ?? '측정실패'}건  (합계 일치: ${M.disclosedSumMatchesArchive === null || M.disclosedSumMatchesArchive === undefined ? '?' : M.disclosedSumMatchesArchive ? '예' : '아니오'})`)
console.log(`   기록관 최신 생산일           ${M.archiveNewestProducedOn ?? '측정실패'}`)
console.log(`   기증 기준일이 접속일인가     ${M.donationAsOfIsClientDate ? '예 (new Date())' : '아니오/미확인'}   주석에 남은 원 기준일: ${M.donationLegacyAsOfInComment ?? '없음'}`)
console.log(`   기증 절차 4단계 주석처리     ${M.donationStepBlockCommentedOut ? '예 (화면에 안 뜸)' : '아니오/미확인'}`)
console.log(`   전국 접수상담창구            ${M.counselWindows?.toLocaleString() ?? '측정실패'}곳`)
if (M.errors?.length) console.log(`   ⚠ 측정 실패: ${M.errors.join(' / ')}`)
console.log(L)
console.log(` 간극 ${GAPS.length}건`)
for (const g of GAPS) console.log(`  · ${g.title}`)
console.log('═'.repeat(72))
console.log(` → ${OUT}  (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`)
