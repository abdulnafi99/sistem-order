// Admin views: Dashboard, Orders, Menu, Tables & QR
import { A, can, run, schedule } from './app.js';
import { menuImage, ART_KINDS, dishArt } from '../core/art.js';
import { newTableToken } from '../core/server-logic.js';
import { barChart, lineChart, donutChart, hBars, chartColor } from '../core/charts.js';
import {
  $, $$, esc, rm, num, icon, toast, openModal, confirmDialog, errMsg, fmtDate, fmtTime, fmtDateTime, timeAgo, minutesSince, formData,
  STATUS_LABEL, PAY_LABEL, METHOD_LABEL, TABLE_LABEL, qrSvg, svgToPng, downloadUrl, printHtml, receiptHtml,
} from '../core/ui.js';

const ACTIVE = ['received', 'confirmed', 'preparing', 'ready'];
const NEXT = { received: ['confirmed', 'Confirm Order', 'check'], confirmed: ['preparing', 'Start Preparing', 'chef'], preparing: ['ready', 'Mark Ready', 'bell'], ready: ['completed', 'Complete', 'check'] };
const dayStart = (offset = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - offset); return d.getTime(); };
const live = (o) => o.status !== 'cancelled';

// =================================================================== DASHBOARD
let salesRange = 'daily';
const dashboard = {
  title: 'Overview',
  render() {
    const t0 = dayStart(0); const y0 = dayStart(1);
    const today = A.orders.filter((o) => o.createdAt >= t0);
    const yest = A.orders.filter((o) => o.createdAt >= y0 && o.createdAt < t0);
    const sales = today.filter(live).reduce((s, o) => s + o.total, 0);
    const salesY = yest.filter(live).reduce((s, o) => s + o.total, 0);
    const active = A.orders.filter((o) => ACTIVE.includes(o.status));
    const completedToday = today.filter((o) => o.status === 'completed').length;
    const pending = A.orders.filter((o) => o.status === 'received').length;
    const last30 = A.orders.filter((o) => live(o) && o.createdAt >= dayStart(29));
    const aov = last30.length ? last30.reduce((s, o) => s + o.total, 0) / last30.length : 0;
    const best = topItems(A.orders.filter((o) => live(o) && o.createdAt >= dayStart(6)), 1)[0];
    const trend = salesY ? Math.round(((sales - salesY) / salesY) * 100) : null;

    const k = (ic, label, val, sub, cls = '') => `<div class="kpi ${cls} rise"><div class="k-ic">${icon(ic, 21)}</div><div class="k-label">${label}</div><div class="k-val">${val}</div><div class="k-sub">${sub}</div></div>`;
    return `<div class="kpis">
      ${k('wallet', 'Total Sales Today', rm(sales), trend == null ? 'vs yesterday —' : `<span class="${trend >= 0 ? 'trend-up' : 'trend-down'}">${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)}%</span> vs yesterday`, 'hero')}
      ${k('receipt', 'Total Orders Today', num(today.length), `${today.filter((o) => o.type === 'dine_in').length} dine-in · ${today.filter((o) => o.type === 'takeaway').length} takeaway`)}
      ${k('fire', 'Active Orders', num(active.length), `<a href="#/orders">${pending} pending confirmation →</a>`)}
      ${k('check', 'Completed Today', num(completedToday), `${today.filter((o) => o.status === 'cancelled').length} cancelled`)}
      ${k('clock', 'Pending Orders', num(pending), 'Awaiting confirmation')}
      ${k('users', 'Total Customers', num(A.users.length), `${A.users.filter((u) => u.createdAt >= dayStart(6)).length} new this week`)}
      ${k('trending', 'Avg Order Value', rm(aov), 'Last 30 days')}
      ${k('star', 'Best Selling (7d)', best ? `<span style="font-size:19px;line-height:1.2;display:block">${esc(best.name)}</span>` : '—', best ? `${best.qty} sold · ${rm(best.revenue)}` : 'No sales yet')}
    </div>

    <div class="grid-2">
      <div class="panel"><div class="panel-head"><h3>Sales</h3><div class="tabs-mini" id="sales-tabs">${['daily', 'weekly', 'monthly'].map((r) => `<button data-r="${r}" class="${salesRange === r ? 'active' : ''}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('')}</div></div>${salesChart()}</div>
      <div class="panel"><div class="panel-head"><h3>Order Performance</h3><span class="chip">Last 7 days</span></div>${performance()}</div>
    </div>

    <div class="grid-2">
      <div class="panel"><div class="panel-head"><h3>Live Orders</h3><a class="btn btn-xs btn-light" href="#/orders">View all</a></div>
        ${active.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Table</th><th>Items</th><th>Total</th><th>Status</th><th>Age</th><th></th></tr></thead><tbody>
        ${active.slice(0, 8).map((o) => `<tr class="clickable" data-open-order="${esc(o.id)}"><td><b>${esc(o.orderNo)}</b></td><td>${esc(o.tableName || 'Takeaway')}</td><td>${o.itemCount}</td><td>${rm(o.total)}</td><td><span class="chip status-${o.status}">${STATUS_LABEL[o.status]}</span></td><td class="small muted">${minutesSince(o.createdAt)}m</td><td>${NEXT[o.status] ? `<button class="btn btn-xs btn-primary" data-advance="${esc(o.id)}">${NEXT[o.status][1]}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><div class="empty-ic">${icon('check', 26)}</div><h4>All caught up</h4><p>New orders appear here instantly.</p></div>`}
      </div>
      <div class="panel"><div class="panel-head"><h3>Popular Menu</h3><span class="chip">Last 30 days</span></div>${hBars(topItems(last30, 7).map((i) => ({ label: i.name, value: i.qty, sub: rm(i.revenue) })), { fmt: (v) => `${v} sold` })}</div>
    </div>

    <div class="grid-2 even">
      <div class="panel"><div class="panel-head"><h3>Tables</h3><a class="btn btn-xs btn-light" href="#/tables">Manage</a></div>
        <div class="row wrap">${A.tables.map((t) => `<a href="#/tables" class="chip tbl-${t.status}" style="padding:8px 12px">${esc(t.number)} · ${TABLE_LABEL[t.status] || t.status}</a>`).join('')}</div></div>
      <div class="panel"><div class="panel-head"><h3>Payment Mix</h3><span class="chip">Last 30 days</span></div>${paymentDonut(last30)}</div>
    </div>`;
  },
  bind(el) {
    $$('#sales-tabs [data-r]', el).forEach((b) => b.addEventListener('click', () => { salesRange = b.dataset.r; schedule(); }));
    bindOrderQuick(el);
  },
};

function salesChart() {
  const valid = A.orders.filter(live);
  let data = [];
  if (salesRange === 'daily') {
    data = Array.from({ length: 14 }, (_, i) => { const s = dayStart(13 - i); const e = s + 864e5; return { label: new Date(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }), value: valid.filter((o) => o.createdAt >= s && o.createdAt < e).reduce((a, o) => a + o.total, 0) }; });
    return lineChart(data, { prefix: 'RM', showEvery: 2 });
  }
  if (salesRange === 'weekly') {
    data = Array.from({ length: 8 }, (_, i) => { const s = dayStart((7 - i) * 7 + 6); const e = s + 7 * 864e5; return { label: `W${new Date(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}`, value: valid.filter((o) => o.createdAt >= s && o.createdAt < e).reduce((a, o) => a + o.total, 0) }; });
    return barChart(data, { prefix: 'RM' });
  }
  const now = new Date();
  data = Array.from({ length: 4 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (3 - i), 1); const e = new Date(d.getFullYear(), d.getMonth() + 1, 1); return { label: d.toLocaleDateString('en-MY', { month: 'short', year: '2-digit' }), value: valid.filter((o) => o.createdAt >= d.getTime() && o.createdAt < e.getTime()).reduce((a, o) => a + o.total, 0) }; });
  return `${barChart(data, { prefix: 'RM', color: '#C7A66A' })}<p class="xs muted">Dashboard holds the last 120 days. Use Reports for older periods.</p>`;
}

