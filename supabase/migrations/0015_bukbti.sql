-- 고향잇기 — 북BTI 완성 유형 집계: 0013 과 같은 원칙(개인이 남지 않는 설계)
--
-- 북BTI 는 재미로 보는 취향 놀이다(심리검사·통일부 자료 아님 — 화면이 그렇게 밝힌다).
-- 네 게임(음식·풍경·말·밸런스)의 마지막 확정 결과를 글자 넷으로 접은 유형 코드가 전부다.
--
-- ★ 0013 과 같은 설계 원칙
--   ① 저장하는 것은 유형 코드 4글자뿐이다. 나이·기기·IP·세션·고향·게임별 우승 항목
--      컬럼이 존재하지 않는다 — 코드 규칙이 아니라 스키마가 막는다.
--   ② anon 은 INSERT 만. 읽기는 집계 뷰(bukbti_tally)로만 — created_at 도 내보내지 않는다.
--   ③ 이 테이블이 죽어도 놀이는 정상 동작한다(frontend/src/lib/bukbti.ts 가 조용히 삼킨다).
--      화면은 「같은 유형 N번」·16유형 분포 구획만 감춘다.
--   ④ 재기록 정책: 같은 사람이 게임을 다시 해 유형이 바뀌면 새 완성 기록으로 한 번 더
--      쌓인다(익명이라 이전 행을 지울 수 없다). 화면은 이 누적의 성격을 그대로 고지한다 —
--      「사람 수」가 아니라 「완성 기록 수」다. 연타 억제는 클라이언트 표식(기기 안,
--      유형 불변 차단 + 같은 날 같은 유형 차단) + 아래 전역 홍수 차단 두 겹뿐이다.

-- ════════════════════════════════════════════════════════════
-- 1. 원시 이벤트 (익명 INSERT 전용) — 완성(또는 완성 후 유형 변경) 1회 1행
-- ════════════════════════════════════════════════════════════
create table if not exists bukbti_event (
  id         bigserial primary key,
  type_code  text not null check (type_code in (
    '국산밥눈','국산밥귀','국산삶눈','국산삶귀','국길밥눈','국길밥귀','국길삶눈','국길삶귀',
    '찬산밥눈','찬산밥귀','찬산삶눈','찬산삶귀','찬길밥눈','찬길밥귀','찬길삶눈','찬길삶귀')),
  created_at timestamptz not null default now()
);

comment on table bukbti_event is
  '북BTI 완성 유형 1기록 1행. 유형 4글자 외에는 아무것도 없다 — 개인 식별 컬럼을 추가하지 마라.';

create index if not exists idx_bukbti_event_created on bukbti_event (created_at desc);

-- ════════════════════════════════════════════════════════════
-- 2. RLS — 익명은 넣기만 한다 (0013 §2 와 같은 이중 차단)
-- ════════════════════════════════════════════════════════════
alter table bukbti_event enable row level security;

drop policy if exists bukbti_insert_anon on bukbti_event;
create policy bukbti_insert_anon on bukbti_event
  for insert to anon, authenticated with check (true);

-- SELECT 정책을 만들지 않는다(= RLS 아래에서 원시 행 조회 불가).
-- 권한 층에서도 한 번 더 끊는다 — 정책이 실수로 생겨도 grant 가 없으면 못 읽는다.
revoke all    on bukbti_event from anon, authenticated;
grant  insert on bukbti_event to   anon, authenticated;
revoke usage  on sequence bukbti_event_id_seq from anon, authenticated;
grant  usage  on sequence bukbti_event_id_seq to   anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 3. 전역 홍수 차단 — 0013 §3 과 같은 꼴, 문턱만 240
--    (완성 이벤트는 드묾 — 한 판 완성에 게임 4종 완주가 필요하다)
-- ════════════════════════════════════════════════════════════
create or replace function bukbti_event_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from bukbti_event where created_at > now() - interval '1 minute') >= 240 then
    raise exception 'bukbti_event: rate limited';
  end if;
  return new;
end $$;

drop trigger if exists trg_bukbti_flood on bukbti_event;
create trigger trg_bukbti_flood
  before insert on bukbti_event
  for each row execute function bukbti_event_flood_guard();

-- ════════════════════════════════════════════════════════════
-- 4. 집계 뷰 — 밖으로 나가는 유일한 읽기 경로 (0013 §4 와 같은 설계)
-- ════════════════════════════════════════════════════════════
create or replace view bukbti_tally as
  select type_code, count(*)::bigint as n
  from bukbti_event
  group by type_code;

comment on view bukbti_tally is
  '북BTI 유형 집계 — 익명에게 열린 유일한 읽기 경로. 원시 행·시각은 나가지 않는다.';

grant select on bukbti_tally to anon, authenticated;
