# AQUENT — Rencana Kerja TAB PROGRAMMER
**Versi:** 2.0 | **Tanggal:** 2026-04-29
**Peran:** Feature Builder & Code Implementer
**Berkolaborasi dengan:** TAB PENELITI (lihat `PLANNING_PENELITI.md`)

**Changelog v2.0:**
- Tambah P15 — In-App Survey (evaluasi TAM/SUS/UEQ post-onboarding)
- Tambah `data/skin_type_profiles.json` ke tabel dependensi (P8, P9, P10)
- Update tabel Firebase DB Schema (`surveys/` node)
- Update urutan prioritas Minggu 3: tambah P15
- Tambah referensi ke `QUESTIONNAIRE.md` di bagian Koordinasi

---

## Prinsip Peran Ini

Programmer **tidak membuat konten atau riset** — semua teks UI, data JSON, dan prompt AI disediakan oleh Peneliti.
Tugas Programmer adalah mengambil file dari folder `data/` dan `prompts/` lalu mengimplementasikannya menjadi fitur fungsional.

> Jika file data dari Peneliti belum tersedia, kerjakan fitur yang tidak bergantung data terlebih dahulu (P1, P3, P11–P14).

---

## File yang Menjadi Tanggung Jawab Programmer

```
app.html              ← semua perubahan HTML fitur dashboard
app.js                ← semua logika JavaScript
style.css             ← semua CSS baru
functions/
  index.js            ← Firebase Cloud Functions (proxy Gemini API)
  package.json
manifest.json         ← PWA config
sw.js                 ← Service Worker
database.rules.json   ← Firebase Security Rules
```

**JANGAN sentuh:** `data/`, `prompts/`, `RESEARCH.md`, `slr.html` (kecuali diminta), `index.html` (milik Peneliti), `landing.css`

---

## Dependensi: File Data dari Peneliti

Sebelum mengerjakan fitur tertentu, cek apakah file ini sudah tersedia:

| Cek file ini dulu | Baru kerjakan fitur |
|---|---|
| `data/thresholds.json` | P2 Quality Score, P6 History, P8 Recommender |
| `prompts/ai-chat-system.md` | P4 AI Chat Function |
| `prompts/skin-scan-system.md` | P5 Skin Scanner Function |
| `prompts/xai-explanation.md` | P4, P5 (teks XAI) |
| `data/encyclopedia.json` | P9 Ensiklopedia |
| `data/products.json` | P8 Product Recommender |
| `data/dermal-guide.json` | P10 Dermal-Guide |
| `data/badges.json` | P7 Gamifikasi |
| `data/skin_type_profiles.json` ✅ *tersedia* | P8 Recommender (filter `for_skin_types`), P9 Ensiklopedia (highlight kondisi per profil), P10 Dermal-Guide (parameter optimal per tipe kulit) |
| `QUESTIONNAIRE.md` ✅ *tersedia* | P15 In-App Survey (item list, struktur Firebase, kriteria trigger) |
| `data/filter_guide.json` ✅ *tersedia* | P4/P12 Alert recommendations — gunakan field `alert_recommendation` untuk teks saran filter per parameter. 7 tipe filter dengan efektivitas per parameter. |
| `data/shower_myths.json` ✅ *tersedia* | P4 AI Chat (myths debunking), P12 Push Notifications `myth_buster` template, opsional UI "Fakta Harian" |
| `data/notification_templates.json` ✅ *tersedia* | P12 Push Notifications — semua teks notifikasi sudah tersedia per `trigger_type`. Gunakan field `title`, `body`, `priority`, `vibrate`, `action_url`. |
| `data/references.json` ✅ *tersedia* | Opsional: render daftar referensi di halaman "Tentang AQUENT" atau Info Panel. 21 referensi SLR terstruktur. |

**Fitur yang bisa dikerjakan TANPA menunggu Peneliti:** P1, P3, P11, P12, P13, P14

---

## Daftar Tugas Programmer

---

### P1 — Light / Dark Mode Toggle
**Batch:** B1.1 | **Bergantung data Peneliti:** Tidak
**File:** `style.css`, `app.html`, `app.js`

