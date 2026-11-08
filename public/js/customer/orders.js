// My Orders list + live order tracking & payment.
import { menuImage } from '../core/art.js';
import { $, esc, rm, icon, toast, openModal, errMsg, fmtDateTime, fmtTime, timeAgo, STATUS_LABEL, PAY_LABEL, METHOD_LABEL, printHtml, receiptHtml } from '../core/ui.js';
import { S, bus, go, menuById } from './state.js';

const FLOW = ['received', 'confirmed', 'preparing', 'ready', 'completed'];
const STEP_COPY = {
  received: ['Order Received', 'Sent to the restaurant', 'receipt'],
  confirmed: ['Order Confirmed', 'The kitchen accepted your order', 'check'],
  preparing: ['Preparing', 'Our chefs are cooking', 'chef'],
  ready: ['Ready to Serve', 'Your food is on its way', 'bell'],
  completed: ['Completed', 'Enjoy your meal!', 'star'],
};

let justOrdered = null;
export const stepIndex = (status) => Math.max(0, FLOW.indexOf(status));
export const activeOrders = () => S.orders.filter((o) => !['completed', 'cancelled'].includes(o.status));

export function renderOrders() {
  const act = activeOrders();
  const past = S.orders.filter((o) => ['completed', 'cancelled'].includes(o.status));
  const session = S.table ? S.orders.filter((o) => o.tableId === S.table.tableId && o.sessionId && o.sessionId === (S.orders.find((x) => x.tableId === S.table.tableId) || {}).sessionId && o.status !== 'cancelled') : [];
  const row = (o) => `<div class="order-row" data-go="#/order/${esc(o.id)}">
      <div class="or-ic">${icon(o.type === 'dine_in' ? 'utensils' : 'bag', 20)}</div>
      <div class="grow"><b>${esc(o.orderNo)}</b><div class="xs muted">${esc(o.tableName || `Takeaway${o.pickup && o.pickup.time ? ` · ${o.pickup.time}` : ''}`)} · ${fmtDateTime(o.createdAt)}</div>
      <div class="xs muted ellipsis">${o.items.map((l) => `${l.qty}× ${esc(l.name)}`).join(', ')}</div></div>
      <div class="right"><b>${rm(o.total)}</b><div class="mt-s"><span class="chip status-${o.status}">${STATUS_LABEL[o.status]}</span></div></div></div>`;
  return `<div class="page-head"><h1>My Orders</h1><a class="btn btn-sm btn-primary" href="#/menu">${icon('plus', 16)} New order</a></div>
  <div class="page-pad stack">
    ${session.length ? `<div class="card card-pad" style="background:var(--emerald-soft)"><div class="row between"><div><div class="eyebrow">${esc(S.table.name)} · this visit</div><b style="font-size:18px">${session.length} order(s) · ${rm(session.reduce((s, o) => s + o.total, 0))}</b></div><a class="btn btn-sm btn-primary" href="#/menu">Order more</a></div></div>` : ''}
    <div class="eyebrow">Active (${act.length})</div>
    ${act.length ? `<div class="card">${act.map(row).join('')}</div>` : `<div class="card empty"><div class="empty-ic">${icon('receipt', 28)}</div><h4>No active orders</h4><p>Your live orders will show here.</p></div>`}
    <div class="eyebrow mt">History</div>
    ${past.length ? `<div class="card">${past.map(row).join('')}</div>` : '<p class="muted small">No past orders yet.</p>'}
  </div>`;
}

