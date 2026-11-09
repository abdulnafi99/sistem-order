// =====================================================================
// TAPJERR.io – Server logic (trusted business rules)
// ---------------------------------------------------------------------
// This module is executed in a TRUSTED context only:
//   • Firebase Cloud Functions (production) – see functions/index.js
//   • The local demo backend (single-device demo mode)
// It never touches the DOM or Firebase directly. It receives a small
// database adapter:
//   db.get(col, id)            -> Promise<doc|null>   (doc has .id)
//   db.query(col, where[])     -> Promise<doc[]>      where = [field, op, value]
//   db.set(col, id, data)      -> buffered write (replace)
//   db.update(col, id, patch)  -> buffered write (shallow merge)
//   db.newId(col)              -> string
// All reads are performed before writes so the same code runs inside a
// Firestore transaction (writes are buffered by the adapter and committed
// atomically at the end).
// ctx = { uid, staff, system, now }
// =====================================================================

import { priceOrder, tierFor, pointsForTotal } from './pricing.js';

export class LogicError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, msg) => { throw new LogicError(code, msg); };

export const ORDER_STATUSES = ['received', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
export const TABLE_STATUSES = ['available', 'occupied', 'active_order', 'waiting_payment', 'cleaning'];
export const ROLES = {
  super_admin: { name: 'Super Admin', permissions: ['dashboard', 'orders', 'menu', 'tables', 'customers', 'payments', 'rewards', 'staff', 'reports', 'settings', 'kitchen'] },
  manager: { name: 'Manager', permissions: ['dashboard', 'orders', 'menu', 'tables', 'customers', 'payments', 'rewards', 'staff', 'reports', 'kitchen'] },
  cashier: { name: 'Cashier', permissions: ['dashboard', 'orders', 'tables', 'customers', 'payments'] },
  kitchen: { name: 'Kitchen Staff', permissions: ['kitchen'] },
  waiter: { name: 'Waiter', permissions: ['orders', 'tables', 'kitchen'] },
};
export const ALL_PERMISSIONS = ROLES.super_admin.permissions;

const TRANSITIONS = {
  received: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_COPY = {
  confirmed: ['Order accepted', 'The kitchen has accepted your order.'],
  preparing: ['Food preparing', 'Our chefs are preparing your order.'],
  ready: ['Order ready', 'Your order is ready!'],
  completed: ['Order completed', 'Thank you for dining with us.'],
  cancelled: ['Order cancelled', 'Your order has been cancelled.'],
};

// ---------------------------------------------------------------- helpers
export function hasPerm(staff, perm) {
  if (!staff || staff.active === false) return false;
  if (staff.role === 'super_admin') return true;
  const perms = Array.isArray(staff.permissions) ? staff.permissions : (ROLES[staff.role] || {}).permissions || [];
  return perms.includes(perm);
}
function requirePerm(ctx, ...perms) {
  if (ctx.system) return;
  if (!ctx.staff) fail('permission-denied', 'Staff login required.');
  if (!perms.some((p) => hasPerm(ctx.staff, p))) fail('permission-denied', 'You do not have permission for this action.');
}
function requireUser(ctx) { if (!ctx.uid) fail('unauthenticated', 'Please sign in first.'); }
const str = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function tzParts(ms, offsetHours) {
  const d = new Date(ms + offsetHours * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}
const pad = (n, l = 2) => String(n).padStart(l, '0');
export function dayKey(ms, offsetHours = 8) {
  const p = tzParts(ms, offsetHours);
  return `${p.y}${pad(p.m)}${pad(p.d)}`;
}
function randomCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint32Array(len);
  globalThis.crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}
export function newTableToken() { return randomCode(20); }

async function loadSettings(db) {
  const s = await db.get('settings', 'general');
  return s || {};
}

function notify(db, now, { audience, uid = null, orderId = null, type, title, body }) {
  const id = db.newId('notifications');
  db.set('notifications', id, { id, audience, uid, orderId, type, title, body, read: false, createdAt: now });
}
function activity(db, ctx, action, detail) {
  if (!ctx.staff) return;
  const id = db.newId('staff_activity');
  db.set('staff_activity', id, { id, uid: ctx.staff.uid || ctx.uid, name: ctx.staff.name || ctx.staff.email, role: ctx.staff.role, action, detail: str(detail, 300), createdAt: ctx.now });
}

/** Rolling-window points & tier for a user (READ ONLY). */
async function tierState(db, uid, settings, now) {
  const windowDays = Number(settings.tierWindowDays || 90);
  const since = now - windowDays * 864e5;
  const tx = await db.query('loyalty_transactions', [['uid', '==', uid]]);
  const windowPoints = tx.filter((t) => t.createdAt >= since && t.delta > 0 && (t.type === 'earn' || t.type === 'bonus' || t.type === 'referral' || t.type === 'checkin'))
    .reduce((s, t) => s + t.delta, 0);
  const visits = tx.filter((t) => t.createdAt >= since && t.type === 'earn').length;
  return { windowPoints, visits, ...tierFor(windowPoints, settings.tiers) };
}

function addPoints(db, now, user, delta, type, reason, extra = {}) {
  const balanceAfter = Math.max(0, (user.points || 0) + delta);
  const id = db.newId('loyalty_transactions');
  db.set('loyalty_transactions', id, { id, uid: user.id, delta, type, reason, balanceAfter, createdAt: now, ...extra });
  user.points = balanceAfter;
  if (delta > 0) user.lifetimePoints = (user.lifetimePoints || 0) + delta;
  return balanceAfter;
}

/** Recompute a dine-in table status after an order change (pure). */
function tableStatusFor(table, sessionOrders) {
  if (!table.sessionId) return table.status === 'cleaning' ? 'cleaning' : 'available';
  const live = sessionOrders.filter((o) => o.status !== 'cancelled');
  if (live.some((o) => o.status !== 'completed')) return 'active_order';
  if (live.some((o) => o.paymentStatus !== 'paid')) return 'waiting_payment';
  return live.length ? 'occupied' : (table.status === 'cleaning' ? 'cleaning' : 'occupied');
}

async function loadSessionOrders(db, table) {
  if (!table || !table.sessionId) return [];
  return db.query('orders', [['sessionId', '==', table.sessionId]]);
}

/**
 * Award loyalty points when an order is completed AND paid (idempotent).
 * Requires pre-loaded user + tier state. Mutates order/user objects.
 */
function maybeAwardPoints(db, ctx, settings, order, user, tier) {
  if (!user || order.pointsAwarded) return 0;
  if (order.status !== 'completed' || order.paymentStatus !== 'paid') return 0;
  const pts = pointsForTotal(order.total, settings, tier && tier.current);
  order.pointsAwarded = pts || 0;
  user._awarded = pts || 0;
  user.totalOrders = (user.totalOrders || 0) + 1;
  user.totalSpent = round2((user.totalSpent || 0) + order.total);
  if (pts > 0) {
    addPoints(db, ctx.now, user, pts, 'earn', `Order ${order.orderNo}`, { orderId: order.id });
    notify(db, ctx.now, { audience: 'customer', uid: user.id, orderId: order.id, type: 'points', title: `+${pts} points earned`, body: `Points for order ${order.orderNo} have been added.` });
  }
  return pts;
}

async function preloadAward(db, settings, order, now) {
  if (!order.customerUid || order.pointsAwarded) return { user: null, tier: null };
  const user = await db.get('users', order.customerUid);
  if (!user) return { user: null, tier: null };
  const tier = await tierState(db, user.id, settings, now);
  return { user, tier };
}

function writeUserAfterAward(db, user, tier, settings) {
  if (!user) return;
  db.update('users', user.id, {
    points: user.points || 0,
    lifetimePoints: user.lifetimePoints || 0,
    totalOrders: user.totalOrders || 0,
    totalSpent: user.totalSpent || 0,
    tierId: tier ? tierFor(tier.windowPoints + (user._awarded || 0), settings.tiers).current.id : user.tierId || 'classic',
  });
}

// =================================================================== TABLE
export async function verifyTable(db, ctx, { tableId, token }) {
  const table = await db.get('tables', str(tableId, 64));
  if (!table || table.deleted || table.active === false) fail('not-found', 'This table QR is not valid.');
  if (!token || table.token !== token) fail('permission-denied', 'This table QR has expired. Please ask our staff for help.');
  const settings = await loadSettings(db);
  return {
    tableId: table.id, name: table.name, number: table.number, zone: table.zone || '',
    restaurantName: settings.restaurantName || 'SELAGI COFFEE', sessionId: table.sessionId || null,
  };
}

export async function regenerateTableToken(db, ctx, { tableId }) {
  requirePerm(ctx, 'tables');
  const table = await db.get('tables', tableId);
  if (!table) fail('not-found', 'Table not found.');
  const token = newTableToken();
  db.update('tables', tableId, { token, updatedAt: ctx.now });
  activity(db, ctx, 'table.qr_regenerated', table.name);
  return { token };
}

export async function setTableStatus(db, ctx, { tableId, status }) {
  requirePerm(ctx, 'tables');
  if (!TABLE_STATUSES.includes(status)) fail('invalid-argument', 'Unknown status.');
  const table = await db.get('tables', tableId);
  if (!table) fail('not-found', 'Table not found.');
  const patch = { status, updatedAt: ctx.now };
  // Ending a session: cleaning / available closes the current QR session.
  if (status === 'available' || status === 'cleaning') { patch.sessionId = null; patch.sessionStartedAt = null; }
  if (status === 'occupied' && !table.sessionId) { patch.sessionId = db.newId('sessions'); patch.sessionStartedAt = ctx.now; }
  db.update('tables', tableId, patch);
  activity(db, ctx, 'table.status', `${table.name} → ${status}`);
  return { ok: true };
}

// =================================================================== ORDERS
export async function placeOrder(db, ctx, input) {
  requireUser(ctx);
  const settings = await loadSettings(db);
  if (settings.acceptingOrders === false) fail('failed-precondition', 'We are not accepting orders right now.');
  const type = input.type === 'takeaway' ? 'takeaway' : 'dine_in';
  const offset = Number(settings.timezoneOffset ?? 8);

  // ---------- reads ----------
  let table = null;
  if (type === 'dine_in') {
    table = await db.get('tables', str(input.tableId, 64));
    if (!table || table.deleted || table.active === false) fail('not-found', 'Table not found. Please scan the QR code again.');
    if (!input.token || table.token !== input.token) fail('permission-denied', 'Table QR could not be verified. Please scan again.');
  }
  const items = Array.isArray(input.items) ? input.items : [];
  const menuIds = [...new Set(items.map((i) => i && i.menuId).filter(Boolean))];
  const menuDocs = await Promise.all(menuIds.map((id) => db.get('menu', String(id))));
  const menuMap = {};
  menuDocs.forEach((m) => { if (m) menuMap[m.id] = m; });
  const categories = await db.query('categories', []);
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const user = await db.get('users', ctx.uid);
  let voucher = null;
  if (input.voucherId) {
    voucher = await db.get('vouchers', str(input.voucherId, 64));
    if (!voucher || voucher.uid !== ctx.uid) fail('permission-denied', 'Voucher not found.');
  }
  const counterId = `orders-${dayKey(ctx.now, offset)}`;
  const counter = await db.get('counters', counterId);
  const sessionOrders = table ? await loadSessionOrders(db, table) : [];

  // ---------- validate ----------
  const priced = priceOrder({ items, menuMap, settings, type, voucher, categoryMap });
  if (!priced.ok) fail('invalid-argument', priced.errors[0]);

  const methods = settings.paymentMethods || { cash: true };
  const paymentMethod = ['cash', 'duitnow', 'online'].includes(input.paymentMethod) ? input.paymentMethod : 'cash';
  if (!methods[paymentMethod]) fail('invalid-argument', 'That payment method is not available.');

  let customerName = str(input.customerName, 60) || (user && user.name) || 'Guest';
  let customerPhone = str(input.customerPhone, 20) || (user && user.phone) || '';
  let pickup = null;
  if (type === 'takeaway') {
    if (customerName.length < 2 || customerName === 'Guest') fail('invalid-argument', 'Please enter your name for pickup.');
    if (!/^\+?[0-9][0-9\- ]{7,16}$/.test(customerPhone)) fail('invalid-argument', 'Please enter a valid phone number.');
    const date = str(input.pickupDate, 10); const time = str(input.pickupTime, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) fail('invalid-argument', 'Please choose a pickup date and time.');
    const [y, m, d] = date.split('-').map(Number); const [hh, mm] = time.split(':').map(Number);
    const pickupAt = Date.UTC(y, m - 1, d, hh, mm) - offset * 3600e3;
    const lead = Number(settings.pickupLeadMinutes || 15) * 60e3;
    if (pickupAt < ctx.now + lead - 60e3) fail('invalid-argument', `Pickup time must be at least ${settings.pickupLeadMinutes || 15} minutes from now.`);
    if (pickupAt > ctx.now + 7 * 864e5) fail('invalid-argument', 'Pickup can be scheduled up to 7 days ahead.');
    pickup = { date, time, at: pickupAt };
  }

  // ---------- writes ----------
  const seq = ((counter && counter.seq) || 0) + 1;
  db.set('counters', counterId, { id: counterId, seq });
  const p = tzParts(ctx.now, offset);
  const orderNo = `${settings.orderPrefix || 'SC'}-${String(p.y).slice(2)}${pad(p.m)}${pad(p.d)}-${pad(seq, 3)}`;
  const orderId = db.newId('orders');

  let sessionId = null;
  if (table) {
    sessionId = table.sessionId || db.newId('sessions');
    db.update('tables', table.id, {
      sessionId, sessionStartedAt: table.sessionId ? table.sessionStartedAt || ctx.now : ctx.now,
      status: 'active_order', updatedAt: ctx.now,
    });
  }

  const lines = priced.lines.map((l) => ({ ...l, image: l.image && !String(l.image).startsWith('data:') ? l.image : null }));
  const order = {
    id: orderId, orderNo, type,
    tableId: table ? table.id : null, tableName: table ? table.name : null, sessionId,
    customerUid: ctx.uid, customerName, customerPhone, customerEmail: (user && user.email) || null,
    isMember: !!user,
    pickup, items: lines, note: str(input.note, 300),
    subtotal: priced.subtotal, discount: priced.discount, voucher: priced.voucher,
    serviceCharge: priced.serviceCharge, serviceRate: priced.serviceRate,
    tax: priced.tax, taxRate: priced.taxRate, total: priced.total,
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
    status: 'received',
    statusHistory: [{ status: 'received', at: ctx.now, by: 'customer' }],
    paymentMethod, paymentStatus: 'unpaid', paymentRef: null,
    pointsAwarded: 0, createdAt: ctx.now, updatedAt: ctx.now, dayKey: dayKey(ctx.now, offset),
  };
  db.set('orders', orderId, order);

  lines.forEach((l, i) => {
    const id = `${orderId}_${i}`;
    db.set('order_items', id, { id, orderId, orderNo, menuId: l.menuId, name: l.name, qty: l.qty, lineTotal: l.lineTotal, categoryId: l.categoryId, categoryType: l.categoryType, createdAt: ctx.now, dayKey: order.dayKey, status: 'received' });
  });
  Object.values(menuMap).forEach((m) => {
    const qty = lines.filter((l) => l.menuId === m.id).reduce((s, l) => s + l.qty, 0);
    if (!qty) return;
    const patch = { soldCount: (m.soldCount || 0) + qty };
    if (typeof m.stockLeft === 'number') {
      patch.stockLeft = m.stockLeft - qty;
      if (patch.stockLeft <= 0) patch.available = false;
    }
    db.update('menu', m.id, patch);
  });
  if (voucher) db.update('vouchers', voucher.id, { status: 'used', usedOrderId: orderId, usedAt: ctx.now });

  const where = table ? table.name : `Takeaway · ${pickup.time}`;
  notify(db, ctx.now, { audience: 'staff', orderId, type: 'new_order', title: `New order ${orderNo}`, body: `${where} · ${order.itemCount} item(s) · RM ${order.total.toFixed(2)}` });
  notify(db, ctx.now, { audience: 'customer', uid: ctx.uid, orderId, type: 'received', title: 'Order received', body: `We have received order ${orderNo}.` });
  void sessionOrders;
  return { orderId, orderNo, total: order.total };
}

export async function updateOrderStatus(db, ctx, { orderId, status, reason }) {
  if (!ORDER_STATUSES.includes(status)) fail('invalid-argument', 'Unknown status.');
  const order = await db.get('orders', str(orderId, 64));
  if (!order) fail('not-found', 'Order not found.');
  const isOwnerCancel = !ctx.staff && ctx.uid && order.customerUid === ctx.uid && status === 'cancelled' && order.status === 'received';
  if (!isOwnerCancel) {
    if (status === 'cancelled') requirePerm(ctx, 'orders');
    else requirePerm(ctx, 'orders', 'kitchen');
  }
  if (!(TRANSITIONS[order.status] || []).includes(status)) fail('failed-precondition', `Cannot move an order from ${order.status} to ${status}.`);

  const settings = await loadSettings(db);
  const table = order.tableId ? await db.get('tables', order.tableId) : null;
  const sessionOrders = table ? await loadSessionOrders(db, table) : [];
  const voucher = status === 'cancelled' && order.voucher ? await db.get('vouchers', order.voucher.id) : null;
  const menuDocs = status === 'cancelled' ? await Promise.all([...new Set(order.items.map((l) => l.menuId))].map((id) => db.get('menu', id))) : [];
  order.status = status;
  const { user, tier } = status === 'completed' ? await preloadAward(db, settings, order, ctx.now) : { user: null, tier: null };

  // writes
  const by = ctx.staff ? (ctx.staff.name || ctx.staff.email) : 'customer';
  const history = [...(order.statusHistory || []), { status, at: ctx.now, by, reason: reason ? str(reason, 200) : undefined }];
  const patch = { status, statusHistory: history, updatedAt: ctx.now };
  if (status === 'cancelled') {
    patch.cancelReason = str(reason, 200) || (isOwnerCancel ? 'Cancelled by customer' : 'Cancelled by staff');
    patch.cancelledAt = ctx.now;
    if (voucher && voucher.status === 'used' && voucher.usedOrderId === order.id) db.update('vouchers', voucher.id, { status: 'active', usedOrderId: null });
    menuDocs.forEach((m) => {
      if (!m) return;
      const qty = order.items.filter((l) => l.menuId === m.id).reduce((s, l) => s + l.qty, 0);
      const mp = { soldCount: Math.max(0, (m.soldCount || 0) - qty) };
      if (typeof m.stockLeft === 'number') { mp.stockLeft = m.stockLeft + qty; if (mp.stockLeft > 0 && m.available === false && m.autoSoldOut !== false) mp.available = true; }
      db.update('menu', m.id, mp);
    });
  }
  if (status === 'completed') patch.completedAt = ctx.now;
  if (status === 'ready') patch.readyAt = ctx.now;
  const awarded = maybeAwardPoints(db, ctx, settings, order, user, tier);
  if (awarded || order.pointsAwarded) patch.pointsAwarded = order.pointsAwarded;
  writeUserAfterAward(db, user, tier, settings);
  db.update('orders', order.id, patch);
  order.items.forEach((_, i) => db.update('order_items', `${order.id}_${i}`, { status }));

  if (table) {
    const merged = sessionOrders.map((o) => (o.id === order.id ? { ...o, status } : o));
    if (!merged.some((o) => o.id === order.id) && table.sessionId === order.sessionId) merged.push({ ...order });
    if (table.sessionId === order.sessionId) db.update('tables', table.id, { status: tableStatusFor(table, merged), updatedAt: ctx.now });
  }
  const [title, body] = STATUS_COPY[status] || ['Order updated', ''];
  notify(db, ctx.now, { audience: 'customer', uid: order.customerUid, orderId: order.id, type: status, title: `${title} · ${order.orderNo}`, body });
  if (status === 'cancelled') notify(db, ctx.now, { audience: 'staff', orderId: order.id, type: 'cancelled', title: `Order ${order.orderNo} cancelled`, body: patch.cancelReason });
  if (status === 'ready') notify(db, ctx.now, { audience: 'staff', orderId: order.id, type: 'ready', title: `Order ${order.orderNo} ready`, body: order.tableName ? `Serve to ${order.tableName}` : 'Ready for pickup' });
  activity(db, ctx, `order.${status}`, order.orderNo);
  return { ok: true, pointsAwarded: awarded };
}

// =================================================================== PAYMENTS
async function settleOrderPaid(db, ctx, order, { method, amount, reference, paymentId, recordedBy }) {
  // READS
  const settings = await loadSettings(db);
  const table = order.tableId ? await db.get('tables', order.tableId) : null;
  const sessionOrders = table ? await loadSessionOrders(db, table) : [];
  order.paymentStatus = 'paid';
  const { user, tier } = order.status === 'completed' ? await preloadAward(db, settings, order, ctx.now) : { user: null, tier: null };
  // WRITES
  const pid = paymentId || db.newId('payments');
  db.set('payments', pid, {
    id: pid, orderId: order.id, orderNo: order.orderNo, method, amount: round2(amount), status: 'success',
    reference: reference || null, recordedBy: recordedBy || null, createdAt: ctx.now, verifiedAt: ctx.now,
    customerUid: order.customerUid || null, customerName: order.customerName || null,
  });
  const patch = { paymentStatus: 'paid', paymentMethod: method, paymentRef: reference || null, paidAt: ctx.now, updatedAt: ctx.now };
  maybeAwardPoints(db, ctx, settings, order, user, tier);
  if (order.pointsAwarded) patch.pointsAwarded = order.pointsAwarded;
  writeUserAfterAward(db, user, tier, settings);
  db.update('orders', order.id, patch);
  if (table && table.sessionId === order.sessionId) {
    const merged = sessionOrders.map((o) => (o.id === order.id ? { ...o, paymentStatus: 'paid' } : o));
    db.update('tables', table.id, { status: tableStatusFor(table, merged), updatedAt: ctx.now });
  }
  notify(db, ctx.now, { audience: 'staff', orderId: order.id, type: 'payment', title: `Payment received · ${order.orderNo}`, body: `RM ${round2(amount).toFixed(2)} via ${method}` });
  notify(db, ctx.now, { audience: 'customer', uid: order.customerUid, orderId: order.id, type: 'payment', title: 'Payment received', body: `RM ${round2(amount).toFixed(2)} for ${order.orderNo}. Thank you!` });
}

/** Cashier records a cash (or counter DuitNow) payment. */
export async function recordPayment(db, ctx, { orderId, method, amountTendered, reference }) {
  requirePerm(ctx, 'payments');
  const order = await db.get('orders', str(orderId, 64));
  if (!order) fail('not-found', 'Order not found.');
  if (order.status === 'cancelled') fail('failed-precondition', 'Order is cancelled.');
  if (order.paymentStatus === 'paid') fail('already-exists', 'Order is already paid.');
  if (!['cash', 'duitnow'].includes(method)) fail('invalid-argument', 'Use the gateway for online payments.');
  const tendered = round2(amountTendered == null ? order.total : amountTendered);
  if (method === 'cash' && tendered < order.total) fail('invalid-argument', 'Amount tendered is less than the total.');
  if (method === 'duitnow' && !str(reference, 60)) fail('invalid-argument', 'Enter the DuitNow transaction reference.');
  await settleOrderPaid(db, ctx, order, { method, amount: order.total, reference: str(reference, 60) || null, recordedBy: ctx.staff.name || ctx.staff.email });
  activity(db, ctx, 'payment.recorded', `${order.orderNo} · ${method} · RM ${order.total.toFixed(2)}`);
  return { ok: true, change: method === 'cash' ? round2(tendered - order.total) : 0 };
}

/** Customer submits a DuitNow transfer reference – NOT marked as paid. */
export async function submitPaymentReference(db, ctx, { orderId, reference }) {
  requireUser(ctx);
  const order = await db.get('orders', str(orderId, 64));
  if (!order || order.customerUid !== ctx.uid) fail('not-found', 'Order not found.');
  if (order.paymentStatus === 'paid') fail('already-exists', 'Order is already paid.');
  const ref = str(reference, 60);
  if (ref.length < 4) fail('invalid-argument', 'Please enter the transaction reference from your banking app.');
  const pid = db.newId('payments');
  db.set('payments', pid, { id: pid, orderId: order.id, orderNo: order.orderNo, method: 'duitnow', amount: order.total, status: 'pending', reference: ref, createdAt: ctx.now, customerUid: ctx.uid, customerName: order.customerName });
  db.update('orders', order.id, { paymentStatus: 'pending_verification', paymentMethod: 'duitnow', paymentRef: ref, pendingPaymentId: pid, updatedAt: ctx.now });
  notify(db, ctx.now, { audience: 'staff', orderId: order.id, type: 'payment_pending', title: `Verify DuitNow · ${order.orderNo}`, body: `Ref ${ref} · RM ${order.total.toFixed(2)}` });
  return { ok: true, paymentId: pid };
}

/** Cashier verifies (or rejects) a pending DuitNow payment against the bank statement. */
export async function verifyPayment(db, ctx, { paymentId, approve, note }) {
  requirePerm(ctx, 'payments');
  const pay = await db.get('payments', str(paymentId, 64));
  if (!pay || pay.status !== 'pending') fail('not-found', 'Pending payment not found.');
  const order = await db.get('orders', pay.orderId);
  if (!order) fail('not-found', 'Order not found.');
  if (approve) {
    await settleOrderPaid(db, ctx, order, { method: pay.method, amount: pay.amount, reference: pay.reference, paymentId: pay.id, recordedBy: ctx.staff.name || ctx.staff.email });
    activity(db, ctx, 'payment.verified', `${order.orderNo} · ${pay.reference}`);
  } else {
    db.update('payments', pay.id, { status: 'failed', note: str(note, 200), verifiedAt: ctx.now, recordedBy: ctx.staff.name || ctx.staff.email });
    db.update('orders', order.id, { paymentStatus: 'unpaid', paymentRef: null, pendingPaymentId: null, updatedAt: ctx.now });
    notify(db, ctx.now, { audience: 'customer', uid: order.customerUid, orderId: order.id, type: 'payment_failed', title: 'Payment not verified', body: `We could not verify your DuitNow transfer for ${order.orderNo}. Please see the cashier.` });
    activity(db, ctx, 'payment.rejected', `${order.orderNo} · ${pay.reference}`);
  }
  return { ok: true };
}

/** Called ONLY by the payment-gateway webhook after signature verification. */
export async function markGatewayPaid(db, ctx, { orderId, amount, reference, billId }) {
  if (!ctx.system) fail('permission-denied', 'System only.');
  const order = await db.get('orders', str(orderId, 64));
  if (!order) fail('not-found', 'Order not found.');
  if (order.paymentStatus === 'paid') return { ok: true, duplicate: true };
  if (Math.abs(round2(amount) - order.total) > 0.009) fail('failed-precondition', 'Paid amount does not match order total.');
  await settleOrderPaid(db, ctx, order, { method: 'online', amount, reference: reference || billId, recordedBy: 'gateway' });
  return { ok: true };
}

// =================================================================== CUSTOMERS & LOYALTY
export async function registerCustomer(db, ctx, { name, email, phone, referralCode }) {
  requireUser(ctx);
  const existing = await db.get('users', ctx.uid);
  if (existing) return { ok: true, existing: true };
  const settings = await loadSettings(db);
  const counter = await db.get('counters', 'members');
  let referrer = null;
  const code = str(referralCode, 16).toUpperCase();
  if (code) {
    const found = await db.query('users', [['referralCode', '==', code]]);
    referrer = found[0] || null;
    if (!referrer) fail('invalid-argument', 'Referral code not found.');
  }
  const cleanName = str(name, 60);
  if (cleanName.length < 2) fail('invalid-argument', 'Please enter your name.');
  const seq = ((counter && counter.seq) || 0) + 1;
  db.set('counters', 'members', { id: 'members', seq });
  const user = {
    id: ctx.uid, uid: ctx.uid, name: cleanName, email: str(email, 120).toLowerCase(), phone: str(phone, 20), birthday: '',
    points: 0, lifetimePoints: 0, tierId: 'classic', totalOrders: 0, totalSpent: 0,
    memberNo: `${settings.memberPrefix || 'SC'}-${pad(seq, 4)}`, referralCode: randomCode(8), referredBy: referrer ? referrer.id : null,
    referralCount: 0, referralPoints: 0, favorites: [], profileBonusClaimed: false, lastCheckIn: null, createdAt: ctx.now,
  };
  const bonus = Number(settings.referralBonus || 0);
  if (referrer && bonus > 0) {
    addPoints(db, ctx.now, user, bonus, 'referral', `Welcome bonus (referred by ${referrer.name})`);
    addPoints(db, ctx.now, referrer, bonus, 'referral', `Referral: ${cleanName} joined`);
    db.update('users', referrer.id, { points: referrer.points, lifetimePoints: referrer.lifetimePoints, referralCount: (referrer.referralCount || 0) + 1, referralPoints: (referrer.referralPoints || 0) + bonus });
    notify(db, ctx.now, { audience: 'customer', uid: referrer.id, type: 'points', title: `+${bonus} referral points`, body: `${cleanName} joined using your code.` });
  }
  db.set('users', user.id, user);
  notify(db, ctx.now, { audience: 'customer', uid: user.id, type: 'welcome', title: `Welcome to ${settings.restaurantName || 'SELAGI COFFEE'}!`, body: 'Earn points on every order and unlock rewards.' });
  return { ok: true, memberNo: user.memberNo };
}

export async function updateProfile(db, ctx, { name, phone, birthday }) {
  requireUser(ctx);
  const user = await db.get('users', ctx.uid);
  if (!user) fail('not-found', 'Please create an account first.');
  const settings = await loadSettings(db);
  const patch = {};
  if (name != null) { const n = str(name, 60); if (n.length < 2) fail('invalid-argument', 'Name too short.'); patch.name = n; }
  if (phone != null) { const p = str(phone, 20); if (p && !/^\+?[0-9][0-9\- ]{7,16}$/.test(p)) fail('invalid-argument', 'Invalid phone number.'); patch.phone = p; }
  if (birthday != null) { const b = str(birthday, 10); if (b && !/^\d{4}-\d{2}-\d{2}$/.test(b)) fail('invalid-argument', 'Invalid birthday.'); patch.birthday = b; }
  const merged = { ...user, ...patch };
  let bonus = 0;
  if (!user.profileBonusClaimed && merged.name && merged.phone && merged.birthday && merged.email) {
    bonus = Number(settings.profileBonus || 0);
    if (bonus > 0) addPoints(db, ctx.now, user, bonus, 'bonus', 'Profile completed');
    patch.profileBonusClaimed = true; patch.points = user.points; patch.lifetimePoints = user.lifetimePoints;
  }
  db.update('users', user.id, patch);
  return { ok: true, bonus };
}

export async function dailyCheckIn(db, ctx) {
  requireUser(ctx);
  const user = await db.get('users', ctx.uid);
  if (!user) fail('failed-precondition', 'Create a free account to check in.');
  const settings = await loadSettings(db);
  const today = dayKey(ctx.now, Number(settings.timezoneOffset ?? 8));
  if (user.lastCheckIn === today) fail('already-exists', 'You have already checked in today.');
  const pts = Number(settings.checkInPoints || 0);
  if (pts > 0) addPoints(db, ctx.now, user, pts, 'checkin', 'Daily check-in');
  db.update('users', user.id, { lastCheckIn: today, points: user.points, lifetimePoints: user.lifetimePoints, checkInStreak: (user.checkInStreak || 0) + 1 });
  return { ok: true, points: pts };
}

export async function redeemReward(db, ctx, { rewardId }) {
  requireUser(ctx);
  const user = await db.get('users', ctx.uid);
  if (!user) fail('failed-precondition', 'Create a free account to redeem rewards.');
  const reward = await db.get('rewards', str(rewardId, 64));
  if (!reward || reward.active === false) fail('not-found', 'Reward not available.');
  const settings = await loadSettings(db);
  const tier = await tierState(db, user.id, settings, ctx.now);
  if (reward.minTier) {
    const order = (settings.tiers || []).map((t) => t.id);
    if (order.indexOf(tier.current.id) < order.indexOf(reward.minTier)) fail('failed-precondition', 'Your tier is not eligible for this reward yet.');
  }
  const cost = Number(reward.cost || 0);
  if ((user.points || 0) < cost) fail('failed-precondition', 'Not enough points.');
  addPoints(db, ctx.now, user, -cost, 'redeem', `Redeemed: ${reward.name}`, { rewardId: reward.id });
  db.update('users', user.id, { points: user.points });
  const vid = db.newId('vouchers');
  const validDays = Number(reward.validDays || 30);
  db.set('vouchers', vid, {
    id: vid, uid: user.id, rewardId: reward.id, name: reward.name, description: reward.description || '',
    type: reward.type || 'amount', value: Number(reward.value || 0), maxDiscount: reward.maxDiscount || null,
    menuId: reward.menuId || null, itemName: reward.itemName || null,
    minSpend: Number(reward.minSpend || 0), code: randomCode(6), status: 'active',
    expiresAt: ctx.now + validDays * 864e5, createdAt: ctx.now,
  });
  if (typeof reward.stock === 'number') db.update('rewards', reward.id, { stock: Math.max(0, reward.stock - 1), active: reward.stock - 1 > 0 });
  notify(db, ctx.now, { audience: 'customer', uid: user.id, type: 'voucher', title: 'Voucher added', body: `${reward.name} is now in My Vouchers.` });
  return { ok: true, voucherId: vid };
}

export async function adjustPoints(db, ctx, { uid, delta, reason }) {
  requirePerm(ctx, 'customers', 'rewards');
  const user = await db.get('users', str(uid, 64));
  if (!user) fail('not-found', 'Customer not found.');
  const d = Math.trunc(Number(delta));
  if (!d || Math.abs(d) > 100000) fail('invalid-argument', 'Invalid points amount.');
  if (!str(reason)) fail('invalid-argument', 'Please give a reason.');
  addPoints(db, ctx.now, user, d, 'adjust', str(reason, 200), { by: ctx.staff ? ctx.staff.name : 'system' });
  db.update('users', user.id, { points: user.points, lifetimePoints: user.lifetimePoints });
  notify(db, ctx.now, { audience: 'customer', uid: user.id, type: 'points', title: `${d > 0 ? '+' : ''}${d} points`, body: str(reason, 200) });
  activity(db, ctx, 'points.adjusted', `${user.name}: ${d} (${reason})`);
  return { ok: true, balance: user.points };
}

export async function markNotificationsRead(db, ctx, { ids }) {
  requireUser(ctx);
  const list = Array.isArray(ids) ? ids.slice(0, 100) : [];
  const docs = await Promise.all(list.map((id) => db.get('notifications', str(id, 64))));
  docs.forEach((n) => {
    if (!n) return;
    const allowed = n.audience === 'staff' ? !!ctx.staff : n.uid === ctx.uid;
    if (allowed) db.update('notifications', n.id, { read: true });
  });
  return { ok: true };
}

// =================================================================== STAFF
/** Stores the staff profile. Auth-account creation is done by the caller (adapter). */
export async function saveStaffProfile(db, ctx, { uid, name, email, role, permissions, active, phone }) {
  requirePerm(ctx, 'staff');
  if (!ROLES[role]) fail('invalid-argument', 'Unknown role.');
  if (role === 'super_admin' && ctx.staff && ctx.staff.role !== 'super_admin') fail('permission-denied', 'Only a Super Admin can assign the Super Admin role.');
  const existing = await db.get('staff', str(uid, 128));
  if (existing && existing.role === 'super_admin' && ctx.staff && ctx.staff.role !== 'super_admin') fail('permission-denied', 'Only a Super Admin can edit a Super Admin.');
  if (ctx.staff && existing && existing.uid === ctx.staff.uid && active === false) fail('failed-precondition', 'You cannot deactivate yourself.');
  const perms = Array.isArray(permissions) ? permissions.filter((p) => ALL_PERMISSIONS.includes(p)) : ROLES[role].permissions;
  const doc = {
    ...(existing || {}), id: uid, uid, name: str(name, 60), email: str(email, 120).toLowerCase(), phone: str(phone, 20),
    role, permissions: perms, active: active !== false, updatedAt: ctx.now, createdAt: (existing && existing.createdAt) || ctx.now,
  };
  db.set('staff', uid, doc);
  activity(db, ctx, existing ? 'staff.updated' : 'staff.created', `${doc.name} (${ROLES[role].name})`);
  return { ok: true, uid };
}

export async function logStaffActivity(db, ctx, { action, detail }) {
  if (!ctx.staff) fail('permission-denied', 'Staff only.');
  activity(db, ctx, str(action, 60), detail);
  return { ok: true };
}

// Callable registry – names are shared with the Firebase functions export.
export const LOGIC = {
  verifyTable, regenerateTableToken, setTableStatus,
  placeOrder, updateOrderStatus,
  recordPayment, submitPaymentReference, verifyPayment,
  registerCustomer, updateProfile, dailyCheckIn, redeemReward, adjustPoints, markNotificationsRead,
  saveStaffProfile, logStaffActivity,
};
