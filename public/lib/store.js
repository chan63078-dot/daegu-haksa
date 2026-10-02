// 데이터 저장소
// - 데모 모드: 이 브라우저 localStorage 에 저장 (설정 파일에 Supabase 값이 없을 때)
// - 실제 모드: Supabase 의 items 테이블 하나에 컬렉션별로 저장, 권한은 DB(RLS)가 판단
(function () {
  const C = window.HAKSA_CONFIG || {};
  const COLS = ['teams', 'staff', 'students', 'classes', 'attendance', 'notes', 'meetings', 'tasks', 'exams', 'leads', 'logs'];
  const STUDENT_SCOPED = ['attendance', 'notes', 'meetings', 'tasks'];
  const LS_KEY = 'daegu-haksa-v2';  // 데모 데이터 구조가 바뀌면 숫자를 올림
  const LS_ME = 'daegu-haksa-me';
  const live = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);

  let sb = null;
  let me = null;
  const db = {};
  COLS.forEach(c => (db[c] = []));

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const newToken = () => {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, b => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);
  };

  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) {}
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      COLS.forEach(c => (db[c] = o[c] || []));
      return true;
    } catch (e) { return false; }
  }

  // 권한 판단용 열 (DB 정책이 이 값으로 걸러냄)
  function derived(col, o) {
    if (col === 'students') return { student_id: o.id, mentor_id: o.mentorId || null, team_id: o.teamId || null };
    if (STUDENT_SCOPED.includes(col)) return { student_id: o.studentId || null, mentor_id: null, team_id: null };
    return { student_id: null, mentor_id: null, team_id: null };
  }

  const divisionOf = teamId => (db.teams.find(t => t.id === teamId) || {}).division || null;

  // 데모 모드에서도 실제 모드와 같은 범위만 보이게
  function canSeeStudent(s) {
    if (!me || !s) return false;
    if (me.role === 'admin') return true;
    if (s.mentorId === me.id) return true;
    if (me.role === 'head') { const d = divisionOf(me.teamId); return !!d && divisionOf(s.teamId) === d; }
    if (me.role === 'lead') return !!me.teamId && s.teamId === me.teamId;
    return false;
    return s.mentorId === me.id;
  }
  function visible(col) {
    const rows = db[col];
    if (live || !me) return rows;
    if (col === 'students') return rows.filter(canSeeStudent);
    if (STUDENT_SCOPED.includes(col)) {
      const ids = new Set(db.students.filter(canSeeStudent).map(s => s.id));
      return rows.filter(r => ids.has(r.studentId));
    }
    if (col === 'logs') return me.role === 'admin' ? rows : [];
    return rows;
  }

  async function loadLive() {
    COLS.forEach(c => (db[c] = []));
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await sb.from('items').select('collection,id,data').range(from, from + page - 1);
      if (error) throw error;
      data.forEach(r => { if (db[r.collection]) db[r.collection].push({ ...r.data, id: r.id }); });
      if (data.length < page) break;
    }
  }

  function findMe(email) {
    return db.staff.find(s => (s.email || '').toLowerCase() === (email || '').toLowerCase() && s.active !== false) || null;
  }

  const Store = {
    live,
    config: C,
    uid,
    newToken,

    async init() {
      if (live) {
        sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
        const { data } = await sb.auth.getSession();
        if (data.session) {
          await loadLive();
          me = findMe(data.session.user.email);
          if (!me) return { ok: false, reason: 'not-staff' };
        }
        return { ok: true };
      }
      if (!loadLocal()) {
        window.HAKSA_SEED(db, { uid, newToken });
        saveLocal();
      }
      try {
        const id = localStorage.getItem(LS_ME);
        me = db.staff.find(s => s.id === id) || null;
      } catch (e) {}
      return { ok: true };
    },

    me: () => me,
    canSeeStudent,
    divisionOf,

    async login(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await loadLive();
      me = findMe(data.user.email);
      if (!me) { await sb.auth.signOut(); throw new Error('not-staff'); }
      return me;
    },
    loginDemo(id) {
      me = db.staff.find(s => s.id === id) || null;
      try { localStorage.setItem(LS_ME, id); } catch (e) {}
      return me;
    },
    async changePassword(pw) {
      if (!live) throw new Error('데모 모드에서는 비밀번호가 없어요.');
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
    },
    async logout() {
      me = null;
      if (live) await sb.auth.signOut();
      try { localStorage.removeItem(LS_ME); } catch (e) {}
    },

    all: col => visible(col),
    get: (col, id) => db[col].find(r => r.id === id) || null,

    async put(col, obj) {
      if (!obj.id) obj.id = uid();
      obj.updatedAt = new Date().toISOString();
      if (col === 'students') {
        const m = db.staff.find(s => s.id === obj.mentorId);
        obj.teamId = m ? m.teamId || null : null;
      }
      if (live) {
        const row = { collection: col, id: obj.id, data: obj, ...derived(col, obj), updated_by: me ? me.id : null };
        // 수정 이력은 새로 쌓기만 하고, 원장·총괄만 읽을 수 있어서 upsert(읽기 검사 포함) 대신 insert
        const { error } = col === 'logs' ? await sb.from('items').insert(row) : await sb.from('items').upsert(row);
        if (error) throw error;
      }
      const i = db[col].findIndex(r => r.id === obj.id);
      if (i >= 0) db[col][i] = obj; else db[col].push(obj);
      if (!live) saveLocal();
      return obj;
    },

    async del(col, id) {
      if (live) {
        const { error } = await sb.from('items').delete().eq('collection', col).eq('id', id);
        if (error) throw error;
      }
      db[col] = db[col].filter(r => r.id !== id);
      if (!live) saveLocal();
    },

    // 수정 이력: 누가 언제 무엇을 바꿨는지
    async log(action, target, detail) {
      const row = { at: new Date().toISOString(), actorId: me ? me.id : null, actorName: me ? me.name : '', action, target, detail };
      try { await Store.put('logs', row); } catch (e) { console.warn('log 실패', e); }
    },

    // 학생 전용 링크 화면 (로그인 없이 토큰으로)
    async studentView(token) {
      if (live) {
        if (!sb) sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
        const { data, error } = await sb.rpc('student_view', { p_token: token });
        if (error) throw error;
        return data;
      }
      if (!loadLocal()) { window.HAKSA_SEED(db, { uid, newToken }); saveLocal(); }
      const s = db.students.find(x => x.token === token);
      if (!s) return null;
      const pick = ({ id, name, goal, intro, roadmap, certs, classIds, status }) => ({ id, name, goal, intro, roadmap, certs, classIds, status });
      return {
        student: pick(s),
        classes: db.classes.filter(c => (s.classIds || []).includes(c.id)),
        attendance: db.attendance.filter(a => a.studentId === s.id).map(({ classId, date, state }) => ({ classId, date, state })),
        tasks: db.tasks.filter(t => t.studentId === s.id && t.shared !== false),
        meetings: db.meetings.filter(m => m.studentId === s.id && !m.done).map(({ date, time, topic }) => ({ date, time, topic })),
        exams: db.exams.filter(e => (e.studentIds || []).includes(s.id)).map(({ id, name, regStart, regEnd, examDate, resultDate }) => ({ id, name, regStart, regEnd, examDate, resultDate }))
      };
    },
    async studentSetTask(token, taskId, done) {
      if (live) {
        const { error } = await sb.rpc('student_set_task', { p_token: token, p_task: taskId, p_done: done });
        if (error) throw error;
        return;
      }
      const s = db.students.find(x => x.token === token);
      const t = db.tasks.find(x => x.id === taskId && s && x.studentId === s.id);
      if (t) { t.done = done; saveLocal(); }
    },

    // 공개 상담 신청 폼
    async submitLead(f) {
      if (live) {
        if (!sb) sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
        const { error } = await sb.rpc('submit_lead', { p_name: f.name, p_phone: f.phone, p_interest: f.interest, p_memo: f.memo });
        if (error) throw error;
        return;
      }
      if (!loadLocal()) { window.HAKSA_SEED(db, { uid, newToken }); }
      db.leads.push({ id: uid(), name: f.name, phone: f.phone, interest: f.interest, memo: f.memo, source: '온라인 신청', status: 'new', createdAt: new Date().toISOString() });
      saveLocal();
    },

    // 직원 로그인 계정 관리 (원장·총괄 전용, 서버 함수 staff-admin)
    async staffAccount(action, payload) {
      if (live) {
        const { data, error } = await sb.functions.invoke('staff-admin', { body: Object.assign({ action }, payload || {}) });
        if (error) {
          let msg = error.message, code = 'error';
          try { const j = await error.context.json(); msg = j.message || msg; code = j.error || code; } catch (e) {}
          if (/Failed to send|not found|404/i.test(msg)) { code = 'not-installed'; msg = '계정 관리 기능(staff-admin)이 Supabase에 아직 설치되지 않았어요.'; }
          const err = new Error(msg); err.code = code; throw err;
        }
        return data;
      }
      // 데모: 이 브라우저에만 저장되는 가짜 계정 목록
      const KEY = 'daegu-haksa-auth';
      let map;
      try { map = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
      if (!map) {
        map = {};
        db.staff.slice(0, -1).forEach((s, i) => { map[s.email.toLowerCase()] = { lastSignIn: i % 3 ? new Date(Date.now() - i * 864e5).toISOString() : null }; });
      }
      const save = () => { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {} };
      const email = ((payload && payload.email) || '').toLowerCase();
      const bad = msg => { const e = new Error(msg); e.code = 'bad'; throw e; };
      if (action === 'status') { save(); return { users: Object.keys(map).map(k => ({ email: k, lastSignIn: map[k].lastSignIn, confirmed: true })) }; }
      if (action === 'create') { if (map[email]) bad('이미 로그인 계정이 있어요'); map[email] = { lastSignIn: null }; }
      if (action === 'reset' && !map[email]) bad('로그인 계정이 없어요');
      if (action === 'delete') delete map[email];
      save();
      await Store.log('account', email, `[데모] 로그인 계정 ${({ create: '생성', reset: '비밀번호 재설정', delete: '삭제' })[action]}: ${email}`);
      return { ok: true };
    },

    exportAll() {
      const o = { exportedAt: new Date().toISOString(), academy: C.ACADEMY_NAME };
      COLS.forEach(c => (o[c] = visible(c)));
      return o;
    },
    async importAll(o) {
      for (const c of COLS) {
        if (!Array.isArray(o[c])) continue;
        for (const r of o[c]) await Store.put(c, r);
      }
    },
    resetDemo() {
      if (live) return;
      try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_ME); } catch (e) {}
    }
  };

  window.Store = Store;
})();
