# AQUENT — Product Planning Document
**Versi:** 3.0 | **Tanggal:** 2026-04-29 | **Status:** Draft Final — SLR-Aligned

---

## [UPDATE v3.0] Penyesuaian Berdasarkan Systematic Literature Review (SLR)

Versi perencanaan ini telah diperbarui untuk mencerminkan temuan Systematic Literature Review (SLR) yang dilakukan terhadap 21 publikasi terindeks Scopus dan PubMed (2019–2024).

### Perubahan Arsitektur Multi-Page

Web AQUENT kini menggunakan arsitektur **multi-halaman** (bukan SPA tunggal):

| URL / File | Konten | Status |
|---|---|---|
| `index.html` (domain root) | Company Profile — informasi produk, tim, novelty, fitur | ✅ DONE |
| `app.html` | Dashboard aplikasi utama (ex-index.html) | ✅ DONE |
| `slr.html` | Halaman SLR akademik — PRISMA, matriks, gap, bibliografi | ✅ DONE |

**firebase.json** diperbarui: rewrite catch-all `**→/index.html` dihapus dan diganti `cleanUrls: true` agar ketiga halaman dapat diakses secara mandiri.

### Sensor Baru (Gap G01)

Berdasarkan gap G01 SLR, dua parameter sensor ditambahkan ke roadmap:

| Parameter | Sensor | Rentang Aman | Gap SLR |
|---|---|---|---|
| TDS / Mineral Hardness | TDS Probe (ppm) | < 300 ppm (WHO) | G01, G05 |
| Klorin Bebas | Chlorine Sensor (mg/L) | 0.2–0.5 mg/L (WHO) | G01, G05 |

Total parameter sensor: **5** (pH + Suhu + Turbidity + TDS + Klorin).

### Novelty Claim (3 Klaim Utama)

| ID | Klaim | Gap Dijawab |
|---|---|---|
| N01 | Explainable AI pertama untuk rekomendasi kualitas air shower | G03 |
| N02 | Integrasi 5-parameter sensor dalam satu platform home-use | G01 |
| N03 | Ensiklopedia Dermatologi terintegrasi sensor IoT real-time | G04 |

### Fitur Baru dari SLR (F01–F10)

| ID | Fitur | Gap Utama |
|---|---|---|
| F01 | Dashboard Real-Time 5 Parameter | G01, G02 |
| F02 | XAI Konsultan Kulit (Gemini + factor attribution) | G03 |
| F03 | Ensiklopedia Dermatologi | G04 |
| F04 | Scanner Risiko Kulit (Skin Health Index) | G01, G05 |
| F05 | Eco-Monitor (konsumsi air & energi) | G06 |
| F06 | Dermal-Guide (panduan personal per tipe kulit) | G07 |
| F07 | Smart Control (filter, suhu target) | G08 |
| F08 | Scheduler Mandi (prediksi kualitas air + preferensi) | G09 |
| F09 | Tren & Histori Kualitas Air | G02 |
| F10 | Alert & Notifikasi Real-Time | G05 |

### Sistem Prompt AI — Update Konteks Sensor (5 Parameter)

Prompt AI Konsultan perlu diperbarui untuk menyertakan TDS dan klorin:
```
Data shower pengguna saat ini:
- pH Air: {ph}
- Suhu: {temp}°C
- Kejernihan (Turbidity): {turbidity} NTU
- TDS / Mineral Hardness: {tds} ppm
- Klorin Bebas: {chlorine} mg/L
- Tipe kulit: {skinType}
- Skor kualitas air: {score}/100
```

---

## Ringkasan Eksekutif

AQUENT berkembang dari dashboard monitoring shower menjadi platform kesehatan kulit berbasis **AI yang dapat dijelaskan (XAI)** — terintegrasi dengan kondisi air real-time, analisis kamera, dan konsultasi cerdas. Seluruh fitur AI menggunakan **Google Gemini API** dengan transparansi penuh kepada pengguna tentang *mengapa* AI memberikan rekomendasi tertentu.

**Stack AI:** Google Gemini 2.0 Flash (chat) + Gemini 1.5 Pro Vision (kamera scan)
**Backend Proxy:** Firebase Functions (menyimpan API key server-side)
**XAI Principle:** Setiap output AI wajib disertai penjelasan faktor penyebab, skor kepercayaan, dan visualisasi kontribusi data.

