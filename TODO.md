# AQUENT — Task List & Roadmap

**Audit:** 2026-05-29 | **Status:** Pre-deployment polish

Dokumen ini merangkum semua yang sudah jadi, yang setengah jadi, dan yang belum. Disusun berdasarkan audit langsung pada `app.html`, `app.js`, `admin.html`, `admin.js`, dan rules Firebase.

---

## 1. Halaman yang Sudah Ada

### App Pengguna (`/app.html`) — 11 section
| Section | Status | Catatan |
|---|---|---|
| Dashboard | ✅ Lengkap | Real-time sensor + Quality Score + XAI |
| AI Konsultan | ✅ Lengkap | Gemini frontend (perlu user input API key) |
| Skin Scanner | ✅ Lengkap | TFJS lokal → Gemini → Demo (tiered fallback) |
| Eco-Monitor | ✅ Lengkap | Chart.js daily + weekly |
| Dermal-Guide | ✅ Lengkap | Per skin-type × kondisi air |
| Smart Control | ✅ Lengkap | 4 toggle (Recirc/Filter/Eco/Heating) |
| Scheduler | ✅ Lengkap | Reminder ke RTDB |
| Riwayat Sesi (P6) | ✅ Lengkap | Sync Firebase + auto-save 5 mnt |
| Pencapaian (P7) | ✅ Lengkap | 8 badge dari `data/badges.json` |
| Rekomendasi Produk (P8) | ✅ Lengkap | Rules engine |
| Ensiklopedia (P9) | ✅ Lengkap | Search + filter |

### Admin Panel (`/admin.html`) — 9 section
| Section | Status | Catatan |
|---|---|---|
| Overview | ✅ | Stats + User Growth Chart + Recent Users |
| Manajemen User | ✅ | Search, filter, ubah role, klik baris → detail modal |
| Paket & Harga | ✅ | 3 tier dengan jumlah aktif |
| Survei (P15) | ✅ | Tabel raw + Export CSV |
| Survey Analytics | ✅ | SUS, TAM (PU/PEOU/ATU/BIU), XAI Trust, Open-ended |
| Session Insights | ✅ | Chart hourly + grade distribution + date filter |
| Live Sensors | ✅ | Real-time pH/Temp/Turbidity |
| Pengumuman | ✅ | Broadcast dengan 4 tipe |
| Audit Log | ✅ | Immutable activity history |

### Halaman Marketing & Akademik
| Halaman | Status | Catatan |
|---|---|---|
| `index.html` (Company Profile) | ✅ | Sudah ada (milik tab Peneliti) |
| `slr.html` (SLR Akademik) | ✅ | PRISMA, matriks, gap analysis |
| `login.html` (Login/Register) | ✅ | Email + Google OAuth |
| `404.html` (Error) | ✅ | Sudah ada |

---

## 2. Halaman yang Belum/Baru Dikerjakan

### A. ~~Onboarding Halaman Tersendiri~~ — Modal existing cukup
- **Status:** ✅ Modal sudah ada, full-page tidak diperlukan untuk MVP

### B. ~~Profile / Pengaturan Akun~~ — ✅ DONE
- ✅ **`/account.html`** — full edit profil + GDPR export + reset password + hapus akun
- ✅ Stats mini: jumlah sesi, survey, profil
- ✅ Audit info: tanggal bergabung, login terakhir, email verified
- ✅ Zona berbahaya dengan double confirmation untuk hapus akun

### C. ~~Halaman Bantuan / FAQ~~ — ✅ DONE
- ✅ **`/help.html`** — FAQ search + 5 section (Memulai, Fitur, Privasi, Troubleshooting, Kontak)
- ✅ Quick links cards ke akun, privasi, dashboard, beranda
- ✅ 14+ pertanyaan umum + jawaban lengkap

