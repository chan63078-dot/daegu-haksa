-- 학생 화면: 수업 만족도 설문 · 면담 신청 (schema.sql, student_extras.sql 다음에 실행, 여러 번 실행해도 안전)
-- 학생은 로그인이 없으므로 학생 링크 토큰으로 본인 확인 후, 정해진 칸만 저장하는 함수로만 씀

-- 학생 화면 데이터 (최신판: 자료실 · 전체 시험 · 설문 · 면담 신청 포함)
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
      'classIds', coalesce(s.data->'classIds', '[]'::jsonb), 'plans', coalesce(s.data->'plans', '[]'::jsonb)),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.data->'name', 'days', c.data->'days', 'start', c.data->'start', 'end', c.data->'end',
        'startDate', c.data->'startDate', 'endDate', c.data->'endDate', 'room', c.data->'room', 'archived', c.data->'archived',
        'note', c.data->'note', 'instructor', c.data->'instructor', 'recordings', c.data->'recordings', 'zoom', c.data->'zoom', 'notice', c.data->'notice'))
      from items c where c.collection = 'classes' and coalesce(s.data->'classIds', '[]'::jsonb) ? c.id), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('classId', a.data->'classId', 'date', a.data->'date', 'state', a.data->'state'))
      from items a where a.collection = 'attendance' and a.student_id = s.id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.data->'title', 'due', t.data->'due', 'done', coalesce(t.data->'done', 'false'::jsonb)))
      from items t where t.collection = 'tasks' and t.student_id = s.id and coalesce((t.data->>'shared')::boolean, true)), '[]'::jsonb),
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'date', m.data->'date', 'time', m.data->'time', 'topic', m.data->'topic', 'request', m.data->'request'))
      from items m where m.collection = 'meetings' and m.student_id = s.id and not coalesce((m.data->>'done')::boolean, false)), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.data->'name', 'regStart', e.data->'regStart', 'regEnd', e.data->'regEnd',
        'examDate', e.data->'examDate', 'examEnd', e.data->'examEnd', 'resultDate', e.data->'resultDate', 'memo', e.data->'memo'))
      from items e where e.collection = 'exams' and coalesce(e.data->'studentIds', '[]'::jsonb) ? s.id), '[]'::jsonb),
    'allExams', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.data->'name', 'regStart', e.data->'regStart', 'regEnd', e.data->'regEnd',
        'examDate', e.data->'examDate', 'examEnd', e.data->'examEnd', 'resultDate', e.data->'resultDate', 'memo', e.data->'memo'))
      from items e where e.collection = 'exams'), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.data->'name', 'size', f.data->'size', 'url', f.data->'url') order by f.data->>'order', f.data->>'createdAt')
      from items f where f.collection = 'files'), '[]'::jsonb),
    'surveys', coalesce((select jsonb_agg(jsonb_build_object('classId', v.data->'classId', 'kind', v.data->'kind'))
      from items v where v.collection = 'surveys' and v.student_id = s.id), '[]'::jsonb)
  );
end $$;

-- 수업 만족도: 중간(mid) · 종강(final) 한 번씩, 별점 1~5 + 한 줄 의견 (다시 내면 덮어씀)
create or replace function public.student_submit_survey(p_token text, p_class text, p_kind text, p_score int, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.items; vid text;
begin
  if p_token is null or length(p_token) < 12 then raise exception 'invalid'; end if;
  select * into s from items where collection = 'students' and data->>'token' = p_token limit 1;
  if not found then raise exception 'invalid'; end if;
  if not coalesce(s.data->'classIds', '[]'::jsonb) ? p_class then raise exception 'invalid'; end if;
  if p_kind not in ('mid', 'final') or p_score is null or p_score < 1 or p_score > 5 or length(coalesce(p_comment, '')) > 500 then raise exception 'invalid'; end if;
  vid := s.id || ':' || p_class || ':' || p_kind;
  insert into items (collection, id, data, student_id, updated_by)
  values ('surveys', vid, jsonb_build_object('id', vid, 'studentId', s.id, 'classId', p_class, 'kind', p_kind, 'score', p_score,
    'comment', coalesce(p_comment, ''), 'at', now()), s.id, 'student')
  on conflict (collection, id) do update set data = excluded.data, updated_at = now(), updated_by = 'student';
end $$;

-- 면담·질문 신청: 희망 날짜(오늘~60일) · 시간(선택) · 내용, 확인 대기 중인 신청은 3개까지
create or replace function public.student_request_meeting(p_token text, p_date text, p_time text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.items; d date; mid text; kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_token is null or length(p_token) < 12 then raise exception 'invalid'; end if;
  select * into s from items where collection = 'students' and data->>'token' = p_token limit 1;
  if not found then raise exception 'invalid'; end if;
  if p_date !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_time, '') !~ '^(\d{2}:\d{2})?$'
     or length(trim(coalesce(p_text, ''))) < 1 or length(p_text) > 300 then raise exception 'invalid'; end if;
  d := p_date::date;
  if d < kst or d > kst + 60 then raise exception 'invalid'; end if;
  if (select count(*) from items m where m.collection = 'meetings' and m.student_id = s.id and m.data ? 'request'
      and not coalesce((m.data->'request'->>'seen')::boolean, false) and not coalesce((m.data->>'done')::boolean, false)) >= 3 then
    raise exception 'too many';
  end if;
  mid := gen_random_uuid()::text;
  insert into items (collection, id, data, student_id, updated_by)
  values ('meetings', mid, jsonb_build_object('id', mid, 'studentId', s.id, 'date', p_date, 'time', coalesce(p_time, ''), 'topic', '학생 신청: ' || left(trim(p_text), 40),
    'done', false, 'request', jsonb_build_object('text', trim(p_text), 'at', now(), 'seen', false), 'updatedAt', now()), s.id, 'student');
end $$;

revoke all on function public.student_view(text) from public;
revoke all on function public.student_submit_survey(text, text, text, int, text) from public;
revoke all on function public.student_request_meeting(text, text, text, text) from public;
grant execute on function public.student_view(text) to anon, authenticated;
grant execute on function public.student_submit_survey(text, text, text, int, text) to anon, authenticated;
grant execute on function public.student_request_meeting(text, text, text, text) to anon, authenticated;
