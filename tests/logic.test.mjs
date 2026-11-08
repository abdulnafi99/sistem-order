// Business-rule tests for the shared server logic (runs in Node, no Firebase needed):
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOGIC, markGatewayPaid } from '../public/js/core/server-logic.js';
import { priceOrder } from '../public/js/core/pricing.js';
import { DEFAULT_SETTINGS, CATEGORIES, MENU, TABLES, REWARDS } from '../public/js/core/seed.js';

// ---------------------------------------------------------------- in-memory adapter (mirrors the Firestore one)
function memoryDb() {
  const data = {};
  const col = (c) => (data[c] = data[c] || {});
  let n = 0;
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const db = {
    data,
    seed() {
      col('settings').general = clone(DEFAULT_SETTINGS);
      CATEGORIES.forEach((c) => { col('categories')[c.id] = clone(c); });
      MENU.forEach((m) => { col('menu')[m.id] = clone(m); });
      TABLES.forEach((t) => { col('tables')[t.id] = { ...clone(t), token: `TOKEN-${t.id}` }; });
      REWARDS.forEach((r) => { col('rewards')[r.id] = clone(r); });
      return db;
    },
    async run(fn, ctx, input) {
      const writes = [];
      const tx = {
        async get(c, id) { return clone(col(c)[id]) || null; },
        async query(c, where = []) {
          return clone(Object.values(col(c)).filter((d) => where.every(([f, op, v]) => (op === '==' ? d[f] === v : op === 'in' ? v.includes(d[f]) : true))));
        },
        set(c, id, v) { writes.push(['set', c, id, clone(v)]); },
        update(c, id, v) { writes.push(['update', c, id, clone(v)]); },
        newId() { n += 1; return `id${n}`; },
      };
      const res = await fn(tx, { now: Date.now(), staff: null, system: false, ...ctx }, input);
      writes.forEach(([k, c, id, v]) => { col(c)[id] = k === 'set' ? { ...v, id } : { ...(col(c)[id] || { id }), ...v }; });
      return res;
    },
  };
  return db;
}
const admin = { uid: 'staff-admin', name: 'Admin', role: 'super_admin', permissions: [], active: true };
const kitchen = { uid: 'staff-k', name: 'Chef', role: 'kitchen', permissions: ['kitchen'], active: true };
const cashier = { uid: 'staff-c', name: 'Cash', role: 'cashier', permissions: ['dashboard', 'orders', 'tables', 'customers', 'payments'], active: true };

const dineIn = (items, extra = {}) => ({ type: 'dine_in', tableId: 'T02', token: 'TOKEN-T02', items, paymentMethod: 'cash', ...extra });

// ---------------------------------------------------------------- tests
test('shared logic copies used by Cloud Functions are in sync', () => {
  for (const f of ['pricing.js', 'server-logic.js', 'seed.js']) {
    assert.equal(readFileSync(new URL(`../functions/shared/${f}`, import.meta.url), 'utf8'), readFileSync(new URL(`../public/js/core/${f}`, import.meta.url), 'utf8'), `${f} out of sync – run: cd functions && npm run sync`);
  }
});

test('pricing: variants, add-ons, service charge and SST are computed in cents', () => {
  const menuMap = Object.fromEntries(MENU.map((m) => [m.id, m]));
  const p = priceOrder({ items: [{ menuId: 'latte', qty: 2, variantId: 'iced', addonIds: ['oat'] }], menuMap, settings: DEFAULT_SETTINGS, type: 'dine_in' });
  assert.ok(p.ok);
  assert.equal(p.subtotal, 28);        // (11 + 1 + 2) * 2
  assert.equal(p.serviceCharge, 2.8);  // 10%
  assert.equal(p.tax, 1.85);           // 6% of 30.80 = 1.848
  assert.equal(p.total, 32.65);
  const t = priceOrder({ items: [{ menuId: 'latte', qty: 2, variantId: 'iced', addonIds: ['oat'] }], menuMap, settings: DEFAULT_SETTINGS, type: 'takeaway' });
  assert.equal(t.serviceCharge, 0, 'no service charge for takeaway');
});

