// 대구지점 학사관리 - 관리자 화면
(function () {
  const { esc, fmt, fmtFull, today, addDays, diffDays, dday, statusOf, leadStatusOf, STATUS, ONGOING, CATEGORIES, TRACKS, ROLES, LEAD_STATUS, ATT, DAYS } = U;
  const app = document.getElementById('app');
  // 학생 링크·안내 문구는 항상 공식 주소로 (예전 주소로 열어도 새 주소가 나가게). 로컬·데모에서는 지금 주소
  const ROOT = (window.HAKSA_CONFIG && window.HAKSA_CONFIG.SITE_URL && !/[?&]demo\b/.test(location.search) && !/^(localhost|127\.)/.test(location.hostname))
    ? window.HAKSA_CONFIG.SITE_URL : location.origin + location.pathname.replace(/admin\/.*$/, '');
  const ui = {
    homeMine: false,
    stu: { q: '', status: 'ongoing', cat: '', mentor: '', view: 'list' },
    classArchived: false,
    examPast: false,
    examQ: '',
    leadTab: 'open',
    reportMonths: 6,
    classView: 'cards',   // 'cards' | 'grid'
    gridMonth: null,      // 'YYYY-MM'
    gridKind: 'weekday',  // 'weekday' | 'weekend' | 'all'
    accounts: null       // 로그인 계정 목록 { email: {lastSignIn} } | 'loading' | { error }
  };

  try { const v = localStorage.getItem('haksa-class-view'); if (v === 'grid' || v === 'cards') ui.classView = v; } catch (e) {}

  // ---------- 도우미 ----------
  const me = () => Store.me();
  const isAdmin = () => me() && me().role === 'admin';
  const isLead = () => me() && ['lead', 'head', 'admin'].includes(me().role);
  const roleLabel = U.roleLabel;
  const teamFull = id => { const t = Store.get('teams', id); return t ? (t.division ? `${t.division} ${t.name}` : t.name) : '팀 없음'; };
  const staff = () => Store.all('staff').filter(s => s.active !== false);
  const staffName = id => (Store.get('staff', id) || {}).name || '미지정';
  const teamName = id => (Store.get('teams', id) || {}).name || '팀 없음';
  const students = () => Store.all('students');
  const ongoing = list => list.filter(s => ONGOING.includes(s.status));
  const initial = n => esc((n || '?').trim().slice(0, 1));
  const pill = st => `<span class="pill ${st.tone}">${esc(st.label)}</span>`;
  const studentLink = s => `${ROOT}?t=${encodeURIComponent(s.token)}${Store.forceDemo ? '&demo' : ''}`;
  const examLast = e => e.examEnd || e.examDate || '';
  const examWhen = e => e.examEnd && e.examEnd !== e.examDate ? `${fmt(e.examDate)}~${fmt(e.examEnd)}` : fmt(e.examDate);
  const classEnded = c => !!c.archived || (!!c.endDate && c.endDate < today());
  const classPeriod = c => (c.startDate ? `${fmt(c.startDate)}~${fmt(c.endDate)}` : '기간 미정');
  const classTime = c => `${(c.days || []).map(d => DAYS[d]).join('·') || '요일 미정'} ${esc(c.start || '')}~${esc(c.end || '')}`;
  // 최근에 등록한 학생이 위로 (등록 시각이 같으면 그룹웨어 학생 번호가 큰 쪽이 최근)
  // 학생 삭제는 팀장·부장·원장(승인권자)만. 멘토는 자기 담당 학생 삭제를 '요청'
  const canDeleteStudent = () => isLead();
  const canRequestDelete = s => !isLead() && s.mentorId === me().id;
  const delPill = s => s.deleteRequest ? ' <span class="pill red" title="' + esc(`${s.deleteRequest.byName || ''}: ${s.deleteRequest.reason || ''}`) + '">삭제 요청</span>' : '';
  function deleteButton(s) {
    if (canDeleteStudent(s)) return `<button class="btn ghost sm danger" data-act="stu-delete" data-id="${s.id}">${s.deleteRequest ? '승인·삭제' : '삭제'}</button>${s.deleteRequest ? `<button class="btn ghost sm" data-act="del-reject" data-id="${s.id}">반려</button>` : ''}`;
    if (canRequestDelete(s)) return s.deleteRequest ? `<button class="btn ghost sm" data-act="del-cancel" data-id="${s.id}">요청 취소</button>` : `<button class="btn ghost sm danger" data-act="del-request" data-id="${s.id}">삭제 요청</button>`;
    return '';
  }
  const newestFirst = list => sortBy(list, s => (s.createdAt || '') + String(s.gwNo || '').padStart(10, '0')).reverse();
  const sortBy = (arr, f) => arr.slice().sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0));

  function toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function openModal(title, body, opts) {
    opts = opts || {};
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="btn ghost sm" data-x>닫기</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${opts.extra || ''}<span class="grow"></span><button class="btn" data-x>취소</button>${opts.onOk ? `<button class="btn ${opts.danger ? 'accent' : 'primary'}" data-ok>${esc(opts.okText || '저장')}</button>` : ''}</div>
    </div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-x]')) close(); });
    const ok = bg.querySelector('[data-ok]');
    if (ok) ok.onclick = async () => {
      ok.disabled = true;
      try { if ((await opts.onOk(bg)) !== false) close(); }
      catch (err) { console.error(err); toast('저장하지 못했어요: ' + (err.message || err)); }
      ok.disabled = false;
    };
    if (opts.onOpen) opts.onOpen(bg);
    const f = bg.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
    if (f) f.focus();
    return bg;
  }
  function confirmBox(msg, okText) {
    return new Promise(res => {
      const bg = openModal('확인', `<p style="margin:0;white-space:pre-wrap">${esc(msg)}</p>`, { okText: okText || '확인', danger: true, onOk: () => { res(true); } });
      bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-x]')) res(false); });
    });
  }
  function vals(root) {
    const o = {};
    root.querySelectorAll('[name]').forEach(el => {
      const n = el.name;
      if (el.type === 'checkbox') {
        if (el.hasAttribute('data-multi')) { o[n] = o[n] || []; if (el.checked) o[n].push(el.value); }
        else o[n] = el.checked;
      } else o[n] = (el.value || '').trim();
    });
    return o;
  }
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  const field = (label, inner, cls) => `<div class="field ${cls || ''}"><label>${esc(label)}</label>${inner}</div>`;
  const input = (name, value, attrs) => `<input class="in" name="${name}" value="${esc(value || '')}" ${attrs || ''}>`;
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('링크를 복사했어요'); }
    catch (e) { openModal('링크 복사', `<p class="faint">아래 링크를 길게 눌러 복사하세요.</p><textarea class="in" readonly>${esc(text)}</textarea>`); }
  }

  // ---------- 계산 ----------
  function nextMeeting(sid) { const t = today(); return sortBy(Store.all('meetings').filter(m => m.studentId === sid && !m.done && m.date >= t), m => m.date + (m.time || ''))[0] || null; }
  function lastNote(sid) { return sortBy(Store.all('notes').filter(n => n.studentId === sid), n => n.date).pop() || null; }

  // 같은 과정의 다음 기수: 이름 끝 번호 +1 (번호가 없으면 같은 이름), 종강 후 14일 안 개강, 같은 강의실 우선
  function seriesOf(c) {
    const base = String(c.name || '').replace(/\s·\s.*$/, '').trim();
    const m = base.match(/^(.*?)(\d+)(\/주말)?$/);
    return m ? { key: m[1].trim() + (m[3] || ''), n: Number(m[2]) } : { key: base, n: null };
  }
  function nextCohort(c, classes) {
    const sc = seriesOf(c);
    // 종강 후 14일 안에 개강하는 반만 (몇 달 뒤 같은 이름으로 다시 여는 반은 다음 기수가 아님)
    const limit = c.endDate ? addDays(c.endDate, 14) : '9999';
    const cands = (classes || Store.all('classes')).filter(x => x.id !== c.id && (x.startDate || '') > (c.startDate || '') && (x.startDate || '') <= limit && !classEnded(x))
      .filter(x => { const sx = seriesOf(x); return sx.key === sc.key && (sc.n == null ? sx.n == null : sx.n === sc.n + 1); });
    return sortBy(cands, x => (x.room === c.room ? '0' : '1') + (x.startDate || ''))[0] || null;
  }
  // 종강 10일 전 ~ 종강 7일 후 수업 중, 다음 기수로 아직 안 옮긴 진행 중 학생이 있는 것
  function cohortSuggestions(list) {
    const t = today();
    const classes = Store.all('classes');
    const out = [];
    classes.filter(c => c.endDate && diffDays(c.endDate, t) <= 10 && diffDays(t, c.endDate) <= 7).forEach(c => {
      const nx = nextCohort(c, classes);
      if (!nx) return;
      const studs = ongoing(list).filter(s => (s.classIds || []).includes(c.id) && !(s.classIds || []).includes(nx.id));
      if (studs.length) out.push({ from: c, to: nx, studs });
    });
    return sortBy(out, x => x.from.endDate);
  }
  function moveCohort(from, to, list) {
    openModal('다음 기수로 연결', `<div class="card card-pad" style="margin-bottom:12px;background:var(--surface-2)">
        <div class="faint">지금 수업</div><b>${esc(from.name)}</b><div class="faint">${classPeriod(from)} · ${esc(from.room || '')}</div>
        <div style="margin:8px 0;font-weight:800;color:var(--brand)">↓</div>
        <div class="faint">다음 기수</div><b>${esc(to.name)}</b><div class="faint">${classPeriod(to)} · ${classTime(to)} · ${esc(to.room || '')}</div></div>
      <label class="check" style="margin-bottom:6px"><input type="checkbox" id="mv-all" checked>모두 선택</label>
      <div style="max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:4px 12px">${list.map(s => `<label class="li check" style="padding:8px 0"><input type="checkbox" name="sids" data-multi value="${s.id}" checked><div class="main"><div class="t" style="font-weight:600">${esc(s.name)}</div><div class="s">${esc(staffName(s.mentorId))}</div></div></label>`).join('')}</div>
      <p class="faint">지금 수업 연결은 그대로 두고 다음 기수만 추가해요. 다음 기수로 안 가는 학생은 체크를 빼세요.</p>`, {
      okText: '연결하기',
      onOpen: bg => { bg.querySelector('#mv-all').onchange = e => bg.querySelectorAll('[name=sids]').forEach(x => { x.checked = e.target.checked; }); },
      onOk: async root => {
        const pick = new Set(vals(root).sids || []);
        if (!pick.size) { toast('학생을 골라주세요'); return false; }
        for (const s of list.filter(x => pick.has(x.id))) { s.classIds = Array.from(new Set((s.classIds || []).concat(to.id))); await Store.put('students', s); }
        await Store.log('cohort', to.id, `다음 기수 연결: ${from.name} → ${to.name} (${pick.size}명)`);
        toast(`${pick.size}명을 ${to.name}에 연결했어요`);
        render();
      }
    });
  }

  const lastBackup = () => Store.get('settings', 'backup');
  function backupAge() { const b = lastBackup(); return b && b.at ? diffDays(today(), b.at.slice(0, 10)) : null; }

  function alertsFor(list) {
    const t = today();
    const out = [];
    const exams = Store.all('exams');
    ongoing(list).forEach(s => {
      const ln = lastNote(s.id);
      if (!ln) out.push({ tone: 'amber', s, title: '상담 기록 없음', sub: '첫 면담을 잡아주세요' });
      else if (diffDays(t, ln.date) > 21) out.push({ tone: 'amber', s, title: '면담 공백', sub: `마지막 기록 ${diffDays(t, ln.date)}일 전` });
      const notes = Store.all('notes').filter(n => n.studentId === s.id);
      const late = notes.find(n => n.nextDate && n.nextDate < t && !notes.some(m => m.date >= n.nextDate));
      if (late) out.push({ tone: 'amber', s, title: '후속 상담 지연', sub: `예정일 ${fmt(late.nextDate)}` });
      const overdue = Store.all('tasks').filter(k => k.studentId === s.id && !k.done && k.due && k.due < t);
      if (overdue.length) out.push({ tone: 'blue', s, title: '할 일 지연', sub: `${overdue[0].title}${overdue.length > 1 ? ` 외 ${overdue.length - 1}건` : ''}` });
      exams.filter(e => (e.studentIds || []).includes(s.id) && e.regEnd && e.regEnd >= t && diffDays(e.regEnd, t) <= 3)
        .forEach(e => out.push({ tone: 'red', s, title: `접수 마감 ${dday(e.regEnd)}`, sub: `${e.name} · ${fmt(e.regEnd)}까지` }));
      exams.filter(e => (e.studentIds || []).includes(s.id) && examLast(e) >= t && diffDays(e.examDate, t) <= 14)
        .forEach(e => out.push({ tone: 'blue', s, title: e.examDate <= t ? '시험 기간' : `시험 임박 ${dday(e.examDate)}`, sub: `${e.name} · ${examWhen(e)}` }));
    });
    const order = { red: 0, amber: 1, blue: 2 };
    return out.sort((a, b) => order[a.tone] - order[b.tone]);
  }

  // ---------- 화면 틀 ----------
  const NAV = [
    ['home', '#/', '오늘'],
    ['students', '#/students', '학생'],
    ['classes', '#/classes', '수업'],
    ['exams', '#/exams', '시험 일정'],
    ['report', '#/report', '리포트'],
    ['settings', '#/settings', '설정']
  ];
  function shell(active, body) {
    const m = me();
    return `${Store.live ? '' : `<div class="demo-banner"><b>${Store.forceDemo ? '연습용 데모 모드' : '데모 모드'}</b> · 이 브라우저에만 저장돼요. ${Store.forceDemo ? '실제 데이터에는 영향이 없어요.' : '실제 운영은 설정 파일에 Supabase 정보를 넣으면 바뀝니다.'}</div>`}
    <header class="topbar"><div class="topbar-in">
      <a class="brand" href="#/"><span class="brand-mark">대</span><span>학사관리<small>${esc(Store.config.ACADEMY_NAME || '')}</small></span></a>
      <nav class="nav">${NAV.map(([k, h, l]) => `<a href="${h}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <button class="user-chip" data-act="account"><span class="av">${initial(m.name)}</span><span class="hide-m">${esc(m.name)}</span></button>
    </div></header>
    <main>${body}</main>`;
  }

  // ---------- 로그인 ----------
  // 로그인 실패 원인을 구분해서 알려주기
  function loginError(err) {
    const code = (err && (err.code || err.message)) || '';
    if (code === 'not-staff') return '로그인 계정은 맞지만 직원 명단에 없는 이메일이에요. 원장·총괄에게 직원 등록을 요청하세요.';
    if (code === 'email_not_confirmed' || /not confirmed/i.test(code)) return '이메일 인증이 안 된 계정이에요. Supabase에서 계정을 지우고 Auto Confirm User를 체크해 다시 만들어 주세요.';
    if (code === 'invalid_credentials' || /invalid login/i.test(code)) return '이메일 또는 비밀번호가 맞지 않아요. 계정이 아직 없을 수도 있어요.';
    if (code === 'over_request_rate_limit' || /rate limit/i.test(code)) return '로그인 시도가 너무 많아요. 몇 분 뒤 다시 해주세요.';
    if (/fetch|network/i.test(code)) return '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
    return '로그인하지 못했어요: ' + code;
  }
  function renderLogin(msg) {
    const C = Store.config;
    const body = Store.live
      ? `<form class="form" id="login-form">
          ${field('이메일', `<input class="in" name="email" type="email" autocomplete="username" required>`)}
          ${field('비밀번호', `<input class="in" name="password" type="password" autocomplete="current-password" required>`)}
          <button class="btn primary" type="submit">로그인</button>
          <p class="faint" style="margin:0">계정이 없거나 비밀번호를 잊었으면 원장님께 요청하세요.</p>
        </form>`
      : `<p class="faint" style="margin:0 0 12px">데모 모드예요. 어떤 사람으로 들어갈지 고르면 그 권한으로 보여요.</p>
        <div class="staff-pick">${Store.all('staff').map(s => `<button data-act="demo-login" data-id="${s.id}"><span class="av">${initial(s.name)}</span><span class="grow"><b>${esc(s.name)}</b><br><span class="faint">${esc(roleLabel(s))}${s.teamId ? ' · ' + esc(teamFull(s.teamId)) : ''}</span></span></button>`).join('')}</div>`;
    app.innerHTML = `<div class="login-wrap"><div class="login card card-pad" style="padding:28px">
      <div class="row" style="gap:12px;margin-bottom:18px"><span class="brand-mark">대</span><div><h2 style="font-size:20px">학사관리 로그인</h2><div class="faint">${esc(C.ACADEMY_NAME || '')}</div></div></div>
      ${msg ? `<p class="pill red" style="height:auto;padding:6px 10px;margin:0 0 12px">${esc(msg)}</p>` : ''}
      ${body}
    </div></div>`;
    const f = document.getElementById('login-form');
    if (f) f.onsubmit = async e => {
      e.preventDefault();
      const v = vals(f);
      try { await Store.login(v.email, v.password); render(); }
      catch (err) { console.warn('login', err); renderLogin(loginError(err)); }
    };
  }

  // ---------- 오늘 (대시보드) ----------
  function pageHome() {
    const m = me();
    const t = today();
    let list = students();
    if (ui.homeMine) list = list.filter(s => s.mentorId === m.id);
    const ids = new Set(list.map(s => s.id));
    const on = ongoing(list);
    const classesToday = Store.all('classes').filter(c => U.classOn(c, t));
    const meetings = sortBy(Store.all('meetings').filter(x => ids.has(x.studentId) && !x.done && x.date >= t && x.date <= addDays(t, 13)), x => x.date + (x.time || ''));
    const weekMeet = meetings.filter(x => x.date <= addDays(t, 6)).length;
    const alerts = alertsFor(list);
    const monthNew = list.filter(s => (s.createdAt || '').slice(0, 7) === t.slice(0, 7)).length;
    const delReqs = isLead() ? students().filter(s => s.deleteRequest) : [];
    const cohorts = cohortSuggestions(list);
    ui._cohorts = cohorts;
    const bAge = isAdmin() ? backupAge() : 0;
    const examSoon = sortBy(Store.all('exams').filter(e => examLast(e) >= t && (diffDays(e.examDate, t) <= 21 || (e.regEnd && e.regEnd >= t && diffDays(e.regEnd, t) <= 7))), e => e.examDate);
    const h = new Date().getHours();
    const hello = h < 11 ? '좋은 아침이에요' : h < 18 ? '안녕하세요' : '오늘도 수고하셨어요';

    const todayRows = classesToday.map(c => {
      const n = on.filter(s => (s.classIds || []).includes(c.id)).length;
      return n ? `<a class="li" href="#/classes/${c.id}"><span class="pill outline">${esc(c.start)}</span><div class="main"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.room || '')}${c.instructor ? ' · ' + esc(c.instructor) : ''}</div></div><span class="faint">${n}명</span></a>` : '';
    }).join('');

    return `<div class="page-head"><div><h1>${hello}, ${esc(m.name)}님</h1><p>${fmtFull(t)} ${DAYS[U.dow(t)]}요일 · ${ui.homeMine || m.role === 'mentor' ? '내 담당 학생' : m.role === 'admin' ? '지점 전체' : m.role === 'head' ? esc(Store.divisionOf(m.teamId) || '사업부') + ' 전체' : esc(teamName(m.teamId)) + ' 전체'} 기준</p></div>
      <div class="row">${m.role !== 'mentor' ? `<button class="chip ${ui.homeMine ? 'on' : ''}" data-act="home-mine">내 담당만</button>` : ''}<button class="btn primary" data-act="student-new">+ 학생 추가</button></div></div>

    ${isAdmin() && (bAge == null || bAge >= 7) ? `<div class="card card-pad row" style="margin-bottom:16px;border-color:var(--accent);background:var(--accent-soft);justify-content:space-between">
      <div><b>${bAge == null ? '아직 백업을 받은 적이 없어요' : `마지막 백업이 ${bAge}일 전이에요`}</b><div class="faint">무료 플랜은 자동 백업이 없어요. 주 1회 받아 공용 드라이브에 보관하세요.</div></div>
      <button class="btn accent" data-act="backup">지금 백업 받기</button></div>` : ''}
    <div class="grid g4">
      <div class="card stat hl"><div class="k">진행 중 학생</div><div class="v">${on.length}<small>명</small></div></div>
      <div class="card stat"><div class="k">챙겨야 할 학생</div><div class="v">${new Set(alerts.map(a => a.s.id)).size}<small>명</small></div></div>
      <div class="card stat"><div class="k">이번 주 면담</div><div class="v">${weekMeet}<small>건</small></div></div>
      <div class="card stat"><div class="k">이번 달 신규</div><div class="v">${monthNew}<small>명</small></div></div>
    </div>

    <div class="grid g3" style="margin-top:16px;align-items:start">
      <section class="card span2"><div class="card-head"><h3>챙겨야 할 학생</h3><span class="faint">면담 공백 · 후속 상담 · 할 일 지연 · 시험 접수·임박</span></div>
        <div class="card-body">${alerts.length ? alerts.slice(0, 20).map(a => `<a class="alert-row" href="#/students/${a.s.id}${a.title.includes('시험') || a.title.includes('접수') ? '/certs' : a.title.includes('할 일') ? '/certs' : '/notes'}"><span class="alert-dot ${a.tone}"></span><div class="grow"><b>${esc(a.s.name)}</b> <span class="muted">· ${esc(a.title)}</span><div class="faint">${esc(a.sub)} · 담당 ${esc(staffName(a.s.mentorId))}</div></div></a>`).join('') + (alerts.length > 20 ? `<div class="faint" style="padding-top:8px">외 ${alerts.length - 20}건</div>` : '') : '<div class="empty">지금 따로 챙길 학생이 없어요</div>'}</div></section>
      <div class="grid">
        ${delReqs.length ? `<section class="card" style="border-color:var(--red)"><div class="card-head"><h3>삭제 요청</h3><span class="pill red">${delReqs.length}</span></div>
          <div class="card-body"><div class="list">${delReqs.map(s => `<div class="li" style="align-items:flex-start"><div class="main"><a class="t" href="#/students/${s.id}" style="text-decoration:none">${esc(s.name)}</a><div class="s">요청 ${esc(s.deleteRequest.byName || '')} · ${fmt(s.deleteRequest.at)} · 담당 ${esc(staffName(s.mentorId))}</div><div class="s">사유: ${esc(s.deleteRequest.reason || '-')}</div></div><div class="row" style="flex-wrap:nowrap;gap:4px">${deleteButton(s)}</div></div>`).join('')}</div></div></section>` : ''}
        ${cohorts.length ? `<section class="card" style="border-color:var(--brand)"><div class="card-head"><h3>다음 기수 연결</h3><span class="pill green">${cohorts.length}</span></div>
          <div class="card-body"><div class="list">${cohorts.map((x, i) => `<div class="li" style="align-items:flex-start"><div class="main"><div class="t">${esc(x.from.name)}</div><div class="s">${fmt(x.from.endDate)} 종강 → ${esc(x.to.name)} ${fmt(x.to.startDate)} 개강</div><div class="s">아직 안 옮긴 학생 ${x.studs.length}명</div></div><button class="btn sm primary" data-act="cohort-move" data-i="${i}">연결</button></div>`).join('')}</div></div></section>` : ''}
        <section class="card"><div class="card-head"><h3>다가오는 면담</h3><span class="faint">2주</span></div>
          <div class="card-body">${meetings.length ? `<div class="list">${meetings.map(x => { const s = Store.get('students', x.studentId); return `<a class="li" href="#/students/${x.studentId}/notes"><span class="pill outline">${fmt(x.date)}</span><div class="main"><div class="t">${esc(s ? s.name : '')}</div><div class="s">${esc(x.time || '')} ${esc(x.topic || '')}</div></div></a>`; }).join('')}</div>` : '<div class="empty">예정된 면담이 없어요</div>'}</div></section>
        <section class="card"><div class="card-head"><h3>다가오는 시험</h3><a class="btn sm" href="#/exams">전체</a></div>
          <div class="card-body">${examSoon.length ? `<div class="list">${examSoon.map(e => { const n = (e.studentIds || []).filter(id => ids.has(id)).length; const regOpen = e.regStart <= t && t <= e.regEnd; return `<a class="li" href="#/exams"><span class="pill ${regOpen ? 'amber' : 'blue'}">${regOpen ? '접수 ' + dday(e.regEnd) : e.examDate <= t ? '시험 중' : dday(e.examDate)}</span><div class="main"><div class="t">${esc(e.name)}</div><div class="s">시험 ${examWhen(e)}${n ? ` · 응시 ${n}명` : ''}</div></div></a>`; }).join('')}</div>` : '<div class="empty">3주 안에 시험이 없어요</div>'}</div></section>
        ${todayRows ? `<section class="card"><div class="card-head"><h3>오늘 수업</h3></div><div class="card-body"><div class="list">${todayRows}</div></div></section>` : ''}
      </div>
    </div>`;
  }

  // ---------- 학생 목록 ----------
  function filteredStudents() {
    const f = ui.stu;
    return students().filter(s => {
      if (f.status === 'ongoing' && !ONGOING.includes(s.status)) return false;
      if (f.status !== 'ongoing' && f.status !== 'all' && s.status !== f.status) return false;
      if (f.cat && s.category !== f.cat) return false;
      if (f.mentor && s.mentorId !== f.mentor) return false;
      if (f.q) {
        const q = f.q.toLowerCase();
        const hay = [s.name, s.goal, s.phone, staffName(s.mentorId)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function pageStudents() {
    const all = students();
    const f = ui.stu;
    const list = newestFirst(filteredStudents());
    const count = k => k === 'ongoing' ? ongoing(all).length : k === 'all' ? all.length : all.filter(s => s.status === k).length;
    const chips = [['ongoing', '진행 중'], ['all', '전체']].concat(STATUS.map(s => [s.key, s.label]))
      .map(([k, l]) => `<button class="chip ${f.status === k ? 'on' : ''}" data-act="stu-status" data-v="${k}">${l}<b>${count(k)}</b></button>`).join('');
    const classes = Store.all('classes');
    const rows = list.map(s => {
      const ln = lastNote(s.id);
      const nm = nextMeeting(s.id);
      return `<tr class="click" data-act="go" data-href="#/students/${s.id}">
        <td style="min-width:150px"><div class="row" style="flex-wrap:nowrap"><span class="av">${initial(s.name)}</span><div><b>${esc(s.name)}</b>${delPill(s)}<div class="faint">${esc(s.goal || '목표 미입력')}</div></div></div></td>
        <td>${pill(statusOf(s.status))}</td>
        <td class="hide-m">${esc(s.category || '-')}<div class="faint">${esc(s.track || '')}</div></td>
        <td style="white-space:nowrap">${esc(staffName(s.mentorId))}</td>
        <td class="hide-m">${(s.classIds || []).map(id => classes.find(c => c.id === id)).filter(c => c && !classEnded(c)).map(c => `<span class="pill outline">${esc(c.name)}</span>`).join(' ') || '<span class="faint">없음</span>'}</td>
        <td class="hide-m">${ln ? fmt(ln.date) : '<span class="faint">없음</span>'}</td>
        <td>${nm ? fmt(nm.date) : '<span class="faint">-</span>'}</td>
        <td style="text-align:right;white-space:nowrap">${deleteButton(s)}</td></tr>`;
    }).join('');
    const board = `<div class="board">${STATUS.map(st => {
      const items = list.filter(s => s.status === st.key);
      return `<div class="col" data-drop="${st.key}"><h4><span>${pill(st)}</span><span class="faint">${items.length}</span></h4>
        ${items.map(s => `<a class="kcard" draggable="true" data-drag="${s.id}" href="#/students/${s.id}"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.goal || '목표 미입력')}</div><div class="s">${esc(staffName(s.mentorId))} · ${esc(s.category || '')}</div></a>`).join('') || '<div class="faint" style="padding:8px">비어 있어요</div>'}</div>`;
    }).join('')}</div><p class="faint">카드를 다른 칸으로 끌어 놓으면 상태가 바뀌고 이력이 남아요.</p>`;

    return `<div class="page-head"><div><h1>학생</h1><p id="stu-count">${list.length}명 표시 · 볼 수 있는 학생 ${all.length}명</p></div>
      <div class="row"><div class="seg"><button class="${f.view === 'list' ? 'on present' : ''}" data-act="stu-view" data-v="list">목록</button><button class="${f.view === 'board' ? 'on present' : ''}" data-act="stu-view" data-v="board">진행 보드</button></div>
      <button class="btn" data-act="stu-csv">엑셀 받기</button><button class="btn" data-act="import-open">엑셀로 등록</button><button class="btn primary" data-act="student-new">+ 학생 추가</button></div></div>
    <div class="chips" style="margin-bottom:12px">${chips}</div>
    <div class="row" style="margin-bottom:16px">
      <input class="in" style="max-width:280px" placeholder="이름 · 목표 · 연락처 검색" value="${esc(f.q)}" data-input="stu-q">
      <select class="in" style="max-width:180px" data-change="stu-cat">${opt('', '카테고리 전체', f.cat)}${CATEGORIES.map(c => opt(c, c, f.cat)).join('')}</select>
      ${me().role !== 'mentor' ? `<select class="in" style="max-width:180px" data-change="stu-mentor">${opt('', '담당 전체', f.mentor)}${staff().map(s => opt(s.id, s.name, f.mentor)).join('')}</select>` : ''}
    </div>
    <div id="stu-results">${f.view === 'board' ? board : `<div class="card tbl-wrap">${list.length ? `<table class="tbl"><thead><tr><th>이름</th><th>상태</th><th class="hide-m">카테고리</th><th>담당</th><th class="hide-m">수업</th><th class="hide-m">최근 상담</th><th>다음 면담</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">조건에 맞는 학생이 없어요</div>`}</div>`}</div>`;
  }

  function studentForm(s) {
    const canMentor = isLead();
    const classes = Store.all('classes').filter(c => !classEnded(c) || (s.classIds || []).includes(c.id));
    return `<div class="form cols">
      ${field('이름', input('name', s.name, 'required'))}
      ${field('연락처', input('phone', s.phone, 'inputmode="tel" placeholder="010-0000-0000"'))}
      ${field('카테고리', `<select class="in" name="category">${opt('', '선택', s.category)}${CATEGORIES.map(c => opt(c, c, s.category)).join('')}</select>`)}
      ${field('전공 여부', `<select class="in" name="track">${TRACKS.map(c => opt(c, c, s.track)).join('')}</select>`)}
      ${field('담당', `<select class="in" name="mentorId" ${canMentor ? '' : 'disabled'}>${staff().map(x => opt(x.id, `${x.name} (${roleLabel(x)} · ${teamName(x.teamId)})`, s.mentorId || me().id)).join('')}</select>`)}
      ${field('상태', `<select class="in" name="status">${STATUS.map(x => opt(x.key, x.label, s.status || 'active')).join('')}</select>`)}
      ${field('한 줄 목표', input('goal', s.goal, 'placeholder="예: 정보처리기사 → 공기업 전산직"'), 'full')}
      ${field('수강 수업', classes.length
        ? `<input class="in" type="search" placeholder="수업 검색 (예: 파이썬, ALEPH, 주말)" data-class-q style="margin-bottom:8px"><div style="max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:4px 12px">${sortBy(classes, c => (c.startDate || '') + c.name).map(c => `<label class="li check" data-class-item="${esc([c.name, c.room, c.instructor, classTime(c)].join(' ').toLowerCase().replace(/\s/g, ''))}" style="padding:8px 0"><input type="checkbox" name="classIds" data-multi value="${c.id}" ${(s.classIds || []).includes(c.id) ? 'checked' : ''}><div class="main"><div class="t" style="font-weight:600">${esc(c.name)}</div><div class="s">${classPeriod(c)} · ${classTime(c)} · ${esc(c.room || '')}</div></div></label>`).join('')}</div>`
        : `<div class="faint">아직 등록된 수업이 없어요. ${isLead() ? '<a href="#/classes" data-close-modal>수업</a>에서 수업을 추가하거나 시간표 파일로 한꺼번에 등록한 뒤 고를 수 있어요.' : '팀장님께 수업 등록을 요청하세요.'}</div>`, 'full')}
    </div>`;
  }
  function newStudent(prefill, after) {
    const s = Object.assign({ status: 'active', track: '비전공', mentorId: me().id, classIds: [] }, prefill || {});
    openModal('학생 추가', studentForm(s), {
      okText: '추가',
      onOk: async root => {
        const v = vals(root);
        if (!v.name) { toast('이름을 넣어주세요'); return false; }
        if (!isLead()) v.mentorId = me().id;
        const obj = {
          name: v.name, phone: v.phone, category: v.category, track: v.track, mentorId: v.mentorId, status: v.status, goal: v.goal,
          classIds: v.classIds || [], token: Store.newToken(), intro: '', roadmap: [], certs: [], employment: {},
          history: [{ at: new Date().toISOString(), from: '', to: v.status, by: me().name }], createdAt: new Date().toISOString()
        };
        await Store.put('students', obj);
        await Store.log('create', obj.id, `학생 추가: ${obj.name}`);
        toast('학생을 추가했어요');
        if (after) await after(obj);
        location.hash = `#/students/${obj.id}`;
      }
    });
  }
  // ---------- 엑셀(CSV)로 학생 한꺼번에 등록 ----------
  const IMPORT_COLS = [
    ['이름', 'name'], ['연락처', 'phone'], ['카테고리', 'category'], ['전공 여부', 'track'],
    ['담당자 이메일', 'mentor'], ['상태', 'status'], ['한 줄 목표', 'goal'], ['수업', 'classes']
  ];
  function importTemplate() {
    const ex = staff()[0] || { email: 'mentor@example.com' };
    const cls = Store.all('classes').filter(c => !c.archived).slice(0, 2).map(c => c.name);
    const rows = [IMPORT_COLS.map(c => c[0]),
      ['홍길동', '010-1234-5678', CATEGORIES[3], '비전공', ex.email, '수강중', 'AI 서비스 개발자 취업', cls.join(' / ')],
      ['김예시', '010-2345-6789', CATEGORIES[1], '전공', ex.email, '국비 연계', '정보처리기사 취득', cls[0] || '']];
    U.download('학생_일괄등록_양식.csv', U.csv(rows));
  }
  function planImport(rows) {
    const norm = s => String(s || '').replace(/\s/g, '');
    const head = rows[0].map(norm);
    const idx = {};
    IMPORT_COLS.forEach(([label, key]) => { idx[key] = head.indexOf(norm(label)); });
    if (idx.name < 0) return { error: "첫 줄에 '이름' 칸이 없어요. 양식 파일을 받아서 채워주세요." };
    const people = staff();
    const classes = Store.all('classes');
    const existing = Store.all('students');
    const seen = new Set();
    return {
      items: rows.slice(1).map((r, i) => {
        const get = k => (idx[k] >= 0 ? String(r[idx[k]] || '').trim() : '');
        const warn = [];
        const o = { line: i + 2, name: get('name'), phone: get('phone'), goal: get('goal') };
        if (!o.name) return Object.assign(o, { skip: '이름 없음' });
        const key = o.name + '|' + o.phone.replace(/\D/g, '');
        if (seen.has(key)) return Object.assign(o, { skip: '파일 안에서 중복' });
        seen.add(key);
        if (existing.some(s => s.name === o.name && (s.phone || '').replace(/\D/g, '') === o.phone.replace(/\D/g, ''))) return Object.assign(o, { skip: '이미 등록된 학생' });
        if (existing.some(s => s.name === o.name)) warn.push('같은 이름 학생이 이미 있어요(연락처 확인)');
        o.category = CATEGORIES.includes(get('category')) ? get('category') : '';
        if (get('category') && !o.category) warn.push(`카테고리 '${get('category')}' 없음`);
        o.track = TRACKS.includes(get('track')) ? get('track') : '비전공';
        const st = STATUS.find(x => x.label === get('status') || x.key === get('status'));
        o.status = st ? st.key : 'active';
        if (get('status') && !st) warn.push(`상태 '${get('status')}' → 수강중`);
        const mv = get('mentor').toLowerCase();
        const m = mv ? people.find(p => (p.email || '').toLowerCase() === mv || p.name === get('mentor')) : null;
        const allowed = p => p && (isAdmin() || p.id === me().id || (me().role === 'lead' && p.teamId === me().teamId)
          || (me().role === 'head' && !!Store.divisionOf(me().teamId) && Store.divisionOf(p.teamId) === Store.divisionOf(me().teamId)));
        if (m && allowed(m)) o.mentorId = m.id;
        else { o.mentorId = me().id; if (mv) warn.push(m ? `${m.name}님은 배정 권한 밖 → 나에게` : `담당자 '${get('mentor')}' 없음 → 나에게`); }
        o.classIds = [];
        get('classes').split(/[\/,·]/).map(x => x.trim()).filter(Boolean).forEach(n => {
          const c = classes.find(x => x.name === n);
          if (c) o.classIds.push(c.id); else warn.push(`수업 '${n}' 없음`);
        });
        o.warn = warn;
        return o;
      })
    };
  }
  function openImport() {
    let plan = null;
    const bg = openModal('엑셀로 학생 한꺼번에 등록', `
      <ol class="muted" style="margin:0 0 14px;padding-left:18px">
        <li>양식 파일을 받아 엑셀에서 학생을 한 줄에 한 명씩 채워요.</li>
        <li>CSV로 저장한 뒤 아래에서 골라요. (다른 이름으로 저장 → CSV)</li>
        <li>미리보기를 확인하고 등록을 눌러요.</li>
      </ol>
      <div class="row"><button class="btn" data-act="import-template">양식 파일 받기</button><label class="btn primary">CSV 파일 고르기<input type="file" accept=".csv,text/csv" id="import-file" hidden></label></div>
      <div id="import-preview" style="margin-top:14px"></div>`, {
      okText: '등록',
      wide: true,
      onOk: async () => {
        if (!plan || !plan.items) { toast('먼저 CSV 파일을 골라주세요'); return false; }
        const go = plan.items.filter(x => !x.skip);
        if (!go.length) { toast('등록할 학생이 없어요'); return false; }
        for (const x of go) {
          await Store.put('students', {
            name: x.name, phone: x.phone, category: x.category, track: x.track, mentorId: x.mentorId, status: x.status, goal: x.goal,
            classIds: x.classIds, token: Store.newToken(), intro: '', roadmap: [], certs: [], employment: {},
            history: [{ at: new Date().toISOString(), from: '', to: x.status, by: me().name }], createdAt: new Date().toISOString()
          });
        }
        await Store.log('import', '', `학생 일괄 등록 ${go.length}명`);
        toast(`${go.length}명을 등록했어요`);
        render();
      }
    });
    bg.querySelector('#import-file').addEventListener('change', async e => {
      const f = e.target.files[0];
      const box = bg.querySelector('#import-preview');
      if (!f) return;
      try {
        const rows = U.parseCSV(await U.readTextFile(f));
        plan = rows.length ? planImport(rows) : { error: '빈 파일이에요.' };
      } catch (err) { plan = { error: '파일을 읽지 못했어요.' }; }
      if (plan.error) { box.innerHTML = `<p class="pill red" style="height:auto;padding:6px 10px">${esc(plan.error)}</p>`; return; }
      const ok = plan.items.filter(x => !x.skip);
      box.innerHTML = `<p style="margin:0 0 8px"><b>${ok.length}명 등록</b> · <span class="muted">${plan.items.length - ok.length}명 건너뜀</span></p>
        <div class="tbl-wrap" style="max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:10px"><table class="tbl"><thead><tr><th>줄</th><th>이름</th><th>담당</th><th>결과</th></tr></thead><tbody>
        ${plan.items.map(x => `<tr style="${x.skip ? 'opacity:.55' : ''}"><td>${x.line}</td><td>${esc(x.name || '-')}</td><td>${x.skip ? '' : esc(staffName(x.mentorId))}</td><td>${x.skip ? `<span class="pill">${esc(x.skip)}</span>` : x.warn.length ? `<span class="pill amber">확인</span> <span class="faint">${esc(x.warn.join(', '))}</span>` : '<span class="pill green">등록</span>'}</td></tr>`).join('')}
        </tbody></table></div>`;
    });
  }

  // 직원에게 보낼 사용 안내 (비밀번호는 넣지 않음)
  function guideText(p) {
    const scope = U.SCOPE[p.role] || U.SCOPE.mentor;
    const approver = ['admin', 'head', 'lead'].includes(p.role);
    return [`[${Store.config.ACADEMY_NAME || '학사관리'} 학사관리 사용 안내]`, '',
      '■ 접속',
      `- 주소: ${ROOT}admin/`,
      `- 아이디: ${p.email}`,
      '- 비밀번호: 따로 전달드린 임시 비밀번호로 로그인한 뒤, 오른쪽 위 내 이름 → 비밀번호 바꾸기에서 바꿔주세요.',
      "- 휴대폰에서 주소를 열고 '홈 화면에 추가'하면 앱처럼 쓸 수 있어요.",
      '- 예전 주소(github.io)로 쓰셨다면 새 주소에서 한 번 다시 로그인해 주세요.', '',
      `■ ${p.name}님 권한: ${roleLabel(p)} · 보이는 범위는 ${scope}`, '',
      '■ 이렇게 써요',
      '1. 오늘: "챙겨야 할 학생"(면담 공백 · 후속 상담 · 할 일 지연 · 시험 접수 마감)을 먼저 확인해요.',
      '2. 학생 → + 학생 추가: 담당 학생을 등록하고, 수강 수업은 검색해서 체크해요.',
      '3. 학생 상세 → 상담 · 면담: 상담 후 바로 기록하고 다음 면담 일정을 잡아요.',
      '4. 학생 상세 → 학생 링크: 링크를 복사해 학생에게 보내면 학생은 자기 학습 캘린더만 볼 수 있어요.',
      approver ? '5. 오늘 화면의 "삭제 요청"과 "다음 기수 연결"을 확인하고 승인·연결해 주세요.' : '5. 학생 삭제는 "삭제 요청"을 누르면 팀장 · 부장 · 원장이 승인해요.'].join('\n');
  }

  async function setStatus(s, key) {
    if (s.status === key) return;
    const from = statusOf(s.status).label;
    s.history = (s.history || []).concat([{ at: new Date().toISOString(), from: s.status, to: key, by: me().name }]);
    s.status = key;
    await Store.put('students', s);
    await Store.log('status', s.id, `${s.name}: ${from} → ${statusOf(key).label}`);
    toast(`${s.name} · ${statusOf(key).label}(으)로 바꿨어요`);
  }

  // ---------- 학생 상세 ----------
  const STU_TABS = [['info', '기본 · 로드맵'], ['class', '수업'], ['notes', '상담 · 면담'], ['certs', '자격증 · 할 일'], ['job', '취업 · 진학'], ['link', '학생 링크']];
  function pageStudent(id, tab) {
    const s = Store.get('students', id);
    if (!s || !Store.canSeeStudent(s)) return `<div class="card empty">학생을 찾을 수 없거나 볼 권한이 없어요. <a href="#/students">목록으로</a></div>`;
    tab = tab || 'info';
    const body = { info: stuInfo, class: stuClass, notes: stuNotes, certs: stuCerts, job: stuJob, link: stuLink }[tab] || stuInfo;
    return `<a href="#/students" class="faint" style="text-decoration:none">← 학생 목록</a>
    <div class="card card-pad" style="margin:10px 0 18px"><div class="row" style="gap:16px;align-items:center">
      <span class="av lg">${initial(s.name)}</span>
      <div class="grow"><div class="row"><h1 style="font-size:24px">${esc(s.name)}</h1>${pill(statusOf(s.status))}${s.category ? `<span class="pill outline">${esc(s.category)}</span>` : ''}${s.track ? `<span class="pill outline">${esc(s.track)}</span>` : ''}</div>
        <div class="faint">담당 ${esc(staffName(s.mentorId))} · ${esc(teamName(s.teamId))} · ${esc(s.goal || '목표 미입력')}</div></div>
      <div class="row"><select class="in" style="width:auto" data-change="stu-set-status" data-id="${s.id}">${STATUS.map(x => opt(x.key, '상태: ' + x.label, s.status)).join('')}</select>
        <a class="btn" href="${esc(studentLink(s))}" target="_blank" rel="noopener">학생 화면</a></div>
    </div></div>
    <nav class="tabs">${STU_TABS.map(([k, l]) => `<a href="#/students/${s.id}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav>
    ${body(s)}`;
  }

  function stuInfo(s) {
    const hist = (s.history || []).slice().reverse();
    return `<div class="grid g3" style="align-items:start">
      <section class="card span2"><div class="card-head"><h3>기본 정보</h3></div><div class="card-body" id="info-form">
        ${studentForm(s).replace('<div class="form cols">', '<div class="form cols">')}
        <div style="margin-top:14px">${field('학생 화면 소개 문구', `<textarea class="in" name="intro" placeholder="예: 수업 일정, 자격증, 국비·취업 준비를 한 화면에서 확인해요.">${esc(s.intro || '')}</textarea>`)}</div>
        <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn primary" data-act="stu-save-info" data-id="${s.id}">저장</button></div>
      </div></section>
      <div class="grid">
        <section class="card"><div class="card-head"><h3>로드맵</h3><span class="faint">${(s.roadmap || []).filter(r => r.done).length}/${(s.roadmap || []).length}</span></div><div class="card-body">
          <div class="list">${(s.roadmap || []).map((r, i) => `<div class="li"><label class="check grow"><input type="checkbox" data-change="road-toggle" data-id="${s.id}" data-i="${i}" ${r.done ? 'checked' : ''}><span style="${r.done ? 'text-decoration:line-through;color:var(--ink-3)' : ''}">${i + 1}. ${esc(r.title)}</span></label><button class="btn ghost sm" data-act="road-del" data-id="${s.id}" data-i="${i}">삭제</button></div>`).join('') || '<div class="faint">단계를 추가하면 학생 화면에 진행도로 보여요</div>'}</div>
          <div class="row" style="margin-top:10px;flex-wrap:nowrap"><input class="in" id="road-new" placeholder="예: SQLD 취득"><button class="btn" data-act="road-add" data-id="${s.id}">추가</button></div>
        </div></section>
        <section class="card"><div class="card-head"><h3>상태 이력</h3></div><div class="card-body">
          ${hist.length ? `<div class="list">${hist.map(h => `<div class="li"><div class="main"><div class="t">${h.from ? esc(statusOf(h.from).label) + ' → ' : ''}${esc(statusOf(h.to).label)}</div><div class="s">${fmtFull(h.at)} · ${esc(h.by || '')}</div></div></div>`).join('')}</div>` : '<div class="faint">아직 이력이 없어요</div>'}
        </div></section>
      </div></div>`;
  }

  function stuClass(s) {
    const classes = Store.all('classes');
    const mine = classes.filter(c => (s.classIds || []).includes(c.id));
    return `<div class="grid g2" style="align-items:start">
      <section class="card"><div class="card-head"><h3>수강 수업</h3>${isLead() ? `<button class="btn sm" data-act="class-new" data-for="${s.id}">+ 새 수업 만들기</button>` : ''}</div><div class="card-body">
        ${classes.some(c => !classEnded(c)) ? '' : `<div class="faint" style="margin-bottom:8px">진행 중인 수업이 없어요. ${isLead() ? '오른쪽 위 버튼이나 수업 메뉴의 "시간표 파일로 등록"으로 먼저 수업을 만들어 주세요.' : '팀장님께 수업 등록을 요청하세요.'}</div>`}
        <div class="list">${sortBy(classes.filter(c => !classEnded(c) || (s.classIds || []).includes(c.id)), c => ((s.classIds || []).includes(c.id) ? '0' : '1') + (c.startDate || '') + c.name).map(c => `<label class="li check"><input type="checkbox" data-change="stu-class" data-id="${s.id}" value="${c.id}" ${(s.classIds || []).includes(c.id) ? 'checked' : ''}><div class="main"><div class="t">${esc(c.name)}${classEnded(c) ? ' <span class="pill">종료</span>' : ''}</div><div class="s">${classPeriod(c)} · ${classTime(c)}${c.room ? ' · ' + esc(c.room) : ''}${c.instructor ? ' · ' + esc(c.instructor) : ''}</div></div></label>`).join('')}</div>
      </div></section>
      <section class="card"><div class="card-head"><h3>수강 일정</h3></div><div class="card-body">
        ${mine.length ? `<div class="list">${sortBy(mine, c => c.startDate || '').map(c => { const t = today(); const st = classEnded(c) ? ['', '종료'] : (c.startDate || '') > t ? ['amber', '개강 예정 ' + dday(c.startDate)] : ['green', '수강 중']; return `<a class="li" href="#/classes/${c.id}"><span class="pill ${st[0]}">${st[1]}</span><div class="main"><div class="t">${esc(c.name)}</div><div class="s">${classPeriod(c)} · ${classTime(c)}${c.room ? ' · ' + esc(c.room) : ''}</div>${c.note ? `<div class="s">${esc(c.note)}</div>` : ''}</div></a>`; }).join('')}</div>` : '<div class="faint">연결된 수업이 없어요. 왼쪽에서 체크하세요.</div>'}
      </div></section>
      <section class="card" style="grid-column:1/-1"><div class="card-head"><h3>집에서 학습 계획</h3><span class="faint">학생 화면 달력에 '집에서 학습'으로 표시돼요 (공휴일 제외 회차 자동 계산)</span></div><div class="card-body">
        ${(s.plans || []).length ? `<div class="list">${s.plans.map((p, i) => `<div class="li"><span class="pill amber">집에서</span><div class="main"><div class="t">${esc(p.name)}</div><div class="s">${classPeriod(p)} · ${(p.days || []).map(d => DAYS[d]).join('·')} · ${U.sessions(p).length}회${p.note ? ' · ' + esc(p.note) : ''}</div></div><button class="btn ghost sm" data-act="plan-del" data-id="${s.id}" data-i="${i}">삭제</button></div>`).join('')}</div>` : '<div class="faint">아직 계획이 없어요. 예: 파이썬 용어집 정독(월·화), 인강 자바(월·수·금)</div>'}
        <div class="form cols" id="plan-form" style="margin-top:12px;padding:14px;background:var(--surface-2);border-radius:12px">
          ${field('할 일 이름', input('name', '', 'placeholder="예: IT 용어집 정독"'))}
          ${field('메모 (선택)', input('note', '', 'placeholder="예: 하루 2쪽"'))}
          ${field('요일', `<div class="chips">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="check" style="margin-right:8px"><input type="checkbox" name="days" data-multi value="${d}">${DAYS[d]}</label>`).join('')}</div>`, 'full')}
          ${field('시작일', input('startDate', today(), 'type="date"'))}
          ${field('끝나는 날', input('endDate', addDays(today(), 28), 'type="date"'))}
          <div class="full row" style="justify-content:flex-end"><button class="btn primary" data-act="plan-add" data-id="${s.id}">계획 추가</button></div>
        </div>
      </div></section></div>`;
  }

  function stuNotes(s) {
    const notes = sortBy(Store.all('notes').filter(n => n.studentId === s.id), n => n.date).reverse();
    const meets = sortBy(Store.all('meetings').filter(m => m.studentId === s.id), m => m.date + (m.time || ''));
    return `<div class="grid g3" style="align-items:start">
      <section class="card span2"><div class="card-head"><h3>상담 기록</h3><span class="faint">${notes.length}건</span></div><div class="card-body">
        <div class="form cols" id="note-form" style="padding:14px;background:var(--surface-2);border-radius:12px;margin-bottom:8px">
          ${field('종류', `<select class="in" name="type">${['면담', '상담', '전화', '메시지'].map(x => opt(x, x, '면담')).join('')}</select>`)}
          ${field('날짜', input('date', today(), 'type="date"'))}
          ${field('내용', `<textarea class="in" name="body" placeholder="무엇을 이야기했고, 다음에 무엇을 할지"></textarea>`, 'full')}
          ${field('다음 상담일 (선택)', input('nextDate', '', 'type="date"'))}
          <div class="field" style="justify-content:flex-end"><button class="btn primary" data-act="note-add" data-id="${s.id}">기록 저장</button></div>
        </div>
        <div class="list">${notes.map(n => `<div class="li" style="align-items:flex-start"><span class="pill outline">${esc(n.type)}</span><div class="main"><div class="faint">${fmtFull(n.date)} · ${esc(staffName(n.authorId))}${n.nextDate ? ` · 다음 ${fmt(n.nextDate)}` : ''}</div><div style="white-space:pre-wrap">${esc(n.body)}</div></div>${n.authorId === me().id || isAdmin() ? `<button class="btn ghost sm" data-act="del" data-col="notes" data-id="${n.id}">삭제</button>` : ''}</div>`).join('') || '<div class="empty">아직 상담 기록이 없어요</div>'}</div>
      </div></section>
      <section class="card"><div class="card-head"><h3>면담 일정</h3></div><div class="card-body">
        <div class="form" id="meet-form">
          <div class="row" style="flex-wrap:nowrap">${input('date', addDays(today(), 1), 'type="date"')}${input('time', '', 'type="time" style="max-width:120px"')}</div>
          ${input('topic', '', 'placeholder="주제 (예: 포트폴리오 점검)"')}
          <button class="btn" data-act="meet-add" data-id="${s.id}">일정 추가</button>
        </div>
        <div class="list" style="margin-top:10px">${meets.map(m => `<div class="li"><div class="main"><div class="t" style="${m.done ? 'text-decoration:line-through;color:var(--ink-3)' : ''}">${fmt(m.date)} ${esc(m.time || '')}</div><div class="s">${esc(m.topic || '')}</div></div>${m.done ? '' : `<button class="btn sm" data-act="meet-done" data-id="${m.id}">완료</button>`}<button class="btn ghost sm" data-act="del" data-col="meetings" data-id="${m.id}">삭제</button></div>`).join('') || '<div class="faint">예정된 면담이 없어요</div>'}</div>
      </div></section></div>`;
  }

  function stuCerts(s) {
    const t = today();
    const exams = sortBy(Store.all('exams').filter(e => examLast(e) >= t || (e.studentIds || []).includes(s.id)), e => e.examDate);
    const tasks = sortBy(Store.all('tasks').filter(k => k.studentId === s.id), k => (k.done ? '1' : '0') + (k.due || '9'));
    const certTone = st => st === '합격' ? 'green' : st === '불합격' ? 'red' : 'amber';
    return `<div class="grid g2" style="align-items:start">
      <div class="grid">
        <section class="card"><div class="card-head"><h3>자격증</h3></div><div class="card-body">
          <div class="list">${(s.certs || []).map((c, i) => `<div class="li"><div class="main"><div class="t">${esc(c.name)}</div><div class="s">${c.date ? fmtFull(c.date) : '날짜 미정'}</div></div>
            <select class="in" style="width:auto;height:32px" data-change="cert-status" data-id="${s.id}" data-i="${i}">${['준비중', '합격', '불합격'].map(x => opt(x, x, c.status)).join('')}</select>
            <span class="pill ${certTone(c.status)}">${esc(c.status)}</span><button class="btn ghost sm" data-act="cert-del" data-id="${s.id}" data-i="${i}">삭제</button></div>`).join('') || '<div class="faint">등록된 자격증이 없어요</div>'}</div>
          <div class="row" id="cert-form" style="margin-top:10px">${input('name', '', 'placeholder="자격증 이름" style="flex:1;min-width:140px"')}<select class="in" name="status" style="width:auto">${['준비중', '합격', '불합격'].map(x => opt(x, x, '준비중')).join('')}</select>${input('date', '', 'type="date" style="width:auto"')}<button class="btn" data-act="cert-add" data-id="${s.id}">추가</button></div>
        </div></section>
        <section class="card"><div class="card-head"><h3>응시 시험</h3><a class="btn sm" href="#/exams">시험 일정</a></div><div class="card-body">
          <div class="list">${exams.map(e => `<label class="li check"><input type="checkbox" data-change="exam-toggle" data-id="${e.id}" data-sid="${s.id}" ${(e.studentIds || []).includes(s.id) ? 'checked' : ''}><div class="main"><div class="t">${esc(e.name)}</div><div class="s">시험 ${fmt(e.examDate)} · 접수 ${fmt(e.regStart)}~${fmt(e.regEnd)}</div></div><span class="pill ${e.examDate >= t ? 'blue' : ''}">${dday(e.examDate)}</span></label>`).join('') || '<div class="faint">등록된 시험이 없어요</div>'}</div>
        </div></section>
      </div>
      <section class="card"><div class="card-head"><h3>할 일</h3><span class="faint">학생 화면에서 학생이 직접 체크할 수 있어요</span></div><div class="card-body">
        <div class="form" id="task-form">
          <div class="row" style="flex-wrap:nowrap">${input('title', '', 'placeholder="할 일 (예: 기출 1회차 풀기)"')}${input('due', addDays(today(), 7), 'type="date" style="max-width:160px"')}</div>
          <div class="row" style="justify-content:space-between"><label class="check"><input type="checkbox" name="shared" checked>학생 화면에 보이기</label><button class="btn" data-act="task-add" data-id="${s.id}">추가</button></div>
        </div>
        <div class="list" style="margin-top:10px">${tasks.map(k => `<div class="li"><label class="check grow"><input type="checkbox" data-change="task-toggle" data-id="${k.id}" ${k.done ? 'checked' : ''}><span style="${k.done ? 'text-decoration:line-through;color:var(--ink-3)' : ''}">${esc(k.title)}</span></label>${k.due ? `<span class="pill ${!k.done && k.due < t ? 'red' : 'outline'}">${fmt(k.due)}</span>` : ''}${k.shared === false ? '<span class="pill">비공개</span>' : ''}<button class="btn ghost sm" data-act="del" data-col="tasks" data-id="${k.id}">삭제</button></div>`).join('') || '<div class="faint">할 일이 없어요</div>'}</div>
      </div></section></div>`;
  }

  function stuJob(s) {
    const e = s.employment || {};
    return `<section class="card" style="max-width:720px"><div class="card-head"><h3>취업 · 진학 기록</h3><span class="faint">국비 과정 취업률 보고에 쓰여요</span></div><div class="card-body" id="job-form">
      <div class="form cols">
        ${field('회사 · 학교', input('company', e.company, 'placeholder="(주)회사명 / OO대학교 대학원"'))}
        ${field('직무 · 과정', input('role', e.role, 'placeholder="백엔드 개발 / 석사 과정"'))}
        ${field('입사 · 입학일', input('startDate', e.startDate, 'type="date"'))}
        ${field('고용보험 가입', `<select class="in" name="insured">${opt('', '확인 전', e.insured === true ? 'y' : e.insured === false ? 'n' : '')}${opt('y', '가입', e.insured === true ? 'y' : e.insured === false ? 'n' : '')}${opt('n', '미가입', e.insured === true ? 'y' : e.insured === false ? 'n' : '')}</select>`)}
        ${field('연봉 (선택, 만원)', input('salary', e.salary, 'inputmode="numeric"'))}
        ${field('고용 형태', `<select class="in" name="kind">${['', '정규직', '계약직', '인턴', '창업·프리랜서', '진학'].map(x => opt(x, x || '선택', e.kind)).join('')}</select>`)}
        ${field('메모', `<textarea class="in" name="memo">${esc(e.memo || '')}</textarea>`, 'full')}
      </div>
      <div class="row" style="margin-top:14px;justify-content:flex-end">
        <button class="btn" data-act="job-save" data-id="${s.id}">저장</button>
        ${s.status !== 'employed' ? `<button class="btn primary" data-act="job-save" data-id="${s.id}" data-status="employed">저장하고 취업 완료로</button>` : ''}
        ${s.status !== 'school' ? `<button class="btn" data-act="job-save" data-id="${s.id}" data-status="school">저장하고 진학 완료로</button>` : ''}
      </div></div></section>`;
  }

  function stuLink(s) {
    const url = studentLink(s);
    return `<div class="grid g2" style="align-items:start">
      <section class="card"><div class="card-head"><h3>학생 전용 링크</h3></div><div class="card-body">
        <p class="muted" style="margin-top:0">이 링크를 받은 학생은 로그인 없이 <b>본인의 수업 일정, 로드맵, 시험, 할 일, 출석률</b>만 볼 수 있어요. 연락처와 상담 기록은 보이지 않아요.</p>
        <input class="in" readonly value="${esc(url)}" onclick="this.select()">
        <div class="row" style="margin-top:10px"><button class="btn primary" data-act="copy" data-v="${esc(url)}">링크 복사</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">열어보기</a><button class="btn danger" data-act="token-new" data-id="${s.id}">새 링크 만들기</button></div>
        <p class="faint">링크가 다른 사람에게 퍼졌거나 수료한 학생이면 새 링크를 만드세요. 이전 링크는 바로 막혀요.</p>
      </div></section>
      ${canDeleteStudent(s) || canRequestDelete(s) ? `<section class="card"><div class="card-head"><h3>학생 삭제</h3></div><div class="card-body">
        ${s.deleteRequest ? `<p class="pill red" style="height:auto;padding:6px 10px;margin:0 0 10px">삭제 요청 · ${esc(s.deleteRequest.byName || '')} · ${fmtFull(s.deleteRequest.at)}<br>사유: ${esc(s.deleteRequest.reason || '-')}</p>` : ''}
        <p class="muted" style="margin-top:0">${canDeleteStudent(s) ? '학생과 상담 기록 · 면담 · 할 일이 모두 지워지고 되돌릴 수 없어요. 먼저 백업을 받아두세요.' : '학생 삭제는 팀장·부장·원장 승인이 필요해요. 요청하면 승인권자 대시보드에 올라가요.'}</p>
        <div class="row">${deleteButton(s)}</div></div></section>` : ''}
    </div>`;
  }

  // ---------- 수업 ----------
  function pageClasses() {
    const t = today();
    const all = Store.all('classes');
    const list = sortBy(all.filter(c => classEnded(c) === ui.classArchived), c => (U.classOn(c, t) ? '0' : (c.startDate || '') <= t ? '1' : '2') + (c.startDate || '') + c.name);
    const studs = students();
    const viewToggle = `<div class="seg"><button class="${ui.classView === 'cards' ? 'on present' : ''}" data-act="class-view" data-v="cards">카드</button><button class="${ui.classView === 'grid' ? 'on present' : ''}" data-act="class-view" data-v="grid">시간표</button></div>`;
    const head = `<div class="page-head"><div><h1>수업</h1><p>반별 수강생을 보고, 학생과 수업을 연결해요</p></div>
      <div class="row">${viewToggle}${isLead() ? '<button class="btn" data-act="class-import">시간표 파일로 등록</button><button class="btn primary" data-act="class-new">+ 수업 추가</button>' : ''}</div></div>`;
    if (ui.classView === 'grid') return head + classGrid(all);
    return `${head}
    <div class="chips" style="margin-bottom:16px"><button class="chip ${!ui.classArchived ? 'on' : ''}" data-act="class-arch" data-v="0">진행·예정<b>${all.filter(c => !classEnded(c)).length}</b></button><button class="chip ${ui.classArchived ? 'on' : ''}" data-act="class-arch" data-v="1">종료<b>${all.filter(classEnded).length}</b></button></div>
    <div class="grid g3">${list.map(c => {
      const n = studs.filter(s => (s.classIds || []).includes(c.id) && ONGOING.includes(s.status)).length;
      const on = U.classOn(c, t);
      return `<a class="card class-card ${esc(c.color || 'gray')}" href="#/classes/${c.id}">
        <div class="row">${on ? '<span class="pill accent" style="background:var(--accent);color:#fff">오늘 수업</span>' : ''}${c.gov ? '<span class="pill blue">국비</span>' : ''}${classEnded(c) ? '<span class="pill">종료</span>' : (c.startDate || '') > t ? '<span class="pill amber">개강 예정</span>' : ''}</div>
        <h3>${esc(c.name)}</h3>
        <div class="faint">${classTime(c)} · ${esc(c.room || '')}${c.instructor ? ' · ' + esc(c.instructor) + ' 강사' : ''}</div>
        <div class="faint">${fmt(c.startDate)} ~ ${fmt(c.endDate)}</div>
        <div style="margin-top:8px;font-weight:700">학생 ${n}명</div></a>`;
    }).join('') || `<div class="card empty" style="grid-column:1/-1">${ui.classArchived ? '끝난 수업이 없어요' : `아직 수업이 없어요.${isLead() ? '<br>매달 받는 "IT대구 ○월 평일/주말 강의 시간표" 파일을 <b>시간표 파일로 등록</b>에 올리면 한꺼번에 들어가요.' : ''}`}</div>`}</div>`;
  }

  // ---------- 시간표 보기 (강의실 × 시간, 막대) ----------
  const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  function classGrid(all) {
    const t = today();
    const month = ui.gridMonth || t.slice(0, 7);
    const [yy, mm] = month.split('-').map(Number);
    const from = `${month}-01`, to = U.iso(new Date(yy, mm, 0));
    const isWeekend = c => (c.days || []).length > 0 && c.days.every(d => d === 0 || d === 6);
    const list = all.filter(c => c.start && c.end && (!c.startDate || c.startDate <= to) && (!c.endDate || c.endDate >= from) && !c.archived)
      .filter(c => ui.gridKind === 'all' || (ui.gridKind === 'weekend' ? isWeekend(c) : !isWeekend(c)));
    const kindChips = [['weekday', '평일'], ['weekend', '주말'], ['all', '전체']].map(([k, l]) => `<button class="chip ${ui.gridKind === k ? 'on' : ''}" data-act="grid-kind" data-v="${k}">${l}<b>${all.filter(c => c.start && (!c.startDate || c.startDate <= to) && (!c.endDate || c.endDate >= from) && !c.archived && (k === 'all' || (k === 'weekend' ? isWeekend(c) : !isWeekend(c)))).length}</b></button>`).join('');
    const nav = `<div class="row" style="margin-bottom:12px;gap:12px">
      <div class="row" style="gap:4px"><button class="btn sm" data-act="grid-month" data-v="-1" aria-label="이전 달">◀</button><b style="min-width:96px;text-align:center">${yy}년 ${mm}월</b><button class="btn sm" data-act="grid-month" data-v="1" aria-label="다음 달">▶</button>${month !== t.slice(0, 7) ? '<button class="btn sm ghost" data-act="grid-month" data-v="0">이번 달</button>' : ''}</div>
      <div class="chips">${kindChips}</div>
      <span class="faint">${fmt(from)} ~ ${fmt(to)} 사이에 진행되는 수업</span></div>`;
    if (!list.length) return nav + `<div class="card empty">이 달에 진행되는 ${ui.gridKind === 'weekend' ? '주말 ' : ui.gridKind === 'weekday' ? '평일 ' : ''}수업이 없어요</div>`;

    // 강의실별로, 그 달 안에서 시간·요일이 겹치는 반은 옆 칸(레인)으로 (앞뒤로 이어지는 기수도 나눠 보여 줌)
    const overlap = (a, b) => toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)
      && (a.days || []).some(d => (b.days || []).includes(d));
    const rooms = Array.from(new Set(list.map(c => c.room || '강의실 미정'))).sort((a, b) => a.localeCompare(b, 'ko'));
    const cols = [];
    rooms.forEach(room => {
      const lanes = [];
      sortBy(list.filter(c => (c.room || '강의실 미정') === room), c => c.start + (c.startDate || '')).forEach(c => {
        let lane = lanes.find(l => !l.some(x => overlap(x, c)));
        if (!lane) { lane = []; lanes.push(lane); }
        lane.push(c);
      });
      lanes.forEach((lane, i) => cols.push({ room, first: i === 0, span: lanes.length, items: lane }));
    });
    const startMin = Math.floor(Math.min(...list.map(c => toMin(c.start))) / 60) * 60;
    const endMin = Math.ceil(Math.max(...list.map(c => toMin(c.end))) / 60) * 60;
    const SLOT = 30, PX = 30;  // 30분 = 30px
    const height = (endMin - startMin) / SLOT * PX;
    const studs = students();
    const times = [];
    for (let m = startMin; m < endMin; m += SLOT) times.push(m);
    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    const block = c => {
      const top = (toMin(c.start) - startMin) / SLOT * PX, h = Math.max((toMin(c.end) - toMin(c.start)) / SLOT * PX - 3, 22);
      const n = studs.filter(s => (s.classIds || []).includes(c.id)).length;
      const live = U.classOn(c, t);
      return `<a class="tt-block ${c.gov ? 'gov' : ''} ${classEnded(c) ? 'ended' : ''}" href="#/classes/${c.id}" style="top:${top}px;height:${h}px" title="${esc(c.name)}\n${esc(classTime(c))}\n${esc(classPeriod(c))}${c.instructor ? '\n' + esc(c.instructor) + ' 강사' : ''}">
        <b>${live ? '<i class="tt-dot"></i>' : ''}${esc(c.name)}</b>
        <span>${esc(c.room || '')}${c.instructor ? ' | ' + esc(c.instructor) : ''}</span>
        ${h > 70 ? `<span>${esc(c.start)}~${esc(c.end)} · ${(c.days || []).map(d => DAYS[d]).join('')}</span><span>${classPeriod(c)}${n ? ` · ${n}명` : ''}</span>` : ''}
      </a>`;
    };
    return nav + `<div class="tt-wrap card"><div class="tt" style="grid-template-columns:56px repeat(${cols.length}, minmax(150px, 1fr))">
      <div class="tt-corner"></div>
      ${cols.map(col => col.first ? `<div class="tt-room" style="grid-column:span ${col.span}">${esc(col.room)}</div>` : '').join('')}
      <div class="tt-times" style="height:${height}px">${times.map(m => `<div style="height:${PX}px" class="${m % 60 ? 'half' : ''}">${hhmm(m)}</div>`).join('')}</div>
      ${cols.map(col => `<div class="tt-col ${col.first ? 'first' : ''}" style="height:${height}px;background-size:100% ${PX * 2}px">${col.items.map(block).join('')}</div>`).join('')}
    </div></div>
    <p class="faint">점(●)은 오늘 수업이 있는 반이에요. 분홍은 국비 과정이고, 막대를 누르면 수업 상세로 가요. 같은 강의실에서 시간이 겹치는 반은 옆 칸에 나뉘어 보여요.</p>`;
  }

  function pageClass(id) {
    const c = Store.get('classes', id);
    if (!c) return `<div class="card empty">수업을 찾을 수 없어요</div>`;
    const roster = sortBy(students().filter(s => (s.classIds || []).includes(c.id)), s => s.name);
    const info = [['요일 · 시간', classTime(c)], ['기간', `${fmtFull(c.startDate)} ~ ${fmtFull(c.endDate)}`], ['강의실', c.room], ['강사', c.instructor], ['비고', c.note]].filter(x => x[1]);
    return `<a href="#/classes" class="faint" style="text-decoration:none">← 수업 목록</a>
    <div class="page-head" style="margin-top:10px"><div><h1>${esc(c.name)}</h1><p>${c.gov ? '<span class="pill blue">국비</span> ' : ''}${classEnded(c) ? '<span class="pill">종료</span>' : (c.startDate || '') > today() ? `<span class="pill amber">개강 ${dday(c.startDate)}</span>` : '<span class="pill green">진행 중</span>'}</p></div>
      <div class="row">${(() => { const nx = nextCohort(c); return nx && roster.length ? `<button class="btn" data-act="class-next" data-id="${c.id}" title="${esc(nx.name)} ${fmt(nx.startDate)} 개강">다음 기수로 연결</button>` : ''; })()}<button class="btn" data-act="class-roster-csv" data-id="${c.id}">명단 엑셀 받기</button><button class="btn primary" data-act="class-link" data-id="${c.id}">학생 연결</button>${isLead() ? `<button class="btn" data-act="class-edit" data-id="${c.id}">수업 정보 수정</button>` : ''}</div></div>
    <div class="grid g3" style="align-items:start">
      <section class="card"><div class="card-head"><h3>수업 정보</h3></div><div class="card-body"><div class="list">${info.map(([k, v]) => `<div class="li"><span class="faint" style="width:72px">${k}</span><div class="main" style="white-space:pre-wrap">${esc(v)}</div></div>`).join('')}</div></div></section>
      <section class="card span2 tbl-wrap"><div class="card-head"><h3>수강생 ${roster.length}명</h3><span class="faint">볼 수 있는 학생 기준</span></div><div class="card-body">
        ${roster.length ? `<table class="tbl"><thead><tr><th>이름</th><th>상태</th><th>담당</th><th class="hide-m">최근 상담</th><th>다음 면담</th></tr></thead><tbody>
        ${roster.map(s => { const ln = lastNote(s.id), nm = nextMeeting(s.id); return `<tr class="click" data-act="go" data-href="#/students/${s.id}"><td><b>${esc(s.name)}</b></td><td>${pill(statusOf(s.status))}</td><td style="white-space:nowrap">${esc(staffName(s.mentorId))}</td><td class="hide-m">${ln ? fmt(ln.date) : '<span class="faint">없음</span>'}</td><td>${nm ? fmt(nm.date) : '<span class="faint">-</span>'}</td></tr>`; }).join('')}
        </tbody></table>` : '<div class="empty">아직 연결된 학생이 없어요. "학생 연결"을 눌러 고르세요.</div>'}
      </div></section>
    </div>
    ${recordingsCard(c)}`;
  }
  // 회차별 줌 녹화본: 날짜마다 링크·메모를 넣으면 학생 캘린더 그 날짜에 '녹화본 보기'
  function recordingsCard(c) {
    const ss = U.sessions(c);
    const rec = c.recordings || {};
    const t = today();
    const edit = isLead();
    const filled = ss.filter(d => rec[d] && rec[d].url).length;
    if (!ss.length) return `<section class="card card-pad" style="margin-top:16px"><b>회차별 녹화본</b><p class="faint">수업 요일과 기간이 있어야 회차가 만들어져요. 수업 정보를 먼저 채워주세요.</p></section>`;
    return `<section class="card" style="margin-top:16px"><div class="card-head"><h3>회차별 녹화본 <span class="faint" style="font-weight:600">${filled}/${ss.length}</span></h3><span class="faint">링크를 넣고 저장하면 학생 캘린더의 그 날짜에 '녹화본 보기'가 생겨요${edit ? '' : ' · 입력은 팀장 이상'}</span></div>
      <div class="card-body" id="rec-form"><div id="rec-scroll" style="position:relative;max-height:440px;overflow:auto;border:1px solid var(--line-2);border-radius:10px"><table class="tbl"><thead style="position:sticky;top:0;background:var(--surface);z-index:1"><tr><th style="width:70px">회차</th><th style="width:110px">날짜</th><th>녹화본 링크</th><th style="width:220px">메모 (예: 암호)</th></tr></thead><tbody>
      ${ss.map((d, i) => { const r = rec[d] || {}; return `<tr data-rec-day="${d}" style="${d === t ? 'background:var(--brand-soft)' : d > t ? 'opacity:.65' : ''}"><td>${i + 1}/${ss.length}</td><td style="white-space:nowrap">${fmt(d)}${d === t ? ' <span class="pill green">오늘</span>' : ''}</td>
        <td><input class="in" name="url-${d}" value="${esc(r.url || '')}" placeholder="https://zoom.us/rec/..." ${edit ? '' : 'disabled'} style="height:34px"></td>
        <td><input class="in" name="note-${d}" value="${esc(r.note || '')}" ${edit ? '' : 'disabled'} style="height:34px"></td></tr>`; }).join('')}
      </tbody></table></div>
      ${edit ? `<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-act="rec-save" data-id="${c.id}">녹화본 저장</button></div>` : ''}</div></section>`;
  }
  // 수업에 학생 여러 명 한꺼번에 연결
  function linkStudents(c) {
    const list = sortBy(students().filter(s => ONGOING.includes(s.status) || (s.classIds || []).includes(c.id)), s => staffName(s.mentorId) + s.name);
    openModal(`${c.name} · 학생 연결`, list.length ? `<input class="in" placeholder="이름으로 찾기" id="link-q" style="margin-bottom:10px">
      <div id="link-list" style="max-height:360px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:4px 12px">${list.map(s => `<label class="li check" data-name="${esc(s.name)}" style="padding:8px 0"><input type="checkbox" name="sids" data-multi value="${s.id}" ${(s.classIds || []).includes(c.id) ? 'checked' : ''}><div class="main"><div class="t" style="font-weight:600">${esc(s.name)}</div><div class="s">${esc(staffName(s.mentorId))} · ${esc(statusOf(s.status).label)}</div></div></label>`).join('')}</div>` : '<div class="empty">볼 수 있는 진행 중 학생이 없어요</div>', {
      okText: '저장',
      onOpen: bg => { const q = bg.querySelector('#link-q'); if (q) q.addEventListener('input', () => { const v = q.value.trim(); bg.querySelectorAll('#link-list [data-name]').forEach(el => { el.style.display = !v || el.dataset.name.includes(v) ? '' : 'none'; }); }); },
      onOk: async root => {
        const pick = new Set(vals(root).sids || []);
        let changed = 0;
        for (const s of list) {
          const has = (s.classIds || []).includes(c.id);
          if (has === pick.has(s.id)) continue;
          s.classIds = has ? s.classIds.filter(x => x !== c.id) : (s.classIds || []).concat(c.id);
          await Store.put('students', s); changed++;
        }
        toast(changed ? `${changed}명 바꿨어요` : '바뀐 게 없어요');
        render();
      }
    });
  }

  function classForm(c) {
    const colors = [['green', '초록'], ['blue', '파랑'], ['amber', '주황'], ['violet', '보라'], ['red', '빨강'], ['gray', '회색']];
    return `<div class="form cols">
      ${field('수업 이름', input('name', c.name, 'required'), 'full')}
      ${field('요일', `<div class="chips">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="check" style="margin-right:8px"><input type="checkbox" name="days" data-multi value="${d}" ${(c.days || []).includes(d) ? 'checked' : ''}>${DAYS[d]}</label>`).join('')}</div>`, 'full')}
      ${field('시작 시간', input('start', c.start || '19:00', 'type="time"'))}
      ${field('끝 시간', input('end', c.end || '21:00', 'type="time"'))}
      ${field('개강일', input('startDate', c.startDate || today(), 'type="date"'))}
      ${field('종강일', input('endDate', c.endDate || addDays(today(), 60), 'type="date"'))}
      ${field('강의실', input('room', c.room, 'placeholder="예: A[10층]"'))}
      ${field('강사', input('instructor', c.instructor))}
      ${field('비고', input('note', c.note, 'placeholder="예: 휴강 8/17, 격주 요일"'), 'full')}
      ${field('색상', `<select class="in" name="color">${colors.map(([k, l]) => opt(k, l, c.color || 'green')).join('')}</select>`)}
      <label class="check"><input type="checkbox" name="gov" ${c.gov ? 'checked' : ''}>국비 과정</label>
      <label class="check"><input type="checkbox" name="archived" ${c.archived ? 'checked' : ''}>종료 처리 (종강일 전이라도 목록에서 숨김)</label>
    </div>`;
  }
  // ---------- 시간표 파일로 수업 한꺼번에 등록 ----------
  function classColor(c) {
    if (c.gov) return 'green';
    if (c.days.length && c.days.every(d => d === 0 || d === 6)) return 'violet';
    if (+String(c.start).split(':')[0] >= 18) return 'blue';
    return 'amber';
  }
  function openClassImport() {
    let items = [];
    const t = today();
    const existing = Store.all('classes');
    const bg = openModal('시간표 파일로 수업 등록', `
      <p class="muted" style="margin-top:0">학원 시스템에서 받은 <b>"IT대구 ○월 평일/주말 강의 시간표"</b> CSV를 그대로 올리세요. 평일·주말 두 파일을 같이 골라도 돼요.</p>
      <div class="row"><label class="btn primary">파일 고르기<input type="file" accept=".csv,text/csv" multiple id="tt-file" hidden></label><button class="btn" data-tt-template>직접 쓸 양식 받기</button></div>
      <div id="tt-preview" style="margin-top:14px"></div>`, {
      okText: '선택한 수업 등록',
      wide: true,
      onOk: async root => {
        const pick = items.filter((x, i) => root.querySelector(`[data-tt="${i}"]`)?.checked);
        if (!pick.length) { toast('등록할 수업을 골라주세요'); return false; }
        for (const c of pick) {
          await Store.put('classes', { name: c.name, days: c.days, start: c.start, end: c.end, startDate: c.startDate, endDate: c.endDate, room: c.room, instructor: c.instructor, note: [c.note, c.endGuessed ? '끝 시간 추정' : ''].filter(Boolean).join(' / '), gov: c.gov, color: classColor(c) });
        }
        await Store.log('class-import', '', `시간표 파일로 수업 ${pick.length}개 등록`);
        toast(`수업 ${pick.length}개를 등록했어요`);
        render();
      }
    });
    bg.querySelector('[data-tt-template]').onclick = e => {
      e.preventDefault(); e.stopPropagation();
      U.download('수업_등록_양식.csv', U.csv([['수업 이름', '요일', '시작', '끝', '개강일', '종강일', '강의실', '강사'], ['파이썬 기초', '월/수', '19:00', '22:00', today(), addDays(today(), 30), 'A[10층]', '홍길동'], ['정보처리기사 실기/주말', '토/일', '09:30', '13:30', today(), addDays(today(), 28), 'E[9층]', '']]));
    };
    bg.querySelector('#tt-file').addEventListener('change', async e => {
      const box = bg.querySelector('#tt-preview');
      items = [];
      const errors = [];
      for (const f of e.target.files) {
        try {
          const r = Timetable.parseTimetable(U.parseCSV(await U.readTextFile(f)));
          if (r.error) errors.push(`${f.name}: ${r.error}`); else items.push(...r.courses);
        } catch (err) { errors.push(`${f.name}: 읽지 못했어요`); }
      }
      // 같은 파일을 두 번 고른 경우 등 중복 제거
      const seen = new Set();
      items = items.filter(c => { const k = c.name + '|' + c.startDate; if (seen.has(k)) return false; seen.add(k); return true; });
      items.forEach(c => {
        c.dup = existing.some(x => x.name === c.name && (x.startDate || '') === (c.startDate || ''));
        c.ended = !!c.endDate && c.endDate < t;
        c.lack = !c.startDate || !c.endDate || !c.days.length || !c.start;
        c.on = !c.dup && !c.ended && !c.lack;
      });
      items.sort((a, b) => (a.on === b.on ? 0 : a.on ? -1 : 1) || (a.startDate || '').localeCompare(b.startDate || ''));
      const why = c => c.dup ? '<span class="pill">이미 있음</span>' : c.ended ? '<span class="pill">종강</span>' : c.lack ? '<span class="pill amber">정보 부족</span>' : (c.startDate > t ? '<span class="pill amber">개강 예정</span>' : '<span class="pill green">진행 중</span>');
      box.innerHTML = `${errors.map(x => `<p class="pill red" style="height:auto;padding:6px 10px">${esc(x)}</p>`).join('')}
        <p style="margin:0 0 8px"><b>${items.filter(c => c.on).length}개 선택</b> <span class="muted">/ 파일 속 수업 ${items.length}개 · 종강·이미 있는 수업은 빼 뒀어요</span></p>
        <div class="tbl-wrap" style="max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:10px"><table class="tbl"><thead><tr><th></th><th>수업</th><th>요일 · 시간</th><th>기간</th><th>상태</th></tr></thead><tbody>
        ${items.map((c, i) => `<tr><td><input type="checkbox" data-tt="${i}" ${c.on ? 'checked' : ''} ${c.dup ? 'disabled' : ''} style="width:18px;height:18px;accent-color:var(--brand)"></td>
          <td style="min-width:220px"><b>${esc(c.name)}</b><div class="faint">${esc(c.room || '')}${c.instructor ? ' · ' + esc(c.instructor) : ''}${c.gov ? ' · 국비' : ''}</div></td>
          <td style="white-space:nowrap">${esc(c.daysText || '-')}<div class="faint">${esc(c.start || '')}~${esc(c.end || '')}${c.endGuessed ? ' (끝 추정)' : ''}</div></td>
          <td style="white-space:nowrap">${c.startDate ? fmt(c.startDate) : '-'} ~ ${c.endDate ? fmt(c.endDate) : '-'}</td><td>${why(c)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="faint">파일에는 끝 시간이 없어서 시작 시간으로 추정했어요(오전 국비 18:00, 저녁 22:00, 주말 4시간). 등록 후 수업 정보에서 고칠 수 있어요.</p>`;
    });
  }

  function editClass(c) {
    const isNew = !c.id;
    openModal(isNew ? '수업 추가' : '수업 정보 수정', classForm(c), {
      okText: isNew ? '추가' : '저장',
      extra: isNew ? '' : `<button class="btn danger" data-act="class-del" data-id="${c.id}">삭제</button>`,
      onOk: async root => {
        const v = vals(root);
        if (!v.name) { toast('수업 이름을 넣어주세요'); return false; }
        const obj = Object.assign({}, c, v, { days: (v.days || []).map(Number) });
        await Store.put('classes', obj);
        if (isNew && ui.classFor) {
          const st = Store.get('students', ui.classFor);
          if (st) { st.classIds = Array.from(new Set((st.classIds || []).concat(obj.id))); await Store.put('students', st); }
          ui.classFor = null;
        }
        await Store.log(isNew ? 'class-create' : 'class-update', obj.id, obj.name);
        toast(isNew ? '수업을 추가했어요' : '저장했어요');
        render();
      }
    });
  }

  // ---------- 시험 ----------
  function pageExams() {
    const t = today();
    const all = sortBy(Store.all('exams'), e => e.examDate);
    // 검색: 띄어쓰기·대소문자 무시, 이름과 메모에서 찾기
    const norm = x => String(x || '').toLowerCase().replace(/\s/g, '');
    const q = norm(ui.examQ);
    const hit = e => !q || norm(e.name).includes(q) || norm(e.memo).includes(q);
    const inTab = e => ui.examPast ? examLast(e) < t : examLast(e) >= t;
    const list = all.filter(e => inTab(e) && hit(e));
    // 자격증 종류 바로가기 (이름 맨 앞 단어)
    const family = e => String(e.name).split(/[\s(]/)[0];
    const families = Array.from(new Set(all.filter(inTab).map(family))).filter(Boolean);
    const visibleIds = new Set(students().map(s => s.id));
    const step = (label, a, b) => `<div class="li"><span class="faint" style="width:64px">${label}</span><div class="main">${a ? fmt(a) : '-'}${b ? ' ~ ' + fmt(b) : ''}</div>${a && a >= t ? `<span class="pill outline">${dday(a)}</span>` : ''}</div>`;
    return `<div class="page-head"><div><h1>시험 일정</h1><p>자격증 시험과 응시 학생을 함께 관리해요</p></div>
      <div class="row">${isLead() ? '<button class="btn primary" data-act="exam-new">+ 시험 추가</button>' : ''}</div></div>
    <div class="row" style="margin-bottom:12px">
      <div class="chips" id="exam-tabs"><button class="chip ${!ui.examPast ? 'on' : ''}" data-act="exam-past" data-v="0">다가오는 시험<b>${all.filter(e => examLast(e) >= t && hit(e)).length}</b></button><button class="chip ${ui.examPast ? 'on' : ''}" data-act="exam-past" data-v="1">지난 시험<b>${all.filter(e => examLast(e) < t && hit(e)).length}</b></button></div>
      <input class="in" type="search" style="max-width:280px" placeholder="자격증 검색 (예: 네트워크관리사)" value="${esc(ui.examQ)}" data-input="exam-q">
    </div>
    <div id="exam-fams">${families.length > 1 ? `<div class="chips" style="margin-bottom:16px">${families.map(f => `<button class="chip ${q && norm(f) === q ? 'on' : ''}" data-act="exam-family" data-v="${esc(f)}">${esc(f)}</button>`).join('')}${q ? '<button class="chip" data-act="exam-family" data-v="">전체 보기</button>' : ''}</div>` : ''}
    </div>
    <div class="grid g3" id="exam-results">${list.map(e => {
      const names = (e.studentIds || []).filter(id => visibleIds.has(id)).map(id => Store.get('students', id)).filter(Boolean);
      const regOpen = e.regStart <= t && t <= e.regEnd;
      const during = e.examDate <= t && t <= examLast(e);
      return `<section class="card card-pad"><div class="row" style="justify-content:space-between"><span class="pill ${examLast(e) >= t ? 'blue' : ''}">${during ? '시험 기간' : dday(e.examDate)}</span>${regOpen ? '<span class="pill amber">접수 중</span>' : e.regStart > t ? `<span class="pill outline">접수 ${dday(e.regStart)}</span>` : ''}</div>
        <h3 style="margin:8px 0 6px;font-size:16px">${esc(e.name)}</h3>
        <div class="list">${step('접수', e.regStart, e.regEnd)}${step('시험', e.examDate, e.examEnd && e.examEnd !== e.examDate ? e.examEnd : '')}${step('발표', e.resultDate)}</div>
        ${e.memo ? `<div class="faint" style="margin-top:6px;white-space:pre-wrap">${esc(e.memo)}</div>` : ''}
        <div class="faint" style="margin-top:8px">응시 학생 ${names.length}명</div>
        <div class="chips" style="margin-top:6px">${names.map(s => `<a class="pill outline" href="#/students/${s.id}/certs" style="text-decoration:none">${esc(s.name)}</a>`).join('')}</div>
        ${isLead() ? `<div style="margin-top:12px"><button class="btn sm" data-act="exam-edit" data-id="${e.id}">수정</button></div>` : ''}
      </section>`;
    }).join('') || `<div class="card empty" style="grid-column:1/-1">${q ? `'${esc(ui.examQ)}'에 맞는 ${ui.examPast ? '지난 ' : ''}시험이 없어요` : '시험이 없어요'}</div>`}</div>
    <p class="faint" style="margin-top:16px">시험 기간이 여러 날이면 끝나는 날까지 '다가오는 시험'에 남아 있어요. 일정이 바뀌면 카드의 수정에서 고쳐주세요.</p>`;
  }
  function editExam(e) {
    const isNew = !e.id;
    const cands = sortBy(ongoing(students()), s => s.name);
    openModal(isNew ? '시험 추가' : '시험 수정', `<div class="form cols">
      ${field('시험 이름', input('name', e.name, 'placeholder="예: 정보처리기사 실기 4회"'), 'full')}
      ${field('접수 시작', input('regStart', e.regStart, 'type="date"'))}
      ${field('접수 마감', input('regEnd', e.regEnd, 'type="date"'))}
      ${field('시험일 (시작)', input('examDate', e.examDate, 'type="date" required'))}
      ${field('시험 끝나는 날 (기간이면)', input('examEnd', e.examEnd, 'type="date"'))}
      ${field('합격 발표일', input('resultDate', e.resultDate, 'type="date"'))}
      ${field('메모', input('memo', e.memo, 'placeholder="예: 추가접수 09.28, 2차 발표 12.18"'))}
      ${field('응시 학생', `<div class="chips">${cands.map(s => `<label class="check" style="margin-right:10px"><input type="checkbox" name="studentIds" data-multi value="${s.id}" ${(e.studentIds || []).includes(s.id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('') || '<span class="faint">진행 중 학생이 없어요</span>'}</div>`, 'full')}
    </div>`, {
      okText: isNew ? '추가' : '저장',
      extra: isNew ? '' : `<button class="btn danger" data-act="exam-del" data-id="${e.id}">삭제</button>`,
      onOk: async root => {
        const v = vals(root);
        if (!v.name || !v.examDate) { toast('시험 이름과 시험일을 넣어주세요'); return false; }
        if (v.examEnd && v.examEnd < v.examDate) { toast('시험 끝나는 날이 시작일보다 빨라요'); return false; }
        const keep = (e.studentIds || []).filter(id => !cands.some(s => s.id === id));
        await Store.put('exams', Object.assign({}, e, v, { studentIds: keep.concat(v.studentIds || []) }));
        toast('저장했어요');
        render();
      }
    });
  }

  // ---------- 리포트 ----------
  function pageReport() {
    const t = today();
    const months = ui.reportMonths;
    const keys = [];
    for (let i = months - 1; i >= 0; i--) { const d = U.parse(t); d.setDate(1); d.setMonth(d.getMonth() - i); keys.push(U.iso(d).slice(0, 7)); }
    const from = keys[0] + '-01';
    const list = students();
    const inRange = s => s && s.slice(0, 10) >= from;
    const created = list.filter(s => inRange(s.createdAt));
    const outcome = (s, keysArr) => (s.history || []).some(h => keysArr.includes(h.to) && inRange(h.at));
    const passes = list.reduce((n, s) => n + (s.certs || []).filter(c => c.status === '합격' && inRange(c.date)).length, 0);
    const byMonth = keys.map(k => ({ k, n: created.filter(s => s.createdAt.slice(0, 7) === k).length }));
    const max = Math.max(1, ...byMonth.map(x => x.n));
    const rows = staff().map(m => {
      const mine = list.filter(s => s.mentorId === m.id);
      const notes = Store.all('notes').filter(n => mine.some(s => s.id === n.studentId) && (n.date || '') >= from);
      return {
        m, ongoing: ongoing(mine).length, neu: mine.filter(s => inRange(s.createdAt)).length,
        pass: mine.reduce((n, s) => n + (s.certs || []).filter(c => c.status === '합격' && inRange(c.date)).length, 0),
        job: mine.filter(s => outcome(s, ['employed', 'school'])).length,
        drop: mine.filter(s => outcome(s, ['dropped'])).length,
        notes: notes.length
      };
    }).filter(r => r.ongoing || r.neu || r.job || r.pass);
    ui._reportRows = rows;
    const noteRows = staff().map(m => ({ m, n: Store.all('notes').filter(n => n.authorId === m.id && (n.date || '') >= from).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
    const noteMax = Math.max(1, ...noteRows.map(x => x.n));
    return `<div class="page-head"><div><h1>리포트</h1><p>${keys[0].replace('-', '.')} ~ ${t.slice(0, 7).replace('-', '.')} · 볼 수 있는 학생 기준</p></div>
      <div class="row"><div class="chips">${[3, 6, 12].map(n => `<button class="chip ${months === n ? 'on' : ''}" data-act="report-months" data-v="${n}">최근 ${n}개월</button>`).join('')}</div><button class="btn" data-act="report-csv">엑셀 받기</button></div></div>
    <div class="grid g4">
      <div class="card stat hl"><div class="k">신규 등록</div><div class="v">${created.length}<small>명</small></div></div>
      <div class="card stat"><div class="k">자격증 합격</div><div class="v">${passes}<small>건</small></div></div>
      <div class="card stat"><div class="k">취업 · 진학</div><div class="v">${list.filter(s => outcome(s, ['employed', 'school'])).length}<small>명</small></div></div>
      <div class="card stat"><div class="k">중도 이탈</div><div class="v">${list.filter(s => outcome(s, ['dropped'])).length}<small>명</small></div></div>
    </div>
    <div class="grid g2" style="margin-top:16px;align-items:start">
      <section class="card"><div class="card-head"><h3>월별 신규 등록</h3></div><div class="card-body"><div class="bars">${byMonth.map(x => `<div class="bar"><b>${x.n}</b><i style="height:${x.n / max * 100}%"></i><span>${Number(x.k.slice(5))}월</span></div>`).join('')}</div></div></section>
      <section class="card"><div class="card-head"><h3>직원별 상담 기록</h3><span class="faint">기간 내 작성 건수</span></div><div class="card-body">${noteRows.map(r => `<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><span>${esc(r.m.name)} <span class="faint">${esc(roleLabel(r.m))}</span></span><b>${r.n}건</b></div><div class="meter" style="margin-top:6px"><i style="width:${r.n / noteMax * 100}%"></i></div></div>`).join('') || '<div class="faint">아직 상담 기록이 없어요</div>'}</div></section>
    </div>
    <section class="card tbl-wrap" style="margin-top:16px"><div class="card-head"><h3>담당자별 성과</h3><span class="faint">상태 변경 이력 기준</span></div><div class="card-body">
      <table class="tbl"><thead><tr><th>담당</th><th class="hide-m">팀</th><th class="num">진행 중</th><th class="num">신규</th><th class="num">합격</th><th class="num">취업·진학</th><th class="num">이탈</th><th class="num">상담 기록</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.m.name)}</b> <span class="faint">${esc(roleLabel(r.m))}</span></td><td class="hide-m">${esc(teamFull(r.m.teamId))}</td><td class="num">${r.ongoing}</td><td class="num">${r.neu}</td><td class="num">${r.pass}</td><td class="num">${r.job}</td><td class="num">${r.drop}</td><td class="num">${r.notes}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  // ---------- 설정 ----------
  // ---------- 직원 로그인 계정 (원장·총괄) ----------
  function loadAccounts(force) {
    if (!isAdmin() || (ui.accounts && !force)) return;
    ui.accounts = 'loading';
    Store.staffAccount('status').then(r => {
      ui.accounts = {};
      (r.users || []).forEach(u => { ui.accounts[u.email] = u; });
    }).catch(e => { ui.accounts = { error: e.message, code: e.code }; })
      .then(() => { if ((location.hash || '').startsWith('#/settings')) render(); });
  }
  const accountReady = () => ui.accounts && typeof ui.accounts === 'object' && !ui.accounts.error;
  const accountOf = p => (accountReady() ? ui.accounts[(p.email || '').toLowerCase()] || null : undefined);
  function accountCell(p) {
    if (!ui.accounts || ui.accounts === 'loading') return '<span class="faint">확인 중…</span>';
    if (ui.accounts.error) return '<span class="faint">확인 불가</span>';
    const a = accountOf(p);
    if (!a) return p.active === false ? '<span class="faint">없음</span>' : '<span class="pill red">없음</span>';
    return a.lastSignIn ? `<span class="pill green">있음</span> <span class="faint">${fmt(a.lastSignIn)} 접속</span>` : '<span class="pill amber">있음</span> <span class="faint">접속 전</span>';
  }
  function accountBox(p) {
    if (!isAdmin()) return '';
    const a = accountOf(p);
    let body;
    if (a === undefined) body = ui.accounts && ui.accounts.error
      ? `<span class="faint">${esc(ui.accounts.error)}</span>`
      : '<span class="faint">확인 중이에요. 잠시 뒤 다시 열어주세요.</span>';
    else if (!a) body = '<span class="pill red">로그인 계정 없음</span> <button class="btn sm primary" data-acct="create">로그인 계정 만들기</button>';
    else body = `${a.lastSignIn ? `<span class="pill green">있음</span> <span class="faint">${fmt(a.lastSignIn)} 접속</span>` : '<span class="pill amber">있음 · 접속 전</span>'}
      <button class="btn sm" data-acct="reset">비밀번호 재설정</button>${p.id === me().id ? '' : '<button class="btn sm danger" data-acct="delete">계정 삭제</button>'}`;
    return `<div class="field full"><label>로그인 계정</label><div class="row">${body}</div></div>`;
  }
  // 헷갈리는 글자(0/O, 1/l/I) 없는 임시 비밀번호 (예: Kmtrqb4827)
  function genPassword() {
    const r = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
    const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghjkmnpqrstuvwxyz', D = '23456789';
    let s = U[r(U.length)];
    for (let i = 0; i < 5; i++) s += L[r(L.length)];
    for (let i = 0; i < 4; i++) s += D[r(D.length)];
    return s;
  }
  // 비밀번호: 앱 자체 규칙 없이 Supabase 기본 최소 길이(6자)만 확인
  const PW_MIN = 6;
  const pwOk = pw => String(pw || '').length >= PW_MIN;
  const pwField = (name, label) => field(label, `<div class="row" style="flex-wrap:nowrap"><input class="in" name="${name}" autocomplete="off" spellcheck="false" placeholder="6자 이상"><button class="btn" type="button" data-gen="${name}">자동 생성</button></div>`, 'full');
  function bindGen(root) {
    root.querySelectorAll('[data-gen]').forEach(b => { b.onclick = e => { e.preventDefault(); e.stopPropagation(); root.querySelector(`[name="${b.dataset.gen}"]`).value = genPassword(); }; });
  }
  // 만든 비밀번호를 한 번 보여주고 로그인 안내와 함께 복사
  function showPassword(p, pw, what) {
    const text = [`[${Store.config.ACADEMY_NAME || '학사관리'} 학사관리]`, `주소: ${ROOT}admin/`, `아이디: ${p.email}`, `임시 비밀번호: ${pw}`,
      '한/영 키가 영문인지 확인하고 입력하세요.', '로그인 후 오른쪽 위 내 이름 → 비밀번호 바꾸기에서 꼭 바꿔주세요.'].join('\n');
    openModal(`${p.name}님 · ${what}`, `<p style="margin-top:0">비밀번호는 <b>지금만</b> 보여요. 복사해서 ${esc(p.name)}님께 직접 전달하세요.</p>
      <div class="card card-pad" style="font-size:22px;font-weight:800;letter-spacing:.06em;text-align:center;font-family:ui-monospace,Consolas,monospace">${esc(pw)}</div>`, {
      extra: '<button class="btn primary" data-copy-pw>로그인 안내 복사</button>',
      onOpen: bg => { bg.querySelector('[data-copy-pw]').onclick = e => { e.stopPropagation(); copy(text).then(() => toast('로그인 안내를 복사했어요')); }; }
    });
  }
  async function accountAction(p, action) {
    if (action === 'delete') {
      if (!(await confirmBox(`${p.name}님의 로그인 계정을 삭제할까요? 직원 명단은 그대로 두고 로그인만 막아요.`, '계정 삭제'))) return;
      await Store.staffAccount('delete', { email: p.email });
      toast('로그인 계정을 삭제했어요');
      loadAccounts(true); render();
      return;
    }
    const label = action === 'create' ? '로그인 계정 만들기' : '비밀번호 재설정';
    const bg = openModal(`${p.name}님 ${label}`, `<div class="form">${field('아이디', `<input class="in" value="${esc(p.email)}" readonly>`)}${pwField('pw', action === 'create' ? '임시 비밀번호' : '새 임시 비밀번호')}</div>`, {
      okText: label,
      onOk: async root => {
        const pw = vals(root).pw;
        if (!pwOk(pw)) { toast(`비밀번호는 ${PW_MIN}자 이상으로 넣어주세요`); return false; }
        await Store.staffAccount(action, { email: p.email, password: pw });
        loadAccounts(true);
        setTimeout(() => showPassword(p, pw, action === 'create' ? '로그인 계정을 만들었어요' : '비밀번호를 바꿨어요'), 0);
      }
    });
    bindGen(bg);
    bg.querySelector('[name=pw]').value = genPassword();
  }

  function pageSettings() {
    loadAccounts();
    const m = me();
    const teams = Store.all('teams');
    const people = Store.all('staff');
    const logs = sortBy(Store.all('logs'), l => l.at).reverse().slice(0, 100);
    return `<div class="page-head"><div><h1>설정</h1><p>팀 · 직원 · 백업 · 수정 이력</p></div></div>
    <div class="grid g2" style="align-items:start">
      <section class="card"><div class="card-head"><h3>내 계정</h3></div><div class="card-body">
        <div class="row"><span class="av">${initial(m.name)}</span><div class="grow"><b>${esc(m.name)}</b><div class="faint">${esc(m.email)} · ${esc(roleLabel(m))}${m.teamId ? ' · ' + esc(teamFull(m.teamId)) : ''}</div></div></div>
        <div class="row" style="margin-top:14px"><button class="btn" data-act="staff-guide" data-id="${m.id}">사용 안내</button>${Store.live ? '<button class="btn" data-act="pw-change">비밀번호 바꾸기</button>' : ''}<button class="btn" data-act="logout">로그아웃</button></div>
        <p class="faint">보이는 범위: ${esc(U.SCOPE[m.role] || U.SCOPE.mentor)}</p>
      </div></section>
      <section class="card"><div class="card-head"><h3>팀</h3>${isAdmin() ? '<button class="btn sm" data-act="team-new">+ 팀 추가</button>' : ''}</div><div class="card-body"><div class="list">
        ${sortBy(teams, t => (t.division || '') + t.name).map(t => `<div class="li"><div class="main"><div class="t">${t.division ? `<span class="faint">${esc(t.division)}</span> ` : ''}${esc(t.name)}</div><div class="s">${people.filter(p => p.teamId === t.id && p.active !== false).map(p => esc(p.name)).join(', ') || '팀원 없음'}</div></div>${isAdmin() ? `<button class="btn ghost sm" data-act="team-edit" data-id="${t.id}">수정</button><button class="btn ghost sm danger" data-act="team-del" data-id="${t.id}">삭제</button>` : ''}</div>`).join('') || '<div class="faint">팀이 없어요</div>'}
      </div></div></section>
      <section class="card span2" style="grid-column:1/-1"><div class="card-head"><h3>직원</h3>${isAdmin() ? '<button class="btn sm primary" data-act="staff-new">+ 직원 등록</button>' : ''}</div><div class="card-body tbl-wrap">
        <table class="tbl"><thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>팀</th>${isAdmin() ? '<th>로그인 계정</th>' : ''}<th class="num">담당 학생</th><th></th></tr></thead><tbody>
        ${people.map(p => `<tr style="${p.active === false ? 'opacity:.5' : ''}"><td><b>${esc(p.name)}</b>${p.active === false ? ' <span class="pill">비활성</span>' : ''}</td><td>${esc(p.email)}</td><td>${esc(roleLabel(p))}<div class="faint">${esc(ROLES[p.role])}</div></td><td>${esc(p.teamId ? teamFull(p.teamId) : '-')}</td>${isAdmin() ? `<td style="white-space:nowrap">${accountCell(p)}</td>` : ''}<td class="num">${ongoing(students().filter(s => s.mentorId === p.id)).length}</td><td style="white-space:nowrap">${isAdmin() ? `<button class="btn ghost sm" data-act="staff-guide" data-id="${p.id}">안내 문구</button><button class="btn ghost sm" data-act="staff-edit" data-id="${p.id}">수정</button>` : ''}</td></tr>`).join('')}
        </tbody></table>
        ${isAdmin() && ui.accounts && ui.accounts.error ? `<p class="pill amber" style="height:auto;padding:6px 10px;margin-top:10px">${esc(ui.accounts.error)} ${ui.accounts.code === 'not-installed' ? 'README의 "직원 계정 관리 기능 설치"를 따라 설치하면 여기서 계정을 만들 수 있어요.' : ''}</p>` : ''}
        ${isAdmin() ? '<p class="faint">직원 줄의 "수정"을 누르면 로그인 계정 만들기 · 비밀번호 재설정 · 계정 삭제를 할 수 있어요.</p>' : ''}
      </div></section>
      <section class="card"><div class="card-head"><h3>백업</h3></div><div class="card-body">
        <p class="muted" style="margin-top:0">볼 수 있는 모든 데이터를 파일 하나로 받아요. 주 1회 받아 공용 드라이브에 보관하세요.</p>
        <p style="margin:0 0 12px">${lastBackup() ? `마지막 백업: <b>${fmtFull(lastBackup().at)}</b> · ${esc(lastBackup().by || '')} <span class="pill ${backupAge() >= 7 ? 'amber' : 'green'}">${backupAge()}일 전</span>` : '<span class="pill amber">아직 백업 기록이 없어요</span>'}</p>
        <div class="row"><button class="btn primary" data-act="backup">백업 파일 받기</button>${isAdmin() ? '<label class="btn">백업 파일 불러오기<input type="file" accept=".json" data-change="restore" hidden></label>' : ''}</div>
        ${!Store.live ? '<div style="margin-top:14px"><button class="btn danger" data-act="demo-reset">데모 데이터 처음으로 되돌리기</button></div>' : ''}
      </div></section>
      <section class="card"><div class="card-head"><h3>수정 이력</h3><span class="faint">원장·총괄만 보여요</span></div><div class="card-body">
        ${isAdmin() ? (logs.length ? `<div class="list" style="max-height:360px;overflow:auto">${logs.map(l => `<div class="li"><div class="main"><div class="t" style="font-weight:600">${esc(l.detail || l.action)}</div><div class="s">${esc(l.actorName || '')} · ${fmtFull(l.at)} ${esc((l.at || '').slice(11, 16))}</div></div></div>`).join('')}</div>` : '<div class="faint">기록이 없어요</div>') : '<div class="faint">권한이 없어요</div>'}
      </div></section>
    </div>`;
  }
  function editStaff(p) {
    const isNew = !p.id;
    openModal(isNew ? '직원 등록' : '직원 수정', `<div class="form cols">
      ${field('이름', input('name', p.name, 'required'))}
      ${field('이메일 (로그인 아이디)', input('email', p.email, 'type="email" required'))}
      ${field('권한 (보이는 범위)', `<select class="in" name="role">${Object.keys(ROLES).map(k => opt(k, ROLES[k], p.role || 'mentor')).join('')}</select>`)}
      ${field('직함 (화면 표시용)', input('title', p.title, 'placeholder="예: 경력멘토, 신인멘토, 부장"'))}
      ${field('팀', `<select class="in" name="teamId">${opt('', '팀 없음', p.teamId)}${Store.all('teams').map(t => opt(t.id, teamFull(t.id), p.teamId)).join('')}</select>`, 'full')}
      ${isNew ? '' : `<label class="check full"><input type="checkbox" name="inactive" ${p.active === false ? 'checked' : ''}>퇴사·비활성 (로그인 불가, 기록은 남음)</label>`}
      ${isNew ? pwField('pw', '임시 비밀번호 (넣으면 로그인 계정도 바로 만들어요)') : accountBox(p)}
    </div><p class="faint">멘토는 담당 학생만, 팀장은 자기 팀, 부장은 자기 사업부 전체, 원장·총괄은 모두 볼 수 있어요. 부장은 소속 팀으로 사업부가 정해져요.</p>
    ${isNew ? '' : '<p class="faint">이메일을 바꾸면 예전 이메일의 로그인 계정은 그대로 남아요. 저장한 뒤 다시 열어 새 이메일로 로그인 계정을 만들어 주세요.</p>'}`, {
      okText: isNew ? '등록' : '저장',
      extra: isNew || p.id === me().id ? '' : `<button class="btn danger" data-act="staff-del" data-id="${p.id}">삭제</button>`,
      onOpen: bg => {
        bindGen(bg);
        bg.querySelectorAll('[data-acct]').forEach(b => { b.onclick = e => { e.preventDefault(); e.stopPropagation(); bg.remove(); accountAction(p, b.dataset.acct).catch(err => toast(err.message)); }; });
      },
      onOk: async root => {
        const v = vals(root);
        v.email = (v.email || '').toLowerCase();
        if (!v.name || !/^\S+@\S+\.\S+$/.test(v.email)) { toast('이름과 이메일을 확인해주세요'); return false; }
        if (v.role !== 'admin' && !v.teamId) { toast('부장·팀장·멘토는 팀을 골라주세요'); return false; }
        if (Store.all('staff').some(x => x.id !== p.id && (x.email || '').toLowerCase() === v.email)) { toast('이미 등록된 이메일이에요'); return false; }
        // 원장·총괄이 한 명도 남지 않게 되는 변경은 막기 (직원 관리를 아무도 못 하게 됨)
        const admins = Store.all('staff').filter(x => x.role === 'admin' && x.active !== false && x.id !== p.id);
        if (p.role === 'admin' && (v.role !== 'admin' || v.inactive) && !admins.length) { toast('원장·총괄이 최소 한 명은 있어야 해요'); return false; }
        const obj = Object.assign({}, p, { name: v.name, email: v.email.toLowerCase(), role: v.role, title: v.title, teamId: v.teamId || null, active: !v.inactive });
        if (isNew && v.pw && !pwOk(v.pw)) { toast(`임시 비밀번호는 ${PW_MIN}자 이상으로 넣어주세요`); return false; }
        await Store.put('staff', obj);
        if (isNew && v.pw) {
          try { await Store.staffAccount('create', { email: obj.email, password: v.pw }); loadAccounts(true); setTimeout(() => showPassword(obj, v.pw, '로그인 계정을 만들었어요'), 0); }
          catch (err) { toast('직원은 등록했지만 로그인 계정은 못 만들었어요: ' + err.message); }
        }
        await Store.log(isNew ? 'staff-create' : 'staff-update', obj.id, `직원 ${isNew ? '등록' : '수정'}: ${obj.name} (${ROLES[obj.role]}${obj.active ? '' : ', 비활성'})`);
        // 담당 학생의 팀 정보 갱신
        for (const s of Store.all('students').filter(s => s.mentorId === obj.id)) await Store.put('students', s);
        toast('저장했어요');
        render();
      }
    });
  }

  function editTeam(t) {
    const isNew = !t.id;
    const divs = Array.from(new Set(Store.all('teams').map(x => x.division).filter(Boolean)));
    openModal(isNew ? '팀 추가' : '팀 수정', `<div class="form cols">
      ${field('사업부', input('division', t.division, `placeholder="예: 1사업부" list="div-list"`) + `<datalist id="div-list">${divs.map(d => `<option value="${esc(d)}">`).join('')}</datalist>`)}
      ${field('팀 이름', input('name', t.name, 'placeholder="예: 1-1팀"'))}
    </div><p class="faint">같은 사업부에 속한 팀은 그 사업부 부장이 모두 볼 수 있어요.</p>`, {
      okText: isNew ? '추가' : '저장',
      onOk: async root => {
        const v = vals(root);
        if (!v.name) { toast('팀 이름을 넣어주세요'); return false; }
        await Store.put('teams', Object.assign({}, t, { name: v.name, division: v.division }));
        await Store.log(isNew ? 'team-create' : 'team-update', t.id || '', `팀 ${isNew ? '추가' : '수정'}: ${v.division ? v.division + ' ' : ''}${v.name}`);
        // 팀의 사업부가 바뀌면 학생 권한 열도 다시 저장
        for (const s of Store.all('students').filter(s => s.teamId === t.id)) await Store.put('students', s);
        render();
      }
    });
  }

  // ---------- 라우터 ----------
  function render() {
    if (!me()) return renderLogin();
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
    const [p0, p1, p2] = parts;
    let active = p0 || 'home', html;
    if (!p0) html = pageHome();
    else if (p0 === 'students' && p1) html = pageStudent(p1, p2);
    else if (p0 === 'students') html = pageStudents();
    else if (p0 === 'classes' && p1) html = pageClass(p1);
    else if (p0 === 'classes') html = pageClasses();
    else if (p0 === 'exams') html = pageExams();
    else if (p0 === 'report') html = pageReport();
    else if (p0 === 'settings') html = pageSettings();
    else { active = 'home'; html = pageHome(); }
    const y = window.scrollY;
    const same = render._last === location.hash;
    app.innerHTML = shell(active, html);
    window.scrollTo(0, same ? y : 0);
    render._last = location.hash;
    // 녹화본 표: 오늘 또는 가장 최근 지난 회차가 보이게
    const box = document.getElementById('rec-scroll');
    if (box && !same) { const t = today(); const rows = [...box.querySelectorAll('[data-rec-day]')]; const row = rows.filter(r => r.dataset.recDay <= t).pop(); if (row) box.scrollTop = Math.max(0, row.offsetTop - 120); }
    const title = (NAV.find(n => n[0] === active) || [])[2];
    document.title = `${title ? title + ' · ' : ''}학사관리`;
  }

  // ---------- 동작 ----------
  const A = {
    go: el => { location.hash = el.dataset.href; },
    'demo-login': el => { Store.loginDemo(el.dataset.id); location.hash = '#/'; render(); },
    account: () => { location.hash = '#/settings'; },
    logout: async () => { await Store.logout(); location.hash = '#/'; render(); },
    'pw-change': () => openModal('비밀번호 바꾸기', `<div class="form">${field('새 비밀번호 (6자 이상)', `<input class="in" type="password" name="pw" autocomplete="new-password">`)}${field('새 비밀번호 확인', `<input class="in" type="password" name="pw2" autocomplete="new-password">`)}</div>`, {
      onOk: async root => {
        const v = vals(root);
        if (!pwOk(v.pw)) { toast(`비밀번호는 ${PW_MIN}자 이상으로 넣어주세요`); return false; }
        if (v.pw !== v.pw2) { toast('비밀번호 확인이 달라요'); return false; }
        await Store.changePassword(v.pw); toast('비밀번호를 바꿨어요');
      }
    }),
    'home-mine': () => { ui.homeMine = !ui.homeMine; render(); },
    'student-new': () => newStudent(),
    'import-open': () => openImport(),
    'import-template': () => importTemplate(),
    'staff-guide': el => {
      const p = Store.get('staff', el.dataset.id);
      const text = guideText(p);
      openModal(`${p.name}님 사용 안내`, `<p class="faint" style="margin-top:0">메신저로 보낼 안내 문구예요. 비밀번호는 넣지 않았어요.</p><textarea class="in" readonly style="min-height:240px">${esc(text)}</textarea>`, {
        extra: '<button class="btn primary" data-act="copy-guide">문구 복사</button>',
        onOpen: bg => { bg.querySelector('[data-act="copy-guide"]').onclick = e => { e.stopPropagation(); copy(text).then(() => toast('안내 문구를 복사했어요')); }; }
      });
    },
    'stu-status': el => { ui.stu.status = el.dataset.v; render(); },
    'stu-view': el => { ui.stu.view = el.dataset.v; render(); },
    'stu-csv': () => {
      const classes = Store.all('classes');
      const rows = [['이름', '연락처', '상태', '카테고리', '전공', '담당', '팀', '목표', '수업', '최근 상담', '다음 면담', '취업·진학처', '등록일']];
      newestFirst(filteredStudents()).forEach(s => {
        const ln = lastNote(s.id), nm = nextMeeting(s.id);
        rows.push([s.name, s.phone, statusOf(s.status).label, s.category, s.track, staffName(s.mentorId), teamName(s.teamId), s.goal,
          (s.classIds || []).map(id => (classes.find(c => c.id === id) || {}).name).filter(Boolean).join(' / '), ln ? ln.date : '', nm ? nm.date : '', (s.employment || {}).company || '', (s.createdAt || '').slice(0, 10)]);
      });
      U.download(`학생목록_${today()}.csv`, U.csv(rows));
    },
    'stu-save-info': async el => {
      const s = Store.get('students', el.dataset.id);
      const v = vals(document.getElementById('info-form'));
      if (!v.name) return toast('이름을 넣어주세요');
      const status = v.status;
      Object.assign(s, { name: v.name, phone: v.phone, category: v.category, track: v.track, goal: v.goal, intro: v.intro, classIds: v.classIds || [] });
      if (isLead() && v.mentorId) s.mentorId = v.mentorId;
      if (status !== s.status) await setStatus(s, status); else await Store.put('students', s);
      toast('저장했어요'); render();
    },
    'road-add': async el => {
      const s = Store.get('students', el.dataset.id);
      const inp = document.getElementById('road-new');
      if (!inp.value.trim()) return;
      s.roadmap = (s.roadmap || []).concat([{ title: inp.value.trim(), done: false }]);
      await Store.put('students', s); render();
    },
    'road-del': async el => {
      const s = Store.get('students', el.dataset.id);
      s.roadmap.splice(Number(el.dataset.i), 1);
      await Store.put('students', s); render();
    },
    'note-add': async el => {
      const v = vals(document.getElementById('note-form'));
      if (!v.body) return toast('내용을 넣어주세요');
      await Store.put('notes', { studentId: el.dataset.id, type: v.type, date: v.date || today(), body: v.body, nextDate: v.nextDate, authorId: me().id });
      toast('상담 기록을 저장했어요'); render();
    },
    'meet-add': async el => {
      const v = vals(document.getElementById('meet-form'));
      if (!v.date) return toast('날짜를 골라주세요');
      await Store.put('meetings', { studentId: el.dataset.id, date: v.date, time: v.time, topic: v.topic, done: false });
      toast('면담 일정을 추가했어요'); render();
    },
    'meet-done': async el => {
      const m = Store.get('meetings', el.dataset.id);
      m.done = true; await Store.put('meetings', m);
      toast('완료했어요. 상담 기록도 남겨주세요'); render();
    },
    del: async el => {
      if (!(await confirmBox('삭제할까요? 되돌릴 수 없어요.', '삭제'))) return;
      await Store.del(el.dataset.col, el.dataset.id);
      await Store.log('delete', el.dataset.id, `${el.dataset.col} 항목 삭제`);
      render();
    },
    'cert-add': async el => {
      const v = vals(document.getElementById('cert-form'));
      if (!v.name) return toast('자격증 이름을 넣어주세요');
      const s = Store.get('students', el.dataset.id);
      s.certs = (s.certs || []).concat([{ name: v.name, status: v.status, date: v.date }]);
      await Store.put('students', s); render();
    },
    'cert-del': async el => {
      const s = Store.get('students', el.dataset.id);
      s.certs.splice(Number(el.dataset.i), 1);
      await Store.put('students', s); render();
    },
    'task-add': async el => {
      const v = vals(document.getElementById('task-form'));
      if (!v.title) return toast('할 일을 넣어주세요');
      await Store.put('tasks', { studentId: el.dataset.id, title: v.title, due: v.due, done: false, shared: v.shared });
      render();
    },
    'job-save': async el => {
      const s = Store.get('students', el.dataset.id);
      const v = vals(document.getElementById('job-form'));
      s.employment = { company: v.company, role: v.role, startDate: v.startDate, insured: v.insured === 'y' ? true : v.insured === 'n' ? false : null, salary: v.salary, kind: v.kind, memo: v.memo };
      if (el.dataset.status) await setStatus(s, el.dataset.status); else { await Store.put('students', s); toast('저장했어요'); }
      render();
    },
    copy: el => copy(el.dataset.v),
    'token-new': async el => {
      if (!(await confirmBox('새 링크를 만들면 지금 링크는 더 이상 열리지 않아요. 계속할까요?', '새 링크 만들기'))) return;
      const s = Store.get('students', el.dataset.id);
      s.token = Store.newToken();
      await Store.put('students', s);
      await Store.log('token', s.id, `${s.name} 학생 링크 재발급`);
      toast('새 링크를 만들었어요'); render();
    },
    'stu-delete': async el => {
      const s = Store.get('students', el.dataset.id);
      if (!canDeleteStudent(s)) return toast('학생 삭제는 팀장·부장·원장만 할 수 있어요. 삭제 요청을 해주세요.');
      if (!(await confirmBox(`${s.name} 학생과 모든 기록을 삭제할까요? 되돌릴 수 없어요.${s.deleteRequest ? `\n(삭제 요청: ${s.deleteRequest.byName || ''} · ${s.deleteRequest.reason || ''})` : ''}`, '삭제'))) return;
      for (const col of ['notes', 'meetings', 'tasks']) for (const r of Store.all(col).filter(r => r.studentId === s.id)) await Store.del(col, r.id);
      for (const e of Store.all('exams').filter(e => (e.studentIds || []).includes(s.id))) { e.studentIds = e.studentIds.filter(x => x !== s.id); await Store.put('exams', e); }
      await Store.del('students', s.id);
      await Store.log('delete', s.id, `학생 삭제: ${s.name}${s.deleteRequest ? ` (요청 ${s.deleteRequest.byName || ''}, 사유: ${s.deleteRequest.reason || '-'}) 승인` : ''}`);
      toast(`${s.name} 학생을 삭제했어요`);
      if ((location.hash || '').startsWith('#/students/')) location.hash = '#/students'; else render();
    },
    'del-request': el => {
      const s = Store.get('students', el.dataset.id);
      openModal(`${s.name} 학생 삭제 요청`, `<p class="muted" style="margin-top:0">팀장·부장·원장이 승인하면 삭제돼요. 승인 전까지는 그대로 남아 있어요.</p>${field('사유', `<textarea class="in" name="reason" placeholder="예: 수강 취소, 중복 등록, 연락 두절"></textarea>`)}`, {
        okText: '요청하기',
        onOk: async root => {
          const reason = vals(root).reason;
          if (!reason) { toast('사유를 적어주세요'); return false; }
          s.deleteRequest = { by: me().id, byName: me().name, at: new Date().toISOString(), reason };
          await Store.put('students', s);
          await Store.log('delete-request', s.id, `학생 삭제 요청: ${s.name} (사유: ${reason})`);
          toast('삭제 요청을 보냈어요'); render();
        }
      });
    },
    'del-cancel': async el => {
      const s = Store.get('students', el.dataset.id);
      delete s.deleteRequest; await Store.put('students', s);
      await Store.log('delete-request', s.id, `학생 삭제 요청 취소: ${s.name}`);
      toast('삭제 요청을 취소했어요'); render();
    },
    'del-reject': async el => {
      const s = Store.get('students', el.dataset.id);
      if (!(await confirmBox(`${s.name} 학생의 삭제 요청을 반려할까요? 학생은 그대로 남아요.`, '반려'))) return;
      const req = s.deleteRequest || {};
      delete s.deleteRequest; await Store.put('students', s);
      await Store.log('delete-request', s.id, `학생 삭제 요청 반려: ${s.name} (요청 ${req.byName || ''})`);
      toast('반려했어요'); render();
    },
    'class-arch': el => { ui.classArchived = el.dataset.v === '1'; render(); },
    'class-view': el => { ui.classView = el.dataset.v; try { localStorage.setItem('haksa-class-view', ui.classView); } catch (e) {} render(); },
    'grid-kind': el => { ui.gridKind = el.dataset.v; render(); },
    'grid-month': el => {
      const v = Number(el.dataset.v);
      if (!v) ui.gridMonth = null;
      else { const [y, m] = (ui.gridMonth || today().slice(0, 7)).split('-').map(Number); const d = new Date(y, m - 1 + v, 1); ui.gridMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
      render();
    },
    'class-new': el => {
      document.querySelectorAll('.modal-bg').forEach(m => m.remove());
      if (el && el.dataset.for) ui.classFor = el.dataset.for; else ui.classFor = null;
      editClass({});
    },
    'class-import': () => openClassImport(),
    'class-edit': el => editClass(Store.get('classes', el.dataset.id)),
    'class-del': async el => {
      document.querySelectorAll('.modal-bg').forEach(m => m.remove());
      const c = Store.get('classes', el.dataset.id);
      if (!(await confirmBox(`'${c.name}' 수업을 삭제할까요? 학생들과의 연결도 풀려요. 보통은 '종료 처리'를 권해요.`, '삭제'))) return;
      for (const s of Store.all('students').filter(s => (s.classIds || []).includes(c.id))) { s.classIds = s.classIds.filter(x => x !== c.id); await Store.put('students', s); }
      await Store.del('classes', c.id);
      await Store.log('delete', c.id, `수업 삭제: ${c.name}`);
      location.hash = '#/classes';
    },
    'class-link': el => linkStudents(Store.get('classes', el.dataset.id)),
    'rec-save': async el => {
      const c = Store.get('classes', el.dataset.id);
      const v = vals(document.getElementById('rec-form'));
      const rec = {};
      const bad = [];
      U.sessions(c).forEach(d => {
        const url = (v['url-' + d] || '').trim(), note = (v['note-' + d] || '').trim();
        if (!url && !note) return;
        if (url && !/^https?:\/\/\S+$/i.test(url)) { bad.push(fmt(d)); return; }
        rec[d] = { url, note };
      });
      if (bad.length) return toast(`링크는 https:// 로 시작해야 해요: ${bad.join(', ')}`);
      const before = Object.keys(c.recordings || {}).filter(d => (c.recordings[d] || {}).url).length;
      c.recordings = rec;
      await Store.put('classes', c);
      const now = Object.values(rec).filter(r => r.url).length;
      await Store.log('recording', c.id, `녹화본 저장: ${c.name} (${before}→${now}개)`);
      toast(`녹화본 ${now}개를 저장했어요`); render();
    },
    'plan-add': async el => {
      const v = vals(document.getElementById('plan-form'));
      if (!v.name) return toast('할 일 이름을 넣어주세요');
      if (!(v.days || []).length) return toast('요일을 하나 이상 골라주세요');
      if (!v.startDate || !v.endDate || v.endDate < v.startDate) return toast('기간을 확인해주세요');
      const s = Store.get('students', el.dataset.id);
      s.plans = (s.plans || []).concat([{ id: Store.uid(), name: v.name, note: v.note, days: v.days.map(Number), startDate: v.startDate, endDate: v.endDate }]);
      await Store.put('students', s); toast('학습 계획을 추가했어요'); render();
    },
    'plan-del': async el => {
      const s = Store.get('students', el.dataset.id);
      s.plans.splice(Number(el.dataset.i), 1);
      await Store.put('students', s); render();
    },
    'cohort-move': el => { const x = (ui._cohorts || [])[Number(el.dataset.i)]; if (x) moveCohort(x.from, x.to, x.studs); },
    'class-next': el => {
      const c = Store.get('classes', el.dataset.id), nx = nextCohort(c);
      const list = ongoing(students()).filter(s => (s.classIds || []).includes(c.id) && !(s.classIds || []).includes(nx.id));
      if (!list.length) return toast(`모든 학생이 이미 ${nx.name}에 연결돼 있어요`);
      moveCohort(c, nx, list);
    },
    'class-roster-csv': el => {
      const c = Store.get('classes', el.dataset.id);
      const rows = [['이름', '연락처', '상태', '담당', '최근 상담', '다음 면담']];
      sortBy(students().filter(s => (s.classIds || []).includes(c.id)), s => s.name).forEach(s => { const ln = lastNote(s.id), nm = nextMeeting(s.id); rows.push([s.name, s.phone, statusOf(s.status).label, staffName(s.mentorId), ln ? ln.date : '', nm ? nm.date : '']); });
      U.download(`수강생명단_${c.name}_${today()}.csv`, U.csv(rows));
    },
    'exam-past': el => { ui.examPast = el.dataset.v === '1'; render(); },
    'exam-family': el => { ui.examQ = el.dataset.v; render(); },
    'exam-new': () => editExam({}),
    'exam-edit': el => editExam(Store.get('exams', el.dataset.id)),
    'exam-del': async el => {
      document.querySelectorAll('.modal-bg').forEach(m => m.remove());
      if (!(await confirmBox('이 시험을 삭제할까요?', '삭제'))) return;
      await Store.del('exams', el.dataset.id); render();
    },
    'report-months': el => { ui.reportMonths = Number(el.dataset.v); render(); },
    'report-csv': () => {
      const rows = [['담당', '권한', '팀', '진행 중', '신규', '자격증 합격', '취업·진학', '이탈', '상담 기록']];
      (ui._reportRows || []).forEach(r => rows.push([r.m.name, roleLabel(r.m), teamFull(r.m.teamId), r.ongoing, r.neu, r.pass, r.job, r.drop, r.notes]));
      U.download(`성과리포트_최근${ui.reportMonths}개월_${today()}.csv`, U.csv(rows));
    },
    'team-new': () => editTeam({}),
    'team-edit': el => editTeam(Store.get('teams', el.dataset.id)),
    'team-del': async el => {
      const t = Store.get('teams', el.dataset.id);
      if (Store.all('staff').some(p => p.teamId === t.id && p.active !== false)) return toast('팀원이 있는 팀은 삭제할 수 없어요. 먼저 팀원을 옮겨주세요.');
      if (!(await confirmBox(`'${t.name}'을 삭제할까요?`, '삭제'))) return;
      await Store.del('teams', t.id); render();
    },
    'staff-new': () => editStaff({}),
    'staff-edit': el => editStaff(Store.get('staff', el.dataset.id)),
    'staff-del': async el => {
      document.querySelectorAll('.modal-bg').forEach(m => m.remove());
      const p = Store.get('staff', el.dataset.id);
      const mine = Store.all('students').filter(s => s.mentorId === p.id);
      if (mine.length) return toast(`${p.name}님 담당 학생 ${mine.length}명을 다른 담당자로 옮긴 뒤 삭제하세요. 기록을 남기려면 '퇴사·비활성'을 쓰세요.`);
      if (p.role === 'admin' && !Store.all('staff').some(x => x.id !== p.id && x.role === 'admin' && x.active !== false)) return toast('원장·총괄이 최소 한 명은 있어야 해요');
      if (!(await confirmBox(`${p.name}님을 직원 명단에서 삭제할까요? 이 사람은 더 이상 앱에 들어올 수 없어요.`, '삭제'))) return;
      await Store.del('staff', p.id);
      await Store.log('staff-delete', p.id, `직원 삭제: ${p.name} (${p.email})`);
      try { await Store.staffAccount('delete', { email: p.email }); toast('직원과 로그인 계정을 삭제했어요'); }
      catch (err) { toast('직원은 삭제했지만 로그인 계정은 못 지웠어요: ' + err.message); }
      loadAccounts(true);
      render();
    },
    backup: async () => {
      U.download(`학사관리_백업_${today()}.json`, JSON.stringify(Store.exportAll(), null, 2), 'application/json');
      try { await Store.put('settings', { id: 'backup', at: new Date().toISOString(), by: me().name }); } catch (e) { console.warn(e); }
      toast('백업 파일을 받았어요. 공용 드라이브에 보관하세요');
      render();
    },
    'demo-reset': async () => {
      if (!(await confirmBox('데모 데이터를 처음 상태로 되돌릴까요? 이 브라우저에서 바꾼 내용이 모두 사라져요.', '되돌리기'))) return;
      Store.resetDemo(); location.hash = '#/'; location.reload();
    }
  };

  const CH = {
    'stu-cat': el => { ui.stu.cat = el.value; render(); },
    'stu-mentor': el => { ui.stu.mentor = el.value; render(); },
    'stu-set-status': async el => { await setStatus(Store.get('students', el.dataset.id), el.value); render(); },
    'road-toggle': async el => { const s = Store.get('students', el.dataset.id); s.roadmap[Number(el.dataset.i)].done = el.checked; await Store.put('students', s); render(); },
    'stu-class': async el => {
      const s = Store.get('students', el.dataset.id);
      const set = new Set(s.classIds || []);
      if (el.checked) set.add(el.value); else set.delete(el.value);
      s.classIds = Array.from(set); await Store.put('students', s); render();
    },
    'cert-status': async el => { const s = Store.get('students', el.dataset.id); const c = s.certs[Number(el.dataset.i)]; c.status = el.value; if (el.value !== '준비중' && !c.date) c.date = today(); await Store.put('students', s); render(); },
    'exam-toggle': async el => {
      const e = Store.get('exams', el.dataset.id);
      const set = new Set(e.studentIds || []);
      if (el.checked) set.add(el.dataset.sid); else set.delete(el.dataset.sid);
      e.studentIds = Array.from(set); await Store.put('exams', e); render();
    },
    'task-toggle': async el => { const k = Store.get('tasks', el.dataset.id); k.done = el.checked; await Store.put('tasks', k); render(); },
    restore: async el => {
      const f = el.files[0]; if (!f) return;
      try {
        const o = JSON.parse(await f.text());
        if (!(await confirmBox(`'${f.name}' 파일의 데이터를 불러올까요? 같은 항목은 파일 내용으로 덮어써요.`, '불러오기'))) return;
        await Store.importAll(o); await Store.log('restore', '', `백업 불러오기: ${f.name}`);
        toast('불러왔어요'); render();
      } catch (e) { toast('파일을 읽지 못했어요'); }
    }
  };

  document.addEventListener('click', e => {
    if (e.target.closest('[data-close-modal]')) document.querySelectorAll('.modal-bg').forEach(m => m.remove());
    const el = e.target.closest('[data-act]');
    if (!el || !A[el.dataset.act]) return;
    if (el.tagName === 'A' && el.dataset.act !== 'go') return;
    e.preventDefault();
    Promise.resolve(A[el.dataset.act](el, e)).catch(err => { console.error(err); toast('처리하지 못했어요: ' + (err.message || err)); });
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (!el || !CH[el.dataset.change]) return;
    Promise.resolve(CH[el.dataset.change](el, e)).catch(err => { console.error(err); toast('처리하지 못했어요: ' + (err.message || err)); });
  });
  // 검색창: 화면 전체를 다시 그리지 않고 결과 영역만 바꿈 → 한글 조합(ㅎ→하→한)이 끊기지 않음
  const SEARCH = {
    'stu-q': { set: v => { ui.stu.q = v; }, page: () => pageStudents(), ids: ['stu-count', 'stu-results'] },
    'exam-q': { set: v => { ui.examQ = v; }, page: () => pageExams(), ids: ['exam-tabs', 'exam-fams', 'exam-results'] }
  };
  document.addEventListener('input', e => {
    const p = SEARCH[e.target.dataset && e.target.dataset.input];
    if (!p) return;
    p.set(e.target.value);
    const tmp = document.createElement('div');
    tmp.innerHTML = p.page();
    p.ids.forEach(id => { const cur = document.getElementById(id), next = tmp.querySelector('#' + id); if (cur && next) cur.innerHTML = next.innerHTML; });
  });
  // 학생 등록·정보 폼의 수업 검색: 다시 그리지 않고 목록만 걸러서 체크 상태 유지
  document.addEventListener('input', e => {
    if (!e.target.hasAttribute || !e.target.hasAttribute('data-class-q')) return;
    const q = e.target.value.toLowerCase().replace(/\s/g, '');
    const box = e.target.nextElementSibling;
    if (box) box.querySelectorAll('[data-class-item]').forEach(el => { el.style.display = !q || el.dataset.classItem.includes(q) || el.querySelector('input').checked ? '' : 'none'; });
  });
  // 진행 보드 끌어 놓기
  document.addEventListener('dragstart', e => { const c = e.target.closest('[data-drag]'); if (c) e.dataTransfer.setData('text/plain', c.dataset.drag); });
  document.addEventListener('dragover', e => { const col = e.target.closest('[data-drop]'); if (col) { e.preventDefault(); col.classList.add('drop'); } });
  document.addEventListener('dragleave', e => { const col = e.target.closest('[data-drop]'); if (col) col.classList.remove('drop'); });
  document.addEventListener('drop', async e => {
    const col = e.target.closest('[data-drop]');
    if (!col) return;
    e.preventDefault();
    const s = Store.get('students', e.dataTransfer.getData('text/plain'));
    if (s) { await setStatus(s, col.dataset.drop); render(); }
  });
  window.addEventListener('hashchange', render);

  Store.init().then(r => {
    if (!r.ok) return renderLogin('관리자 명단에 없는 계정이에요. 원장님께 등록을 요청하세요.');
    render();
  }).catch(err => {
    console.error(err);
    app.innerHTML = `<div class="login-wrap"><div class="card card-pad"><b>연결 오류</b><p class="faint">${esc(err.message || err)}</p></div></div>`;
  });
})();
