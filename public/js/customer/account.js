// Rewards & Perks + Account / membership pages.
import { menuImage } from '../core/art.js';
import { $, $$, esc, rm, icon, toast, openModal, errMsg, fmtDate, fmtDateTime, timeAgo, qrSvg, copyText, formData, logoMark, STATUS_LABEL } from '../core/ui.js';
import { S, bus, go, isMember, profile, tierInfo, menuById } from './state.js';
import { openAuth } from './app.js';

// ------------------------------------------------------------------ rewards
export function renderRewards(tab = 'earn') {
  const p = profile();
  const t = tierInfo();
  const s = S.settings;
  const days = lastSevenDays();
  const today = days[days.length - 1];
  const checkedToday = p && p.lastCheckIn === today.key;
  const R = 92; const C = 115;
  const dots = days.map((d, i) => {
    const a = (-90 + (360 / 7) * i) * (Math.PI / 180);
    const x = C + R * Math.cos(a); const y = C + R * Math.sin(a);
    const isToday = i === days.length - 1;
    const cls = d.done ? 'done' : isToday && !checkedToday ? 'today' : '';
    return `<button class="ring-dot ${cls}" style="left:${x}px;top:${y}px" ${isToday && !checkedToday ? 'data-checkin' : 'disabled'} title="${esc(d.label)}" aria-label="${esc(d.label)}">${d.done ? icon('check', 14) : isToday ? icon('gift', 14) : ''}</button>`;
  }).join('');

  return `<div class="rw-hero">
    <h1>Rewards &amp; Perks</h1>
    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 230 230"><circle cx="115" cy="115" r="92" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="10"/></svg>
      ${dots}
      <div class="ring-center"><div class="medal">${icon('award', 30)}</div><div class="pts">${p ? (p.points || 0).toLocaleString() : 0}</div><button class="lbl" data-go="#/account/ledger">POINTS ${icon('chevron', 12)}</button></div>
    </div>
    <h3 style="color:#fff;font-family:var(--font-sans);font-weight:800">${esc(t.current.name)} Member</h3>
    <p style="opacity:.85">${p ? (checkedToday ? 'Checked in today – see you tomorrow!' : 'Tap the glowing dot to check in!') : 'Join free to start earning points'}</p>
    <span class="rw-rate">Earn up to ${Math.round((s.pointsPerRM || 0) * Math.max(...(s.tiers || [{ multiplier: 1 }]).map((x) => x.multiplier)))} pts per RM1 spent</span>
  </div>
  <div class="segmented rw-tabs" role="tablist">
    ${['earn', 'redeem', 'vouchers'].map((k) => `<button data-go="#/rewards/${k}" class="${tab === k || (!tab && k === 'earn') ? 'active' : ''}">${k === 'vouchers' ? 'My Vouchers' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
  </div>
  <div class="page-pad stack" style="margin-top:20px">
    ${!p ? `<div class="card card-pad center"><h3>Join ${esc(s.restaurantName || 'Eden Hall')} Rewards</h3><p class="muted small mt-s">Free membership · points on every order · exclusive vouchers</p><div class="row mt" style="justify-content:center"><button class="btn btn-primary" data-action="register">Join free</button><button class="btn btn-ghost" data-action="login">Sign in</button></div></div>` : ''}
    ${tab === 'redeem' ? redeemTab(p, t) : tab === 'vouchers' ? vouchersTab() : earnTab(p, t)}
  </div>`;
}

function lastSevenDays() {
  const p = profile();
  const checkins = new Set(S.ledger.filter((l) => l.type === 'checkin').map((l) => dayKeyLocal(l.createdAt)));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 864e5);
    const key = dayKeyLocal(d.getTime());
    return { key, done: checkins.has(key) || (p && p.lastCheckIn === key), label: d.toLocaleDateString('en-MY', { weekday: 'long' }) };
  });
}
function dayKeyLocal(ms) {
  const off = Number(S.settings.timezoneOffset ?? 8);
  const d = new Date(ms + off * 3600e3);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function earnTab(p, t) {
  const s = S.settings;
  const missing = p ? profileMissing(p) : [];
  return `
    <div class="card earn-card"><div class="ec-ic">${icon('coins', 24)}</div><div class="grow"><div class="row"><h4>RM1 = ${s.pointsPerRM || 0} Points</h4><span class="chip">Base Rate</span></div><p class="small muted">Earn points automatically on every paid dine-in or takeaway order.</p></div><button class="icon-btn solid" data-go="#/menu" aria-label="Order now">${icon('external', 18)}</button></div>
    <div class="card earn-card"><div class="ec-ic">${icon('users', 24)}</div><div class="grow"><h4>Invite Friends</h4><p class="small muted">Earn ${s.referralBonus || 0} bonus points each with your referral QR</p></div><button class="btn btn-sm btn-dark" data-action="referral">${icon('qr', 16)} Show QR</button></div>
    <div class="card earn-card"><div class="ec-ic">${icon('calendar', 24)}</div><div class="grow"><h4>Daily Check-in</h4><p class="small muted">+${s.checkInPoints || 0} pts every day you check in</p></div>${p && p.lastCheckIn !== dayKeyLocal(Date.now()) ? '<button class="btn btn-sm btn-primary" data-checkin>Check in</button>' : '<span class="chip green">Done</span>'}</div>
    ${p && !p.profileBonusClaimed ? `<div class="card earn-card" style="background:#fffaf0;border-color:#f3e2bd"><div class="ec-ic" style="background:#f39c32;color:#fff;border:0">${icon('user', 24)}</div><div class="grow"><div class="row"><h4 style="color:#8a4a10">Complete your profile</h4><span class="chip">+${s.profileBonus || 0} pts</span></div><p class="small muted">Add ${missing.join(', ') || 'missing details'} to unlock bonus points</p></div><button class="icon-btn" data-action="edit-profile">${icon('chevron')}</button></div>` : ''}
    <div class="section-head mt"><h2 style="font-size:20px">Your Tier Journey</h2><span class="chip">${t.windowDays}-Day Window</span></div>
    <div class="tier-journey">${(s.tiers || []).map((tier) => `<div class="tier-step ${tier.id === t.current.id ? 'on' : ''}"><div class="tdot" style="background:${esc(tier.color || '#9aa6a1')}">${icon('award', 16)}</div><b class="small">${esc(tier.name)}</b><div class="xs muted">${tier.min.toLocaleString()} pts</div></div>`).join('')}</div>
    <div class="card card-pad"><div class="row between"><b>${t.next ? `${(t.next.min - t.windowPoints).toLocaleString()} pts to ${esc(t.next.name)}` : 'You are at the top tier!'}</b><span class="small muted">${t.windowPoints.toLocaleString()} pts</span></div><div class="progress gold"><i style="width:${t.pct}%"></i></div>
      <div class="mt"><div class="eyebrow">${esc(t.current.name)} perks</div><ul class="small" style="margin:6px 0 0;padding-left:18px">${(t.current.perks || []).map((x) => `<li>${esc(x)}</li>`).join('')}<li>${t.current.multiplier || 1}× points multiplier</li></ul></div></div>`;
}

function redeemTab(p, t) {
  const order = (S.settings.tiers || []).map((x) => x.id);
  if (!S.rewards.length) return `<div class="empty card"><div class="empty-ic">${icon('gift', 28)}</div><h4>No rewards yet</h4><p>Check back soon!</p></div>`;
  return S.rewards.map((r) => {
    const tierOk = !r.minTier || order.indexOf(t.current.id) >= order.indexOf(r.minTier);
    const enough = p && (p.points || 0) >= r.cost;
    return `<div class="card reward-card"><div class="rc-em">${esc(r.icon || '🎁')}</div><div class="grow"><b>${esc(r.name)}</b><p class="xs muted">${esc(r.description || '')}</p><div class="row mt-s"><span class="chip gold">${r.cost.toLocaleString()} pts</span>${r.minTier ? `<span class="chip">${esc(r.minTier)}+</span>` : ''}</div></div>
      <button class="btn btn-sm ${enough && tierOk ? 'btn-primary' : 'btn-ghost'}" data-redeem="${esc(r.id)}" ${p && enough && tierOk ? '' : p ? 'disabled' : ''}>${!p ? 'Join' : !tierOk ? 'Locked' : enough ? 'Redeem' : `${(r.cost - (p.points || 0)).toLocaleString()} more`}</button></div>`;
  }).join('');
}

function vouchersTab() {
  if (!isMember()) return '';
  if (!S.vouchers.length) return `<div class="empty card"><div class="empty-ic">${icon('ticket', 28)}</div><h4>No vouchers yet</h4><p>Redeem your points for vouchers.</p><button class="btn btn-primary mt" data-go="#/rewards/redeem">Browse rewards</button></div>`;
  return S.vouchers.map((v) => {
    const expired = v.expiresAt && v.expiresAt < Date.now();
    const st = v.status === 'used' ? 'Used' : expired ? 'Expired' : 'Active';
    const val = v.type === 'percent' ? `${v.value}%` : v.type === 'item' ? 'FREE' : `RM${v.value}`;
    return `<div class="voucher ${st !== 'Active' ? 'used' : ''}"><div class="v-left"><b>${esc(val)}</b><span class="xs">${v.type === 'item' ? 'item' : 'off'}</span></div>
      <div class="v-body"><div class="row between"><b>${esc(v.name)}</b><span class="chip ${st === 'Active' ? 'green' : ''}">${st}</span></div><p class="xs muted">${esc(v.description || '')}</p>
      <div class="row between mt-s xs"><span class="code-pill">${esc(v.code)}</span><span class="muted">${st === 'Active' ? `Valid till ${fmtDate(v.expiresAt)}` : ''}</span></div>
      ${st === 'Active' ? '<p class="xs emerald bold mt-s">Select this voucher at checkout</p>' : ''}</div></div>`;
  }).join('');
}

function profileMissing(p) {
  const m = [];
  if (!p.phone) m.push('phone'); if (!p.birthday) m.push('birthday'); if (!p.email) m.push('email');
  return m;
}

// ------------------------------------------------------------------ account
export function renderAccount(sub) {
  const p = profile();
  const s = S.settings;
  if (sub === 'ledger') return ledgerPage();
  if (sub === 'favorites') return favoritesPage();
  if (!p) {
    return `<div class="page-head"><h1>Account</h1></div>
    <div class="member-card" style="text-align:center"><div style="display:flex;justify-content:center">${logoMark(s, 64)}</div><h3 class="mt">${esc((s.restaurantName || 'Eden Hall').toUpperCase())} REWARDS</h3><p class="muted mt-s">Join free to earn points, unlock tiers and redeem rewards. Your current orders stay linked.</p>
      <div class="row mt" style="justify-content:center"><button class="btn btn-gold" data-action="register">Join free</button><button class="btn btn-glass" data-action="login">Sign in</button></div></div>
    <div class="page-pad stack">${supportList()}</div>`;
  }
  const t = tierInfo();
  const vActive = S.vouchers.filter((v) => v.status === 'active' && (!v.expiresAt || v.expiresAt > Date.now())).length;
  const completeness = Math.round(((['name', 'email', 'phone', 'birthday'].filter((k) => p[k]).length) / 4) * 100);
  const badges = achievementList(p, t, completeness);
  const unlocked = badges.filter((b) => b.pct >= 100).length;
  return `<div class="page-head"><h1>Account</h1><button class="icon-btn solid" data-action="logout" aria-label="Sign out">${icon('logout', 20)}</button></div>
  <div class="member-card">
    <div class="row between"><div class="row">${logoMark(s, 52, 16)}<div><h3>${esc((s.restaurantName || 'Eden Hall').toUpperCase())}</h3><div class="xs muted">#${esc(p.memberNo)} · <span style="color:#5ee0a0">${icon('shield', 11)} Active</span></div></div></div><span class="tier-pill">${icon('award', 14)} ${esc(t.current.name.toUpperCase())}</span></div>
    <div class="who" data-action="edit-profile"><div class="avatar">${esc(p.name[0] || 'A')}</div><div class="grow"><div class="row"><b style="font-size:18px">${esc(p.name.split(' ')[0])}</b><span class="verified">${icon('check', 10)} VERIFIED</span></div><div class="small muted ellipsis">${esc(p.email)}</div></div>${icon('chevron', 18)}</div>
    <div class="row between"><div><div class="xs muted" style="letter-spacing:.12em">VIP MEMBER NO.</div><b style="font-size:22px;letter-spacing:.04em">#${esc(p.memberNo)}</b></div>
      <div class="right" data-go="#/account/ledger" style="cursor:pointer"><div class="xs muted" style="letter-spacing:.12em">POINTS BALANCE</div><b style="font-size:28px">${(p.points || 0).toLocaleString()}</b> <span class="muted small">pts</span></div></div>
    <div class="mc-foot"><button class="btn btn-glass btn-sm grow" data-action="member-qr">${icon('qr', 16)} Scan at POS Cashier</button><button class="btn btn-goldline btn-sm" data-go="#/rewards/redeem">${icon('gift', 16)} Rewards</button></div>
  </div>
  <div class="quick3">
    <div class="card" data-go="#/rewards/vouchers"><div class="q-ic">${icon('ticket', 20)}</div><div class="eyebrow">Vouchers</div><b>${vActive} Active</b></div>
    <div class="card" data-go="#/orders"><div class="q-ic">${icon('wallet', 20)}</div><div class="eyebrow">Total spent</div><b class="emerald">${rm(p.totalSpent)}</b></div>
    <div class="card" data-go="#/account/ledger"><div class="q-ic">${icon('history', 20)}</div><div class="eyebrow">Lifetime</div><b>${(p.lifetimePoints || 0).toLocaleString()} pts</b></div>
  </div>
  <div class="page-pad stack mt">
    <div class="card card-pad"><div class="row">${icon('trending', 20)}<div class="grow"><b class="small" style="letter-spacing:.06em">${t.next ? `${(t.next.min - t.windowPoints).toLocaleString()} MORE POINTS TO ${esc(t.next.name.toUpperCase())}` : 'TOP TIER REACHED'}</b><div class="xs muted">Rolling ${t.windowDays}-day progress</div></div><button class="btn btn-xs btn-ghost" data-go="#/account/ledger">${icon('history', 14)} Ledger</button><button class="btn btn-xs btn-light" data-action="tier-perks">Tier Perks</button></div>
      <div class="progress"><i style="width:${t.pct}%"></i></div>
      <div class="row between xs muted mt-s"><b>${esc(t.current.name.toUpperCase())} (${t.current.multiplier || 1}X)</b><span>${t.visits} visits · ${t.windowPoints.toLocaleString()} / ${t.next ? t.next.min.toLocaleString() : '—'} pts</span>${t.next ? `<b>${icon('award', 13)} ${esc(t.next.name.toUpperCase())}</b>` : ''}</div></div>

    ${!p.profileBonusClaimed ? `<div class="eyebrow">${icon('sparkle', 14)} Quests &amp; Challenges</div>
    <div class="card earn-card" style="background:#fffaf0;border-color:#f3e2bd" data-action="edit-profile"><div class="ec-ic" style="background:#f39c32;color:#fff;border:0">${icon('user', 24)}</div><div class="grow"><div class="row"><h4 style="color:#8a4a10">Profile ${completeness}% Complete</h4><span class="chip">+${s.profileBonus || 0} pts</span></div><p class="small muted">Add missing details to unlock +${s.profileBonus || 0} bonus points</p></div>${icon('chevron')}</div>` : ''}

    <div class="eyebrow">${icon('dashboard', 14)} Services &amp; Activity</div>
    <div class="svc-grid">
      <button data-go="#/orders"><div class="s-ic">${icon('receipt', 20)}</div>Orders</button>
      <button data-go="#/account/favorites"><div class="s-ic">${icon('heart', 20)}</div>Favorites</button>
      <button data-go="#/rewards/vouchers"><div class="s-ic">${icon('ticket', 20)}</div>Vouchers</button>
      <button data-go="#/account/ledger"><div class="s-ic">${icon('history', 20)}</div>Ledger</button>
    </div>

    <div class="card card-pad"><div class="row between"><b>${icon('award', 18)} ACHIEVEMENTS &amp; BADGES</b><span class="muted small">${unlocked}/${badges.length}</span></div>
      <div class="badges mt">${badges.map(badgeHtml).join('')}</div></div>

    <div class="card card-pad"><div class="row"><div class="ec-ic" style="width:46px;height:46px;border-radius:14px;border:1px solid var(--grey-2);display:grid;place-items:center">${icon('users', 20)}</div><div class="grow"><b>Invite &amp; Earn</b><div class="small muted">Earn ${s.referralBonus || 0} bonus points each</div></div><button class="btn btn-dark btn-sm" data-action="referral">${icon('qr', 16)} Invite &amp; QR</button></div>
      <div class="stat-pair mt"><div class="card card-pad" style="box-shadow:none;border:1px solid var(--grey)"><div class="eyebrow">${icon('users', 13)} Friends invited</div><b style="font-size:24px">${p.referralCount || 0}</b></div><div class="card card-pad" style="box-shadow:none;border:1px solid var(--grey)"><div class="eyebrow">${icon('award', 13)} Points earned</div><b style="font-size:24px">${(p.referralPoints || 0).toLocaleString()}</b> <span class="muted small">pts</span></div></div>
      <div class="row between card-pad mt" style="background:var(--cream);border-radius:14px"><span class="eyebrow">Your code</span><b style="letter-spacing:.14em;font-family:ui-monospace,monospace">${esc(p.referralCode)}</b><button class="btn btn-xs btn-ghost" data-copy="${esc(p.referralCode)}">${icon('copy', 14)} Copy</button></div></div>

    ${supportList()}
  </div>`;
}

function achievementList(p, t, completeness) {
  const order = (S.settings.tiers || []).map((x) => x.id);
  const n = p.totalOrders || 0;
  return [
    { name: 'Completionist', sub: `${completeness}% Complete`, pct: completeness, color: '#c27a3a' },
    { name: 'VIP Status', sub: t.current.name, pct: Math.round(((order.indexOf(t.current.id) + 1) / Math.max(1, order.length)) * 100), color: '#8b6cf0' },
    { name: 'First Sip', sub: `${Math.min(n, 1)}/1 Order`, pct: Math.min(100, n * 100), color: '#d4a07a' },
    { name: 'Regular', sub: `${Math.min(n, 10)}/10 Orders`, pct: Math.min(100, n * 10), color: '#a0aab5' },
    { name: 'Loyal Fan', sub: `${Math.min(n, 25)}/25 Orders`, pct: Math.min(100, n * 4), color: '#e0b860' },
    { name: 'Connector', sub: `${Math.min(p.referralCount || 0, 3)}/3 Friends`, pct: Math.min(100, (p.referralCount || 0) * 34), color: '#3aa37f' },
  ];
}
function badgeHtml(b) {
  const r = 32; const c = 2 * Math.PI * r;
  return `<div class="badge-item ${b.pct >= 100 ? 'unlocked' : ''}"><div class="badge-ring"><svg class="r" viewBox="0 0 70 70"><circle cx="35" cy="35" r="${r}" fill="#fff" stroke="#eee" stroke-width="3"/><circle cx="35" cy="35" r="${r}" fill="none" stroke="${b.color}" stroke-width="3" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - b.pct / 100)}" stroke-linecap="round"/></svg>${icon(b.pct >= 100 ? 'award' : 'shield', 22)}</div><b>${esc(b.name)}</b><span>${esc(b.sub)}</span></div>`;
}

