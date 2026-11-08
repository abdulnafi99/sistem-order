// =====================================================================
// Eden Hall – Admin dashboard (entry, auth, layout, live data)
// =====================================================================
import { initApi } from '../core/api.js';
import { hasPerm, ROLES } from '../core/server-logic.js';
import { DEMO_STAFF } from '../core/seed.js';
import {
  $, $$, esc, icon, toast, errMsg, chime, unlockAudio, timeAgo, registerSW, hideSplash, demoBanner, logoMark, formData, rm, openModal,
} from '../core/ui.js';
import { VIEWS } from './views.js';
import { VIEWS2 } from './views2.js';

export const A = {
  api: null, staff: null, settings: {},
  orders: [], menu: [], categories: [], tables: [], users: [], payments: [], rewards: [], staffList: [], activity: [], notifications: [],
  ordersLoaded: false, view: 'dashboard', arg: null, soundOn: localStorage.getItem('eh_admin_sound') !== '0',
};
const ALL_VIEWS = { ...VIEWS, ...VIEWS2 };

const NAV = [
  ['Operations'],
  ['dashboard', 'dashboard', 'Dashboard', 'dashboard'],
  ['orders', 'receipt', 'Orders', 'orders'],
  ['kitchen', 'chef', 'Kitchen Display', 'kitchen', 'kitchen.html'],
  ['tables', 'qr', 'Tables & QR', 'tables'],
  ['payments', 'wallet', 'Payments', 'payments'],
  ['Catalogue'],
  ['menu', 'menu', 'Menu', 'menu'],
  ['rewards', 'gift', 'Rewards', 'rewards'],
  ['People'],
  ['customers', 'users', 'Customers', 'customers'],
  ['staff', 'staff', 'Staff', 'staff'],
  ['Insights'],
  ['reports', 'chart', 'Reports', 'reports'],
  ['settings', 'settings', 'Settings', 'settings'],
];

let subs = [];
let renderQueued = false;
const seenOrders = new Set();

// ------------------------------------------------------------------ boot
async function boot() {
  registerSW();
  try { A.api = await initApi('staff'); } catch (e) {
    hideSplash();
    $('#root').innerHTML = `<div class="empty" style="padding-top:120px"><h4>Unable to connect</h4><p>${esc(errMsg(e))}</p></div>`;
    return;
  }
  A.api.watchDoc('settings', 'general', (s) => { A.settings = s || {}; schedule(); });
  A.api.auth.onChange((u) => {
    const prev = A.staff && A.staff.uid;
    A.staff = u && u.staff ? u.staff : null;
    if (A.staff && A.staff.uid !== prev) startData();
    if (!A.staff) { stopData(); renderLogin(); }
    else schedule();
  });
  window.addEventListener('hashchange', () => render(true));
  document.addEventListener('click', unlockAudio, { once: true });
  hideSplash();
  if (!A.api.auth.user) renderLogin();
}

function stopData() { subs.forEach((f) => f && f()); subs = []; A.ordersLoaded = false; seenOrders.clear(); }

function startData() {
  stopData();
  const api = A.api;
  const can = (p) => hasPerm(A.staff, p);
  const since = Date.now() - 120 * 864e5;
  const w = (name, opts, key, map = (x) => x) => subs.push(api.watch(name, opts, (d) => { A[key] = map(d); schedule(); }, (e) => console.warn(name, e)));

  subs.push(api.watch('orders', { where: [['createdAt', '>=', since]], orderBy: ['createdAt', 'desc'] }, (orders) => {
    if (A.ordersLoaded) {
      orders.filter((o) => !seenOrders.has(o.id) && o.status === 'received').forEach(newOrderAlert);
    }
    orders.forEach((o) => seenOrders.add(o.id));
    A.orders = orders; A.ordersLoaded = true; schedule();
  }));
  w('menu', {}, 'menu', (d) => d.filter((m) => !m.deleted).sort((a, b) => a.name.localeCompare(b.name)));
  w('categories', {}, 'categories', (d) => d.sort((a, b) => (a.sort || 0) - (b.sort || 0)));
  w('tables', {}, 'tables', (d) => d.filter((t) => !t.deleted).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true })));
  w('notifications', { where: [['audience', '==', 'staff']], orderBy: ['createdAt', 'desc'], limit: 40 }, 'notifications');
  if (can('customers') || can('rewards')) w('users', { orderBy: ['createdAt', 'desc'], limit: 1000 }, 'users');
  if (can('payments') || can('dashboard')) w('payments', { where: [['createdAt', '>=', since]], orderBy: ['createdAt', 'desc'] }, 'payments');
  if (can('rewards')) w('rewards', {}, 'rewards', (d) => d.sort((a, b) => a.cost - b.cost));
  if (can('staff')) {
    w('staff', {}, 'staffList', (d) => d.sort((a, b) => a.name.localeCompare(b.name)));
    w('staff_activity', { orderBy: ['createdAt', 'desc'], limit: 200 }, 'activity');
  }
}

