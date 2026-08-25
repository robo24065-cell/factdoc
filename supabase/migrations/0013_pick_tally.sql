-- 고향잇기 — 참여(/pick) 집계: 개인이 남지 않는 설계
--
-- ★ 최상위 설계 원칙 (0011·0012 와 같은 자리에서 선언한다)
--   ① 저장하는 것은 (게임, 고른 항목, 고향)뿐이다.
--      나이·기기·IP·세션·사용자 식별자 컬럼이 **존재하지 않는다** — 코드 규칙이 아니라
--      스키마가 막는다. 우리는 나이를 묻지 않으므로 "2030세대" 같은 구분은 만들 수 없다.
--   ② 익명(anon)은 INSERT 만 할 수 있다. 원시 행 SELECT 권한 자체가 없다.
--      읽기는 집계 뷰(pick_tally)로만 나간다 — created_at 조차 내보내지 않는다.
--   ③ 이 테이블은 어떤 화면의 필수 의존이 아니다. 집계가 죽어도 게임은 정상 동작하고,
--      프론트는 통계 구획만 감춘다(frontend/src/lib/pickTally.ts).
--   ④ 연타 억제는 두 겹이되 어느 겹도 개인 식별로 변질되지 않는다:
--      · 클라이언트 — 결승 확정 순간 1회만 기록 + localStorage 표식(기기 밖으로 안 나감)
--      · 서버      — 전역(개인 단위가 아닌) 홍수 차단 트리거. 개인 단위 제한은
--                    개인 식별을 요구하므로 만들지 않는다(설계 한계로 명기).

-- ════════════════════════════════════════════════════════════
-- 1. 원시 이벤트 (익명 INSERT 전용)
-- ════════════════════════════════════════════════════════════
create table if not exists pick_event (
  id           bigserial primary key,
  game         text not null check (game in ('food','scene','word','balance')),
  winner_key   text not null check (char_length(winner_key) between 1 and 64),
  winner_label text not null check (char_length(winner_label) between 1 and 40),
  -- 고향 축 — 광복 당시 구행정구역 7종(map.json regionsOld 의 id 그대로).
  -- 말(word) 월드컵은 지역 축이 없으므로 null 이 정상이다.
  home_old     text check (home_old in (
                 'hwanghae-old','pyongan-s-old','pyongan-n-old',
                 'hamgyong-s-old','hamgyong-n-old','gyeonggi-unrec','gangwon-unrec')),
  created_at   timestamptz not null default now()
);

comment on table pick_event is
  '참여(/pick) 결승 결과 1판 1행. 개인 식별 컬럼이 없는 것이 설계다 — 추가하지 마라.';

create index if not exists idx_pick_event_created on pick_event (created_at desc);
create index if not exists idx_pick_event_game    on pick_event (game);

-- ════════════════════════════════════════════════════════════
-- 2. RLS — 익명은 넣기만 한다
-- ════════════════════════════════════════════════════════════
alter table pick_event enable row level security;

drop policy if exists pick_insert_anon on pick_event;
create policy pick_insert_anon on pick_event
  for insert to anon, authenticated with check (true);

-- SELECT 정책을 만들지 않는다(= RLS 아래에서 원시 행 조회 불가).
-- 권한 층에서도 한 번 더 끊는다 — 정책이 실수로 생겨도 grant 가 없으면 못 읽는다.
revoke all    on pick_event from anon, authenticated;
grant  insert on pick_event to   anon, authenticated;
revoke usage  on sequence pick_event_id_seq from anon, authenticated;
grant  usage  on sequence pick_event_id_seq to   anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 3. 전역 홍수 차단 — 개인 식별 없는 최소 장치
--    분당 총 600행(가안)을 넘으면 그 분의 나머지 INSERT 를 거부한다.
--    특정 사용자를 겨냥할 수 없다는 것이 한계이자 의도다.
-- ════════════════════════════════════════════════════════════
create or replace function pick_event_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from pick_event where created_at > now() - interval '1 minute') >= 600 then
    raise exception 'pick_event: rate limited';
  end if;
  return new;
end $$;

drop trigger if exists trg_pick_event_flood on pick_event;
create trigger trg_pick_event_flood
  before insert on pick_event
  for each row execute function pick_event_flood_guard();

-- ════════════════════════════════════════════════════════════
-- 4. 집계 뷰 — 밖으로 나가는 유일한 읽기 경로
--    뷰 소유자(postgres) 권한으로 실행되어 RLS 를 지나 집계만 내보낸다.
--    (Supabase 가 security definer 뷰를 경고하지만 여기서는 그것이 설계다:
--     원시 행은 막고 count 만 여는 문이 이 뷰다. created_at 은 뷰에 없다.)
-- ════════════════════════════════════════════════════════════
create or replace view pick_tally as
  select game, home_old, winner_key, winner_label, count(*)::bigint as n
  from pick_event
  group by game, home_old, winner_key, winner_label;

comment on view pick_tally is
  '참여 집계 — 익명에게 열린 유일한 읽기 경로. 원시 행·시각은 나가지 않는다.';

grant select on pick_tally to anon, authenticated;