---

## Arsitektur Target

```
Web Multi-Page:
  index.html (Company Profile) ──→ app.html (Dashboard SPA)
                               └──→ slr.html (SLR Akademik)

┌────────────────────────────────────────────────────────────────┐
│                     AQUENT app.html (SPA)                     │
│                                                                │
│  Dashboard │ Eco │ Dermal │ Control │ Jadwal │ AI Chat │ Scan  │
│                                                                │
│  ┌─────────────────┐   ┌──────────────────────────────────┐   │
│  │  Camera API     │   │   XAI Engine                     │   │
│  │  getUserMedia   │   │   ┌─────────────┐                │   │
│  │  + Canvas       │   │   │Factor Scores│ ← sensor data  │   │
│  └────────┬────────┘   │   │Confidence % │ ← skin type    │   │
│           │            │   │Explanation  │ ← scan result  │   │
│           ▼            │   └──────┬──────┘                │   │
│    base64 image        │          │                        │   │
│           │            └──────────┼────────────────────────┘   │
│           ▼                       ▼                             │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Firebase Functions (proxy)                 │   │
│  │   /ai-chat     →  Gemini 2.0 Flash                     │   │
│  │   /skin-scan   →  Gemini 1.5 Pro Vision                │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Firebase Realtime Database                 │   │
│  │  sensors/ │ controls/ │ sessions/ │ profiles/ │ chats/ │   │
│  └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## Prinsip XAI (Explainable AI) — Berlaku di Seluruh Fitur

> **XAI bukan fitur tersendiri, melainkan lapisan yang melekat pada setiap output AI.**

Setiap keputusan atau rekomendasi AI di AQUENT harus memenuhi 4 prinsip:

| Prinsip | Implementasi |
|---------|-------------|
| **Transparency** | Tampilkan data apa saja yang menjadi input AI |
| **Confidence** | Tampilkan skor kepercayaan (%) tiap output |
| **Attribution** | Tampilkan kontribusi tiap faktor dalam bentuk visual bar |
| **Simplicity** | Penjelasan dalam bahasa awam, bukan jargon teknis |

**Contoh visual XAI:**
```
Rekomendasi: "Gunakan moisturizer lebih tebal malam ini"

Alasan AI:                          Kontribusi:
  pH Air (6.1 — asam)   ████████░░  82%
  Kulit Kering           ██████░░░░  61%
  Suhu Rendah (34°C)    ████░░░░░░  43%
  Turbidity Normal       ██░░░░░░░░  20%

Kepercayaan AI: 88%  [Pelajari lebih lanjut ▾]
```

---

## BATCH 1 — Foundation & UX Polish
**Estimasi:** 3–4 hari | **Prioritas:** Tinggi

### B1.1 — Light / Dark Mode Toggle
- Toggle di header (ikon matahari/bulan) dengan animasi spin
- CSS custom properties swap — semua warna via variabel
- **Light Mode Palette:**
  - Background: `#e8f4fd → #f0f8ff`
  - Card glass: `rgba(255,255,255,0.72)` + blur
  - Text: `#1a2b3c / #4a6278`
  - Aksen tetap: `#0077b6 / #00b4d8`
- Transisi antar mode: `0.45s cubic-bezier`
- Simpan ke `localStorage`, deteksi `prefers-color-scheme` untuk default

### B1.2 — Water Quality Score (dengan XAI)
- Skor **0–100** dari 3 sensor dengan bobot transparan:
  - pH: 35% · Suhu: 35% · Turbidity: 30%
- Grade: **A** (90-100) · **B** (75-89) · **C** (60-74) · **D** (45-59) · **F** (<45)
- Visualisasi: large circular ring di atas Dashboard, warna dinamis
- **XAI Component "Kenapa skor ini?":**
  - Expandable panel di bawah skor
  - Bar chart 3 faktor + nilai aktual vs. rentang optimal
  - Kalimat penjelasan: *"Skor turun karena pH 6.1 berada di bawah rentang optimal 6.5–8.5"*

### B1.3 — Onboarding Flow
- Modal glass 3 langkah: **Nama → Tipe Kulit → Target Hemat Air**
- Progress indicator (dots)
- Muncul sekali, tersimpan di `localStorage` + Firebase `profiles/`
- Skip option tersedia

