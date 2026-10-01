// 대구지점 학사관리 - 관리자 화면
(function () {
  const { esc, fmt, fmtFull, today, addDays, diffDays, dday, statusOf, leadStatusOf, STATUS, ONGOING, CATEGORIES, TRACKS, ROLES, LEAD_STATUS, ATT, DAYS } = U;
  const app = document.getElementById('app');
  const ROOT = location.origin + location.pathname.replace(/admin\/.*$/, '');
  const ui = {
    homeMine: false,
    stu: { q: '', status: 'ongoing', cat: '', mentor: '', view: 'list' },
    classArchived: false,
    examPast: false,
    leadTab: 'open',
    reportMonths: 6
  };

  // ---------- 도우미 ----------
  const me = () => Store.me();
  const isAdmin = () => me() && me().role === 'admin';
  const isLead = () => me() && (me().role === 'lead' || me().role === 'admin');
  const staff = () => Store.all('staff').filter(s => s.active !== false);
  const staffName = id => (Store.get('staff', id) || {}).name || '미지정';
  const teamName = id => (Store.get('teams', id) || {}).name || '팀 없음';
  const students = () => Store.all('students');
  const ongoing = list => list.filter(s => ONGOING.includes(s.status));
  const initial = n => esc((n || '?').trim().slice(0, 1));
  const pill = st => `<span class="pill ${st.tone}">${esc(st.label)}</span>`;
  const studentLink = s => `${ROOT}?t=${encodeURIComponent(s.token)}`;
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
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
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
      const bg = openModal('확인', `<p style="margin:0">${esc(msg)}</p>`, { okText: okText || '확인', danger: true, onOk: () => { res(true); } });
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
  function attOf(sid, cid) { return Store.all('attendance').filter(a => a.studentId === sid && (!cid || a.classId === cid)); }
  function rate(list) {
    if (!list.length) return null;
    return Math.round(list.filter(a => a.state !== 'absent').length / list.length * 100);
  }
  function lastNote(sid) { return sortBy(Store.all('notes').filter(n => n.studentId === sid), n => n.date).pop() || null; }

  function alertsFor(list) {
    const t = today();
    const out = [];
    const exams = Store.all('exams');
    ongoing(list).forEach(s => {
      const att = sortBy(attOf(s.id), a => a.date);
      const last2 = att.slice(-2);
      if (last2.length === 2 && last2.every(a => a.state === 'absent')) out.push({ tone: 'red', s, title: '연속 결석', sub: `${fmt(last2[0].date)}, ${fmt(last2[1].date)} 결석` });
      const ln = lastNote(s.id);
      if (!ln) out.push({ tone: 'amber', s, title: '상담 기록 없음', sub: '첫 면담을 잡아주세요' });
      else if (diffDays(t, ln.date) > 21) out.push({ tone: 'amber', s, title: '면담 공백', sub: `마지막 기록 ${diffDays(t, ln.date)}일 전` });
      const notes = Store.all('notes').filter(n => n.studentId === s.id);
      const late = notes.find(n => n.nextDate && n.nextDate < t && !notes.some(m => m.date >= n.nextDate));
      if (late) out.push({ tone: 'amber', s, title: '후속 상담 지연', sub: `예정일 ${fmt(late.nextDate)}` });
      const overdue = Store.all('tasks').filter(k => k.studentId === s.id && !k.done && k.due && k.due < t);
      if (overdue.length) out.push({ tone: 'blue', s, title: '할 일 지연', sub: `${overdue[0].title}${overdue.length > 1 ? ` 외 ${overdue.length - 1}건` : ''}` });
      exams.filter(e => (e.studentIds || []).includes(s.id) && e.examDate >= t && diffDays(e.examDate, t) <= 14)
        .forEach(e => out.push({ tone: 'blue', s, title: `시험 임박 ${dday(e.examDate)}`, sub: e.name }));
    });
    const order = { red: 0, amber: 1, blue: 2 };
    return out.sort((a, b) => order[a.tone] - order[b.tone]);
  }

  // ---------- 화면 틀 ----------
  const NAV = [
    ['home', '#/', '오늘'],
    ['students', '#/students', '학생'],
    ['classes', '#/classes', '수업·출결'],
    ['exams', '#/exams', '시험 일정'],
    ['leads', '#/leads', '상담 문의'],
    ['report', '#/report', '리포트'],
    ['settings', '#/settings', '설정']
  ];
  function shell(active, body) {
    const m = me();
    return `${Store.live ? '' : `<div class="demo-banner"><b>데모 모드</b> · 이 브라우저에만 저장돼요. 실제 운영은 설정 파일에 Supabase 정보를 넣으면 바뀝니다.</div>`}
    <header class="topbar"><div class="topbar-in">
      <a class="brand" href="#/"><span class="brand-mark">대</span><span>학사관리<small>${esc(Store.config.ACADEMY_NAME || '')}</small></span></a>
      <nav class="nav">${NAV.map(([k, h, l]) => `<a href="${h}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <button class="user-chip" data-act="account"><span class="av">${initial(m.name)}</span><span class="hide-m">${esc(m.name)}</span></button>
    </div></header>
    <main>${body}</main>`;
  }

  // ---------- 로그인 ----------
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
        <div class="staff-pick">${Store.all('staff').map(s => `<button data-act="demo-login" data-id="${s.id}"><span class="av">${initial(s.name)}</span><span class="grow"><b>${esc(s.name)}</b><br><span class="faint">${esc(ROLES[s.role])}${s.teamId ? ' · ' + esc(teamName(s.teamId)) : ''}</span></span></button>`).join('')}</div>`;
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
      catch (err) { renderLogin(err.message === 'not-staff' ? '관리자 명단에 없는 계정이에요. 원장님께 등록을 요청하세요.' : '이메일 또는 비밀번호가 맞지 않아요.'); }
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
    const att14 = Store.all('attendance').filter(a => ids.has(a.studentId) && a.date >= addDays(t, -14));
    const r = rate(att14);
    const alerts = alertsFor(list);
    const leadsDue = Store.all('leads').filter(l => ['new', 'contacted'].includes(l.status) && l.nextDate && l.nextDate <= t);
    const h = new Date().getHours();
    const hello = h < 11 ? '좋은 아침이에요' : h < 18 ? '안녕하세요' : '오늘도 수고하셨어요';

    const classBlocks = classesToday.map(c => {
      const roster = on.filter(s => (s.classIds || []).includes(c.id));
      if (!roster.length) return '';
      const marks = roster.map(s => {
        const a = Store.all('attendance').find(x => x.studentId === s.id && x.classId === c.id && x.date === t);
        const cur = a ? a.state : '';
        return `<div class="li"><span class="av">${initial(s.name)}</span><div class="main"><a class="t" href="#/students/${s.id}" style="text-decoration:none">${esc(s.name)}</a><div class="s">${esc(staffName(s.mentorId))}</div></div>
          <div class="seg">${['present', 'late', 'absent'].map(k => `<button class="${k} ${cur === k ? 'on' : ''}" data-act="att" data-sid="${s.id}" data-cid="${c.id}" data-date="${t}" data-v="${k}">${ATT[k]}</button>`).join('')}</div></div>`;
      }).join('');
      return `<div style="margin-top:10px"><div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b><span class="faint">${esc(c.start)}~${esc(c.end)} · ${esc(c.room || '')}</span></div><div class="list">${marks}</div></div>`;
    }).join('');

    return `<div class="page-head"><div><h1>${hello}, ${esc(m.name)}님</h1><p>${fmtFull(t)} ${DAYS[U.dow(t)]}요일 · ${ui.homeMine || m.role === 'mentor' ? '내 담당 학생' : m.role === 'admin' ? '지점 전체' : esc(teamName(m.teamId)) + ' 전체'} 기준</p></div>
      <div class="row">${m.role !== 'mentor' ? `<button class="chip ${ui.homeMine ? 'on' : ''}" data-act="home-mine">내 담당만</button>` : ''}<button class="btn primary" data-act="student-new">+ 학생 추가</button></div></div>

    <div class="grid g4">
      <div class="card stat hl"><div class="k">진행 중 학생</div><div class="v">${on.length}<small>명</small></div></div>
      <div class="card stat"><div class="k">오늘 수업</div><div class="v">${classesToday.length}<small>개</small></div></div>
      <div class="card stat"><div class="k">이번 주 면담</div><div class="v">${weekMeet}<small>건</small></div></div>
      <div class="card stat"><div class="k">최근 2주 출석률</div><div class="v">${r == null ? '-' : r}<small>${r == null ? '' : '%'}</small></div></div>
    </div>

    <div class="grid g3" style="margin-top:16px;align-items:start">
      <section class="card span2"><div class="card-head"><h3>오늘 수업 · 출석 체크</h3><span class="faint">누르면 바로 저장, 한 번 더 누르면 취소</span></div>
        <div class="card-body">${classBlocks || '<div class="empty">오늘은 수업이 없어요</div>'}</div></section>
      <div class="grid">
        <section class="card"><div class="card-head"><h3>챙겨야 할 학생</h3><span class="pill ${alerts.length ? 'red' : 'green'}">${alerts.length}</span></div>
          <div class="card-body">${alerts.length ? alerts.slice(0, 8).map(a => `<a class="alert-row" href="#/students/${a.s.id}"><span class="alert-dot ${a.tone}"></span><div class="grow"><b>${esc(a.s.name)}</b> <span class="muted">· ${esc(a.title)}</span><div class="faint">${esc(a.sub)}</div></div></a>`).join('') + (alerts.length > 8 ? `<div class="faint" style="padding-top:8px">외 ${alerts.length - 8}건</div>` : '') : '<div class="empty">지금 따로 챙길 학생이 없어요</div>'}</div></section>
        <section class="card"><div class="card-head"><h3>다가오는 면담</h3><span class="faint">2주</span></div>
          <div class="card-body">${meetings.length ? `<div class="list">${meetings.map(x => { const s = Store.get('students', x.studentId); return `<a class="li" href="#/students/${x.studentId}/notes"><span class="pill outline">${fmt(x.date)}</span><div class="main"><div class="t">${esc(s ? s.name : '')}</div><div class="s">${esc(x.time || '')} ${esc(x.topic || '')}</div></div></a>`; }).join('')}</div>` : '<div class="empty">예정된 면담이 없어요</div>'}</div></section>
        ${leadsDue.length ? `<section class="card"><div class="card-head"><h3>오늘 연락할 상담 문의</h3><a class="btn sm" href="#/leads">전체</a></div><div class="card-body"><div class="list">${leadsDue.map(l => `<div class="li"><div class="main"><div class="t">${esc(l.name)}</div><div class="s">${esc(l.interest || '')} · ${esc(l.phone || '')}</div></div>${pill(leadStatusOf(l.status))}</div>`).join('')}</div></div></section>` : ''}
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
    const list = sortBy(filteredStudents(), s => s.name);
    const count = k => k === 'ongoing' ? ongoing(all).length : k === 'all' ? all.length : all.filter(s => s.status === k).length;
    const chips = [['ongoing', '진행 중'], ['all', '전체']].concat(STATUS.map(s => [s.key, s.label]))
      .map(([k, l]) => `<button class="chip ${f.status === k ? 'on' : ''}" data-act="stu-status" data-v="${k}">${l}<b>${count(k)}</b></button>`).join('');
    const classes = Store.all('classes');
    const rows = list.map(s => {
      const ln = lastNote(s.id);
      const r = rate(attOf(s.id));
      return `<tr class="click" data-act="go" data-href="#/students/${s.id}">
        <td><div class="row" style="flex-wrap:nowrap"><span class="av">${initial(s.name)}</span><div><b>${esc(s.name)}</b><div class="faint">${esc(s.goal || '목표 미입력')}</div></div></div></td>
        <td>${pill(statusOf(s.status))}</td>
        <td class="hide-m">${esc(s.category || '-')}<div class="faint">${esc(s.track || '')}</div></td>
        <td>${esc(staffName(s.mentorId))}</td>
        <td class="hide-m">${(s.classIds || []).map(id => classes.find(c => c.id === id)).filter(Boolean).map(c => `<span class="pill outline">${esc(c.name)}</span>`).join(' ') || '<span class="faint">없음</span>'}</td>
        <td class="hide-m">${ln ? fmt(ln.date) : '<span class="faint">없음</span>'}</td>
        <td class="num">${r == null ? '-' : r + '%'}</td></tr>`;
    }).join('');
    const board = `<div class="board">${STATUS.map(st => {
      const items = list.filter(s => s.status === st.key);
      return `<div class="col" data-drop="${st.key}"><h4><span>${pill(st)}</span><span class="faint">${items.length}</span></h4>
        ${items.map(s => `<a class="kcard" draggable="true" data-drag="${s.id}" href="#/students/${s.id}"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.goal || '목표 미입력')}</div><div class="s">${esc(staffName(s.mentorId))} · ${esc(s.category || '')}</div></a>`).join('') || '<div class="faint" style="padding:8px">비어 있어요</div>'}</div>`;
    }).join('')}</div><p class="faint">카드를 다른 칸으로 끌어 놓으면 상태가 바뀌고 이력이 남아요.</p>`;

    return `<div class="page-head"><div><h1>학생</h1><p>${list.length}명 표시 · 볼 수 있는 학생 ${all.length}명</p></div>
      <div class="row"><div class="seg"><button class="${f.view === 'list' ? 'on present' : ''}" data-act="stu-view" data-v="list">목록</button><button class="${f.view === 'board' ? 'on present' : ''}" data-act="stu-view" data-v="board">진행 보드</button></div>
      <button class="btn" data-act="stu-csv">엑셀 받기</button><button class="btn" data-act="import-open">엑셀로 등록</button><button class="btn primary" data-act="student-new">+ 학생 추가</button></div></div>
    <div class="chips" style="margin-bottom:12px">${chips}</div>
    <div class="row" style="margin-bottom:16px">
      <input class="in" style="max-width:280px" placeholder="이름 · 목표 · 연락처 검색" value="${esc(f.q)}" data-input="stu-q">
      <select class="in" style="max-width:180px" data-change="stu-cat">${opt('', '카테고리 전체', f.cat)}${CATEGORIES.map(c => opt(c, c, f.cat)).join('')}</select>
      ${me().role !== 'mentor' ? `<select class="in" style="max-width:180px" data-change="stu-mentor">${opt('', '담당 전체', f.mentor)}${staff().map(s => opt(s.id, s.name, f.mentor)).join('')}</select>` : ''}
    </div>
    ${f.view === 'board' ? board : `<div class="card tbl-wrap">${list.length ? `<table class="tbl"><thead><tr><th>이름</th><th>상태</th><th class="hide-m">카테고리</th><th>담당</th><th class="hide-m">수업</th><th class="hide-m">최근 상담</th><th class="num">출석률</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">조건에 맞는 학생이 없어요</div>`}</div>`}`;
  }

  function studentForm(s) {
    const canMentor = isLead();
    const classes = Store.all('classes').filter(c => !c.archived);
    return `<div class="form cols">
      ${field('이름', input('name', s.name, 'required'))}
      ${field('연락처', input('phone', s.phone, 'inputmode="tel" placeholder="010-0000-0000"'))}
      ${field('카테고리', `<select class="in" name="category">${opt('', '선택', s.category)}${CATEGORIES.map(c => opt(c, c, s.category)).join('')}</select>`)}
      ${field('전공 여부', `<select class="in" name="track">${TRACKS.map(c => opt(c, c, s.track)).join('')}</select>`)}
      ${field('담당', `<select class="in" name="mentorId" ${canMentor ? '' : 'disabled'}>${staff().map(x => opt(x.id, `${x.name} (${ROLES[x.role]})`, s.mentorId || me().id)).join('')}</select>`)}
      ${field('상태', `<select class="in" name="status">${STATUS.map(x => opt(x.key, x.label, s.status || 'active')).join('')}</select>`)}
      ${field('한 줄 목표', input('goal', s.goal, 'placeholder="예: 정보처리기사 → 공기업 전산직"'), 'full')}
      ${classes.length ? field('수강 수업', `<div class="chips">${classes.map(c => `<label class="check" style="margin-right:10px"><input type="checkbox" name="classIds" data-multi value="${c.id}" ${(s.classIds || []).includes(c.id) ? 'checked' : ''}>${esc(c.name)}</label>`).join('')}</div>`, 'full') : ''}
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
        const allowed = p => p && (isAdmin() || (me().role === 'lead' && p.teamId === me().teamId) || p.id === me().id);
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
    const scope = p.role === 'admin' ? '지점 전체 학생과 직원 관리' : p.role === 'lead' ? '우리 팀 학생 전체' : '내 담당 학생';
    return [`[${Store.config.ACADEMY_NAME || '학사관리'} 학사관리 사용 안내]`, '',
      `1. 주소: ${ROOT}admin/`,
      `2. 아이디: ${p.email}`,
      '3. 임시 비밀번호는 원장님이 따로 알려드려요.',
      '4. 처음 로그인하면 오른쪽 위 내 이름 → 비밀번호 바꾸기에서 새 비밀번호로 바꿔주세요.',
      `5. ${p.name}님은 ${scope}이(가) 보여요.`,
      '6. 매일: 오늘 화면에서 출석 체크 → 챙겨야 할 학생 확인 → 상담 후 기록 남기기',
      "7. 휴대폰에서 주소를 열고 '홈 화면에 추가'하면 앱처럼 쓸 수 있어요."].join('\n');
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
  const STU_TABS = [['info', '기본 · 로드맵'], ['class', '수업 · 출결'], ['notes', '상담 · 면담'], ['certs', '자격증 · 할 일'], ['job', '취업 · 진학'], ['link', '학생 링크']];
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
    const recent = sortBy(attOf(s.id), a => a.date).reverse().slice(0, 12);
    return `<div class="grid g2" style="align-items:start">
      <section class="card"><div class="card-head"><h3>수강 수업</h3></div><div class="card-body">
        <div class="list">${classes.filter(c => !c.archived || (s.classIds || []).includes(c.id)).map(c => `<label class="li check"><input type="checkbox" data-change="stu-class" data-id="${s.id}" value="${c.id}" ${(s.classIds || []).includes(c.id) ? 'checked' : ''}><div class="main"><div class="t">${esc(c.name)}${c.archived ? ' <span class="pill">종료</span>' : ''}</div><div class="s">${(c.days || []).map(d => DAYS[d]).join('·')} ${esc(c.start)}~${esc(c.end)}</div></div></label>`).join('')}</div>
      </div></section>
      <section class="card"><div class="card-head"><h3>출결 요약</h3></div><div class="card-body">
        ${mine.length ? mine.map(c => {
          const a = attOf(s.id, c.id); const r = rate(a);
          const n = k => a.filter(x => x.state === k).length;
          return `<div style="margin-bottom:14px"><div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b><span>${r == null ? '-' : r + '%'}</span></div>
            <div class="meter" style="margin:6px 0"><i style="width:${r || 0}%"></i></div><div class="faint">출석 ${n('present')} · 지각 ${n('late')} · 결석 ${n('absent')}</div></div>`;
        }).join('') : '<div class="faint">수강 중인 수업이 없어요</div>'}
        <h4 style="margin:16px 0 4px;font-size:14px">최근 기록</h4>
        <div class="list">${recent.map(a => `<div class="li"><span class="pill ${a.state === 'present' ? 'green' : a.state === 'late' ? 'amber' : 'red'}">${ATT[a.state]}</span><div class="main"><div class="s">${fmt(a.date)} · ${esc((classes.find(c => c.id === a.classId) || {}).name || '')}</div></div></div>`).join('') || '<div class="faint">기록이 없어요</div>'}</div>
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
    const exams = sortBy(Store.all('exams').filter(e => e.examDate >= t || (e.studentIds || []).includes(s.id)), e => e.examDate);
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
      ${isLead() ? `<section class="card"><div class="card-head"><h3>학생 삭제</h3></div><div class="card-body"><p class="muted" style="margin-top:0">학생과 상담 기록 · 출결 · 할 일이 모두 지워지고 되돌릴 수 없어요. 먼저 백업을 받아두세요.</p><button class="btn danger" data-act="stu-delete" data-id="${s.id}">이 학생 삭제</button></div></section>` : ''}
    </div>`;
  }

  // ---------- 수업 ----------
  function pageClasses() {
    const t = today();
    const all = Store.all('classes');
    const list = sortBy(all.filter(c => !!c.archived === ui.classArchived), c => (U.classOn(c, t) ? '0' : '1') + c.name);
    const studs = students();
    return `<div class="page-head"><div><h1>수업 · 출결</h1><p>반별 학생과 출결을 보고, 출결표를 엑셀로 받을 수 있어요</p></div>
      <div class="row">${isLead() ? '<button class="btn primary" data-act="class-new">+ 수업 추가</button>' : ''}</div></div>
    <div class="chips" style="margin-bottom:16px"><button class="chip ${!ui.classArchived ? 'on' : ''}" data-act="class-arch" data-v="0">진행 중<b>${all.filter(c => !c.archived).length}</b></button><button class="chip ${ui.classArchived ? 'on' : ''}" data-act="class-arch" data-v="1">종료<b>${all.filter(c => c.archived).length}</b></button></div>
    <div class="grid g3">${list.map(c => {
      const n = studs.filter(s => (s.classIds || []).includes(c.id) && ONGOING.includes(s.status)).length;
      const on = U.classOn(c, t);
      return `<a class="card class-card ${esc(c.color || 'gray')}" href="#/classes/${c.id}">
        <div class="row">${on ? '<span class="pill accent" style="background:var(--accent);color:#fff">오늘 수업</span>' : ''}${c.gov ? '<span class="pill blue">국비</span>' : ''}${c.archived ? '<span class="pill">종료</span>' : ''}</div>
        <h3>${esc(c.name)}</h3>
        <div class="faint">${(c.days || []).map(d => DAYS[d]).join('·')} · ${esc(c.start)}~${esc(c.end)} · ${esc(c.room || '')}</div>
        <div class="faint">${fmt(c.startDate)} ~ ${fmt(c.endDate)}</div>
        <div style="margin-top:8px;font-weight:700">학생 ${n}명</div></a>`;
    }).join('') || '<div class="card empty">수업이 없어요</div>'}</div>`;
  }

  function sessionDates(c, upTo) {
    const out = [];
    const end = c.endDate && c.endDate < upTo ? c.endDate : upTo;
    let d = c.startDate || addDays(end, -60);
    if (diffDays(end, d) > 366) d = addDays(end, -366);
    for (; d <= end; d = addDays(d, 1)) if ((c.days || []).includes(U.dow(d))) out.push(d);
    return out;
  }
  function pageClass(id) {
    const c = Store.get('classes', id);
    if (!c) return `<div class="card empty">수업을 찾을 수 없어요</div>`;
    const t = today();
    const roster = sortBy(students().filter(s => (s.classIds || []).includes(c.id)), s => s.name);
    const dates = sessionDates(c, t).slice(-10);
    const attAll = Store.all('attendance').filter(a => a.classId === c.id);
    const cell = (s, d) => { const a = attAll.find(x => x.studentId === s.id && x.date === d); return a ? a.state : ''; };
    const sym = { present: '○', late: '△', absent: '✕', '': '·' };
    return `<a href="#/classes" class="faint" style="text-decoration:none">← 수업 목록</a>
    <div class="page-head" style="margin-top:10px"><div><h1>${esc(c.name)}</h1><p>${(c.days || []).map(d => DAYS[d]).join('·')} ${esc(c.start)}~${esc(c.end)} · ${esc(c.room || '')} · ${fmtFull(c.startDate)} ~ ${fmtFull(c.endDate)}${c.gov ? ' · 국비 과정' : ''}</p></div>
      <div class="row">${isLead() ? `<button class="btn" data-act="class-edit" data-id="${c.id}">수업 정보 수정</button>` : ''}</div></div>
    <section class="card"><div class="card-head"><h3>최근 출결 (${dates.length}회)</h3><span class="faint">칸을 누르면 출석 → 지각 → 결석 → 비움 순서로 바뀌어요</span></div>
      <div class="card-body tbl-wrap">${roster.length && dates.length ? `<table class="tbl att-grid"><thead><tr><th>학생</th>${dates.map(d => `<th style="text-align:center">${fmt(d).replace(/\(.\)/, '')}<br><span style="font-weight:500">${DAYS[U.dow(d)]}</span></th>`).join('')}<th class="num">출석률</th></tr></thead><tbody>
        ${roster.map(s => { const r = rate(attAll.filter(a => a.studentId === s.id)); return `<tr><td style="white-space:nowrap"><a href="#/students/${s.id}/class">${esc(s.name)}</a>${ONGOING.includes(s.status) ? '' : ` <span class="pill">${esc(statusOf(s.status).label)}</span>`}</td>${dates.map(d => { const v = cell(s, d); return `<td class="cell ${v}" data-act="att-cycle" data-sid="${s.id}" data-cid="${c.id}" data-date="${d}" title="${v ? ATT[v] : '기록 없음'}">${sym[v]}</td>`; }).join('')}<td class="num">${r == null ? '-' : r + '%'}</td></tr>`; }).join('')}
      </tbody></table>` : '<div class="empty">학생이나 수업 날짜가 아직 없어요</div>'}</div></section>
    <section class="card" style="margin-top:16px"><div class="card-head"><h3>출결표 엑셀로 받기</h3><span class="faint">국비 과정 출결(HRD-Net) 대조용</span></div>
      <div class="card-body"><div class="row" id="att-export">${input('from', c.startDate || addDays(t, -30), 'type="date" style="width:auto"')}<span>~</span>${input('to', t, 'type="date" style="width:auto"')}<button class="btn primary" data-act="att-export" data-id="${c.id}">출결표 받기 (CSV)</button></div>
      <p class="faint">학생별 날짜 출결과 출석·지각·결석 합계, 출석률이 들어가요. 엑셀에서 바로 열려요.</p></div></section>`;
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
      ${field('강의실', input('room', c.room, 'placeholder="예: 501호"'))}
      ${field('색상', `<select class="in" name="color">${colors.map(([k, l]) => opt(k, l, c.color || 'green')).join('')}</select>`)}
      <label class="check"><input type="checkbox" name="gov" ${c.gov ? 'checked' : ''}>국비 과정</label>
      <label class="check"><input type="checkbox" name="archived" ${c.archived ? 'checked' : ''}>종료된 수업 (목록에서 숨김)</label>
    </div>`;
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
    const list = all.filter(e => ui.examPast ? e.examDate < t : e.examDate >= t);
    const visibleIds = new Set(students().map(s => s.id));
    const step = (label, a, b) => `<div class="li"><span class="faint" style="width:64px">${label}</span><div class="main">${a ? fmt(a) : '-'}${b ? ' ~ ' + fmt(b) : ''}</div>${a && a >= t ? `<span class="pill outline">${dday(a)}</span>` : ''}</div>`;
    return `<div class="page-head"><div><h1>시험 일정</h1><p>자격증 시험과 응시 학생을 함께 관리해요</p></div>
      <div class="row">${isLead() ? '<button class="btn primary" data-act="exam-new">+ 시험 추가</button>' : ''}</div></div>
    <div class="chips" style="margin-bottom:16px"><button class="chip ${!ui.examPast ? 'on' : ''}" data-act="exam-past" data-v="0">다가오는 시험</button><button class="chip ${ui.examPast ? 'on' : ''}" data-act="exam-past" data-v="1">지난 시험</button></div>
    <div class="grid g3">${list.map(e => {
      const names = (e.studentIds || []).filter(id => visibleIds.has(id)).map(id => Store.get('students', id)).filter(Boolean);
      const regOpen = e.regStart <= t && t <= e.regEnd;
      return `<section class="card card-pad"><div class="row" style="justify-content:space-between"><span class="pill ${e.examDate >= t ? 'blue' : ''}">${dday(e.examDate)}</span>${regOpen ? '<span class="pill amber">접수 중</span>' : ''}</div>
        <h3 style="margin:8px 0 6px;font-size:16px">${esc(e.name)}</h3>
        <div class="list">${step('접수', e.regStart, e.regEnd)}${step('시험', e.examDate)}${step('발표', e.resultDate)}</div>
        <div class="faint" style="margin-top:8px">응시 학생 ${names.length}명</div>
        <div class="chips" style="margin-top:6px">${names.map(s => `<a class="pill outline" href="#/students/${s.id}/certs" style="text-decoration:none">${esc(s.name)}</a>`).join('')}</div>
        ${isLead() ? `<div style="margin-top:12px"><button class="btn sm" data-act="exam-edit" data-id="${e.id}">수정</button></div>` : ''}
      </section>`;
    }).join('') || '<div class="card empty">시험이 없어요</div>'}</div>
    <p class="faint" style="margin-top:16px">처음 들어 있는 시험 일정은 예시예요. Q-Net, 데이터자격검정 사이트에서 실제 일정을 확인해 고쳐주세요.</p>`;
  }
  function editExam(e) {
    const isNew = !e.id;
    const cands = sortBy(ongoing(students()), s => s.name);
    openModal(isNew ? '시험 추가' : '시험 수정', `<div class="form cols">
      ${field('시험 이름', input('name', e.name, 'placeholder="예: 정보처리기사 실기 4회"'), 'full')}
      ${field('접수 시작', input('regStart', e.regStart, 'type="date"'))}
      ${field('접수 마감', input('regEnd', e.regEnd, 'type="date"'))}
      ${field('시험일', input('examDate', e.examDate, 'type="date" required'))}
      ${field('발표일', input('resultDate', e.resultDate, 'type="date"'))}
      ${field('응시 학생', `<div class="chips">${cands.map(s => `<label class="check" style="margin-right:10px"><input type="checkbox" name="studentIds" data-multi value="${s.id}" ${(e.studentIds || []).includes(s.id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('') || '<span class="faint">진행 중 학생이 없어요</span>'}</div>`, 'full')}
    </div>`, {
      okText: isNew ? '추가' : '저장',
      extra: isNew ? '' : `<button class="btn danger" data-act="exam-del" data-id="${e.id}">삭제</button>`,
      onOk: async root => {
        const v = vals(root);
        if (!v.name || !v.examDate) { toast('시험 이름과 시험일을 넣어주세요'); return false; }
        const keep = (e.studentIds || []).filter(id => !cands.some(s => s.id === id));
        await Store.put('exams', Object.assign({}, e, v, { studentIds: keep.concat(v.studentIds || []) }));
        toast('저장했어요');
        render();
      }
    });
  }

  // ---------- 상담 문의 ----------
  function pageLeads() {
    const t = today();
    const all = sortBy(Store.all('leads'), l => l.createdAt || '').reverse();
    const month = t.slice(0, 7);
    const thisMonth = all.filter(l => (l.createdAt || '').slice(0, 7) === month);
    const reg = thisMonth.filter(l => l.status === 'registered').length;
    const due = all.filter(l => ['new', 'contacted'].includes(l.status) && l.nextDate && l.nextDate <= t).length;
    const tabs = [['open', '진행 중', l => ['new', 'contacted'].includes(l.status)], ['registered', '등록', l => l.status === 'registered'], ['closed', '보류·종료', l => l.status === 'closed'], ['all', '전체', () => true]];
    const cur = tabs.find(x => x[0] === ui.leadTab) || tabs[0];
    const list = all.filter(cur[2]);
    return `<div class="page-head"><div><h1>상담 문의</h1><p>등록 전 문의를 관리하고, 등록하면 학생으로 바로 옮겨요</p></div>
      <div class="row"><button class="btn" data-act="copy" data-v="${esc(ROOT + 'apply.html')}">신청 폼 링크 복사</button><button class="btn primary" data-act="lead-new">+ 문의 추가</button></div></div>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><div class="k">이번 달 문의</div><div class="v">${thisMonth.length}<small>건</small></div></div>
      <div class="card stat"><div class="k">이번 달 등록</div><div class="v">${reg}<small>건</small></div></div>
      <div class="card stat"><div class="k">등록 전환율</div><div class="v">${thisMonth.length ? Math.round(reg / thisMonth.length * 100) : 0}<small>%</small></div></div>
      <div class="card stat ${due ? 'hl' : ''}"><div class="k">오늘까지 연락</div><div class="v">${due}<small>건</small></div></div>
    </div>
    <div class="chips" style="margin-bottom:12px">${tabs.map(([k, l, f]) => `<button class="chip ${ui.leadTab === k ? 'on' : ''}" data-act="lead-tab" data-v="${k}">${l}<b>${all.filter(f).length}</b></button>`).join('')}</div>
    <div class="card tbl-wrap">${list.length ? `<table class="tbl"><thead><tr><th>이름</th><th>관심 과정</th><th class="hide-m">경로</th><th>상태</th><th>다음 연락</th><th class="hide-m">메모</th><th></th></tr></thead><tbody>
      ${list.map(l => `<tr><td><b>${esc(l.name)}</b><div class="faint">${esc(l.phone || '')}</div></td><td>${esc(l.interest || '')}</td><td class="hide-m">${esc(l.source || '')}</td>
        <td><select class="in" style="width:auto;height:32px" data-change="lead-status" data-id="${l.id}">${LEAD_STATUS.map(x => opt(x.key, x.label, l.status)).join('')}</select></td>
        <td>${l.nextDate ? `<span class="pill ${l.nextDate <= t && ['new', 'contacted'].includes(l.status) ? 'red' : 'outline'}">${fmt(l.nextDate)}</span>` : '<span class="faint">-</span>'}</td>
        <td class="hide-m" style="max-width:240px">${esc(l.memo || '')}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-act="lead-edit" data-id="${l.id}">수정</button>${l.status !== 'registered' ? ` <button class="btn sm primary" data-act="lead-convert" data-id="${l.id}">등록 전환</button>` : ''}</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">이 상태의 문의가 없어요</div>'}</div>
    <p class="faint" style="margin-top:12px">신청 폼 링크를 홈페이지·인스타그램에 걸어두면 들어온 신청이 여기에 '신규'로 쌓여요.</p>`;
  }
  function editLead(l) {
    const isNew = !l.id;
    openModal(isNew ? '문의 추가' : '문의 수정', `<div class="form cols">
      ${field('이름', input('name', l.name, 'required'))}
      ${field('연락처', input('phone', l.phone, 'inputmode="tel"'))}
      ${field('관심 과정', input('interest', l.interest))}
      ${field('경로', `<select class="in" name="source">${['', '전화', '방문', '홈페이지', '온라인 신청', '인스타그램', '블로그', '지인 소개', '기타'].map(x => opt(x, x || '선택', l.source)).join('')}</select>`)}
      ${field('상태', `<select class="in" name="status">${LEAD_STATUS.map(x => opt(x.key, x.label, l.status || 'new')).join('')}</select>`)}
      ${field('다음 연락일', input('nextDate', l.nextDate || today(), 'type="date"'))}
      ${field('메모', `<textarea class="in" name="memo">${esc(l.memo || '')}</textarea>`, 'full')}
    </div>`, {
      okText: isNew ? '추가' : '저장',
      extra: isNew ? '' : `<button class="btn danger" data-act="lead-del" data-id="${l.id}">삭제</button>`,
      onOk: async root => {
        const v = vals(root);
        if (!v.name) { toast('이름을 넣어주세요'); return false; }
        await Store.put('leads', Object.assign({ createdAt: new Date().toISOString() }, l, v));
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
      const att = Store.all('attendance').filter(a => mine.some(s => s.id === a.studentId) && a.date >= from);
      return {
        m, ongoing: ongoing(mine).length, neu: mine.filter(s => inRange(s.createdAt)).length,
        pass: mine.reduce((n, s) => n + (s.certs || []).filter(c => c.status === '합격' && inRange(c.date)).length, 0),
        job: mine.filter(s => outcome(s, ['employed', 'school'])).length,
        drop: mine.filter(s => outcome(s, ['dropped'])).length,
        rate: rate(att)
      };
    }).filter(r => r.ongoing || r.neu || r.job || r.pass);
    ui._reportRows = rows;
    const classRows = Store.all('classes').filter(c => !c.archived).map(c => {
      const a = Store.all('attendance').filter(x => x.classId === c.id && x.date >= from);
      return { c, n: list.filter(s => (s.classIds || []).includes(c.id) && ONGOING.includes(s.status)).length, rate: rate(a) };
    });
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
      <section class="card"><div class="card-head"><h3>수업별 출석률</h3></div><div class="card-body">${classRows.map(r => `<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><span>${esc(r.c.name)} <span class="faint">${r.n}명</span></span><b>${r.rate == null ? '-' : r.rate + '%'}</b></div><div class="meter" style="margin-top:6px"><i style="width:${r.rate || 0}%;${r.rate != null && r.rate < 80 ? 'background:var(--red)' : ''}"></i></div></div>`).join('') || '<div class="faint">진행 중인 수업이 없어요</div>'}</div></section>
    </div>
    <section class="card tbl-wrap" style="margin-top:16px"><div class="card-head"><h3>담당자별 성과</h3><span class="faint">상태 변경 이력 기준</span></div><div class="card-body">
      <table class="tbl"><thead><tr><th>담당</th><th class="hide-m">팀</th><th class="num">진행 중</th><th class="num">신규</th><th class="num">합격</th><th class="num">취업·진학</th><th class="num">이탈</th><th class="num">출석률</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.m.name)}</b> <span class="faint">${esc(ROLES[r.m.role])}</span></td><td class="hide-m">${esc(teamName(r.m.teamId))}</td><td class="num">${r.ongoing}</td><td class="num">${r.neu}</td><td class="num">${r.pass}</td><td class="num">${r.job}</td><td class="num">${r.drop}</td><td class="num">${r.rate == null ? '-' : r.rate + '%'}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  // ---------- 설정 ----------
  function pageSettings() {
    const m = me();
    const teams = Store.all('teams');
    const people = Store.all('staff');
    const logs = sortBy(Store.all('logs'), l => l.at).reverse().slice(0, 100);
    return `<div class="page-head"><div><h1>설정</h1><p>팀 · 직원 · 백업 · 수정 이력</p></div></div>
    <div class="grid g2" style="align-items:start">
      <section class="card"><div class="card-head"><h3>내 계정</h3></div><div class="card-body">
        <div class="row"><span class="av">${initial(m.name)}</span><div class="grow"><b>${esc(m.name)}</b><div class="faint">${esc(m.email)} · ${esc(ROLES[m.role])}${m.teamId ? ' · ' + esc(teamName(m.teamId)) : ''}</div></div></div>
        <div class="row" style="margin-top:14px"><button class="btn" data-act="staff-guide" data-id="${m.id}">사용 안내</button>${Store.live ? '<button class="btn" data-act="pw-change">비밀번호 바꾸기</button>' : ''}<button class="btn" data-act="logout">로그아웃</button></div>
        <p class="faint">보이는 범위: ${m.role === 'admin' ? '지점 전체 학생, 직원 관리' : m.role === 'lead' ? '우리 팀 학생 전체' : '내 담당 학생만'}</p>
      </div></section>
      <section class="card"><div class="card-head"><h3>팀</h3>${isAdmin() ? '<button class="btn sm" data-act="team-new">+ 팀 추가</button>' : ''}</div><div class="card-body"><div class="list">
        ${teams.map(t => `<div class="li"><div class="main"><div class="t">${esc(t.name)}</div><div class="s">${people.filter(p => p.teamId === t.id && p.active !== false).map(p => esc(p.name)).join(', ') || '팀원 없음'}</div></div>${isAdmin() ? `<button class="btn ghost sm" data-act="team-edit" data-id="${t.id}">이름 변경</button><button class="btn ghost sm danger" data-act="team-del" data-id="${t.id}">삭제</button>` : ''}</div>`).join('') || '<div class="faint">팀이 없어요</div>'}
      </div></div></section>
      <section class="card span2" style="grid-column:1/-1"><div class="card-head"><h3>직원</h3>${isAdmin() ? '<button class="btn sm primary" data-act="staff-new">+ 직원 등록</button>' : ''}</div><div class="card-body tbl-wrap">
        <table class="tbl"><thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>팀</th><th class="num">담당 학생</th><th></th></tr></thead><tbody>
        ${people.map(p => `<tr style="${p.active === false ? 'opacity:.5' : ''}"><td><b>${esc(p.name)}</b>${p.active === false ? ' <span class="pill">비활성</span>' : ''}</td><td>${esc(p.email)}</td><td>${esc(ROLES[p.role])}</td><td>${esc(p.teamId ? teamName(p.teamId) : '-')}</td><td class="num">${ongoing(students().filter(s => s.mentorId === p.id)).length}</td><td style="white-space:nowrap">${isAdmin() ? `<button class="btn ghost sm" data-act="staff-guide" data-id="${p.id}">안내 문구</button><button class="btn ghost sm" data-act="staff-edit" data-id="${p.id}">수정</button>` : ''}</td></tr>`).join('')}
        </tbody></table>
        ${Store.live && isAdmin() ? '<p class="faint">직원을 등록한 뒤, Supabase 관리 화면(Authentication → Users)에서 같은 이메일로 로그인 계정을 만들어 주세요.</p>' : ''}
      </div></section>
      <section class="card"><div class="card-head"><h3>백업</h3></div><div class="card-body">
        <p class="muted" style="margin-top:0">볼 수 있는 모든 데이터를 파일 하나로 받아요. 주 1회 받아 공용 드라이브에 보관하세요.</p>
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
      ${field('권한', `<select class="in" name="role">${Object.keys(ROLES).map(k => opt(k, ROLES[k], p.role || 'mentor')).join('')}</select>`)}
      ${field('팀', `<select class="in" name="teamId">${opt('', '팀 없음', p.teamId)}${Store.all('teams').map(t => opt(t.id, t.name, p.teamId)).join('')}</select>`)}
      ${isNew ? '' : `<label class="check full"><input type="checkbox" name="inactive" ${p.active === false ? 'checked' : ''}>퇴사·비활성 (로그인 불가, 기록은 남음)</label>`}
    </div><p class="faint">멘토는 담당 학생만, 팀장은 자기 팀 학생 전체, 원장·총괄은 모두 볼 수 있어요.</p>`, {
      okText: isNew ? '등록' : '저장',
      onOk: async root => {
        const v = vals(root);
        if (!v.name || !/^\S+@\S+\.\S+$/.test(v.email)) { toast('이름과 이메일을 확인해주세요'); return false; }
        if ((v.role === 'lead' || v.role === 'mentor') && !v.teamId) { toast('팀장·멘토는 팀을 골라주세요'); return false; }
        const obj = Object.assign({}, p, { name: v.name, email: v.email.toLowerCase(), role: v.role, teamId: v.teamId || null, active: !v.inactive });
        await Store.put('staff', obj);
        await Store.log(isNew ? 'staff-create' : 'staff-update', obj.id, `직원 ${isNew ? '등록' : '수정'}: ${obj.name} (${ROLES[obj.role]}${obj.active ? '' : ', 비활성'})`);
        // 담당 학생의 팀 정보 갱신
        for (const s of Store.all('students').filter(s => s.mentorId === obj.id)) await Store.put('students', s);
        toast('저장했어요');
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
    else if (p0 === 'leads') html = pageLeads();
    else if (p0 === 'report') html = pageReport();
    else if (p0 === 'settings') html = pageSettings();
    else { active = 'home'; html = pageHome(); }
    const y = window.scrollY;
    const same = render._last === location.hash;
    app.innerHTML = shell(active, html);
    window.scrollTo(0, same ? y : 0);
    render._last = location.hash;
    const title = (NAV.find(n => n[0] === active) || [])[2];
    document.title = `${title ? title + ' · ' : ''}학사관리`;
  }

  // ---------- 동작 ----------
  const A = {
    go: el => { location.hash = el.dataset.href; },
    'demo-login': el => { Store.loginDemo(el.dataset.id); location.hash = '#/'; render(); },
    account: () => { location.hash = '#/settings'; },
    logout: async () => { await Store.logout(); location.hash = '#/'; render(); },
    'pw-change': () => openModal('비밀번호 바꾸기', `<div class="form">${field('새 비밀번호 (10자 이상, 영문·숫자 섞어서)', `<input class="in" type="password" name="pw" autocomplete="new-password">`)}${field('새 비밀번호 확인', `<input class="in" type="password" name="pw2" autocomplete="new-password">`)}</div>`, {
      onOk: async root => {
        const v = vals(root);
        if (v.pw.length < 10 || !/[a-zA-Z]/.test(v.pw) || !/\d/.test(v.pw)) { toast('10자 이상, 영문과 숫자를 섞어주세요'); return false; }
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
    att: async el => {
      const { sid, cid, date, v } = el.dataset;
      const a = Store.all('attendance').find(x => x.studentId === sid && x.classId === cid && x.date === date);
      if (a && a.state === v) await Store.del('attendance', a.id);
      else await Store.put('attendance', Object.assign(a || { studentId: sid, classId: cid, date }, { state: v, by: me().id }));
      render();
    },
    'att-cycle': async el => {
      const { sid, cid, date } = el.dataset;
      const a = Store.all('attendance').find(x => x.studentId === sid && x.classId === cid && x.date === date);
      const next = { '': 'present', present: 'late', late: 'absent', absent: '' }[a ? a.state : ''];
      if (!next) await Store.del('attendance', a.id);
      else await Store.put('attendance', Object.assign(a || { studentId: sid, classId: cid, date }, { state: next, by: me().id }));
      render();
    },
    'stu-status': el => { ui.stu.status = el.dataset.v; render(); },
    'stu-view': el => { ui.stu.view = el.dataset.v; render(); },
    'stu-csv': () => {
      const classes = Store.all('classes');
      const rows = [['이름', '연락처', '상태', '카테고리', '전공', '담당', '팀', '목표', '수업', '출석률', '취업·진학처', '등록일']];
      sortBy(filteredStudents(), s => s.name).forEach(s => {
        const r = rate(attOf(s.id));
        rows.push([s.name, s.phone, statusOf(s.status).label, s.category, s.track, staffName(s.mentorId), teamName(s.teamId), s.goal,
          (s.classIds || []).map(id => (classes.find(c => c.id === id) || {}).name).filter(Boolean).join(' / '), r == null ? '' : r + '%', (s.employment || {}).company || '', (s.createdAt || '').slice(0, 10)]);
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
      if (!(await confirmBox(`${s.name} 학생과 모든 기록을 삭제할까요? 되돌릴 수 없어요.`, '삭제'))) return;
      for (const col of ['attendance', 'notes', 'meetings', 'tasks']) for (const r of Store.all(col).filter(r => r.studentId === s.id)) await Store.del(col, r.id);
      for (const e of Store.all('exams').filter(e => (e.studentIds || []).includes(s.id))) { e.studentIds = e.studentIds.filter(x => x !== s.id); await Store.put('exams', e); }
      await Store.del('students', s.id);
      await Store.log('delete', s.id, `학생 삭제: ${s.name}`);
      toast('삭제했어요'); location.hash = '#/students';
    },
    'class-arch': el => { ui.classArchived = el.dataset.v === '1'; render(); },
    'class-new': () => editClass({}),
    'class-edit': el => editClass(Store.get('classes', el.dataset.id)),
    'class-del': async el => {
      document.querySelectorAll('.modal-bg').forEach(m => m.remove());
      const c = Store.get('classes', el.dataset.id);
      if (!(await confirmBox(`'${c.name}' 수업을 삭제할까요? 출결 기록도 함께 지워져요. 보통은 '종료된 수업'으로 표시하는 걸 권해요.`, '삭제'))) return;
      for (const a of Store.all('attendance').filter(a => a.classId === c.id)) await Store.del('attendance', a.id);
      for (const s of Store.all('students').filter(s => (s.classIds || []).includes(c.id))) { s.classIds = s.classIds.filter(x => x !== c.id); await Store.put('students', s); }
      await Store.del('classes', c.id);
      await Store.log('delete', c.id, `수업 삭제: ${c.name}`);
      location.hash = '#/classes';
    },
    'att-export': el => {
      const c = Store.get('classes', el.dataset.id);
      const v = vals(document.getElementById('att-export'));
      const dates = sessionDates(c, v.to || today()).filter(d => d >= (v.from || '0000'));
      const roster = sortBy(students().filter(s => (s.classIds || []).includes(c.id)), s => s.name);
      const att = Store.all('attendance').filter(a => a.classId === c.id);
      const rows = [['이름', '연락처'].concat(dates, ['출석', '지각', '결석', '출석률'])];
      roster.forEach(s => {
        const cells = dates.map(d => { const a = att.find(x => x.studentId === s.id && x.date === d); return a ? ATT[a.state] : ''; });
        const n = k => cells.filter(x => x === ATT[k]).length;
        const tot = n('present') + n('late') + n('absent');
        rows.push([s.name, s.phone].concat(cells, [n('present'), n('late'), n('absent'), tot ? Math.round((n('present') + n('late')) / tot * 100) + '%' : '']));
      });
      U.download(`출결표_${c.name}_${v.from}_${v.to}.csv`, U.csv(rows));
    },
    'exam-past': el => { ui.examPast = el.dataset.v === '1'; render(); },
    'exam-new': () => editExam({}),
    'exam-edit': el => editExam(Store.get('exams', el.dataset.id)),
    'exam-del': async el => {
      document.querySelectorAll('.modal-bg').forEach(m => m.remove());
      if (!(await confirmBox('이 시험을 삭제할까요?', '삭제'))) return;
      await Store.del('exams', el.dataset.id); render();
    },
    'lead-tab': el => { ui.leadTab = el.dataset.v; render(); },
    'lead-new': () => editLead({}),
    'lead-edit': el => editLead(Store.get('leads', el.dataset.id)),
    'lead-del': async el => {
      document.querySelectorAll('.modal-bg').forEach(m => m.remove());
      if (!(await confirmBox('이 문의를 삭제할까요?', '삭제'))) return;
      await Store.del('leads', el.dataset.id); render();
    },
    'lead-convert': el => {
      const l = Store.get('leads', el.dataset.id);
      newStudent({ name: l.name, phone: l.phone, goal: l.interest }, async s => {
        l.status = 'registered'; l.studentId = s.id;
        await Store.put('leads', l);
      });
    },
    'report-months': el => { ui.reportMonths = Number(el.dataset.v); render(); },
    'report-csv': () => {
      const rows = [['담당', '권한', '팀', '진행 중', '신규', '자격증 합격', '취업·진학', '이탈', '출석률']];
      (ui._reportRows || []).forEach(r => rows.push([r.m.name, ROLES[r.m.role], teamName(r.m.teamId), r.ongoing, r.neu, r.pass, r.job, r.drop, r.rate == null ? '' : r.rate + '%']));
      U.download(`성과리포트_최근${ui.reportMonths}개월_${today()}.csv`, U.csv(rows));
    },
    'team-new': () => openModal('팀 추가', field('팀 이름', input('name', '', 'placeholder="예: 3팀"')), {
      okText: '추가', onOk: async root => { const v = vals(root); if (!v.name) return false; await Store.put('teams', { name: v.name }); render(); }
    }),
    'team-edit': el => { const t = Store.get('teams', el.dataset.id); openModal('팀 이름 변경', field('팀 이름', input('name', t.name)), { onOk: async root => { t.name = vals(root).name || t.name; await Store.put('teams', t); render(); } }); },
    'team-del': async el => {
      const t = Store.get('teams', el.dataset.id);
      if (Store.all('staff').some(p => p.teamId === t.id && p.active !== false)) return toast('팀원이 있는 팀은 삭제할 수 없어요. 먼저 팀원을 옮겨주세요.');
      if (!(await confirmBox(`'${t.name}'을 삭제할까요?`, '삭제'))) return;
      await Store.del('teams', t.id); render();
    },
    'staff-new': () => editStaff({}),
    'staff-edit': el => editStaff(Store.get('staff', el.dataset.id)),
    backup: () => U.download(`학사관리_백업_${today()}.json`, JSON.stringify(Store.exportAll(), null, 2), 'application/json'),
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
    'lead-status': async el => { const l = Store.get('leads', el.dataset.id); l.status = el.value; await Store.put('leads', l); toast('상태를 바꿨어요'); render(); },
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
  let qTimer;
  document.addEventListener('input', e => {
    if (e.target.dataset.input !== 'stu-q') return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      ui.stu.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const inp = document.querySelector('[data-input="stu-q"]');
      if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    }, 200);
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
