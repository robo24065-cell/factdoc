-- 사실은ON — 북한·통일 팩트체크 지식베이스 스키마
-- 설계 원칙
--   ① as-of 없는 레코드는 존재할 수 없다 (NOT NULL) — "2020년 데이터를 그냥 말해버리는" 사고를 스키마가 차단
--   ② append-only — 갱신은 덮어쓰기가 아니라 새 as_of 스냅샷 추가. fact_key로 동일성 추적
--   ③ 주제는 ltree 경로 — 상위 롤업/하위 전개가 인덱스로 해결
--   ④ 수치는 본문이 아니라 measure 테이블 — "몇 명이냐"류 주장 검증의 대상
--   ⑤ 출처 위치(source_locator)를 저장 — Citations 인용 검증의 근거

create extension if not exists ltree;
create extension if not exists pg_trgm;
create extension if not exists vector;

-- ════════════════════════════════════════════════════════════
-- 1. 주제 트리 사전
--    ltree 라벨은 ASCII만 허용 → 영문 슬러그 + 한글 라벨 분리
-- ════════════════════════════════════════════════════════════
create table if not exists topic (
  slug        ltree primary key,
  label       text  not null,
  description text,
  sort        int   default 0
);

insert into topic (slug, label, sort) values
  ('ik',              '남북관계', 10),
  ('ik.timeline',     '연표', 11),
  ('ik.talks',        '회담', 12),
  ('ik.accord',       '합의서', 13),
  ('ik.travel',       '왕래', 14),
  ('ik.exchange',     '교류협력', 15),
  ('ik.conflict',     '갈등·도발', 16),
  ('econ',            '경제협력', 20),
  ('econ.kaesong',    '개성공단', 21),
  ('econ.kumgang',    '금강산', 22),
  ('econ.trade',      '남북교역', 23),
  ('econ.fund',       '남북협력기금', 24),
  ('nk',              '북한 일반', 30),
  ('nk.politics',     '정치', 31),
  ('nk.economy',      '경제', 32),
  ('nk.society',      '사회', 33),
  ('nk.military',     '군사', 34),
  ('nk.foreign',      '외교', 35),
  ('nk.culture',      '문화', 36),
  ('def',             '북한이탈주민', 40),
  ('def.entry',       '입국', 41),
  ('def.settle',      '정착', 42),
  ('def.edu',         '교육', 43),
  ('def.rights',      '인권', 44),
  ('who',             '인물·기관', 50),
  ('who.person',      '인물', 51),
  ('who.org',         '기관·법인', 52),
  ('humanitarian',            '인도문제', 60),
  ('humanitarian.family',     '이산가족', 61),
  ('humanitarian.rights',     '북한인권', 62),
  ('humanitarian.aid',        '인도적 지원', 63),
  ('gov',             '정부·정책', 70),
  ('gov.policy',      '통일정책', 71),
  ('gov.briefing',    '보도설명자료', 72),   -- ★ 팩트체크 판정 시드
  ('media',           '언론·유포', 80),
  ('media.news',      '뉴스', 81),
  ('media.claim',     '유포 주장', 82)
on conflict (slug) do nothing;

-- ════════════════════════════════════════════════════════════
-- 2. 데이터셋 카탈로그 — as-of 판정의 단일 진실 소스
-- ════════════════════════════════════════════════════════════
create table if not exists dataset (
  id             text primary key,
  name           text not null,
  provider       text not null default '통일부',
  source_url     text,
  origin         text not null check (origin in ('file','api','news')),
  topic          ltree references topic(slug),

  -- 시점 메타 — ready면 필수. pending(API 복구 대기)은 아직 데이터가 없어 기준일도 없다.
  as_of          date,
  coverage_start date,
  coverage_end   date,
  freshness      text not null check (freshness in ('live','stale','frozen')),
  frozen_reason  text,
  update_cycle   text,
  note           text,
  license        text,

  -- 수집/검색 운용
  status          text not null default 'ready' check (status in ('ready','pending','retired')),
  search_priority int  not null default 50,

  -- 수집 상태
  last_success_at   timestamptz,
  consecutive_fail  int default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- frozen이면 사유가 반드시 있어야 한다 ("없다"고 단정하려면 근거 필수)
  constraint frozen_needs_reason
    check (freshness <> 'frozen' or frozen_reason is not null),

  -- 실제로 답변에 쓰이는(ready) 데이터셋은 기준일 없이 존재할 수 없다
  constraint ready_needs_asof
    check (status <> 'ready' or (as_of is not null and coverage_end is not null))
);