function newOrderAlert(o) {
  if (A.soundOn) chime('new');
  const pop = document.createElement('div');
  pop.className = 'new-order-pop';
  pop.innerHTML = `<div class="np-ic">${icon('bell', 22)}</div><div class="grow"><b>New order ${esc(o.orderNo)}</b><span>${esc(o.tableName || 'Takeaway')} · ${o.itemCount} item(s) · ${rm(o.total)}</span></div><button class="btn btn-gold btn-sm">View</button>`;
  pop.querySelector('button').addEventListener('click', () => { pop.remove(); location.hash = `#/orders/${o.id}`; });
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 9000);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification(`New order ${o.orderNo}`, { body: `${o.tableName || 'Takeaway'} · ${rm(o.total)}`, icon: 'icons/icon-192.png', tag: o.id }); } catch { /* */ }
  }
}

// ------------------------------------------------------------------ login
function renderLogin() {
  const s = A.settings;
  $('#root').innerHTML = `<div class="login-screen">
    <div class="login-art"><div class="row">${logoMark(s, 56)}<div><b style="font-family:var(--font-serif);font-size:22px">${esc(s.restaurantName || 'Eden Hall')}</b><div class="xs" style="letter-spacing:.16em;color:var(--gold)">SMART ORDERING</div></div></div>
      <div><h1>Run your restaurant from one beautiful dashboard.</h1><p>Live orders, kitchen display, QR tables, payments, loyalty and reports – synchronised in real time.</p></div>
      <p class="xs">© ${new Date().getFullYear()} ${esc(s.restaurantName || 'Eden Hall')}</p></div>
    <div class="login-form-wrap"><div class="login-card">
      ${demoBanner(A.api)}
      <h2>Staff sign in</h2><p class="muted mb">Admin, manager, cashier, kitchen & waiter accounts.</p>
      <form class="stack" id="login-form">
        <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
      </form>
      ${A.api.mode === 'demo' ? `<div class="demo-creds"><b>Demo accounts</b> (click to fill)${DEMO_STAFF.map((d) => `<button data-email="${esc(d.email)}" data-pw="${esc(d.password)}">${esc(ROLES[d.role].name)} – ${esc(d.email)} / ${esc(d.password)}</button>`).join('')}</div>` : ''}
      <p class="xs muted center mt"><a href="index.html">← Customer app</a> · <a href="kitchen.html">Kitchen display</a></p>
    </div></div></div>`;
  $$('.demo-creds [data-email]').forEach((b) => b.addEventListener('click', () => { $('[name=email]').value = b.dataset.email; $('[name=password]').value = b.dataset.pw; }));
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.classList.add('loading'); btn.disabled = true;
    const d = formData(e.target);
    try {
      await A.api.auth.login(d.email, d.password);
      if (A.api.mode === 'demo') A.api.call('logStaffActivity', { action: 'auth.login', detail: 'Signed in' }).catch(() => {});
      if (A.staff && !hasPerm(A.staff, 'dashboard') && !hasPerm(A.staff, 'orders') && hasPerm(A.staff, 'kitchen')) location.href = 'kitchen.html';
    } catch (err) { toast(errMsg(err), 'error'); } finally { btn.classList.remove('loading'); btn.disabled = false; }
  });
}

