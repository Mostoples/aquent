# AQUENT — Admin Setup & Demo Data

Panduan singkat untuk: (1) bootstrap admin pertama, (2) deploy rules baru, (3) seed demo data untuk testing halaman admin.

## 1. Prasyarat

- `service-account.json` di root project (sudah ada)
- `firebase-admin` package — sudah ter-install di `functions/node_modules/`. Kalau belum:
  ```bash
  cd functions
  npm install
  cd ..
  ```

## 2. Set Admin Pertama

User yang ingin dijadikan admin harus **sudah pernah login** sekali agar UID-nya ada di Firebase Auth.

```bash
node setup-admin.js email-anda@example.com
# atau
node setup-admin.js abc123uid456...
```

Script akan set 3 hal:
- Firestore `users/{uid}.role = 'admin'`
- RTDB `meta/admins/{uid} = true` (untuk database rules)
- Auth custom claim `{admin: true}` (untuk Cloud Functions nanti)

**Penting**: kalau user tersebut sedang login, **logout dan login ulang** agar token Auth refresh dengan claim baru.

## 3. Deploy Rules Baru

Halaman admin baru butuh rules `meta/admins/`. Wajib deploy:

```bash
firebase deploy --only database --project aquent-id
firebase deploy --only firestore:rules --project aquent-id
```

## 4. Seed Demo Data (opsional, untuk testing)

Generate data fake yang realistic untuk lihat halaman analytics & insights bekerja:

```bash
# Default: 20 users × 30 hari sessions + 30 surveys + 4 pengumuman
node seed-demo-data.js

# Customize jumlah
node seed-demo-data.js --users=50 --days=14 --surveys=100

# Hanya seed 1 kategori
node seed-demo-data.js --only=surveys
node seed-demo-data.js --only=announcements

# Hapus demo lama dulu, baru seed ulang
node seed-demo-data.js --clear
```

Demo data ditandai dengan UID prefix `demo_user_xxx` dan field `isDemoUser: true` (di Firestore) atau `createdBy: 'demo-seed'` (di announcements). Aman dari data real.

### Hapus semua demo data

```bash
node seed-demo-data.js --clear --only=nothing
```

Atau buka Firebase Console manual → Database → cari node yang prefix-nya `demo_user_`.

### Login sebagai user demo

Setelah `node seed-demo-data.js` jalan, kamu bisa login dengan akun-akun demo via `/login.html`:

| Email | Password | Role |
|---|---|---|
| `demo0@aquent.test` ... `demo2@aquent.test` | `demo123456` | Premium |
| `demo3@aquent.test` ... `demo4@aquent.test` | `demo123456` | Ultimate |
| `demo5@aquent.test` ... `demo19@aquent.test` | `demo123456` | Free |

Berguna untuk: test multi-profile, test push notification, lihat dashboard sebagai user biasa, demo end-to-end ke supervisor / penguji.

## 5. Deploy Hosting

```bash
deploy.bat
```

## 6. Test Flow

1. Buka `https://aquent-id.web.app/login.html`
2. Login dengan akun yang sudah di-set admin
3. Akan auto-redirect ke `/admin.html`
4. Klik tab **Survey Analytics** → harus tampil SUS, TAM, XAI Trust
5. Klik tab **Session Insights** → harus tampil hour-bar chart, grade distribution
6. Klik tab **Live Sensors** → harus tampil pH/temp/turbidity (kalau sensors/ ada data)
7. Klik tab **Pengumuman** → buat pengumuman → buka `/app.html` di tab lain → banner muncul

## Troubleshooting

### "Permission denied" saat baca surveys di admin
- Pastikan rules sudah ter-deploy (`firebase deploy --only database`)
- Pastikan `meta/admins/{uid} = true` ada di RTDB (cek di Firebase Console)
- Logout-login ulang untuk refresh token

### `setup-admin.js` error "User not found"
- User belum daftar via `/login.html`. Suruh user login dulu sekali.

### Halaman admin redirect ke `/app.html`
- Role di Firestore belum `admin`. Cek di Firestore Console: `users/{uid}.role`.
- Atau script setup-admin.js belum dijalankan dengan UID yang benar.

### Demo data tidak muncul di halaman admin
- Pastikan `meta/admins/{uid} = true` set untuk admin yang sedang login (admin baca semua sessions/surveys via root rules).
- Hard refresh browser (Ctrl+Shift+R) untuk clear cache.

## File yang Tidak Akan Ter-deploy

Untuk keamanan, file ini di-ignore di `firebase.json`:
- `service-account.json` — kunci admin Firebase, JANGAN commit ke git
- `setup-admin.js` — script setup
- `seed-demo-data.js` — script seed
- `PLANNING*.md`, `RESEARCH.md`, `ADMIN_SETUP.md`
