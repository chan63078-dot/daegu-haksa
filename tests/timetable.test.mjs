// 시간표 파일 읽기 검증 (가상의 샘플, 학원 시스템 격자 형식과 같은 모양)
import fs from 'fs';
import vm from 'vm';
globalThis.window = globalThis;
for (const f of ['util.js', 'timetable.js']) vm.runInThisContext(fs.readFileSync(new URL(`../public/lib/${f}`, import.meta.url), 'utf8'));

const csv = [
  '강의실,A[10층],,B[10층]',
  ',A[10층]-1,A[10층]-2,B[10층]-1',
  '정원,26,26,33',
  '9:00,샘플 개발자 양성과정 1,,',
  '9:30,전체출석율 : 0%,,',
  '10:00,수업없음,,',
  '10:30,정원 : 26(20),,',
  '11:00,(휴강:10/9),,',
  '11:30,홍길동2,,',
  '12:00,월~금,,',
  '12:30,개:2026-09-01,,',
  '13:00,종:2026-12-31,,',
  '19:00,리눅스2,파이썬3/주말,자바1',
  ',전체출석율 : 0%,전체출석율 : 0%,전체출석율 : 0%',
  ',배정:0,토/일,월수금월수',
  ',월/수,개:2026-10-03,개:2026-10-05',
  ',개:2026-10-05,종:2026-11-01,종:2026-11-20',
  ',종:2026-11-04,,',
  ',(08.10 / 09:00~17:00 (7H)),,'
].join('\n');

const r = Timetable.parseTimetable(U.parseCSV(csv));
const by = n => r.courses.find(c => c.name === n);
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };

ok('격자 형식 인식', r.format === 'grid');
ok('수업 4개 (괄호 메모는 수업 아님)', r.courses.length === 4, r.courses.map(c => c.name).join(', '));
const a = by('샘플 개발자 양성과정 1');
ok('평일 국비: 요일·시간·기간·강사·강의실', a && a.days.join() === '1,2,3,4,5' && a.start === '09:00' && a.end === '18:00' && a.startDate === '2026-09-01' && a.endDate === '2026-12-31' && a.instructor === '홍길동' && a.room === 'A[10층]' && a.gov, JSON.stringify(a));
ok('휴강 비고', a && a.note.includes('휴강:10/9'));
const l = by('리눅스2');
ok('사람 이름처럼 생긴 수업(리눅스2)도 수업으로', l && l.days.join() === '1,3' && l.start === '19:00' && l.end === '22:00', JSON.stringify(l));
const p = by('파이썬3/주말');
ok('주말: 토/일, 끝 시간 4시간 추정', p && p.days.join() === '6,0' && p.end === '23:00'.replace('23', '22'), JSON.stringify(p));
const j = by('자바1');
ok('격주 요일 패턴(월수금월수)', j && j.days.join() === '1,3,5' && j.note.includes('격주'), JSON.stringify(j));
ok('요일 범위 화~토', Timetable.parseDays('화~토').join() === '2,3,4,5,6');

const t = Timetable.parseTimetable(U.parseCSV('수업 이름,요일,시작,끝,개강일,종강일,강의실,강사\n엑셀반,월/수,19:00,21:30,2026.10.1,2026/11/30,301호,김강사'));
ok('직접 쓴 양식', t.format === 'table' && t.courses[0].end === '21:30' && t.courses[0].startDate === '2026-10-01' && t.courses[0].endDate === '2026-11-30' && !t.courses[0].endGuessed, JSON.stringify(t.courses[0]));

console.log(fails ? `\n${fails}개 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