**Deliverable B1:** App terasa lebih personal, skor kualitas air langsung terlihat dengan penjelasan.

---

## BATCH 2 — AI Features + XAI (Core Differentiator)
**Estimasi:** 6–8 hari | **Prioritas:** Sangat Tinggi

### B2.1 — AI Skin Consultant Chat (Gemini + XAI)

**Stack:** Gemini 2.0 Flash via Firebase Function `/ai-chat`

**Arsitektur request:**
```
User message
    │
    ▼
Firebase Function /ai-chat
    │  Susun prompt dengan konteks:
    │  {ph, temp, turbidity, skinType, chatHistory}
    ▼
Gemini 2.0 Flash
    │  Response format: JSON
    │  { answer, factors[], confidence, sources[] }
    ▼
XAI Layer → render di UI
```

**System Prompt:**
```
Kamu adalah konsultan kesehatan kulit profesional dari AQUENT.
Data shower pengguna saat ini:
- pH Air: {ph} (status: {phStatus})
- Suhu: {temp}°C (status: {tempStatus})
- Kejernihan: {turbidity}% (status: {turbStatus})
- Tipe kulit: {skinType}
- Skor kualitas air: {score}/100

Untuk setiap jawaban, kembalikan JSON dengan format:
{
  "answer": "jawaban dalam bahasa Indonesia",
  "factors": [{"name": "...", "contribution": 0-100, "detail": "..."}],
  "confidence": 0-100,
  "disclaimer": "..."
}
```

**Fitur UI:**
- Section "AI Konsultan" di navigasi
- Bubble chat (user kanan, AI kiri dengan avatar tetes air)
- Typing indicator (3 titik bouncing)
- Quick-chips: *"Kulit saya kering"*, *"Aman mandi sekarang?"*, *"Rekomendasi sabun"*, *"Jelaskan skor airku"*
- Context bar: menampilkan data sensor yang sedang dianalisis AI
- **XAI Panel per jawaban AI:**
  - Badge kepercayaan: `88% yakin`
  - Expandable "Mengapa AI merekomendasikan ini?" → factor bars
  - Sumber data yang digunakan (pH, suhu, tipe kulit, dll)
- Riwayat chat tersimpan selama sesi (bukan ke server)
- Tombol "Bersihkan Chat"

### B2.2 — Skin Camera Scanner (Gemini Vision + XAI)

**Stack:** Gemini 1.5 Pro Vision via Firebase Function `/skin-scan`

**Alur lengkap:**
```
1. User tap "Mulai Scan"
2. Request izin kamera (getUserMedia, facingMode: 'user')
3. Tampil live preview + oval face guide overlay
4. Instruksi: "Pastikan wajah dalam cahaya cukup"
5. Countdown 3-2-1 → capture frame (640×480)
6. Canvas toDataURL → base64
7. Kirim ke Firebase Function dengan konteks sensor
8. Gemini Vision analisis → JSON result
9. Render Report Card + XAI breakdown
```

**Prompt ke Gemini Vision:**
```
Analisis kondisi kulit dari foto ini secara profesional.
Konteks tambahan: pH air={ph}, Suhu={temp}°C, Turbidity={turbidity}%

Kembalikan JSON:
{
  "skinScore": 0-100,
  "skinType": "dry|oily|normal|combination",
  "hydrationLevel": 0-100,
  "conditions": [
    {"name": "...", "detected": true/false, "confidence": 0-100, "location": "..."}
  ],
  "factors": [
    {"name": "...", "value": "...", "contribution": 0-100, "impact": "positive|negative|neutral"}
  ],
  "recommendations": ["...", "...", "..."],
  "waterCompatibility": "...",
  "confidence": 0-100,
  "disclaimer": "Ini bukan diagnosis medis."
}
```

**Fitur UI:**
- Overlay kamera: oval frame wajah + garis panduan
- Animasi countdown dengan efek glass
- Loading state: *"AI sedang menganalisis kulit Anda..."* dengan skeleton
- **Report Card:**
  - Skin Score ring (seperti gauge di Dashboard)
  - Kondisi terdeteksi: chip per kondisi + confidence badge
  - **XAI Heatmap explanation:** deskripsi area wajah yang dianalisis
  - **Factor Attribution Chart:** kontribusi tiap faktor (air, cahaya, tipe kulit)
  - Rekomendasi produk berdasarkan hasil scan + kondisi air
  - Kompatibilitas dengan air saat ini: *"Air dengan pH 6.1 dapat memperburuk kekeringan yang terdeteksi"*