**Implementasi:**
- Tambahkan CSS custom properties untuk dark/light mode di `:root` dan `[data-theme="light"]`
- **Light Mode Palette:**
  - `--bg: #e8f4fd` → `--bg2: #f0f8ff`
  - `--glass: rgba(255,255,255,.72)` + blur
  - `--text: #1a2b3c` · `--muted: #4a6278`
  - Aksen tetap: `--pri: #0077b6` / `--pri2: #00b4d8`
- Tombol toggle di header: ikon matahari ↔ bulan dengan animasi `rotate 0.4s`
- JS logic:
  ```js
  // localStorage key: 'aquent-theme'
  // deteksi prefers-color-scheme untuk default pertama kali
  // toggle: document.documentElement.setAttribute('data-theme', theme)
  ```
- Transisi semua elemen: `transition: background 0.45s, color 0.45s cubic-bezier(.4,0,.2,1)`

---

### P2 — Water Quality Score Engine + XAI Panel
**Batch:** B1.2 | **Bergantung data Peneliti:** `data/thresholds.json` (R1)
**File:** `app.html`, `app.js`, `style.css`

**Implementasi:**
- Load `data/thresholds.json` saat app init
- Kalkulasi skor 0–100 menggunakan `weight_xai` dari thresholds:
  ```
  score = (phScore * 0.35) + (tempScore * 0.35) + (turbScore * 0.30)
  tiap parameter: 100 jika dalam range, turun proporsional jika di luar
  ```
- Grade system: A (90–100) · B (75–89) · C (60–74) · D (45–59) · F (<45)
- **UI — Large Circular Ring Gauge:**
  - SVG circle dengan `stroke-dashoffset` animasi dari 0 ke skor
  - Warna dinamis: hijau (A) → kuning (B/C) → oranye (D) → merah (F)
  - Nilai skor di tengah + grade letter
- **XAI Panel "Kenapa skor ini?":**
  - Tombol expand di bawah ring
  - Bar chart 3 faktor: pH · Suhu · Turbidity dengan nilai aktual vs rentang optimal
  - Teks penjelasan dari `prompts/xai-explanation.md` (load setelah Peneliti selesai)
  - Kalimat fallback jika file belum ada: *"Skor dihitung dari pH, suhu, dan kejernihan air."*

---

### P3 — Onboarding Flow
**Batch:** B1.3 | **Bergantung data Peneliti:** Tidak
**File:** `app.html`, `app.js`, `style.css`

**Implementasi:**
- Modal glassmorphism 3 langkah dengan progress dots
- Langkah 1 — Nama pengguna (input text)
- Langkah 2 — Tipe kulit (5 pilihan: Kering / Berminyak / Normal / Kombinasi / Sensitif) — card selector visual
- Langkah 3 — Target hemat air per bulan (slider: 10%–50%)
- Logic:
  ```js
  // Cek localStorage 'aquent-onboarded'
  // Jika belum, tampilkan modal saat app pertama kali load
  // Simpan ke localStorage + Firebase profiles/{uid}/
  // Skip option tersedia
  ```
- Animasi slide antar langkah: `translateX`
- Data tersimpan: `{ name, skinType, waterSaveTarget, createdAt }`

---

### P4 — AI Skin Consultant Chat (Gemini + XAI)
**Batch:** B2.1 | **Bergantung data Peneliti:** `prompts/ai-chat-system.md` (R2), `prompts/xai-explanation.md` (R8)
**File:** `app.html` section `#ai-chat`, `app.js`, `functions/index.js`

**Firebase Function `/ai-chat`:**
```js
// functions/index.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Baca system prompt dari ai-chat-system.md (hardcode string saat deploy)
// Susun prompt: systemPrompt + konteks sensor + pesan user
// Parse response JSON: { answer, factors[], confidence, disclaimer }
// Return ke frontend
```

**Frontend UI:**
- Section `#ai-chat` di navigasi app
- Bubble chat: user (kanan, biru) · AI (kiri, glass + avatar tetes air)
- Typing indicator: 3 titik bouncing saat loading
- Quick-chips di atas input: *"Aman mandi sekarang?"* · *"Kulit saya kering"* · *"Rekomendasi sabun"* · *"Jelaskan skor air saya"*
- Context bar atas: tampilkan nilai sensor yang sedang dianalisis AI
- **XAI Panel per jawaban AI:**
  - Badge: `88% yakin` (dari field `confidence`)
  - Collapsible "Mengapa AI merekomendasikan ini?" → bar kontribusi tiap faktor
  - Gunakan template kalimat dari `xai-explanation.md`
