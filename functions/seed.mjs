// =====================================================================
// Bootstrap a fresh Firebase project with the initial menu, tables,
// rewards, settings and the first Super Admin account.
//
//   cd functions && npm install
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   ADMIN_EMAIL=owner@yourcafe.my ADMIN_PASSWORD='StrongPass!23' npm run seed
//
// Safe to re-run: existing documents are not overwritten unless FORCE=1.
// =====================================================================
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { DEFAULT_SETTINGS, CATEGORIES, MENU, TABLES, REWARDS } from './shared/seed.js';
import { ROLES, newTableToken } from './shared/server-logic.js';

initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT });
const db = getFirestore();
const force = process.env.FORCE === '1';
const now = Date.now();

async function put(col, id, data) {
  const ref = db.collection(col).doc(id);
  if (!force && (await ref.get()).exists) { console.log(`  skip ${col}/${id}`); return; }
  await ref.set({ ...data, id, createdAt: data.createdAt || now, updatedAt: now });
  console.log(`  wrote ${col}/${id}`);
}

console.log('Seeding settings, categories, menu, tables, rewards…');
await put('settings', 'general', DEFAULT_SETTINGS);
for (const c of CATEGORIES) await put('categories', c.id, c);
for (const m of MENU) await put('menu', m.id, { ...m, soldCount: 0 });
for (const t of TABLES) await put('tables', t.id, { ...t, token: newTableToken() });
for (const r of REWARDS) await put('rewards', r.id, r);

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (email && password) {
  const auth = getAuth();
  let user;
  try {
    // Existing account (e.g. the same email was used before): make sure it can sign in with
    // ADMIN_PASSWORD and is not disabled, otherwise the secret's password would never work.
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, { password, disabled: false });
    console.log('  existing account found – password set from ADMIN_PASSWORD');
  } catch (e) {
    if (e && e.code && e.code !== 'auth/user-not-found') throw e;
    user = await auth.createUser({ email, password, displayName: 'Owner' });
    console.log('  new account created');
  }
  await db.collection('staff').doc(user.uid).set({
    id: user.uid, uid: user.uid, name: process.env.ADMIN_NAME || 'Owner', email: email.toLowerCase(), role: 'super_admin',
    permissions: ROLES.super_admin.permissions, active: true, createdAt: now, updatedAt: now,
  }, { merge: true });
  console.log(`Super Admin ready: ${email}`);
} else {
  console.log('Tip: set ADMIN_EMAIL and ADMIN_PASSWORD to create the first Super Admin.');
}
console.log('Done.');
process.exit(0);