- Fallback: upload foto dari galeri jika kamera tidak tersedia
- Privacy notice: *"Foto hanya diproses di memori, tidak disimpan"*
- Tombol "Scan Ulang" dan "Simpan Hasil ke Riwayat"

**Keamanan & Privacy:**
- Gambar tidak pernah disimpan ke Firebase Storage
- Hanya JSON hasil analisis yang boleh disimpan (jika user setuju)
- API key Gemini tersimpan di Firebase Function environment variable

**Deliverable B2:** Fitur pembeda utama AQUENT — AI yang tidak hanya menjawab, tapi menjelaskan *mengapa*.

---

## BATCH 3 — Analytics & Engagement
**Estimasi:** 4–5 hari | **Prioritas:** Sedang

### B3.1 — Session History & Analytics (dengan XAI)
- Rekam setiap sesi ke Firebase: `sessions/{profileId}/{timestamp}`
  - Durasi, volume, rata-rata pH/suhu/turbidity, air dihemat, skor kualitas
- Halaman History:
  - List sesi + filter (hari/minggu/bulan)
  - Line chart tren pH & suhu
  - Bar chart konsumsi harian
- **XAI Insight otomatis:**
  - *"Kualitas air paling buruk terjadi pada pukul 06.00–08.00"*
  - *"Tren pH minggu ini menurun, kemungkinan filter perlu diganti"*
  - Deteksi anomali: tandai sesi dengan kondisi air tidak normal
- Export ke CSV

### B3.2 — Gamification System
- **Streak:** hari berturut-turut mandi dengan skor > 75
- **Level:** Bronze → Silver → Gold → Platinum (berdasarkan air dihemat)
- **Badge dengan penjelasan XAI:**
  - Setiap badge earned muncul pop-up: *"Badge ini diperoleh karena kamu aktifkan Recirculation 7 hari berturut dengan rata-rata hemat 42% air"*
  - 8 badge tersedia: Eco Warrior, Skin Guardian, pH Master, Early Bird, Streak King, Filter Pro, Scanner Pro, Water Wise
- Notifikasi in-app (toast glassmorphism) saat badge baru

### B3.3 — Product Recommender (Rules + XAI)
- Rules-based berdasarkan: pH air + tipe kulit + hasil scan (jika ada)
- **XAI untuk setiap produk:**
  - *"Moisturizer ini direkomendasikan karena kulit kering terdeteksi (scan) + pH air 6.1 (asam)"*
  - Match score per produk (%)
- Katalog: 20+ produk dalam JSON lokal (sabun, moisturizer, toner, serum)
- Card produk: nama, fungsi, alasan, match score, link opsional

**Deliverable B3:** User punya alasan membuka app setiap hari — progress, badge, dan insight baru.

---

## BATCH 4 — Platform & Scale
**Estimasi:** 5–6 hari | **Prioritas:** Rendah–Sedang

### B4.1 — Multi-Profile (Keluarga)
- Sampai 5 profil per perangkat
- Data history, badge, dan preferensi terpisah per profil
- Avatar dropdown di header dengan animasi switcher
- Firebase: `profiles/{profileId}/`

### B4.2 — Push Notifications
- Firebase Cloud Messaging (FCM) + Service Worker
- Jenis: reminder jadwal, alert kualitas air buruk, filter hampir habis, badge baru
- **XAI di notifikasi:** *"pH air 5.8 — di bawah batas aman. Aktifkan Filter System"*

### B4.3 — PWA (Progressive Web App)
- `manifest.json` dengan ikon AQUENT
- Service Worker: cache app shell
- Offline mode: tampilkan data terakhir + banner offline
- "Install App" prompt

### B4.4 — Firebase Security & Rules
- Validasi schema di Realtime Database Rules
- Rate limiting di Firebase Function (max 20 req/menit per IP)
- Sanitasi input sebelum dikirim ke Gemini

**Deliverable B4:** App bisa diinstall, bekerja offline, dan aman dari abuse.

---

## Ringkasan Jadwal