function performance() {
  const wk = A.orders.filter((o) => o.createdAt >= dayStart(6));
  const by = (s) => wk.filter((o) => o.status === s).length;
  const prepTimes = wk.map((o) => { const a = (o.statusHistory || []).find((h) => h.status === 'received'); const b = (o.statusHistory || []).find((h) => h.status === 'ready'); return a && b ? (b.at - a.at) / 60000 : null; }).filter((x) => x != null);
  const avgPrep = prepTimes.length ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) : null;
  const daily = Array.from({ length: 7 }, (_, i) => { const s = dayStart(6 - i); const e = s + 864e5; const d = wk.filter((o) => o.createdAt >= s && o.createdAt < e); return { label: new Date(s).toLocaleDateString('en-MY', { weekday: 'short' }), value: d.filter((o) => o.type === 'dine_in').length, value2: d.filter((o) => o.type === 'takeaway').length }; });
  return `${donutChart([
    { label: 'Completed', value: by('completed'), color: '#344E41' }, { label: 'In progress', value: wk.filter((o) => ACTIVE.includes(o.status)).length, color: '#C7A66A' }, { label: 'Cancelled', value: by('cancelled'), color: '#c0392b' },
  ], { center: String(wk.length), sub: 'orders', size: 150, thickness: 22 })}
  <div class="row between small mt"><span class="muted">Avg kitchen time</span><b>${avgPrep == null ? '—' : `${avgPrep} min`}</b></div>
  <div class="mt">${barChart(daily, { height: 130, color: '#344E41', color2: '#C7A66A' })}</div>
  <div class="row small"><span class="legend-row"><i style="background:#344E41"></i>Dine-in</span><span class="legend-row"><i style="background:#C7A66A"></i>Takeaway</span></div>`;
}

function paymentDonut(orders) {
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  const m = (k) => paid.filter((o) => o.paymentMethod === k).reduce((a, o) => a + o.total, 0);
  return donutChart([{ label: 'Cash', value: m('cash') }, { label: 'DuitNow', value: m('duitnow') }, { label: 'Online', value: m('online') }], { center: rm(paid.reduce((a, o) => a + o.total, 0)).replace('RM ', 'RM'), sub: 'collected', size: 170 });
}

export function topItems(orders, n = 10) {
  const map = new Map();
  orders.forEach((o) => o.items.forEach((l) => {
    const r = map.get(l.menuId) || { menuId: l.menuId, name: l.name, qty: 0, revenue: 0, categoryType: l.categoryType };
    r.qty += l.qty; r.revenue += l.lineTotal; map.set(l.menuId, r);
  }));
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, n);
}

