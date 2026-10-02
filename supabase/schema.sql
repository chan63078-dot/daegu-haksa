-- 대구지점 학사관리 - Supabase 설치 스크립트
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run 하세요. 여러 번 실행해도 안전합니다.
-- 맨 아래 "첫 관리자 등록" 부분의 이메일을 바꿔서 실행해야 처음 로그인할 수 있어요.

-- 1) 데이터 테이블: 모든 데이터를 컬렉션별로 한 테이블에 저장
create table if not exists public.items (
  collection  text not null,
  id          text not null,
  data        jsonb not null default '{}'::jsonb,
  student_id  text,          -- 학생 관련 행: 어느 학생의 것인지 (권한 판단용)
  mentor_id   text,          -- 학생 행: 담당자
  team_id     text,          -- 학생 행: 담당자의 팀
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists items_student_idx on public.items (collection, student_id);
create index if not exists items_token_idx on public.items ((data->>'token')) where collection = 'students';

alter table public.items enable row level security;

-- 2) 권한 도우미 함수
-- 지금 로그인한 사람의 직원 정보 (직원 명단에 없거나 비활성이면 null)
create or replace function public.haksa_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select i.data || jsonb_build_object('id', i.id)
  from items i
  where i.collection = 'staff'
    and lower(i.data->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
    and coalesce((i.data->>'active')::boolean, true)
  limit 1
$$;

-- 팀이 속한 사업부
create or replace function public.haksa_division(tid text) returns text
language sql stable security definer set search_path = public as $$
  select nullif(data->>'division', '') from items where collection = 'teams' and id = tid
$$;

-- 이 담당자·팀의 학생을 볼 수 있는지: 원장·총괄은 전체, 부장은 자기 사업부, 팀장은 자기 팀, 멘토는 담당 학생만
-- (학생 행 자신의 담당자·팀 열로 판단 → 아직 저장 전인 새 학생도 판단 가능)
create or replace function public.haksa_can_see_row(mid text, tid text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select me.m->>'role' = 'admin'
        or mid = me.m->>'id'
        or (me.m->>'role' = 'lead' and tid = me.m->>'teamId')
        or (me.m->>'role' = 'head' and public.haksa_division(tid) = public.haksa_division(me.m->>'teamId'))
    from (select public.haksa_me() as m) me
    where me.m is not null
  ), false)
$$;

-- 이미 저장된 학생을 볼 수 있는지 (상담 기록·출결 등 학생에 딸린 행용)
create or replace function public.haksa_can_see_student(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from items s
    where s.collection = 'students' and s.id = sid and public.haksa_can_see_row(s.mentor_id, s.team_id)
  )
$$;

-- 읽기 권한 (앱은 upsert로 저장하므로 새 행에도 이 검사가 적용됨)
create or replace function public.haksa_read_ok(col text, sid text, mid text, tid text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.haksa_me() is null then false
    when col = 'students' then public.haksa_can_see_row(mid, tid)
    when col in ('attendance', 'notes', 'meetings', 'tasks') then public.haksa_can_see_student(sid)
    when col = 'logs' then public.haksa_me()->>'role' = 'admin'
    else true
  end
$$;

-- 쓰기 권한 (저장될 새 값 기준)
create or replace function public.haksa_write_ok(col text, sid text, mid text, tid text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.haksa_me() is null then false
    when col in ('staff', 'teams') then public.haksa_me()->>'role' = 'admin'
    when col = 'classes' then public.haksa_me()->>'role' in ('admin', 'head', 'lead')
    when col = 'students' then public.haksa_can_see_row(mid, tid)
    when col in ('attendance', 'notes', 'meetings', 'tasks') then public.haksa_can_see_student(sid)
    else true  -- exams, leads, logs
  end
$$;

drop policy if exists items_select on public.items;
drop policy if exists items_insert on public.items;
drop policy if exists items_update on public.items;
drop policy if exists items_delete on public.items;
drop function if exists public.haksa_read_ok(text, text);  -- 이전 버전

create policy items_select on public.items for select to authenticated
  using (public.haksa_read_ok(collection, student_id, mentor_id, team_id));
create policy items_insert on public.items for insert to authenticated
  with check (public.haksa_write_ok(collection, student_id, mentor_id, team_id));
create policy items_update on public.items for update to authenticated
  using (public.haksa_read_ok(collection, student_id, mentor_id, team_id) and collection <> 'logs')
  with check (public.haksa_write_ok(collection, student_id, mentor_id, team_id));
create policy items_delete on public.items for delete to authenticated
  using (
    collection <> 'logs'
    and public.haksa_read_ok(collection, student_id, mentor_id, team_id)
    and public.haksa_write_ok(collection, student_id, mentor_id, team_id)
  );

-- 3) 학생 전용 링크 (로그인 없이 토큰으로 본인 정보만)
create or replace function public.student_view(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.items;
begin
  if p_token is null or length(p_token) < 12 then return null; end if;
  select * into s from items where collection = 'students' and data->>'token' = p_token limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'student', jsonb_build_object(
      'id', s.id, 'name', s.data->'name', 'goal', s.data->'goal', 'intro', s.data->'intro', 'status', s.data->'status',
      'roadmap', coalesce(s.data->'roadmap', '[]'::jsonb), 'certs', coalesce(s.data->'certs', '[]'::jsonb),
      'classIds', coalesce(s.data->'classIds', '[]'::jsonb)),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.data->'name', 'days', c.data->'days', 'start', c.data->'start', 'end', c.data->'end',
        'startDate', c.data->'startDate', 'endDate', c.data->'endDate', 'room', c.data->'room', 'archived', c.data->'archived'))
      from items c where c.collection = 'classes' and coalesce(s.data->'classIds', '[]'::jsonb) ? c.id), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('classId', a.data->'classId', 'date', a.data->'date', 'state', a.data->'state'))
      from items a where a.collection = 'attendance' and a.student_id = s.id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.data->'title', 'due', t.data->'due', 'done', coalesce(t.data->'done', 'false'::jsonb)))
      from items t where t.collection = 'tasks' and t.student_id = s.id and coalesce((t.data->>'shared')::boolean, true)), '[]'::jsonb),
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('date', m.data->'date', 'time', m.data->'time', 'topic', m.data->'topic'))
      from items m where m.collection = 'meetings' and m.student_id = s.id and not coalesce((m.data->>'done')::boolean, false)), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.data->'name', 'regStart', e.data->'regStart', 'regEnd', e.data->'regEnd',
        'examDate', e.data->'examDate', 'resultDate', e.data->'resultDate'))
      from items e where e.collection = 'exams' and coalesce(e.data->'studentIds', '[]'::jsonb) ? s.id), '[]'::jsonb)
  );