-- ════════════════════════════════════════════════════════════
-- 3. 레코드 — append-only 본체
-- ════════════════════════════════════════════════════════════
create table if not exists record (
  id          bigserial primary key,
  dataset_id  text not null references dataset(id) on delete cascade,

  -- ★ 논리적 동일성 키: 같은 사실의 서로 다른 시점 스냅샷을 묶는다
  --   예) 'def.entry.annual.2019' → as_of 2020-03 판, as_of 2025-06 판
  fact_key    text,

  -- ★ 'news' 없음. 이 테이블은 통일부 공식자료 = '판정 근거' 전용이다.
  --   외부 뉴스·유포 주장은 0012의 news_item / claim 으로 분리 (근거로 인용 불가)
  kind        text not null check (kind in ('event','entity','stat','doc','briefing')),
  topic       ltree not null references topic(slug),

  title       text not null,
  body        text,

  -- 이 레코드가 서술하는 시점
  occurred_on  date,
  period_start date,
  period_end   date,

  -- ★ as-of 3종 (NOT NULL) — 없으면 레코드가 존재할 수 없다
  as_of        date not null,
  coverage_end date not null,
  freshness    text not null check (freshness in ('live','stale','frozen')),

  -- 출처·인용
  source_url      text,
  source_locator  jsonb,           -- {page, char_start, char_end, sheet, row}
  payload         jsonb,           -- kind별 확장 필드

  -- 검색
  search    tsvector generated always as (
              to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))
            ) stored,
  embedding vector(1024),

  -- 버전 관리
  content_hash  text,
  ingested_at   timestamptz default now(),
  superseded_by bigint references record(id)
);

comment on column record.fact_key is
  '같은 사실의 다른 as_of 스냅샷을 묶는 논리 키. 최신값은 record_latest 뷰로 조회.';
comment on column record.superseded_by is
  '이 레코드를 대체한 신규 레코드. NULL이면 해당 fact_key의 현행판.';

-- ════════════════════════════════════════════════════════════
-- 4. 수치 — "몇 명/얼마"류 주장 검증의 대상
-- ════════════════════════════════════════════════════════════
create table if not exists measure (
  id           bigserial primary key,
  record_id    bigint not null references record(id) on delete cascade,
  metric       text not null,        -- '입주기업수'
  metric_slug  text,                 -- 정규화 키 (동의 지표 통합)
  value        numeric not null,
  unit         text,                 -- '개', '명', '천달러'
  period_start date,
  period_end   date,
  as_of        date not null,

  -- ★ 차원 — {"연령대":"20-29세","성별":"여"}
  --   "여자가 몇 명이야" / "나이 많은 사람이 더 많이 한다며" 류를 합계·분포로 답하려면 필수
  dims jsonb
);

-- 이미 적용된 DB에도 안전하게 (0011은 멱등이어야 한다)
alter table dataset add column if not exists status          text not null default 'ready';
alter table dataset alter column as_of        drop not null;
alter table dataset alter column coverage_end drop not null;
alter table dataset add column if not exists search_priority int  not null default 50;
alter table measure add column if not exists dims            jsonb;

-- ════════════════════════════════════════════════════════════
-- 5. 엔티티 + 별칭 (남북 용어 대응 포함)
-- ════════════════════════════════════════════════════════════
create table if not exists entity (
  id    bigserial primary key,
  slug  text unique not null,
  name  text not null,
  type  text not null check (type in ('person','org','place','event','term','policy')),
  attrs jsonb            -- 인물: {position, dead, dead_date, birth}
);