// =================================================================== ORDERS
const of = { status: 'active', type: 'all', table: 'all', range: 'today', q: '' };
const orders = {
  title: 'Live Orders',
  render(arg) {
    const t0 = dayStart(0);
    let list = A.orders;
    if (of.range === 'today') list = list.filter((o) => o.createdAt >= t0);
    else if (of.range === '7d') list = list.filter((o) => o.createdAt >= dayStart(6));
    const counts = (s) => (s === 'active' ? A.orders.filter((o) => ACTIVE.includes(o.status)).length : s === 'all' ? list.length : list.filter((o) => o.status === s).length);
    let shown = of.status === 'active' ? A.orders.filter((o) => ACTIVE.includes(o.status)) : of.status === 'all' ? list : list.filter((o) => o.status === of.status);
    if (of.type !== 'all') shown = shown.filter((o) => o.type === of.type);
    if (of.table !== 'all') shown = shown.filter((o) => o.tableId === of.table);
    if (of.q) { const q = of.q.toLowerCase(); shown = shown.filter((o) => `${o.orderNo} ${o.customerName} ${o.customerPhone} ${o.tableName}`.toLowerCase().includes(q)); }
    const chips = [['active', 'Active'], ['received', 'New'], ['confirmed', 'Confirmed'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']];
    const asCards = ACTIVE.includes(of.status) || of.status === 'active';
    if (arg) setTimeout(() => openOrder(arg), 0);
    return `<div class="toolbar">
      <div class="search-box">${icon('search', 18)}<input class="input" id="order-search" placeholder="Search order no, name, phone…" value="${esc(of.q)}"></div>
      <select class="input" id="of-type"><option value="all">All types</option><option value="dine_in" ${of.type === 'dine_in' ? 'selected' : ''}>Dine in</option><option value="takeaway" ${of.type === 'takeaway' ? 'selected' : ''}>Takeaway</option></select>
      <select class="input" id="of-table"><option value="all">All tables</option>${A.tables.map((t) => `<option value="${esc(t.id)}" ${of.table === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <select class="input" id="of-range"><option value="today" ${of.range === 'today' ? 'selected' : ''}>Today</option><option value="7d" ${of.range === '7d' ? 'selected' : ''}>Last 7 days</option><option value="all" ${of.range === 'all' ? 'selected' : ''}>Last 120 days</option></select>
    </div>
    <div class="filter-chips mb">${chips.map(([k, l]) => `<button data-st="${k}" class="${of.status === k ? 'active' : ''}">${l}<b>${counts(k)}</b></button>`).join('')}</div>
    ${!shown.length ? `<div class="panel empty"><div class="empty-ic">${icon('receipt', 26)}</div><h4>No orders</h4><p>Orders matching your filters will appear here in real time.</p></div>`
      : asCards ? `<div class="order-cards">${shown.map(orderCard).join('')}</div>`
        : `<div class="panel" style="padding:0"><div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Time</th><th>Type / Table</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>
        ${shown.slice(0, 300).map((o) => `<tr class="clickable" data-open-order="${esc(o.id)}"><td><b>${esc(o.orderNo)}</b></td><td class="small">${fmtDateTime(o.createdAt)}</td><td>${o.type === 'dine_in' ? esc(o.tableName) : `Takeaway${o.pickup && o.pickup.time ? ` · ${esc(o.pickup.time)}` : ''}`}</td><td>${esc(o.customerName)}${o.isMember ? ' <span class="chip gold" style="font-size:10px">Member</span>' : ''}</td><td>${o.itemCount}</td><td><b>${rm(o.total)}</b></td><td><span class="chip pay-${o.paymentStatus}">${PAY_LABEL[o.paymentStatus]}</span></td><td><span class="chip status-${o.status}">${STATUS_LABEL[o.status]}</span></td></tr>`).join('')}
        </tbody></table></div>${shown.length > 300 ? '<p class="small muted" style="padding:12px">Showing first 300 – narrow your filters or export from Reports.</p>' : ''}</div>`}`;
  },
  bind(el) {
    $('#order-search', el).addEventListener('input', (e) => { of.q = e.target.value; schedule(); });
    ['type', 'table', 'range'].forEach((k) => $(`#of-${k}`, el).addEventListener('change', (e) => { of[k] = e.target.value; schedule(); }));
    $$('[data-st]', el).forEach((b) => b.addEventListener('click', () => { of.status = b.dataset.st; schedule(); }));
    bindOrderQuick(el);
  },
};

function orderCard(o) {
  const age = minutesSince(o.createdAt);
  return `<div class="ocard s-${o.status} ${age < 1 && o.status === 'received' ? 'flash-new' : ''}">
    <div class="row between"><div><b style="font-size:16px">${esc(o.orderNo)}</b><div class="xs muted">${fmtTime(o.createdAt)} · ${age}m ago</div></div><span class="chip status-${o.status}">${STATUS_LABEL[o.status]}</span></div>
    <div class="row"><span class="chip ${o.type === 'dine_in' ? 'dark' : 'gold'}">${icon(o.type === 'dine_in' ? 'utensils' : 'bag', 13)} ${esc(o.tableName || `Takeaway${o.pickup && o.pickup.time ? ` · ${o.pickup.time}` : ''}`)}</span><span class="small grow ellipsis">${esc(o.customerName)}</span></div>
    <div class="items">${o.items.map((l) => `<div><span>${l.qty}× ${esc(l.name)}${l.variant ? ` <span class="muted">(${esc(l.variant.name)})</span>` : ''}${l.addons && l.addons.length ? `<br><span class="xs muted">+ ${l.addons.map((a) => esc(a.name)).join(', ')}</span>` : ''}${l.note ? `<br><span class="xs" style="color:#b5681a">“${esc(l.note)}”</span>` : ''}</span></div>`).join('')}</div>
    ${o.note ? `<div class="small" style="background:var(--warn-soft);padding:8px 10px;border-radius:10px">📝 ${esc(o.note)}</div>` : ''}
    <div class="row between"><b>${rm(o.total)}</b><span class="chip pay-${o.paymentStatus}">${PAY_LABEL[o.paymentStatus]} · ${esc(METHOD_LABEL[o.paymentMethod] || '')}</span></div>
    <div class="actions">
      ${NEXT[o.status] ? `<button class="btn btn-sm btn-primary" data-advance="${esc(o.id)}">${icon(NEXT[o.status][2], 15)} ${NEXT[o.status][1]}</button>` : ''}
      <button class="btn btn-sm btn-ghost" data-open-order="${esc(o.id)}">Details</button>
      <button class="icon-btn sm" data-print="${esc(o.id)}" title="Print receipt">${icon('printer', 16)}</button>
    </div></div>`;
}

export function bindOrderQuick(el) {
  el.addEventListener('click', async (e) => {
    const adv = e.target.closest('[data-advance]');
    if (adv) {
      e.stopPropagation();
      const o = A.orders.find((x) => x.id === adv.dataset.advance);
      adv.disabled = true; adv.classList.add('loading');
      try { await run(A.api.call('updateOrderStatus', { orderId: o.id, status: NEXT[o.status][0] }), `${o.orderNo} → ${STATUS_LABEL[NEXT[o.status][0]]}`); } catch { /* toasted */ } finally { adv.disabled = false; adv.classList.remove('loading'); }
      return;
    }
    const pr = e.target.closest('[data-print]');
    if (pr) { e.stopPropagation(); const o = A.orders.find((x) => x.id === pr.dataset.print); printHtml(`Receipt ${o.orderNo}`, receiptHtml(o, A.settings)); return; }
    const op = e.target.closest('[data-open-order]');
    if (op) openOrder(op.dataset.openOrder);
  });
}

export function openOrder(id) {
  if (document.querySelector(`.modal[data-order="${id}"]`)) return;
  const get = () => A.orders.find((x) => x.id === id);
  const body = () => {
    const o = get();
    if (!o) return '<p class="muted">Order not found (it may be older than 120 days).</p>';
    const pendingPay = A.payments.find((p) => p.orderId === o.id && p.status === 'pending');
    return `<div class="row wrap mb"><span class="chip status-${o.status}">${STATUS_LABEL[o.status]}</span><span class="chip pay-${o.paymentStatus}">${PAY_LABEL[o.paymentStatus]}</span><span class="chip ${o.type === 'dine_in' ? 'dark' : 'gold'}">${o.type === 'dine_in' ? esc(o.tableName) : 'Takeaway'}</span>${o.isMember ? '<span class="chip gold">Member</span>' : ''}</div>
      <div class="detail-grid mb">
        <div><span>Order no</span><b>${esc(o.orderNo)}</b></div><div><span>Placed</span>${fmtDateTime(o.createdAt)}</div>
        <div><span>Customer</span>${esc(o.customerName)}</div><div><span>Phone</span>${esc(o.customerPhone || '—')}</div>
        ${o.pickup && o.pickup.date ? `<div><span>Pickup</span>${esc(o.pickup.date)} ${esc(o.pickup.time)}</div>` : ''}
        <div><span>Payment</span>${esc(METHOD_LABEL[o.paymentMethod] || o.paymentMethod)}${o.paymentRef ? ` · ${esc(o.paymentRef)}` : ''}</div>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Item</th><th>Qty</th><th class="right">Amount</th></tr></thead><tbody>
      ${o.items.map((l) => `<tr><td><b>${esc(l.name)}</b>${l.variant ? `<div class="xs muted">${esc(l.variant.name)}</div>` : ''}${l.addons && l.addons.length ? `<div class="xs muted">+ ${l.addons.map((a) => `${esc(a.name)} (${rm(a.price)})`).join(', ')}</div>` : ''}${l.note ? `<div class="xs" style="color:#b5681a">“${esc(l.note)}”</div>` : ''}</td><td>${l.qty} × ${rm(l.unitPrice)}</td><td class="right">${rm(l.lineTotal)}</td></tr>`).join('')}
      </tbody></table></div>
      ${o.note ? `<p class="small mt-s" style="background:var(--warn-soft);padding:8px 10px;border-radius:10px">📝 ${esc(o.note)}</p>` : ''}
      <div style="max-width:300px;margin-left:auto" class="mt-s small">
        <div class="row between"><span>Subtotal</span><span>${rm(o.subtotal)}</span></div>
        ${o.discount ? `<div class="row between"><span>Discount ${o.voucher ? `(${esc(o.voucher.name)})` : ''}</span><span>-${rm(o.discount)}</span></div>` : ''}
        ${o.serviceCharge ? `<div class="row between"><span>Service charge</span><span>${rm(o.serviceCharge)}</span></div>` : ''}
        ${o.tax ? `<div class="row between"><span>SST</span><span>${rm(o.tax)}</span></div>` : ''}
        <div class="row between" style="font-size:17px;font-weight:800;border-top:1px dashed var(--grey-2);padding-top:6px;margin-top:4px"><span>Total</span><span>${rm(o.total)}</span></div>
      </div>
      ${pendingPay ? `<div class="panel mt" style="background:var(--info-soft)"><b>DuitNow verification needed</b><p class="small">Customer reference: <b>${esc(pendingPay.reference)}</b> · ${rm(pendingPay.amount)}. Check your bank statement before approving.</p><div class="row mt-s"><button class="btn btn-sm btn-primary" data-verify="1" data-pid="${esc(pendingPay.id)}">Approve payment</button><button class="btn btn-sm btn-danger-ghost" data-verify="0" data-pid="${esc(pendingPay.id)}">Reject</button></div></div>` : ''}
      <h4 class="mt" style="font-size:14px">Timeline</h4><ul class="timeline mt-s">${(o.statusHistory || []).map((h) => `<li><b>${STATUS_LABEL[h.status]}</b> · ${fmtDateTime(h.at)} <span class="muted">by ${esc(h.by)}</span>${h.reason ? `<div class="xs muted">${esc(h.reason)}</div>` : ''}</li>`).join('')}${o.paidAt ? `<li><b>Paid</b> · ${fmtDateTime(o.paidAt)}</li>` : ''}</ul>
      ${o.cancelReason ? `<p class="small" style="color:var(--danger)">Cancelled: ${esc(o.cancelReason)}</p>` : ''}
      <div class="row wrap mt" id="od-actions">
        ${NEXT[o.status] ? `<button class="btn btn-primary" data-adv>${icon(NEXT[o.status][2], 16)} ${NEXT[o.status][1]}</button>` : ''}
        ${can('payments') && o.paymentStatus !== 'paid' && o.status !== 'cancelled' ? `<button class="btn btn-gold" data-pay>${icon('wallet', 16)} Record payment</button>` : ''}
        <button class="btn btn-ghost" data-receipt>${icon('printer', 16)} Print receipt</button>
        ${can('orders') && ACTIVE.includes(o.status) ? `<button class="btn btn-danger-ghost" data-cancel>${icon('x', 16)} Cancel order</button>` : ''}
      </div>`;
  };
  const m = openModal({
    title: `Order ${get() ? get().orderNo : ''}`, wide: true, body: body(),
    onOpen: (el) => {
      el.querySelector('.modal').dataset.order = id;
      const sig = () => JSON.stringify([get(), A.payments.filter((p) => p.orderId === id)]);
      let last = sig();
      const refresh = (force = true) => {
        if (!document.body.contains(el)) return;
        const now = sig();
        if (!force && now === last) return;
        last = now;
        $('.modal-body', el).innerHTML = body();
      };
      el._refresh = () => refresh(false);
      el.addEventListener('click', async (e) => {
        const o = get(); if (!o) return;
        const b = e.target.closest('button'); if (!b) return;
        try {
          if (b.hasAttribute('data-adv')) { b.classList.add('loading'); await run(A.api.call('updateOrderStatus', { orderId: o.id, status: NEXT[o.status][0] }), 'Status updated'); }
          else if (b.hasAttribute('data-receipt')) printHtml(`Receipt ${o.orderNo}`, receiptHtml(o, A.settings));
          else if (b.hasAttribute('data-cancel')) {
            const reason = await confirmDialog(`Cancel ${o.orderNo}? The customer will be notified.`, { title: 'Cancel order', okLabel: 'Cancel order', danger: true, input: 'Reason' });
            if (reason !== null) await run(A.api.call('updateOrderStatus', { orderId: o.id, status: 'cancelled', reason: reason || 'Cancelled by staff' }), 'Order cancelled');
          } else if (b.hasAttribute('data-pay')) recordPaymentModal(o);
          else if (b.dataset.verify != null) { b.classList.add('loading'); await run(A.api.call('verifyPayment', { paymentId: b.dataset.pid, approve: b.dataset.verify === '1' }), b.dataset.verify === '1' ? 'Payment verified' : 'Payment rejected'); }
        } catch { /* toasted */ } finally { b.classList.remove('loading'); refresh(); }
      });
    },
    onClose: () => { if (location.hash.startsWith('#/orders/')) history.replaceState(null, '', '#/orders'); },
  });
  return m;
}

export function recordPaymentModal(o) {
  openModal({
    title: `Record payment · ${o.orderNo}`,
    body: `<form class="stack" id="pay-form">
      <div class="panel" style="background:var(--cream);text-align:center"><div class="eyebrow">Amount due</div><b style="font-size:30px">${rm(o.total)}</b></div>
      <div class="segmented"><button type="button" class="active" data-m="cash">${icon('wallet', 16)} Cash</button><button type="button" data-m="duitnow">${icon('qr', 16)} DuitNow (counter)</button></div>
      <input type="hidden" name="method" value="cash">
      <label class="field" id="f-tendered"><span>Cash received (RM)</span><input class="input" name="amountTendered" type="number" step="0.01" min="${o.total}" value="${o.total.toFixed(2)}"></label>
      <div id="change" class="small muted">Change: RM 0.00</div>
      <label class="field hidden" id="f-ref"><span>DuitNow reference</span><input class="input" name="reference" placeholder="From bank notification"></label>
      <p class="xs muted">${icon('shield', 12)} Only record after money is received / verified in your bank.</p>
    </form>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Confirm payment', cls: 'btn-primary', onClick: async (el, close) => {
        const d = formData($('#pay-form', el));
        try { const r = await run(A.api.call('recordPayment', { orderId: o.id, method: d.method, amountTendered: d.amountTendered, reference: d.reference }), 'Payment recorded'); if (r.change) toast(`Give change: ${rm(r.change)}`, 'gold', 6000); close(); } catch { /* */ }
      },
    }],
    onOpen: (el) => {
      const upd = () => { const v = Number($('[name=amountTendered]', el).value || 0); $('#change', el).textContent = `Change: ${rm(Math.max(0, v - o.total))}`; };
      $('[name=amountTendered]', el).addEventListener('input', upd);
      $$('[data-m]', el).forEach((b) => b.addEventListener('click', () => {
        $$('[data-m]', el).forEach((x) => x.classList.toggle('active', x === b));
        $('[name=method]', el).value = b.dataset.m;
        $('#f-tendered', el).classList.toggle('hidden', b.dataset.m !== 'cash'); $('#change', el).classList.toggle('hidden', b.dataset.m !== 'cash');
        $('#f-ref', el).classList.toggle('hidden', b.dataset.m !== 'duitnow');
      }));
    },
  });
}

// keep open order modals in sync with live data (only re-render when the order changed)
setInterval(() => { $$('.modal-wrap').forEach((w) => w._refresh && w._refresh()); }, 1000);

// =================================================================== MENU
const mf = { cat: 'all', q: '', avail: 'all' };
const menu = {
  title: 'Menu Management',
  render() {
    let list = A.menu;
    if (mf.cat !== 'all') list = list.filter((m) => m.categoryId === mf.cat);
    if (mf.avail !== 'all') list = list.filter((m) => (mf.avail === 'available' ? m.available !== false : m.available === false));
    if (mf.q) { const q = mf.q.toLowerCase(); list = list.filter((m) => `${m.name} ${m.description}`.toLowerCase().includes(q)); }
    const cat = (id) => A.categories.find((c) => c.id === id);
    return `<div class="toolbar">
      <div class="search-box">${icon('search', 18)}<input class="input" id="menu-q" placeholder="Search menu…" value="${esc(mf.q)}"></div>
      <select class="input" id="menu-avail"><option value="all">All</option><option value="available" ${mf.avail === 'available' ? 'selected' : ''}>Available</option><option value="soldout" ${mf.avail === 'soldout' ? 'selected' : ''}>Sold out</option></select>
      <span class="grow"></span>
      <button class="btn btn-ghost" id="manage-cats">${icon('layers', 16)} Categories</button>
      <button class="btn btn-primary" id="add-menu">${icon('plus', 16)} Add New Menu</button>
    </div>
    <div class="filter-chips mb"><button data-cat="all" class="${mf.cat === 'all' ? 'active' : ''}">All<b>${A.menu.length}</b></button>${A.categories.map((c) => `<button data-cat="${esc(c.id)}" class="${mf.cat === c.id ? 'active' : ''}">${esc(c.icon || '')} ${esc(c.name)}<b>${A.menu.filter((m) => m.categoryId === c.id).length}</b></button>`).join('')}</div>
    ${list.length ? `<div class="menu-admin-grid">${list.map((m) => `<div class="m-card">
      <div class="m-img"><img src="${esc(menuImage(m.image))}" alt="" loading="lazy"><span class="chip ${m.available === false ? 'red' : 'green'}">${m.available === false ? 'Sold out' : 'Available'}</span><button class="feat ${m.featured ? 'on' : ''}" data-feat="${esc(m.id)}" title="Featured">${icon('star', 16)}</button></div>
      <div class="m-body"><div class="row between"><b>${esc(m.name)}</b><b class="emerald">${rm(m.price)}</b></div>
        <div class="xs muted">${esc((cat(m.categoryId) || {}).name || 'Uncategorised')} · ${m.soldCount || 0} sold${typeof m.stockLeft === 'number' ? ` · <b style="color:#b5681a">${m.stockLeft} left</b>` : ''}</div>
        <p class="small muted" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(m.description || '')}</p>
        <div class="row wrap">${(m.variants || []).length ? `<span class="chip">${m.variants.length} variants</span>` : ''}${(m.addons || []).length ? `<span class="chip">${m.addons.length} add-ons</span>` : ''}</div></div>
      <div class="m-foot"><label class="switch" title="Available"><input type="checkbox" data-avail="${esc(m.id)}" ${m.available !== false ? 'checked' : ''}><span></span></label><span class="small grow">${m.available !== false ? 'Available' : 'Sold out'}</span>
        <button class="icon-btn sm" data-edit="${esc(m.id)}" title="Edit">${icon('edit', 16)}</button><button class="icon-btn sm" data-del="${esc(m.id)}" title="Delete" style="color:var(--danger)">${icon('trash', 16)}</button></div>
    </div>`).join('')}</div>` : `<div class="panel empty"><div class="empty-ic">${icon('menu', 26)}</div><h4>No menu items</h4><p>Add your first dish to get started.</p></div>`}`;
  },
  bind(el) {
    $('#menu-q', el).addEventListener('input', (e) => { mf.q = e.target.value; schedule(); });
    $('#menu-avail', el).addEventListener('change', (e) => { mf.avail = e.target.value; schedule(); });
    $$('[data-cat]', el).forEach((b) => b.addEventListener('click', () => { mf.cat = b.dataset.cat; schedule(); }));
    $('#add-menu', el).addEventListener('click', () => menuForm(null));
    $('#manage-cats', el).addEventListener('click', categoriesModal);
    el.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) return menuForm(A.menu.find((m) => m.id === ed.dataset.edit));
      const del = e.target.closest('[data-del]');
      if (del) {
        const m = A.menu.find((x) => x.id === del.dataset.del);
        if (await confirmDialog(`Delete "${m.name}"? Past orders keep their records.`, { title: 'Delete menu item', okLabel: 'Delete', danger: true })) {
          await run(A.api.remove('menu', m.id), 'Menu item deleted').catch(() => {});
          logAct('menu.deleted', m.name);
        }
        return;
      }
      const ft = e.target.closest('[data-feat]');
      if (ft) { const m = A.menu.find((x) => x.id === ft.dataset.feat); await run(A.api.save('menu', m.id, { featured: !m.featured }), m.featured ? 'Removed from featured' : 'Set as featured').catch(() => {}); }
    });
    el.addEventListener('change', async (e) => {
      const av = e.target.closest('[data-avail]');
      if (av) { const m = A.menu.find((x) => x.id === av.dataset.avail); await run(A.api.save('menu', m.id, { available: av.checked }), `${m.name}: ${av.checked ? 'Available' : 'Sold out'}`).catch(() => {}); logAct('menu.availability', `${m.name} → ${av.checked ? 'available' : 'sold out'}`); }
    });
  },
};

function logAct(action, detail) { A.api.call('logStaffActivity', { action, detail }).catch(() => {}); }

function optRows(list, kind) {
  return (list || []).map((v) => `<div class="var-row" data-row="${kind}"><input class="input" placeholder="Name" value="${esc(v.name)}" data-k="name"><input class="input" type="number" step="0.01" placeholder="+RM" value="${Number(v.price || 0)}" data-k="price"><input type="hidden" data-k="id" value="${esc(v.id)}"><button type="button" class="icon-btn sm" data-rm-row>${icon('x', 16)}</button></div>`).join('');
}

function menuForm(m) {
  const isNew = !m;
  const d = m || { name: '', price: '', categoryId: (A.categories[0] || {}).id, description: '', image: 'art:pasta', available: true, featured: false, variants: [], addons: [], tags: [] };
  let image = d.image;
  openModal({
    title: isNew ? 'Add New Menu' : `Edit · ${d.name}`, wide: true,
    body: `<form class="form-grid" id="menu-form">
      <div class="full img-drop" id="img-drop"><img id="img-prev" src="${esc(menuImage(image))}" alt=""><div class="grow"><b>Food image</b><p class="small muted">Click to upload a photo (auto-resized). Or pick an illustration:</p>
        <select class="input mt-s" id="art-pick" style="max-width:220px"><option value="">— illustration —</option>${ART_KINDS.map((k) => `<option value="${k}" ${image === `art:${k}` ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <input type="file" accept="image/*" id="img-file" hidden></div>
      <label class="field"><span>Menu name</span><input class="input" name="name" value="${esc(d.name)}" required maxlength="80"></label>
      <label class="field"><span>Price (RM)</span><input class="input" name="price" type="number" step="0.01" min="0" value="${esc(d.price)}" required></label>
      <label class="field"><span>Category</span><select class="input" name="categoryId">${A.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === d.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Daily stock <em class="hint">(blank = unlimited)</em></span><input class="input" name="stockLeft" type="number" min="0" value="${typeof d.stockLeft === 'number' ? d.stockLeft : ''}"></label>
      <label class="field full"><span>Description</span><textarea class="input" name="description" maxlength="400">${esc(d.description || '')}</textarea></label>
      <label class="field full"><span>Tags <em class="hint">(comma separated, e.g. Bestseller, Spicy)</em></span><input class="input" name="tags" value="${esc((d.tags || []).join(', '))}"></label>
      <div class="full"><div class="row between"><b class="small">Variants <span class="muted xs">(customer must choose one – e.g. size, doneness)</span></b><button type="button" class="btn btn-xs btn-light" data-add-row="variant">${icon('plus', 14)} Variant</button></div><div id="rows-variant" class="mt-s">${optRows(d.variants, 'variant')}</div></div>
      <div class="full"><div class="row between"><b class="small">Add-ons / Extra toppings <span class="muted xs">(optional, multiple)</span></b><button type="button" class="btn btn-xs btn-light" data-add-row="addon">${icon('plus', 14)} Add-on</button></div><div id="rows-addon" class="mt-s">${optRows(d.addons, 'addon')}</div></div>
      <label class="check"><span class="switch"><input type="checkbox" name="available" ${d.available !== false ? 'checked' : ''}><span></span></span> Available</label>
      <label class="check"><span class="switch"><input type="checkbox" name="featured" ${d.featured ? 'checked' : ''}><span></span></span> Featured menu</label>
    </form>`,
    actions: [{ label: 'Cancel' }, {
      label: isNew ? 'Add menu' : 'Save changes', cls: 'btn-primary', onClick: async (el, close) => {
        const f = $('#menu-form', el);
        const v = formData(f);
        if (!v.name || v.price == null || v.price < 0) return toast('Name and a valid price are required', 'error');
        const rows = (kind) => $$(`[data-row="${kind}"]`, el).map((r) => ({ id: $('[data-k=id]', r).value || `${kind[0]}${Math.random().toString(36).slice(2, 7)}`, name: $('[data-k=name]', r).value.trim(), price: Math.round(Number($('[data-k=price]', r).value || 0) * 100) / 100 })).filter((x) => x.name);
        const payload = {
          name: v.name.trim(), price: Math.round(v.price * 100) / 100, categoryId: v.categoryId, description: v.description.trim(), image,
          available: v.available, featured: v.featured, variants: rows('variant'), addons: rows('addon'),
          tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
          stockLeft: v.stockLeft === null || v.stockLeft === '' ? null : Math.max(0, Math.trunc(v.stockLeft)),
        };
        if (payload.stockLeft === null) payload.stockLeft = null;
        if (isNew) { payload.soldCount = 0; }
        try { await run(A.api.save('menu', isNew ? null : d.id, payload), isNew ? 'Menu added' : 'Menu updated'); logAct(isNew ? 'menu.created' : 'menu.updated', payload.name); close(); } catch { /* */ }
      },
    }],
    onOpen: (el) => {
      const file = $('#img-file', el);
      $('#img-drop', el).addEventListener('click', (e) => { if (!e.target.closest('select')) file.click(); });
      file.addEventListener('change', async () => {
        if (!file.files[0]) return;
        try { $('#img-prev', el).style.opacity = '.4'; image = await A.api.upload(file.files[0], 'menu'); $('#img-prev', el).src = image; toast('Image uploaded', 'success'); } catch (e) { toast(errMsg(e), 'error'); } finally { $('#img-prev', el).style.opacity = '1'; }
      });
      $('#art-pick', el).addEventListener('change', (e) => { if (e.target.value) { image = `art:${e.target.value}`; $('#img-prev', el).src = dishArt(e.target.value); } });
      el.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add-row]');
        if (add) { const k = add.dataset.addRow; $(`#rows-${k}`, el).insertAdjacentHTML('beforeend', optRows([{ id: '', name: '', price: 0 }], k)); }
        const rmv = e.target.closest('[data-rm-row]'); if (rmv) rmv.closest('.var-row').remove();
      });
    },
  });
}

function categoriesModal() {
  const body = () => `<div class="table-wrap"><table class="data"><thead><tr><th>Icon</th><th>Name</th><th>Type</th><th>Order</th><th>Items</th><th></th></tr></thead><tbody>
    ${A.categories.map((c) => `<tr data-cid="${esc(c.id)}"><td><input class="input" style="width:56px;padding:8px" value="${esc(c.icon || '')}" data-k="icon"></td><td><input class="input" value="${esc(c.name)}" data-k="name"></td><td><select class="input" data-k="type"><option value="food" ${c.type === 'food' ? 'selected' : ''}>Food</option><option value="beverage" ${c.type === 'beverage' ? 'selected' : ''}>Beverage</option></select></td><td><input class="input" type="number" style="width:70px" value="${c.sort || 0}" data-k="sort"></td><td>${A.menu.filter((m) => m.categoryId === c.id).length}</td><td class="row"><button class="btn btn-xs btn-primary" data-save-cat>Save</button><button class="icon-btn sm" data-del-cat style="color:var(--danger)">${icon('trash', 15)}</button></td></tr>`).join('')}
    <tr data-cid=""><td><input class="input" style="width:56px;padding:8px" placeholder="🍜" data-k="icon"></td><td><input class="input" placeholder="New category" data-k="name"></td><td><select class="input" data-k="type"><option value="food">Food</option><option value="beverage">Beverage</option></select></td><td><input class="input" type="number" style="width:70px" value="${A.categories.length + 1}" data-k="sort"></td><td></td><td><button class="btn btn-xs btn-gold" data-save-cat>Add</button></td></tr>
    </tbody></table></div>`;
  openModal({
    title: 'Categories', wide: true, body: body(),
    onOpen: (el) => el.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr[data-cid]'); if (!tr) return;
      const read = () => ({ icon: $('[data-k=icon]', tr).value, name: $('[data-k=name]', tr).value.trim(), type: $('[data-k=type]', tr).value, sort: Number($('[data-k=sort]', tr).value || 0), active: true });
      if (e.target.closest('[data-save-cat]')) {
        const v = read(); if (!v.name) return toast('Enter a name', 'error');
        const id = tr.dataset.cid || v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || null;
        await run(A.api.save('categories', id, v), 'Category saved').catch(() => {});
        setTimeout(() => { $('.modal-body', el).innerHTML = body(); }, 150);
      }
      if (e.target.closest('[data-del-cat]')) {
        const id = tr.dataset.cid;
        if (A.menu.some((m) => m.categoryId === id)) return toast('Move or delete the items in this category first', 'error');
        if (await confirmDialog('Delete this category?', { danger: true, okLabel: 'Delete' })) { await run(A.api.remove('categories', id), 'Category deleted').catch(() => {}); setTimeout(() => { $('.modal-body', el).innerHTML = body(); }, 150); }
      }
    }),
  });
}

