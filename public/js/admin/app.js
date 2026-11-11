// =====================================================================
// TAPJERR.io – Admin dashboard (entry, auth, layout, live data)
// =====================================================================
import { initApi } from '../core/api.js';
import { hasPerm, ROLES } from '../core/server-logic.js';
import { DEMO_STAFF } from '../core/seed.js';
import {
  $, $$, esc, icon, toast, errMsg, chime, unlockAudio, timeAgo, registerSW, hideSplash, demoBanner, logoMark, formData, rm, openModal, platformMark, poweredBy,
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
  ['dashboard', 'dashboard', 'Overview', 'dashboard'],
  ['orders', 'receipt', 'Live Orders', 'orders'],
  ['menu', 'menu', 'Menu Management', 'menu'],
  ['tables', 'qr', 'Table & QR', 'tables'],
  ['People'],
  ['customers', 'users', 'Customers', 'customers'],
  ['rewards', 'gift', 'Loyalty & Rewards', 'rewards'],
  ['Finance'],
  ['payments', 'wallet', 'Payments', 'payments'],
  ['Team & Insights'],
  ['staff', 'staff', 'Staff Management', 'staff'],
  ['reports', 'chart', 'Sales Reports', 'reports'],
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
    <div class="login-art"><div class="row">${platformMark(56)}<div><b class="platform-name">TAPJERR<span>.io</span></b><div class="xs" style="letter-spacing:.16em;color:var(--gold)">SMART QR ORDERING</div></div></div>
      <div><h1>Run your restaurant from one beautiful dashboard.</h1><p>Live orders, kitchen display, QR tables, payments, loyalty and reports – synchronised in real time.</p></div>
      <p class="xs">© ${new Date().getFullYear()} TAPJERR.io · ${esc(s.restaurantName || 'SELAGI COFFEE')}</p></div>
    <div class="login-form-wrap"><div class="login-card">
      ${demoBanner(A.api)}
      <div class="row mb">${logoMark(s, 44, 12)}<div><b>${esc(s.restaurantName || 'SELAGI COFFEE')}</b><div class="xs muted">Outlet on TAPJERR.io</div></div></div>
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
  renderTopbar((NAV.find((n) => n[0] === v) || [])[2] || ALL_VIEWS[v].title);

  const content = $('#content');
  const scrollY = window.scrollY;
  const active = document.activeElement;
  const activeId = active && active.id && content.contains(active) ? active.id : null;
  const sel = active && active.selectionStart;
  // views may opt-out of live re-render while user is typing in a form
  if (!changed && ALL_VIEWS[v].noLive && content.dataset.view === v) return;
  content.dataset.view = v;
  // Render into a fresh root on every pass: views bind delegated listeners to the element they
  // receive, and binding them to the long-lived #content made them pile up on each live update
  // (one click on Delete opened several stacked confirm dialogs).
  content.innerHTML = `<div class="view-root">${ALL_VIEWS[v].render(arg)}</div>`;
  const root = content.firstElementChild;
  if (changed) { content.classList.remove('page-enter'); void content.offsetWidth; content.classList.add('page-enter'); }
  if (changed && isNav) window.scrollTo(0, 0); else window.scrollTo(0, scrollY);
  if (activeId) { const el = document.getElementById(activeId); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch { /* */ } } }
  ALL_VIEWS[v].bind && ALL_VIEWS[v].bind(root, arg);
  if (changed) document.body.classList.remove('side-open', 'side-expanded');
}