test('pricing rejects bad input', () => {
  const menuMap = Object.fromEntries(MENU.map((m) => [m.id, m]));
  const s = DEFAULT_SETTINGS;
  assert.equal(priceOrder({ items: [], menuMap, settings: s, type: 'dine_in' }).ok, false);
  assert.equal(priceOrder({ items: [{ menuId: 'nope', qty: 1 }], menuMap, settings: s, type: 'dine_in' }).ok, false);
  assert.equal(priceOrder({ items: [{ menuId: 'latte', qty: 1 }], menuMap, settings: s, type: 'dine_in' }).ok, false, 'variant required');
  assert.equal(priceOrder({ items: [{ menuId: 'avocado-toast', qty: 0 }], menuMap, settings: s, type: 'dine_in' }).ok, false);
  assert.equal(priceOrder({ items: [{ menuId: 'avocado-toast', qty: 1.5 }], menuMap, settings: s, type: 'dine_in' }).ok, false);
  assert.equal(priceOrder({ items: [{ menuId: 'avocado-toast', qty: 1, addonIds: ['fake'] }], menuMap, settings: s, type: 'dine_in' }).ok, false);
  assert.equal(priceOrder({ items: [{ menuId: 'single-origin', qty: 7, variantId: 'v60' }], menuMap, settings: s, type: 'dine_in' }).ok, false, 'stock limit');
});

test('placeOrder ignores client-sent prices and verifies the table token', async () => {
  const db = memoryDb().seed();
  await assert.rejects(db.run(LOGIC.placeOrder, { uid: 'c1' }, dineIn([{ menuId: 'avocado-toast', qty: 1 }], { token: 'WRONG' })), /could not be verified/);
  await assert.rejects(db.run(LOGIC.placeOrder, { uid: null }, dineIn([{ menuId: 'avocado-toast', qty: 1 }])), /sign in/);
  const r = await db.run(LOGIC.placeOrder, { uid: 'c1' }, dineIn([{ menuId: 'avocado-toast', qty: 1, price: 0.01, unitPrice: 0.01 }], { total: 0.01, subtotal: 0.01 }));
  const o = db.data.orders[r.orderId];
  assert.equal(o.subtotal, 18);
  assert.equal(o.total, 20.99); // 18 + 1.80 + 1.19 (6% of 19.80 = 1.188)
  assert.equal(o.status, 'received');
  assert.equal(o.paymentStatus, 'unpaid');
  assert.equal(db.data.tables.T02.status, 'active_order');
  assert.ok(db.data.tables.T02.sessionId);
  assert.ok(Object.values(db.data.notifications).some((n) => n.audience === 'staff' && n.type === 'new_order'));
  // a second order joins the same table session
  const r2 = await db.run(LOGIC.placeOrder, { uid: 'c1' }, dineIn([{ menuId: 'americano', qty: 2, variantId: 'hot' }]));
  assert.equal(db.data.orders[r2.orderId].sessionId, o.sessionId);
  assert.notEqual(db.data.orders[r2.orderId].orderNo, o.orderNo, 'unique order numbers');
});

test('takeaway requires valid contact details and pickup time', async () => {
  const db = memoryDb().seed();
  const base = { type: 'takeaway', items: [{ menuId: 'avocado-toast', qty: 1 }], paymentMethod: 'cash' };
  await assert.rejects(db.run(LOGIC.placeOrder, { uid: 'c1' }, { ...base, customerName: 'Ali', customerPhone: 'abc' }), /phone/);
  const later = new Date(Date.now() + 3 * 3600e3 + 8 * 3600e3); // expressed in MYT
  const date = later.toISOString().slice(0, 10); const time = later.toISOString().slice(11, 16);
  const r = await db.run(LOGIC.placeOrder, { uid: 'c1' }, { ...base, customerName: 'Ali Ahmad', customerPhone: '+60 12-345 6789', pickupDate: date, pickupTime: time });
  assert.equal(db.data.orders[r.orderId].serviceCharge, 0);
  assert.equal(db.data.orders[r.orderId].tableId, null);
});

