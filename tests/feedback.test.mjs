import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

// 학생 설문 · 면담 신청 함수 검증: npm test
const read = f => fs.readFileSync(new URL('../supabase/' + f, import.meta.url), 'utf8');
const db = new PGlite();
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const tryq = async q => { try { await db.query(q); return 'ok'; } catch (e) { return e.message; } };

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
await db.exec(read('schema.sql'));
await db.exec(read('student_feedback.sql'));
await db.query(`insert into items (collection,id,data,student_id) values ('students','s1','{"name":"학생1","token":"tok-s1-aaaaaaaa","classIds":["c1"]}','s1')`);

const tomorrow = new Date(Date.now() + 9 * 3600e3 + 864e5).toISOString().slice(0, 10);
await db.exec('set role anon');
ok('설문 저장', await tryq(`select student_submit_survey('tok-s1-aaaaaaaa','c1','mid',4,'좋아요')`) === 'ok');
ok('설문 다시 내면 덮어씀', await tryq(`select student_submit_survey('tok-s1-aaaaaaaa','c1','mid',5,'')`) === 'ok');
ok('안 듣는 수업 설문 거절', await tryq(`select student_submit_survey('tok-s1-aaaaaaaa','c2','mid',4,'')`) !== 'ok');
ok('별점 범위 밖 거절', await tryq(`select student_submit_survey('tok-s1-aaaaaaaa','c1','final',9,'')`) !== 'ok');
ok('틀린 토큰 거절', await tryq(`select student_submit_survey('tok-xx-zzzzzzzz','c1','mid',4,'')`) !== 'ok');
ok('면담 신청', await tryq(`select student_request_meeting('tok-s1-aaaaaaaa','${tomorrow}','15:00','포트폴리오 질문')`) === 'ok');
ok('지난 날짜 거절', await tryq(`select student_request_meeting('tok-s1-aaaaaaaa','2020-01-01','','x')`) !== 'ok');
ok('빈 내용 거절', await tryq(`select student_request_meeting('tok-s1-aaaaaaaa','${tomorrow}','','  ')`) !== 'ok');
await tryq(`select student_request_meeting('tok-s1-aaaaaaaa','${tomorrow}','','2')`);
await tryq(`select student_request_meeting('tok-s1-aaaaaaaa','${tomorrow}','','3')`);
ok('확인 대기 3개 넘으면 거절', /too many/.test(await tryq(`select student_request_meeting('tok-s1-aaaaaaaa','${tomorrow}','','4')`)));
const v = (await db.query(`select student_view('tok-s1-aaaaaaaa') v`)).rows[0].v;
ok('학생 화면에 설문 · 신청 보임', v.surveys.length === 1 && v.meetings.length === 3 && v.meetings[0].request);
ok('학생은 items 직접 못 읽음', /permission|denied/.test(await tryq(`select * from items`)));
await db.exec('reset role');
const sv = (await db.query(`select data from items where collection='surveys'`)).rows[0].data;
ok('덮어쓴 설문 값', sv.score === 5);

if (fails) { console.log(`\n${fails}개 실패`); process.exit(1); }
console.log('\n모두 통과');
