# 개발 메모 (이어서 작업할 때 먼저 읽기)

2026-10-03 기준. 실명·연락처는 여기에 쓰지 않아요.

## 구조
- `public/` 웹사이트 전체 (빌드 없음, 순수 HTML/JS)
  - `admin/admin.js` 관리자 화면 (해시 라우팅 `#/students`, `#/classes/:id` …), `index.html` 학생 학습 캘린더
  - `lib/store.js` 데이터 계층: 실제 모드(Supabase) / 데모 모드(`?demo` 또는 설정 비었을 때, localStorage)
  - `lib/util.js` 상수·날짜·CSV·공휴일(`HOLIDAYS`)·회차 계산(`sessions`: 요일·기간에서 공휴일과 비고의 "휴강: 09/24~25, 10/05" 제외)
  - `lib/timetable.js` 학원 시스템 시간표 CSV(강의실×시간 격자) 파서
  - `config.js` Supabase URL·publishable 키·학원 이름·공식 주소(`SITE_URL`)
- `supabase/schema.sql` 테이블 `items` 하나 + RLS 정책 + `student_view`/`student_set_task`/`submit_lead` 함수. 바꾸면 SQL Editor에서 재실행 필요
- `supabase/functions/staff-admin/index.ts` 직원 로그인 계정 관리 Edge Function (원장·총괄만). 바꾸면 Supabase 대시보드에 붙여넣어 재배포
- `tests/` `npm test` = 시간표 파서 + RLS(로컬 PGlite) 검증. Netlify·Actions 모두 테스트 통과해야 배포
- `pages-redirect/` 예전 github.io 주소를 새 주소로 넘기는 페이지

## 데이터 (items.collection)
teams{name,division} · staff{name,email,role(admin/head/lead/mentor),title,teamId,active} ·
students{name,phone,category,track,status,mentorId,teamId,classIds[],plans[],goal,intro,roadmap[],certs[],employment{},token,gwNo,history[],deleteRequest?} ·
classes{name,days[0-6],start,end,startDate,endDate,room,instructor,note,gov,color,archived,recordings{날짜:{url,note}}} ·
notes · meetings · tasks(studentId) · exams{name,regStart,regEnd,examDate,examEnd,resultDate,memo,studentIds[]} · logs · settings{id:'backup'}

권한 판단 열: students의 student_id/mentor_id/team_id, 학생에 딸린 행은 student_id. 앱은 upsert로 저장하므로 새 행에도 읽기 정책이 적용되는 점 주의(테스트에 upsert 케이스 있음).

## 작업 흐름
1. 수정 → `node --check public/admin/admin.js` → `npm test`
2. 데모로 확인: `python -m http.server 8765 --directory public` 후 `/admin/?demo`
3. 커밋·푸시 → Netlify 자동 배포 → `curl https://daegu-haksa.netlify.app/admin/ | grep admin.js?v=` 로 커밋 번호 확인
4. 한글 입력창은 화면 전체를 다시 그리지 말 것(조합 깨짐) — 결과 영역만 교체