test('status flow enforces transitions and permissions', async () => {
  const db = memoryDb().seed();
  const { orderId } = await db.run(LOGIC.placeOrder, { uid: 'c1' }, dineIn([{ menuId: 'avocado-toast', qty: 1 }]));
  await assert.rejects(db.run(LOGIC.updateOrderStatus, { uid: 'c2' }, { orderId, status: 'confirmed' }), /Staff login/);
  await assert.rejects(db.run(LOGIC.updateOrderStatus, { uid: kitchen.uid, staff: kitchen }, { orderId, status: 'ready' }), /Cannot move/);
  await assert.rejects(db.run(LOGIC.updateOrderStatus, { uid: kitchen.uid, staff: kitchen }, { orderId, status: 'cancelled' }), /permission/);
  for (const s of ['confirmed', 'preparing', 'ready', 'completed']) await db.run(LOGIC.updateOrderStatus, { uid: kitchen.uid, staff: kitchen }, { orderId, status: s });
  assert.equal(db.data.orders[orderId].status, 'completed');
  assert.equal(db.data.tables.T02.status, 'waiting_payment', 'completed but unpaid');
});

test('customer may cancel only their own order before it is accepted', async () => {
  const db = memoryDb().seed();
  const { orderId } = await db.run(LOGIC.placeOrder, { uid: 'c1' }, dineIn([{ menuId: 'avocado-toast', qty: 1 }]));
  await assert.rejects(db.run(LOGIC.updateOrderStatus, { uid: 'someone-else' }, { orderId, status: 'cancelled' }), /Staff login/);
  await db.run(LOGIC.updateOrderStatus, { uid: 'c1' }, { orderId, status: 'cancelled' });
  assert.equal(db.data.orders[orderId].status, 'cancelled');
});

test('payments: DuitNow reference is NOT payment; only cashier verification or gateway webhook marks paid', async () => {
  const db = memoryDb().seed();
  const { orderId } = await db.run(LOGIC.placeOrder, { uid: 'c1' }, dineIn([{ menuId: 'avocado-toast', qty: 1 }], { paymentMethod: 'duitnow' }));
  const { paymentId } = await db.run(LOGIC.submitPaymentReference, { uid: 'c1' }, { orderId, reference: 'REF12345' });
  assert.equal(db.data.orders[orderId].paymentStatus, 'pending_verification');
  await assert.rejects(db.run(LOGIC.verifyPayment, { uid: 'c1' }, { paymentId, approve: true }), /Staff login/);
  await assert.rejects(db.run(LOGIC.verifyPayment, { uid: kitchen.uid, staff: kitchen }, { paymentId, approve: true }), /permission/);
  await db.run(LOGIC.verifyPayment, { uid: cashier.uid, staff: cashier }, { paymentId, approve: true });
  assert.equal(db.data.orders[orderId].paymentStatus, 'paid');
  // gateway path is system-only and checks the amount
  const o2 = await db.run(LOGIC.placeOrder, { uid: 'c1' }, dineIn([{ menuId: 'avocado-toast', qty: 1 }]));
  await assert.rejects(db.run(markGatewayPaid, { uid: 'c1' }, { orderId: o2.orderId, amount: 20.99 }), /System only/);
  await assert.rejects(db.run(markGatewayPaid, { system: true }, { orderId: o2.orderId, amount: 1 }), /does not match/);
  await db.run(markGatewayPaid, { system: true }, { orderId: o2.orderId, amount: 20.99, reference: 'bill1' });
  assert.equal(db.data.orders[o2.orderId].paymentStatus, 'paid');
});