create table if not exists entity_alias (
  entity_id bigint not null references entity(id) on delete cascade,
  alias     text   not null,
  kind      text,        -- nk_term(북한식) | sk_term(남한식) | abbrev | official | romanized
  primary key (entity_id, alias)
);
comment on table entity_alias is
  '남북 표기 대응의 저장소. 예) 오물풍선(sk_term) ↔ 대남 쓰레기 풍선(nk_term)';

create table if not exists record_entity (
  record_id bigint not null references record(id) on delete cascade,
  entity_id bigint not null references entity(id) on delete cascade,
  role      text not null default 'mention' check (role in ('subject','object','mention')),
  primary key (record_id, entity_id, role)
);

-- ════════════════════════════════════════════════════════════
-- 6. 인덱스
-- ════════════════════════════════════════════════════════════
create index if not exists idx_record_topic_gist   on record using gist (topic);
create index if not exists idx_record_search_gin   on record using gin  (search);
create index if not exists idx_record_title_trgm   on record using gin  (title gin_trgm_ops);
create index if not exists idx_record_occurred     on record (occurred_on desc nulls last);
create index if not exists idx_record_asof         on record (as_of desc);
create index if not exists idx_record_factkey      on record (fact_key, as_of desc) where fact_key is not null;
create index if not exists idx_record_current      on record (dataset_id) where superseded_by is null;
create index if not exists idx_record_dataset      on record (dataset_id);

create index if not exists idx_measure_metric      on measure (metric_slug, period_start);
create index if not exists idx_measure_record      on measure (record_id);
create index if not exists idx_measure_dims        on measure using gin (dims) where dims is not null;

create index if not exists idx_alias_trgm          on entity_alias using gin (alias gin_trgm_ops);
create index if not exists idx_entity_type         on entity (type);
create index if not exists idx_rec_ent_entity      on record_entity (entity_id);

-- 벡터 인덱스는 데이터 적재 후 생성 (리스트 수를 행 수에 맞춰야 함)
-- create index idx_record_embedding on record using hnsw (embedding vector_cosine_ops);

-- ════════════════════════════════════════════════════════════
-- 7. 뷰
-- ════════════════════════════════════════════════════════════

-- 현행판만 (fact_key별 최신 as_of)
create or replace view record_latest as
select distinct on (coalesce(fact_key, id::text))
       r.*
from record r
where r.superseded_by is null
order by coalesce(fact_key, id::text), as_of desc, id desc;

-- 답변용 시점 판정 — 애플리케이션이 아니라 DB가 문구를 결정한다
create or replace function asof_notice(p_record_id bigint, p_asked_at date default current_date)
returns table (level text, gap_days int, notice text)
language sql stable as $$
  select
    r.freshness,
    (p_asked_at - r.coverage_end)::int,
    case
      when r.freshness = 'frozen' then
        to_char(r.coverage_end,'YYYY년 FMMM월') || ' 기준이며, 이후 데이터는 존재하지 않습니다. ('
        || coalesce(d.frozen_reason,'사업 종료') || ')'
      when r.freshness = 'live' and (p_asked_at - r.coverage_end) <= 7 then
        to_char(r.coverage_end,'YYYY년 FMMM월') || ' 기준 최신 자료입니다.'
      else
        '가장 최근 확인 자료는 ' || to_char(r.coverage_end,'YYYY년 FMMM월')
        || ' 기준입니다. 이후 상황은 확인되지 않습니다.'
        || coalesce(' (' || d.note || ')','')
    end
  from record r join dataset d on d.id = r.dataset_id
  where r.id = p_record_id;
$$;

-- 주제 트리 롤업 (대시보드용)
create or replace view topic_stats as
select t.slug, t.label, subpath(t.slug,0,1)::text as root,
       count(r.id) as records,
       min(r.coverage_end) as oldest,
       max(r.coverage_end) as newest,
       count(*) filter (where r.freshness = 'frozen') as frozen_records
from topic t left join record r on r.topic <@ t.slug
group by t.slug, t.label
order by t.slug;