```
                    Minggu 1          Minggu 2          Minggu 3          Minggu 4
                 ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
BATCH 1          │ Light/Dark  │  │             │  │             │  │             │
(3-4 hari)       │ Quality     │  │             │  │             │  │             │
                 │ Onboarding  │  │             │  │             │  │             │
                 └─────────────┘  │             │  │             │  │             │
BATCH 2                           │ AI Chat     │  │             │  │             │
(6-8 hari)                        │ + XAI       │  │             │  │             │
                                  │ Skin Scan   │  │             │  │             │
                                  │ + XAI       │  │             │  │             │
                                  └─────────────┘  │             │  │             │
BATCH 3                                            │ History     │  │             │
(4-5 hari)                                         │ Gamification│  │             │
                                                   │ Recommender │  │             │
                                                   └─────────────┘  │             │
BATCH 4                                                             │ Multi-Profile│
(5-6 hari)                                                          │ PWA          │
                                                                    │ Notifikasi   │
                                                                    │ Security     │
                                                                    └─────────────┘
```

---

## PEMBAGIAN KERJA 2 TAB — PERAN PENELITI & PROGRAMMER

> Prinsip: **Peneliti menghasilkan konten/data/prompt → Programmer mengkonsumsinya untuk membangun fitur.**
> Tidak ada konflik file karena keduanya bekerja pada tipe file yang berbeda.

---

### TAB PENELITI — Content & Knowledge Producer

Peneliti **tidak menyentuh** `app.js`, `style.css`, atau logika kode.
Semua output berupa file `.json` (data), `.md` (dokumentasi/prompt), dan update konten halaman web.

**File yang dimiliki Peneliti:**

```
data/
  thresholds.json       ← nilai batas aman 5 parameter (WHO/SNI/referensi ilmiah)
  encyclopedia.json     ← konten ensiklopedia dermatologi (40+ kondisi kulit)
  products.json         ← katalog 20+ produk skincare (sabun, moisturizer, toner, serum)
  dermal-guide.json     ← panduan mandi per tipe kulit × kondisi air
  badges.json           ← definisi 8 badge gamifikasi beserta kriteria ilmiahnya

prompts/
  ai-chat-system.md     ← system prompt lengkap AI Konsultan (berbasis literatur SLR)
  skin-scan-system.md   ← system prompt Gemini Vision untuk analisis kulit
  xai-explanation.md    ← template penjelasan XAI per kondisi sensor

slr.html                ← update & perkaya konten (tambah abstrak, update PRISMA)
index.html              ← isi nama tim, perkaya deskripsi produk, tambah press kit
RESEARCH.md             ← dokumen riset mendalam: basis ilmiah tiap fitur
```

**Tugas Peneliti (urutan pengerjaan):**

| No | Output File | Isi yang Dihasilkan | Digunakan oleh Programmer untuk |
|---|---|---|---|
| R1 | `data/thresholds.json` | Nilai batas aman pH (6.5–8.5), suhu (35–42°C), turbidity (<1 NTU), TDS (<300 ppm), Cl₂ (0.2–0.5 mg/L) beserta sumber referensinya (WHO, SNI, literatur SLR) | Quality Score engine, alert system, XAI explanation |
| R2 | `prompts/ai-chat-system.md` | System prompt lengkap Gemini AI Chat — konteks medis, batasan disclaimer, format JSON response `{answer, factors[], confidence, disclaimer}`, contoh few-shot | Firebase Function `/ai-chat` |
| R3 | `prompts/skin-scan-system.md` | System prompt Gemini Vision — instruksi analisis kulit, format JSON `{skinScore, conditions[], factors[], recommendations[]}`, batasan etis | Firebase Function `/skin-scan` |
| R4 | `data/encyclopedia.json` | 40+ entri kondisi kulit: eksim, psoriasis, dermatitis, kulit sensitif, dll. Tiap entri: nama, deskripsi, penyebab, hubungan dengan parameter air (pH/TDS/Cl₂), rekomendasi penanganan | Fitur Ensiklopedia Dermatologi (F03) |
| R5 | `data/products.json` | 20+ produk skincare: nama, brand, fungsi, cocok untuk tipe kulit apa, kondisi air seperti apa, bahan aktif, skor match per kondisi | Product Recommender (F03/B3.3) |
| R6 | `data/dermal-guide.json` | Matriks panduan mandi: tipe kulit (kering/berminyak/normal/kombinasi/sensitif) × kondisi air (pH rendah/tinggi, air keras/lunak, klorin tinggi) → langkah-langkah perawatan spesifik | Dermal-Guide (F06) |
| R7 | `data/badges.json` | 8 badge: nama, ikon emoji, deskripsi ilmiah, kriteria trigger (misal: "Eco Warrior = hemat >30% air selama 7 hari berturut"), penjelasan XAI untuk pop-up | Gamification system (B3.2) |
| R8 | `prompts/xai-explanation.md` | Template kalimat penjelasan XAI per skenario: pH rendah, suhu tinggi, TDS tinggi, klorin berlebih, turbidity tinggi — dalam bahasa Indonesia awam | XAI explanation renderer di `app.js` |
| R9 | `RESEARCH.md` | Dokumen riset lengkap: basis ilmiah tiap fitur, referensi per threshold, justifikasi bobot XAI (pH 35% dll), penjelasan mengapa 5 parameter dipilih | Dokumentasi, memperkuat novelty claim |
| R10 | `slr.html` | Perkaya halaman SLR: tambahkan abstrak per paper, update tabel dengan kolom methodology, perkuat narasi gap analysis | Halaman publikasi |
| R11 | `index.html` | Isi placeholder nama tim, perkaya deskripsi produk, tambahkan kutipan temuan SLR di hero section | Company profile |

