// Dedication Maker and Wall · the Worker.
// Static files (the maker) come from the ASSETS binding; everything under /api, /d, /wall, /memory, /i, /p,
// /rounds, /rules, /privacy, /terms and /admin is answered here. Contest routes stay dark until the
// contest_enabled setting is true (set from /admin; the first round waits on counsel).
import {
  now, centralDay, shortId, tokenHex, sha256, makeSession, readSession, sessionCookie,
  json, html, bad, escapeHtml as h, validEmail, visitorHash, sendMail, screen,
} from './lib.js';
import { wallPage, dogPage, simplePage, notFoundPage } from './pages.js';

const RULES_VERSION_FALLBACK = 'draft-v3-2026-10-29';
const MAX_PHOTO = 12 * 1024 * 1024;   // original
const MAX_CUT = 3 * 1024 * 1024;      // each JPEG cut

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      // ----- public pages -----
      if (p === '/wall' && request.method === 'GET') return wall(env, request, false);
      if (p === '/memory' && request.method === 'GET') return wall(env, request, true);
      if (p.startsWith('/d/') && request.method === 'GET') return dog(env, request, p.slice(3));
      if (p.startsWith('/p/') && request.method === 'GET') return photo(env, request, p.slice(3));
      if (p.startsWith('/i/') && request.method === 'GET') return invite(env, request, p.slice(3));
      if (p === '/rules' && request.method === 'GET') return rules(env);
      if (p === '/privacy') return Response.redirect('https://brockalston.com/privacy-policy', 302);
      if (p === '/terms') return Response.redirect('https://brockalston.com/terms-of-use', 302);
      if (p.startsWith('/rounds/')) return rounds(env, request, p.slice(8));

      // ----- api -----
      if (p === '/api/health') return health(env);
      if (p === '/api/config') return config(env, request);
      if (p === '/api/request' && request.method === 'POST') return requestBackground(env, request);
      if (p === '/api/heart' && request.method === 'POST') return heart(env, request);
      if (p === '/api/auth/link' && request.method === 'POST') return authLink(env, request, url);
      if (p === '/api/auth/verify' && request.method === 'GET') return authVerify(env, request, url);
      if (p === '/api/auth/logout') return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': 'dw_session=; Path=/; Max-Age=0' } });
      if (p === '/api/post' && request.method === 'POST') return post(env, request, ctx);
      if (p === '/api/mine' && request.method === 'GET') return mine(env, request);
      if (p === '/api/remove' && request.method === 'POST') return remove(env, request);
      if (p === '/api/vote' && request.method === 'POST') return vote(env, request);
      if (p.startsWith('/api/admin')) return admin(env, request, url);
      if (p.startsWith('/api/')) return bad('no such route', 404);

      // ----- admin page -----
      if (p === '/admin' || p.startsWith('/admin/')) return adminPage(env, request, url);

      // ----- everything else is the maker -----
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error('worker error', p, e);
      return p.startsWith('/api/') ? bad('server error', 500) : html(notFoundPage(), 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(daily(env));
  },
};

// ---------------------------------------------------------------- settings
async function settings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return {
    contestEnabled: s.contest_enabled === 'true',
    thresholdEntries: Number(s.threshold_entries || 50),
    thresholdDays: Number(s.threshold_days || 45),
    votingDays: Number(s.voting_days || 14),
    rulesVersion: s.rules_version || RULES_VERSION_FALLBACK,
    prizeText: s.prize_text || '',
    judgeName: s.judge_name || '',
    alternateJudge: s.alternate_judge || '',
    dogOfTheDay: s.dog_of_the_day || '',
  };
}

const postingOn = (env) => String(env.POSTING_ENABLED) === 'true';
const devMode = (env) => String(env.DEV_MODE) === 'true';
const site = (env) => env.SITE_URL || 'https://dedication.jetsonsjourney.com';