end $$;

-- 학생이 자기 할 일을 체크
create or replace function public.student_set_task(p_token text, p_task text, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare sid text;
begin
  if p_token is null or length(p_token) < 12 then raise exception 'invalid'; end if;
  select id into sid from items where collection = 'students' and data->>'token' = p_token limit 1;
  if sid is null then raise exception 'invalid'; end if;
  update items set data = jsonb_set(data, '{done}', to_jsonb(coalesce(p_done, false))), updated_at = now(), updated_by = 'student'
  where collection = 'tasks' and id = p_task and student_id = sid and coalesce((data->>'shared')::boolean, true);
end $$;

-- 4) 공개 상담 신청 폼
create or replace function public.submit_lead(p_name text, p_phone text, p_interest text, p_memo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(length(trim(p_name)), 0) not between 1 and 30 or coalesce(length(trim(p_phone)), 0) not between 9 and 20 then
    raise exception 'invalid';
  end if;
  -- 같은 번호로 하루 3건 넘게 들어오면 막기 (장난 신청 방지)
  if (select count(*) from items where collection = 'leads' and data->>'phone' = trim(p_phone) and updated_at > now() - interval '1 day') >= 3 then
    raise exception 'too many';
  end if;
  insert into items (collection, id, data, updated_by)
  values ('leads', gen_random_uuid()::text, jsonb_build_object(
    'name', trim(p_name), 'phone', trim(p_phone), 'interest', left(coalesce(p_interest, ''), 50), 'memo', left(coalesce(p_memo, ''), 500),
    'source', '온라인 신청', 'status', 'new', 'nextDate', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'),
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), 'web-form');
end $$;

revoke all on function public.student_view(text) from public;
revoke all on function public.student_set_task(text, text, boolean) from public;
revoke all on function public.submit_lead(text, text, text, text) from public;
grant execute on function public.student_view(text) to anon, authenticated;
grant execute on function public.student_set_task(text, text, boolean) to anon, authenticated;
grant execute on function public.submit_lead(text, text, text, text) to anon, authenticated;

-- 5) 팀·직원 등록
--    대구지점 실제 명단은 supabase/staff.local.sql 에 있어요(공개 저장소에는 올리지 않음).
--    이 스크립트 다음에 그 파일을 SQL Editor에서 한 번 실행하세요.
--    다른 지점에서 쓸 때는 아래 예시처럼 원장·총괄 한 명만 넣고, 나머지는 앱 설정 → 직원에서 등록하면 됩니다.
-- insert into public.items (collection, id, data) values
--   ('staff', 'st-admin', '{"name": "원장 이름", "email": "director@example.com", "role": "admin", "teamId": null, "active": true}')
-- on conflict do nothing;