---

### TAB PROGRAMMER — Code & Feature Builder

Programmer **mengambil semua file dari Peneliti** dan mengimplementasikannya menjadi fitur fungsional. Sebelum mengerjakan fitur yang bergantung pada data Peneliti, cek dulu apakah file data sudah tersedia — jika belum, kerjakan fitur lain terlebih dahulu.

**File yang dimiliki Programmer:**
```
app.html          ← semua perubahan HTML fitur
app.js            ← semua logika JS
style.css         ← semua CSS baru
functions/
  index.js        ← Firebase Cloud Functions (proxy Gemini)
  package.json
manifest.json     ← PWA manifest
sw.js             ← Service Worker
database.rules.json
```

**Tugas Programmer (urutan pengerjaan):**

| No | Batch | Task | Bergantung pada file Peneliti |
|---|---|---|---|
| P1 | B1.1 | Light/Dark mode toggle (CSS vars + JS localStorage) | — (tidak perlu data) |
| P2 | B1.2 | Quality Score engine: kalkulasi + ring gauge UI + XAI panel | `data/thresholds.json` (R1) |
| P3 | B1.3 | Onboarding flow modal (HTML + JS + Firebase profiles/) | — |
| P4 | B2.1 | Firebase Function `/ai-chat` + UI bubble chat + XAI render | `prompts/ai-chat-system.md` (R2), `prompts/xai-explanation.md` (R8) |
| P5 | B2.2 | Firebase Function `/skin-scan` + UI kamera + report card | `prompts/skin-scan-system.md` (R3) |
| P6 | B3.1 | Session history — Firebase write/read + Chart.js trend | `data/thresholds.json` (R1) |
| P7 | B3.2 | Gamification — badge detection JS + streak counter + pop-up XAI | `data/badges.json` (R7) |
| P8 | B3.3 | Product Recommender — rules engine + match score + kartu UI | `data/products.json` (R5), `data/thresholds.json` (R1) |
| P9 | F03 | Ensiklopedia Dermatologi — search, filter, detail modal | `data/encyclopedia.json` (R4) |
| P10 | F06 | Dermal-Guide — render panduan per tipe kulit × kondisi air | `data/dermal-guide.json` (R6) |
| P11 | B4.1 | Multi-Profile — switcher UI + Firebase profiles/ | — |
| P12 | B4.2 | Push Notifications — FCM + Service Worker | — |
| P13 | B4.3 | PWA — manifest.json + install prompt + offline mode | — |
| P14 | B4.4 | Security — Firebase Rules + rate limiting Functions | — |

---

### Alur Kerja Paralel

```
PENELITI                          PROGRAMMER
────────────────────────────      ────────────────────────────
R1 thresholds.json  ──────────→   P2 Quality Score engine
R2 ai-chat prompt   ──────────→   P4 AI Chat Function
R3 skin-scan prompt ──────────→   P5 Skin Scanner Function
R4 encyclopedia     ──────────→   P9 Ensiklopedia UI
R5 products         ──────────→   P8 Recommender engine
R6 dermal-guide     ──────────→   P10 Dermal-Guide render
R7 badges           ──────────→   P7 Gamification logic
R8 xai-explanation  ──────────→   P4, P5 (XAI text templates)

Programmer TIDAK menunggu semua file selesai.
P1, P3, P11–P14 bisa dikerjakan kapan saja (tidak butuh data Peneliti).
P2 bisa dimulai saat R1 selesai, P4 saat R2 selesai, dst.
```