async function health(env) {
  const t = await env.DB.prepare('SELECT COUNT(*) AS n FROM entries').first();
  const s = await settings(env);
  return json({ ok: true, posting: postingOn(env), contest: s.contestEnabled, entries: t.n, rules_version: s.rulesVersion, time: now() });
}

async function config(env, request) {
  const s = await settings(env);
  const sess = await readSession(env.SESSION_SECRET || 'dev', request.headers.get('cookie'));
  return json({ posting: postingOn(env), contest: s.contestEnabled, rules_version: s.rulesVersion, signed_in: sess ? sess.email : null });
}

// ---------------------------------------------------------------- sign-in by magic link
async function authLink(env, request, url) {
  if (!postingOn(env) && !devMode(env)) return bad('posting is not open yet', 403);
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return bad('a valid email is needed');
  const token = tokenHex(24);
  const exp = now() + 15 * 60;
  await env.DB.prepare(`INSERT INTO owners (email, magic_token, token_expires, created_at, last_seen_at) VALUES (?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET magic_token = excluded.magic_token, token_expires = excluded.token_expires`)
    .bind(email, await sha256(token), exp, now(), now()).run();
  const next = typeof body.next === 'string' && body.next.startsWith('/') ? body.next : '/';
  const link = `${site(env)}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`;
  const r = await sendMail(env, {
    to: email, kind: 'signin',
    subject: 'Your sign-in link for the Dedication Wall',
    text: `Tap to sign in (good for 15 minutes):\n${link}\n\nIf you didn’t ask for this, ignore it.`,
    html: `<p>Tap to sign in (good for 15 minutes):</p><p><a href="${link}">${link}</a></p><p>If you didn’t ask for this, ignore it.</p>`,
  });
  return json({ ok: true, sent: r.status === 'sent', ...(devMode(env) && r.status !== 'sent' ? { dev_link: link } : {}) });
}

async function authVerify(env, request, url) {
  const token = url.searchParams.get('token') || '';
  const email = (url.searchParams.get('email') || '').toLowerCase();
  const next = url.searchParams.get('next') || '/';
  const row = await env.DB.prepare('SELECT magic_token, token_expires FROM owners WHERE email = ?').bind(email).first();
  if (!row || !row.magic_token || row.token_expires < now() || row.magic_token !== (await sha256(token))) {
    return html(simplePage({ title: 'That link has expired', bodyHtml: '<p>Sign-in links last 15 minutes. <a href="/">Go back and ask for a new one.</a></p>', noindex: true }), 400);
  }
  await env.DB.prepare('UPDATE owners SET magic_token = NULL, token_expires = NULL, last_seen_at = ? WHERE email = ?').bind(now(), email).run();
  const cookie = sessionCookie(await makeSession(env.SESSION_SECRET || 'dev', email), url.protocol === 'https:');
  return new Response(null, { status: 302, headers: { location: next.startsWith('/') ? next : '/', 'set-cookie': cookie } });
}

async function requireSession(env, request) {
  return readSession(env.SESSION_SECRET || 'dev', request.headers.get('cookie'));
}

