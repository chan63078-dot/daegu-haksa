// 학생 휴대폰 캘린더 구독 (Supabase Edge Function: calendar-feed, verify_jwt 끔 — 캘린더 앱은 키를 못 보냄)
// GET ?t=학생토큰 → iCalendar(.ics). 학생 링크 토큰이 곧 권한 (student_view 와 같은 범위만)
// 수업 회차 날짜는 학생 화면과 똑같이 계산하려고 사이트의 lib/util.js(U.sessions, 공휴일)를 그대로 씀
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://daegu-haksa.netlify.app';
let U: any = null;
async function util() {
  if (U) return U;
  const code = await (await fetch(SITE + '/lib/util.js')).text();
  const w: any = {};
  new Function('window', code)(w);
  return (U = w.U);
}

const esc = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (d: string) => d.replace(/-/g, '');
// 한국 시간 날짜+시각 → UTC
const utc = (d: string, hm: string) => new Date(Date.parse(`${d}T${hm || '00:00'}:00+09:00`)).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
const next = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
// 75바이트 줄 접기 (한글은 3바이트)
function fold(line: string) {
  const enc = new TextEncoder(); let out = '', cur = '', n = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > 73) { out += cur + '\r\n '; cur = ''; n = 1; } cur += ch; n += b; }
  return out + cur;
}
const alarm = (trigger: string, text: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];

Deno.serve(async req => {
  const token = new URL(req.url).searchParams.get('t') || '';
  if (token.length < 12) return new Response('not found', { status: 404 });
  const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('student_view', { p_token: token });
  if (error || !data || !data.student) return new Response('not found', { status: 404 });
  const { sessions } = await util();

  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//daegu-haksa//calendar-feed//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(data.student.name + ' 학습 캘린더')}`, 'X-WR-TIMEZONE:Asia/Seoul', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  const ev = (uid: string, when: string[], summary: string, extra: string[] = []) =>
    L.push('BEGIN:VEVENT', `UID:${uid}@daegu-haksa`, `DTSTAMP:${stamp}`, ...when, `SUMMARY:${esc(summary)}`, ...extra, 'END:VEVENT');
  const allDay = (a: string, b?: string) => [`DTSTART;VALUE=DATE:${ymd(a)}`, `DTEND;VALUE=DATE:${ymd(next(b || a))}`];

  // 수업: 회차마다, 수업 2시간 전 알림 + 첫 회차는 개강 3일 전 알림
  for (const c of data.classes || []) {
    if (c.archived || !c.start || !c.end) continue;
    const ss: string[] = sessions(c);
    ss.forEach((d, i) => {
      const desc = [c.instructor && `강사 ${c.instructor}`, c.zoom?.url && `실시간 수업: ${c.zoom.url}${c.zoom.pw ? ' (암호 ' + c.zoom.pw + ')' : ''}`].filter(Boolean).join('\n');
      ev(`c-${c.id}-${d}`, [`DTSTART:${utc(d, c.start)}`, `DTEND:${utc(d, c.end)}`], `${c.name} ${i + 1}/${ss.length}회`,
        [...(c.room ? [`LOCATION:${esc(c.room)}`] : []), ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
          ...alarm('-PT2H', `${c.name} 2시간 뒤 수업`), ...(i === 0 ? alarm('-P3D', `${c.name} 3일 뒤 개강`) : [])]);
    });
  }
  // 응시 시험: 접수 기간(마감 10일·5일 전, 당일 알림), 시험, 발표
  for (const e of data.exams || []) {
    if (e.regStart) ev(`x-${e.id}-reg`, allDay(e.regStart, e.regEnd || e.regStart), `🎓 ${e.name} 접수`,
      [...alarm('-P10D', `${e.name} 접수 10일 전`), ...alarm('-P5D', `${e.name} 접수 5일 전`), ...alarm('PT9H', `${e.name} 오늘 접수 시작`)]);
    if (e.examDate) ev(`x-${e.id}-exam`, allDay(e.examDate, e.examEnd || e.examDate), `🎓 ${e.name} 시험`, [...(e.memo ? [`DESCRIPTION:${esc(e.memo)}`] : []), ...alarm('-P1D', `${e.name} 내일 시험`)]);
    if (e.resultDate) ev(`x-${e.id}-result`, allDay(e.resultDate), `🎓 ${e.name} 발표`);
  }
  for (const [i, m] of (data.meetings || []).entries()) {
    if (!m.date) continue;
    const when = /^\d{1,2}:\d{2}$/.test(m.time || '') ? [`DTSTART:${utc(m.date, m.time.padStart(5, '0'))}`, 'DURATION:PT1H'] : allDay(m.date);
    ev(`m-${m.date}-${i}`, when, `면담${m.topic ? ' · ' + m.topic : ''}`, alarm('-PT2H', '면담 2시간 전'));
  }
  for (const k of data.tasks || []) if (k.due && !k.done) ev(`t-${k.id}`, allDay(k.due), `할 일 마감 · ${k.title}`);
  L.push('END:VCALENDAR');
  return new Response(L.map(fold).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=900', 'Content-Disposition': 'inline; filename="calendar.ics"' }
  });
});
