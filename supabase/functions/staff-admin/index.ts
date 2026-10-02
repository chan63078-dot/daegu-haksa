// 직원 로그인 계정 관리 (Supabase Edge Function: staff-admin)
// 원장·총괄만 호출할 수 있고, 직원 명단(items.staff)에 있는 이메일만 다룹니다.
// 관리자 키(service role)는 Supabase 서버 안의 환경변수로만 쓰이고 브라우저로 나가지 않습니다.
//
// 요청 본문(JSON): { action, email?, password? }
//   status  : 로그인 계정 목록 (이메일, 마지막 로그인)
//   create  : 로그인 계정 만들기 (메일 인증 없이 바로 사용 가능)
//   reset   : 비밀번호 재설정
//   delete  : 로그인 계정 삭제
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => reply(status, { error: code, message });

const strongEnough = (pw: string) => typeof pw === 'string' && pw.length >= 10 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'method', 'POST만 받아요');

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return fail(500, 'config', '서버 설정(SUPABASE_SERVICE_ROLE_KEY)이 없어요');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) 요청한 사람 확인: 로그인 토큰 → 이메일 → 직원 명단에서 원장·총괄인지
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'auth', '로그인이 필요해요');
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user?.email) return fail(401, 'auth', '로그인이 만료됐어요. 다시 로그인해 주세요');
  const myEmail = who.user.email.toLowerCase();

  const { data: staffRows, error: staffErr } = await admin.from('items').select('id,data').eq('collection', 'staff');
  if (staffErr) return fail(500, 'db', staffErr.message);
  const staff = (staffRows || []).map(r => ({ id: r.id, ...(r.data as Record<string, unknown>) })) as Array<{ id: string; email?: string; role?: string; active?: boolean; name?: string }>;
  const me = staff.find(s => (s.email || '').toLowerCase() === myEmail && s.active !== false);
  if (!me || me.role !== 'admin') return fail(403, 'forbidden', '원장·총괄만 할 수 있어요');

  let body: { action?: string; email?: string; password?: string };
  try { body = await req.json(); } catch { return fail(400, 'body', '요청 형식이 잘못됐어요'); }
  const action = body.action;
  const email = (body.email || '').trim().toLowerCase();

  // 로그인 계정 전체 (직원 수가 적어 한두 페이지면 충분)
  async function allUsers() {
    const users: Array<{ id: string; email?: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null }> = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < 200) break;
    }
    return users;
  }
  const log = (detail: string) => admin.from('items').insert({
    collection: 'logs', id: crypto.randomUUID(), updated_by: me.id,
    data: { at: new Date().toISOString(), actorId: me.id, actorName: me.name || '', action: 'account', target: email, detail }
  });

  try {
    if (action === 'status') {
      const users = await allUsers();
      return reply(200, { users: users.map(u => ({ email: (u.email || '').toLowerCase(), lastSignIn: u.last_sign_in_at || null, confirmed: !!u.email_confirmed_at })) });
    }

    if (!email) return fail(400, 'email', '이메일이 없어요');
    const target = staff.find(s => (s.email || '').toLowerCase() === email);
    if (!target && action !== 'delete') return fail(400, 'not-staff', '직원 명단에 먼저 등록해 주세요');
    const existing = (await allUsers()).find(u => (u.email || '').toLowerCase() === email);

    if (action === 'create') {
      if (!strongEnough(body.password || '')) return fail(400, 'weak', '비밀번호는 10자 이상, 영문과 숫자를 섞어주세요');
      if (existing) return fail(409, 'exists', '이미 로그인 계정이 있어요. 비밀번호 재설정을 쓰세요');
      const { error } = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
      if (error) return fail(400, 'create', error.message);
      await log(`로그인 계정 생성: ${target?.name || email}`);
      return reply(200, { ok: true });
    }

    if (action === 'reset') {
      if (!strongEnough(body.password || '')) return fail(400, 'weak', '비밀번호는 10자 이상, 영문과 숫자를 섞어주세요');
      if (!existing) return fail(404, 'none', '로그인 계정이 없어요. 계정 만들기를 쓰세요');
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password: body.password, email_confirm: true });
      if (error) return fail(400, 'reset', error.message);
      await log(`비밀번호 재설정: ${target?.name || email}`);
      return reply(200, { ok: true });
    }

    if (action === 'delete') {
      if (email === myEmail) return fail(400, 'self', '자기 계정은 지울 수 없어요');
      if (!existing) return reply(200, { ok: true, already: true });
      const { error } = await admin.auth.admin.deleteUser(existing.id);
      if (error) return fail(400, 'delete', error.message);
      await log(`로그인 계정 삭제: ${target?.name || email}`);
      return reply(200, { ok: true });
    }

    return fail(400, 'action', '알 수 없는 요청이에요');
  } catch (e) {
    return fail(500, 'server', e instanceof Error ? e.message : String(e));
  }
});