// ---------------------------------------------------------------- posting
// multipart/form-data: original, story, feed, card (JPEG), dog_name, line, mode, background_id,
// attest (on), contest (on|off), newsletter (on|off), test (on|off, DEV only).
async function post(env, request, ctx) {
  if (!postingOn(env) && !devMode(env)) return bad('posting is not open yet', 403);
  const sess = await requireSession(env, request);
  if (!sess) return bad('sign in first', 401);
  const form = await request.formData().catch(() => null);
  if (!form) return bad('expected multipart form data');

  const dog_name = String(form.get('dog_name') || '').trim().slice(0, 40);
  const line = String(form.get('line') || '').trim().slice(0, 120);
  const mode = form.get('mode') === 'in_memory' ? 'in_memory' : 'for';
  const background_id = String(form.get('background_id') || '').trim().slice(0, 64);
  const attest = form.get('attest') === 'on';
  const contest = form.get('contest') === 'on';
  const newsletter = form.get('newsletter') === 'on';
  const is_test = devMode(env) && form.get('test') === 'on' ? 1 : 0;
  if (!dog_name || !line || !background_id) return bad('dog name, line and background are needed');
  if (!attest) return bad('the age and ownership box must be ticked');

  const files = {};
  for (const k of ['original', 'story', 'feed', 'card']) {
    const f = form.get(k);
    if (!(f instanceof File)) return bad(`missing file: ${k}`);
    if (f.size > (k === 'original' ? MAX_PHOTO : MAX_CUT)) return bad(`${k} is too large`);
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) && k === 'original') return bad('original must be an image');
    if (k !== 'original' && f.type !== 'image/jpeg') return bad(`${k} must be a JPEG`);
    files[k] = f;
  }

  const s = await settings(env);
  const id = shortId(8);
  const code = shortId(10);
  const keys = { original: `entries/${id}/original.jpg`, story: `entries/${id}/story.jpg`, feed: `entries/${id}/feed.jpg`, card: `entries/${id}/card.jpg` };
  await Promise.all(Object.entries(keys).map(([k, key]) => env.PHOTOS.put(key, files[k].stream(), { httpMetadata: { contentType: files[k].type || 'image/jpeg' } })));

  const t = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO entries (id, dog_name, line, mode, background_id, photo_key, story_key, feed_key, card_key, owner_email, status, attested_at, rules_version, invite_code, created_at, is_test)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?)`)
      .bind(id, dog_name, line, mode, background_id, keys.original, keys.story, keys.feed, keys.card, sess.email, t, s.rulesVersion, code, t, is_test),
    env.DB.prepare('INSERT INTO invites (code, entry_id) VALUES (?,?)').bind(code, id),
    ...(contest && s.contestEnabled ? [env.DB.prepare('INSERT OR IGNORE INTO round_optins (entry_id, round_id, consented_at, rules_version, via) VALUES (?,NULL,?,?,\'post_it\')').bind(id, t, s.rulesVersion)] : []),
    ...(newsletter ? [env.DB.prepare('UPDATE owners SET newsletter_opt_in = 1, newsletter_at = ? WHERE email = ?').bind(t, sess.email)] : []),
  ]);

  // Screen now; publish or queue. The owner hears by email either way.
  ctx.waitUntil(screenAndPublish(env, id));
  if (newsletter) ctx.waitUntil(subscribeNewsletter(env, sess.email));
  return json({ ok: true, id, url: `${site(env)}/d/${id}`, invite: `${site(env)}/i/${code}`, status: 'pending' });
}

async function screenAndPublish(env, id) {
  const e = await env.DB.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first();
  if (!e) return;
  const obj = await env.PHOTOS.get(e.card_key);
  const cardBytes = obj ? await obj.arrayBuffer() : new ArrayBuffer(0);
  const v = await screen(env, { dog_name: e.dog_name, line: e.line, cardBytes });
  const t = now();
  if (v.verdict === 'live') {
    await env.DB.prepare('UPDATE entries SET status = \'live\', screen_result = ?, screened_at = ?, live_at = ? WHERE id = ?').bind(JSON.stringify(v), t, t, id).run();
    await notifyLive(env, { ...e, live_at: t });
  } else if (v.verdict === 'rejected') {
    await env.DB.prepare('UPDATE entries SET status = \'rejected\', screen_result = ?, screened_at = ? WHERE id = ?').bind(JSON.stringify(v), t, id).run();
    await sendMail(env, { to: e.owner_email, kind: 'rejected', entry_id: id, subject: 'About your dedication',
      text: `Thanks for making a dedication for ${e.dog_name}. We couldn’t post it to the wall as submitted. If you think that’s a mistake, reply to this email and a person will look.`,
      html: `<p>Thanks for making a dedication for ${h(e.dog_name)}. We couldn’t post it to the wall as submitted. If you think that’s a mistake, reply to this email and a person will look.</p>` });
  } else {
    await env.DB.prepare('UPDATE entries SET screen_result = ?, screened_at = ? WHERE id = ?').bind(JSON.stringify(v), t, id).run();
    // stays pending for the admin queue
  }
}

async function notifyLive(env, e) {
  const page = `${site(env)}/d/${e.id}`;
  const inviteUrl = `${site(env)}/i/${e.invite_code}`;
  const removeUrl = `${site(env)}/api/remove?id=${e.id}&key=${await sha256(`${env.SESSION_SECRET || 'dev'}|remove|${e.id}`)}`;
  await sendMail(env, { to: e.owner_email, kind: 'live', entry_id: e.id,
    subject: `${e.dog_name} is on the wall`,
    text: `${e.dog_name}’s dedication is live:\n${page}\n\nShare this link so friends can see it and leave a heart:\n${inviteUrl}\n\nTo take it down at any time:\n${removeUrl}`,
    html: `<p><strong>${h(e.dog_name)}</strong>’s dedication is live: <a href="${page}">${page}</a></p><p>Share this link so friends can see it and leave a heart:<br><a href="${inviteUrl}">${inviteUrl}</a></p><p style="color:#6f665d;font-size:13px">To take it down at any time: <a href="${removeUrl}">remove this dedication</a>.</p>` });
}

async function subscribeNewsletter(env, email) {
  if (!env.MAILERLITE_API_KEY || !env.MAILERLITE_GROUP_ID) return;
  try {
    await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.MAILERLITE_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, groups: [env.MAILERLITE_GROUP_ID] }),
    });
  } catch (e) { console.error('mailerlite', e); }
}

async function mine(env, request) {
  const sess = await requireSession(env, request);
  if (!sess) return bad('sign in first', 401);
  const { results } = await env.DB.prepare('SELECT id, dog_name, line, mode, status, hearts, invite_code, created_at, live_at FROM entries WHERE owner_email = ? AND status != \'removed\' ORDER BY created_at DESC').bind(sess.email).all();
  return json({ ok: true, email: sess.email, entries: results });
}

// Owner removal: the signed link from the "live" email (GET) or a signed-in POST.
async function remove(env, request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || (await request.formData().catch(() => null))?.get('id');
  if (!id) return bad('id needed');
  const key = url.searchParams.get('key');
  let allowed = false;
  if (key && key === (await sha256(`${env.SESSION_SECRET || 'dev'}|remove|${id}`))) allowed = true;
  if (!allowed) {
    const sess = await requireSession(env, request);
    const e = await env.DB.prepare('SELECT owner_email FROM entries WHERE id = ?').bind(id).first();
    allowed = !!(sess && e && e.owner_email === sess.email);
  }
  if (!allowed) return bad('not allowed', 403);
  await env.DB.prepare('UPDATE entries SET status = \'removed\', removed_at = ? WHERE id = ? AND status != \'removed\'').bind(now(), id).run();
  return html(simplePage({ title: 'Removed', bodyHtml: '<p>The dedication is off the wall. The photo is kept only as long as the Privacy Policy says. <a href="/">Make another any time.</a></p>', noindex: true }));
}

// ---------------------------------------------------------------- the wall
async function wall(env, request, memory) {
  const s = await settings(env);
  const mode = memory ? 'in_memory' : 'for';
  const { results } = await env.DB.prepare('SELECT id, dog_name, line, hearts FROM entries WHERE status = \'live\' AND mode = ? AND is_test = 0 ORDER BY live_at DESC LIMIT 200').bind(mode).all();
  let dotd = null;
  if (!memory) {
    dotd = s.dogOfTheDay ? await env.DB.prepare('SELECT id, dog_name, line FROM entries WHERE id = ? AND status = \'live\'').bind(s.dogOfTheDay).first() : null;
    if (!dotd && results.length) {
      // deterministic daily pick: the day's hash picks a live entry
      const idx = parseInt((await sha256(centralDay())).slice(0, 8), 16) % results.length;
      dotd = results[idx];
    }
  }
  let goal = null;
  if (s.contestEnabled && !memory) {
    const since = await lastRoundClose(env);
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM round_optins o JOIN entries e ON e.id = o.entry_id WHERE o.round_id IS NULL AND e.status = \'live\' AND e.is_test = 0 AND o.consented_at > ?').bind(since).first()).n;
    goal = n >= s.thresholdEntries ? `The next contest round can open: ${n} dedications are entered.` : `The next contest round opens at ${s.thresholdEntries} entered dedications. ${n} so far.`;
  }
  return html(wallPage({ entries: results, dotd, memory, goal, site: site(env) }), 200, { 'cache-control': 'public, max-age=60' });
}

async function lastRoundClose(env) {
  const r = await env.DB.prepare('SELECT MAX(closed_at) AS t FROM rounds').first();
  return r?.t || 0;
}

async function dog(env, request, id) {
  id = id.replace(/[^a-z0-9]/g, '');
  const e = await env.DB.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first();
  if (!e || e.status !== 'live') return html(notFoundPage(), 404);
  const vh = await visitorHash(request, env.SESSION_SECRET || 'dev');
  const hearted = !!(await env.DB.prepare('SELECT 1 FROM hearts WHERE entry_id = ? AND visitor_hash = ? AND day = ?').bind(id, vh, centralDay()).first());
  return html(dogPage({ e, site: site(env), hearted }), 200, { 'cache-control': 'public, max-age=60' });
}

async function photo(env, request, rest) {
  const m = /^([a-z0-9]+)\/(story|feed|card)\.jpg$/.exec(rest);
  if (!m) return new Response('not found', { status: 404 });
  const e = await env.DB.prepare('SELECT status, story_key, feed_key, card_key FROM entries WHERE id = ?').bind(m[1]).first();
  if (!e || e.status !== 'live') return new Response('not found', { status: 404 });
  const key = { story: e.story_key, feed: e.feed_key, card: e.card_key }[m[2]];
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=86400');
  return new Response(obj.body, { headers });
}

async function heart(env, request) {
  const form = await request.formData().catch(() => null);
  const id = String(form?.get('entry_id') || '').replace(/[^a-z0-9]/g, '');
  if (!id) return bad('entry_id needed');
  const e = await env.DB.prepare('SELECT status FROM entries WHERE id = ?').bind(id).first();
  if (!e || e.status !== 'live') return bad('not found', 404);
  const vh = await visitorHash(request, env.SESSION_SECRET || 'dev');
  const r = await env.DB.prepare('INSERT OR IGNORE INTO hearts (entry_id, visitor_hash, day) VALUES (?,?,?)').bind(id, vh, centralDay()).run();
  if (r.meta.changes) await env.DB.prepare('UPDATE entries SET hearts = hearts + 1 WHERE id = ?').bind(id).run();
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  if (wantsJson) {
    const n = (await env.DB.prepare('SELECT hearts FROM entries WHERE id = ?').bind(id).first()).hearts;
    return json({ ok: true, hearts: n, counted: !!r.meta.changes });
  }
  return Response.redirect(`${site(env)}/d/${id}`, 303);
}

async function invite(env, request, code) {
  code = code.replace(/[^a-z0-9]/g, '');
  const inv = await env.DB.prepare('SELECT entry_id FROM invites WHERE code = ?').bind(code).first();
  if (!inv) return html(notFoundPage(), 404);
  await env.DB.prepare('UPDATE invites SET visits = visits + 1 WHERE code = ?').bind(code).run();
  return Response.redirect(`${site(env)}/d/${inv.entry_id}?via=invite`, 302);
}

async function requestBackground(env, request) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.text || '').trim().slice(0, 500);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  if (!text) return bad('say what you’d like');
  await env.DB.prepare('INSERT INTO requests (text, email, created_at) VALUES (?,?,?)').bind(text, validEmail(email) ? email : null, now()).run();
  if (env.CONTACT_EMAIL) {
    await sendMail(env, { to: env.CONTACT_EMAIL, kind: 'alert', subject: 'Background request', text: `${text}\n\nfrom: ${email || '(no email)'}`, html: `<p>${h(text)}</p><p>from: ${h(email || '(no email)')}</p>` });
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------- rules and rounds (dark until approved)
async function rules(env) {
  const s = await settings(env);
  const body = `
