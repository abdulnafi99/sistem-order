# TAPJERR.io – Smart QR Ordering & Management System

**TAPJERR.io** ialah platform pesanan QR untuk kafe & restoran. Demo menggunakan kafe contoh **SELAGI COFFEE** (nama, logo, menu dan alamat kafe boleh ditukar di *Admin → Settings*).

Aplikasi web **PWA** untuk restoran/kafe: pelanggan **scan QR di meja → lihat menu → tambah ke cart → checkout → jejak pesanan**, manakala pesanan masuk terus ke **Admin Dashboard** dan **Kitchen Display** secara *real-time*.

Dibina dengan **HTML5 + Vanilla CSS + Vanilla JavaScript** (tiada React/Vue/Bootstrap/Tailwind) dan **Firebase** (Auth, Firestore, Storage, Cloud Functions).

| Bahagian | URL | Untuk |
|---|---|---|
| Customer app | `index.html` | Pelanggan (mobile-first, boleh install ke home screen) |
| Admin dashboard | `admin.html` | Owner, Manager, Cashier, Waiter |
| Kitchen Display (KDS) | `kitchen.html` | Kitchen staff (tablet) |

**🔗 Demo online:** <https://abdulnafi99.github.io/sistem-order/> · [Admin](https://abdulnafi99.github.io/sistem-order/admin.html) · [Kitchen](https://abdulnafi99.github.io/sistem-order/kitchen.html)

Laman demo diterbitkan automatik ke GitHub Pages oleh `.github/workflows/pages-demo.yml` setiap kali ada push ke `main`. Ia sentiasa berjalan dalam **Demo mode**: setiap pelawat mendapat data contoh sendiri dalam browser mereka, dan perubahan seorang pelawat tidak kelihatan kepada pelawat lain. Persediaan sekali sahaja: repo **Settings → Pages → Source: GitHub Actions**.

## Identiti & UI

- **Jenama platform:** TAPJERR.io – logo apl, splash, ikon PWA, konsol admin & dapur, banner demo dan "Powered by TAPJERR.io" pada aplikasi pelanggan & resit.
- **Jenama kafe (contoh):** SELAGI COFFEE – nama, logo, hero, menu dan resit setiap kafe datang dari *Settings* kafe itu.
- **Palet:** Moss Green `#344E41`, Dark Green `#1D332B`, Cream `#F5F0E7`, Warm Beige `#E9DFD0`, Gold `#C7A66A`, Text `#28342E` – ditakrif sebagai CSS variables dalam `public/css/base.css`.
- **Tipografi:** Cormorant Garamond (tajuk & headline promosi), Poppins (menu, harga, dashboard).
- **Logo kafe:** placeholder SELAGI COFFEE terbina dalam; admin boleh muat naik logo rasmi di *Settings → Branding* (dipaparkan `object-fit: contain`, tidak diregang).
- **Navigasi pelanggan:** Singgah · Menu · Pesanan · Rewards · Account – floating pill dengan sliding indicator.
- **Admin:** sidebar (desktop boleh expand/collapse, tablet = icon rail, mobile = drawer) dengan latar aktif moss yang meluncur.
- **Kitchen Display:** segmented tabs New Orders · Preparing · Ready · Completed dengan counter beranimasi.
- Semua pertukaran halaman tanpa reload (hash routing), animasi 250–350ms `cubic-bezier(0.22, 1, 0.36, 1)`, dan menghormati `prefers-reduced-motion`.

---

## 1. Cuba sekarang (Demo mode – tanpa setup)

```bash
npm start            # atau: cd public && python3 -m http.server 8080
```

Buka:
- Admin: <http://localhost:8080/admin.html>
- Kitchen: <http://localhost:8080/kitchen.html>
- Customer: <http://localhost:8080/index.html>

Bila `js/config/firebase-config.js` masih kosong, sistem berjalan dalam **Demo mode**: data disimpan dalam browser (localStorage) dan disegerakkan **secara langsung antara tab** dalam browser yang sama (BroadcastChannel). Sample data (menu, 8 meja, rewards, 30 hari sejarah jualan) dijana automatik.

**Akaun demo staf**

| Peranan | Email | Kata laluan |
|---|---|---|
| Super Admin | admin@selagicoffee.my | admin123 |
| Manager | manager@selagicoffee.my | manager123 |
| Cashier | cashier@selagicoffee.my | cashier123 |
| Kitchen Staff | kitchen@selagicoffee.my | kitchen123 |
| Waiter | waiter@selagicoffee.my | waiter123 |

