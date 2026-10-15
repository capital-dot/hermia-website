/* Hermia connections, shared by the configuration journey and the connections page.
   The browser holds one signed session for the business's record (localStorage), created on the
   email screen. Each card opens that platform's own sign-in and comes back here with a tick. */
(function () {
  'use strict';
  var API = 'https://platform.hermia.au';
  var INTAKE = 'https://intake.hermia.au';
  var KEY = 'hermia_cfg_session';
  var SOCIAL = { facebook: 1, instagram: 1, tiktok: 1 };
  var NAMES = { gmail: 'Gmail', outlook: 'Outlook', simpro: 'Simpro', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', social: 'your account' };
  var TIKTOK_BLOCKED = ['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czechia', 'czech republic', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'iceland', 'liechtenstein', 'norway', 'switzerland', 'united kingdom'];
  var ICON = {
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.6 2.6 2.4 4.3 5 4.6"/></svg>',
    system: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
  };
  var LOGO = { facebook: 'assets/channels/facebook-96.webp', instagram: 'assets/channels/instagram-96.webp', simpro: 'Partner_Logo_Horizontal_Registered.png' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function token() { var s = read(); return s && s.token && (!s.exp || Date.parse(s.exp) > Date.now()) ? s.token : ''; }
  function save(t, exp) { try { localStorage.setItem(KEY, JSON.stringify({ token: t, exp: exp || new Date(Date.now() + 6 * 864e5).toISOString() })); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok && d && d.ok !== false, status: r.status, data: d || {} }; }); });
  }
  // Create (or refresh) the business record for this journey. Fields: email, businessName, fullName, phone, country, industry.
  function start(fields) {
    return post(API + '/configuration/start', Object.assign({}, fields, { token: token() || undefined })).then(function (r) {
      if (r.ok && r.data.token) { save(r.data.token, r.data.expiresAt); return r.data.token; }
      throw new Error(r.data.error || 'We could not save your progress.');
    });
  }
  function state() {
    var t = token();
    if (!t) return Promise.resolve(null);
    return post(API + '/connections/state', { token: t }).then(function (r) {
      if (r.status === 401) { clear(); return null; }
      return r.ok ? r.data : null;
    }).catch(function () { return null; });
  }
  // Open a platform's sign-in. opts: returnUrl, sources (the picks), build + domain (Simpro).
  function begin(kind, opts) {
    opts = opts || {};
    var t = token();
    if (!t) return Promise.reject(new Error('Your session has ended. Go back to your details and press Next to continue.'));
    var req = SOCIAL[kind]
      ? post(INTAKE + '/connect/social/start', { token: t, platform: kind, sources: opts.sources || [], returnUrl: opts.returnUrl })
      : post(API + '/connect/start', { token: t, kind: kind, returnUrl: opts.returnUrl, build: opts.build, domain: opts.domain });
    return req.then(function (r) {
      if (r.status === 401) clear();
      if (!r.ok || !r.data.url) throw new Error(r.data.error || 'This connection is not available right now. Please try again.');
      location.href = r.data.url;
    });
  }
  // What a sign-in sent back (?connected=gmail or ?connect_error=gmail&reason=...), then tidy the address bar.
  function readReturn() {
    var q = new URLSearchParams(location.search);
    var out = { connected: q.get('connected'), error: q.get('connect_error'), reason: q.get('reason') };
    if (out.connected || out.error) {
      ['connected', 'connect_error', 'reason', 'profileId', 'accountId', 'username'].forEach(function (k) { q.delete(k); });
      try { history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash); } catch (e) {}
    }
    return out;
  }
  function errorText(kind, reason) {
    var n = NAMES[kind] || 'That account';
    if (reason === 'owned_by_other') return n + ' is already connected to another Hermia account. If that is yours too, email info@hermia.au.';
    if (reason === 'access_denied' || reason === 'user_cancelled' || reason === 'cancelled') return 'The ' + n + ' sign-in was cancelled. Nothing was connected.';
    if (reason === 'expired') return 'That took too long. Please connect ' + n + ' again.';
    if (reason === 'missing_tiktok_permissions') return 'TikTok needs every permission ticked on its screen. Please connect again and accept them all.';
    return n + ' didn’t connect. Please try again.';
  }
  function tiktokAllowed(country) { return TIKTOK_BLOCKED.indexOf(String(country || '').trim().toLowerCase()) === -1; }

  // Cards for what the business picked. picks: {sources, inbox, conv, crm, crmOther, calendar}.
  function cards(picks, st) {
    picks = picks || {};
    var sources = Array.isArray(picks.sources) ? picks.sources : [];
    var con = (st && st.connections) || { inbox: {}, simpro: {}, social: {} };
    var social = con.social || {};
    var groups = [];
    var where = [];
    if (sources.indexOf('email') > -1 || picks.conv === 'email') {
      var inbox = picks.inbox === 'outlook' ? 'outlook' : (picks.inbox === 'gmail' ? 'gmail' : '');
      var inboxOn = Boolean(con.inbox && con.inbox.connected) && (!inbox || !con.inbox.provider || con.inbox.provider === inbox);
      where.push({ id: inbox || 'inbox', kind: inbox ? 'connect' : 'choice', icon: 'mail', name: inbox ? NAMES[inbox] : 'Your inbox', sub: 'Enquiries that reach your inbox, and replies from your address', state: inboxOn ? 'done' : 'todo' });
    }
    ['facebook', 'instagram', 'tiktok'].forEach(function (p) {
      if (sources.indexOf(p) === -1) return;
      var row = social[p] || null;
      var sub = p === 'facebook' ? 'Messages to your Facebook Page' : (p === 'instagram' ? 'Messages to your Instagram account' : 'Messages to your TikTok business account');
      where.push({ id: p, kind: 'connect', icon: p === 'tiktok' ? 'note' : 'chat', logo: LOGO[p], name: NAMES[p], sub: sub, as: row && row.account, state: row ? (row.status === 'connected' ? 'done' : 'attention') : 'todo', note: row && row.status !== 'connected' ? 'Disconnected. Reconnect to keep Hermia answering here.' : '' });
    });
    if (where.length) groups.push({ title: 'Where enquiries come from', cards: where });
    var sys = [];
    if (picks.crm === 'simpro') sys.push({ id: 'simpro', kind: 'simpro', icon: 'system', logo: LOGO.simpro, logoWide: true, name: 'Simpro', sub: 'Every finished enquiry, written into Simpro', state: con.simpro && con.simpro.connected ? 'done' : 'todo' });
    else if (picks.crm === 'other') sys.push({ id: 'crm-email', kind: 'info', icon: 'system', name: picks.crmOther ? String(picks.crmOther) : 'Your system', sub: 'Each finished brief is emailed to your team', text: 'Nothing to connect.' });
    else if (picks.crm === 'none') sys.push({ id: 'crm-none', kind: 'info', icon: 'system', name: 'Briefs by email', sub: 'Each finished brief is emailed to your team', text: 'Nothing to connect.' });
    if (sys.length) groups.push({ title: 'Your system', cards: sys });
    if (picks.calendar === 'simpro') groups.push({ title: 'Bookings', cards: [{ id: 'simpro-cal', kind: 'info', icon: 'calendar', name: 'Your Simpro calendar', sub: 'Bookings go into Simpro, approved by your team', text: 'Nothing extra to connect: this works through your Simpro connection.' }] });
    return groups;
  }
  function counts(groups) {
    var total = 0, done = 0;
    groups.forEach(function (g) { g.cards.forEach(function (c) { if (c.kind === 'info') return; total++; if (c.state === 'done') done++; }); });
    return { total: total, done: done };
  }
  function statusText(c) {
    if (c.state === 'done') return 'Connected' + (c.as ? ' as ' + c.as : '');
    if (c.state === 'working') return 'Opening ' + c.name + '…';
    if (c.state === 'attention') return c.note || 'Needs reconnecting';
    return 'Not connected yet';
  }
  function button(c) {
    if (c.kind === 'info' || c.kind === 'choice' || c.kind === 'simpro') return '';
    if (c.state === 'working') return '<button class="cx-btn" type="button" disabled><span class="cx-spin" aria-hidden="true"></span>Connecting</button>';
    if (c.state === 'done') return '<button class="cx-btn ghost small" type="button" data-cx-act="reconnect" data-cx-id="' + esc(c.id) + '">Reconnect</button>';
    return '<button class="cx-btn" type="button" data-cx-act="connect" data-cx-id="' + esc(c.id) + '">' + (c.state === 'attention' ? 'Reconnect' : 'Connect') + '</button>';
  }
  function detail(c) {
    if (c.kind === 'choice') return '<div class="cx-detail"><div class="cx-field"><button class="cx-btn" type="button" data-cx-act="connect" data-cx-id="gmail">Gmail</button><button class="cx-btn ghost" type="button" data-cx-act="connect" data-cx-id="outlook">Outlook</button></div></div>';
    if (c.kind === 'simpro' && c.state !== 'done') {
      return '<div class="cx-detail"><label class="cx-small" for="cx-simpro-build">Your Simpro address</label>' +
        '<div class="cx-field"><input id="cx-simpro-build" autocomplete="off" inputmode="url" placeholder="yourcompany" maxlength="63" aria-label="Your Simpro address, the part before .simprosuite.com">' +
        '<select id="cx-simpro-domain" aria-label="Simpro domain"><option value="simprosuite.com">.simprosuite.com</option><option value="simprocloud.com">.simprocloud.com</option></select>' +
        '<button class="cx-btn" type="button" data-cx-act="connect" data-cx-id="simpro">' + (c.state === 'working' ? '<span class="cx-spin" aria-hidden="true"></span>Connecting' : 'Connect') + '</button></div>' +
        '<div class="cx-small">The address you sign in to Simpro with, for example <b>harbourplumbing</b>.simprosuite.com.</div></div>';
    }
    return '';
  }
  function icon(c) {
    if (c.logo) return '<span class="cx-icon' + (c.logoWide ? ' logo' : '') + '" aria-hidden="true"><img src="' + esc(c.logo) + '" alt=""></span>';
    return '<span class="cx-icon" aria-hidden="true">' + (ICON[c.icon] || ICON.system) + '</span>';
  }
  function render(groups) {
    return groups.map(function (g) {
      var t = 0, d = 0;
      g.cards.forEach(function (c) { if (c.kind !== 'info') { t++; if (c.state === 'done') d++; } });
      return '<section class="cx-group" aria-label="' + esc(g.title) + '"><div class="cx-group-head"><h3>' + esc(g.title) + '</h3><span class="cx-mono">' + (t ? d + ' of ' + t : 'Nothing to connect') + '</span></div><div class="cx-cards">' +
        g.cards.map(function (c) {
          var stat = c.kind === 'info' ? '<div class="cx-info">' + esc(c.text) + '</div>' : '<div class="cx-status"><span class="cx-dot" aria-hidden="true"></span><span>' + esc(statusText(c)) + '</span></div>';
          return '<article class="cx-card' + (c.wide ? ' wide' : '') + (c.state ? ' ' + c.state : '') + '" id="cx-' + esc(c.id) + '"><div class="cx-row">' + icon(c) +
            '<div class="cx-what"><b>' + esc(c.name) + '</b><span>' + esc(c.sub) + '</span>' + stat + '</div>' + button(c) + '</div>' + detail(c) + '</article>';
        }).join('') + '</div></section>';
    }).join('');
  }
  // Wire a container: clicks on Connect / Reconnect open the sign-in. onMessage(text, isError) shows feedback.
  function wire(container, getPicks, returnUrl, onMessage) {
    container.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cx-act]');
      if (!b) return;
      var id = b.getAttribute('data-cx-id');
      var opts = { returnUrl: typeof returnUrl === 'function' ? returnUrl() : returnUrl, sources: (getPicks() || {}).sources || [] };
      if (id === 'simpro') {
        var bi = container.querySelector('#cx-simpro-build');
        var raw = String(bi && bi.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        var m = raw.match(/^([a-z0-9-]+)(?:\.(simprosuite\.com|simprocloud\.com))?$/);
        if (!m) { onMessage('Enter your Simpro address, for example harbourplumbing.', true); if (bi) bi.focus(); return; }
        opts.build = m[1];
        opts.domain = m[2] || (container.querySelector('#cx-simpro-domain') || {}).value || 'simprosuite.com';
      }
      b.disabled = true;
      b.innerHTML = '<span class="cx-spin" aria-hidden="true"></span>Opening';
      begin(id, opts).catch(function (err) {
        b.disabled = false;
        b.textContent = 'Try again';
        onMessage(err && err.message ? err.message : 'That didn’t work. Please try again.', true);
      });
    });
  }
  window.HermiaConnect = { API: API, INTAKE: INTAKE, token: token, save: save, clear: clear, start: start, state: state, begin: begin, readReturn: readReturn, errorText: errorText, names: NAMES, tiktokAllowed: tiktokAllowed, cards: cards, counts: counts, render: render, wire: wire, esc: esc };
}());
