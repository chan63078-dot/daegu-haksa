-- 학생 화면 추가 기능 (schema.sql 다음에 실행, 여러 번 실행해도 안전)
-- 1) 학생 자료실: 공개 버킷 student-files, 올리기·지우기는 직원만. 목록은 items 의 files 컬렉션
insert into storage.buckets (id, name, public, file_size_limit)
values ('student-files', 'student-files', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists student_files_insert on storage.objects;
drop policy if exists student_files_delete on storage.objects;
create policy student_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-files' and public.haksa_me() is not null);
create policy student_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'student-files' and public.haksa_me() is not null);

-- 2) 학생 화면 데이터: 자료실(files), 전체 시험 일정(allExams: 연결 안 된 시험도 7일 이내 알림용)
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
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('date', m.data->'date', 'time', m.data->'time', 'topic', m.data->'topic'))
      from items m where m.collection = 'meetings' and m.student_id = s.id and not coalesce((m.data->>'done')::boolean, false)), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.data->'name', 'regStart', e.data->'regStart', 'regEnd', e.data->'regEnd',
        'examDate', e.data->'examDate', 'examEnd', e.data->'examEnd', 'resultDate', e.data->'resultDate', 'memo', e.data->'memo'))
      from items e where e.collection = 'exams' and coalesce(e.data->'studentIds', '[]'::jsonb) ? s.id), '[]'::jsonb),
    'allExams', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.data->'name', 'regStart', e.data->'regStart', 'regEnd', e.data->'regEnd',
        'examDate', e.data->'examDate', 'examEnd', e.data->'examEnd', 'resultDate', e.data->'resultDate', 'memo', e.data->'memo'))
      from items e where e.collection = 'exams'), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.data->'name', 'size', f.data->'size', 'url', f.data->'url') order by f.data->>'order', f.data->>'createdAt')
      from items f where f.collection = 'files'), '[]'::jsonb)
  );
end $$;
revoke all on function public.student_view(text) from public;
grant execute on function public.student_view(text) to anon, authenticated;
