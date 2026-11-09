// Admin views: Customers, Payments, Rewards, Staff, Reports, Settings
import { A, can, run, schedule } from './app.js';
import { dayStart, topItems, openOrder, recordPaymentModal } from './views.js';
import { ROLES, ALL_PERMISSIONS } from '../core/server-logic.js';
import { tierFor } from '../core/pricing.js';
import { barChart, donutChart, hBars } from '../core/charts.js';
import {
  $, $$, esc, rm, num, icon, toast, openModal, confirmDialog, errMsg, fmtDate, fmtDateTime, timeAgo, formData,
  STATUS_LABEL, PAY_LABEL, METHOD_LABEL, downloadCSV, printHtml, receiptHtml, todayISO,
} from '../core/ui.js';

const tierName = (id) => ((A.settings.tiers || []).find((t) => t.id === id) || { name: id || 'Classic' }).name;
const logAct = (action, detail) => A.api.call('logStaffActivity', { action, detail }).catch(() => {});

// =================================================================== CUSTOMERS
const cf = { q: '', tier: 'all', sort: 'createdAt' };
const customers = {
  title: 'Customers',
  render() {
    let list = A.users;
    if (cf.q) { const q = cf.q.toLowerCase(); list = list.filter((u) => `${u.name} ${u.email} ${u.phone} ${u.memberNo}`.toLowerCase().includes(q)); }
    if (cf.tier !== 'all') list = list.filter((u) => (u.tierId || 'classic') === cf.tier);
    list = [...list].sort((a, b) => (b[cf.sort] || 0) - (a[cf.sort] || 0));
    const totalSpent = A.users.reduce((s, u) => s + (u.totalSpent || 0), 0);
    return `<div class="kpis mb">
      <div class="kpi"><div class="k-ic">${icon('users', 20)}</div><div class="k-label">Members</div><div class="k-val">${num(A.users.length)}</div></div>
      <div class="kpi"><div class="k-ic">${icon('sparkle', 20)}</div><div class="k-label">New (30 days)</div><div class="k-val">${num(A.users.filter((u) => u.createdAt >= dayStart(29)).length)}</div></div>
      <div class="kpi"><div class="k-ic">${icon('wallet', 20)}</div><div class="k-label">Member spending</div><div class="k-val">${rm(totalSpent)}</div></div>
      <div class="kpi"><div class="k-ic">${icon('award', 20)}</div><div class="k-label">Points outstanding</div><div class="k-val">${num(A.users.reduce((s, u) => s + (u.points || 0), 0))}</div></div>
    </div>
    <div class="toolbar"><div class="search-box">${icon('search', 18)}<input class="input" id="cust-q" placeholder="Search name, phone, email, member no…" value="${esc(cf.q)}"></div>
      <select class="input" id="cust-tier"><option value="all">All tiers</option>${(A.settings.tiers || []).map((t) => `<option value="${esc(t.id)}" ${cf.tier === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <select class="input" id="cust-sort"><option value="createdAt" ${cf.sort === 'createdAt' ? 'selected' : ''}>Newest</option><option value="totalSpent" ${cf.sort === 'totalSpent' ? 'selected' : ''}>Top spenders</option><option value="totalOrders" ${cf.sort === 'totalOrders' ? 'selected' : ''}>Most orders</option><option value="points" ${cf.sort === 'points' ? 'selected' : ''}>Most points</option></select>
      <span class="grow"></span><button class="btn btn-ghost" id="cust-csv">${icon('download', 16)} Export CSV</button></div>
    <div class="panel" style="padding:0"><div class="table-wrap"><table class="data"><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>Orders</th><th>Total spent</th><th>Tier</th><th>Points</th><th>Registered</th></tr></thead><tbody>
      ${list.length ? list.map((u) => `<tr class="clickable" data-cust="${esc(u.id)}"><td><b>${esc(u.name)}</b><div class="xs muted">#${esc(u.memberNo || '')}</div></td><td>${esc(u.phone || '—')}</td><td class="small">${esc(u.email || '—')}</td><td>${u.totalOrders || 0}</td><td>${rm(u.totalSpent)}</td><td><span class="chip gold">${esc(tierName(u.tierId))}</span></td><td><b>${num(u.points)}</b></td><td class="small">${fmtDate(u.createdAt)}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">No customers found</td></tr>'}
    </tbody></table></div></div>`;
  },
  bind(el) {
    $('#cust-q', el).addEventListener('input', (e) => { cf.q = e.target.value; schedule(); });
    $('#cust-tier', el).addEventListener('change', (e) => { cf.tier = e.target.value; schedule(); });
    $('#cust-sort', el).addEventListener('change', (e) => { cf.sort = e.target.value; schedule(); });
    $('#cust-csv', el).addEventListener('click', () => downloadCSV(`customers-${todayISO()}.csv`, [['Member No', 'Name', 'Phone', 'Email', 'Total Orders', 'Total Spent', 'Tier', 'Points', 'Lifetime Points', 'Registered'], ...A.users.map((u) => [u.memberNo, u.name, u.phone, u.email, u.totalOrders || 0, (u.totalSpent || 0).toFixed(2), tierName(u.tierId), u.points || 0, u.lifetimePoints || 0, fmtDate(u.createdAt)])]));
    el.addEventListener('click', (e) => { const r = e.target.closest('[data-cust]'); if (r) customerProfile(r.dataset.cust); });
  },
};

async function customerProfile(uid) {
  const u = A.users.find((x) => x.id === uid);
  if (!u) return;
  const m = openModal({ title: u.name, wide: true, body: '<div class="skeleton" style="height:300px"></div>' });
  let orders = []; let ledger = [];
  try {
    [orders, ledger] = await Promise.all([
      A.api.list('orders', { where: [['customerUid', '==', uid]], orderBy: ['createdAt', 'desc'], limit: 50 }),
      A.api.list('loyalty_transactions', { where: [['uid', '==', uid]], orderBy: ['createdAt', 'desc'], limit: 50 }),
    ]);
  } catch (e) { toast(errMsg(e), 'error'); }
  const body = $('.modal-body', m.el);
  body.innerHTML = `<div class="cust-head"><div class="avatar">${esc(u.name[0])}</div><div class="grow"><h3 style="font-size:22px">${esc(u.name)}</h3><div class="small muted">#${esc(u.memberNo)} · ${esc(u.email)} · ${esc(u.phone || 'no phone')}</div><div class="row wrap mt-s"><span class="chip gold">${esc(tierName(u.tierId))}</span><span class="chip">Joined ${fmtDate(u.createdAt)}</span>${u.birthday ? `<span class="chip">🎂 ${esc(u.birthday)}</span>` : ''}${u.referralCount ? `<span class="chip green">${u.referralCount} referrals</span>` : ''}</div></div></div>
    <div class="kpis mt" style="grid-template-columns:repeat(4,1fr)"><div class="kpi"><div class="k-label">Points</div><div class="k-val">${num(u.points)}</div></div><div class="kpi"><div class="k-label">Lifetime pts</div><div class="k-val">${num(u.lifetimePoints)}</div></div><div class="kpi"><div class="k-label">Orders</div><div class="k-val">${u.totalOrders || 0}</div></div><div class="kpi"><div class="k-label">Spent</div><div class="k-val">${rm(u.totalSpent)}</div></div></div>
    ${can('customers') || can('rewards') ? `<form class="row wrap mt panel" style="background:var(--cream)" id="adj-form"><b class="small">Adjust points</b><input class="input" name="delta" type="number" placeholder="+100 / -50" style="width:130px" required><input class="input grow" name="reason" placeholder="Reason (e.g. goodwill, correction)" required><button class="btn btn-primary btn-sm" type="submit">Apply</button></form>` : ''}
    <div class="grid-2 even"><div><h4 class="mb">Order history</h4><div class="table-wrap"><table class="data"><tbody>${orders.length ? orders.map((o) => `<tr class="clickable" data-order="${esc(o.id)}"><td><b>${esc(o.orderNo)}</b><div class="xs muted">${fmtDateTime(o.createdAt)}</div></td><td>${rm(o.total)}</td><td><span class="chip status-${o.status}">${STATUS_LABEL[o.status]}</span></td></tr>`).join('') : '<tr><td class="muted">No orders</td></tr>'}</tbody></table></div></div>
    <div><h4 class="mb">Points ledger</h4><div class="table-wrap"><table class="data"><tbody>${ledger.length ? ledger.map((l) => `<tr><td class="small">${esc(l.reason)}<div class="xs muted">${fmtDateTime(l.createdAt)}</div></td><td class="right"><b style="color:${l.delta > 0 ? 'var(--emerald)' : 'var(--danger)'}">${l.delta > 0 ? '+' : ''}${l.delta}</b></td></tr>`).join('') : '<tr><td class="muted">No transactions</td></tr>'}</tbody></table></div></div></div>`;
  const f = $('#adj-form', body);
  if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(f); try { await run(A.api.call('adjustPoints', { uid, delta: d.delta, reason: d.reason }), 'Points updated'); m.close(); setTimeout(() => customerProfile(uid), 250); } catch { /* */ } });
  body.addEventListener('click', (e) => { const o = e.target.closest('[data-order]'); if (o) openOrder(o.dataset.order); });
}

// =================================================================== PAYMENTS
const pf = { method: 'all', range: 'today' };
const payments = {
  title: 'Payments',
  render() {
    const t0 = dayStart(0);
    const pending = A.payments.filter((p) => p.status === 'pending');
    const unpaid = A.orders.filter((o) => o.status !== 'cancelled' && o.paymentStatus !== 'paid' && o.paymentStatus !== 'pending_verification');
    let hist = A.payments.filter((p) => p.status !== 'pending');
    if (pf.range === 'today') hist = hist.filter((p) => p.createdAt >= t0); else if (pf.range === '7d') hist = hist.filter((p) => p.createdAt >= dayStart(6));
    if (pf.method !== 'all') hist = hist.filter((p) => p.method === pf.method);
    const today = A.payments.filter((p) => p.status === 'success' && p.createdAt >= t0);
    const sum = (arr, m) => arr.filter((p) => !m || p.method === m).reduce((s, p) => s + p.amount, 0);
    return `<div class="kpis mb">
      <div class="kpi hero"><div class="k-ic">${icon('wallet', 20)}</div><div class="k-label">Collected today</div><div class="k-val">${rm(sum(today))}</div><div class="k-sub">${today.length} payments</div></div>
      <div class="kpi"><div class="k-ic">${icon('coins', 20)}</div><div class="k-label">Cash</div><div class="k-val">${rm(sum(today, 'cash'))}</div></div>
      <div class="kpi"><div class="k-ic">${icon('qr', 20)}</div><div class="k-label">DuitNow QR</div><div class="k-val">${rm(sum(today, 'duitnow'))}</div></div>
      <div class="kpi"><div class="k-ic">${icon('card', 20)}</div><div class="k-label">Online</div><div class="k-val">${rm(sum(today, 'online'))}</div></div>
    </div>
    <div class="grid-2 even" style="margin-top:0">
      <div class="panel"><div class="panel-head"><h3>Verify DuitNow</h3><span class="chip ${pending.length ? 'blue' : ''}">${pending.length} pending</span></div>
        ${pending.length ? `<div class="table-wrap"><table class="data"><tbody>${pending.map((p) => `<tr><td><b>${esc(p.orderNo)}</b><div class="xs muted">${esc(p.customerName || '')} · ${timeAgo(p.createdAt)}</div></td><td>Ref <b>${esc(p.reference)}</b></td><td><b>${rm(p.amount)}</b></td><td class="row"><button class="btn btn-xs btn-primary" data-verify="1" data-pid="${esc(p.id)}">Approve</button><button class="btn btn-xs btn-danger-ghost" data-verify="0" data-pid="${esc(p.id)}">Reject</button></td></tr>`).join('')}</tbody></table></div><p class="xs muted mt-s">${icon('shield', 12)} Approve only after confirming the credit in your bank account.</p>` : '<p class="muted small">No transfers waiting for verification.</p>'}</div>
      <div class="panel"><div class="panel-head"><h3>Awaiting payment</h3><span class="chip orange">${unpaid.length} orders · ${rm(unpaid.reduce((s, o) => s + o.total, 0))}</span></div>
        ${unpaid.length ? `<div class="table-wrap" style="max-height:340px;overflow:auto"><table class="data"><tbody>${unpaid.map((o) => `<tr><td><b>${esc(o.orderNo)}</b><div class="xs muted">${esc(o.tableName || 'Takeaway')} · ${STATUS_LABEL[o.status]}</div></td><td class="small">${esc(METHOD_LABEL[o.paymentMethod])}</td><td><b>${rm(o.total)}</b></td><td><button class="btn btn-xs btn-gold" data-record="${esc(o.id)}">Record</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">All orders are paid. 🎉</p>'}</div>
    </div>
    <div class="panel mt"><div class="panel-head"><h3>Payment history</h3><div class="row wrap">
      <select class="input" id="pf-method" style="width:auto;padding:8px 12px"><option value="all">All methods</option>${Object.entries(METHOD_LABEL).map(([k, l]) => `<option value="${k}" ${pf.method === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="input" id="pf-range" style="width:auto;padding:8px 12px"><option value="today" ${pf.range === 'today' ? 'selected' : ''}>Today</option><option value="7d" ${pf.range === '7d' ? 'selected' : ''}>7 days</option><option value="all" ${pf.range === 'all' ? 'selected' : ''}>120 days</option></select>
      <button class="btn btn-sm btn-ghost" id="pay-csv">${icon('download', 15)} CSV</button></div></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Time</th><th>Order</th><th>Customer</th><th>Method</th><th>Reference</th><th>Recorded by</th><th>Status</th><th class="right">Amount</th><th></th></tr></thead><tbody>
      ${hist.length ? hist.slice(0, 300).map((p) => `<tr><td class="small">${fmtDateTime(p.createdAt)}</td><td><b>${esc(p.orderNo)}</b></td><td class="small">${esc(p.customerName || '—')}</td><td>${esc(METHOD_LABEL[p.method] || p.method)}</td><td class="small">${esc(p.reference || '—')}</td><td class="small">${esc(p.recordedBy || '—')}</td><td><span class="chip ${p.status === 'success' ? 'green' : 'red'}">${p.status === 'success' ? 'Success' : 'Rejected'}</span></td><td class="right"><b>${rm(p.amount)}</b></td><td><button class="icon-btn sm" data-receipt="${esc(p.orderId)}" title="Receipt">${icon('printer', 15)}</button></td></tr>`).join('') : '<tr><td colspan="9" class="empty">No payments</td></tr>'}
      </tbody></table></div></div>`;
  },
  bind(el) {
    $('#pf-method', el).addEventListener('change', (e) => { pf.method = e.target.value; schedule(); });
    $('#pf-range', el).addEventListener('change', (e) => { pf.range = e.target.value; schedule(); });
    $('#pay-csv', el).addEventListener('click', () => downloadCSV(`payments-${todayISO()}.csv`, [['Time', 'Order', 'Customer', 'Method', 'Reference', 'Recorded by', 'Status', 'Amount'], ...A.payments.map((p) => [fmtDateTime(p.createdAt), p.orderNo, p.customerName, METHOD_LABEL[p.method] || p.method, p.reference, p.recordedBy, p.status, p.amount.toFixed(2)])]));
    el.addEventListener('click', async (e) => {
      const v = e.target.closest('[data-verify]');
      if (v) { v.classList.add('loading'); await run(A.api.call('verifyPayment', { paymentId: v.dataset.pid, approve: v.dataset.verify === '1' }), v.dataset.verify === '1' ? 'Payment verified' : 'Payment rejected').catch(() => {}); return; }
      const r = e.target.closest('[data-record]'); if (r) { recordPaymentModal(A.orders.find((o) => o.id === r.dataset.record)); return; }
      const rc = e.target.closest('[data-receipt]');
      if (rc) { const o = A.orders.find((x) => x.id === rc.dataset.receipt) || await A.api.get('orders', rc.dataset.receipt); if (o) printHtml(`Receipt ${o.orderNo}`, receiptHtml(o, A.settings)); }
    });
  },
};

// =================================================================== REWARDS
const rewards = {
  title: 'Loyalty & Rewards',
  render() {
    const s = A.settings;
    const dist = (s.tiers || []).map((t) => ({ label: t.name, value: A.users.filter((u) => (u.tierId || 'classic') === t.id).length, color: t.color }));
    return `<div class="grid-2" style="margin-top:0">
      <div class="panel"><div class="panel-head"><h3>Loyalty rules</h3><button class="btn btn-sm btn-primary" id="edit-loyalty">${icon('edit', 15)} Edit rules</button></div>
        <div class="detail-grid">
          <div><span>Earning rate</span><b>RM1 = ${s.pointsPerRM} pts</b></div><div><span>Tier window</span><b>${s.tierWindowDays} days</b></div>
          <div><span>Referral bonus</span><b>${s.referralBonus} pts each</b></div><div><span>Daily check-in</span><b>${s.checkInPoints} pts</b></div>
          <div><span>Profile completion</span><b>${s.profileBonus} pts</b></div><div><span>Points awarded</span><b>When order is completed &amp; paid</b></div>
        </div>
        <div class="table-wrap"><table class="data mt"><thead><tr><th>Tier</th><th>Min points (window)</th><th>Multiplier</th><th>Perks</th></tr></thead><tbody>${(s.tiers || []).map((t) => `<tr><td><span class="chip" style="background:${esc(t.color)}33">${esc(t.name)}</span></td><td>${num(t.min)}</td><td>${t.multiplier}×</td><td class="small">${(t.perks || []).map(esc).join(' · ')}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><div class="panel-head"><h3>Members by tier</h3></div>${donutChart(dist, { center: String(A.users.length), sub: 'members', size: 170 })}</div>
    </div>
    <div class="panel mt"><div class="panel-head"><h3>Rewards catalogue</h3><div class="row"><button class="btn btn-sm btn-ghost" id="view-vouchers">${icon('ticket', 15)} Issued vouchers</button><button class="btn btn-sm btn-primary" id="add-reward">${icon('plus', 15)} Add reward</button></div></div>
      <div class="table-wrap"><table class="data"><thead><tr><th></th><th>Reward</th><th>Cost</th><th>Type</th><th>Min spend</th><th>Min tier</th><th>Valid</th><th>Status</th><th></th></tr></thead><tbody>
      ${A.rewards.map((r) => `<tr><td style="font-size:24px">${esc(r.icon || '🎁')}</td><td><b>${esc(r.name)}</b><div class="xs muted">${esc(r.description || '')}</div></td><td><b>${num(r.cost)}</b> pts</td><td>${r.type === 'percent' ? `${r.value}% off${r.maxDiscount ? ` (max RM${r.maxDiscount})` : ''}` : r.type === 'item' ? `Free ${esc(r.itemName || '')}` : `RM${r.value} off`}</td><td>${r.minSpend ? rm(r.minSpend) : '—'}</td><td>${r.minTier ? esc(tierName(r.minTier)) : '—'}</td><td>${r.validDays || 30} days</td><td><label class="switch"><input type="checkbox" data-ractive="${esc(r.id)}" ${r.active !== false ? 'checked' : ''}><span></span></label></td><td class="row"><button class="icon-btn sm" data-redit="${esc(r.id)}">${icon('edit', 15)}</button><button class="icon-btn sm" data-rdel="${esc(r.id)}" style="color:var(--danger)">${icon('trash', 15)}</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">No rewards yet</td></tr>'}
      </tbody></table></div></div>`;
  },
  bind(el) {
    $('#edit-loyalty', el).addEventListener('click', loyaltyForm);
    $('#add-reward', el).addEventListener('click', () => rewardForm(null));
    $('#view-vouchers', el).addEventListener('click', vouchersModal);
    el.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-redit]'); if (ed) return rewardForm(A.rewards.find((r) => r.id === ed.dataset.redit));
      const dl = e.target.closest('[data-rdel]');
      if (dl && await confirmDialog('Delete this reward? Issued vouchers remain valid.', { danger: true, okLabel: 'Delete' })) await run(A.api.remove('rewards', dl.dataset.rdel), 'Reward deleted').catch(() => {});
    });
    el.addEventListener('change', async (e) => { const t = e.target.closest('[data-ractive]'); if (t) await run(A.api.save('rewards', t.dataset.ractive, { active: t.checked }), t.checked ? 'Reward active' : 'Reward hidden').catch(() => {}); });
  },
};

function loyaltyForm() {
  const s = A.settings;
  openModal({
    title: 'Loyalty rules', wide: true,
    body: `<form id="loy-form"><div class="form-grid">
      <label class="field"><span>Points per RM1</span><input class="input" name="pointsPerRM" type="number" min="0" step="0.5" value="${s.pointsPerRM}"></label>
      <label class="field"><span>Tier window (days)</span><input class="input" name="tierWindowDays" type="number" min="7" value="${s.tierWindowDays}"></label>
      <label class="field"><span>Referral bonus (pts)</span><input class="input" name="referralBonus" type="number" min="0" value="${s.referralBonus}"></label>
      <label class="field"><span>Daily check-in (pts)</span><input class="input" name="checkInPoints" type="number" min="0" value="${s.checkInPoints}"></label>
      <label class="field"><span>Profile completion bonus (pts)</span><input class="input" name="profileBonus" type="number" min="0" value="${s.profileBonus}"></label></div>
      <h4 class="mt mb">Membership tiers</h4>
      <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Min pts</th><th>Multiplier</th><th>Colour</th><th>Perks (comma separated)</th></tr></thead><tbody>
      ${(s.tiers || []).map((t, i) => `<tr data-tier="${i}"><td><input class="input" data-k="name" value="${esc(t.name)}"></td><td><input class="input" data-k="min" type="number" min="0" value="${t.min}" ${i === 0 ? 'readonly' : ''}></td><td><input class="input" data-k="multiplier" type="number" step="0.1" min="1" value="${t.multiplier}"></td><td><input class="input" data-k="color" type="color" value="${esc(t.color || '#9aa6a1')}" style="padding:4px;height:44px"></td><td><input class="input" data-k="perks" value="${esc((t.perks || []).join(', '))}"></td></tr>`).join('')}</tbody></table></div></form>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Save rules', cls: 'btn-primary', onClick: async (el, close) => {
        const v = formData($('#loy-form', el));
        const tiers = (s.tiers || []).map((t, i) => { const r = $(`[data-tier="${i}"]`, el); const g = (k) => $(`[data-k=${k}]`, r).value; return { ...t, name: g('name'), min: i === 0 ? 0 : Number(g('min')), multiplier: Number(g('multiplier')) || 1, color: g('color'), perks: g('perks').split(',').map((x) => x.trim()).filter(Boolean) }; });
        for (let i = 1; i < tiers.length; i++) if (tiers[i].min <= tiers[i - 1].min) return toast('Tier thresholds must increase', 'error');
        try { await run(A.api.save('settings', 'general', { ...v, tiers }), 'Loyalty rules saved'); logAct('settings.loyalty', 'Updated loyalty rules'); close(); } catch { /* */ }
      },
    }],
  });
}

function rewardForm(r) {
  const isNew = !r;
  const d = r || { name: '', description: '', cost: 500, type: 'amount', value: 5, minSpend: 0, validDays: 30, icon: '🎁', active: true };
  openModal({
    title: isNew ? 'Add reward' : `Edit ${d.name}`, wide: true,
    body: `<form class="form-grid" id="rw-form">
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(d.name)}" required></label>
      <label class="field"><span>Icon (emoji)</span><input class="input" name="icon" value="${esc(d.icon || '')}"></label>
      <label class="field full"><span>Description</span><input class="input" name="description" value="${esc(d.description || '')}"></label>
      <label class="field"><span>Points cost</span><input class="input" name="cost" type="number" min="1" value="${d.cost}" required></label>
      <label class="field"><span>Type</span><select class="input" name="type"><option value="amount" ${d.type === 'amount' ? 'selected' : ''}>RM amount off</option><option value="percent" ${d.type === 'percent' ? 'selected' : ''}>Percent off</option><option value="item" ${d.type === 'item' ? 'selected' : ''}>Free menu item</option></select></label>
      <label class="field"><span>Value (RM or %)</span><input class="input" name="value" type="number" step="0.01" min="0" value="${d.value || 0}"></label>
      <label class="field"><span>Max discount RM <em class="hint">(percent only)</em></span><input class="input" name="maxDiscount" type="number" step="0.01" min="0" value="${d.maxDiscount || ''}"></label>
      <label class="field"><span>Free item <em class="hint">(item type)</em></span><select class="input" name="menuId"><option value="">—</option>${A.menu.map((m) => `<option value="${esc(m.id)}" ${d.menuId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Minimum spend (RM)</span><input class="input" name="minSpend" type="number" step="0.01" min="0" value="${d.minSpend || 0}"></label>
      <label class="field"><span>Minimum tier</span><select class="input" name="minTier"><option value="">Any</option>${(A.settings.tiers || []).map((t) => `<option value="${esc(t.id)}" ${d.minTier === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Voucher valid (days)</span><input class="input" name="validDays" type="number" min="1" value="${d.validDays || 30}"></label>
      <label class="field"><span>Stock <em class="hint">(blank = unlimited)</em></span><input class="input" name="stock" type="number" min="0" value="${typeof d.stock === 'number' ? d.stock : ''}"></label>
      <label class="check full"><span class="switch"><input type="checkbox" name="active" ${d.active !== false ? 'checked' : ''}><span></span></span> Active (visible to customers)</label>
    </form>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Save', cls: 'btn-primary', onClick: async (el, close) => {
        const v = formData($('#rw-form', el));
        if (!v.name || !v.cost) return toast('Name and cost are required', 'error');
        if (v.type === 'item' && !v.menuId) return toast('Choose the free menu item', 'error');
        const item = A.menu.find((m) => m.id === v.menuId);
        const payload = { ...v, itemName: item ? item.name : null, minTier: v.minTier || null, maxDiscount: v.maxDiscount || null, stock: v.stock === null ? null : v.stock };
        try { await run(A.api.save('rewards', isNew ? null : d.id, payload), 'Reward saved'); logAct('reward.saved', v.name); close(); } catch { /* */ }
      },
    }],
  });
}

async function vouchersModal() {
  const m = openModal({ title: 'Issued vouchers', wide: true, body: '<div class="skeleton" style="height:200px"></div>' });
  try {
    const list = await A.api.list('vouchers', { orderBy: ['createdAt', 'desc'], limit: 200 });
    const name = (uid) => (A.users.find((u) => u.id === uid) || {}).name || uid;
    $('.modal-body', m.el).innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Voucher</th><th>Customer</th><th>Code</th><th>Status</th><th>Issued</th><th>Expires</th></tr></thead><tbody>${list.map((v) => `<tr><td><b>${esc(v.name)}</b></td><td>${esc(name(v.uid))}</td><td><code>${esc(v.code)}</code></td><td><span class="chip ${v.status === 'active' ? 'green' : ''}">${esc(v.status)}</span></td><td class="small">${fmtDate(v.createdAt)}</td><td class="small">${fmtDate(v.expiresAt)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No vouchers issued yet</td></tr>'}</tbody></table></div>`;
  } catch (e) { $('.modal-body', m.el).innerHTML = `<p class="muted">${esc(errMsg(e))}</p>`; }
}

// =================================================================== STAFF
const staff = {
  title: 'Staff Management',
  render() {
    return `<div class="toolbar"><div class="row wrap grow">${Object.entries(ROLES).map(([k, r]) => `<span class="chip">${esc(r.name)}: ${A.staffList.filter((s) => s.role === k).length}</span>`).join('')}</div><button class="btn btn-primary" id="add-staff">${icon('plus', 16)} Create Staff Account</button></div>
    <div class="panel" style="padding:0"><div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Permissions</th><th>Last login</th><th>Status</th><th></th></tr></thead><tbody>
      ${A.staffList.map((s) => `<tr><td><b>${esc(s.name)}</b>${s.uid === A.staff.uid ? ' <span class="chip green">You</span>' : ''}<div class="xs muted">${esc(s.phone || '')}</div></td><td class="small">${esc(s.email)}</td><td><span class="chip ${s.role === 'super_admin' ? 'dark' : 'gold'}">${esc((ROLES[s.role] || {}).name || s.role)}</span></td><td class="xs muted" style="max-width:260px">${(s.permissions || []).join(', ')}</td><td class="small">${s.lastLogin ? timeAgo(s.lastLogin) : '—'}</td>
        <td><label class="switch"><input type="checkbox" data-sactive="${esc(s.uid)}" ${s.active !== false ? 'checked' : ''} ${s.uid === A.staff.uid ? 'disabled' : ''}><span></span></label></td><td><button class="icon-btn sm" data-sedit="${esc(s.uid)}">${icon('edit', 15)}</button></td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="panel mt"><div class="panel-head"><h3>Staff activity</h3><button class="btn btn-sm btn-ghost" id="act-csv">${icon('download', 15)} CSV</button></div>
      <div class="table-wrap" style="max-height:420px;overflow:auto"><table class="data"><thead><tr><th>Time</th><th>Staff</th><th>Action</th><th>Detail</th></tr></thead><tbody>
      ${A.activity.map((a) => `<tr><td class="small">${fmtDateTime(a.createdAt)}</td><td>${esc(a.name)} <span class="xs muted">${esc((ROLES[a.role] || {}).name || '')}</span></td><td><code class="small">${esc(a.action)}</code></td><td class="small">${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No activity yet</td></tr>'}
      </tbody></table></div></div>`;
  },
  bind(el) {
    $('#add-staff', el).addEventListener('click', () => staffForm(null));
    $('#act-csv', el).addEventListener('click', () => downloadCSV(`staff-activity-${todayISO()}.csv`, [['Time', 'Staff', 'Role', 'Action', 'Detail'], ...A.activity.map((a) => [fmtDateTime(a.createdAt), a.name, a.role, a.action, a.detail])]));
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-sedit]'); if (b) staffForm(A.staffList.find((s) => s.uid === b.dataset.sedit)); });
    el.addEventListener('change', async (e) => {
      const t = e.target.closest('[data-sactive]'); if (!t) return;
      const s = A.staffList.find((x) => x.uid === t.dataset.sactive);
      await run(A.api.call('createStaff', { ...s, active: t.checked }), t.checked ? `${s.name} activated` : `${s.name} deactivated`).catch(() => schedule());
    });
  },
};

function staffForm(s) {
  const isNew = !s;
  const d = s || { name: '', email: '', phone: '', role: 'cashier', permissions: ROLES.cashier.permissions, active: true };
  const roles = Object.entries(ROLES).filter(([k]) => k !== 'super_admin' || A.staff.role === 'super_admin');
  openModal({
    title: isNew ? 'Create Staff Account' : `Edit ${d.name}`, wide: true,
    body: `<form class="form-grid" id="st-form">
      <label class="field"><span>Full name</span><input class="input" name="name" value="${esc(d.name)}" required></label>
      <label class="field"><span>Phone</span><input class="input" name="phone" value="${esc(d.phone || '')}"></label>
      <label class="field"><span>Email (login)</span><input class="input" name="email" type="email" value="${esc(d.email)}" ${isNew ? 'required' : 'disabled'}></label>
      <label class="field"><span>${isNew ? 'Password' : 'New password'} <em class="hint">${isNew ? 'min 6 chars' : '(leave blank to keep)'}</em></span><input class="input" name="password" type="password" ${isNew ? 'required minlength="6"' : ''} autocomplete="new-password"></label>
      <label class="field"><span>Role</span><select class="input" name="role" id="st-role">${roles.map(([k, r]) => `<option value="${k}" ${d.role === k ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label class="check" style="align-self:end"><span class="switch"><input type="checkbox" name="active" ${d.active !== false ? 'checked' : ''}><span></span></span> Active</label>
      <div class="full"><b class="small">Permissions</b> <span class="xs muted">(defaults follow the role – customise if needed)</span><div class="perm-grid mt-s" id="perm-grid">${ALL_PERMISSIONS.map((p) => `<label class="check"><input type="checkbox" value="${p}" ${(d.permissions || []).includes(p) ? 'checked' : ''}> ${p}</label>`).join('')}</div></div>
    </form>`,
    actions: [{ label: 'Cancel' }, {
      label: isNew ? 'Create account' : 'Save', cls: 'btn-primary', onClick: async (el, close) => {
        const v = formData($('#st-form', el));
        const permissions = $$('#perm-grid input:checked', el).map((i) => i.value);
        if (!v.name) return toast('Name is required', 'error');
        if (!isNew && !v.password) delete v.password;
        try {
          await run(A.api.call('createStaff', { ...v, email: isNew ? v.email : d.email, uid: isNew ? undefined : d.uid, permissions }), isNew ? 'Staff account created' : 'Staff updated');
          close();
        } catch { /* */ }
      },
    }],
    onOpen: (el) => $('#st-role', el).addEventListener('change', (e) => { const perms = ROLES[e.target.value].permissions; $$('#perm-grid input', el).forEach((i) => { i.checked = perms.includes(i.value); }); }),
  });
}

// =================================================================== REPORTS
const rf = { preset: 'month', from: todayISO(-29), to: todayISO(), data: null, loading: false, key: '' };
function presetRange(p) {
  const d = new Date(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (p === 'today') return [iso(d), iso(d)];
  if (p === 'yesterday') { const y = new Date(Date.now() - 864e5); return [iso(y), iso(y)]; }
  if (p === 'week') { const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [iso(s), iso(d)]; }
  if (p === 'month') return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)];
  if (p === 'lastmonth') return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))];
  if (p === 'year') return [iso(new Date(d.getFullYear(), 0, 1)), iso(d)];
  return [rf.from, rf.to];
}
[rf.from, rf.to] = presetRange('month');
const toMs = (iso, end = false) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0).getTime(); };

async function loadReport() {
  const from = toMs(rf.from); const to = toMs(rf.to, true);
  const key = `${from}-${to}`;
  const loadedSince = Date.now() - 120 * 864e5;
  if (from >= loadedSince) { rf.data = A.orders.filter((o) => o.createdAt >= from && o.createdAt <= to); rf.key = key; return; }
  if ((rf.key === key && rf.data) || rf.loading) return;
  rf.loading = true; schedule();
  try { rf.data = await A.api.list('orders', { where: [['createdAt', '>=', from], ['createdAt', '<=', to]], orderBy: ['createdAt', 'asc'] }); rf.key = key; } catch (e) { toast(errMsg(e), 'error'); rf.data = []; }
  rf.loading = false; schedule();
}

function computeReport(orders) {
  const valid = orders.filter((o) => o.status !== 'cancelled');
  const cancelled = orders.filter((o) => o.status === 'cancelled');
  const revenue = valid.reduce((s, o) => s + o.total, 0);
  let food = 0; let bev = 0;
  valid.forEach((o) => o.items.forEach((l) => { if (l.categoryType === 'beverage') bev += l.lineTotal; else food += l.lineTotal; }));
  const byDay = new Map();
  valid.forEach((o) => { const d = new Date(o.createdAt); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const r = byDay.get(k) || { date: k, orders: 0, revenue: 0, sc: 0, tax: 0, discount: 0 }; r.orders++; r.revenue += o.total; r.sc += o.serviceCharge || 0; r.tax += o.tax || 0; r.discount += o.discount || 0; byDay.set(k, r); });
  const byMonth = new Map();
  valid.forEach((o) => { const d = new Date(o.createdAt); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; const r = byMonth.get(k) || { month: k, orders: 0, revenue: 0 }; r.orders++; r.revenue += o.total; byMonth.set(k, r); });
  const pay = { cash: 0, duitnow: 0, online: 0, unpaid: 0 };
  valid.forEach((o) => { if (o.paymentStatus === 'paid') pay[o.paymentMethod] = (pay[o.paymentMethod] || 0) + o.total; else pay.unpaid += o.total; });
  return {
    orders: orders.length, validCount: valid.length, revenue, aov: valid.length ? revenue / valid.length : 0, food, bev,
    sc: valid.reduce((s, o) => s + (o.serviceCharge || 0), 0), tax: valid.reduce((s, o) => s + (o.tax || 0), 0), discount: valid.reduce((s, o) => s + (o.discount || 0), 0),
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)), months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    pay, best: topItems(valid, 15), cancelled, dine: valid.filter((o) => o.type === 'dine_in').length, take: valid.filter((o) => o.type === 'takeaway').length,
  };
}

const reports = {
  title: 'Sales Reports',
  render() {
    const key = `${toMs(rf.from)}-${toMs(rf.to, true)}`;
    if (rf.key !== key || (toMs(rf.from) >= Date.now() - 120 * 864e5)) loadReport();
    const presets = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom']];
    const head = `<div class="toolbar"><div class="filter-chips">${presets.map(([k, l]) => `<button data-preset="${k}" class="${rf.preset === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <input class="input" type="date" id="rf-from" value="${rf.from}"><span class="muted">to</span><input class="input" type="date" id="rf-to" value="${rf.to}">
      <span class="grow"></span><button class="btn btn-ghost" id="csv-orders">${icon('download', 16)} Orders CSV</button><button class="btn btn-ghost" id="csv-items">${icon('download', 16)} Items CSV</button><button class="btn btn-primary" id="pdf">${icon('printer', 16)} Export PDF</button></div>`;
    if (rf.loading || !rf.data) return `${head}<div class="skeleton" style="height:400px"></div>`;
    const r = computeReport(rf.data);
    const k = (label, val, sub = '') => `<div class="kpi"><div class="k-label">${label}</div><div class="k-val">${val}</div><div class="k-sub">${sub}</div></div>`;
    return `${head}
    <div class="kpis">${k('Total Revenue', rm(r.revenue), `${r.validCount} orders`)}${k('Avg Order Value', rm(r.aov))}${k('Food Sales', rm(r.food), `${r.revenue ? Math.round((r.food / (r.food + r.bev || 1)) * 100) : 0}% of items`)}${k('Beverage Sales', rm(r.bev))}
      ${k('Service Charge', rm(r.sc))}${k('SST Collected', rm(r.tax))}${k('Discounts', rm(r.discount))}${k('Cancelled Orders', num(r.cancelled.length), rm(r.cancelled.reduce((s, o) => s + o.total, 0)))}</div>
    <div class="grid-2"><div class="panel"><div class="panel-head"><h3>Daily Sales</h3><span class="chip">${esc(rf.from)} → ${esc(rf.to)}</span></div>${r.days.length ? barChart(r.days.map((d) => ({ label: d.date.slice(5), value: d.revenue })), { prefix: 'RM', showEvery: Math.ceil(r.days.length / 12) }) : '<p class="muted">No sales in this period.</p>'}</div>
      <div class="panel"><div class="panel-head"><h3>Payment Breakdown</h3></div>${donutChart([{ label: 'Cash', value: r.pay.cash }, { label: 'DuitNow', value: r.pay.duitnow }, { label: 'Online', value: r.pay.online }, { label: 'Unpaid', value: r.pay.unpaid, color: '#95a19c' }], { center: rm(r.revenue).replace('RM ', 'RM'), sub: 'revenue', size: 160 })}
        <div class="mt">${donutChart([{ label: 'Food', value: r.food, color: '#344E41' }, { label: 'Beverage', value: r.bev, color: '#C7A66A' }], { center: '', size: 110, thickness: 18 })}</div></div></div>
    <div class="grid-2 even"><div class="panel"><div class="panel-head"><h3>Best Selling Products</h3></div><div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Item</th><th>Type</th><th>Qty</th><th class="right">Revenue</th></tr></thead><tbody>${r.best.map((b, i) => `<tr><td>${i + 1}</td><td><b>${esc(b.name)}</b></td><td><span class="chip ${b.categoryType === 'beverage' ? 'gold' : 'green'}">${b.categoryType === 'beverage' ? 'Beverage' : 'Food'}</span></td><td>${b.qty}</td><td class="right">${rm(b.revenue)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No data</td></tr>'}</tbody></table></div></div>
      <div class="panel"><div class="panel-head"><h3>Monthly Sales</h3></div><div class="table-wrap"><table class="data"><thead><tr><th>Month</th><th>Orders</th><th class="right">Revenue</th></tr></thead><tbody>${r.months.map((m) => `<tr><td>${esc(m.month)}</td><td>${m.orders}</td><td class="right"><b>${rm(m.revenue)}</b></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No data</td></tr>'}</tbody></table></div>
        <h4 class="mt mb">Order mix</h4>${hBars([{ label: 'Dine in', value: r.dine }, { label: 'Takeaway', value: r.take }], { fmt: (v) => `${v} orders` })}</div></div>
    <div class="grid-2 even"><div class="panel"><div class="panel-head"><h3>Daily Sales Report</h3></div><div class="table-wrap" style="max-height:360px;overflow:auto"><table class="data"><thead><tr><th>Date</th><th>Orders</th><th>Service</th><th>SST</th><th class="right">Revenue</th></tr></thead><tbody>${r.days.map((d) => `<tr><td>${esc(d.date)}</td><td>${d.orders}</td><td>${rm(d.sc)}</td><td>${rm(d.tax)}</td><td class="right"><b>${rm(d.revenue)}</b></td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><div class="panel-head"><h3>Cancelled Orders</h3></div><div class="table-wrap" style="max-height:360px;overflow:auto"><table class="data"><tbody>${r.cancelled.map((o) => `<tr class="clickable" data-order="${esc(o.id)}"><td><b>${esc(o.orderNo)}</b><div class="xs muted">${fmtDateTime(o.createdAt)}</div></td><td class="small">${esc(o.cancelReason || '')}</td><td class="right">${rm(o.total)}</td></tr>`).join('') || '<tr><td class="muted">No cancelled orders 🎉</td></tr>'}</tbody></table></div></div></div>`;
  },
  bind(el) {
    $$('[data-preset]', el).forEach((b) => b.addEventListener('click', () => { rf.preset = b.dataset.preset; if (rf.preset !== 'custom') [rf.from, rf.to] = presetRange(rf.preset); rf.key = ''; schedule(); }));
    $('#rf-from', el).addEventListener('change', (e) => { rf.from = e.target.value; rf.preset = 'custom'; rf.key = ''; schedule(); });
    $('#rf-to', el).addEventListener('change', (e) => { rf.to = e.target.value; rf.preset = 'custom'; rf.key = ''; schedule(); });
    el.addEventListener('click', (e) => { const o = e.target.closest('[data-order]'); if (o) openOrder(o.dataset.order); });
    const orders = () => rf.data || [];
    $('#csv-orders', el).addEventListener('click', () => downloadCSV(`orders-${rf.from}_${rf.to}.csv`, [['Order No', 'Date', 'Type', 'Table', 'Customer', 'Phone', 'Items', 'Subtotal', 'Discount', 'Service Charge', 'SST', 'Total', 'Payment Method', 'Payment Status', 'Status', 'Cancel Reason'],
      ...orders().map((o) => [o.orderNo, fmtDateTime(o.createdAt), o.type, o.tableName || '', o.customerName, o.customerPhone, o.items.map((l) => `${l.qty}x ${l.name}`).join('; '), o.subtotal.toFixed(2), (o.discount || 0).toFixed(2), (o.serviceCharge || 0).toFixed(2), (o.tax || 0).toFixed(2), o.total.toFixed(2), METHOD_LABEL[o.paymentMethod] || o.paymentMethod, PAY_LABEL[o.paymentStatus] || o.paymentStatus, STATUS_LABEL[o.status], o.cancelReason || ''])]));
    $('#csv-items', el).addEventListener('click', () => { const r = computeReport(orders()); downloadCSV(`items-${rf.from}_${rf.to}.csv`, [['Item', 'Type', 'Qty', 'Revenue'], ...topItems(orders().filter((o) => o.status !== 'cancelled'), 9999).map((b) => [b.name, b.categoryType, b.qty, b.revenue.toFixed(2)]), [], ['Food total', '', '', r.food.toFixed(2)], ['Beverage total', '', '', r.bev.toFixed(2)]]); });
    $('#pdf', el).addEventListener('click', () => {
      const r = computeReport(orders()); const s = A.settings;
      printHtml(`Sales report ${rf.from} – ${rf.to}`, `<h1 class="brand">${esc(s.restaurantName || 'SELAGI COFFEE')} – Sales Report</h1><p class="muted">${esc(rf.from)} to ${esc(rf.to)} · generated ${fmtDateTime(Date.now())} by ${esc(A.staff.name)}</p>
        <div class="kpis"><div class="kpi">Revenue<b>${rm(r.revenue)}</b></div><div class="kpi">Orders<b>${r.validCount}</b></div><div class="kpi">Avg order<b>${rm(r.aov)}</b></div><div class="kpi">Cancelled<b>${r.cancelled.length}</b></div>
        <div class="kpi">Food<b>${rm(r.food)}</b></div><div class="kpi">Beverage<b>${rm(r.bev)}</b></div><div class="kpi">Service charge<b>${rm(r.sc)}</b></div><div class="kpi">SST<b>${rm(r.tax)}</b></div></div>
        <h3>Payment breakdown</h3><table><tr><th>Method</th><th class="r">Amount</th></tr>${Object.entries(r.pay).map(([k2, v]) => `<tr><td>${esc(METHOD_LABEL[k2] || 'Unpaid')}</td><td class="r">${rm(v)}</td></tr>`).join('')}</table>
        <h3>Daily sales</h3><table><tr><th>Date</th><th>Orders</th><th class="r">Service</th><th class="r">SST</th><th class="r">Revenue</th></tr>${r.days.map((d) => `<tr><td>${d.date}</td><td>${d.orders}</td><td class="r">${rm(d.sc)}</td><td class="r">${rm(d.tax)}</td><td class="r">${rm(d.revenue)}</td></tr>`).join('')}</table>
        <h3>Best selling products</h3><table><tr><th>#</th><th>Item</th><th>Qty</th><th class="r">Revenue</th></tr>${r.best.map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b.name)}</td><td>${b.qty}</td><td class="r">${rm(b.revenue)}</td></tr>`).join('')}</table>
        <h3>Cancelled orders</h3><table><tr><th>Order</th><th>Date</th><th>Reason</th><th class="r">Amount</th></tr>${r.cancelled.map((o) => `<tr><td>${esc(o.orderNo)}</td><td>${fmtDateTime(o.createdAt)}</td><td>${esc(o.cancelReason || '')}</td><td class="r">${rm(o.total)}</td></tr>`).join('') || '<tr><td colspan="4">None</td></tr>'}</table>`);
    });
  },
};

// =================================================================== SETTINGS
const settings = {
  title: 'Settings',
  noLive: true,
  render() {
    const s = A.settings;
    const pm = s.paymentMethods || {};
    const img = (field, label, hint) => `<div class="field"><span>${label}</span><div class="img-drop" data-upload="${field}"><img src="${esc(s[field] || 'icons/icon.svg')}" alt="" id="prev-${field}" style="${s[field] ? '' : 'opacity:.4'}"><div class="grow small muted">${hint}<br><b class="emerald">Click to upload</b>${s[field] ? ` · <a href="#" data-clear="${field}" style="color:var(--danger)">Remove</a>` : ''}</div></div><input type="file" accept="image/*" hidden id="file-${field}"></div>`;
    return `<form id="settings-form" class="stack">
    <div class="panel settings-section"><h3>Restaurant profile</h3><p class="small muted mb">Shown on the customer app, receipts and QR cards.</p><div class="form-grid">
      <label class="field"><span>Restaurant name</span><input class="input" name="restaurantName" value="${esc(s.restaurantName)}"></label>
      <label class="field"><span>Tagline</span><input class="input" name="tagline" value="${esc(s.tagline)}"></label>
      <label class="field"><span>Hero title <em class="hint">(seasonal headline, e.g. Slow Brewed Moments)</em></span><input class="input" name="heroTitle" value="${esc(s.heroTitle || '')}"></label>
      <label class="field"><span>Opening hours</span><input class="input" name="openingHours" value="${esc(s.openingHours)}"></label>
      <label class="field full"><span>Address</span><input class="input" name="address" value="${esc(s.address)}"></label>
      <label class="field"><span>Phone</span><input class="input" name="phone" value="${esc(s.phone)}"></label>
      <label class="field"><span>Email</span><input class="input" name="email" value="${esc(s.email)}"></label>
      ${img('logo', 'Official logo', 'Square PNG/SVG, 512×512 recommended – always shown uncropped, never stretched.')}${img('banner', 'Hero banner', 'Landscape food photo for the home screen.')}
    </div></div>
    <div class="panel settings-section"><h3>Ordering</h3><div class="form-grid">
      <label class="check full"><span class="switch"><input type="checkbox" name="acceptingOrders" ${s.acceptingOrders !== false ? 'checked' : ''}><span></span></span> <b>Accepting orders</b> <span class="small muted">– turn off to pause all new orders</span></label>
      <label class="field"><span>Service charge % <em class="hint">(dine-in only)</em></span><input class="input" name="serviceChargePct" type="number" step="0.5" min="0" max="30" value="${Math.round((s.serviceChargeRate || 0) * 1000) / 10}"></label>
      <label class="field"><span>SST / tax %</span><input class="input" name="taxPct" type="number" step="0.5" min="0" max="30" value="${Math.round((s.taxRate || 0) * 1000) / 10}"></label>
      <label class="check"><span class="switch"><input type="checkbox" name="taxEnabled" ${s.taxEnabled ? 'checked' : ''}><span></span></span> Charge SST</label>
      <label class="field"><span>Takeaway lead time (min)</span><input class="input" name="pickupLeadMinutes" type="number" min="0" value="${s.pickupLeadMinutes || 15}"></label>
      <label class="field"><span>Order number prefix</span><input class="input" name="orderPrefix" value="${esc(s.orderPrefix || 'SC')}" maxlength="5"></label>
      <label class="field full"><span>Public customer URL for QR codes <em class="hint">(optional – defaults to this site)</em></span><input class="input" name="publicUrl" value="${esc(s.publicUrl || '')}" placeholder="https://order.selagicoffee.my/index.html"></label>
    </div></div>
    <div class="panel settings-section"><h3>Payments</h3><div class="form-grid">
      <label class="check"><span class="switch"><input type="checkbox" name="pm_cash" ${pm.cash ? 'checked' : ''}><span></span></span> Cash / pay at counter</label>
      <label class="check"><span class="switch"><input type="checkbox" name="pm_duitnow" ${pm.duitnow ? 'checked' : ''}><span></span></span> DuitNow QR (cashier verifies)</label>
      <label class="check full"><span class="switch"><input type="checkbox" name="pm_online" ${pm.online ? 'checked' : ''} ${A.api.mode === 'demo' ? 'disabled' : ''}><span></span></span> Online payment gateway (Billplz) ${A.api.mode === 'demo' ? '<span class="xs muted">– requires Firebase + gateway keys (see README)</span>' : '<span class="xs muted">– configure keys in Cloud Functions secrets</span>'}</label>
      <label class="field"><span>DuitNow account name</span><input class="input" name="duitnowName" value="${esc(s.duitnowName || '')}"></label>
      <label class="field"><span>DuitNow ID / phone</span><input class="input" name="duitnowId" value="${esc(s.duitnowId || '')}"></label>
      ${img('duitnowQr', 'DuitNow QR image', 'Upload the official DuitNow QR from your bank.')}
    </div></div>
    <div class="panel settings-section"><h3>Promotions <span class="xs muted">(home screen carousel)</span></h3>
      <div id="promo-rows">${(s.promotions || []).map(promoRow).join('')}</div><button type="button" class="btn btn-sm btn-light mt-s" id="add-promo">${icon('plus', 14)} Add promotion</button></div>
    <div class="row" style="position:sticky;bottom:calc(12px + var(--safe-b));justify-content:flex-end"><button type="submit" class="btn btn-primary btn-lg">${icon('check', 18)} Save settings</button></div>
    ${A.api.mode === 'demo' ? `<div class="panel settings-section" style="border:1px solid var(--danger-soft)"><h3>Demo data</h3><p class="small muted">Reset this browser's demo database back to the sample data.</p><button type="button" class="btn btn-danger-ghost mt-s" id="reset-demo">${icon('refresh', 16)} Reset demo data</button></div>` : ''}
    </form>`;
  },
  bind(el) {
    const s = A.settings;
    const uploads = {};
    $$('[data-upload]', el).forEach((d) => {
      const f = d.dataset.upload; const input = $(`#file-${f}`, el);
      d.addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) { e.preventDefault(); uploads[f] = null; $(`#prev-${f}`, el).style.opacity = '.4'; $(`#prev-${f}`, el).src = 'icons/icon.svg'; return; } input.click(); });
      input.addEventListener('change', async () => { if (!input.files[0]) return; try { uploads[f] = await A.api.upload(input.files[0], 'branding'); $(`#prev-${f}`, el).src = uploads[f]; $(`#prev-${f}`, el).style.opacity = '1'; toast('Image ready – remember to save', 'success'); } catch (e) { toast(errMsg(e), 'error'); } });
    });
    $('#add-promo', el).addEventListener('click', () => $('#promo-rows', el).insertAdjacentHTML('beforeend', promoRow({ id: `p${Date.now()}`, title: '', subtitle: '', badge: '', color: '#1D332B' })));
    el.addEventListener('click', (e) => { const r = e.target.closest('[data-rm-promo]'); if (r) r.closest('.promo-row').remove(); });
    const reset = $('#reset-demo', el);
    if (reset) reset.addEventListener('click', async () => { if (await confirmDialog('Delete all demo orders, customers and changes in this browser?', { danger: true, okLabel: 'Reset' })) { await A.api.resetDemo(); location.reload(); } });
    $('#settings-form', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = formData(e.target);
      const promotions = $$('.promo-row', el).map((r) => ({ id: r.dataset.id, title: $('[data-k=title]', r).value.trim(), subtitle: $('[data-k=subtitle]', r).value.trim(), badge: $('[data-k=badge]', r).value.trim(), color: $('[data-k=color]', r).value })).filter((p) => p.title);
      const payload = {
        restaurantName: v.restaurantName, tagline: v.tagline, heroTitle: v.heroTitle, openingHours: v.openingHours, address: v.address, phone: v.phone, email: v.email,
        acceptingOrders: v.acceptingOrders, serviceChargeRate: Math.max(0, (v.serviceChargePct || 0) / 100), taxRate: Math.max(0, (v.taxPct || 0) / 100), taxEnabled: v.taxEnabled,
        pickupLeadMinutes: v.pickupLeadMinutes || 0, orderPrefix: (v.orderPrefix || 'SC').toUpperCase(), publicUrl: v.publicUrl.trim(),
        paymentMethods: { cash: v.pm_cash, duitnow: v.pm_duitnow, online: !!v.pm_online && A.api.mode !== 'demo' }, duitnowName: v.duitnowName, duitnowId: v.duitnowId, promotions,
      };
      Object.entries(uploads).forEach(([k, val]) => { payload[k] = val; });
      if (!payload.paymentMethods.cash && !payload.paymentMethods.duitnow && !payload.paymentMethods.online) return toast('Enable at least one payment method', 'error');
      const btn = e.target.querySelector('[type=submit]'); btn.classList.add('loading');
      try { await run(A.api.save('settings', 'general', payload), 'Settings saved'); logAct('settings.updated', 'Updated restaurant settings'); } catch { /* */ } finally { btn.classList.remove('loading'); }
    });
    void s;
  },
};
function promoRow(p) {
  return `<div class="promo-row var-row" style="grid-template-columns:1.2fr 1.6fr .8fr 60px 40px" data-id="${esc(p.id)}"><input class="input" data-k="title" placeholder="Title" value="${esc(p.title)}"><input class="input" data-k="subtitle" placeholder="Subtitle" value="${esc(p.subtitle)}"><input class="input" data-k="badge" placeholder="Badge" value="${esc(p.badge)}"><input class="input" type="color" data-k="color" value="${esc(p.color || '#1D332B')}" style="padding:4px;height:46px"><button type="button" class="icon-btn sm" data-rm-promo>${icon('x', 16)}</button></div>`;
}

export const VIEWS2 = { customers, payments, rewards, staff, reports, settings };
export { tierFor };
