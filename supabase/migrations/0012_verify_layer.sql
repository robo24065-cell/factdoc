-- 사실은ON — 검증 레이어 (뉴스 · 주장 · 판정)
--
-- ★ 최상위 설계 원칙: 근거와 검증대상의 물리적 분리
--   record     = 통일부 공식자료 → 판정의 '근거'로만 쓰인다
--   news_item  = 외부 보도       → 판정의 '대상'이자 사용자에게 보여줄 '관련 링크'로만 쓰인다
--
--   verdict_citation.record_id 는 record(id)만 참조한다.
--   → 뉴스를 근거로 인용하는 것이 외래키 수준에서 불가능하다.
--     프롬프트나 코드 규칙이 아니라 DB가 막는다.

-- ════════════════════════════════════════════════════════════
-- 1. 뉴스 (검증 대상 · 관련 링크)
-- ════════════════════════════════════════════════════════════
create table if not exists news_item (
  id           bigserial primary key,
  url          text not null unique,       -- originallink 기준 중복 제거
  title        text not null,
  summary      text,                        -- description (원문 전문 저장 안 함 — 저작권)
  publisher    text,
  published_at timestamptz not null,

  topic        ltree references topic(slug) default 'media.news',
  keywords     text[] default '{}',         -- 수집에 걸린 키워드
  entities     text[] default '{}',

  -- 노이즈 필터 결과
  relevance    text not null default 'unknown'
                 check (relevance in ('strong','weak','noise','unknown')),
  relevance_reason text,

  embedding    vector(1024),
  collected_at timestamptz default now()
);
comment on table news_item is
  '외부 보도. 절대 판정 근거가 아니다. 사용자에겐 "관련 보도" 링크로만 노출한다.';

create index if not exists idx_news_published on news_item (published_at desc);
create index if not exists idx_news_relevance on news_item (relevance, published_at desc);
create index if not exists idx_news_keywords  on news_item using gin (keywords);
create index if not exists idx_news_title_trgm on news_item using gin (title gin_trgm_ops);

-- ════════════════════════════════════════════════════════════
-- 2. 이슈 (뉴스 군집 = "오늘의 이슈")
-- ════════════════════════════════════════════════════════════
create table if not exists issue (
  id            bigserial primary key,
  day           date not null,
  rank          int,
  headline      text not null,             -- 대표 기사 제목
  item_count    int  not null default 0,   -- 기사 수 = 확산 규모
  keywords      text[] default '{}',
  topic         ltree references topic(slug),
  summary       text,                       -- LLM 요약 (근거 아님, 안내문)
  created_at    timestamptz default now(),
  unique (day, headline)
);

create table if not exists issue_item (
  issue_id bigint not null references issue(id) on delete cascade,
  news_id  bigint not null references news_item(id) on delete cascade,
  is_rep   boolean default false,
  primary key (issue_id, news_id)
);

create index if not exists idx_issue_day on issue (day desc, rank);

-- ════════════════════════════════════════════════════════════
-- 3. 주장 (검증 대상) — 사용자 질의 또는 이슈에서 추출
-- ════════════════════════════════════════════════════════════
create table if not exists claim (
  id            bigserial primary key,
  text          text not null,
  canonical     text,                       -- 정규화된 대표 문장 (질의 클러스터링 키)
  cluster_key   text,                       -- 같은 주장으로 묶인 그룹

  origin        text not null check (origin in ('user','news','issue','curated')),
  news_id       bigint references news_item(id),
  issue_id      bigint references issue(id),

  -- 슬롯 분해 (대조표의 행) — 시점(as_of) 슬롯이 핵심
  slot_subject  text,
  slot_relation text,
  slot_object   text,
  slot_value    numeric,
  slot_unit     text,
  slot_as_of    date,                       -- ★ 주장이 가리키는 시점
  slot_polarity text check (slot_polarity in ('assert','negate')),

  topic         ltree references topic(slug),
  embedding     vector(1024),
  ask_count     int default 1,              -- 몇 명이 물었나 → 환류 대시보드
  first_asked_at timestamptz default now(),
  last_asked_at  timestamptz default now()
);

create index if not exists idx_claim_cluster on claim (cluster_key, ask_count desc);
create index if not exists idx_claim_asked   on claim (last_asked_at desc);
create index if not exists idx_claim_topic   on claim using gist (topic);