// ------------------------------------------------------------------ layout & render
export function schedule() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(false); });
}

function firstAllowed() {
  return NAV.find((n) => n.length > 1 && !n[4] && hasPerm(A.staff, n[3]));
}

function render(isNav) {
  if (!A.staff) return;
  const [view, arg] = location.hash.replace(/^#\/?/, '').split('/');
  let v = view || 'dashboard';
  const navItem = NAV.find((n) => n[0] === v);
  if (!ALL_VIEWS[v] || !navItem || !hasPerm(A.staff, navItem[3])) {
    const f = firstAllowed();
    if (!f) { $('#root').innerHTML = `<div class="empty" style="padding-top:120px"><h4>No dashboard access</h4><p>Your role only has kitchen access.</p><a class="btn btn-primary mt" href="kitchen.html">Open Kitchen Display</a> <button class="btn btn-ghost mt" id="lo">Sign out</button></div>`; $('#lo').onclick = () => A.api.auth.logout(); return; }
    if (v !== f[0]) { location.replace(`#/${f[0]}`); return; }
  }
  const changed = v !== A.view || arg !== A.arg;
  A.view = v; A.arg = arg || null;

  let shell = $('#layout');
  if (!shell) {
    $('#root').innerHTML = `<div class="layout" id="layout"><aside class="sidebar" id="sidebar"></aside><div class="main"><header class="topbar" id="topbar"></header>${demoBanner(A.api)}<main class="content" id="content"></main></div></div>`;
    shell = $('#layout');
    bindChrome();
  }
  renderSidebar();
  renderTopbar(ALL_VIEWS[v].title);

  const content = $('#content');
  const scrollY = window.scrollY;
  const active = document.activeElement;
  const activeId = active && active.id && content.contains(active) ? active.id : null;
  const sel = active && active.selectionStart;
  // views may opt-out of live re-render while user is typing in a form
  if (!changed && ALL_VIEWS[v].noLive && content.dataset.view === v) return;
  content.dataset.view = v;
  content.innerHTML = ALL_VIEWS[v].render(arg);
  if (changed && isNav) window.scrollTo(0, 0); else window.scrollTo(0, scrollY);
  if (activeId) { const el = document.getElementById(activeId); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch { /* */ } } }
  ALL_VIEWS[v].bind && ALL_VIEWS[v].bind(content, arg);
  document.body.classList.remove('side-open');
}

function renderSidebar() {
  const s = A.settings;
  const counts = {
    orders: A.orders.filter((o) => o.status === 'received').length,
    payments: A.payments.filter((p) => p.status === 'pending').length,
    tables: A.tables.filter((t) => t.status === 'waiting_payment').length,
  };
  $('#sidebar').innerHTML = `<div class="brand">${logoMark(s, 44, 12)}<div><b>${esc(s.restaurantName || 'Eden Hall')}</b><span>Smart Ordering</span></div></div>
    <nav class="side-nav">${NAV.map((n) => {
      if (n.length === 1) return `<div class="side-label">${n[0]}</div>`;
      const [key, ic, label, perm, href] = n;
      if (!hasPerm(A.staff, perm)) return '';
      return `<a href="${href || `#/${key}`}" class="${A.view === key ? 'active' : ''}" ${href ? 'target="_blank" rel="noopener"' : ''}>${icon(ic, 19)}<span>${label}</span>${counts[key] ? `<span class="count">${counts[key]}</span>` : ''}${href ? icon('external', 14) : ''}</a>`;
    }).join('').replace(/(<div class="side-label">[^<]*<\/div>)(?=<div class="side-label">|$)/g, '')}</nav>
    <div class="side-foot">
      <a class="btn btn-sm btn-block" style="background:rgba(255,255,255,.06);color:#cfe0d8;margin-bottom:10px" href="index.html" target="_blank" rel="noopener">${icon('external', 15)} Open customer app</a>
      <div class="side-user"><div class="avatar">${esc((A.staff.name || '?')[0])}</div><div class="grow"><b class="ellipsis">${esc(A.staff.name)}</b><span>${esc((ROLES[A.staff.role] || {}).name || A.staff.role)}</span></div><button class="icon-btn" id="logout" title="Sign out" style="color:#cfe0d8">${icon('logout', 18)}</button></div>
    </div>`;
  $('#logout').onclick = async () => { await A.api.call('logStaffActivity', { action: 'auth.logout', detail: 'Signed out' }).catch(() => {}); await A.api.auth.logout(); location.hash = ''; };
}

