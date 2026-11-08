// =====================================================================
// SELAGI COFFEE – Cloud Functions (trusted backend)
// ---------------------------------------------------------------------
// Every callable runs the SAME business rules as the demo backend
// (shared/server-logic.js, copied from public/js/core by `npm run sync`)
// inside a Firestore transaction. Clients can never set prices, payment
// status or points directly – see firestore.rules.
// =====================================================================
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { defineSecret, defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'node:crypto';
import { LOGIC, LogicError, markGatewayPaid, hasPerm } from './shared/server-logic.js';

initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 20 });

// Billplz (Malaysian payment gateway – FPX / cards). Set with:
//   firebase functions:secrets:set BILLPLZ_API_KEY
//   firebase functions:secrets:set BILLPLZ_X_SIGNATURE
const BILLPLZ_API_KEY = defineSecret('BILLPLZ_API_KEY');
const BILLPLZ_X_SIGNATURE = defineSecret('BILLPLZ_X_SIGNATURE');
const BILLPLZ_COLLECTION_ID = defineString('BILLPLZ_COLLECTION_ID', { default: '' });
const BILLPLZ_SANDBOX = defineString('BILLPLZ_SANDBOX', { default: 'true' });
const billplzBase = () => (BILLPLZ_SANDBOX.value() === 'true' ? 'https://www.billplz-sandbox.com' : 'https://www.billplz.com');

