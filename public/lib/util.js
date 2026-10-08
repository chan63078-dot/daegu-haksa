// 공통 상수와 도우미
(function () {
  const STATUS = [
    { key: 'active', label: '수강중', tone: 'green' },
    { key: 'gov', label: '국비 연계', tone: 'blue' },
    { key: 'prospect', label: '추등가망생', tone: 'amber' },
    { key: 'employed', label: '취업 완료', tone: 'violet' },
    { key: 'school', label: '진학 완료', tone: 'violet' },
    { key: 'done', label: '수료', tone: 'gray' },
    { key: 'dropped', label: '중도 이탈', tone: 'red' }
  ];
  const ONGOING = ['active', 'gov', 'prospect'];
  const CATEGORIES = ['10대', '대학 1·2학년', '대학 3·4학년', '대학 휴학', '취준 20대', '취준 30대 이상', '재직자', '시니어', '비대면'];
  const TRACKS = ['전공', '비전공'];
  const ROLES = { admin: '원장·총괄', head: '부장(사업부)', lead: '팀장', mentor: '멘토' };
  // 화면에 보일 직함: 직함(경력멘토 등)이 있으면 그것, 없으면 권한 이름
  const roleLabel = p => (p && (p.title || ROLES[p.role])) || '';
  const SCOPE = { admin: '지점 전체 학생과 직원 관리', head: '우리 사업부 학생 전체', lead: '우리 팀 학생 전체', mentor: '내 담당 학생' };
  const LEAD_STATUS = [
    { key: 'new', label: '신규', tone: 'amber' },
    { key: 'contacted', label: '상담 중', tone: 'blue' },
    { key: 'registered', label: '등록', tone: 'green' },
    { key: 'closed', label: '보류·종료', tone: 'gray' }
  ];
  const ATT = { present: '출석', late: '지각', absent: '결석' };
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
  const dow = s => parse(s).getDay();
  const fmt = s => { if (!s) return ''; const d = parse(s.slice(0, 10)); return `${d.getMonth() + 1}.${d.getDate()}(${DAYS[d.getDay()]})`; };
  const fmtFull = s => { if (!s) return ''; const d = parse(s.slice(0, 10)); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
  const dday = s => { const n = diffDays(s, today()); return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`; };

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 수업이 그 날짜에 열리는지
  const classOn = (c, date) => !c.archived && (c.days || []).includes(dow(date)) && (!c.startDate || c.startDate <= date) && (!c.endDate || c.endDate >= date);

  const statusOf = k => STATUS.find(s => s.key === k) || { key: k, label: k || '미정', tone: 'gray' };
  const leadStatusOf = k => LEAD_STATUS.find(s => s.key === k) || LEAD_STATUS[0];

  function csv(rows) {
    return '﻿' + rows.map(r => r.map(v => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // CSV 읽기 (따옴표·줄바꿈 처리)
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  }
  // 한국어 엑셀이 저장한 CSV(EUC-KR)도 읽기
  async function readTextFile(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('euc-kr').decode(buf); }
  }

  // 공휴일 (대체공휴일 포함, 정부 발표에 따라 바뀔 수 있음)
  const HOLIDAYS = {
    '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴', '2026-03-01': '삼일절', '2026-03-02': '대체공휴일',
    '2026-05-05': '어린이날', '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일', '2026-06-03': '지방선거', '2026-06-06': '현충일',
    '2026-08-15': '광복절', '2026-08-17': '대체공휴일', '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
    '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
    '2027-01-01': '신정', '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-02-08': '설날 연휴', '2027-03-01': '삼일절',
    '2027-05-05': '어린이날', '2027-05-13': '부처님오신날', '2027-06-06': '현충일', '2027-08-15': '광복절',
    '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴', '2027-10-03': '개천절', '2027-10-09': '한글날', '2027-12-25': '성탄절'
  };

  // 비고의 "휴강: 09/24,25, 10/05" "휴강: 09/24~25" 같은 날짜를 읽음 (" / " 뒤는 다른 메모)
  function offDates(note, startDate) {
    const out = new Set();
    const baseY = Number(String(startDate || today()).slice(0, 4));
    const baseM = Number(String(startDate || today()).slice(5, 7));
    String(note || '').split(' / ').forEach(part => {
      const m = part.match(/휴강\s*:?\s*(.*)$/);
      if (!m) return;
      let month = null;
      m[1].split(/[,\s]+/).filter(Boolean).forEach(tok => {
        const r = tok.match(/^(?:(\d{1,2})\/)?(\d{1,2})(?:~(?:(\d{1,2})\/)?(\d{1,2}))?/);
        if (!r) return;
        if (r[1]) month = Number(r[1]);
        if (!month) return;
        const y = month < baseM - 6 ? baseY + 1 : baseY;
        const from = new Date(y, month - 1, Number(r[2]));
        const toMonth = r[3] ? Number(r[3]) : month;
        const to = new Date(toMonth < month ? y + 1 : y, toMonth - 1, r[4] ? Number(r[4]) : Number(r[2]));
        for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) out.add(iso(d));
        month = toMonth;
      });
    });
    return out;
  }
  // 수업(또는 학습 계획)이 실제로 열리는 날짜들: 요일·기간 안에서 공휴일과 휴강일 제외
  function sessions(c) {
    if (!c.startDate || !c.endDate || !(c.days || []).length) return [];
    const off = offDates(c.note, c.startDate);
    const out = [];
    for (let d = c.startDate; d <= c.endDate && out.length < 400; d = addDays(d, 1)) {
      if (c.days.includes(dow(d)) && !HOLIDAYS[d] && !off.has(d)) out.push(d);
    }
    return out;
  }

  window.U = { HOLIDAYS, offDates, sessions, roleLabel, SCOPE, parseCSV, readTextFile, STATUS, ONGOING, CATEGORIES, TRACKS, ROLES, LEAD_STATUS, ATT, DAYS, pad, iso, parse, today, addDays, diffDays, dow, fmt, fmtFull, dday, esc, classOn, statusOf, leadStatusOf, csv, download };
})();