function supportList() {
  return `<div class="eyebrow">${icon('shield', 14)} Support &amp; Policies</div>
    <div class="card list-card">
      ${[['help', 'info', 'Help & Feedback'], ['refund', 'refresh', 'Refund Policy'], ['privacy', 'shield', 'Privacy Policy'], ['terms', 'layers', 'Terms & Conditions']].map(([k, ic, label]) => `<button data-policy="${k}"><span class="l-ic">${icon(ic, 20)}</span>${esc(label)}${icon('chevron', 18)}</button>`).join('')}
      ${isMember() ? `<button data-action="logout"><span class="l-ic">${icon('logout', 20)}</span>Sign out${icon('chevron', 18)}</button>` : ''}
    </div>
    <p class="center xs muted">Staff? <a href="admin.html">Admin portal</a> · <a href="kitchen.html">Kitchen display</a></p>`;
}

function ledgerPage() {
  const p = profile();
  const typeIc = { earn: 'receipt', redeem: 'gift', bonus: 'sparkle', referral: 'users', checkin: 'calendar', adjust: 'edit' };
  return `<div class="page-head"><button class="icon-btn solid" onclick="history.back()" aria-label="Back">${icon('back')}</button><h1>Points Ledger</h1></div>
  <div class="page-pad stack">
    <div class="card card-pad row between"><div><div class="eyebrow">Balance</div><b style="font-size:30px">${p ? (p.points || 0).toLocaleString() : 0}</b> pts</div><div class="right"><div class="eyebrow">Lifetime earned</div><b>${p ? (p.lifetimePoints || 0).toLocaleString() : 0}</b></div></div>
    <div class="card">${S.ledger.length ? S.ledger.map((l) => `<div class="order-row"><div class="or-ic">${icon(typeIc[l.type] || 'coins', 20)}</div><div class="grow"><b class="small">${esc(l.reason)}</b><div class="xs muted">${fmtDateTime(l.createdAt)}</div></div><div class="right"><b class="${l.delta > 0 ? 'emerald' : ''}" style="${l.delta < 0 ? 'color:var(--danger)' : ''}">${l.delta > 0 ? '+' : ''}${l.delta.toLocaleString()}</b><div class="xs muted">Bal ${l.balanceAfter.toLocaleString()}</div></div></div>`).join('') : `<div class="empty"><div class="empty-ic">${icon('history', 28)}</div><h4>No transactions yet</h4><p>Points from paid orders will appear here.</p></div>`}</div>
  </div>`;
}