export function renderOrder(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) {
    return `<div class="page-head"><button class="icon-btn solid" onclick="location.hash='#/orders'" aria-label="Back">${icon('back')}</button><h1>Order</h1></div>
      <div class="page-pad"><div class="skeleton" style="height:180px"></div><div class="skeleton mt" style="height:260px"></div></div>`;
  }
  if (sessionStorage.getItem('eh_just_ordered') === o.id) { justOrdered = { id: o.id, until: Date.now() + 15000 }; sessionStorage.removeItem('eh_just_ordered'); }
  const just = justOrdered && justOrdered.id === o.id && Date.now() < justOrdered.until;
  const cancelled = o.status === 'cancelled';
  const idx = stepIndex(o.status);
  const cur = STEP_COPY[o.status];
  const s = S.settings;
  const methods = s.paymentMethods || {};
  const sessionOrders = o.sessionId ? S.orders.filter((x) => x.sessionId === o.sessionId && x.status !== 'cancelled') : [];

  return `<div class="page-head"><button class="icon-btn solid" onclick="location.hash='#/orders'" aria-label="Back">${icon('back')}</button><h1>${esc(o.orderNo)}</h1>
    <button class="icon-btn solid" id="print-receipt" aria-label="Receipt">${icon('printer', 20)}</button></div>
  ${just ? `<div class="success-burst"><div class="ring">${icon('check', 44)}</div><h2>Order placed!</h2><p class="muted">Order number <b>${esc(o.orderNo)}</b>${o.tableName ? ` · ${esc(o.tableName)}` : ''}</p></div><div style="height:14px"></div>` : ''}
  <div class="track-hero">
    <div class="track-anim ${cancelled || o.status === 'completed' ? 'done' : ''}">${icon(cancelled ? 'x' : cur ? cur[2] : 'receipt', 38)}</div>
    <h2>${cancelled ? 'Order Cancelled' : STATUS_LABEL[o.status]}</h2>
    <p class="muted">${cancelled ? esc(o.cancelReason || '') : cur ? cur[1] : ''}</p>
    <div class="row mt" style="gap:16px;flex-wrap:wrap">
      <div><div class="xs muted">${o.type === 'dine_in' ? 'Table' : 'Pickup'}</div><b>${esc(o.tableName || (o.pickup ? `${o.pickup.date} ${o.pickup.time}` : '-'))}</b></div>
      <div><div class="xs muted">Order time</div><b>${fmtTime(o.createdAt)}</b></div>
      <div><div class="xs muted">Total</div><b>${rm(o.total)}</b></div>
      <div><div class="xs muted">Payment</div><b>${PAY_LABEL[o.paymentStatus] || o.paymentStatus}</b></div>
    </div>
  </div>

  <div class="page-pad stack mt">
    ${!cancelled ? `<div class="card card-pad"><ol class="steps">${FLOW.map((st, i) => {
      const h = (o.statusHistory || []).find((x) => x.status === st);
      return `<li class="${i < idx || (i === idx && st === 'completed') ? 'done' : i === idx ? 'current' : ''}"><span class="dot">${icon(i <= idx ? 'check' : STEP_COPY[st][2], 16)}</span><div><h5>${STEP_COPY[st][0]}</h5><p class="xs muted">${h ? fmtTime(h.at) : STEP_COPY[st][1]}</p></div></li>`;
    }).join('')}</ol></div>` : ''}

    ${paymentBlock(o, methods, s)}

    <div class="card card-pad">
      <div class="row between"><h3 style="font-size:18px">Order details</h3><span class="chip">${o.itemCount} item(s)</span></div>
      ${o.items.map((l) => { const m = menuById(l.menuId); return `<div class="cart-line"><img src="${esc(menuImage((m && m.image) || l.image))}" alt=""><div class="grow"><h4>${l.qty} × ${esc(l.name)}</h4><div class="meta">${l.variant ? esc(l.variant.name) : ''}${l.addons && l.addons.length ? ` + ${l.addons.map((a) => esc(a.name)).join(', ')}` : ''}</div>${l.note ? `<div class="meta">“${esc(l.note)}”</div>` : ''}</div><b>${rm(l.lineTotal)}</b></div>`; }).join('')}
      ${o.note ? `<p class="small mt-s"><b>Request:</b> ${esc(o.note)}</p>` : ''}
      <div class="mt"><div class="sum-row"><span>Subtotal</span><span>${rm(o.subtotal)}</span></div>
      ${o.discount ? `<div class="sum-row emerald"><span>Discount${o.voucher ? ` (${esc(o.voucher.name)})` : ''}</span><span>-${rm(o.discount)}</span></div>` : ''}
      ${o.serviceCharge ? `<div class="sum-row muted"><span>Service charge</span><span>${rm(o.serviceCharge)}</span></div>` : ''}
      ${o.tax ? `<div class="sum-row muted"><span>SST</span><span>${rm(o.tax)}</span></div>` : ''}
      <div class="sum-row total"><span>Total</span><span>${rm(o.total)}</span></div></div>
      ${o.pointsAwarded ? `<div class="chip gold mt-s">${icon('award', 13)} +${o.pointsAwarded} points earned</div>` : ''}
    </div>

    ${sessionOrders.length > 1 ? `<div class="card card-pad"><div class="eyebrow">${esc(o.tableName)} · this visit</div><div class="row between mt-s"><span>${sessionOrders.length} orders</span><b>${rm(sessionOrders.reduce((a, x) => a + x.total, 0))}</b></div></div>` : ''}

    <div class="row">
      ${o.type === 'dine_in' && S.table && S.table.tableId === o.tableId && !cancelled ? `<a class="btn btn-primary grow" href="#/menu">${icon('plus', 16)} Order more</a>` : `<a class="btn btn-primary grow" href="#/menu">${icon('menu', 16)} Back to menu</a>`}
      ${o.status === 'received' ? '<button class="btn btn-danger-ghost" id="cancel-order">Cancel</button>' : ''}
    </div>
    <p class="xs muted center">Placed ${timeAgo(o.createdAt)} · ${fmtDateTime(o.createdAt)}</p>
  </div>`;
}