**Cuba aliran QR:** Admin → *Tables & QR* → klik QR mana-mana meja → *Test link*. Customer app akan buka dengan notifikasi *"Welcome to SELAGI COFFEE – Table 02"*. Buka admin dan kitchen di tab lain dan lihat pesanan masuk secara langsung (dengan bunyi).

> Demo mode hanya untuk satu peranti. Untuk operasi sebenar (telefon pelanggan, tablet dapur, PC kaunter) sila sambungkan Firebase – lihat bahagian 4.

---

## 2. Ciri-ciri utama

**Pelanggan**
- Home: hero banner, logo, greeting, tier & points, kad meja (QR Scanned), status pesanan semasa (live), promosi, featured & popular dishes, invite & earn, order history, *Add to Home Screen*.
- QR Table Ordering: setiap meja ada URL unik `?t=<tableId>&k=<token>`; token disahkan oleh backend. Nombor meja **dikunci** – pelanggan tidak boleh tukar meja secara manual (hanya "Leave table" dan scan semula). Boleh buat pesanan tambahan dalam sesi meja yang sama.
- Katalog: kategori (All Menu, Espresso Bar, Signature Lattes, Manual Brew, Cold Brew & Iced, Non-Coffee, Pastries & Cakes, Brunch & Bites, Coffee Beans), carian, gambar, harga RM, description, status Available/Sold out, stok harian ("3 left today"), variants, add-ons, kuantiti, special request, favourites.
- Cart & checkout: ubah kuantiti/buang item, Dine In (QR) atau Takeaway (nama, telefon, tarikh & masa pickup), special request, voucher, subtotal, service charge, SST, grand total, kaedah bayaran.
- Order tracking (live): Received → Confirmed → Preparing → Ready to Serve → Completed / Cancelled, dengan nombor pesanan, meja, butiran, jumlah, masa & status bayaran, cetak resit, batal (sebelum diterima dapur).
- Membership & Rewards: points, tier Classic/Silver/Gold/Platinum (rolling 90 hari, multiplier), daily check-in ring, rewards catalogue & redeem, My Vouchers, referral code + QR, points ledger, achievements, member QR untuk kaunter, profil (bonus profil lengkap).
- Notifikasi dalam app (loceng) + toast & bunyi apabila status pesanan berubah.

**Admin**
- Dashboard: Total Sales Today, Orders Today, Active, Completed, Pending, Total Customers, Average Order Value, Best Selling; graf Daily/Weekly/Monthly sales, Order Performance (+ purata masa dapur), Popular Menu, Payment Mix, status meja, live orders.
- Orders: semua pesanan real-time (tanpa refresh) + bunyi & pop-up pesanan baharu, tapis status/jenis/meja/tarikh, carian, confirm/update status, cancel (dengan sebab), rekod bayaran, cetak resit, timeline.
- Menu: tambah/edit/padam, upload gambar (auto-resize), harga, kategori, description, variants, add-ons/extra toppings, Available/Sold out, Featured, stok harian, tags; urus kategori.
- Tables & QR: tambah/edit/padam meja, QR unik, download PNG, print (satu/semua), regenerate QR (QR lama terus tidak sah), status meja (Available, Occupied, Has Active Order, Waiting for Payment, Cleaning) + ringkasan sesi.
- Customers: senarai (nama, telefon, email, jumlah order, jumlah belanja, tier, points, tarikh daftar), profil + order history + ledger, adjust points, export CSV.
- Payments: Cash / DuitNow QR / Online (Billplz). Rekod tunai (kira baki), verify/reject DuitNow, senarai belum bayar, payment history, resit, CSV.
- Rewards: tetapan kadar points, tier, bonus referral/check-in/profil; rewards catalogue CRUD; senarai voucher dikeluarkan.
- Staff: cipta akaun, assign role, permissions tersuai, aktif/nyahaktif, log aktiviti staf.
- Reports: Daily & Monthly sales, Total revenue, Food vs Beverage, Payment breakdown, Best sellers, Cancelled orders, service charge & SST; **Export CSV** dan **Export PDF** (print → *Save as PDF*).
- Settings: profil restoran, logo, banner, jam operasi, terima/hentikan pesanan, service charge %, SST %, masa pickup, prefix nombor order, kaedah bayaran, DuitNow QR, promosi, URL awam untuk QR.

**Kitchen Display (KDS)**
- Lajur New Orders / Preparing / Ready / Completed (tab di telefon), kad dengan nombor order, meja, masa, item, kuantiti, variant/add-on, special request, pemasa (merah jika > 15 min).
- Butang Accept Order → Start Preparing → Mark as Ready → Complete Order, bunyi + kelip tajuk untuk pesanan baharu, tanda item siap (strike), cetak tiket 80mm, fullscreen.

