// 줌 클라우드 녹화본 → 수업 회차별 녹화본 자동 채우기 (Supabase Edge Function: zoom-recordings)
// pg_cron 이 수업 중·수업 후에 호출. 줌 키는 Supabase 비밀값(ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET)에만 있음.
//
// 규칙
// - 수업의 줌 회의 ID + 녹화 날짜(한국 시간)가 수업 기간 안이면 그 날짜 회차에 넣음
// - 수업 중에는 녹화 중인 링크를 미리 넣음(auto), 끝난 뒤엔 수업 시간 절반 이상 녹화 중 가장 긴 것으로 확정
// - 손으로 넣은 링크(auto 표시 없음)는 건드리지 않음
// - 넣은 녹화본은 '보기 권한자 다운로드 가능'을 끔
//
// 요청 본문(JSON, 선택): { days?: 기본 2 (최대 30), dry?: true 면 저장 없이 결과만,
//   from?/to?: 'YYYY-MM-DD' (최대 한 달), allOff?: true 면 기간 안 모든 녹화본 다운로드 끄기만 }
import { createClient } from 'npm:@supabase/supabase-js@2';

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

const ZOOM = 'https://api.zoom.us/v2';
const kstDate = (utc: string) => new Date(Date.parse(utc) + 9 * 3600e3).toISOString().slice(0, 10);
const mins = (hhmm: string) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
// 회의 UUID 가 / 로 시작하거나 // 를 품으면 두 번 인코딩해야 함 (줌 규칙)
const enc = (uuid: string) => uuid.startsWith('/') || uuid.includes('//') ? encodeURIComponent(encodeURIComponent(uuid)) : encodeURIComponent(uuid);

