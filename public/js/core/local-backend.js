// =====================================================================
// Demo backend – runs entirely in the browser (localStorage).
// ---------------------------------------------------------------------
// • Same API surface as firebase-backend.js
// • Executes the SAME trusted server-logic.js, so pricing/QR/points rules
//   are identical to production.
// • Real-time across tabs/windows of the same browser via BroadcastChannel.
// For multi-device operation configure Firebase (js/config/firebase-config.js).
// =====================================================================

import { LOGIC, LogicError, ROLES, newTableToken, dayKey } from './server-logic.js';
import { DEFAULT_SETTINGS, CATEGORIES, MENU, TABLES, REWARDS, DEMO_STAFF } from './seed.js';
import { priceOrder } from './pricing.js';

const KEY = 'selagi_db_v1';
const SESSION_KEYS = { customer: 'eh_customer_uid', staff: 'eh_staff_uid' };
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('selagi-db') : null;

let DB = null;
const listeners = new Set();

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const rid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Math.random().toString(36).slice(2) + Date.now().toString(36));

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function load() {
  try { DB = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { DB = null; }
}
function persist(changed) {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {
    console.error(e);
    throw new LogicError('resource-exhausted', 'Browser storage is full. Use smaller images or configure Firebase.');
  }
  emit(changed);
  if (chan) chan.postMessage({ changed: [...changed] });
}
function emit(changed) { listeners.forEach((l) => { if (!changed || changed.has(l.col)) l.fire(); }); }
if (chan) chan.onmessage = (e) => { load(); emit(new Set(e.data.changed)); };
window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); emit(null); } });

const col = (name) => (DB.collections[name] = DB.collections[name] || {});

// ------------------------------------------------------------- query engine
function match(doc, [field, op, value]) {
  const v = field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
  switch (op) {
    case '==': return v === value;
    case '!=': return v !== value;
    case '>': return v > value;
    case '>=': return v >= value;
    case '<': return v < value;
    case '<=': return v <= value;
    case 'in': return Array.isArray(value) && value.includes(v);
    case 'not-in': return Array.isArray(value) && !value.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(value);
    default: return true;
  }
}
function runQuery(name, opts = {}) {
  let docs = Object.values(col(name)).filter((d) => !d._deleted);
  (opts.where || []).forEach((w) => { docs = docs.filter((d) => match(d, w)); });
  if (opts.orderBy) {
    const [f, dir = 'asc'] = opts.orderBy;
    docs.sort((a, b) => ((a[f] ?? 0) > (b[f] ?? 0) ? 1 : (a[f] ?? 0) < (b[f] ?? 0) ? -1 : 0) * (dir === 'desc' ? -1 : 1));
  }
  if (opts.limit) docs = docs.slice(0, opts.limit);
  return clone(docs);
}

// ------------------------------------------------------------- tx adapter
function makeTx() {
  const writes = [];
  return {
    async get(c, id) { const d = col(c)[id]; return d && !d._deleted ? clone(d) : null; },
    async query(c, where) { return runQuery(c, { where }); },
    set(c, id, data) { writes.push(['set', c, id, clone(data)]); },
    update(c, id, patch) { writes.push(['update', c, id, clone(patch)]); },
    newId() { return rid(); },
    commit() {
      const changed = new Set();
      writes.forEach(([kind, c, id, data]) => {
        const store = col(c);
        if (kind === 'set') store[id] = { ...data, id };
        else store[id] = { ...(store[id] || { id }), ...data };
        changed.add(c);
      });
      if (changed.size) persist(changed);
    },
  };
}

// ------------------------------------------------------------- seed
function seed() {
  const now = Date.now();
  DB = { version: 1, createdAt: now, collections: {}, auth: {} };
  col('settings').general = clone(DEFAULT_SETTINGS);
  CATEGORIES.forEach((c) => { col('categories')[c.id] = clone(c); });
  MENU.forEach((m) => { col('menu')[m.id] = { ...clone(m), createdAt: now }; });
  TABLES.forEach((t) => { col('tables')[t.id] = { ...clone(t), token: newTableToken(), createdAt: now }; });
  REWARDS.forEach((r) => { col('rewards')[r.id] = clone(r); });
  seedHistory(now);
}

