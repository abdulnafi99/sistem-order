// =====================================================================
// Firebase backend (production)
// ---------------------------------------------------------------------
// Firestore real-time listeners + Firebase Auth + Storage + Cloud
// Functions (callable). All trusted operations (placing orders, prices,
// payments, points) go through Cloud Functions – see /functions.
// Customer and staff use separate Firebase app instances so a staff
// login on admin.html never replaces a customer session on index.html.
// =====================================================================

const V = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

export async function createFirebaseBackend(scope, config) {
  const [appMod, authMod, fsMod, fnMod, stMod] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
    import(`${CDN}/firebase-functions.js`),
    import(`${CDN}/firebase-storage.js`),
  ]);
  const { initializeApp, getApps } = appMod;
  const {
    getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut,
    EmailAuthProvider, linkWithCredential, createUserWithEmailAndPassword, sendPasswordResetEmail,
  } = authMod;
  const {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc, getDocs,
    onSnapshot, query, where, orderBy, limit, setDoc, deleteDoc,
  } = fsMod;
  const { getFunctions, httpsCallable } = fnMod;
  const { getStorage, ref, uploadBytes, getDownloadURL } = stMod;

  const appName = `tapjerr-${scope}`;
  const app = getApps().find((a) => a.name === appName) || initializeApp(config, appName);
  const auth = getAuth(app);
  let db;
  try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch { db = fsMod.getFirestore(app); }
  const functions = getFunctions(app, config.functionsRegion || 'asia-southeast1');
  const storage = getStorage(app);

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

  const callable = (name) => httpsCallable(functions, name);
  const normalizeError = (e) => {
    const err = new Error((e && e.message) || 'Something went wrong');
    err.code = (e && e.code ? String(e.code).replace('functions/', '') : 'unknown');
    return err;
  };

  return {
    mode: 'firebase',
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
            callable('logStaffActivity')({ action: 'auth.login', detail: 'Signed in' }).catch(() => {});
          }
          return current;
        } catch (e) { throw normalizeError(e); }
      },
      async register({ name, email, phone, password, referralCode }) {
        try {
          const cred = EmailAuthProvider.credential(String(email).trim(), password);
          if (auth.currentUser && auth.currentUser.isAnonymous) await linkWithCredential(auth.currentUser, cred);
          else await createUserWithEmailAndPassword(auth, String(email).trim(), password);
          await callable('registerCustomer')({ name, email, phone, referralCode });
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
      try { const res = await callable(name)(data); return res.data; } catch (e) { throw normalizeError(e); }
    },
    async upload(file, folder = 'uploads') {
      const { compressImage } = await import('./local-backend.js');
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