function paymentBlock(o, methods, s) {
  if (o.status === 'cancelled') return '';
  if (o.paymentStatus === 'paid') {
    return `<div class="card card-pad row"><span class="chip pay-paid">${icon('check', 13)} Paid</span><span class="grow small">${esc(METHOD_LABEL[o.paymentMethod] || o.paymentMethod)}${o.paymentRef ? ` · Ref ${esc(o.paymentRef)}` : ''}</span></div>`;
  }
  if (o.paymentStatus === 'pending_verification') {
    return `<div class="card card-pad row"><span class="chip pay-pending_verification">${icon('clock', 13)} Verifying</span><span class="grow small">We're confirming your DuitNow transfer (Ref ${esc(o.paymentRef || '')}). This usually takes a minute.</span></div>`;
  }
  const method = o.paymentMethod;
  let inner = '';
  if (method === 'duitnow' && methods.duitnow) {
    inner = `<div class="center">
      ${s.duitnowQr ? `<img src="${esc(s.duitnowQr)}" alt="DuitNow QR" style="width:220px;margin:6px auto;border-radius:16px;border:1px solid var(--grey)">` : `<div class="card card-pad" style="background:var(--cream)"><div class="eyebrow">DuitNow ID</div><b style="font-size:20px;letter-spacing:.05em">${esc(s.duitnowId || '-')}</b><div class="small muted">${esc(s.duitnowName || '')}</div></div>`}
      <p class="small mt-s">Transfer exactly <b>${rm(o.total)}</b> and enter the reference number from your banking app.</p></div>
      <form id="duitnow-form" class="row mt-s"><input class="input grow" name="reference" placeholder="Transaction reference" required minlength="4"><button class="btn btn-primary" type="submit">Submit</button></form>
      <p class="xs muted mt-s">${icon('shield', 12)} Your order is marked paid only after our cashier verifies the transfer.</p>`;
  } else if (method === 'online' && methods.online) {
    inner = `<p class="small">Pay securely online via FPX or card.</p><button class="btn btn-primary btn-block mt-s" id="pay-online">${icon('card', 18)} Pay ${rm(o.total)} now</button>
      <p class="xs muted mt-s">${icon('shield', 12)} Payment is confirmed by the gateway, not by this button.</p>`;
  } else {
    inner = `<p class="small">Please pay <b>${rm(o.total)}</b> at the counter${o.type === 'dine_in' ? ' when you are done' : ' when you pick up'}. Show this order number:</p><div class="center mt-s"><span class="chip dark" style="font-size:18px;padding:10px 18px;letter-spacing:.06em">${esc(o.orderNo)}</span></div>`;
  }
  return `<div class="card card-pad"><div class="row between mb"><h3 style="font-size:18px">Payment</h3><span class="chip pay-unpaid">Unpaid · ${esc(METHOD_LABEL[method] || method)}</span></div>${inner}</div>`;
}

bus.addEventListener('rendered', (e) => {
  if (e.detail.page !== 'order') return;
  const o = S.orders.find((x) => x.id === e.detail.arg);
  if (!o) return;
  const pr = $('#print-receipt');
  if (pr) pr.addEventListener('click', () => printHtml(`Receipt ${o.orderNo}`, receiptHtml(o, S.settings)));
  const c = $('#cancel-order');
  if (c) c.addEventListener('click', () => openModal({
    title: 'Cancel this order?', body: '<p class="muted">You can only cancel before the kitchen accepts your order.</p>',
    actions: [{ label: 'Keep order' }, { label: 'Cancel order', cls: 'btn-danger', onClick: async (el, close) => { try { await S.api.call('updateOrderStatus', { orderId: o.id, status: 'cancelled', reason: 'Cancelled by customer' }); close(); } catch (err) { toast(errMsg(err), 'error'); } } }],
  }));
  const f = $('#duitnow-form');
  if (f) f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('button'); btn.classList.add('loading'); btn.disabled = true;
    try { await S.api.call('submitPaymentReference', { orderId: o.id, reference: f.reference.value }); toast('Reference submitted – verifying', 'success'); } catch (err) { toast(errMsg(err), 'error'); } finally { btn.classList.remove('loading'); btn.disabled = false; }
  });
  const po = $('#pay-online');
  if (po) po.addEventListener('click', async () => {
    po.classList.add('loading'); po.disabled = true;
    try { const r = await S.api.call('createOnlinePayment', { orderId: o.id, returnUrl: `${location.origin}${location.pathname}#/order/${o.id}` }); if (r && r.url) location.href = r.url; } catch (err) { toast(errMsg(err), 'error', 5000); } finally { po.classList.remove('loading'); po.disabled = false; }
  });
});

export { go };
