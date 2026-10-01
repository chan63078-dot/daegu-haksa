// 공통 상수와 도우미
(function () {
  const STATUS = [
    { key: 'active', label: '수강중', tone: 'green' },
    { key: 'gov', label: '국비 연계', tone: 'blue' },
    { key: 'employed', label: '취업 완료', tone: 'violet' },
    { key: 'school', label: '진학 완료', tone: 'violet' },
    { key: 'done', label: '수료', tone: 'gray' },
    { key: 'dropped', label: '중도 이탈', tone: 'red' }
  ];
  const ONGOING = ['active', 'gov'];
  const CATEGORIES = ['10대', '대학 1·2학년', '대학 3·4학년', '대학 휴학', '취준 20대', '취준 30대 이상', '재직자'];
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

  window.U = { roleLabel, SCOPE, parseCSV, readTextFile, STATUS, ONGOING, CATEGORIES, TRACKS, ROLES, LEAD_STATUS, ATT, DAYS, pad, iso, parse, today, addDays, diffDays, dow, fmt, fmtFull, dday, esc, classOn, statusOf, leadStatusOf, csv, download };
})();