- Riwayat chat: simpan di `sessionStorage` (bukan server)
- Tombol "Bersihkan Chat"

**Error handling:**
- Jika Functions belum deploy: gunakan Gemini langsung dari frontend (dev mode)
- Tampilkan error toast jika API gagal

---

### P5 — Skin Camera Scanner (Gemini Vision + XAI)
**Batch:** B2.2 | **Bergantung data Peneliti:** `prompts/skin-scan-system.md` (R3)
**File:** `app.html` section `#skin-scanner`, `app.js`, `functions/index.js`

**Alur implementasi:**
```
1. Tap "Mulai Scan" → request getUserMedia({ facingMode: 'user' })
2. Live preview dalam oval frame + overlay guide
3. Instruksi teks: "Pastikan wajah dalam cahaya cukup, jarak 30cm"
4. Countdown 3-2-1 (animasi glass) → capture canvas 640×480
5. canvas.toDataURL('image/jpeg', 0.8) → base64
6. POST ke Firebase Function /skin-scan dengan { image: base64, sensorData: {...} }
7. Function → Gemini 1.5 Pro Vision → JSON result
8. Render Report Card
```

**Report Card UI:**
- Skin Score ring (sama dengan Quality Score ring, warna berbeda)
- Chip kondisi terdeteksi: `Kulit Kering ✓ 88%` · `Iritasi ✓ 65%`
- Factor Attribution bars dari `factors[]`
- Teks `waterCompatibility` dari response AI
- Rekomendasi list dari `recommendations[]`
- Tombol "Scan Ulang" · "Simpan ke Riwayat"
- Privacy notice: *"Foto tidak disimpan. Hanya hasil analisis yang diproses."*
- Fallback: upload foto dari galeri jika kamera tidak tersedia (`<input type="file" accept="image/*">`)

---

### P6 — Session History & Analytics
**Batch:** B3.1 | **Bergantung data Peneliti:** `data/thresholds.json` (R1)
**File:** `app.html` section `#history`, `app.js`

**Firebase Schema:**
```
sessions/{profileId}/{timestamp}/
  duration_min, volume_liters, avg_ph, avg_temp, avg_turbidity,
  avg_tds, avg_chlorine, quality_score, water_saved_pct
```

**UI:**
- List sesi dengan filter: Hari ini / Minggu ini / Bulan ini
- Line chart (Chart.js): tren pH dan suhu selama 30 hari
- Bar chart: konsumsi air harian vs target
- **XAI Insight otomatis** (rules-based):
  - Deteksi jam mandi paling sering → *"Kualitas air biasanya terbaik pukul 20.00–21.00"*
  - Tren pH turun → *"pH air cenderung menurun minggu ini. Periksa filter."*
  - Anomali: highlight sesi dengan kondisi di luar normal
- Export CSV button

---

### P7 — Gamification System
**Batch:** B3.2 | **Bergantung data Peneliti:** `data/badges.json` (R7)
**File:** `app.html`, `app.js`, `style.css`

**Implementasi:**
- Load `data/badges.json` saat init
- Badge detection: cek kriteria trigger tiap akhir sesi mandi
- Streak counter: `localStorage` + Firebase `profiles/{id}/streak`
- Level system: Bronze → Silver → Gold → Platinum berdasarkan total sesi + air hemat
- **Pop-up badge earned:** toast glassmorphism dengan template `xai_popup` dari badges.json
- Gamification panel: grid badge (earned = berwarna, belum = grayscale), streak calendar, level progress bar

---

### P8 — Product Recommender
**Batch:** B3.3 | **Bergantung data Peneliti:** `data/products.json` (R5), `data/thresholds.json` (R1)
**File:** `app.html`, `app.js`, `style.css`

**Rules engine:**
```js
// Input: kondisi sensor saat ini + tipe kulit user (dari onboarding)
// Untuk setiap produk di products.json:
//   hitung match score berdasarkan best_when_water vs kondisi aktual
//   filter by for_skin_types
// Sort by match score, tampilkan top 5
```