/** Generates 30 days of completed demo orders so the dashboard has data. */
function seedHistory(now) {
  const settings = col('settings').general;
  const menuMap = col('menu');
  const catMap = col('categories');
  const menuIds = Object.keys(menuMap);
  const names = ['Hafiz', 'Nurul', 'Jason', 'Priya', 'Farah', 'Kevin', 'Siti', 'Amir', 'Grace', 'Iqbal'];
  // demo members
  names.slice(0, 6).forEach((n, i) => {
    const id = `demo-user-${i + 1}`;
    col('users')[id] = {
      id, uid: id, name: `${n} ${['Rahman', 'Aziz', 'Tan', 'Kumar', 'Ismail', 'Wong'][i]}`, email: `${n.toLowerCase()}@example.com`, phone: `+60 12-${300 + i}${1000 + i * 7}`,
      points: 0, lifetimePoints: 0, tierId: 'classic', totalOrders: 0, totalSpent: 0, memberNo: `SC-${String(i + 1).padStart(4, '0')}`,
      referralCode: `DEMO${i + 1}X${i + 7}Q`, referralCount: 0, referralPoints: 0, favorites: [], createdAt: now - (40 - i * 4) * 864e5, birthday: '', profileBonusClaimed: false,
    };
  });
  col('counters').members = { id: 'members', seq: 6 };
  let rand = 7;
  const rnd = () => ((rand = (rand * 9301 + 49297) % 233280) / 233280);
  const methods = ['cash', 'duitnow', 'cash', 'online'];
  for (let day = 29; day >= 0; day--) {
    const count = day === 0 ? 4 : 5 + Math.floor(rnd() * 9) + (day % 7 < 2 ? 5 : 0);
    let seq = 0;
    for (let k = 0; k < count; k++) {
      const t = now - day * 864e5 - Math.floor(rnd() * 10 * 3600e3) - (day === 0 ? 0 : 1800e3);
      if (t > now) continue;
      seq++;
      const items = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
        const m = menuMap[menuIds[Math.floor(rnd() * menuIds.length)]];
        return { menuId: m.id, qty: 1 + Math.floor(rnd() * 2), variantId: m.variants.length ? m.variants[0].id : undefined, addonIds: [] };
      });
      const dine = rnd() > 0.3;
      const priced = priceOrder({ items, menuMap: { ...menuMap, ...Object.fromEntries(items.map((i) => [i.menuId, { ...menuMap[i.menuId], available: true, stockLeft: undefined }])) }, settings, type: dine ? 'dine_in' : 'takeaway', categoryMap: catMap });
      const member = rnd() > 0.55 ? `demo-user-${1 + Math.floor(rnd() * 6)}` : null;
      const user = member ? col('users')[member] : null;
      const cancelled = rnd() < 0.05;
      const id = rid();
      const dk = dayKey(t, 8);
      const tbl = TABLES[Math.floor(rnd() * TABLES.length)];
      const order = {
        id, orderNo: `SC-${dk.slice(2)}-${String(seq).padStart(3, '0')}`, type: dine ? 'dine_in' : 'takeaway',
        tableId: dine ? tbl.id : null, tableName: dine ? tbl.name : null, sessionId: null,
        customerUid: member || `guest-${id}`, customerName: user ? user.name : dine ? 'Guest' : names[Math.floor(rnd() * names.length)],
        customerPhone: user ? user.phone : '', isMember: !!user,
        pickup: dine ? null : { date: '', time: '', at: t + 1800e3 }, items: priced.lines, note: '',
        subtotal: priced.subtotal, discount: 0, voucher: null, serviceCharge: priced.serviceCharge, serviceRate: priced.serviceRate,
        tax: priced.tax, taxRate: priced.taxRate, total: priced.total, itemCount: priced.lines.reduce((s, l) => s + l.qty, 0),
        status: cancelled ? 'cancelled' : 'completed',
        statusHistory: cancelled ? [{ status: 'received', at: t, by: 'customer' }, { status: 'cancelled', at: t + 300e3, by: 'Demo' }] : [{ status: 'received', at: t, by: 'customer' }, { status: 'confirmed', at: t + 60e3, by: 'Demo' }, { status: 'preparing', at: t + 120e3, by: 'Demo' }, { status: 'ready', at: t + (480 + Math.floor(rnd() * 900)) * 1e3, by: 'Demo' }, { status: 'completed', at: t + 1500e3, by: 'Demo' }],
        paymentMethod: methods[Math.floor(rnd() * methods.length)], paymentStatus: cancelled ? 'unpaid' : 'paid', paymentRef: null,
        pointsAwarded: 0, createdAt: t, updatedAt: t + 1500e3, completedAt: t + 1500e3, dayKey: dk, demo: true,
        cancelReason: cancelled ? 'Customer changed mind' : undefined,
      };
      if (!cancelled) {
        const pid = rid();
        col('payments')[pid] = { id: pid, orderId: id, orderNo: order.orderNo, method: order.paymentMethod, amount: order.total, status: 'success', createdAt: t + 1500e3, verifiedAt: t + 1500e3, recordedBy: 'Demo', customerName: order.customerName };
        if (user) {
          const pts = Math.floor(order.total * settings.pointsPerRM);
          order.pointsAwarded = pts;
          user.points += pts; user.lifetimePoints += pts; user.totalOrders += 1; user.totalSpent = Math.round((user.totalSpent + order.total) * 100) / 100;
          const lid = rid();
          col('loyalty_transactions')[lid] = { id: lid, uid: user.id, delta: pts, type: 'earn', reason: `Order ${order.orderNo}`, orderId: id, balanceAfter: user.points, createdAt: t + 1500e3 };
        }
      }
      col('orders')[id] = order;
      priced.lines.forEach((l, i) => { col('order_items')[`${id}_${i}`] = { id: `${id}_${i}`, orderId: id, orderNo: order.orderNo, menuId: l.menuId, name: l.name, qty: l.qty, lineTotal: l.lineTotal, categoryId: l.categoryId, categoryType: l.categoryType, createdAt: t, dayKey: dk, status: order.status }; });
    }
    if (day === 0) col('counters')[`orders-${dayKey(now, 8)}`] = { id: `orders-${dayKey(now, 8)}`, seq };
  }
  Object.values(col('users')).forEach((u) => {
    const sorted = [...settings.tiers].sort((a, b) => a.min - b.min);
    u.tierId = sorted.filter((t) => u.lifetimePoints >= t.min).pop().id;
  });
}