### D. Halaman Order & Subscription
- [ ] **`/upgrade.html` atau modal upgrade** — saat ini cuma `openUpgradeModal()` di app.js, tapi belum implement payment gateway
- **Prioritas:** Rendah — bukan MVP untuk paper akademik
- **Stack yang dibutuhkan:**
  - Midtrans / Xendit / Stripe integration
  - Webhook handler (perlu Cloud Functions = Blaze)
  - Riwayat pembayaran

### E. ~~Halaman Reset Password~~ — Pakai default Firebase
- **Status:** ✅ Reset email dikirim via `firebase.auth().sendPasswordResetEmail()` dari `/account.html`
- Custom email template bisa diatur di Firebase Console → Authentication → Templates (opsional)

### F. ~~Halaman Privasi~~ — ✅ DONE
- ✅ **`/privacy.html`** — UU PDP No.27/2022 + GDPR compliant
- ✅ 11 section: data collected, purposes, processing, sharing, hak user, retention, security, children, cookies, updates, contact

### G. Halaman Komunitas / Forum
- [ ] **`/community.html`** — forum diskusi user, share tips, before-after photo
- **Prioritas:** Rendah — bukan core feature

---

## 3. Fitur yang Berfungsi Setengah / Mock

### A. AI Chat Gemini
- **Status:** ⚠ User harus input API key sendiri di Settings (key kebongkar di network tab)
- **Solusi proper:** Deploy Cloud Functions di `functions/index.js` (sudah siap, tinggal upgrade Blaze)
- **Workaround tanpa Blaze:**
  - [ ] Pindah ke Hugging Face Inference API (gratis, butuh user token)
  - [ ] Atau pakai Cloudflare Workers AI (free tier 10k req/hari)
  - [ ] Atau biarkan user input key sendiri

### B. FCM Push Notifications
- **Status:** ⚠ VAPID key belum di-set (`window.FCM_VAPID_KEY = ''`)
- **Yang harus dikerjakan:**
  - [ ] Generate VAPID key di Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
  - [ ] Paste ke `app.html`: `window.FCM_VAPID_KEY = 'BAbcdef...'`
  - [ ] Test dari admin → user dapat push real
- **Saat ini:** Notifikasi lokal jalan (in-tab) tapi push remote ke device offline tidak.

### C. Skin Scanner — ✅ FULL LOCAL ML
- **Status:** ✅ 100% client-side, tanpa Gemini, tanpa cloud API
- **Pipeline:**
  - TensorFlow.js custom model (EfficientNetB0 transfer learning)
  - Pixel analysis deterministik (saturation, redness, oiliness, texture, sharpness)
  - Kombinasi keduanya untuk hasil + XAI factor attribution
- **Yang harus dikerjakan untuk akurasi maksimal:**
  - [ ] Train model via Colab (`models/skin-classifier/TRAIN_COLAB.md`) — ~45 mnt
  - [ ] Drop file ke `models/skin-classifier/`
  - [ ] Test pakai `models/skin-classifier/test.html`
  - [ ] Re-deploy hosting
- **Catatan:** Tanpa model file, pixel analysis tetap jalan (deterministik) sebagai fallback. Aplikasi tidak akan error.

### D. Custom Domain & SSL
- **Status:** ✅ Pakai default `aquent-id.web.app`
- [ ] (Opsional) Set custom domain di Firebase Hosting

### E. Multi-Profile Avatar Upload
- **Status:** ⚠ Hanya emoji `👤`
- [ ] Upload foto profil → Firebase Storage atau Imgur API (Storage perlu Blaze)
- [ ] Atau pakai DiceBear avatar generator (gratis)

### F. Export Data Pengguna (GDPR)
- [ ] User bisa download semua data sendiri sebagai JSON (sessions, profiles, surveys, badges)
- **Prioritas:** Tinggi untuk compliance

---

## 4. Backend / Infrastructure TODO