// ------------------------------------------------------------------ transaction adapter
function runLogic(fn, ctx, data) {
  return db.runTransaction(async (tx) => {
    const writes = [];
    const adapter = {
      async get(col, id) {
        const snap = await tx.get(db.collection(col).doc(String(id)));
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
      },
      async query(col, where = []) {
        let q = db.collection(col);
        where.forEach(([f, op, v]) => { q = q.where(f, op, v); });
        const snap = await tx.get(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      set(col, id, value) { writes.push(['set', col, id, value]); },
      update(col, id, value) { writes.push(['merge', col, id, value]); },
      newId(col) { return db.collection(col).doc().id; },
    };
    const result = await fn(adapter, { ...ctx, now: Date.now() }, data || {});
    for (const [kind, col, id, value] of writes) {
      const ref = db.collection(col).doc(String(id));
      // shallow-merge semantics, same as the demo backend
      if (kind === 'set') tx.set(ref, { ...value, id: String(id) });
      else tx.set(ref, value, { merge: true });
    }
    return result;
  });
}

async function contextFor(req) {
  const uid = req.auth ? req.auth.uid : null;
  let staff = null;
  if (uid && !req.auth.token.firebase?.sign_in_provider?.includes('anonymous')) {
    const s = await db.collection('staff').doc(uid).get();
    if (s.exists && s.data().active !== false) staff = { id: s.id, uid: s.id, ...s.data() };
  }
  return { uid, staff, system: false };
}

function toHttpsError(e) {
  if (e instanceof HttpsError) return e;
  if (e instanceof LogicError) return new HttpsError(e.code, e.message);
  logger.error(e);
  return new HttpsError('internal', 'Something went wrong. Please try again.');
}

const callable = (fn, opts = {}) => onCall({ enforceAppCheck: false, ...opts }, async (req) => {
  try { return await runLogic(fn, await contextFor(req), req.data); } catch (e) { throw toHttpsError(e); }
});

// ------------------------------------------------------------------ callables (shared logic)
export const verifyTable = callable(LOGIC.verifyTable);
export const placeOrder = callable(LOGIC.placeOrder);
export const updateOrderStatus = callable(LOGIC.updateOrderStatus);
export const recordPayment = callable(LOGIC.recordPayment);
export const submitPaymentReference = callable(LOGIC.submitPaymentReference);
export const verifyPayment = callable(LOGIC.verifyPayment);
export const registerCustomer = callable(LOGIC.registerCustomer);
export const updateProfile = callable(LOGIC.updateProfile);
export const dailyCheckIn = callable(LOGIC.dailyCheckIn);
export const redeemReward = callable(LOGIC.redeemReward);
export const adjustPoints = callable(LOGIC.adjustPoints);
export const markNotificationsRead = callable(LOGIC.markNotificationsRead);
export const regenerateTableToken = callable(LOGIC.regenerateTableToken);
export const setTableStatus = callable(LOGIC.setTableStatus);
export const logStaffActivity = callable(LOGIC.logStaffActivity);

// ------------------------------------------------------------------ staff accounts (Auth + profile)
export const createStaff = onCall(async (req) => {
  try {
    const ctx = await contextFor(req);
    if (!hasPerm(ctx.staff, 'staff')) throw new HttpsError('permission-denied', 'You do not have permission to manage staff.');
    const { uid, name, email, password, role, permissions, active, phone } = req.data || {};
    const auth = getAuth();
    let staffUid = uid;
    if (!staffUid) {
      if (!password || String(password).length < 6) throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
      const user = await auth.createUser({ email: String(email).trim().toLowerCase(), password: String(password), displayName: name });
      staffUid = user.uid;
    } else {
      const update = { displayName: name, disabled: active === false };
      if (password) update.password = String(password);
      await auth.updateUser(staffUid, update);
      if (active === false) await auth.revokeRefreshTokens(staffUid);
    }
    await runLogic(LOGIC.saveStaffProfile, ctx, { uid: staffUid, name, email, role, permissions, active, phone });
    return { uid: staffUid };
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Email already in use.');
    throw toHttpsError(e);
  }
});

// ------------------------------------------------------------------ online payment (Billplz)
export const createOnlinePayment = onCall({ secrets: [BILLPLZ_API_KEY] }, async (req) => {
  try {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
    const { orderId, returnUrl } = req.data || {};
    const [orderSnap, settingsSnap] = await Promise.all([db.collection('orders').doc(String(orderId)).get(), db.collection('settings').doc('general').get()]);
    const order = orderSnap.exists ? { id: orderSnap.id, ...orderSnap.data() } : null;
    const settings = settingsSnap.data() || {};
    if (!order || order.customerUid !== req.auth.uid) throw new HttpsError('not-found', 'Order not found.');
    if (order.paymentStatus === 'paid') throw new HttpsError('already-exists', 'Order already paid.');
    if (order.status === 'cancelled') throw new HttpsError('failed-precondition', 'Order is cancelled.');
    if (!settings.paymentMethods || !settings.paymentMethods.online) throw new HttpsError('failed-precondition', 'Online payment is not enabled.');
    if (!BILLPLZ_COLLECTION_ID.value()) throw new HttpsError('failed-precondition', 'Payment gateway is not configured.');

    const webhook = `https://${process.env.FUNCTION_REGION || 'asia-southeast1'}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/billplzWebhook`;
    const form = new URLSearchParams({
      collection_id: BILLPLZ_COLLECTION_ID.value(),
      email: order.customerEmail || settings.email || 'customer@example.com',
      name: order.customerName || 'Customer',
      amount: String(Math.round(order.total * 100)),            // amount always from the server-side order
      callback_url: webhook,
      redirect_url: String(returnUrl || ''),
      description: `${settings.restaurantName || 'SELAGI COFFEE'} order ${order.orderNo}`.slice(0, 200),
      reference_1_label: 'Order ID',
      reference_1: order.id,
    });
    const res = await fetch(`${billplzBase()}/api/v3/bills`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${BILLPLZ_API_KEY.value()}:`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const bill = await res.json();
    if (!res.ok) { logger.error('Billplz error', bill); throw new HttpsError('unavailable', 'Payment gateway error. Please pay at the counter.'); }
    await db.collection('orders').doc(order.id).set({ gatewayBillId: bill.id, paymentMethod: 'online', updatedAt: Date.now() }, { merge: true });
    return { url: bill.url };
  } catch (e) { throw toHttpsError(e); }
});

/** Billplz server-to-server callback. Order is marked paid ONLY here, after signature + API verification. */
export const billplzWebhook = onRequest({ secrets: [BILLPLZ_API_KEY, BILLPLZ_X_SIGNATURE] }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  try {
    const params = { ...req.body };
    const signature = String(params.x_signature || '');
    delete params.x_signature;
    const source = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('|');
    const expected = crypto.createHmac('sha256', BILLPLZ_X_SIGNATURE.value()).update(source).digest('hex');
    if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      logger.warn('Invalid Billplz signature');
      res.status(400).send('Invalid signature');
      return;
    }
    if (String(params.paid) !== 'true') { res.status(200).send('OK (not paid)'); return; }
    // Defence in depth: re-fetch the bill from Billplz rather than trusting the callback body.
    const r = await fetch(`${billplzBase()}/api/v3/bills/${encodeURIComponent(params.id)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${BILLPLZ_API_KEY.value()}:`).toString('base64')}` },
    });
    const bill = await r.json();
    if (!r.ok || bill.paid !== true || bill.state !== 'paid') { res.status(200).send('OK (unverified)'); return; }
    await runLogic(markGatewayPaid, { uid: null, staff: null, system: true }, {
      orderId: bill.reference_1, amount: Number(bill.paid_amount) / 100, reference: bill.id, billId: bill.id,
    });
    res.status(200).send('OK');
  } catch (e) {
    logger.error('webhook failed', e);
    res.status(500).send('Error');
  }
});
