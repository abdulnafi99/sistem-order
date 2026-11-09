// =====================================================================
// TAPJERR.io – Kitchen Display System (KDS)
// New Orders → Preparing → Ready → Completed, live, with sound alerts.
// =====================================================================
import { initApi } from '../core/api.js';
import { hasPerm } from '../core/server-logic.js';
import { DEMO_STAFF } from '../core/seed.js';
import { $, $$, esc, icon, toast, errMsg, chime, unlockAudio, registerSW, hideSplash, demoBanner, logoMark, formData, fmtTime, printHtml } from '../core/ui.js';

const K = { api: null, staff: null, settings: {}, active: [], done: [], loaded: false, seen: new Set(), tab: ['new', 'prep', 'ready', 'done'].includes(sessionStorage.getItem('sc_kds_tab')) ? sessionStorage.getItem('sc_kds_tab') : 'new', soundReady: false, struck: JSON.parse(sessionStorage.getItem('eh_kds_struck') || '{}') };
let subs = [];
let queued = false;

const COLS = [
  { key: 'new', title: 'New Orders', cls: 'col-new', match: (o) => o.status === 'received' || o.status === 'confirmed', ic: 'bell' },
  { key: 'prep', title: 'Preparing', cls: 'col-prep', match: (o) => o.status === 'preparing', ic: 'chef' },
  { key: 'ready', title: 'Ready', cls: 'col-ready', match: (o) => o.status === 'ready', ic: 'check' },
  { key: 'done', title: 'Completed', cls: 'col-done', match: (o) => o.status === 'completed', ic: 'receipt' },
];
const ACTION = {
  received: ['confirmed', 'Accept Order', 'btn-primary'],
  confirmed: ['preparing', 'Start Preparing', 'btn-gold'],
  preparing: ['ready', 'Mark as Ready', 'btn-primary'],
  ready: ['completed', 'Complete Order', 'btn-dark'],
};

async function boot() {
  registerSW();
  try { K.api = await initApi('staff'); } catch (e) { hideSplash(); $('#root').innerHTML = `<div class="kds-empty" style="padding-top:120px">${esc(errMsg(e))}</div>`; return; }
  K.api.watchDoc('settings', 'general', (s) => { K.settings = s || {}; schedule(); });
  K.api.auth.onChange((u) => {
    const prev = K.staff && K.staff.uid;
    K.staff = u && u.staff ? u.staff : null;
    if (K.staff && !hasPerm(K.staff, 'kitchen')) { renderLogin('Your account does not have kitchen access.'); return; }
    if (K.staff && K.staff.uid !== prev) start();
    if (!K.staff) { subs.forEach((f) => f()); subs = []; renderLogin(); } else schedule();
  });
  hideSplash();
  setInterval(() => { if (K.staff) { updateClock(); updateTimers(); } }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
}

function start() {
  subs.forEach((f) => f()); subs = []; K.loaded = false;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  subs.push(K.api.watch('orders', { where: [['status', 'in', ['received', 'confirmed', 'preparing', 'ready']]] }, (orders) => {
    const fresh = orders.filter((o) => o.status === 'received' && !K.seen.has(o.id));
    if (K.loaded && fresh.length) { chime('new'); flashTitle(fresh.length); }
    orders.forEach((o) => K.seen.add(o.id));
    K.active = orders.sort(sortOrders); K.loaded = true; schedule();
  }));
  subs.push(K.api.watch('orders', { where: [['createdAt', '>=', d.getTime()]], orderBy: ['createdAt', 'desc'], limit: 80 }, (orders) => {
    K.done = orders.filter((o) => o.status === 'completed').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 20); schedule();
  }));
}

// takeaway orders are sorted by pickup time, dine-in by order time
const due = (o) => (o.type === 'takeaway' && o.pickup && o.pickup.at ? o.pickup.at - Number(K.settings.pickupLeadMinutes || 15) * 60e3 : o.createdAt);
const sortOrders = (a, b) => due(a) - due(b);

let titleTimer = null;
function flashTitle(n) {
  clearInterval(titleTimer);
  let on = false; let count = 0;
  titleTimer = setInterval(() => { document.title = (on = !on) ? `🔔 ${n} NEW ORDER${n > 1 ? 'S' : ''}` : 'Kitchen Display · TAPJERR.io'; if (++count > 12) { clearInterval(titleTimer); document.title = 'Kitchen Display · TAPJERR.io'; } }, 700);
}

