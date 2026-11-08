// =====================================================================
// SELAGI COFFEE – Customer PWA (entry)
// Navigation: hash routes (no full reloads) + floating bottom nav with a sliding active pill.
// Scan QR → Browse Menu → Add to Cart → Checkout → Track Order
// =====================================================================
import { initApi } from '../core/api.js';
import { menuImage } from '../core/art.js';
import {
  $, $$, esc, rm, icon, toast, openModal, errMsg, greeting, timeAgo, chime, unlockAudio,
  registerSW, hideSplash, demoBanner, logoMark, STATUS_LABEL, copyText, formData,
} from '../core/ui.js';
import { S, bus, emit, loadLocal, setTable, go, cartCount, isMember, profile, tierInfo, menuById } from './state.js';
import { renderMenu, openItem, openCart, renderCheckout, cartBar } from './menu.js';
import { renderOrders, renderOrder, activeOrders, stepIndex } from './orders.js';
import { renderRewards, renderAccount, openReferral } from './account.js';

let currentRoute = '';
const TAB_ROOTS = new Set(['/', 'home/', 'menu/', 'orders/', 'rewards/', 'account/']);
const scrollMemory = new Map();
let deferredInstall = null;
const subs = { user: [] };
const prevStatus = new Map();
let ordersLoaded = false;

