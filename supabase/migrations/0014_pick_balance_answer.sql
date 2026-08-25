-- 고향잇기 — 기억 밸런스 문항별 집계: 0013 과 같은 원칙(개인이 남지 않는 설계)
--
-- 왜 이 테이블인가:
--   pick_event 는 밸런스 1판을 「상위 기록유형 1행」으로만 남긴다.
--   사이드바 순위덱의 「문항별 가/나 몇 명」 은 저장 자체가 없어 불가능했다.
--   그래서 문항×선택 단위 행을 따로 받는다 — 집계는 실측만 내보낸다는
--   정직성 규약(없는 통계 금지)을 지키는 유일한 방법이다.
--
-- ★ 0013 과 같은 설계 원칙
--   ① 저장하는 것은 (문항 id, 가/나)뿐. 나이·기기·IP·세션·식별자 컬럼이 존재하지 않는다.
--   ② ★ 판(play) 연결키를 두지 않는다 — 8행이 한 사람의 것임을 서버가
--      재구성할 수 없게 하는 것이 설계다. 집계는 문항 단위라 연결키가 필요 없다.
--   ③ anon 은 INSERT 만. 읽기는 집계 뷰(pick_balance_tally)로만 — created_at 도 내보내지 않는다.
--   ④ 이 테이블이 죽어도 게임은 정상 동작한다(frontend/src/lib/pickTally.ts 가 조용히 삼킨다).

-- ════════════════════════════════════════════════════════════
-- 1. 원시 행 (익명 INSERT 전용) — 1판 = 8행 bulk insert 1회
-- ════════════════════════════════════════════════════════════
create table if not exists pick_balance_answer (
  id         bigserial primary key,
  q_id       text not null check (q_id in
             ('who','scene','relic','voice','placename','apply','food','channel')),
  choice     text not null check (choice in ('a','b')),
  created_at timestamptz not null default now()
);

comment on table pick_balance_answer is
  '기억 밸런스 문항별 선택 1행. 판 연결키·개인 식별 컬럼이 없는 것이 설계다 — 추가하지 마라.';

create index if not exists idx_pba_created on pick_balance_answer (created_at desc);

-- ════════════════════════════════════════════════════════════
-- 2. RLS — 익명은 넣기만 한다 (0013 §2 와 같은 이중 차단)
-- ════════════════════════════════════════════════════════════
alter table pick_balance_answer enable row level security;

drop policy if exists pba_insert_anon on pick_balance_answer;
create policy pba_insert_anon on pick_balance_answer
  for insert to anon, authenticated with check (true);

-- SELECT 정책을 만들지 않는다. 권한 층에서도 한 번 더 끊는다.
revoke all    on pick_balance_answer from anon, authenticated;
grant  insert on pick_balance_answer to   anon, authenticated;
revoke usage  on sequence pick_balance_answer_id_seq from anon, authenticated;
grant  usage  on sequence pick_balance_answer_id_seq to   anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 3. 전역 홍수 차단 — 0013 §3 과 같은 꼴, 문턱만 8배(1판=8행) → 분당 4,800행
-- ════════════════════════════════════════════════════════════
create or replace function pick_balance_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from pick_balance_answer where created_at > now() - interval '1 minute') >= 4800 then
    raise exception 'pick_balance_answer: rate limited';
  end if;
  return new;
end $$;

drop trigger if exists trg_pba_flood on pick_balance_answer;
create trigger trg_pba_flood
  before insert on pick_balance_answer
  for each row execute function pick_balance_flood_guard();

-- ════════════════════════════════════════════════════════════
-- 4. 집계 뷰 — 밖으로 나가는 유일한 읽기 경로 (0013 §4 와 같은 설계)
-- ════════════════════════════════════════════════════════════
create or replace view pick_balance_tally as
  select q_id, choice, count(*)::bigint as n
  from pick_balance_answer
  group by q_id, choice;

comment on view pick_balance_tally is
  '기억 밸런스 문항별 집계 — 익명에게 열린 유일한 읽기 경로. 원시 행·시각은 나가지 않는다.';

grant select on pick_balance_tally to anon, authenticated;