-- ════════════════════════════════════════════════════════════
-- 4. 판정
-- ════════════════════════════════════════════════════════════
create table if not exists verdict (
  id         bigserial primary key,
  claim_id   bigint not null references claim(id) on delete cascade,

  -- 4등급 — '거짓' 단정이 아니라 공식자료와의 대조 결과
  level      text not null check (level in (
               'confirmed',      -- 공식자료에서 확인됨
               'differs',        -- 공식자료와 다름 (통일부가 이미 설명한 사안에만)
               'partial',        -- 부분 일치 / 맥락 확인 필요
               'unverified'      -- 공식자료로는 확인 불가
             )),
  confidence numeric check (confidence between 0 and 1),

  -- 시점 게이트 결과 — 답변 문구를 결정
  asof_level    text check (asof_level in ('live','stale','frozen')),
  asof_notice   text,
  coverage_end  date,

  -- 슬롯 대조표: [{slot, status: match|mismatch|absent, note}]
  slot_table jsonb,

  basis      text not null default 'none'
               check (basis in ('briefing','record','none')),
  tier       text not null default 'auto'
               check (tier in ('auto','reviewed')),

  engine_version text,
  created_at timestamptz default now()
);

create index if not exists idx_verdict_claim on verdict (claim_id, created_at desc);

-- ════════════════════════════════════════════════════════════
-- 5. 인용 — ★ record만 참조 가능 (뉴스 인용 원천 차단)
-- ════════════════════════════════════════════════════════════
create table if not exists verdict_citation (
  id         bigserial primary key,
  verdict_id bigint not null references verdict(id) on delete cascade,

  -- 여기가 핵심: record(id)만 걸린다. news_item은 참조할 수 없다.
  record_id  bigint not null references record(id),

  quote      text not null,        -- 원문 발췌 (verbatim). 생성문 금지
  locator    jsonb,                -- {page, char_start, char_end}
  stance     text check (stance in ('supports','contradicts','context')),
  verified   boolean not null default false,   -- quote가 원문의 부분문자열인지 코드 검증 통과 여부

  constraint quote_not_empty check (length(btrim(quote)) >= 5)
);
comment on table verdict_citation is
  '판정 근거. record만 참조 가능 — 뉴스를 근거로 인용하는 경로가 외래키로 차단된다.';

create index if not exists idx_cite_verdict on verdict_citation (verdict_id);
create index if not exists idx_cite_record  on verdict_citation (record_id);

-- ════════════════════════════════════════════════════════════
-- 6. 관련 보도 — 사용자에게 '링크만' 보여주는 용도
-- ════════════════════════════════════════════════════════════
create table if not exists verdict_related_news (
  verdict_id bigint not null references verdict(id) on delete cascade,
  news_id    bigint not null references news_item(id) on delete cascade,
  primary key (verdict_id, news_id)
);
comment on table verdict_related_news is
  '"이 주장이 인용된 보도 N건" 표시용. 근거가 아니라 참고 링크이므로 verdict_citation과 분리한다.';

-- ════════════════════════════════════════════════════════════
-- 7. 환류 — 국민이 많이 물었지만 공식자료가 없는 주장
-- ════════════════════════════════════════════════════════════
create or replace view unanswered_demand as
select c.cluster_key,
       min(c.text)               as sample_claim,
       sum(c.ask_count)          as asks,
       count(distinct c.id)      as variants,
       max(c.last_asked_at)      as last_asked,
       count(distinct n.id)      as related_news
from claim c
left join verdict v on v.claim_id = c.id and v.level = 'unverified'
left join verdict_related_news vr on vr.verdict_id = v.id
left join news_item n on n.id = vr.news_id
where v.id is not null
group by c.cluster_key
order by asks desc, related_news desc;

comment on view unanswered_demand is
  '통일부에 역제안할 우선순위. 국민 질의 빈도 × 보도 확산량 교차.';

-- 오늘의 이슈 + 공식자료 매칭 여부
create or replace view issue_board as
select i.day, i.rank, i.headline, i.item_count, i.keywords, i.summary,
       exists (select 1 from claim c join verdict v on v.claim_id = c.id
               where c.issue_id = i.id and v.basis <> 'none') as has_official_basis
from issue i
order by i.day desc, i.rank;