// ------------------------------------------------------------------ boot
async function boot() {
  registerSW();
  loadLocal();
  try {
    S.api = await initApi('customer');
  } catch (e) {
    hideSplash();
    $('#app').innerHTML = `<div class="empty" style="padding-top:120px"><div class="empty-ic">${icon('info', 28)}</div><h4>Unable to connect</h4><p>${esc(errMsg(e))}</p><button class="btn btn-primary mt" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  const api = S.api;

  api.watchDoc('settings', 'general', (s) => { S.settings = s || {}; document.title = `${S.settings.restaurantName || 'SELAGI COFFEE'} | ${S.settings.tagline || ''}`; emit(); });
  api.watch('categories', {}, (c) => { S.categories = c.filter((x) => x.active !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0)); emit(); });
  api.watch('menu', {}, (m) => { S.menu = m.filter((x) => !x.deleted); emit(); });
  api.watch('rewards', { where: [['active', '==', true]] }, (r) => { S.rewards = r.sort((a, b) => a.cost - b.cost); emit(); });

  api.auth.onChange((u) => {
    const prevUid = S.user && S.user.uid;
    S.user = u;
    if (u && u.uid !== prevUid) watchUserData(u.uid);
    if (!u) { subs.user.forEach((f) => f()); subs.user = []; S.orders = []; S.notifications = []; S.vouchers = []; S.ledger = []; }
    emit();
  });
  try { await api.auth.ensureGuest(); } catch (e) { console.warn('guest auth failed', e); }

  await handleQrParams();
  window.addEventListener('hashchange', route);
  bus.addEventListener('change', scheduleRender);
  bus.addEventListener('route', route);
  bus.addEventListener('cart', () => { updateCartBar(true); updateNav(); });
  document.addEventListener('click', unlockAudio, { once: true });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
  S.ready = true;
  route();
  setTimeout(hideSplash, 250);
}

function watchUserData(uid) {
  subs.user.forEach((f) => f());
  ordersLoaded = false;
  const api = S.api;
  subs.user = [
    api.watch('orders', { where: [['customerUid', '==', uid]], orderBy: ['createdAt', 'desc'], limit: 50 }, (o) => {
      S.orders = o;
      o.forEach((ord) => {
        const prev = prevStatus.get(ord.id);
        if (ordersLoaded && prev && prev !== ord.status) {
          toast(`${ord.orderNo}: ${STATUS_LABEL[ord.status]}`, ord.status === 'cancelled' ? 'error' : 'success', 4500);
          chime(ord.status === 'ready' ? 'ready' : 'tick');
          ringBell();
        }
        prevStatus.set(ord.id, ord.status);
      });
      ordersLoaded = true;
      emit();
    }),
    api.watch('notifications', { where: [['uid', '==', uid]], orderBy: ['createdAt', 'desc'], limit: 40 }, (n) => { S.notifications = n.filter((x) => x.audience === 'customer'); updateBell(); }),
    api.watch('vouchers', { where: [['uid', '==', uid]] }, (v) => { S.vouchers = v.sort((a, b) => b.createdAt - a.createdAt); emit(); }),
    api.watch('loyalty_transactions', { where: [['uid', '==', uid]], orderBy: ['createdAt', 'desc'], limit: 200 }, (l) => { S.ledger = l; emit(); }),
  ];
}

// ------------------------------------------------------------------ QR table
async function handleQrParams() {
  const p = new URLSearchParams(location.search);
  const tableId = p.get('t') || p.get('table');
  const token = p.get('k') || p.get('token');
  const ref = p.get('ref');
  if (ref) sessionStorage.setItem('eh_ref', ref.toUpperCase());
  if (!tableId) return;
  // strip the token from the address bar so it isn't shared/bookmarked accidentally
  history.replaceState(null, '', location.pathname + (location.hash || '#/menu'));
  try {
    const t = await S.api.call('verifyTable', { tableId, token });
    setTable({ tableId: t.tableId, token, name: t.name, number: t.number, zone: t.zone, verifiedAt: Date.now() });
    if (!location.hash || location.hash === '#/') location.hash = '#/menu';
    setTimeout(() => welcomeTable(t), 400);
  } catch (e) {
    setTimeout(() => openModal({
      title: 'Table QR not recognised',
      body: `<div class="empty" style="padding:10px 0"><div class="empty-ic">${icon('qr', 28)}</div><p>${esc(errMsg(e))}</p><p class="small mt-s">You can still order takeaway, or ask our staff for help.</p></div>`,
      actions: [{ label: 'OK', cls: 'btn-primary' }],
    }), 400);
  }
}

function welcomeTable(t) {
  openModal({
    sheet: true,
    body: `<div class="welcome-table">
      <div class="wt-ic">${icon('utensils', 38)}</div>
      <p class="eyebrow">Welcome to ${esc(t.restaurantName)}</p>
      <div class="tnum">${esc(t.name)}</div>
      <p class="muted mt-s">You're all set! Browse the menu and your order goes straight to our kitchen – no need to wave for a waiter.</p>
      <button class="btn btn-primary btn-block btn-lg mt" data-close>${icon('menu', 18)} View Menu</button>
    </div>`,
  });
}

export function leaveTable() {
  openModal({
    title: 'Leave this table?',
    body: `<p class="muted">You'll need to scan the QR code on your table again to place dine-in orders. Your existing orders are not affected.</p>`,
    actions: [{ label: 'Stay', cls: 'btn-ghost' }, { label: 'Leave table', cls: 'btn-danger', onClick: (el, close) => { setTable(null); close(); toast('Table session ended'); } }],
  });
}

// ------------------------------------------------------------------ routing
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(false); });
}

function route() { render(true); }

function render(isNav) {
  if (!S.ready) return;
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, arg] = hash.split('/');
  const app = $('#app');
  const routeKey = `${page}/${arg || ''}`;
  const changed = routeKey !== currentRoute;
  // remember where the customer was on each tab so switching back feels native
  if (changed && TAB_ROOTS.has(currentRoute)) scrollMemory.set(currentRoute, window.scrollY);
  currentRoute = routeKey;

  // preserve scroll & focus on live re-renders
  const scrollY = window.scrollY;
  const active = document.activeElement;
  const activeId = active && active.id;
  const activeName = active && !active.id && active.name && active.closest && active.closest('#app') ? active.name : null;
  const selStart = active && active.selectionStart;

  let html = '';
  switch (page) {
    case 'menu': html = renderMenu(arg); break;
    case 'checkout': html = renderCheckout(); break;
    case 'orders': html = renderOrders(); break;
    case 'order': html = renderOrder(arg); break;
    case 'rewards': html = renderRewards(arg); break;
    case 'account': html = renderAccount(arg); break;
    default: html = renderHome();
  }
  app.innerHTML = `${demoBanner(S.api)}<div class="view ${changed ? 'page-enter' : 'no-anim'}">${html}</div>`;
  if (!changed) app.querySelector('.view').style.animation = 'none';
  if (isNav && changed) window.scrollTo(0, TAB_ROOTS.has(routeKey) ? (scrollMemory.get(routeKey) || 0) : 0); else window.scrollTo(0, scrollY);
  if (activeId || activeName) {
    const el = activeId ? document.getElementById(activeId) : app.querySelector(`[name="${activeName}"]`);
    if (el) { el.focus(); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch { /* */ } }
  }
  updateNav(page || 'home');
  updateCartBar(false, page);
  updateBell();
  bus.dispatchEvent(new CustomEvent('rendered', { detail: { page, arg } }));
}