**UI:**
- Kartu produk: nama, kategori, match score badge (%), alasan rekomendasi (XAI)
- Teks XAI per produk: *"Direkomendasikan karena pH air 6.1 (asam) + kulit kering terdeteksi"*
- Filter: by category (sabun / moisturizer / serum / toner)

---

### P9 — Ensiklopedia Dermatologi
**Batch:** F03 | **Bergantung data Peneliti:** `data/encyclopedia.json` (R4)
**File:** `app.html`, `app.js`, `style.css`

**UI:**
- Search bar (filter by nama/tag)
- Grid kartu kondisi kulit: nama + 3 trigger water icon (pH/TDS/Cl₂)
- Detail modal saat klik: deskripsi, penyebab, hubungan air, rekomendasi
- **Kontekstualisasi real-time:** jika kondisi sensor saat ini memicu kondisi tertentu → highlight kartu tersebut dengan label *"Relevan sekarang"*
- Filter by water trigger (pH / TDS / klorin / suhu)

---

### P10 — Dermal-Guide
**Batch:** F06 | **Bergantung data Peneliti:** `data/dermal-guide.json` (R6)
**File:** `app.html`, `app.js`, `style.css`

**UI:**
- Auto-detect tipe kulit dari profil onboarding + kondisi sensor aktual
- Pilih kombinasi dari `dermal-guide.json` dan render langkah-langkah
- Step-by-step card dengan progress checklist
- Risk level indicator (low/medium/high) + warning jika ada
- Produk yang disarankan (link ke Recommender)

---

### P11 — Multi-Profile (Keluarga)
**Batch:** B4.1 | **Bergantung data Peneliti:** Tidak
**File:** `app.html`, `app.js`

- Sampai 5 profil per perangkat
- Avatar dropdown di header dengan animasi switcher
- Firebase: `profiles/{profileId}/` (history, badge, preferensi terpisah)
- Switch profil: animasi slide + reload sensor context

---

### P12 — Push Notifications
**Batch:** B4.2 | **Bergantung data Peneliti:** Tidak
**File:** `app.js`, `sw.js`, `functions/index.js`

- Firebase Cloud Messaging (FCM) + Service Worker
- Jenis notifikasi:
  - Alert kualitas air buruk (dari threshold)
  - Reminder jadwal mandi
  - Badge baru earned
  - Filter hampir habis (estimasi dari sesi count)
- Teks notifikasi menggunakan `alert_message` dari `thresholds.json`

---

### P13 — PWA (Progressive Web App)
**Batch:** B4.3 | **Bergantung data Peneliti:** Tidak
**File:** `manifest.json`, `sw.js`, `app.html`

```json
// manifest.json
{
  "name": "AQUENT",
  "short_name": "AQUENT",
  "theme_color": "#00b4d8",
  "background_color": "#000c1a",
  "display": "standalone",
  "start_url": "/app.html",
  "icons": [...]
}
```
- Service Worker: cache app shell (HTML, CSS, JS, Chart.js)
- Offline mode: tampilkan data sensor terakhir + banner *"Mode Offline"*
- Install prompt: `beforeinstallprompt` event → tombol "Pasang App"

---

### P14 — Firebase Security & Rules
**Batch:** B4.4 | **Bergantung data Peneliti:** Tidak
**File:** `database.rules.json`, `functions/index.js`

```json
// database.rules.json
{
  "rules": {
    "sensors": { ".read": true, ".write": "auth != null" },
    "profiles": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```
- Rate limiting di Firebase Function: max 20 req/menit per IP
- Sanitasi input sebelum dikirim ke Gemini (strip HTML, limit panjang)
- Validasi schema sensor data sebelum ditulis ke DB

---

### P15 — In-App Survey / Kuesioner Evaluasi
**Batch:** B5.1 | **Bergantung data Peneliti:** `QUESTIONNAIRE.md` (tersedia ✅)
**File:** `app.html`, `app.js`, `style.css`, `functions/index.js`

**Trigger logic:**
```js
// Cek sessionCount di localStorage + Firebase profiles/{uid}/sessionCount
// Munculkan survey modal saat sessionCount === 3 (setelah sesi mandi ke-3)
// Set flag 'aquent-survey-done' di localStorage agar tidak muncul ulang
// Tambahkan tombol "Isi Kuesioner" di Settings untuk akses manual
```