function favoritesPage() {
  const p = profile();
  const favs = (p && p.favorites) || [];
  const items = favs.map(menuById).filter(Boolean);
  return `<div class="page-head"><button class="icon-btn solid" onclick="history.back()" aria-label="Back">${icon('back')}</button><h1>Favorites</h1></div>
  <div class="page-pad">${items.length ? `<div class="menu-grid">${items.map((m) => `<div class="dish ${m.available === false ? 'soldout' : ''}" data-item="${esc(m.id)}"><div class="dish-img"><img src="${esc(menuImage(m.image))}" alt=""><button class="add" data-quick="${esc(m.id)}">${icon('plus', 20)}</button></div><h4>${esc(m.name)}</h4><div class="price">${rm(m.price)}</div></div>`).join('')}</div>` : `<div class="empty"><div class="empty-ic">${icon('heart', 28)}</div><h4>No favorites yet</h4><p>Tap the heart on any dish to save it here.</p><a class="btn btn-primary mt" href="#/menu">Browse menu</a></div>`}</div>`;
}

// ------------------------------------------------------------------ modals
export function openReferral() {
  const p = profile();
  const link = `${location.origin}${location.pathname}?ref=${encodeURIComponent(p.referralCode)}`;
  openModal({
    title: 'Invite friends', sheet: true,
    body: `<div class="center"><p class="muted">Friends get <b>${S.settings.referralBonus || 0} pts</b> when they join with your code – and so do you!</p>
      <div style="display:inline-block;padding:14px;background:#fff;border-radius:20px;box-shadow:var(--shadow);margin:16px 0">${qrSvg(link, { size: 210 })}</div>
      <div class="row" style="justify-content:center"><span class="code-pill" style="font-size:20px;padding:8px 16px">${esc(p.referralCode)}</span></div>
      <div class="row mt" style="justify-content:center"><button class="btn btn-ghost" data-copy-link>${icon('copy', 16)} Copy link</button>${navigator.share ? `<button class="btn btn-primary" data-share>${icon('external', 16)} Share</button>` : ''}</div></div>`,
    onOpen: (el) => {
      $('[data-copy-link]', el).addEventListener('click', () => copyText(link));
      const sh = $('[data-share]', el);
      if (sh) sh.addEventListener('click', () => navigator.share({ title: S.settings.restaurantName, text: `Join me at ${S.settings.restaurantName} and get bonus points! Code: ${p.referralCode}`, url: link }).catch(() => {}));
    },
  });
}