// ------------------------------------------------------------------ chrome
const NAV_ITEMS = [
  // key, href, icon, label
  ['home', '#/', 'cup', 'Singgah'],
  ['menu', '#/menu', 'menu', 'Menu'],
  ['orders', '#/orders', 'receipt', 'Pesanan'],
  ['rewards', '#/rewards', 'gift', 'Rewards'],
  ['account', '#/account', 'user', 'Account'],
];
const NAV_ALIASES = { '': 'home', order: 'orders', checkout: 'menu' };
let navIndex = -1;

function buildNav() {
  const nav = $('#nav');
  nav.style.setProperty('--n', NAV_ITEMS.length);
  nav.innerHTML = `<span class="nav-pill" aria-hidden="true"></span>${NAV_ITEMS.map(([key, href, ic, label]) => `<a href="${href}" data-nav="${key}" aria-current="false">${icon(ic, 23)}<span>${label}</span><i class="nav-badge" hidden></i></a>`).join('')}`;
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-nav]');
    // Instant feedback before the route renders – keeps the active text in sync with the tap.
    if (a) setNavActive(a.dataset.nav, true);
  });
}

function setNavActive(key, tapped) {
  const nav = $('#nav');
  const idx = Math.max(0, NAV_ITEMS.findIndex(([k]) => k === key));
  const first = navIndex < 0;
  if (idx === navIndex) return;
  nav.classList.toggle('no-anim', first);
  nav.style.setProperty('--i', idx);
  $$('a[data-nav]', nav).forEach((a, i) => {
    const on = i === idx;
    a.classList.toggle('active', on);
    a.setAttribute('aria-current', on ? 'page' : 'false');
    if (on && tapped) { a.classList.remove('tapped'); void a.offsetWidth; a.classList.add('tapped'); }
  });
  navIndex = idx;
  if (first) requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.remove('no-anim')));
}