function renderLogin(msg) {
  const s = K.settings;
  $('#root').innerHTML = `<div class="login-screen" style="grid-template-columns:1fr"><div class="login-form-wrap"><div class="login-card">
    <div class="row mb">${logoMark(s, 52)}<div><b style="font-family:var(--font-serif);font-size:22px">${esc(s.restaurantName || 'SELAGI COFFEE')}</b><div class="xs muted" style="letter-spacing:.14em">KITCHEN DISPLAY · TAPJERR.io</div></div></div>
    ${demoBanner(K.api)}${msg ? `<div class="chip red mb" style="white-space:normal">${esc(msg)}</div>` : ''}
    <form class="stack" id="kl"><label class="field"><span>Email</span><input class="input" name="email" type="email" required></label><label class="field"><span>Password</span><input class="input" name="password" type="password" required></label><button class="btn btn-primary btn-lg btn-block">Open Kitchen Display</button></form>
    ${K.api.mode === 'demo' ? `<div class="demo-creds">${DEMO_STAFF.filter((d) => ['kitchen', 'super_admin', 'waiter'].includes(d.role)).map((d) => `<button data-e="${d.email}" data-p="${d.password}">${d.email} / ${d.password}</button>`).join('')}</div>` : ''}
    <p class="xs muted center mt"><a href="admin.html">Admin dashboard</a></p></div></div></div>`;
  $$('[data-e]').forEach((b) => b.addEventListener('click', () => { $('[name=email]').value = b.dataset.e; $('[name=password]').value = b.dataset.p; }));
  $('#kl').addEventListener('submit', async (e) => {
    e.preventDefault(); const d = formData(e.target); const btn = e.target.querySelector('button'); btn.classList.add('loading');
    try { unlockAudio(); K.soundReady = true; await K.api.auth.login(d.email, d.password); } catch (err) { toast(errMsg(err), 'error'); } finally { btn.classList.remove('loading'); }
  });
}

function schedule() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); }

function render() {
  if (!K.staff) return;
  const all = [...K.active, ...K.done];
  if (!$('#kds')) {
    $('#root').innerHTML = `<div id="kds"><header class="kds-top">${logoMark(K.settings, 38, 10)}<h1>Kitchen</h1><span class="clock" id="clock"></span><span class="grow"></span>
      <span class="stat" id="kstats"></span>
      <span id="sound-slot"></span>
      <button class="icon-btn" id="fs" title="Fullscreen">${icon('external', 20)}</button>
      <button class="icon-btn" id="klogout" title="Sign out">${icon('logout', 20)}</button></header>
      ${demoBanner(K.api)}
      <nav class="kds-seg" id="ktabs" role="tablist" aria-label="Order stages"><span class="seg-pill" aria-hidden="true"></span>${COLS.map((c) => `<button role="tab" data-tab="${c.key}" aria-selected="false">${icon(c.ic, 18)}<span class="seg-label">${c.title}</span><span class="seg-count" data-count="${c.key}">0</span></button>`).join('')}</nav>
      <main class="kds-board" id="board"></main></div>`;
    bind();
    $('#ktabs').classList.add('no-anim');
  }
  $('#sound-slot').innerHTML = K.soundReady ? `<button class="icon-btn" id="test-sound" title="Test sound">${icon('volume', 20)}</button>` : `<button class="sound-warn" id="enable-sound" aria-label="Tap to enable sound">${icon('volume', 16)} <span class="sw-text">Tap to enable sound</span></button>`;
  const late = K.active.filter((o) => minutes(o) >= 15 && o.status !== 'ready').length;
  $('#kstats').innerHTML = `<span>Active <b>${K.active.length}</b></span><span>·</span><span>Late <b style="color:${late ? '#ff8a80' : '#fff'}">${late}</b></span><span>·</span><span>Done today <b>${K.done.length}</b></span>`;
  $('#board').innerHTML = COLS.map((c) => {
    const list = all.filter(c.match);
    return `<section class="kds-col ${c.cls} ${K.tab === c.key ? 'show' : ''}" data-col="${c.key}"><div class="kds-col-head"><span>${c.title}</span><span class="cnt">${list.length}</span></div>
      ${list.length ? list.map(ticket).join('') : `<div class="kds-empty">${c.key === 'new' ? 'Waiting for orders…' : 'Nothing here'}</div>`}</section>`;
  }).join('');
  updateTabs(all);
  updateClock(); updateTimers();
}

/** Animated segmented navigation: sliding moss pill + popping counters, updated in place. */
function updateTabs(all) {
  const nav = $('#ktabs');
  const idx = Math.max(0, COLS.findIndex((c) => c.key === K.tab));
  nav.style.setProperty('--i', idx);
  COLS.forEach((c) => {
    const b = $(`[data-tab="${c.key}"]`, nav);
    const on = c.key === K.tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    const cnt = $(`[data-count="${c.key}"]`, nav);
    const n = String(all.filter(c.match).length);
    if (cnt.textContent !== n) { cnt.textContent = n; cnt.classList.remove('count-pop'); void cnt.offsetWidth; cnt.classList.add('count-pop'); }
  });
  if (nav.classList.contains('no-anim')) requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.remove('no-anim')));
}

const minutes = (o) => Math.floor((Date.now() - o.createdAt) / 60000);