**Modal UI — glassmorphism, multi-step:**
- Header: *"Bantu Kami Meningkatkan AQUENT"* + progress bar `(langkah X / Y)`
- Navigasi: tombol Lanjut / Kembali + Skip (with confirmation dialog)
- Tiap item:
  - Likert 7 (TAM): radio horizontal dengan label ujung *"Sangat Tidak Setuju"* ↔ *"Sangat Setuju"*
  - Likert 5 (SUS): radio horizontal 1–5
  - Bipolar UEQ-S: slider −3 → +3 dengan label dua kutub di kiri/kanan
  - Multipilih (Demografi): checkbox grid
  - Open-ended: `<textarea>` dengan counter karakter (max 300)

**Struktur pertanyaan (sesuai `QUESTIONNAIRE.md`):**

| Bagian | Label | Jumlah item | UI widget |
|---|---|---|---|
| A | Demografi | 8 | dropdown / checkbox / radio |
| B | TAM | 18 (PU×6, PEOU×6, ATU×3, BIU×3) | Likert 7 |
| C | SUS | 10 | Likert 5 |
| D | UEQ-S | 12 (8 standard + 4 extended) | Bipolar −3 to +3 |
| E | XAI Trust | 8 (XAIT×4, AIT×4) | Likert 7 |
| F | AQUENT-Specific | 20 (WQL, BCI, IDPT, SRP, ECO ×4) | Likert 7 |
| G | Feature Eval | 12 | Likert 1–5 + N/A |
| H | Open-ended | 4 | textarea |

**Firebase schema:**
```
surveys/
  {uid}/
    {timestamp}/
      completed: true
      duration_sec: 420
      section_A: { gender, ageGroup, education, skinType, skinCondition, usageFreq, usageDuration, featuresUsed[] }
      section_B: { PU1..PU6, PEOU1..PEOU6, ATU1..ATU3, BIU1..BIU3 }
      section_C: { SUS1..SUS10 }
      section_D: { UEQ1..UEQ12 }
      section_E: { XAIT1..XAIT4, AIT1..AIT4 }
      section_F: { WQL1..WQL4, BCI1..BCI4, IDPT1..IDPT4, SRP1..SRP4, ECO1..ECO4 }
      section_G: { G1..G12 }
      section_H: { H1_text, H2_text, H3_text, H4_text }
      deviceInfo: { userAgent, screenWidth, platform }
```

**Firebase Function `/export-survey`:**
```js
// functions/index.js — tambahkan endpoint baru
// Hanya dapat dipanggil oleh admin (auth.token.admin === true)
// Ambil semua survey/{uid}/{timestamp} dari Realtime DB
// Flatten ke array of rows (1 baris = 1 responden)
// Return JSON atau generate CSV (set header Content-Type: text/csv)
// Dapat dihubungkan ke Google Sheets via Apps Script webhook (opsional)
```

**Konfirmasi setelah submit:**
- Toast: *"Terima kasih! Jawaban Anda membantu meningkatkan AQUENT."*
- Badge earned: `"Kontributor AQUENT"` (tambahkan ke `data/badges.json`)
- Skor SUS dihitung di frontend dan ditampilkan: *"SUS Anda: 82.5 — Excellent!"*

**Privacy:**
- Semua data dikirim di bawah `uid` (anonymous Firebase auth — tidak ada nama asli di DB)
- Tambahkan disclaimer di awal modal: *"Data dikumpulkan secara anonim untuk keperluan penelitian akademik."*

---

## Urutan Prioritas Pengerjaan