function updateNav(page) {
  if (!$('#nav [data-nav]')) buildNav();
  const raw = page != null ? page : (location.hash.replace(/^#\/?/, '').split('/')[0] || 'home');
  const cur = NAV_ALIASES[raw] != null ? NAV_ALIASES[raw] : raw;
  setNavActive(NAV_ITEMS.some(([k]) => k === cur) ? cur : 'home', false);
  const act = activeOrders().length;
  const badge = $('#nav [data-nav="orders"] .nav-badge');
  if (badge) {
    const prev = badge.textContent;
    badge.hidden = !act;
    badge.textContent = act ? String(act) : '';
    if (act && prev !== String(act)) { badge.classList.remove('count-pop'); void badge.offsetWidth; badge.classList.add('count-pop'); }
  }
}

function updateCartBar(bump, page) {
  let bar = $('#cart-bar');
  if (!bar) {
    bar = document.createElement('button');
    bar.id = 'cart-bar';
    bar.className = 'cart-bar hide';
    bar.addEventListener('click', openCart);
    document.body.appendChild(bar);
  }
  const p = page || location.hash.replace(/^#\/?/, '').split('/')[0];
  const n = cartCount();
  bar.innerHTML = cartBar();
  bar.classList.toggle('hide', !n || p === 'checkout');
  if (bump && n) { bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump'); }
}

function updateBell() {
  let bell = $('#fab-bell');
  if (!bell) {
    bell = document.createElement('button');
    bell.id = 'fab-bell';
    bell.className = 'fab-bell';
    bell.setAttribute('aria-label', 'Notifications');
    bell.addEventListener('click', openNotifications);
    document.body.appendChild(bell);
  }
  const unread = S.notifications.filter((n) => !n.read).length;
  bell.innerHTML = `${icon('bell', 26)}${unread ? `<span class="badge-dot">${unread > 9 ? '9+' : unread}</span>` : ''}`;
}
function ringBell() { const b = $('#fab-bell'); if (b) { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); } }

function openNotifications() {
  const list = S.notifications;
  const iconFor = { new_order: 'receipt', received: 'receipt', confirmed: 'check', preparing: 'chef', ready: 'bell', completed: 'check', cancelled: 'x', payment: 'wallet', points: 'award', voucher: 'ticket', welcome: 'sparkle' };
  openModal({
    title: 'Notifications',
    sheet: true,
    body: list.length ? list.map((n) => `<div class="notif ${n.read ? '' : 'unread'}" ${n.orderId ? `data-order="${esc(n.orderId)}" style="cursor:pointer"` : ''}>
        <div class="n-ic">${icon(iconFor[n.type] || 'bell', 20)}</div>
        <div class="grow"><h5>${esc(n.title)}</h5><p class="small muted">${esc(n.body)}</p><p class="xs muted">${timeAgo(n.createdAt)}</p></div></div>`).join('')
      : `<div class="empty"><div class="empty-ic">${icon('bell', 28)}</div><h4>No notifications yet</h4><p>Order updates and rewards will appear here.</p></div>`,
    onOpen: (el, close) => {
      el.addEventListener('click', (e) => { const o = e.target.closest('[data-order]'); if (o) { close(); go(`#/order/${o.dataset.order}`); } });
      const unread = list.filter((n) => !n.read).map((n) => n.id);
      if (unread.length) S.api.call('markNotificationsRead', { ids: unread }).catch(() => {});
    },
  });
}

// ------------------------------------------------------------------ home
function heroHtml() {
  const s = S.settings;
  const featured = S.menu.filter((m) => m.featured).slice(0, 9);
  const collage = s.banner
    ? `<div class="hero-bg" style="background-image:url('${esc(s.banner)}')"></div>`
    : `<div class="hero-collage">${(featured.length ? featured : S.menu.slice(0, 9)).concat(S.menu).slice(0, 9).map((m) => `<img src="${esc(menuImage(m.image))}" alt="">`).join('')}</div>`;
  return `<header class="hero">
    ${collage}
    <div class="hero-top"><span></span><button class="icon-btn" onclick="location.hash='#/menu'" aria-label="Search menu">${icon('search', 20)}</button></div>
    <div class="hero-inner">
      ${s.heroTitle ? `<div class="hero-title">${esc(s.heroTitle)}</div>` : ''}
      ${logoMark(s, 120, 30)}
      <div class="hero-tagline">${esc(s.tagline || 'Premium artisan coffee, slowly crafted')}</div>
      <button class="loc-pill" data-action="info">${icon('pin', 18)} ${esc(s.restaurantName || 'SELAGI COFFEE')} ${icon('chevron', 16)}</button>
    </div>
  </header>`;
}

function renderHome() {
  const s = S.settings;
  const p = profile();
  const name = p ? p.name.split(' ')[0] : 'Guest';
  const t = tierInfo();
  const live = activeOrders()[0];
  const featured = S.menu.filter((m) => m.featured && m.available !== false).slice(0, 10);
  const popular = [...S.menu].filter((m) => m.available !== false).sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0)).slice(0, 6);
  const recent = S.orders.slice(0, 3);
  const promos = s.promotions || [];
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  return `${heroHtml()}
  <div class="sheet-body">
    <h1 class="greet">${greeting()}, <b>${esc(name)}!</b></h1>
    <div class="stat-pair">
      <div class="stat-card" data-go="#/rewards">
        <div class="row between"><span class="eyebrow">Current tier</span><span class="icon-btn sm" style="background:var(--grey)">${icon('award', 16)}</span></div>
        <div class="big">${esc(t.current.name)}</div>
        <div class="row between xs muted mt-s"><span>${t.next ? `To ${esc(t.next.name)}` : 'Top tier'}</span><span>${t.next ? `${t.windowPoints}/${t.next.min}` : '★'}</span></div>
        <div class="progress"><i style="width:${t.pct}%"></i></div>
      </div>
      <div class="stat-card" data-go="#/account/ledger">
        <div class="row between"><span class="eyebrow">Points</span><span class="xs muted">${icon('history', 13)} Ledger</span></div>
        <div class="pts mt-s">${p ? (p.points || 0).toLocaleString() : 0}<small>pts</small></div>
        ${p ? '' : '<div class="xs emerald bold mt-s">Join free to earn →</div>'}
      </div>
    </div>

    ${S.table ? `<div class="table-card rise">
      <div class="tc-ic">${icon('utensils', 24)}</div>
      <div class="grow"><div class="eyebrow">Dine in seated</div><h3>${esc(S.table.name)}</h3></div>
      <span class="chip green">QR Scanned</span>
      <button class="icon-btn sm" data-action="leave-table" aria-label="Leave table">${icon('x', 18)}</button>
    </div>` : ''}

    ${live ? liveOrderCard(live) : ''}

    <div class="action-tiles">
      <button class="tile ${S.table ? '' : 'locked'}" data-action="dinein">
        <div class="t-ic">${icon(S.table ? 'utensils' : 'qr', 26)}</div>
        <h4>${S.table ? esc(S.table.name) : 'Dine In'}</h4>
        <p>${S.table ? 'Order food & drinks to table' : 'Scan the QR on your table'}</p>
      </button>
      <button class="tile" data-action="takeaway">
        <div class="t-ic">${icon('bag', 26)}</div>
        <h4>Takeaway</h4><p>Self pick-up · Skip the queue</p>
      </button>
    </div>

    ${promos.length ? `<section class="section"><div class="section-head"><h2>Promotions</h2></div>
      <div class="h-scroll">${promos.map((pr) => `<div class="promo" style="background:linear-gradient(135deg, ${esc(pr.color || '#1D332B')}, #14251f)"><span class="chip">${esc(pr.badge || 'Promo')}</span><h3>${esc(pr.title)}</h3><p>${esc(pr.subtitle || '')}</p></div>`).join('')}</div></section>` : ''}

    ${featured.length ? `<section class="section"><div class="section-head"><h2>Featured</h2><a href="#/menu">See menu</a></div>
      <div class="h-scroll">${featured.map((m) => `<div class="feat-card" data-item="${esc(m.id)}"><div class="dish-img"><img src="${esc(menuImage(m.image))}" alt="" loading="lazy"></div><h4 class="ellipsis">${esc(m.name)}</h4><div class="price">${rm(m.price)}</div></div>`).join('')}</div></section>` : ''}

    ${popular.length ? `<section class="section"><div class="section-head"><h2>Popular dishes</h2><span class="chip orange">${icon('fire', 13)} Trending</span></div>
      <div class="menu-grid">${popular.map((m) => `<div class="dish" data-item="${esc(m.id)}"><div class="dish-img"><img src="${esc(menuImage(m.image))}" alt="" loading="lazy"><button class="add" data-quick="${esc(m.id)}" aria-label="Add">${icon('plus', 20)}</button></div><h4>${esc(m.name)}</h4><div class="price">${rm(m.price)}</div></div>`).join('')}</div></section>` : ''}

    <section class="section card invite-card">
      <div class="ic-box">${icon('gift', 24)}</div>
      <div class="grow"><h4 style="font-family:var(--font-sans);font-weight:800">Invite &amp; Earn</h4>
        ${p ? `<div class="row small mt-s">Code: <button class="code-pill" data-copy="${esc(p.referralCode)}">${esc(p.referralCode)} ${icon('copy', 14)}</button></div>` : `<p class="small muted">Get ${s.referralBonus || 0} pts for every friend who joins</p>`}
      </div>
      <button class="btn btn-dark btn-sm" data-action="referral">${icon('qr', 16)} Invite</button>
    </section>

    ${recent.length ? `<section class="section"><div class="section-head"><h2>Recent orders</h2><a href="#/orders">View all</a></div>
      <div class="card">${recent.map((o) => `<div class="order-row" data-go="#/order/${esc(o.id)}"><div class="or-ic">${icon(o.type === 'dine_in' ? 'utensils' : 'bag', 20)}</div><div class="grow"><b>${esc(o.orderNo)}</b><div class="xs muted">${timeAgo(o.createdAt)} · ${o.itemCount} item(s)</div></div><div class="right"><b>${rm(o.total)}</b><div><span class="chip status-${o.status}">${STATUS_LABEL[o.status]}</span></div></div></div>`).join('')}</div></section>` : ''}

    ${!standalone ? `<section class="section card invite-card" data-action="install">
      <div class="ic-box">${icon('download', 22)}</div>
      <div class="grow"><h4 style="font-family:var(--font-sans);font-weight:800">Add to Home Screen</h4><p class="small muted">${isIOS ? 'Tap Share → Add to Home Screen' : 'For 1-tap ordering next time'}</p></div>${icon('chevron', 18)}
    </section>` : ''}
    <p class="center xs muted mt" style="padding-bottom:10px">${esc(s.address || '')}<br>${esc(s.openingHours || '')}</p>
  </div>`;
}

export function liveOrderCard(o) {
  const idx = stepIndex(o.status);
  return `<a class="live-order rise" href="#/order/${esc(o.id)}">
    <div class="row between"><div><span class="xs muted">${esc(o.tableName || 'Takeaway')} · ${esc(o.orderNo)}</span><h4>${STATUS_LABEL[o.status]}</h4></div>${icon('chevron', 20)}</div>
    <div class="mini-steps">${[0, 1, 2, 3].map((i) => `<i class="${i < idx ? 'on' : i === idx ? 'cur' : ''}"></i>`).join('')}</div>
  </a>`;
}

// ------------------------------------------------------------------ auth
export function openAuth(mode = 'login', after) {
  const ref = sessionStorage.getItem('eh_ref') || '';
  const s = S.settings;
  const body = (m) => `<div class="segmented auth-tabs"><button type="button" data-mode="login" class="${m === 'login' ? 'active' : ''}">Sign in</button><button type="button" data-mode="register" class="${m === 'register' ? 'active' : ''}">Join free</button></div>
    ${m === 'register' ? `<div class="benefits"><div>${icon('award', 18)} Earn ${s.pointsPerRM || 10} pts for every RM1 spent</div><div>${icon('gift', 18)} Redeem free food, drinks & vouchers</div><div>${icon('sparkle', 18)} Unlock Silver, Gold & Platinum perks</div></div>` : ''}
    <form class="stack" id="auth-form" novalidate>
      ${m === 'register' ? `<label class="field"><span>Full name</span><input class="input" name="name" autocomplete="name" required></label>
      <label class="field"><span>Phone number</span><input class="input" name="phone" type="tel" autocomplete="tel" placeholder="+60 12-345 6789"></label>` : ''}
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="${m === 'register' ? 'new-password' : 'current-password'}" required minlength="6"></label>
      ${m === 'register' ? `<label class="field"><span>Referral code <em class="hint">(optional)</em></span><input class="input" name="referralCode" value="${esc(ref)}" style="text-transform:uppercase"></label>` : ''}
      <button class="btn btn-primary btn-block btn-lg" type="submit">${m === 'register' ? 'Create account' : 'Sign in'}</button>
      ${m === 'login' ? '<button type="button" class="btn btn-ghost btn-sm" data-forgot>Forgot password?</button>' : ''}
      <p class="xs muted center">By continuing you agree to our Privacy Policy. Your orders on this device stay linked to your account.</p>
    </form>`;
  openModal({
    title: mode === 'register' ? 'Join SELAGI COFFEE Rewards' : 'Welcome back',
    sheet: true,
    body: body(mode),
    onOpen: (el, close) => {
      const bind = () => {
        $$('[data-mode]', el).forEach((b) => b.addEventListener('click', () => { $('.modal-body', el).innerHTML = body(b.dataset.mode); $('.modal-head h3', el).textContent = b.dataset.mode === 'register' ? 'Join SELAGI COFFEE Rewards' : 'Welcome back'; bind(); }));
        const fg = $('[data-forgot]', el);
        if (fg) fg.addEventListener('click', async () => {
          const email = $('[name=email]', el).value;
          if (!email) return toast('Enter your email first', 'error');
          try { await S.api.auth.resetPassword(email); toast('Password reset email sent', 'success'); } catch (e) { toast(errMsg(e), 'error'); }
        });
        $('#auth-form', el).addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = e.target.querySelector('[type=submit]');
          const d = formData(e.target);
          const isReg = !!e.target.querySelector('[name=name]');
          btn.disabled = true; btn.classList.add('loading');
          try {
            if (isReg) { await S.api.auth.register(d); toast(`Welcome, ${d.name.split(' ')[0]}! 🎉`, 'success'); sessionStorage.removeItem('eh_ref'); }
            else { await S.api.auth.login(d.email, d.password); toast('Signed in', 'success'); }
            close();
            after && after();
          } catch (err) { toast(errMsg(err), 'error'); } finally { btn.disabled = false; btn.classList.remove('loading'); }
        });
      };
      bind();
    },
  });
}