### A. Cloud Functions (perlu Blaze)
- [ ] Deploy `functions/index.js` (`/aiChat`, `/skinScan`)
- [ ] Tambah `/exportSurvey` endpoint untuk admin
- [ ] Tambah trigger `onUserCreate` → kirim welcome email
- [ ] Trigger `onSessionWrite` → auto-detect badge unlock
- [ ] Scheduled function untuk weekly digest email

### B. Firebase Storage (perlu Blaze)
- [ ] Setup `storage.rules` untuk upload avatar
- [ ] Compress + thumbnail generation (via Cloud Function)

### C. Analytics & Monitoring
- [ ] Aktifkan Firebase Analytics (free)
- [ ] Aktifkan Crashlytics (kalau punya wrapper Cordova/React Native nanti)
- [ ] Sentry / LogRocket integration (opsional)

### D. CI/CD
- [ ] GitHub Actions untuk auto-deploy on push to main
- [ ] Pre-deploy linter check
- [ ] Versioning otomatis di `sw.js` (bump `SW_VERSION`)

### E. Testing
- [ ] Unit test untuk Quality Score engine (Jest)
- [ ] E2E test login → admin promote (Playwright)
- [ ] Visual regression test untuk Light/Dark/Elegant modes
- [ ] Lighthouse CI check (PWA score ≥ 90, A11y ≥ 90)

---

## 5. Polish UX/UI yang Disarankan

### Prioritas Tinggi
- [ ] **Loading skeleton** di admin saat fetch data (sekarang langsung blank)
- [ ] **Empty state illustrations** — saat tabel kosong, tampilkan ilustrasi + CTA
- [ ] **Error boundary** — kalau ada exception di section, tampilkan pesan ramah
- [ ] **Toast batch** — kalau banyak action cepat, jangan tumpuk toast
- [ ] **Confirm modal yang konsisten** — ganti `confirm()` native dengan modal glass yang sama dengan UI

### Prioritas Sedang
- [ ] **Keyboard shortcuts list** — `?` button untuk show all shortcuts
- [ ] **Export riwayat sesi user ke PDF** (di app.html user, bukan admin)
- [ ] **Filter session history per profil** — saat ini campur semua profil
- [ ] **Notifications center** — list notif lokal yang sudah pernah muncul
- [ ] **Onboarding tooltip tour** — pertama kali buka app, highlight fitur per langkah

### Prioritas Rendah (Nice-to-have)
- [ ] **Achievements showcase** di profile public — share link "8 of 8 badges"
- [ ] **Comparison vs neighborhood avg** — anonim agregat dari geo wilayah
- [ ] **Skin diary** — log foto kulit harian (private only)
- [ ] **Time-lapse video** dari skin scans bulanan

---

## 6. Konten / Copy yang Perlu Final

### Halaman index.html (Marketing)
- [ ] Final hero copy + CTA
- [ ] Foto/video produk (saat ini placeholder?)
- [ ] Testimoni (kalau ada beta tester)
- [ ] Pricing section yang link ke `/upgrade`

### Email Template (Firebase Auth)
- [ ] Custom email reset password (logo AQUENT)
- [ ] Custom email verification
- [ ] Welcome email (perlu Cloud Function)

### Privacy Policy & Terms
- [ ] Halaman privacy policy resmi (PDPR Indonesia compliant)
- [ ] Terms of Service
- [ ] Cookie banner (kalau pakai Analytics)

### Documentation untuk Tim
- [ ] Update `PLANNING.md` reflect status terkini
- [ ] User manual untuk hardware IoT (cara konfigur ESP32 kirim ke Firebase)
- [ ] Troubleshooting guide

---

## 7. Akademik / Paper Specific

- [ ] **Implementation paper** — describe stack, novelty (XAI), architecture
- [ ] **User study report** — ambil data dari Survey Analytics admin → analisis SPSS/R
- [ ] **Reproducibility kit** — GitHub release dengan model + dataset link + notebook
- [ ] **Demo video** untuk presentasi (screen record alur)
- [ ] **Cite references.json** entries di paper bibliography