---

### Format File Data (Kontrak Peneliti → Programmer)

Peneliti **wajib** mengikuti format JSON ini agar Programmer bisa langsung mengkonsumsi:

**`data/thresholds.json`**
```json
{
  "ph":        { "min": 6.5, "max": 8.5, "unit": "pH", "source": "WHO 2022", "weight_xai": 0.35 },
  "temp":      { "min": 35,  "max": 42,  "unit": "°C",  "source": "SNI 2020", "weight_xai": 0.35 },
  "turbidity": { "min": 0,   "max": 1,   "unit": "NTU", "source": "WHO 2022", "weight_xai": 0.30 },
  "tds":       { "min": 0,   "max": 300, "unit": "ppm", "source": "WHO 2022", "weight_xai": 0.00 },
  "chlorine":  { "min": 0.2, "max": 0.5, "unit": "mg/L","source": "WHO 2022", "weight_xai": 0.00 }
}
```

**`data/encyclopedia.json`**
```json
[
  {
    "id": "atopic-dermatitis",
    "name": "Dermatitis Atopik",
    "tags": ["kulit kering", "eksim"],
    "description": "...",
    "water_triggers": { "ph_low": true, "tds_high": true, "chlorine_high": true },
    "recommendations": ["..."],
    "sources": ["doi:10.1111/bjd.19862"]
  }
]
```

**`data/products.json`**
```json
[
  {
    "id": "cerave-moisturizer",
    "name": "CeraVe Moisturizing Cream",
    "category": "moisturizer",
    "for_skin_types": ["dry", "sensitive"],
    "best_when": { "ph_low": true, "tds_high": false },
    "active_ingredients": ["ceramide", "hyaluronic acid"],
    "match_rules": "..."
  }
]
```

**`data/badges.json`**
```json
[
  {
    "id": "eco-warrior",
    "name": "Eco Warrior",
    "icon": "🌿",
    "description": "Hemat air lebih dari 30% selama 7 hari berturut-turut",
    "trigger": { "metric": "water_saved_pct", "threshold": 30, "streak_days": 7 },
    "xai_popup": "Badge ini diperoleh karena kamu berhasil menghemat rata-rata {value}% air selama {days} hari."
  }
]
```

---

## Kebutuhan Sebelum Mulai

| Item | Batch | Status | Keterangan |
|------|-------|--------|------------|
| Google Gemini API Key | B2 | ⏳ Perlu | console.cloud.google.com |
| Firebase Functions setup | B2 | ⏳ Perlu | `firebase init functions` |
| Node.js v18+ (lokal) | B2 | ⏳ Perlu | Untuk deploy Functions |
| Firebase CLI v12+ | B2 | ✅ Ada | v11 perlu upgrade |

---

## Keputusan yang Perlu Dikonfirmasi

1. **Gemini API Key** — sudah ada atau perlu dibuat?
2. **Hasil scan kamera** — simpan JSON ke Firebase atau hanya sesi?
3. **Bahasa** — tetap full Bahasa Indonesia?
4. **Batch mana duluan?** — Rekomendasi: **Batch 1 dulu** (2–3 jam), lalu **Batch 2**
5. **Model Gemini** — Flash (cepat/murah) atau Pro (akurat)? Saran: Flash untuk chat, Pro untuk scan

---

## Catatan Teknis XAI

XAI di AQUENT bukan black-box explainability library. Implementasinya:

- **Untuk sensor-based logic** (Quality Score, Dermal Guide): faktor dihitung secara deterministik → mudah dijelaskan secara eksak
- **Untuk Gemini output**: prompt engineering meminta model mengembalikan `factors[]` dan `confidence` secara eksplisit dalam JSON — model menjelaskan alasannya sendiri
- **Untuk scan kamera**: sama seperti di atas, ditambah deskripsi area yang dianalisis
- **Bukan**: SHAP values, LIME, atau metode XAI klasik ML — tidak diperlukan karena kita tidak melatih model sendiri