function openInfo() {
  const s = S.settings;
  openModal({
    title: s.restaurantName || 'SELAGI COFFEE',
    sheet: true,
    body: `<div class="stack">
      <div class="row">${icon('pin', 20)}<span>${esc(s.address || '')}</span></div>
      <div class="row">${icon('clock', 20)}<span>${esc(s.openingHours || '')}</span></div>
      <div class="row">${icon('phone', 20)}<a href="tel:${esc((s.phone || '').replace(/\s/g, ''))}">${esc(s.phone || '')}</a></div>
      ${s.acceptingOrders === false ? '<div class="chip red">Not accepting orders right now</div>' : '<div class="chip green">Open for orders</div>'}
    </div>`,
  });
}

async function promptInstall() {
  if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; return; }
  openModal({
    title: 'Add to Home Screen', sheet: true,
    body: `<div class="stack"><p>Install ${esc(S.settings.restaurantName || 'SELAGI COFFEE')} like an app – no app store needed.</p>
      <div class="card card-pad small"><b>iPhone / iPad (Safari):</b> tap the Share button, then <b>Add to Home Screen</b>.</div>
      <div class="card card-pad small"><b>Android (Chrome):</b> tap the ⋮ menu, then <b>Install app</b> / <b>Add to Home screen</b>.</div></div>`,
  });
}