<p class="small">Rules version ${h(s.rulesVersion)}. The contest has not opened. The Official Rules will appear here, in full, once approved; until then this page is a placeholder and no round can be scheduled.</p>
<h2>In plain words</h2>
<p>Posting a dedication is free and is not an entry. Entering a contest round is a separate box you tick. Voting needs a verified email, one vote per dog per day. Prizes are a signed paperback and the Gold edition of your dog’s page. You can take your dedication down at any time from the link in your email.</p>
<p>Questions: <a href="mailto:${h(env.CONTACT_EMAIL || 'admin@brockalston.com')}">${h(env.CONTACT_EMAIL || 'admin@brockalston.com')}</a>.</p>`;
  return html(simplePage({ title: 'Contest rules', description: 'Official Rules for the Dedication Wall Contest.', bodyHtml: body, site: site(env), path: '/rules' }));
}

async function rounds(env, request, rest) {
  const s = await settings(env);
  if (!s.contestEnabled) return html(notFoundPage(), 404);
  const id = Number(rest.replace(/[^0-9]/g, ''));
  const r = await env.DB.prepare('SELECT * FROM rounds WHERE number = ?').bind(id).first();
  if (!r) return html(notFoundPage(), 404);
  const notice = JSON.parse(r.notice);
  const body = `<h2>Round ${r.number}</h2><p class="small">Rules version ${h(r.rules_version)} · ${h(r.status)}</p><p>${h(notice.summary || '')}</p>`;
  return html(simplePage({ title: `Round ${r.number}`, bodyHtml: body, site: site(env), path: `/rounds/${r.number}` }));
}

async function vote(env, request) {
  const s = await settings(env);
  if (!s.contestEnabled) return bad('the contest is not open', 403);
  return bad('voting opens with the first round', 403); // built in the contest block
}

// ---------------------------------------------------------------- admin (token in header or ?token=, then cookie)
async function adminAuth(env, request, url) {
  if (!env.ADMIN_TOKEN) return false;
  const t = request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (t && t === env.ADMIN_TOKEN) return true;
  const m = /(?:^|;\s*)dw_admin=([^;]+)/.exec(request.headers.get('cookie') || '');
  return !!(m && m[1] === (await sha256(`${env.ADMIN_TOKEN}|admin`)));
}

async function admin(env, request, url) {
  if (!(await adminAuth(env, request, url))) return bad('admin token needed', 401);
  const p = url.pathname.replace(/^\/api\/admin\/?/, '');
  if (p === 'queue' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, dog_name, line, mode, owner_email, status, screen_result, created_at, is_test FROM entries WHERE status = \'pending\' ORDER BY created_at ASC LIMIT 100').all();
    return json({ ok: true, entries: results });
  }
  if (p === 'entries' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, dog_name, line, mode, owner_email, status, hearts, created_at, live_at, is_test FROM entries ORDER BY created_at DESC LIMIT 200').all();
    return json({ ok: true, entries: results });
  }
  if (p === 'decide' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const id = String(b.id || ''), to = String(b.status || '');
    if (!['live', 'rejected', 'hidden'].includes(to)) return bad('status must be live, rejected or hidden');
    const e = await env.DB.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first();
    if (!e) return bad('not found', 404);
    const t = now();
    if (to === 'live') {
      await env.DB.prepare('UPDATE entries SET status = \'live\', live_at = COALESCE(live_at, ?) WHERE id = ?').bind(t, id).run();
      if (!e.live_at) await notifyLive(env, { ...e, live_at: t });
    } else {
      await env.DB.prepare('UPDATE entries SET status = ? WHERE id = ?').bind(to, id).run();
    }
    return json({ ok: true, id, status: to });
  }
  if (p === 'settings' && request.method === 'GET') return json({ ok: true, settings: await settings(env) });
  if (p === 'settings' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const allowed = ['contest_enabled', 'threshold_entries', 'threshold_days', 'voting_days', 'rules_version', 'prize_text', 'judge_name', 'alternate_judge', 'dog_of_the_day'];
    const stmts = [];
    for (const [k, v] of Object.entries(b)) {
      if (!allowed.includes(k)) continue;
      stmts.push(env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, String(v), now()));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, settings: await settings(env) });
  }
  if (p === 'requests' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT 200').all();
    return json({ ok: true, requests: results });
  }
  if (p === 'notices' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM notices ORDER BY sent_at DESC LIMIT 100').all();
    return json({ ok: true, notices: results });
  }
  if (p === 'stats' && request.method === 'GET') {
    const q = async (sql) => (await env.DB.prepare(sql).first());
    return json({ ok: true,
      entries: await q('SELECT status, COUNT(*) AS n FROM entries GROUP BY status'),
      live: (await q('SELECT COUNT(*) AS n FROM entries WHERE status = \'live\' AND is_test = 0')).n,
      hearts: (await q('SELECT COALESCE(SUM(hearts),0) AS n FROM entries')).n,
      owners: (await q('SELECT COUNT(*) AS n FROM owners')).n,
      invites: (await q('SELECT COALESCE(SUM(visits),0) AS n FROM invites')).n,
      requests: (await q('SELECT COUNT(*) AS n FROM requests WHERE status = \'new\'')).n,
    });
  }
  return bad('no such admin route', 404);
}

async function adminPage(env, request, url) {
  if (!(await adminAuth(env, request, url))) {
    return html(simplePage({ title: 'Admin', bodyHtml: '<p>Admin token needed. Open this page with <code>?token=…</code> once; a cookie keeps you signed in.</p>', noindex: true }), 401);
  }
  const headers = {};
  if (url.searchParams.get('token')) headers['set-cookie'] = `dw_admin=${await sha256(`${env.ADMIN_TOKEN}|admin`)}; Path=/; Max-Age=${90 * 86400}; HttpOnly; SameSite=Lax; Secure`;
  const s = await settings(env);
  const { results: queue } = await env.DB.prepare('SELECT id, dog_name, line, mode, owner_email, screen_result, created_at, is_test FROM entries WHERE status = \'pending\' ORDER BY created_at ASC LIMIT 50').all();
  const body = `