function renderTopbar(title) {
  const unread = A.notifications.filter((n) => !n.read).length;
  $('#topbar').innerHTML = `<button class="icon-btn menu-toggle" id="side-toggle" aria-label="Menu">${icon('sidebar')}</button>
    <h1>${esc(title)}</h1>
    <span class="live" title="Real-time sync active"><i></i> Live</span>
    <button class="icon-btn" id="sound-toggle" title="Sound alerts">${icon(A.soundOn ? 'volume' : 'mute', 20)}</button>
    <button class="icon-btn" id="notif-btn" aria-label="Notifications">${icon('bell', 21)}${unread ? `<span class="badge-dot">${unread > 9 ? '9+' : unread}</span>` : ''}</button>`;
}

function bindChrome() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('#side-toggle')) { document.body.classList.toggle('side-open'); return; }
    if (document.body.classList.contains('side-open') && !e.target.closest('.sidebar')) document.body.classList.remove('side-open');
    if (e.target.closest('#sound-toggle')) {
      A.soundOn = !A.soundOn; localStorage.setItem('eh_admin_sound', A.soundOn ? '1' : '0');
      if (A.soundOn) { unlockAudio(); chime('tick'); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
      toast(A.soundOn ? 'Sound alerts on' : 'Sound alerts off'); schedule(); return;
    }
    if (e.target.closest('#notif-btn')) { toggleNotifs(); return; }
    const panel = $('.notif-panel');
    if (panel && !e.target.closest('.notif-panel')) panel.remove();
  });
}

function toggleNotifs() {
  const ex = $('.notif-panel');
  if (ex) { ex.remove(); return; }
  const p = document.createElement('div');
  p.className = 'notif-panel';
  p.innerHTML = `<div class="row between" style="padding:10px 0"><b>Notifications</b><button class="btn btn-xs btn-ghost" id="mark-all">Mark all read</button></div>` + (A.notifications.length ? A.notifications.map((n) => `<div class="notif ${n.read ? '' : 'unread'}" data-oid="${esc(n.orderId || '')}"><div class="n-ic" style="width:38px;height:38px;border-radius:12px;background:var(--emerald-soft);color:var(--emerald);display:grid;place-items:center">${icon(n.type === 'payment' || n.type === 'payment_pending' ? 'wallet' : n.type === 'cancelled' ? 'x' : 'receipt', 18)}</div><div class="grow"><h5 style="margin:0">${esc(n.title)}</h5><p class="small muted">${esc(n.body)}</p><p class="xs muted">${timeAgo(n.createdAt)}</p></div></div>`).join('') : '<div class="empty">No notifications</div>');
  document.body.appendChild(p);
  p.addEventListener('click', (e) => {
    if (e.target.closest('#mark-all')) { A.api.call('markNotificationsRead', { ids: A.notifications.filter((n) => !n.read).map((n) => n.id) }).catch((er) => toast(errMsg(er), 'error')); p.remove(); return; }
    const n = e.target.closest('[data-oid]');
    if (n && n.dataset.oid) { p.remove(); location.hash = `#/orders/${n.dataset.oid}`; }
  });
}

// helpers for views
export const can = (perm) => hasPerm(A.staff, perm);
export async function run(promise, okMsg) {
  try { const r = await promise; if (okMsg) toast(okMsg, 'success'); return r; } catch (e) { toast(errMsg(e), 'error', 5000); throw e; }
}
export { openModal };

boot();