// ------------------------------------------------------------------ global click delegation
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go],[data-item],[data-quick],[data-action],[data-copy]');
  if (!el || el.closest('.modal-wrap')) return;
  if (el.dataset.copy) { e.stopPropagation(); copyText(el.dataset.copy); return; }
  if (el.dataset.quick) {
    e.stopPropagation();
    const m = menuById(el.dataset.quick);
    if (m) openItem(m.id);
    return;
  }
  if (el.dataset.item) { openItem(el.dataset.item); return; }
  if (el.dataset.go) { go(el.dataset.go); return; }
  switch (el.dataset.action) {
    case 'leave-table': leaveTable(); break;
    case 'dinein':
      if (S.table) { S.orderType = 'dine_in'; go('#/menu'); }
      else openModal({ title: 'Dine in', sheet: true, body: `<div class="empty" style="padding:10px"><div class="empty-ic">${icon('qr', 30)}</div><h4>Scan your table's QR code</h4><p>Use your phone camera to scan the QR code on your table. The menu will open with your table number confirmed automatically.</p></div>` });
      break;
    case 'takeaway': S.orderType = 'takeaway'; go('#/menu'); break;
    case 'referral': if (isMember()) openReferral(); else openAuth('register'); break;
    case 'install': promptInstall(); break;
    case 'info': openInfo(); break;
    case 'login': openAuth('login'); break;
    case 'register': openAuth('register'); break;
    default: break;
  }
});

boot();