**PWA**: manifest, ikon (termasuk maskable), service worker (app-shell cache), offline fallback (`offline.html`), loading/splash screen, responsif untuk Android, iPhone, iPad, tablet Android dan desktop.

---

## 3. Seni bina & keselamatan

```
public/
  index.html  admin.html  kitchen.html  offline.html  sw.js  manifest.webmanifest
  css/        base.css (design system) · customer.css · admin.css · kitchen.css
  js/config/  firebase-config.js           ← isi untuk mod production
  js/core/
    pricing.js        ← enjin harga (sen/integer) – satu sumber kebenaran
    server-logic.js   ← SEMUA peraturan bisnes yang dipercayai (order, status, bayaran, points, staf)
    api.js            ← pilih backend: Firebase atau Demo
    firebase-backend.js · local-backend.js · ui.js · charts.js · art.js · seed.js
  js/customer/ js/admin/ js/kitchen/
functions/
  index.js           ← Cloud Functions: jalankan server-logic.js dalam Firestore transaction
  shared/            ← salinan pricing.js, server-logic.js, seed.js (`npm run sync`)
  seed.mjs           ← bootstrap projek Firebase baharu + Super Admin pertama
firestore.rules · firestore.indexes.json · storage.rules · firebase.json
tests/logic.test.mjs ← ujian peraturan bisnes (node --test)
```

**Satu logik, dua backend.** `server-logic.js` dijalankan oleh Cloud Functions (production) dan oleh demo backend. Jadi peraturan harga, QR, bayaran dan points adalah sama di kedua-dua mod.

**Kawalan keselamatan**
- **Harga disahkan di backend**: `placeOrder` mengabaikan sebarang harga daripada klien dan mengira semula daripada koleksi `menu` (variant, add-on, voucher, service charge, SST) dalam unit sen.
- **Pelanggan tidak boleh tulis** `orders`, `payments`, `vouchers`, `loyalty_transactions`, `notifications`, points atau tier – `firestore.rules` menolak semua tulisan; hanya Cloud Functions (Admin SDK) boleh.
- **QR table ID disahkan**: setiap meja ada token rahsia (koleksi `tables` hanya boleh dibaca staf). Token disemak pada `verifyTable` dan sekali lagi pada setiap `placeOrder`. *Regenerate QR* membatalkan QR lama.
- **Bayaran tidak ditanda berjaya hanya kerana pelanggan tekan butang**: DuitNow → `pending_verification` sehingga cashier sahkan; Online → hanya webhook Billplz (tandatangan HMAC disahkan **dan** bil disemak semula melalui API Billplz, jumlah mesti sama) boleh tanda `paid`.
- **Role-based access**: Super Admin, Manager, Cashier, Kitchen Staff, Waiter + permissions per staf, dikuatkuasakan dalam Functions, rules dan UI. Hanya Super Admin boleh cipta Super Admin. Staf dinyahaktif → akaun Auth `disabled` + token dibatalkan.
- **Data peribadi**: profil pelanggan hanya boleh dibaca oleh pemilik dan staf berkenaan; pelanggan hanya boleh ubah `favorites`/`avatar` secara terus.
- Status transition dikawal (contoh: tidak boleh lompat dari Received ke Ready); setiap order ada ID & nombor unik (`EH-YYMMDD-###`) melalui counter transaksional.
- Customer & staff guna instance Firebase app berasingan supaya login staf tidak menggantikan sesi pelanggan dalam browser yang sama.

**Koleksi Firestore**: `users, staff, settings (restaurant profile), tables, menu, categories, orders, order_items, payments, rewards, vouchers, loyalty_transactions, notifications, staff_activity, counters`.

---

## 4. Setup production (Firebase)

1. Cipta projek di <https://console.firebase.google.com> dan naik taraf ke pelan **Blaze** (diperlukan untuk Cloud Functions).
2. **Authentication** → Sign-in method → aktifkan **Email/Password** dan **Anonymous**.
3. Cipta **Firestore Database** (region `asia-southeast1` disyorkan) dan **Storage**.
4. Project settings → *Your apps* → tambah Web app → salin config ke `public/js/config/firebase-config.js`.
5. Isi Project ID dalam `.firebaserc` (`{ "projects": { "default": "<project-id>" } }`).
6. Deploy – pilih **A** (GitHub Actions, disyorkan) atau **B** (dari komputer sendiri).

### A. Deploy dengan GitHub Actions