---

## 8. Pra-Deploy Final Checklist

### Security
- [ ] `service-account.json` confirmed di `.gitignore` ✅
- [ ] Rules deployed: `firebase deploy --only database,firestore:rules`
- [ ] No console.log dengan data sensitif
- [ ] CSP headers di `firebase.json` (saat ini cuma X-Frame-Options + nosniff)
- [ ] Rate limit di Functions (sudah ada in-memory, ideal: Firebase App Check)

### Performance
- [ ] Lighthouse audit ≥ 90 di semua kategori
- [ ] Image optimization (WebP, lazy-load)
- [ ] Bundle size check — `app.js` saat ini ~120KB (bisa minify)
- [ ] CDN cache headers untuk JS/CSS (sudah max-age=31536000)

### Compatibility
- [ ] Test di Chrome, Firefox, Safari, Edge
- [ ] Test di mobile iOS Safari, Android Chrome
- [ ] Test PWA install di Android & iOS
- [ ] Test offline mode (cabut wifi)

### Final Deployment
- [ ] Set VAPID key untuk FCM
- [ ] Train & deploy TFJS skin model
- [ ] Run `node setup-admin.js` untuk admin pertama
- [ ] Run `node seed-demo-data.js` (kalau perlu data demo untuk launch)
- [ ] Deploy: `deploy.bat` + `firebase deploy --only database,firestore:rules`
- [ ] Smoke test: login admin → cek semua tab admin
- [ ] Smoke test: login demo user → cek semua section app

---

## 9. Status Per Roadmap PLANNING_PROGRAMMER.md

| ID | Task | Status |
|---|---|---|
| P1 | Light/Dark Mode | ✅ + Elegant Mode |
| P2 | Quality Score + XAI | ✅ |
| P3 | Onboarding | ✅ (modal) |
| P4 | AI Chat (Gemini) | ⚠ frontend only, perlu Functions |
| P5 | Skin Scanner | ✅ TFJS + Gemini fallback |
| P6 | Session History | ✅ Firebase sync |
| P7 | Gamification | ✅ |
| P8 | Product Recommender | ✅ |
| P9 | Ensiklopedia | ✅ |
| P10 | Dermal-Guide | ✅ |
| P11 | Multi-Profile | ✅ Firebase RTDB sync |
| P12 | Push Notifications | ⚠ VAPID belum di-set |
| P13 | PWA | ✅ v2 SW + offline + update flow |
| P14 | Security & Rules | ✅ + audit log + meta/admins |
| P15 | In-App Survey | ✅ |

**Score: 13 ✅, 2 ⚠, 0 ❌ (87% complete)**

---

## 10. Quick Win — Yang Bisa Dikerjakan Hari Ini

Disusun berdasarkan effort vs dampak:

1. **Set VAPID key FCM** (15 mnt) — push remote langsung jalan
2. **Train TFJS model di Teachable Machine** (45 mnt) — Skin Scanner privacy-first aktif
3. **Deploy hosting + rules** (5 mnt) — semua perubahan online
4. **Setup admin pertama** (5 mnt) — `node setup-admin.js`
5. **Seed demo data** (10 mnt) — `node seed-demo-data.js`
6. **Test e2e dengan demo user** (30 mnt) — login demo → klik semua section
7. **Tambah halaman `/account.html`** (1-2 jam) — edit profil + GDPR export
8. **Tambah privacy policy page** (1 jam) — paste template + sesuaikan

**Total quick wins: ~4 jam** untuk dari 87% jadi 95% siap rilis.

---

## Legend

- ✅ = Selesai dan jalan
- ⚠ = Setengah jadi / butuh konfigurasi tambahan
- ❌ = Belum dikerjakan
- 🔬 = Untuk riset/paper akademik
