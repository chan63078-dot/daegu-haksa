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

-- 2) 학생 화면 데이터(student_view)는 student_feedback.sql 에 최신판이 있어요
