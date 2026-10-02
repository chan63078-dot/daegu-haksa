// 강의 시간표 파일 읽기
// 1) 학원 시스템에서 받은 "IT대구 ○월 평일/주말 강의 시간표" (강의실 × 시간 격자)
// 2) 간단한 표 (수업 이름, 요일, 시작, 끝, 개강일, 종강일, 강의실, 강사)
(function (root) {
  const TIME_RE = /^\d{1,2}:\d{2}$/;
  const DETAIL = [
    /전체출석율|당일출석율/, /^정원\s*:/, /^배정:/, /^개:\d{4}/, /^종:\d{4}/, /^수업없음$/,
    /^[월화수목금토일~\/]+$/,   // 요일: 월~금, 토/일, 월수금, 격주 패턴(월수금월수) 등
    /^\(?(휴강|보강)/, /^\(★/, /^\d+\/\d+/
  ];
  const TEACHER_RE = /^[가-힣]{2,4}\d{0,2}$/;
  const DAY_IDX = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

  // '월~금' → [1..5], '토/일' → [6,0], '월수금' → [1,3,5]
  function parseDays(text) {
    const t = String(text || '').replace(/\s/g, '');
    const m = t.match(/^([월화수목금토일])~([월화수목금토일])$/);
    if (m) {
      const out = [];
      for (let d = DAY_IDX[m[1]]; ; d = (d + 1) % 7) { out.push(d); if (d === DAY_IDX[m[2]] || out.length > 7) break; }
      return out;
    }
    return Array.from(new Set(t.split('').filter(c => c in DAY_IDX).map(c => DAY_IDX[c])));
  }
  const pad = n => String(n).padStart(2, '0');
  const normTime = t => { const [h, m] = String(t).split(':'); return `${pad(+h)}:${pad(+m || 0)}`; };

  // 끝 시간은 파일에 없어서 시작 시간으로 추정 (등록 후 수정 가능)
  function guessEnd(start, days) {
    const h = +start.split(':')[0];
    const weekend = days.length && days.every(d => d === 0 || d === 6);
    if (h >= 18) return '22:00';
    if (weekend) return `${pad(Math.min(h + 4, 22))}:${start.split(':')[1]}`;
    if (h < 12) return '18:00';
    return `${pad(Math.min(h + 4, 22))}:${start.split(':')[1]}`;
  }

  function classify(text) {
    if (DETAIL.some(re => re.test(text))) return 'detail';
    if (text.length < 2 || /^\(\s*\d/.test(text)) return 'detail';   // 괄호 메모 "(08.10 / 09:00~17:00)", 깨진 글자
    if (TEACHER_RE.test(text)) return 'teacher';
    return 'course';
  }

  function parseGrid(rows) {
    const row1 = rows[1] || [];
    const rooms = {};
    row1.forEach((v, ci) => { if (ci > 0 && String(v).trim()) rooms[ci] = String(v).trim(); });
    // 각 줄의 시간 (빈 칸은 위 시간을 이어받음)
    const timeAt = [];
    let cur = null;
    rows.forEach((r, ri) => { const v = String(r[0] || '').trim(); if (TIME_RE.test(v)) cur = normTime(v); timeAt[ri] = cur; });

    const out = [];
    Object.keys(rooms).map(Number).forEach(ci => {
      let c = null;
      const push = () => { if (c) out.push(c); };
      // 이 열의 글자 있는 칸만 순서대로
      const cells = [];
      for (let ri = 3; ri < rows.length; ri++) {
        const text = String((rows[ri] || [])[ci] || '').trim();
        if (text) cells.push({ ri, text });
      }
      cells.forEach(({ ri, text }, k) => {
        // 수업 이름 바로 아래 칸은 항상 '출석율' → 이름이 사람 이름처럼 생겨도(리눅스2 등) 수업으로 판단
        const next = cells[k + 1];
        const kind = next && /출석율/.test(next.text) && !/출석율/.test(text) ? 'course' : classify(text);
        if (kind === 'course') {
          push();
          c = { name: text, room: rooms[ci].replace(/-\d+$/, ''), instructor: '', daysText: '', start: timeAt[ri] || '', startDate: '', endDate: '', notes: [] };
          return;
        }
        if (!c) return;
        if (kind === 'teacher') { if (!c.instructor) c.instructor = text.replace(/\d+$/, ''); return; }
        let m;
        if ((m = text.match(/^개:(\d{4}-\d{2}-\d{2})/))) c.startDate = m[1];
        else if ((m = text.match(/^종:(\d{4}-\d{2}-\d{2})/))) c.endDate = m[1];
        else if (DETAIL[6].test(text)) {
          if (!c.daysText) c.daysText = text;
          // 월수금월수처럼 주마다 요일이 다르면 비고에 남김
          if (/^[월화수목금토일]{4,}$/.test(text) && new Set(text).size < text.length) c.notes.push(`격주 요일: ${text}`);
        }
        else if (/★/.test(text)) { const t = text.match(/([가-힣]{2,4})\s*강사/); if (t && !c.instructor) c.instructor = t[1]; c.notes.push(text.replace(/[()]/g, '')); }
        else if (/휴강|보강/.test(text)) c.notes.push(text.replace(/[()]/g, ''));
      });
      push();
    });
    return out;
  }

  // 간단한 표: 첫 줄이 머리글
  function parseTable(rows) {
    const norm = s => String(s || '').replace(/\s/g, '');
    const head = rows[0].map(norm);
    const col = (...names) => head.findIndex(h => names.some(n => h === n || h.includes(n)));
    const idx = {
      name: col('수업이름', '과정명', '수업명', '이름'), days: col('요일'), start: col('시작'), end: col('끝', '종료시간'),
      startDate: col('개강'), endDate: col('종강'), room: col('강의실'), instructor: col('강사')
    };
    if (idx.name < 0) return null;
    const date = v => { const m = String(v || '').match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/); return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : ''; };
    return rows.slice(1).map(r => {
      const g = k => (idx[k] >= 0 ? String(r[idx[k]] || '').trim() : '');
      return { name: g('name'), room: g('room'), instructor: g('instructor'), daysText: g('days'), start: TIME_RE.test(g('start')) ? normTime(g('start')) : '', end: TIME_RE.test(g('end')) ? normTime(g('end')) : '', startDate: date(g('startDate')), endDate: date(g('endDate')), notes: [] };
    }).filter(c => c.name);
  }

  // 결과: [{ name, room, instructor, days:[0-6], daysText, start, end, endGuessed, startDate, endDate, note, gov }]
  function parseTimetable(rows) {
    if (!rows || !rows.length) return { error: '빈 파일이에요.' };
    const isGrid = String(rows[0][0] || '').trim() === '강의실';
    const list = isGrid ? parseGrid(rows) : parseTable(rows);
    if (!list) return { error: "수업 이름 칸을 찾지 못했어요. 학원 시간표 파일이나 양식 파일을 올려주세요." };
    return {
      format: isGrid ? 'grid' : 'table',
      courses: list.map(c => {
        const days = parseDays(c.daysText);
        const start = c.start || '';
        const end = c.end || (start ? guessEnd(start, days) : '');
        return {
          name: c.name, room: c.room, instructor: c.instructor, days, daysText: c.daysText, start, end, endGuessed: !c.end && !!start,
          startDate: c.startDate, endDate: c.endDate, note: c.notes.join(' / '),
          gov: /KDT|K-디지털|과정평가형|양성과정|국비/.test(c.name)
        };
      })
    };
  }

  root.Timetable = { parseTimetable, parseDays, guessEnd };
})(typeof window !== 'undefined' ? window : globalThis);