let sidebarFor = null;
function renderSidebar() {
  const s = A.settings;
  const counts = {
    orders: A.orders.filter((o) => o.status === 'received').length,
    payments: A.payments.filter((p) => p.status === 'pending').length,
    tables: A.tables.filter((t) => t.status === 'waiting_payment').length,
  };
  const side = $('#sidebar');
  const key = `${A.staff.uid}|${A.staff.role}|${s.restaurantName || ''}|${s.logo || ''}`;
  if (sidebarFor !== key || !$('.side-nav', side)) {
    sidebarFor = key;
    side.innerHTML = `<div class="brand">${logoMark(s, 44, 12)}<div class="brand-text"><b>${esc(s.restaurantName || 'SELAGI COFFEE')}</b><span class="brand-sub">Console · TAPJERR.io</span></div>
        <button class="icon-btn side-collapse" id="side-collapse" aria-label="Collapse sidebar" title="Collapse / expand">${icon('back', 18)}</button></div>
      <nav class="side-nav" aria-label="Admin"><span class="side-glider" aria-hidden="true"></span>${NAV.map((n) => {
        if (n.length === 1) return `<div class="side-label">${n[0]}</div>`;
        const [k, ic, label, perm] = n;
        if (!hasPerm(A.staff, perm)) return '';
        return `<a href="#/${k}" data-view="${k}" title="${esc(label)}">${icon(ic, 19)}<span class="side-text">${esc(label)}</span><span class="count" hidden></span></a>`;
      }).join('').replace(/(<div class="side-label">[^<]*<\/div>)(?=<div class="side-label">|$)/g, '')}</nav>
      <div class="side-foot">
        ${hasPerm(A.staff, 'kitchen') ? `<a class="side-link" href="kitchen.html" target="_blank" rel="noopener" title="Kitchen Display">${icon('chef', 17)}<span class="side-text">Kitchen Display</span></a>` : ''}
        <a class="side-link" href="index.html" target="_blank" rel="noopener" title="Customer app">${icon('external', 17)}<span class="side-text">Customer app</span></a>
        ${poweredBy()}
        <div class="side-user"><div class="avatar">${esc((A.staff.name || '?')[0])}</div><div class="grow side-text"><b class="ellipsis">${esc(A.staff.name)}</b><span>${esc((ROLES[A.staff.role] || {}).name || A.staff.role)}</span></div><button class="icon-btn" id="logout" title="Sign out" aria-label="Sign out">${icon('logout', 18)}</button></div>
      </div>`;
    $('#logout').onclick = async () => { await A.api.call('logStaffActivity', { action: 'auth.logout', detail: 'Signed out' }).catch(() => {}); await A.api.auth.logout(); location.hash = ''; };
    $('.side-nav', side).classList.add('no-anim');
  }
  $$('.side-nav a[data-view]', side).forEach((a) => {
    const on = a.dataset.view === A.view;
    a.classList.toggle('active', on);
    a.setAttribute('aria-current', on ? 'page' : 'false');
    const c = $('.count', a); const n = counts[a.dataset.view] || 0;
    if (String(n || '') !== c.textContent) { c.textContent = n || ''; c.hidden = !n; if (n) { c.classList.remove('count-pop'); void c.offsetWidth; c.classList.add('count-pop'); } }
  });
  moveGlider();
}

/** Slides the active background + gold indicator to the active sidebar link. */
function moveGlider() {
  const nav = $('#sidebar .side-nav');
  if (!nav) return;
  const g = $('.side-glider', nav);
  const a = $('a.active', nav);
  if (!a) { g.style.opacity = '0'; return; }
  g.style.opacity = '1';
  g.style.height = `${a.offsetHeight}px`;
  g.style.transform = `translateY(${a.offsetTop}px)`;
  if (nav.classList.contains('no-anim')) requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.remove('no-anim')));
}

// ---- sidebar modes: desktop = expandable, tablet = collapsible rail, mobile = drawer
const mqMobile = window.matchMedia('(max-width: 767px)');
const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1199px)');
function applySideMode() {
  const b = document.body;
  const mode = mqMobile.matches ? 'drawer' : mqTablet.matches ? 'tablet' : 'desktop';
  b.dataset.side = mode;
  const rail = (mode === 'tablet' && !b.classList.contains('side-expanded')) || (mode === 'desktop' && localStorage.getItem('sc_side_collapsed') === '1');
  b.classList.toggle('side-rail', rail);
  if (mode !== 'drawer') b.classList.remove('side-open');
  if (mode !== 'tablet') b.classList.remove('side-expanded');
  const btn = $('#side-collapse');
  if (btn) btn.setAttribute('aria-label', rail ? 'Expand sidebar' : 'Collapse sidebar');
  setTimeout(moveGlider, 360);
}
function toggleSide() {
  const b = document.body;
  if (b.dataset.side === 'drawer') b.classList.toggle('side-open');
  else if (b.dataset.side === 'tablet') b.classList.toggle('side-expanded');
  else localStorage.setItem('sc_side_collapsed', b.classList.contains('side-rail') ? '0' : '1');
  applySideMode();
}
[mqMobile, mqTablet].forEach((m) => (m.addEventListener ? m.addEventListener('change', applySideMode) : m.addListener(applySideMode)));
applySideMode();

function renderTopbar(title) {
  const unread = A.notifications.filter((n) => !n.read).length;
  $('#topbar').innerHTML = `<button class="icon-btn menu-toggle" id="side-toggle" aria-label="Toggle navigation">${icon('sidebar')}</button>
    <h1>${esc(title)}</h1>
    <span class="live" title="Real-time sync active"><i></i> Live</span>
    <button class="icon-btn" id="sound-toggle" title="Sound alerts">${icon(A.soundOn ? 'volume' : 'mute', 20)}</button>
    <button class="icon-btn" id="notif-btn" aria-label="Notifications">${icon('bell', 21)}${unread ? `<span class="badge-dot">${unread > 9 ? '9+' : unread}</span>` : ''}</button>`;
}

function bindChrome() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('#side-toggle') || e.target.closest('#side-collapse')) { toggleSide(); return; }
    const b = document.body;
    if ((b.classList.contains('side-open') || b.classList.contains('side-expanded')) && !e.target.closest('.sidebar')) { b.classList.remove('side-open', 'side-expanded'); applySideMode(); }
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