async function zoomToken() {
  const id = Deno.env.get('ZOOM_CLIENT_ID'), secret = Deno.env.get('ZOOM_CLIENT_SECRET'), acc = Deno.env.get('ZOOM_ACCOUNT_ID');
  if (!id || !secret || !acc) throw new Error('줌 비밀값(ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET)이 없어요');
  const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(acc)}`,
    { method: 'POST', headers: { Authorization: 'Basic ' + btoa(`${id}:${secret}`) } });
  const j = await r.json();
  if (!r.ok) throw new Error('줌 인증 실패: ' + (j.reason || j.error || r.status));
  return j.access_token as string;
}

async function zget(token: string, path: string) {
  const r = await fetch(ZOOM + path, { headers: { Authorization: 'Bearer ' + token } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`줌 ${path.split('?')[0]} 실패: ${j.message || r.status}`);
  return j;
}

// 계정 안 모든 사용자의 기간 내 클라우드 녹화
async function listRecordings(token: string, from: string, to: string) {
  const users: { id: string }[] = [];
  let next = '';
  do {
    const j = await zget(token, `/users?page_size=300&status=active${next ? '&next_page_token=' + next : ''}`);
    users.push(...(j.users || [])); next = j.next_page_token || '';
  } while (next);
  const out: any[] = [];
  for (const u of users) {
    next = '';
    do {
      const j = await zget(token, `/users/${u.id}/recordings?page_size=300&from=${from}&to=${to}${next ? '&next_page_token=' + next : ''}`);
      out.push(...(j.meetings || [])); next = j.next_page_token || '';
    } while (next);
  }
  return out;
}

// 아직 녹화 중이거나 처리 중인 녹화 (파일 상태가 completed 가 아니거나 끝 시각이 없음)
const inProgress = (m: any) => !(m.recording_files || []).length || (m.recording_files || []).some((f: any) => (f.status && f.status !== 'completed') || !f.recording_end);

// 녹화 길이(분): 영상 파일들의 처음 시작 ~ 마지막 끝
function recMinutes(m: any) {
  const f = (m.recording_files || []).filter((x: any) => x.recording_start && x.recording_end);
  if (!f.length) return Number(m.duration) || 0;
  const s = Math.min(...f.map((x: any) => Date.parse(x.recording_start)));
  const e = Math.max(...f.map((x: any) => Date.parse(x.recording_end)));
  return Math.round((e - s) / 60000);
}

Deno.serve(async req => {
  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body.days) || 2, 1), 30);
  const dry = !!body.dry;

  let serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!serviceKey) { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); serviceKey = String(k.default || Object.values(k)[0] || ''); } catch { /* 아래 */ } }
  if (!serviceKey) return reply(500, { error: '서버 설정(관리자 키)을 찾지 못했어요' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });

  try {
    const token = await zoomToken();
    const isDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const to = isDay(body.to) ? body.to : kstDate(new Date().toISOString());
    const from = isDay(body.from) ? body.from : kstDate(new Date(Date.now() - days * 86400e3).toISOString());
    const recs = await listRecordings(token, from, to);

    // 한 번만: 기간 안 모든 녹화본의 다운로드 허용 끄기 (줌 API 는 한 번에 최대 한 달)
    if (body.allOff) {
      let ok = 0; const failed: string[] = [];
      for (const m of recs) {
        const r = await fetch(`${ZOOM}/meetings/${enc(m.uuid)}/recordings/settings`, {
          method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ viewer_download: false })
        });
        if (r.ok) ok++; else failed.push(`${kstDate(m.start_time)} ${m.topic} (${r.status})`);
      }
      return reply(200, { from, to, zoomRecordings: recs.length, downloadOff: ok, failed });
    }

    const { data: rows, error } = await db.from('items').select('id,data').eq('collection', 'classes');
    if (error) throw error;
    const classes = rows.map((r: any) => r.data).filter((c: any) => !c.archived && digits(c.zoom?.meetingId));

    // (수업, 날짜)별 후보 모으기
    const cand = new Map<string, { c: any; d: string; list: any[] }>(), seen: any[] = [];
    for (const m of recs) {
      const d = kstDate(m.start_time), mid = digits(m.id);
      const hits = classes.filter((c: any) => digits(c.zoom.meetingId) === mid && c.startDate <= d && d <= c.endDate);
      // 같은 회의 ID 수업 기간이 겹치면 그 요일 수업을 우선
      const dow = new Date(d + 'T00:00:00Z').getUTCDay();
      const c = hits.find((x: any) => (x.days || []).includes(dow)) || hits[0];
      seen.push({ date: d, topic: m.topic, meetingId: mid, minutes: recMinutes(m), live: inProgress(m), share: !!m.share_url, files: (m.recording_files || []).map((f: any) => f.status).join(','), class: c?.name || null });
      if (!c) continue;
      const k = c.id + '|' + d;
      if (!cand.has(k)) cand.set(k, { c, d, list: [] });
      cand.get(k)!.list.push(m);
    }

    const changed = new Map<string, any>(), report: any[] = [];
    const today = kstDate(new Date().toISOString());
    const nowMin = mins(new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16));
    for (const { c, d, list } of cand.values()) {
      const cur = (changed.get(c.id) || c).recordings || {};
      const had = cur[d] || {};
      if (had.url && !had.auto) continue; // 손으로 넣은 링크는 그대로
      const need = Math.floor((mins(c.end) - mins(c.start)) / 2);
      const sorted = list.map(m => ({ m, len: recMinutes(m), live: inProgress(m) })).sort((a, b) => b.len - a.len);
      const done = sorted.find(x => !x.live && x.len >= need && x.m.share_url);
      // 수업 중(당일, 종료 30분 전까지)이면 녹화 중인 링크를 미리 넣음 → 끝난 뒤 실행에서 가장 긴 녹화로 확정
      const during = d === today && nowMin <= mins(c.end) + 30;
      const early = during && !had.url ? (sorted.find(x => x.live && x.m.share_url) || sorted.find(x => x.m.share_url)) : undefined;
      const best = done || early;
      let entry;
      if (best) {
        // 줌 share_url 은 부를 때마다 뒤쪽 토큰이 바뀌므로 녹화 uuid 로 같은 녹화인지 봄
        if (had.rid ? had.rid === best.m.uuid : had.url === best.m.share_url) continue;
        // 목록의 recording_play_passcode 는 암호화된 값이라 학생이 칠 수 없음 → 녹화 설정에서 실제 암호를 읽음
        const pw = await zget(token, `/meetings/${enc(best.m.uuid)}/recordings/settings`).then(s => s.password || '').catch(() => '');
        entry = { url: best.m.share_url, note: pw || best.m.password || '', auto: true, rid: best.m.uuid };
        if (!dry) {
          const r = await fetch(`${ZOOM}/meetings/${enc(best.m.uuid)}/recordings/settings`, {
            method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ viewer_download: false })
          });
          if (!r.ok) report.push({ class: c.name, date: d, warn: '다운로드 끄기 실패 ' + r.status });
        }
      } else {
        // 수업 중이거나 아직 처리 중이면 다음 실행을 기다림, 이미 링크·메모가 있으면 그대로
        if (during || had.url || cur[d] || sorted.some(x => x.live)) continue;
        entry = { url: '', note: `확인 필요: 녹화가 짧음 (가장 긴 것 ${sorted[0].len}분, ${list.length}개)` };
      }
      const next = { ...(changed.get(c.id) || c) };
      next.recordings = { ...cur, [d]: entry };
      next.updatedAt = new Date().toISOString();
      changed.set(c.id, next);
      report.push({ class: c.name, date: d, minutes: best?.len ?? sorted[0].len, url: !!entry.url, early: !!(best && best === early && !done), replaced: !!had.url, note: entry.url ? undefined : entry.note });
    }

    if (!dry && changed.size) {
      const now = new Date().toISOString();
      const up = Array.from(changed.values()).map(c => ({ collection: 'classes', id: c.id, data: c }));
      const { error: e1 } = await db.from('items').upsert(up, { onConflict: 'collection,id' });
      if (e1) throw e1;
      const lid = crypto.randomUUID();
      await db.from('items').insert({ collection: 'logs', id: lid, data: { id: lid, at: now, actorName: '줌 자동 연동', action: '녹화본 자동 입력', target: `${report.filter(r => r.url).length}개 회차`, detail: report.map(r => `${r.class} ${r.date}${r.url ? '' : ' (확인 필요)'}`).join(', ').slice(0, 500) } });
    }
    return reply(200, { from, to, zoomRecordings: recs.length, dry, results: report, seen });
  } catch (e) {
    return reply(500, { error: String((e as Error).message || e) });
  }
});