function openMemberQr() {
  const p = profile();
  openModal({
    title: 'Member QR', sheet: true,
    body: `<div class="center"><p class="muted">Show this to our cashier to identify your membership.</p>
      <div style="display:inline-block;padding:14px;background:#fff;border-radius:20px;box-shadow:var(--shadow);margin:16px 0">${qrSvg(`EDENHALL-MEMBER:${p.memberNo}:${p.id}`, { size: 230 })}</div>
      <h3>#${esc(p.memberNo)}</h3><p class="small muted">${esc(p.name)}</p></div>`,
  });
}

function openProfile() {
  const p = profile();
  openModal({
    title: 'Edit profile', sheet: true,
    body: `<form class="stack" id="profile-form">
      <label class="field"><span>Full name</span><input class="input" name="name" value="${esc(p.name)}" required></label>
      <label class="field"><span>Email</span><input class="input" value="${esc(p.email)}" disabled></label>
      <label class="field"><span>Phone</span><input class="input" name="phone" type="tel" value="${esc(p.phone || '')}" placeholder="+60 12-345 6789"></label>
      <label class="field"><span>Birthday <em class="hint">– for your birthday treat</em></span><input class="input" name="birthday" type="date" value="${esc(p.birthday || '')}"></label>
      ${!p.profileBonusClaimed ? `<div class="chip gold" style="justify-content:center;padding:8px">${icon('sparkle', 14)} Complete all fields to earn +${S.settings.profileBonus || 0} pts</div>` : ''}
      <button class="btn btn-primary btn-block btn-lg" type="submit">Save</button></form>`,
    onOpen: (el, close) => {
      $('#profile-form', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button'); btn.classList.add('loading');
        try { const r = await S.api.call('updateProfile', formData(e.target)); toast(r.bonus ? `Profile saved · +${r.bonus} pts!` : 'Profile saved', 'success'); close(); } catch (err) { toast(errMsg(err), 'error'); } finally { btn.classList.remove('loading'); }
      });
    },
  });
}

