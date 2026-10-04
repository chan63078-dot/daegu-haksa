import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

// Supabase 권한(RLS) 검증: npm test
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const db = new PGlite();
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };

// Supabase 흉내: auth.jwt(), anon/authenticated 역할
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
await db.exec(schema);
await db.exec(`grant select, insert, update, delete on public.items to authenticated;`);

// 기본 데이터 (관리자 권한으로)
const J = o => JSON.stringify(o).replace(/'/g, "''");
const ins = (col, id, data, extra = {}) => db.query(
  `insert into items (collection,id,data,student_id,mentor_id,team_id) values ($1,$2,$3,$4,$5,$6)`,
  [col, id, data, extra.s || null, extra.m || null, extra.t || null]);
await ins('teams', 't1', { name: '1-1팀', division: '1사업부' }); await ins('teams', 't2', { name: '2-1팀', division: '2사업부' });
await ins('teams', 't3', { name: '1-2팀', division: '1사업부' });
await ins('staff', 'admin', { name: '원장', email: 'admin@x.com', role: 'admin', active: true });
await ins('staff', 'lead1', { name: '팀장1', email: 'lead1@x.com', role: 'lead', teamId: 't1', active: true });
await ins('staff', 'm1', { name: '멘토1', email: 'm1@x.com', role: 'mentor', teamId: 't1', active: true });
await ins('staff', 'm2', { name: '멘토2', email: 'm2@x.com', role: 'mentor', teamId: 't2', active: true });
await ins('staff', 'head1', { name: '부장1', email: 'head1@x.com', role: 'head', teamId: 't1', active: true });
await ins('staff', 'm3', { name: '멘토3', email: 'm3@x.com', role: 'mentor', teamId: 't3', active: true });
await ins('staff', 'gone', { name: '퇴사자', email: 'gone@x.com', role: 'admin', active: false });
await ins('classes', 'c1', { name: '파이썬', days: [1, 3] });
await ins('students', 's1', { name: '학생1', token: 'tok-s1-aaaaaaaa', classIds: ['c1'], phone: '010' }, { s: 's1', m: 'm1', t: 't1' });
await ins('students', 's2', { name: '학생2', token: 'tok-s2-bbbbbbbb' }, { s: 's2', m: 'm2', t: 't2' });
await ins('students', 's5', { name: '학생5', token: 'tok-s5-cccccccc' }, { s: 's5', m: 'm3', t: 't3' });
await ins('notes', 'n1', { studentId: 's1', body: '상담1' }, { s: 's1' });
await ins('notes', 'n2', { studentId: 's2', body: '상담2' }, { s: 's2' });
await ins('tasks', 'k1', { studentId: 's1', title: '할일', done: false, shared: true }, { s: 's1' });
await ins('tasks', 'k2', { studentId: 's1', title: '비공개', done: false, shared: false }, { s: 's1' });
await ins('attendance', 'a1', { studentId: 's1', classId: 'c1', date: '2026-10-01', state: 'present' }, { s: 's1' });
await ins('logs', 'l1', { detail: 'x' });

async function as(email, fn) {
  await db.exec(`set role ${email ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [email ? JSON.stringify({ email }) : '']);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const ids = async col => (await db.query(`select id from items where collection=$1 order by id`, [col])).rows.map(r => r.id).join(',');
// 앱은 supabase-js upsert로 저장 → INSERT ... ON CONFLICT DO UPDATE (새 행에도 읽기 정책이 적용됨)
const up = (col, id, data, s, m, t) => `insert into items (collection,id,data,student_id,mentor_id,team_id) values ('${col}','${id}','${JSON.stringify(data)}',${s ? `'${s}'` : 'null'},${m ? `'${m}'` : 'null'},${t ? `'${t}'` : 'null'}) on conflict (collection,id) do update set data=excluded.data, student_id=excluded.student_id, mentor_id=excluded.mentor_id, team_id=excluded.team_id`;
const tryq = async (sql, p) => { try { const r = await db.query(sql, p); return { ok: true, n: r.affectedRows ?? r.rows.length }; } catch (e) { return { ok: false, e: e.message }; } };

// 읽기 범위
ok('원장: 학생 전체', await as('admin@x.com', () => ids('students')) === 's1,s2,s5');
ok('부장1: 1사업부(1-1팀·1-2팀) 전체', await as('head1@x.com', () => ids('students')) === 's1,s5');
ok('팀장1: 자기 팀만', await as('lead1@x.com', () => ids('students')) === 's1');
ok('멘토1: 담당만', await as('m1@x.com', () => ids('students')) === 's1');
ok('멘토2: 담당만', await as('m2@x.com', () => ids('students')) === 's2');
ok('멘토1: 상담 기록도 담당만', await as('m1@x.com', () => ids('notes')) === 'n1');
ok('멘토: 수정 이력 못 봄', await as('m1@x.com', () => ids('logs')) === '');
ok('원장: 수정 이력 봄', await as('admin@x.com', () => ids('logs')) === 'l1');
ok('명단 없는 계정: 아무것도 못 봄', await as('stranger@x.com', () => ids('staff')) === '');
ok('퇴사자: 아무것도 못 봄', await as('gone@x.com', () => ids('students')) === '');
ok('비로그인(anon): 테이블 직접 못 읽음', !(await as(null, () => tryq(`select * from items`))).ok);

// 쓰기 범위
let r = await as('m1@x.com', () => tryq(`insert into items (collection,id,data,student_id) values ('notes','n3','{}','s2')`));
ok('멘토1: 남의 학생 상담 기록 못 씀', !r.ok, r.e);
r = await as('m1@x.com', () => tryq(`insert into items (collection,id,data,student_id) values ('notes','n4','{}','s1')`));
ok('멘토1: 담당 학생 상담 기록 씀', r.ok, r.e);
r = await as('m1@x.com', () => tryq(`insert into items (collection,id,data,student_id,mentor_id,team_id) values ('students','s3','{}','s3','m2','t2')`));
ok('멘토1: 남에게 배정된 학생 못 만듦', !r.ok, r.e);
r = await as('m1@x.com', () => tryq(`insert into items (collection,id,data,student_id,mentor_id,team_id) values ('students','s4','{}','s4','m1','t1')`));
ok('멘토1: 내 담당 학생 추가', r.ok, r.e);
r = await as('m1@x.com', () => tryq(`update items set mentor_id='m2', team_id='t2' where collection='students' and id='s1'`));
ok('멘토1: 담당을 다른 팀으로 못 넘김', !r.ok, r.e);
r = await as('m1@x.com', () => tryq(`insert into items (collection,id,data) values ('staff','x','{"email":"m1b@x.com","role":"admin"}')`));
ok('멘토: 직원 못 만듦(권한 상승 차단)', !r.ok, r.e);
r = await as('m1@x.com', () => tryq(`update items set data = data || '{"role":"admin"}' where collection='staff' and id='m1'`));
ok('멘토: 자기 권한 못 올림', !r.ok || r.n === 0, r.e || 'rows ' + r.n);
r = await as('head1@x.com', () => tryq(`insert into items (collection,id,data,student_id,mentor_id,team_id) values ('students','s6','{}','s6','m3','t3')`));
ok('부장1: 사업부 안 다른 팀 학생 추가', r.ok, r.e);
r = await as('head1@x.com', () => tryq(`insert into items (collection,id,data,student_id,mentor_id,team_id) values ('students','s7','{}','s7','m2','t2')`));
ok('부장1: 다른 사업부 학생 못 만듦', !r.ok, r.e);
r = await as('head1@x.com', () => tryq(`insert into items (collection,id,data) values ('staff','y','{"email":"y@x.com","role":"mentor"}')`));
ok('부장: 직원 등록은 못 함', !r.ok, r.e);
r = await as('lead1@x.com', () => tryq(`insert into items (collection,id,data) values ('classes','c2','{}')`));
ok('팀장: 수업 추가', r.ok, r.e);
r = await as('m1@x.com', () => tryq(`insert into items (collection,id,data) values ('classes','c3','{}')`));
ok('멘토: 수업 못 추가', !r.ok, r.e);
r = await as('admin@x.com', () => tryq(`delete from items where collection='logs'`));
ok('원장도 수정 이력은 못 지움', !r.ok || r.n === 0, r.e || 'rows ' + r.n);
r = await as('admin@x.com', () => tryq(`insert into items (collection,id,data) values ('staff','new','{"email":"n@x.com","role":"mentor"}')`));
ok('원장: 직원 등록', r.ok, r.e);
r = await as('m1@x.com', () => tryq(`insert into items (collection,id,data) values ('logs','l2','{"detail":"y"}')`));
ok('멘토: 이력 기록은 남김', r.ok, r.e);

// upsert(앱 저장 방식)
r = await as('admin@x.com', () => tryq(up('students', 'u1', { name: '새학생' }, 'u1', 'm1', 't1')));
ok('upsert: 원장이 새 학생 추가', r.ok, r.e);
r = await as('admin@x.com', () => tryq(up('students', 'u1', { name: '새학생-수정' }, 'u1', 'm1', 't1')));
ok('upsert: 원장이 학생 수정', r.ok, r.e);
r = await as('m1@x.com', () => tryq(up('students', 'u2', {}, 'u2', 'm1', 't1')));
ok('upsert: 멘토가 내 담당 학생 추가', r.ok, r.e);
r = await as('m1@x.com', () => tryq(up('students', 'u3', {}, 'u3', 'm2', 't2')));
ok('upsert: 멘토가 남의 담당 학생 못 만듦', !r.ok, r.e);
r = await as('lead1@x.com', () => tryq(up('students', 'u4', {}, 'u4', 'm1', 't1')));
ok('upsert: 팀장이 팀 학생 추가', r.ok, r.e);
r = await as('head1@x.com', () => tryq(up('students', 'u5', {}, 'u5', 'm3', 't3')));
ok('upsert: 부장이 사업부 학생 추가', r.ok, r.e);
r = await as('m1@x.com', () => tryq(up('notes', 'u6', { body: 'x' }, 's1')));
ok('upsert: 멘토가 담당 학생 상담 기록', r.ok, r.e);
r = await as('m1@x.com', () => tryq(up('notes', 'u7', { body: 'x' }, 's2')));
ok('upsert: 멘토가 남의 학생 상담 기록 못 씀', !r.ok, r.e);
r = await as('lead1@x.com', () => tryq(up('classes', 'u8', { name: '반' })));
ok('upsert: 팀장이 수업 추가', r.ok, r.e);
r = await as('m1@x.com', () => tryq(up('leads', 'u9', { name: '문의' })));
ok('upsert: 멘토가 상담 문의 추가', r.ok, r.e);
r = await as('m1@x.com', () => tryq(`insert into items (collection,id,data) values ('logs','u10','{}')`));
ok('insert: 멘토가 수정 이력 남김', r.ok, r.e);
r = await as('m1@x.com', () => tryq(up('staff', 'u11', { email: 'z@x.com', role: 'admin' })));
ok('upsert: 멘토가 직원 못 만듦', !r.ok, r.e);

// 학생 삭제 승인제
r = await as('m1@x.com', () => tryq(`delete from items where collection='students' and id='u2'`));
ok('멘토: 자기 담당 학생도 직접 삭제 못 함', !r.ok || r.n === 0, r.e || 'rows ' + r.n);
r = await as('m1@x.com', () => tryq(`update items set data = data || '{"deleteRequest":{"reason":"x"}}' where collection='students' and id='u2'`));
ok('멘토: 삭제 요청(학생 정보 수정)은 가능', r.ok && r.n === 1, r.e || 'rows ' + r.n);
r = await as('lead1@x.com', () => tryq(`delete from items where collection='students' and id='u2'`));
ok('팀장: 자기 팀 학생 삭제(승인)', r.ok && r.n === 1, r.e || 'rows ' + r.n);
r = await as('lead1@x.com', () => tryq(`delete from items where collection='students' and id='s2'`));
ok('팀장: 다른 팀 학생은 삭제 못 함', !r.ok || r.n === 0, r.e || 'rows ' + r.n);
r = await as('head1@x.com', () => tryq(`delete from items where collection='students' and id='u5'`));
ok('부장: 사업부 학생 삭제(승인)', r.ok && r.n === 1, r.e || 'rows ' + r.n);

// 학생 링크
let v = await as(null, () => db.query(`select student_view('tok-s1-aaaaaaaa') v`));
v = v.rows[0].v;
ok('학생 링크: 본인 정보', v && v.student.name === '학생1');
ok('학생 링크: 연락처 안 나옴', v && !JSON.stringify(v).includes('010'));
ok('학생 링크: 상담 기록 안 나옴', v && !JSON.stringify(v).includes('상담1'));
ok('학생 링크: 비공개 할 일 숨김', v && v.tasks.length === 1, JSON.stringify(v && v.tasks));
ok('학생 링크: 수업·출결', v && v.classes.length === 1 && v.attendance.length === 1);
v = (await as(null, () => db.query(`select student_view('wrong-token-123') v`))).rows[0].v;
ok('틀린 토큰: null', v === null);
v = (await as(null, () => db.query(`select student_view('short') v`))).rows[0].v;
ok('짧은 토큰: null', v === null);
r = await as(null, () => tryq(`select student_set_task('tok-s1-aaaaaaaa','k1',true)`));
const done = (await db.query(`select data->>'done' d from items where id='k1'`)).rows[0].d;
ok('학생: 할 일 체크', r.ok && done === 'true', r.e);
r = await as(null, () => tryq(`select student_set_task('tok-s2-bbbbbbbb','k1',false)`));
const still = (await db.query(`select data->>'done' d from items where id='k1'`)).rows[0].d;
ok('다른 학생 토큰으로 남의 할 일 못 바꿈', still === 'true');

// 신청 폼
r = await as(null, () => tryq(`select submit_lead('홍길동','010-1111-2222','AI','')`));
ok('신청 폼 접수', r.ok, r.e);
await as(null, () => tryq(`select submit_lead('홍길동','010-1111-2222','AI','')`));
await as(null, () => tryq(`select submit_lead('홍길동','010-1111-2222','AI','')`));
r = await as(null, () => tryq(`select submit_lead('홍길동','010-1111-2222','AI','')`));
ok('같은 번호 하루 4번째는 차단', !r.ok, r.e);
r = await as(null, () => tryq(`select submit_lead('','010-1111-3333','AI','')`));
ok('이름 없으면 거부', !r.ok);

// 회차별 녹화본: 멘토는 담당 학생이 듣는 수업만
const recOf = async id => (await db.query(`select data->'recordings' r from items where collection='classes' and id=$1`, [id])).rows[0].r;
r = await as('m1@x.com', () => tryq(`select class_set_recordings('c1', '{"2026-10-05":{"url":"https://zoom.us/rec/a","note":"pw"}}')`));
ok('멘토1: 담당 학생 수업에 녹화본 저장', r.ok && (await recOf('c1'))['2026-10-05'].url === 'https://zoom.us/rec/a', r.e);
ok('녹화본 저장해도 수업 정보는 그대로', (await db.query(`select data->>'name' n from items where collection='classes' and id='c1'`)).rows[0].n === '파이썬');
r = await as('m2@x.com', () => tryq(`select class_set_recordings('c1', '{}')`));
ok('멘토2: 담당 학생 없는 수업은 못 바꿈', !r.ok && (await recOf('c1'))['2026-10-05'], r.e);
r = await as('m1@x.com', () => tryq(`select class_set_recordings('c1', '{"2026-10-05":{"url":"javascript:alert(1)"}}')`));
ok('녹화본: https 아닌 링크 거부', !r.ok);
r = await as('m1@x.com', () => tryq(`select class_set_recordings('c1', '{"bad":{"url":"https://a.b"}}')`));
ok('녹화본: 날짜 아닌 키 거부', !r.ok);
r = await as('lead1@x.com', () => tryq(`select class_set_recordings('c1', '{"2026-10-07":{"url":"https://zoom.us/rec/b","note":""}}')`));
ok('팀장: 녹화본 저장', r.ok, r.e);
r = await as(null, () => tryq(`select class_set_recordings('c1', '{}')`));
ok('비로그인: 녹화본 못 바꿈', !r.ok);
r = await as('m1@x.com', () => tryq(`update items set data = data || '{"name":"x"}' where collection='classes' and id='c1'`));
ok('멘토: 수업 정보 직접 수정은 여전히 불가', !r.ok || r.n === 0, r.e);

// 실시간 수업 줌: 녹화본과 같은 권한
const zoomOf = async id => (await db.query(`select data->'zoom' z from items where collection='classes' and id=$1`, [id])).rows[0].z;
r = await as('m1@x.com', () => tryq(`select class_set_zoom('c1', '{"url":"https://us06web.zoom.us/j/1?pwd=x","meetingId":"854 9427 0486","pw":"090330"}')`));
ok('멘토1: 담당 학생 수업에 줌 링크 저장', r.ok && (await zoomOf('c1')).pw === '090330', r.e);
r = await as('m2@x.com', () => tryq(`select class_set_zoom('c1', '{}')`));
ok('멘토2: 담당 학생 없는 수업 줌 못 바꿈', !r.ok && (await zoomOf('c1')), r.e);
r = await as('m1@x.com', () => tryq(`select class_set_zoom('c1', '{"url":"javascript:alert(1)"}')`));
ok('줌: https 아닌 링크 거부', !r.ok);
v = (await as(null, () => db.query(`select student_view('tok-s1-aaaaaaaa') v`))).rows[0].v;
ok('학생 링크: 실시간 줌 보임', v && v.classes[0].zoom && v.classes[0].zoom.meetingId === '854 9427 0486');
r = await as('lead1@x.com', () => tryq(`select class_set_zoom('c1', '{}')`));
ok('팀장: 줌 링크 지우기', r.ok && (await zoomOf('c1')) === null, r.e);

// 재실행 안전
r = await db.exec(schema).then(() => ({ ok: true }), e => ({ ok: false, e: e.message }));
ok('스크립트 두 번 실행해도 됨', r.ok, r.e);

console.log(fails ? `\n${fails}개 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
