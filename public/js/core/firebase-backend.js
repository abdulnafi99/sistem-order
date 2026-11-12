// =====================================================================
// Firebase backend (production)
// ---------------------------------------------------------------------
// Firestore real-time listeners + Firebase Auth, in one of two modes:
//  • useCloudFunctions: true  – trusted operations (orders, prices,
//    payments, points) run in Cloud Functions (Blaze plan) – see /functions.
//  • useCloudFunctions: false – "Firestore only" (works on the free Spark
//    plan): the SAME business rules (server-logic.js) run in the browser
//    inside a Firestore transaction, images are stored inline, and
//    firestore.rules limit what each user may write. Data is still shared
//    live across every device.
// Customer and staff use separate Firebase app instances so a staff
// login on admin.html never replaces a customer session on index.html.
// =====================================================================

const V = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

export async function createFirebaseBackend(scope, config) {
  const useFunctions = config.useCloudFunctions !== false;
  const [appMod, authMod, fsMod, fnMod, stMod] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
    useFunctions ? import(`${CDN}/firebase-functions.js`) : null,
    useFunctions ? import(`${CDN}/firebase-storage.js`) : null,
  ]);
  const { initializeApp, getApps } = appMod;
  const {
    getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut,
    EmailAuthProvider, linkWithCredential, createUserWithEmailAndPassword, sendPasswordResetEmail,
  } = authMod;
  const {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc, getDocs,
    onSnapshot, query, where, orderBy, limit, setDoc, deleteDoc, runTransaction,
  } = fsMod;

  const appName = `tapjerr-${scope}`;
  const app = getApps().find((a) => a.name === appName) || initializeApp(config, appName);
  const auth = getAuth(app);
  let db;
  try { db = initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch { db = fsMod.getFirestore(app); }
  // Local development / tests against the Firebase emulators (firebase emulators:start):
  //   emulators: { auth: 'http://127.0.0.1:9099', firestore: '127.0.0.1:8081' }
  if (config.emulators) {
    if (config.emulators.auth) authMod.connectAuthEmulator(auth, config.emulators.auth, { disableWarnings: true });
    if (config.emulators.firestore) { const [h, p] = String(config.emulators.firestore).split(':'); fsMod.connectFirestoreEmulator(db, h, Number(p)); }
  }
  const functions = useFunctions ? fnMod.getFunctions(app, config.functionsRegion || 'asia-southeast1') : null;
  const storage = useFunctions ? stMod.getStorage(app) : null;

  const buildQuery = (name, opts = {}) => {
    const parts = [];
    (opts.where || []).forEach(([f, op, v]) => parts.push(where(f, op, v)));
    if (opts.orderBy) parts.push(orderBy(opts.orderBy[0], opts.orderBy[1] || 'asc'));
    if (opts.limit) parts.push(limit(opts.limit));
    return query(collection(db, name), ...parts);
  };
  const snapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // ---- auth state with staff/customer profile resolution ----
  let current = null;
  let profileUnsub = null;
  const authListeners = new Set();
  const fireAuth = () => authListeners.forEach((cb) => cb(current));
  let ready;
  const readyP = new Promise((r) => { ready = r; });

  onAuthStateChanged(auth, (u) => {
    if (profileUnsub) { profileUnsub(); profileUnsub = null; }
    if (!u) { current = null; fireAuth(); ready(); return; }
    const base = { uid: u.uid, email: u.email, isAnonymous: u.isAnonymous };
    const path = scope === 'staff' ? doc(db, 'staff', u.uid) : doc(db, 'users', u.uid);
    profileUnsub = onSnapshot(path, (snap) => {
      const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      if (scope === 'staff') current = data && data.active !== false ? { ...base, staff: data } : null;
      else current = { ...base, profile: data };
      fireAuth(); ready();
    }, () => { current = scope === 'staff' ? null : { ...base, profile: null }; fireAuth(); ready(); });
  });
  await Promise.race([readyP, new Promise((r) => setTimeout(r, 4000))]);

  const normalizeError = (e) => {
    const code = e && e.code ? String(e.code).replace('functions/', '').replace('firestore/', '') : 'unknown';
    const raw = (e && e.message) || 'Something went wrong';
    const msg = /missing or insufficient permissions/i.test(raw) ? 'You do not have permission to do that.' : raw;
    const err = new Error(msg);
    err.code = code;
    return err;
  };

  // ---- Firestore-only mode: run the shared business rules in a transaction ----
  let logicMod = null;
  const loadLogic = async () => (logicMod = logicMod || await import('./server-logic.js'));
  const logicContext = () => {
    const u = auth.currentUser;
    const staff = scope === 'staff' && current && current.staff ? { ...current.staff, uid: current.uid, id: current.uid } : null;
    return { uid: u ? u.uid : null, staff, system: false };
  };
  async function runLocal(fn, data) {
    return runTransaction(db, async (tx) => {
      const writes = [];
      const adapter = {
        async get(col, id) {
          const snap = await tx.get(doc(db, col, String(id)));
          return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        },
        // Transactions in the web SDK read single documents only, so queries are read just
        // before the writes. A query the rules don't allow for this user counts as "no results".
        async query(col, whereList = []) {
          try { return snapDocs(await getDocs(buildQuery(col, { where: whereList }))); }
          catch (e) { if (e && e.code === 'permission-denied') return []; throw e; }
        },
        set(col, id, value) { writes.push(['set', col, id, value]); },
        update(col, id, value) { writes.push(['merge', col, id, value]); },
        newId(col) { return doc(collection(db, col)).id; },
      };
      const result = await fn(adapter, { ...logicContext(), now: Date.now() }, data || {});
      for (const [kind, col, id, value] of writes) {
        const r = doc(db, col, String(id));
        if (kind === 'set') tx.set(r, { ...value, id: String(id) });
        else tx.set(r, value, { merge: true });
      }
      return result;
    });
  }
  // Staff accounts without the Admin SDK: create the Auth user from a secondary app instance
  // so the signed-in admin stays signed in, then save the staff profile.
  async function createStaffLocal(data) {
    const { LOGIC, LogicError } = await loadLogic();
    const { uid, name, email, password, role, permissions, active, phone } = data || {};
    let staffUid = uid;
    if (!staffUid) {
      if (!password || String(password).length < 6) throw new LogicError('invalid-argument', 'Password must be at least 6 characters.');
      const helper = getApps().find((a) => a.name === 'tapjerr-staff-create') || initializeApp(config, 'tapjerr-staff-create');
      const helperAuth = getAuth(helper);
      if (config.emulators && config.emulators.auth && !helperAuth.emulatorConfig) authMod.connectAuthEmulator(helperAuth, config.emulators.auth, { disableWarnings: true });
      try {
        const cred = await createUserWithEmailAndPassword(helperAuth, String(email).trim().toLowerCase(), String(password));
        staffUid = cred.user.uid;
      } catch (e) {
        if (e && e.code === 'auth/email-already-in-use') throw new LogicError('already-exists', 'Email already in use.');
        throw e;
      } finally { await signOut(helperAuth).catch(() => {}); }
    } else if (password) {
      throw new LogicError('failed-precondition', 'Passwords of other staff can only be changed with Cloud Functions. Ask them to use “Forgot password” on the sign-in screen.');
    }
    await runLocal(LOGIC.saveStaffProfile, { uid: staffUid, name, email, role, permissions, active, phone });
    return { uid: staffUid };
  }
  async function callBackend(name, data = {}) {
    if (useFunctions) return (await fnMod.httpsCallable(functions, name)(data)).data;
    const { LOGIC, LogicError } = await loadLogic();
    if (name === 'createStaff') return createStaffLocal(data);
    if (name === 'createOnlinePayment') throw new LogicError('unavailable', 'Online payment needs Cloud Functions. Please pay by cash or DuitNow.');
    if (!LOGIC[name]) throw new LogicError('not-found', `Unknown action: ${name}`);
    return runLocal(LOGIC[name], data);
  }

  return {
    mode: 'firebase',
    firestoreOnly: !useFunctions,
    scope,
    auth: {
      get user() { return current; },
      onChange(cb) { authListeners.add(cb); cb(current); return () => authListeners.delete(cb); },
      async ensureGuest() {
        if (!auth.currentUser) await signInAnonymously(auth);
        await new Promise((r) => setTimeout(r, 50));
        return current || { uid: auth.currentUser.uid, isAnonymous: true, profile: null };
      },
      async login(email, password) {
        try {
          const cred = await signInWithEmailAndPassword(auth, String(email).trim(), password);
          if (scope === 'staff') {
            const s = await getDoc(doc(db, 'staff', cred.user.uid));
            if (!s.exists() || s.data().active === false) { await signOut(auth); throw Object.assign(new Error('This account is not an active staff account.'), { code: 'permission-denied' }); }
            callBackend('logStaffActivity', { action: 'auth.login', detail: 'Signed in' }).catch(() => {});
          }
          return current;
        } catch (e) { throw normalizeError(e); }
      },
      async register({ name, email, phone, password, referralCode }) {
        try {
          const cred = EmailAuthProvider.credential(String(email).trim(), password);
          if (auth.currentUser && auth.currentUser.isAnonymous) await linkWithCredential(auth.currentUser, cred);
          else await createUserWithEmailAndPassword(auth, String(email).trim(), password);
          await callBackend('registerCustomer', { name, email, phone, referralCode });
          return current;
        } catch (e) { throw normalizeError(e); }
      },
      async resetPassword(email) { await sendPasswordResetEmail(auth, String(email).trim()); },
      async logout() { await signOut(auth); },
    },

    watch(name, opts, cb, onError) {
      return onSnapshot(buildQuery(name, opts), (snap) => cb(snapDocs(snap)), (e) => { console.warn(`watch ${name}`, e); onError && onError(e); });
    },
    watchDoc(name, id, cb) {
      return onSnapshot(doc(db, name, id), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), (e) => console.warn(e));
    },
    async list(name, opts) { return snapDocs(await getDocs(buildQuery(name, opts))); },
    async get(name, id) { const s = await getDoc(doc(db, name, id)); return s.exists() ? { id: s.id, ...s.data() } : null; },
    async save(name, id, data) {
      const ref2 = id ? doc(db, name, id) : doc(collection(db, name));
      const now = Date.now();
      const payload = { ...data, id: ref2.id, updatedAt: now };
      if (!id) payload.createdAt = now;
      if (name === 'tables' && !id && !payload.token) payload.token = randomToken();
      await setDoc(ref2, payload, { merge: true });
      return ref2.id;
    },
    async remove(name, id) { await deleteDoc(doc(db, name, id)); },
    async call(name, data = {}) {
      try { return await callBackend(name, data); } catch (e) { throw normalizeError(e); }
    },
    async upload(file, folder = 'uploads') {
      const { compressImage } = await import('./local-backend.js');
      // Firestore-only: keep the image inline (a Firestore document holds up to 1 MB).
      if (!useFunctions) return compressImage(file, 900, 0.75);
      const { ref, uploadBytes, getDownloadURL } = stMod;
      const dataUrl = await compressImage(file, 1200, 0.82);
      const blob = await (await fetch(dataUrl)).blob();
      const r = ref(storage, `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
      await uploadBytes(r, blob, { contentType: 'image/jpeg' });
      return getDownloadURL(r);
    },
    async resetDemo() { /* not available in production */ },
  };
}

function randomToken(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(len); crypto.getRandomValues(arr);
  return [...arr].map((n) => chars[n % chars.length]).join('');
}