```
MINGGU 1 — Kerjakan ini dulu (tidak butuh data Peneliti):
  P1  Dark/Light Mode
  P3  Onboarding Flow
  P13 PWA manifest
  P14 Security Rules
  P11 Multi-Profile

Saat thresholds.json dari Peneliti sudah ada:
  P2  Quality Score Engine ← langsung kerjakan

Saat ai-chat-system.md dari Peneliti sudah ada:
  P4  AI Chat + Functions ← langsung kerjakan

Saat skin-scan-system.md dari Peneliti sudah ada:
  P5  Skin Scanner ← langsung kerjakan

MINGGU 2 — Saat data konten sudah ada:
  P6  History & Analytics
  P7  Gamifikasi (butuh badges.json)
  P8  Product Recommender (butuh products.json)
  P9  Ensiklopedia (butuh encyclopedia.json)
  P10 Dermal-Guide (butuh dermal-guide.json)

MINGGU 3:
  P12 Push Notifications
  P15 In-App Survey (trigger setelah sesi ke-3, export ke Firebase)
```

---

## Setup Awal yang Diperlukan

| Item | Status | Cara |
|---|---|---|
| Google Gemini API Key | ⏳ Perlu | console.cloud.google.com → API & Services → Credentials |
| Firebase Functions init | ⏳ Perlu | `firebase init functions` di folder project |
| Node.js v18+ | ⏳ Perlu | nodejs.org |
| Firebase CLI v12+ | ⏳ Perlu | `npm install -g firebase-tools` |

**Simpan Gemini API Key di Firebase Functions environment:**
```bash
firebase functions:config:set gemini.key="YOUR_API_KEY"
```

---

## Struktur Firebase Realtime Database

```
aquent-db/
  sensors/
    ph: 7.2
    temp: 38.1
    turbidity: 0.3
    tds: 145
    chlorine: 0.3
    lastUpdated: timestamp

  profiles/
    {uid}/
      name: "..."
      skinType: "dry"
      waterSaveTarget: 30
      streak: 5
      level: "silver"
      badges: { "eco-warrior": true, ... }

  sessions/
    {uid}/
      {timestamp}/
        duration_min, volume_liters, avg_ph, avg_temp,
        avg_turbidity, avg_tds, avg_chlorine,
        quality_score, water_saved_pct

  controls/
    filterActive: false
    tempTarget: 38
    schedulerEnabled: true

  surveys/
    {uid}/
      {timestamp}/
        completed: true
        duration_sec: 420
        section_A: { gender, ageGroup, education, skinType, ... }
        section_B: { PU1..PU6, PEOU1..PEOU6, ATU1..ATU3, BIU1..BIU3 }
        section_C: { SUS1..SUS10 }
        section_D: { UEQ1..UEQ12 }
        section_E: { XAIT1..XAIT4, AIT1..AIT4 }
        section_F: { WQL1..WQL4, BCI1..BCI4, IDPT1..IDPT4, SRP1..SRP4, ECO1..ECO4 }
        section_G: { G1..G12 }
        section_H: { H1_text..H4_text }
        deviceInfo: { userAgent, screenWidth, platform }
```

---

## Koordinasi dengan Tab Peneliti

Programmer **proaktif memberi tahu** Peneliti format atau field tambahan yang dibutuhkan saat implementasi. Jika ada ketidakcocokan format antara yang Peneliti buat dan yang Programmer butuhkan, diskusikan dan update format di `PLANNING.md` bersama-sama.

**Referensi file dari Peneliti yang relevan untuk implementasi:**

| File | Digunakan di | Catatan |
|---|---|---|
| `QUESTIONNAIRE.md` | P15 | Daftar lengkap 88 item, skala, dan hipotesis TAM/SUS/UEQ/XAI. Gunakan sebagai sumber item teks dan urutan bagian. |
| `data/skin_type_profiles.json` | P3, P8, P9, P10 | Berisi `optimal_shower_parameters`, `water_sensitivity`, `key_ingredients_for` per tipe kulit. P3 onboarding perlu 5 skin type cards sesuai profil ini. P8 perlu `max_tds_ppm` dan `max_chlorine_mgl` untuk filter rekomendasi produk. |
| `data/thresholds.json` | P2, P4, P6, P12 | Field `weight_xai_justification` baru di TDS dan Chlorine — gunakan untuk teks tooltip di XAI Panel jika user bertanya kenapa TDS tidak masuk skor. |
| `data/encyclopedia.json` | P9 | Sekarang 41 entries (ditambah dari 21). Update search index dan filter tag di P9. |
| `data/dermal-guide.json` | P10 | Sekarang 31 kombinasi (ditambah dari 13). Pastikan key lookup `{skinType}_{condition}` tetap konsisten. |