Workflow `.github/workflows/firebase-deploy.yml` deploy rules, indexes, Storage rules, Cloud Functions dan Hosting. Buat masa ini ia dijalankan **secara manual** sahaja (tab Actions → *Deploy to Firebase* → *Run workflow*) kerana laman awam ialah demo. Untuk deploy automatik setiap push, tambah `push: { branches: [main] }` di bawah `on:` dalam workflow itu.

**a) Cipta service account untuk deploy** – di <https://console.cloud.google.com/iam-admin/serviceaccounts?project=PROJECT_ID>:
1. **Create service account**, nama `github-deploy`.
2. Beri role berikut: **Firebase Admin**, **Cloud Functions Admin**, **Cloud Run Admin**, **Service Account User**, **Artifact Registry Administrator**, **Cloud Build Editor**, **Secret Manager Viewer**, **Service Usage Consumer**.
3. Buka service account itu → **Keys → Add key → Create new key → JSON**. Fail JSON akan dimuat turun.

**b) Simpan dalam GitHub** – repo → **Settings → Secrets and variables → Actions → New repository secret**:
| Nama | Nilai |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Seluruh kandungan fail JSON tadi |
| `ADMIN_EMAIL` | Email Super Admin pertama |
| `ADMIN_PASSWORD` | Kata laluan Super Admin pertama (min 6 aksara) |

Jangan commit fail JSON itu ke repo, dan padamkan salinan di komputer selepas disimpan dalam GitHub.

**c) Deploy pertama + seed** – tab **Actions → Deploy to Firebase → Run workflow**, tandakan **seed**, kemudian **Run**. Langkah seed mencipta menu, meja, rewards, settings dan akaun Super Admin (selamat dijalankan semula; dokumen sedia ada tidak ditimpa). 

Laman akan berada di `https://<project-id>.web.app` (customer), `/admin.html` dan `/kitchen.html`.

Jika deploy gagal dengan ralat `permission denied` / `PERMISSION_DENIED`, log Actions akan menamakan role yang kurang – tambah role itu pada service account dan jalankan semula.

### B. Deploy dari komputer sendiri
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add            # pilih projek anda
   cd functions && npm install && cd ..
   npm run deploy                # rules, indexes, storage, functions, hosting
   ```
   Seed data awal & Super Admin pertama (service account: Project settings → Service accounts → Generate key):
   ```bash
   cd functions
   export GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json
   FIREBASE_PROJECT=your-project-id ADMIN_EMAIL=owner@kafe.my ADMIN_PASSWORD='KataLaluanKuat!' npm run seed
   ```
### Selepas deploy
Log masuk ke `admin.html`, kemas kini **Settings** (nama, logo, alamat, SST, DuitNow QR), **Menu** (gambar sebenar) dan **Tables & QR** → *Print all QR* untuk dilekat di meja. Jika domain pelanggan berbeza, isi *Public customer URL for QR codes*.

### Payment gateway (Billplz – FPX/kad)
```bash
firebase functions:secrets:set BILLPLZ_API_KEY
firebase functions:secrets:set BILLPLZ_X_SIGNATURE
# functions/.env  (bukan rahsia)
BILLPLZ_COLLECTION_ID=xxxxxxxx
BILLPLZ_SANDBOX=true          # false untuk live
firebase deploy --only functions
```
Di Billplz, aktifkan *X Signature*. Callback URL dijana automatik: `https://asia-southeast1-<project>.cloudfunctions.net/billplzWebhook`. Kemudian aktifkan *Online payment* dalam Admin → Settings.

Jika guna GitHub Actions: selepas kedua-dua secret Billplz wujud dalam Secret Manager, tambah **variable** repo `BILLPLZ_ENABLED` = `true` (Settings → Secrets and variables → Actions → Variables). Sebelum itu, workflow sengaja melangkau fungsi `createOnlinePayment` dan `billplzWebhook` supaya deploy tidak gagal kerana secret belum wujud.

---

## 5. Ujian

```bash
npm test     # 11 ujian: harga, token QR, harga dimanipulasi, aliran status, kebenaran, bayaran, points, voucher, referral, staf
```
Ujian juga memastikan salinan `functions/shared/` sama dengan `public/js/core/` (jalankan `npm run sync` selepas mengubah logik).

## 6. Nota
- Gambar menu demo ialah ilustrasi SVG; muat naik gambar sebenar melalui Admin → Menu.
- Eksport PDF menggunakan dialog cetak browser (*Save as PDF*) supaya tiada library tambahan.
- Sample data hanya untuk demo awal; dalam mod Firebase hanya data yang anda seed/cipta digunakan.