test('loyalty: points awarded once when completed AND paid, vouchers redeem and apply at checkout', async () => {
  const db = memoryDb().seed();
  await db.run(LOGIC.registerCustomer, { uid: 'm1' }, { name: 'Abdul', email: 'a@x.my', phone: '+60123456789' });
  const { orderId } = await db.run(LOGIC.placeOrder, { uid: 'm1' }, dineIn([{ menuId: 'big-breakfast', qty: 2 }]));
  for (const s of ['confirmed', 'preparing', 'ready', 'completed']) await db.run(LOGIC.updateOrderStatus, { uid: admin.uid, staff: admin }, { orderId, status: s });
  assert.equal(db.data.users.m1.points, 0, 'not paid yet');
  await db.run(LOGIC.recordPayment, { uid: cashier.uid, staff: cashier }, { orderId, method: 'cash', amountTendered: 100 });
  const total = db.data.orders[orderId].total;
  assert.equal(db.data.users.m1.points, Math.floor(total * 10));
  assert.equal(db.data.tables.T02.status, 'occupied');
  await assert.rejects(db.run(LOGIC.recordPayment, { uid: cashier.uid, staff: cashier }, { orderId, method: 'cash' }), /already paid/);
  assert.equal(db.data.users.m1.totalOrders, 1);

  const before = db.data.users.m1.points;
  const { voucherId } = await db.run(LOGIC.redeemReward, { uid: 'm1' }, { rewardId: 'rw-rm5' });
  assert.equal(db.data.users.m1.points, before - 500);
  const r = await db.run(LOGIC.placeOrder, { uid: 'm1' }, dineIn([{ menuId: 'big-breakfast', qty: 1 }], { voucherId }));
  assert.equal(db.data.orders[r.orderId].discount, 5);
  assert.equal(db.data.vouchers[voucherId].status, 'used');
  await assert.rejects(db.run(LOGIC.placeOrder, { uid: 'm1' }, dineIn([{ menuId: 'big-breakfast', qty: 1 }], { voucherId })), /no longer active/);
  await assert.rejects(db.run(LOGIC.placeOrder, { uid: 'thief' }, dineIn([{ menuId: 'big-breakfast', qty: 1 }], { voucherId })), /Voucher not found/);
  await assert.rejects(db.run(LOGIC.redeemReward, { uid: 'm1' }, { rewardId: 'rw-rm20' }), /tier|points/i);
});

test('referral bonus goes to both members; daily check-in only once per day', async () => {
  const db = memoryDb().seed();
  await db.run(LOGIC.registerCustomer, { uid: 'a' }, { name: 'Aina', email: 'a@x.my' });
  const code = db.data.users.a.referralCode;
  await db.run(LOGIC.registerCustomer, { uid: 'b' }, { name: 'Badrul', email: 'b@x.my', referralCode: code });
  assert.equal(db.data.users.a.points, 500);
  assert.equal(db.data.users.b.points, 500);
  await assert.rejects(db.run(LOGIC.registerCustomer, { uid: 'c' }, { name: 'Chong', email: 'c@x.my', referralCode: 'NOPE' }), /Referral code/);
  await db.run(LOGIC.dailyCheckIn, { uid: 'a' }, {});
  await assert.rejects(db.run(LOGIC.dailyCheckIn, { uid: 'a' }, {}), /already checked in/);
});

test('staff: only super admin may create super admins', async () => {
  const db = memoryDb().seed();
  const manager = { uid: 'mgr', name: 'M', role: 'manager', permissions: ['staff'], active: true };
  await assert.rejects(db.run(LOGIC.saveStaffProfile, { uid: 'mgr', staff: manager }, { uid: 'x', name: 'X', email: 'x@x', role: 'super_admin' }), /Super Admin/);
  await db.run(LOGIC.saveStaffProfile, { uid: 'mgr', staff: manager }, { uid: 'x', name: 'X', email: 'x@x', role: 'cashier' });
  assert.deepEqual(db.data.staff.x.permissions, ['dashboard', 'orders', 'tables', 'customers', 'payments']);
  await assert.rejects(db.run(LOGIC.saveStaffProfile, { uid: 'c', staff: cashier }, { uid: 'y', name: 'Y', email: 'y@y', role: 'cashier' }), /permission/);
});