<h2>Queue (${queue.length})</h2>
${queue.length ? queue.map((e) => `<div class="dotd" style="grid-template-columns:120px 1fr"><img src="/p/${h(e.id)}/card.jpg" onerror="this.style.visibility='hidden'" alt="" /><div><strong>${h(e.dog_name)}</strong> · ${e.mode === 'in_memory' ? 'In memory' : 'For'} · ${h(e.owner_email)}${e.is_test ? ' · TEST' : ''}<br><em>${h(e.line)}</em><br><span class="small">${h(e.screen_result || 'not screened yet')}</span><div class="row"><button class="btn" onclick="decide('${h(e.id)}','live')">Publish</button><button class="btn quiet" onclick="decide('${h(e.id)}','rejected')">Reject</button></div></div></div>`).join('') : '<p class="small">Nothing waiting.</p>'}
<h2>Switches</h2>
<form onsubmit="return saveSettings(event)">
<p><label><input type="checkbox" name="contest_enabled" ${s.contestEnabled ? 'checked' : ''}/> Contest module on</label></p>
<p><label>Entries needed <input name="threshold_entries" value="${s.thresholdEntries}" size="4"/></label> &nbsp; <label>Days since last close <input name="threshold_days" value="${s.thresholdDays}" size="4"/></label> &nbsp; <label>Voting days <input name="voting_days" value="${s.votingDays}" size="4"/></label></p>
<p><label>Rules version <input name="rules_version" value="${h(s.rulesVersion)}" size="28"/></label></p>
<p><label>Prize text<br><textarea name="prize_text" rows="2" cols="70">${h(s.prizeText)}</textarea></label></p>
<p><label>Judge <input name="judge_name" value="${h(s.judgeName)}"/></label> &nbsp; <label>Alternate judge <input name="alternate_judge" value="${h(s.alternateJudge)}"/></label></p>
<p><label>Dog of the day (entry id, blank = automatic) <input name="dog_of_the_day" value="${h(s.dogOfTheDay)}" size="10"/></label></p>
<p><button class="btn" type="submit">Save</button> <span class="small" id="saved"></span></p>
</form>
<p class="small">Posting on the live site: <strong>${postingOn(env) ? 'ON' : 'OFF'}</strong> (a deploy variable, not a switch here). Round scheduler and score sheets arrive with the contest block.</p>
<script>
async function decide(id, status){ const r = await fetch('/api/admin/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,status})}); if((await r.json()).ok) location.reload(); }
async function saveSettings(ev){ ev.preventDefault(); const f=ev.target; const b={}; for(const el of f.elements){ if(!el.name) continue; b[el.name]= el.type==='checkbox'? String(el.checked) : el.value; } const r=await fetch('/api/admin/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}); document.getElementById('saved').textContent=(await r.json()).ok?'Saved.':'Failed.'; return false; }
</script>`;
  return html(simplePage({ title: 'Admin · Dedication Wall', bodyHtml: body, noindex: true }), 200, headers);
}

// ---------------------------------------------------------------- daily cron
async function daily(env) {
  const s = await settings(env);
  const t = now();
  const since = t - 7 * 86400;
  const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first());
  const newLive = (await q('SELECT COUNT(*) AS n FROM entries WHERE status = \'live\' AND is_test = 0 AND live_at > ?', since)).n;
  const pending = (await q('SELECT COUNT(*) AS n FROM entries WHERE status = \'pending\'')).n;
  const hearts = (await q('SELECT COALESCE(SUM(hearts),0) AS n FROM entries WHERE is_test = 0')).n;
  const requests = (await q('SELECT COUNT(*) AS n FROM requests WHERE status = \'new\'')).n;
  const isMonday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date()) === 'Mon';
  if (isMonday && env.CONTACT_EMAIL) {
    await sendMail(env, { to: env.CONTACT_EMAIL, kind: 'digest', subject: 'Dedication Wall, this week',
      text: `New dogs on the wall: ${newLive}\nWaiting in the queue: ${pending}\nHearts so far: ${hearts}\nBackground requests open: ${requests}\n\nAdmin: ${site(env)}/admin`,
      html: `<p>New dogs on the wall: <strong>${newLive}</strong><br>Waiting in the queue: <strong>${pending}</strong><br>Hearts so far: ${hearts}<br>Background requests open: ${requests}</p><p><a href="${site(env)}/admin">Admin</a></p>` });
  }
  if (s.contestEnabled && env.CONTACT_EMAIL) {
    const closed = await lastRoundClose(env);
    const n = (await q('SELECT COUNT(*) AS n FROM round_optins o JOIN entries e ON e.id = o.entry_id WHERE o.round_id IS NULL AND e.status = \'live\' AND e.is_test = 0 AND o.consented_at > ?', closed)).n;
    const daysSince = closed ? Math.floor((t - closed) / 86400) : 9999;
    const open = await q('SELECT COUNT(*) AS n FROM rounds WHERE status IN (\'announced\',\'voting\')');
    if (!open.n && n >= s.thresholdEntries && daysSince >= s.thresholdDays) {
      await sendMail(env, { to: env.CONTACT_EMAIL, kind: 'alert', subject: 'Open a round?', text: `${n} entered dedications and ${daysSince} days since the last close. Nothing opens until you publish a notice in /admin.`, html: `<p>${n} entered dedications and ${daysSince} days since the last close. Nothing opens until you publish a notice in <a href="${site(env)}/admin">/admin</a>.</p>` });
    }
  }
}