function openTierPerks() {
  const t = tierInfo();
  openModal({
    title: 'Tier perks', sheet: true,
    body: (S.settings.tiers || []).map((tier) => `<div class="card card-pad mb" style="${tier.id === t.current.id ? 'border:2px solid var(--emerald)' : ''}"><div class="row between"><b>${esc(tier.name)}</b><span class="chip">${tier.min.toLocaleString()} pts · ${tier.multiplier}×</span></div><ul class="small" style="margin:8px 0 0;padding-left:18px">${(tier.perks || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('') + `<p class="xs muted">Tier is based on points earned in the last ${t.windowDays} days.</p>`,
  });
}

const POLICIES = {
  help: ['Help & Feedback', (s) => `<p>Need help with an order? Tap the bell to see updates, or speak to any of our staff.</p><p class="mt-s">📞 ${esc(s.phone || '')}<br>✉️ ${esc(s.email || '')}</p><p class="mt-s">We love feedback – tell us how we did on your next visit!</p>`],
  refund: ['Refund Policy', () => '<p>Orders can be cancelled free of charge before the kitchen accepts them. Once preparation has started, cancellations are at the manager\'s discretion.</p><p class="mt-s">If something is wrong with your food, let our staff know immediately and we will replace it or refund the item. Online payments are refunded to the original payment method within 7–14 working days.</p>'],
  privacy: ['Privacy Policy', () => '<p>We collect your name, contact details and order history only to process orders, run the loyalty programme and contact you about your orders. We never sell your data.</p><p class="mt-s">Your data is stored securely and access is restricted to authorised staff. You may request access or deletion of your data at any time by contacting us, in line with the Personal Data Protection Act 2010 (PDPA).</p>'],
  terms: ['Terms & Conditions', () => '<p>Prices are in Ringgit Malaysia and may be subject to service charge and SST as shown at checkout. The final amount is calculated by our system when you confirm your order.</p><p class="mt-s">Points have no cash value, are non-transferable and may expire if your account is inactive for 12 months. Vouchers are valid until the date shown.</p>'],
};

// ------------------------------------------------------------------ delegation
document.addEventListener('click', async (e) => {
  if (e.target.closest('.modal-wrap')) return;
  const ci = e.target.closest('[data-checkin]');
  if (ci) {
    if (!isMember()) { openAuth('register'); return; }
    try { const r = await S.api.call('dailyCheckIn', {}); toast(`Checked in · +${r.points} pts`, 'gold'); } catch (err) { toast(errMsg(err), 'error'); }
    return;
  }
  const rd = e.target.closest('[data-redeem]');
  if (rd) {
    if (!isMember()) { openAuth('register'); return; }
    const r = S.rewards.find((x) => x.id === rd.dataset.redeem);
    openModal({
      title: 'Redeem reward', sheet: true,
      body: `<div class="center"><div class="rc-em" style="width:80px;height:80px;font-size:38px;border-radius:24px;display:grid;place-items:center;margin:0 auto;background:var(--gold-soft)">${esc(r.icon || '🎁')}</div><h3 class="mt">${esc(r.name)}</h3><p class="muted small">${esc(r.description || '')}</p><p class="mt">Use <b>${r.cost.toLocaleString()} pts</b>? You'll have <b>${((profile().points || 0) - r.cost).toLocaleString()}</b> left.</p></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Redeem', cls: 'btn-primary', onClick: async (el, close) => { try { await S.api.call('redeemReward', { rewardId: r.id }); toast('Voucher added to My Vouchers', 'gold'); close(); go('#/rewards/vouchers'); } catch (err) { toast(errMsg(err), 'error'); } } }],
    });
    return;
  }
  const pol = e.target.closest('[data-policy]');
  if (pol) { const [title, fn] = POLICIES[pol.dataset.policy]; openModal({ title, sheet: true, body: `<div class="small" style="line-height:1.7">${fn(S.settings)}</div>` }); return; }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  switch (a.dataset.action) {
    case 'logout': await S.api.auth.logout(); await S.api.auth.ensureGuest(); toast('Signed out'); go('#/'); break;
    case 'edit-profile': if (isMember()) openProfile(); break;
    case 'member-qr': openMemberQr(); break;
    case 'tier-perks': openTierPerks(); break;
    default: break;
  }
});

export { STATUS_LABEL, timeAgo, $$, bus };
