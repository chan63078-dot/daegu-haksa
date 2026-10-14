import fs from 'fs';

// 수업 회차 계산(공휴일·휴강·격주 요일): npm test
globalThis.window = {};
new Function(fs.readFileSync(new URL('../public/lib/util.js', import.meta.url), 'utf8'))();
const U = window.U;
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const md = l => l.map(d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`).join(',');

// 10월 평일 DBMS: 월수금 / 월수 격주 (금요일은 2주에 한 번)
let c = { days: [1, 3, 5], startDate: '2026-10-19', endDate: '2026-11-11', note: '격주 요일: 월수금 / 월수' };
ok('월수금/월수 격주', md(U.sessions(c)) === '10/19,10/21,10/23,10/26,10/28,11/2,11/4,11/6,11/9,11/11', md(U.sessions(c)));
c.note = '격주 요일: 월수금월수';
ok('붙여 쓴 격주 요일도 읽음', md(U.sessions(c)) === '10/19,10/21,10/23,10/26,10/28,11/2,11/4,11/6,11/9,11/11', md(U.sessions(c)));
// 12월 화목 / 화목금 (성탄절·신정 제외), 화요일 개강
c = { days: [2, 4, 5], startDate: '2026-12-15', endDate: '2027-01-11', note: '격주 요일: 화목 / 화목금' };
ok('화목/화목금 격주 + 공휴일', md(U.sessions(c)) === '12/15,12/17,12/22,12/24,12/29,12/31,1/5,1/7,1/8', md(U.sessions(c)));
// 목요일 개강이어도 그 주가 첫 묶음
c = { days: [1, 3, 5], startDate: '2027-01-14', endDate: '2027-02-12', note: '격주 요일: 월수금 / 월수' };
ok('주 중간 개강', md(U.sessions(c)) === '1/15,1/18,1/20,1/25,1/27,1/29,2/1,2/3,2/10,2/12', md(U.sessions(c)));
// 격주 없는 수업 + 휴강 메모
c = { days: [1, 3], startDate: '2026-09-14', endDate: '2026-10-12', note: '휴강: 09/24,25, 10/05' };
ok('일반 요일 + 휴강', md(U.sessions(c)) === '9/14,9/16,9/21,9/23,9/28,9/30,10/7,10/12', md(U.sessions(c)));
ok('격주 아님', U.weekPatterns('휴강: 10/05') === null && U.weekPatterns('격주 요일: 월수금') === null);

console.log(fails ? `\n${fails}개 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