// =================================================================== TABLES & QR
export function tableUrl(t) {
  const base = (A.settings.publicUrl || `${location.origin}${location.pathname.replace(/[^/]*$/, '')}index.html`).replace(/\/$/, '');
  return `${base}?t=${encodeURIComponent(t.id)}&k=${encodeURIComponent(t.token || '')}`;
}
function qrPrintCard(t) {
  return `<div style="width:300px;margin:0 auto 30px;text-align:center;border:2px solid #1D332B;border-radius:24px;padding:24px;page-break-inside:avoid">
    <h2 style="font-family:Georgia,serif;color:#344E41;margin:0">${esc(A.settings.restaurantName || 'SELAGI COFFEE')}</h2>
    <p class="muted" style="margin:4px 0 14px">Scan to view menu &amp; order</p>
    ${qrSvg(tableUrl(t), { size: 240 })}
    <h1 style="font-size:34px;margin:12px 0 0">${esc(t.name)}</h1><p class="muted">No app needed · Pay at counter or DuitNow</p></div>`;
}

const tables = {
  title: 'Table & QR',
  render() {
    const sessionStats = (t) => {
      if (!t.sessionId) return null;
      const os = A.orders.filter((o) => o.sessionId === t.sessionId && o.status !== 'cancelled');
      return { count: os.length, total: os.reduce((a, o) => a + o.total, 0), unpaid: os.filter((o) => o.paymentStatus !== 'paid').reduce((a, o) => a + o.total, 0), active: os.filter((o) => ACTIVE.includes(o.status)).length, orders: os };
    };
    const counts = Object.keys(TABLE_LABEL).map((k) => `<span class="chip tbl-${k}">${TABLE_LABEL[k]}: ${A.tables.filter((t) => t.status === k).length}</span>`).join('');
    return `<div class="toolbar"><div class="row wrap grow">${counts}</div>
      <button class="btn btn-ghost" id="print-all">${icon('printer', 16)} Print all QR</button>
      <button class="btn btn-primary" id="add-table">${icon('plus', 16)} Add Table</button></div>
    <div class="tables-grid">${A.tables.map((t) => {
      const st = sessionStats(t);
      return `<div class="t-card st-${t.status}">
        <div class="row between"><div><div class="t-num">${esc(t.number)}</div><div class="xs muted">${esc(t.zone || '')} · ${t.seats || '-'} seats</div></div><span class="chip tbl-${t.status}">${TABLE_LABEL[t.status] || t.status}</span></div>
        <div class="t-qr" data-qr="${esc(t.id)}" title="Click to enlarge">${qrSvg(tableUrl(t), { size: 180 })}</div>
        ${st ? `<div class="small" style="background:var(--cream);border-radius:12px;padding:8px 10px"><div class="row between"><span>${st.count} order(s)${st.active ? ` · ${st.active} active` : ''}</span><b>${rm(st.total)}</b></div>${st.unpaid ? `<div class="row between" style="color:var(--violet)"><span>Unpaid</span><b>${rm(st.unpaid)}</b></div>` : ''}</div>` : '<div class="small muted">No active session</div>'}
        <select class="input" data-status="${esc(t.id)}" style="padding:9px 12px">${Object.entries(TABLE_LABEL).map(([k, l]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="row wrap">
          <button class="btn btn-xs btn-ghost" data-print-qr="${esc(t.id)}">${icon('printer', 14)} Print</button>
          <button class="btn btn-xs btn-ghost" data-dl-qr="${esc(t.id)}">${icon('download', 14)} PNG</button>
          ${st && st.count ? `<button class="btn btn-xs btn-light" data-table-orders="${esc(t.id)}">${icon('receipt', 14)} Orders</button>` : ''}
          <span class="grow"></span>
          <button class="icon-btn sm" data-edit-table="${esc(t.id)}" title="Edit">${icon('edit', 15)}</button>
          <button class="icon-btn sm" data-regen="${esc(t.id)}" title="Regenerate QR (old QR stops working)">${icon('refresh', 15)}</button>
          <button class="icon-btn sm" data-del-table="${esc(t.id)}" title="Delete" style="color:var(--danger)">${icon('trash', 15)}</button>
        </div></div>`;
    }).join('')}</div>
    <p class="xs muted mt">${icon('shield', 12)} Each QR contains the table ID and a secret token that is verified by the server. Regenerating a QR invalidates the printed one. Setting a table to <b>Cleaning</b> or <b>Available</b> ends its current session.</p>`;
  },
  bind(el) {
    $('#add-table', el).addEventListener('click', () => tableForm(null));
    $('#print-all', el).addEventListener('click', () => printHtml('Table QR codes', A.tables.map(qrPrintCard).join('')));
    el.addEventListener('change', async (e) => {
      const s = e.target.closest('[data-status]');
      if (s) {
        const t = A.tables.find((x) => x.id === s.dataset.status);
        const st = A.orders.filter((o) => o.sessionId && o.sessionId === t.sessionId && o.status !== 'cancelled' && o.paymentStatus !== 'paid');
        if ((s.value === 'available' || s.value === 'cleaning') && st.length && !(await confirmDialog(`${t.name} still has ${st.length} unpaid order(s). End the session anyway?`, { okLabel: 'End session', danger: true }))) { schedule(); return; }
        await run(A.api.call('setTableStatus', { tableId: t.id, status: s.value }), `${t.name}: ${TABLE_LABEL[s.value]}`).catch(() => schedule());
      }
    });
    el.addEventListener('click', async (e) => {
      const g = (attr) => { const b = e.target.closest(`[${attr}]`); return b ? A.tables.find((t) => t.id === b.getAttribute(attr)) : null; };
      let t;
      if ((t = g('data-qr'))) openModal({ title: t.name, body: `<div class="center">${qrSvg(tableUrl(t), { size: 300 })}<p class="xs muted mt-s" style="word-break:break-all">${esc(tableUrl(t))}</p><a class="btn btn-sm btn-ghost mt-s" href="${esc(tableUrl(t))}" target="_blank" rel="noopener">${icon('external', 14)} Test link</a></div>` });
      else if ((t = g('data-print-qr'))) printHtml(`QR ${t.name}`, qrPrintCard(t));
      else if ((t = g('data-dl-qr'))) { const png = await svgToPng(qrSvg(tableUrl(t), { size: 1024, margin: 3 })); downloadUrl(png, `QR-${t.name.replace(/\s+/g, '-')}.png`); }
      else if ((t = g('data-edit-table'))) tableForm(t);
      else if ((t = g('data-table-orders'))) { of.table = t.id; of.status = 'all'; of.range = 'today'; location.hash = '#/orders'; }
      else if ((t = g('data-regen'))) { if (await confirmDialog(`Generate a new QR for ${t.name}? The currently printed QR will stop working.`, { okLabel: 'Regenerate', danger: true })) await run(A.api.call('regenerateTableToken', { tableId: t.id }), 'New QR generated – print it').catch(() => {}); }
      else if ((t = g('data-del-table'))) { if (await confirmDialog(`Delete ${t.name}? Its QR code will stop working.`, { okLabel: 'Delete', danger: true })) { await run(A.api.remove('tables', t.id), 'Table deleted').catch(() => {}); logAct('table.deleted', t.name); } }
    });
  },
};

function tableForm(t) {
  const isNew = !t;
  const d = t || { number: '', name: '', seats: 4, zone: 'Indoor' };
  openModal({
    title: isNew ? 'Add Table' : `Edit ${d.name}`,
    body: `<form class="form-grid" id="t-form">
      <label class="field"><span>Table number</span><input class="input" name="number" value="${esc(d.number)}" required placeholder="07"></label>
      <label class="field"><span>Display name</span><input class="input" name="name" value="${esc(d.name)}" placeholder="Table 07"></label>
      <label class="field"><span>Seats</span><input class="input" name="seats" type="number" min="1" value="${d.seats || 4}"></label>
      <label class="field"><span>Zone</span><input class="input" name="zone" value="${esc(d.zone || '')}" placeholder="Indoor / Patio / Bar"></label>
      ${isNew ? `<label class="field full"><span>Table ID <em class="hint">(used in QR URL, cannot change later)</em></span><input class="input" name="id" placeholder="auto"></label>` : ''}
    </form>`,
    actions: [{ label: 'Cancel' }, {
      label: isNew ? 'Create & generate QR' : 'Save', cls: 'btn-primary', onClick: async (el, close) => {
        const v = formData($('#t-form', el));
        if (!v.number) return toast('Table number is required', 'error');
        const id = isNew ? (v.id || `T${String(v.number).replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`) : d.id;
        if (isNew && A.tables.some((x) => x.id === id)) return toast('A table with this ID already exists', 'error');
        const payload = { number: v.number.trim(), name: v.name.trim() || `Table ${v.number.trim()}`, seats: v.seats || 4, zone: v.zone.trim(), active: true };
        if (isNew) Object.assign(payload, { status: 'available', sessionId: null, token: newTableToken() });
        try { await run(A.api.save('tables', id, payload), isNew ? 'Table created' : 'Table saved'); logAct(isNew ? 'table.created' : 'table.updated', payload.name); close(); } catch { /* */ }
      },
    }],
  });
}

export const VIEWS = { dashboard, orders, menu, tables };
export { dayStart, ACTIVE, NEXT, live, fmtDate, timeAgo, chartColor };