async function seedStaffAuth() {
  for (const s of DEMO_STAFF) {
    const uid = `staff-${s.role}`;
    if (DB.auth[s.email]) continue;
    DB.auth[s.email] = { uid, kind: 'staff', hash: await sha256(`${s.email}:${s.password}`) };
    col('staff')[uid] = { id: uid, uid, name: s.name, email: s.email, role: s.role, permissions: ROLES[s.role].permissions, active: true, createdAt: Date.now(), phone: '' };
  }
  localStorage.setItem(KEY, JSON.stringify(DB));
}

// ------------------------------------------------------------- backend factory
export async function createLocalBackend(scope) {
  load();
  if (!DB || !DB.collections) { seed(); }
  DB.auth = DB.auth || {};
  await seedStaffAuth();

  const sessionKey = SESSION_KEYS[scope] || SESSION_KEYS.customer;
  const authListeners = new Set();
  let current = null;

  function resolveUser() {
    const uid = localStorage.getItem(sessionKey);
    if (!uid) return null;
    if (scope === 'staff') {
      const s = col('staff')[uid];
      return s && s.active !== false ? { uid, email: s.email, isAnonymous: false, staff: clone(s) } : null;
    }
    const u = col('users')[uid];
    const authRec = Object.values(DB.auth).find((a) => a.uid === uid);
    return { uid, email: u ? u.email : null, isAnonymous: !authRec, profile: u ? clone(u) : null };
  }
  function setUser(uid) {
    if (uid) localStorage.setItem(sessionKey, uid); else localStorage.removeItem(sessionKey);
    current = resolveUser();
    authListeners.forEach((cb) => cb(current));
  }
  current = resolveUser();
  // keep profile fresh
  listeners.add({ col: scope === 'staff' ? 'staff' : 'users', fire: () => { const n = resolveUser(); current = n; authListeners.forEach((cb) => cb(current)); } });

  function ctx() {
    const u = resolveUser();
    return { uid: u ? u.uid : null, staff: u && u.staff ? u.staff : null, system: false, now: Date.now() };
  }

  const api = {
    mode: 'demo',
    scope,
    auth: {
      get user() { return current; },
      onChange(cb) { authListeners.add(cb); cb(current); return () => authListeners.delete(cb); },
      async ensureGuest() {
        if (!current) setUser(`anon-${rid()}`);
        return current;
      },
      async login(email, password) {
        const e = String(email || '').trim().toLowerCase();
        const rec = DB.auth[e];
        if (!rec || rec.hash !== (await sha256(`${e}:${password}`))) throw new LogicError('auth/invalid-credential', 'Incorrect email or password.');
        if (scope === 'staff') {
          const s = col('staff')[rec.uid];
          if (!s) throw new LogicError('permission-denied', 'This account is not a staff account.');
          if (s.active === false) throw new LogicError('permission-denied', 'This staff account has been deactivated.');
          s.lastLogin = Date.now(); persist(new Set(['staff']));
        } else if (rec.kind !== 'customer') throw new LogicError('permission-denied', 'Please use the staff portal to sign in.');
        setUser(rec.uid);
        return current;
      },
      async register({ name, email, phone, password, referralCode }) {
        const e = String(email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new LogicError('invalid-argument', 'Please enter a valid email.');
        if (String(password || '').length < 6) throw new LogicError('invalid-argument', 'Password must be at least 6 characters.');
        if (DB.auth[e]) throw new LogicError('already-exists', 'An account with this email already exists.');
        // keep the anonymous uid so existing orders stay linked
        const uid = current && current.isAnonymous ? current.uid : `cust-${rid()}`;
        const tx = makeTx();
        await LOGIC.registerCustomer(tx, { uid, staff: null, now: Date.now() }, { name, email: e, phone, referralCode });
        DB.auth[e] = { uid, kind: 'customer', hash: await sha256(`${e}:${password}`) };
        tx.commit();
        localStorage.setItem(KEY, JSON.stringify(DB));
        setUser(uid);
        return current;
      },
      async resetPassword() { throw new LogicError('unavailable', 'Password reset emails need Firebase. In demo mode, create a new account.'); },
      async logout() { setUser(null); },
    },

    watch(name, opts, cb) {
      const l = { col: name, fire: () => cb(runQuery(name, opts)) };
      listeners.add(l);
      l.fire();
      return () => listeners.delete(l);
    },
    watchDoc(name, id, cb) {
      const l = { col: name, fire: () => { const d = col(name)[id]; cb(d && !d._deleted ? clone(d) : null); } };
      listeners.add(l); l.fire();
      return () => listeners.delete(l);
    },
    async list(name, opts) { return runQuery(name, opts); },
    async get(name, id) { const d = col(name)[id]; return d && !d._deleted ? clone(d) : null; },

    // Direct writes (staff CRUD). Mirrors firestore.rules.
    async save(name, id, data) {
      load();
      const c = ctx();
      const permFor = { menu: 'menu', categories: 'menu', tables: 'tables', rewards: 'rewards', settings: 'settings', users: 'customers' };
      const perm = permFor[name];
      const ok = c.staff && (c.staff.role === 'super_admin' || (perm && (c.staff.permissions || []).includes(perm)));
      if (!ok && !(name === 'users' && id === c.uid)) throw new LogicError('permission-denied', 'You do not have permission to change this.');
      if (name === 'users' && !c.staff) {
        const allowed = ['favorites', 'avatar'];
        Object.keys(data).forEach((k) => { if (!allowed.includes(k)) delete data[k]; });
      }
      const docId = id || rid();
      const store = col(name);
      if (name === 'tables' && !(store[docId] && store[docId].token) && !data.token) data.token = newTableToken();
      store[docId] = { ...(store[docId] || {}), ...clone(data), id: docId, updatedAt: Date.now(), createdAt: (store[docId] && store[docId].createdAt) || Date.now() };
      persist(new Set([name]));
      return docId;
    },
    async remove(name, id) {
      load();
      const c = ctx();
      const permFor = { menu: 'menu', categories: 'menu', tables: 'tables', rewards: 'rewards', notifications: 'orders' };
      const perm = permFor[name];
      if (!(c.staff && (c.staff.role === 'super_admin' || (c.staff.permissions || []).includes(perm)))) throw new LogicError('permission-denied', 'You do not have permission to delete this.');
      delete col(name)[id];
      persist(new Set([name]));
    },

    async call(name, data = {}) {
      if (name === 'createStaff') return createStaff(data);
      if (name === 'createOnlinePayment') throw new LogicError('unavailable', 'Online payment gateway is only available when Firebase is configured.');
      load();
      const fn = LOGIC[name];
      if (!fn) throw new LogicError('not-found', `Unknown function ${name}`);
      const tx = makeTx();
      const result = await fn(tx, ctx(), data || {});
      tx.commit();
      return result;
    },

    async upload(file) { return compressImage(file); },

    async resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem(SESSION_KEYS.customer); },
  };

  async function createStaff({ name, email, password, role, permissions, phone, uid, active }) {
    const e = String(email || '').trim().toLowerCase();
    let staffUid = uid;
    if (!staffUid) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new LogicError('invalid-argument', 'Invalid email.');
      if (String(password || '').length < 6) throw new LogicError('invalid-argument', 'Password must be at least 6 characters.');
      if (DB.auth[e]) throw new LogicError('already-exists', 'Email already in use.');
      staffUid = `staff-${rid()}`;
    }
    const tx = makeTx();
    await LOGIC.saveStaffProfile(tx, ctx(), { uid: staffUid, name, email: e, role, permissions, active, phone });
    if (!uid) DB.auth[e] = { uid: staffUid, kind: 'staff', hash: await sha256(`${e}:${password}`) };
    else if (password) {
      const rec = Object.entries(DB.auth).find(([, a]) => a.uid === uid);
      if (rec) DB.auth[rec[0]].hash = await sha256(`${rec[0]}:${password}`);
    }
    tx.commit();
    return { uid: staffUid };
  }

  return api;
}

/** Resize image client-side and return a JPEG data URL (demo storage). */
export function compressImage(file, max = 640, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Invalid image'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
