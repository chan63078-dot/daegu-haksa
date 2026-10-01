// 데모 모드 첫 실행 때 넣는 예시 데이터 (모든 이름·연락처는 가상)
window.HAKSA_SEED = function (db, { uid, newToken }) {
  const t = U.today();
  const d = n => U.addDays(t, n);
  const now = new Date().toISOString();

  const team1 = { id: 'team-1', name: '1팀' };
  const team2 = { id: 'team-2', name: '2팀' };
  db.teams = [team1, team2];

  db.staff = [
    { id: 'st-admin', name: '이서준', email: 'director@daegu.example', role: 'admin', teamId: null, active: true },
    { id: 'st-lead1', name: '박지현', email: 'lead1@daegu.example', role: 'lead', teamId: 'team-1', active: true },
    { id: 'st-m1', name: '최민호', email: 'mentor1@daegu.example', role: 'mentor', teamId: 'team-1', active: true },
    { id: 'st-lead2', name: '정유나', email: 'lead2@daegu.example', role: 'lead', teamId: 'team-2', active: true },
    { id: 'st-m2', name: '한도윤', email: 'mentor2@daegu.example', role: 'mentor', teamId: 'team-2', active: true }
  ];
  const teamOf = id => (db.staff.find(s => s.id === id) || {}).teamId || null;

  db.classes = [
    { id: 'c-kdt', name: 'KDT 생성형 AI 서비스 개발자', days: [1, 2, 3, 4, 5], start: '09:30', end: '18:00', startDate: d(-45), endDate: d(120), room: '501호', gov: true, color: 'green' },
    { id: 'c-ip', name: '정보처리기사 실기 대비', days: [2, 4], start: '19:00', end: '22:00', startDate: d(-20), endDate: d(30), room: '302호', gov: false, color: 'blue' },
    { id: 'c-py', name: '파이썬 기초', days: [1, 3], start: '19:00', end: '21:00', startDate: d(-10), endDate: d(50), room: '302호', gov: false, color: 'amber' },
    { id: 'c-sqld', name: 'SQLD 단기 특강', days: [6], start: '10:00', end: '13:00', startDate: d(-14), endDate: d(21), room: '303호', gov: false, color: 'violet' },
    { id: 'c-web', name: '웹 개발 입문', days: [2, 4], start: '19:00', end: '21:00', startDate: d(-120), endDate: d(-30), room: '302호', gov: false, color: 'gray', archived: true }
  ];

  const S = (id, name, category, track, status, mentorId, classIds, goal, extra) => Object.assign({
    id, name, phone: '010-' + String(1000 + Math.floor(Math.random() * 8999)) + '-' + String(1000 + Math.floor(Math.random() * 8999)),
    category, track, status, mentorId, teamId: teamOf(mentorId), classIds, goal, token: newToken(),
    intro: '', roadmap: [], certs: [], employment: {}, createdAt: d(-60) + 'T09:00:00.000Z'
  }, extra || {});

  db.students = [
    S('s1', '김하늘', '취준 20대', '비전공', 'gov', 'st-m1', ['c-kdt', 'c-sqld'], 'AI 서비스 개발자 취업', {
      roadmap: [{ title: '파이썬 기초', done: true }, { title: 'SQLD 취득', done: false }, { title: 'LLM 프로젝트', done: false }, { title: '포트폴리오·지원', done: false }],
      certs: [{ name: 'SQLD', status: '준비중', date: '' }], createdAt: d(-40) + 'T09:00:00.000Z'
    }),
    S('s2', '이도현', '대학 3·4학년', '전공', 'active', 'st-m1', ['c-ip'], '정보처리기사 → 공기업 전산직', {
      roadmap: [{ title: '필기 합격', done: true }, { title: '실기 합격', done: false }, { title: 'NCS 준비', done: false }],
      certs: [{ name: '정보처리기사 필기', status: '합격', date: d(-50) }]
    }),
    S('s3', '박서연', '취준 20대', '전공', 'gov', 'st-m1', ['c-kdt'], '데이터 분석가', { createdAt: d(-20) + 'T09:00:00.000Z' }),
    S('s4', '정우진', '대학 휴학', '비전공', 'active', 'st-lead1', ['c-py'], '개발 기초 다지기', { createdAt: d(-8) + 'T09:00:00.000Z' }),
    S('s5', '최수아', '취준 30대 이상', '비전공', 'gov', 'st-lead1', ['c-kdt', 'c-sqld'], '사무직 → AI 활용 직무 전환'),
    S('s6', '강민재', '대학 1·2학년', '전공', 'active', 'st-m1', ['c-py'], '학점 + 코딩 테스트 준비', { createdAt: d(-5) + 'T09:00:00.000Z' }),
    S('s7', '윤지우', '취준 20대', '전공', 'employed', 'st-m1', [], '백엔드 개발자', {
      employment: { company: '(주)대구소프트', role: '백엔드 개발', startDate: d(-25), insured: true, memo: '' }
    }),
    S('s8', '임채원', '대학 3·4학년', '전공', 'active', 'st-m2', ['c-ip', 'c-sqld'], 'SQLD + 정보처리기사 동시 취득', {
      certs: [{ name: 'SQLD', status: '준비중', date: '' }]
    }),
    S('s9', '오세훈', '취준 20대', '비전공', 'gov', 'st-m2', ['c-kdt'], 'AI 서비스 기획', { createdAt: d(-15) + 'T09:00:00.000Z' }),
    S('s10', '서예린', '재직자', '비전공', 'active', 'st-m2', ['c-py'], '업무 자동화', { createdAt: d(-3) + 'T09:00:00.000Z' }),
    S('s11', '신동혁', '취준 30대 이상', '전공', 'gov', 'st-lead2', ['c-kdt'], '풀스택 개발자'),
    S('s12', '황보름', '대학 휴학', '전공', 'school', 'st-lead2', [], '대학원 진학', {
      employment: { company: '경북대학교 대학원', role: '석사 과정', startDate: d(-30), insured: false, memo: '진학' }
    }),
    S('s13', '조민서', '취준 20대', '비전공', 'dropped', 'st-m2', [], '웹 개발', { createdAt: d(-90) + 'T09:00:00.000Z' }),
    S('s14', '배준호', '대학 3·4학년', '전공', 'active', 'st-lead1', ['c-ip'], '정보처리기사 실기', { createdAt: d(-12) + 'T09:00:00.000Z' })
  ];

  // 상태 이력 (리포트 집계용)
  const done = { s7: ['active', 'employed', -25], s12: ['active', 'school', -30], s13: ['active', 'dropped', -40] };
  db.students.forEach(s => {
    const by = (db.staff.find(x => x.id === s.mentorId) || {}).name || '';
    const first = done[s.id] ? done[s.id][0] : s.status;
    s.history = [{ at: s.createdAt, from: '', to: first, by }];
    if (done[s.id]) s.history.push({ at: d(done[s.id][2]) + 'T10:00:00.000Z', from: first, to: done[s.id][1], by });
  });
  // 자격증 합격 예시
  db.students[1].certs[0].date = d(-50);

  // 최근 2주 출결
  const att = [];
  for (let i = 14; i >= 1; i--) {
    const date = d(-i);
    db.classes.forEach(c => {
      if (!U.classOn(c, date)) return;
      db.students.filter(s => (s.classIds || []).includes(c.id) && U.ONGOING.includes(s.status)).forEach(s => {
        let state = 'present';
        if (s.id === 's9' && i <= 3) state = 'absent';          // 연속 결석 예시
        else if ((s.id.length + i) % 11 === 0) state = 'late';
        else if ((s.id.length * 3 + i) % 17 === 0) state = 'absent';
        att.push({ id: uid(), studentId: s.id, classId: c.id, date, state });
      });
    });
  }
  db.attendance = att;

  db.notes = [
    { id: uid(), studentId: 's1', type: '면담', date: d(-6), body: 'SQLD 시험 접수 완료. 기출 2회독 목표.', nextDate: d(8), authorId: 'st-m1' },
    { id: uid(), studentId: 's2', type: '상담', date: d(-12), body: '실기 서술형 약함. 주 2회 추가 과제.', nextDate: '', authorId: 'st-m1' },
    { id: uid(), studentId: 's3', type: '면담', date: d(-35), body: '데이터 분석 포트폴리오 주제 논의.', nextDate: d(-5), authorId: 'st-m1' },
    { id: uid(), studentId: 's5', type: '전화', date: d(-2), body: '국비 출결 규정 안내.', nextDate: '', authorId: 'st-lead1' },
    { id: uid(), studentId: 's8', type: '면담', date: d(-9), body: '두 시험 일정 겹침 → SQLD 먼저.', nextDate: d(5), authorId: 'st-m2' },
    { id: uid(), studentId: 's9', type: '상담', date: d(-28), body: '진로 고민. 기획 직무 관심.', nextDate: '', authorId: 'st-m2' }
  ];

  db.meetings = [
    { id: uid(), studentId: 's1', date: d(1), time: '18:10', topic: '포트폴리오 주제 확정', done: false },
    { id: uid(), studentId: 's8', date: d(3), time: '14:00', topic: '시험 전략 점검', done: false },
    { id: uid(), studentId: 's5', date: d(6), time: '12:30', topic: '중간 면담', done: false }
  ];

  db.tasks = [
    { id: uid(), studentId: 's1', title: 'SQLD 기출 1회차 풀기', due: d(2), done: false, shared: true },
    { id: uid(), studentId: 's1', title: '이력서 초안 제출', due: d(-1), done: false, shared: true },
    { id: uid(), studentId: 's2', title: '실기 약점 노트 정리', due: d(4), done: false, shared: true },
    { id: uid(), studentId: 's6', title: '백준 브론즈 10문제', due: d(7), done: true, shared: true }
  ];

  // 시험 일정은 예시입니다. 실제 일정은 Q-Net·데이터자격검정 사이트에서 확인 후 수정하세요.
  db.exams = [
    { id: 'e-sqld', name: 'SQLD (예시)', regStart: d(-10), regEnd: d(-3), examDate: d(9), resultDate: d(30), studentIds: ['s1', 's5', 's8'], memo: '' },
    { id: 'e-ip', name: '정보처리기사 실기 (예시)', regStart: d(5), regEnd: d(9), examDate: d(32), resultDate: d(70), studentIds: ['s2', 's14', 's8'], memo: '' },
    { id: 'e-adsp', name: 'ADsP (예시)', regStart: d(20), regEnd: d(27), examDate: d(45), resultDate: d(70), studentIds: ['s3'], memo: '' }
  ];

  db.leads = [
    { id: uid(), name: '문가은', phone: '010-0000-1111', interest: '국비 AI 과정', source: '홈페이지', status: 'new', nextDate: t, memo: '평일 저녁 통화 희망', createdAt: now },
    { id: uid(), name: '노태윤', phone: '010-0000-2222', interest: '정보처리기사', source: '지인 소개', status: 'contacted', nextDate: d(2), memo: '설명회 참석 예정', createdAt: d(-4) + 'T09:00:00.000Z' },
    { id: uid(), name: '류다인', phone: '010-0000-3333', interest: '파이썬 기초', source: '인스타그램', status: 'registered', nextDate: '', memo: '', createdAt: d(-20) + 'T09:00:00.000Z' }
  ];

  db.logs = [
    { id: uid(), at: d(-25) + 'T10:00:00.000Z', actorId: 'st-m1', actorName: '최민호', action: 'status', target: 's7', detail: '수강중 → 취업 완료' },
    { id: uid(), at: d(-30) + 'T10:00:00.000Z', actorId: 'st-lead2', actorName: '정유나', action: 'status', target: 's12', detail: '수강중 → 진학 완료' }
  ];
};