function ticket(o) {
  const a = ACTION[o.status];
  const struck = K.struck[o.id] || [];
  const where = o.type === 'dine_in' ? esc(o.tableName || '') : `TAKEAWAY`;
  return `<article class="ticket k-${o.status}" data-id="${esc(o.id)}" data-created="${o.createdAt}">
    <div class="ticket-head"><div><div class="tbl">${where}</div><div class="meta">${esc(o.orderNo)} · ${fmtTime(o.createdAt)}${o.type === 'takeaway' ? ` · ${esc(o.customerName)}${o.pickup && o.pickup.time ? ` · pickup ${esc(o.pickup.time)}` : ''}` : ''}</div></div><span class="timer">${o.status === 'completed' ? fmtTime(o.completedAt) : ''}</span></div>
    <div class="ticket-body">${o.items.map((l, i) => `<div class="ticket-item ${struck.includes(i) ? 'done-item' : ''}" data-strike="${i}"><span class="q">${l.qty}×</span><div class="grow"><b>${esc(l.name)}</b>${l.variant ? `<div class="mods">${esc(l.variant.name)}</div>` : ''}${l.addons && l.addons.length ? `<div class="mods">+ ${l.addons.map((x) => esc(x.name)).join(', ')}</div>` : ''}${l.note ? `<div class="note">⚠ ${esc(l.note)}</div>` : ''}</div></div>`).join('')}</div>
    ${o.note ? `<div class="ticket-note">📝 ${esc(o.note)}</div>` : ''}
    ${a ? `<div class="ticket-foot"><button class="btn ${a[2]}" data-next="${a[0]}">${a[1]}</button><button class="btn btn-ghost" data-print style="flex:0 0 auto" title="Print ticket">${icon('printer', 18)}</button></div>` : ''}
  </article>`;
}

function bind() {
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#enable-sound')) { unlockAudio(); K.soundReady = true; chime('new'); schedule(); return; }
    if (e.target.closest('#test-sound')) { chime('new'); return; }
    if (e.target.closest('#fs')) { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); return; }
    if (e.target.closest('#klogout')) { await K.api.auth.logout(); $('#root').innerHTML = ''; renderLogin(); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      K.tab = tab.dataset.tab; sessionStorage.setItem('sc_kds_tab', K.tab); schedule();
      // on wide screens every column is visible – bring the chosen one into view
      requestAnimationFrame(() => { const col = $(`.kds-col[data-col="${K.tab}"]`); if (col && window.innerWidth >= 1100) col.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' }); });
      return;
    }
    const card = e.target.closest('.ticket'); if (!card) return;
    const o = [...K.active, ...K.done].find((x) => x.id === card.dataset.id); if (!o) return;
    const st = e.target.closest('[data-strike]');
    if (st) { const i = Number(st.dataset.strike); const arr = new Set(K.struck[o.id] || []); arr.has(i) ? arr.delete(i) : arr.add(i); K.struck[o.id] = [...arr]; sessionStorage.setItem('eh_kds_struck', JSON.stringify(K.struck)); schedule(); return; }
    if (e.target.closest('[data-print]')) { printHtml(`Ticket ${o.orderNo}`, `<div class="receipt"><h2 class="center">${esc(o.tableName || 'TAKEAWAY')}</h2><p class="center">${esc(o.orderNo)} · ${fmtTime(o.createdAt)}</p><div class="dash"></div><table>${o.items.map((l) => `<tr><td><b>${l.qty}×</b></td><td><b>${esc(l.name)}</b>${l.variant ? `<br>${esc(l.variant.name)}` : ''}${l.addons && l.addons.length ? `<br>+ ${l.addons.map((x) => esc(x.name)).join(', ')}` : ''}${l.note ? `<br>** ${esc(l.note)}` : ''}</td></tr>`).join('')}</table>${o.note ? `<div class="dash"></div><b>NOTE: ${esc(o.note)}</b>` : ''}</div>`, { width: '80mm' }); return; }
    const nx = e.target.closest('[data-next]');
    if (nx) {
      nx.disabled = true; nx.classList.add('loading');
      try { await K.api.call('updateOrderStatus', { orderId: o.id, status: nx.dataset.next }); if (nx.dataset.next === 'ready') chime('ready'); } catch (err) { toast(errMsg(err), 'error'); nx.disabled = false; nx.classList.remove('loading'); }
    }
  });
}

function updateClock() { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function updateTimers() {
  $$('.ticket').forEach((t) => {
    if (t.classList.contains('k-completed')) return;
    const ms = Date.now() - Number(t.dataset.created);
    const m = Math.floor(ms / 60000); const s = Math.floor((ms % 60000) / 1000);
    $('.timer', t).textContent = `${m}:${String(s).padStart(2, '0')}`;
    t.classList.toggle('late', m >= 15 && !t.classList.contains('k-ready'));
  });
}

boot();
