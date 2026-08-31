# Implementation Plan: Advanced Features Upgrade

## Overview

Rencana implementasi ini menerjemahkan desain "Advanced Features Upgrade" menjadi langkah-langkah kode inkremental dalam *vanilla JavaScript* (sesuai keputusan desain — tanpa build framework). Setiap engine baru dibuat sebagai modul `.js` ber-namespace global yang dimuat di `app.html`, menggunakan ulang aset eksisting (Chart.js, `i18n.js`, `data/thresholds.json`, `data/references.json`, `calcQualityScore()`).

Pengujian memakai **Vitest + fast-check** (jalankan dengan `vitest --run`, bukan watch mode). Setiap *Correctness Property* (1–62) dari desain diimplementasikan sebagai satu property-based test (≥ 100 iterasi) dan ditandai opsional dengan `*`. Setiap task membangun di atas task sebelumnya dan diakhiri dengan integrasi/penyambungan ke UI agar tidak ada kode menggantung.

## Tasks

- [x] 1. Set up project test infrastructure dan konstanta bersama
  - [x] 1.1 Set up kerangka pengujian Vitest + fast-check
    - Tambahkan `package.json` skrip uji root (`"test": "vitest --run"`) dan `vitest.config.js` dengan environment `jsdom`
    - Buat folder `tests/` dan helper mock untuk `localStorage`, `fetch`, dan timer
    - Pastikan modul `.js` dapat di-import untuk pengujian unit/properti
    - _Requirements: Batasan Arsitektur (vanilla JS, tanpa build wajib)_
  - [x] 1.2 Buat modul konstanta konfigurasi `config.js`
    - Definisikan konstanta terdokumentasi: `FORECAST_MIN_DAYS`, `FORECAST_MIN_READINGS`, `FORECAST_HORIZON_H`, `FORECAST_NOT_REC_SCORE`, `ANOMALY_K`, `ANOMALY_MIN_STD`, `CONFIDENCE_LOW`, `STREAK_MILESTONES`, `LEVEL_THRESHOLDS`, `SKIN_SCAN_REMINDER_DAYS`, `AI_TIMEOUT_MS`, `PDF_RANGE_BUDGET_MS`, dan `ECO_DEFAULTS`
    - Ekspos sebagai namespace global (mis. `AquaConfig`)
    - _Requirements: 1.3, 1.6, 2.2, 2.3, 6.3, 6.7, 7.5, 5.10, 3.6, 9.8, 11.5_

- [x] 2. Implementasi Sensor Integration Module (5 parameter: TDS & klorin)
  - [x] 2.1 Implementasi modul `AquaSensors` di `sensors.js`
    - Implementasikan `parseReading()`, `isAvailable()`, `isPhysicallyValid()`, `classifyStatus()` membaca TDS & klorin dari `/sensors` bersama pH/suhu/turbidity
    - Nilai hilang dikembalikan sebagai `null` (bukan placeholder); nilai 0 dianggap valid dan tersedia
    - Gunakan rentang & status dari `data/thresholds.json`
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 2.2 Tulis property test untuk ketersediaan parameter
    - **Property 18: Ketersediaan parameter membedakan nilai hilang dari nol**
    - **Validates: Requirements 4.1, 4.2**
  - [x] 2.3 Perluas penyimpanan sesi dengan TDS & klorin
    - Perluas `saveCurrentSession()` dan model `aquent-sessions` di `app.js` agar menyertakan field `tds` dan `chlorine`
    - Pastikan pembacaan kembali sesi mengembalikan nilai yang sama
    - _Requirements: 4.9_
  - [x] 2.4 Tulis property test untuk round-trip penyimpanan sesi
    - **Property 23: Round-trip penyimpanan sesi mempertahankan TDS dan klorin**
    - **Validates: Requirements 4.9, 5.1**
  - [x] 2.5 Tulis unit test untuk validitas fisik & klasifikasi status
    - Uji `isPhysicallyValid` (nilai 0 valid, nilai di luar rentang invalid) dan `classifyStatus` (low/normal/high/unavailable)
    - _Requirements: 4.3_

- [x] 3. Implementasi XAI Engine (lintas-fitur)
  - [x] 3.1 Implementasi atribusi & confidence `AquaXAI` di `xai.js`
    - Implementasikan `attributeScore()` (kontribusi = bobot × defisit, dinormalisasi 100%, deterministik), `sideFactors()` (TDS & klorin bobot 0% + alasan), dan `confidence()`
    - Gunakan bobot dari `data/thresholds.json` dan `calcQualityScore()` eksisting
    - _Requirements: 11.1, 11.2, 4.5, 11.4, 11.7_
  - [x] 3.2 Implementasi `explainFactor()` narasi + rujukan
    - Hasilkan teks naratif + saran tindakan dari template XAI dan rujukan ilmiah dari `data/references.json`; sertakan jalur TDS/klorin di luar rentang aman
    - _Requirements: 4.4, 11.3_
  - [x] 3.3 Tulis property test untuk normalisasi atribusi
    - **Property 59: Atribusi faktor XAI ternormalisasi 100%**
    - **Validates: Requirements 11.1**
  - [x] 3.4 Tulis property test untuk determinisme XAI
    - **Property 62: Determinisme atribusi XAI untuk masukan identik**
    - **Validates: Requirements 11.7**
  - [x] 3.5 Tulis property test untuk independensi WQS terhadap TDS/klorin
    - **Property 19: WQS independen terhadap TDS dan klorin**
    - **Validates: Requirements 4.5, 11.4**
  - [x] 3.6 Tulis property test untuk peringatan ketidakpastian tinggi
    - **Property 61: Peringatan ketidakpastian tinggi di bawah ambang confidence**
    - **Validates: Requirements 11.5**
  - [x] 3.7 Tulis property test untuk penjelasan parameter di luar rentang aman
    - **Property 20: Penjelasan XAI dihasilkan untuk parameter di luar rentang aman**
    - **Validates: Requirements 4.4**
  - [x] 3.8 Tulis property test untuk narasi + rujukan faktor
    - **Property 60: Penjelasan faktor memuat narasi dan rujukan**
    - **Validates: Requirements 11.3**

- [x] 4. Implementasi Notification Center
  - [x] 4.1 Implementasi `AquaNotif` di `notifications.js`
    - Implementasikan `add()`, `list()`, `unreadCount()`, `markRead()`, `markAllRead()`, `remove()` dengan penyimpanan `aquent-notifications-{profileId}` per profil
    - Daftar terurut terbaru-dulu; dukung filter kategori (water_quality/gamification/reminder/education)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  - [x] 4.2 Tulis property test untuk urutan daftar
    - **Property 43: Daftar notifikasi terurut terbaru-dulu**
    - **Validates: Requirements 8.1**
  - [x] 4.3 Tulis property test untuk round-trip tambah/hapus
    - **Property 44: Round-trip tambah/hapus notifikasi**
    - **Validates: Requirements 8.2, 8.7**
  - [x] 4.4 Tulis property test untuk cacah belum dibaca
    - **Property 45: Jumlah belum dibaca sama dengan cacah notifikasi belum dibaca**
    - **Validates: Requirements 8.3**
  - [x] 4.5 Tulis property test untuk markRead
    - **Property 46: Menandai dibaca mengurangi cacah belum dibaca**
    - **Validates: Requirements 8.4**
  - [x] 4.6 Tulis property test untuk markAllRead idempoten
    - **Property 47: Tandai semua dibaca bersifat idempoten**
    - **Validates: Requirements 8.5**
  - [x] 4.7 Tulis property test untuk filter kategori
    - **Property 48: Filter kategori hanya mengembalikan kategori terpilih**
    - **Validates: Requirements 8.6**
  - [x] 4.8 Tulis property test untuk isolasi antar profil
    - **Property 49: Isolasi notifikasi antar profil**
    - **Validates: Requirements 8.8**

- [ ] 5. Checkpoint - Pastikan seluruh tes lulus
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implementasi Anomaly Detector
  - [x] 6.1 Implementasi `AquaAnomaly` di `anomaly.js`
    - Implementasikan `computeBaseline()` (rolling mean ± σ window 7 hari, gunakan `ANOMALY_MIN_STD` saat window konstan), `isAnomaly()` (|value−mean| > k·std), dan `evaluate()`
    - Kecualikan pembacaan di luar rentang fisik `thresholds.json` dari baseline
    - Picu jalur ambang khusus TDS > 300 ppm dan klorin di luar [0.1, 0.5]
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 4.6, 4.7_
  - [x] 6.2 Tulis property test untuk baseline vs statistik rujukan
    - **Property 6: Baseline cocok dengan statistik rujukan**
    - **Validates: Requirements 2.1**
  - [x] 6.3 Tulis property test untuk deviasi standar minimum
    - **Property 7: Deviasi standar minimum positif untuk window konstan**
    - **Validates: Requirements 2.2**
  - [x] 6.4 Tulis property test untuk ambang z-score
    - **Property 8: Ambang anomali z-score**
    - **Validates: Requirements 2.3**
  - [x] 6.5 Tulis property test untuk eksklusi pembacaan tak-valid
    - **Property 10: Pembacaan tak-valid fisik dikeluarkan dari baseline**
    - **Validates: Requirements 2.6**
  - [x] 6.6 Tulis property test untuk pemetaan alert TDS & klorin
    - **Property 21: Pemetaan alert TDS dan klorin berbasis ambang**
    - **Validates: Requirements 4.6, 4.7**

- [ ] 7. Implementasi Alert Manager
  - [x] 7.1 Implementasi `AquaAlerts` di `alerts.js`
    - Implementasikan `createAlert()` (memuat param, nilai, baseline, severity), `classify()`, `dispatch()` (catat ke Notification_Center, hormati preferensi `aquent-alert-prefs`), `isSuppressed()`
    - Gunakan template dari `data/notification_templates.json`
    - _Requirements: 2.4, 2.5, 2.8, 2.9_
  - [ ] 7.2 Tulis property test untuk atribut wajib alert
    - **Property 9: Alert anomali memuat seluruh atribut wajib**
    - **Validates: Requirements 2.4, 2.5**
  - [ ] 7.3 Tulis property test untuk dispatch menghormati preferensi
    - **Property 11: Dispatch alert menghormati preferensi kategori**
    - **Validates: Requirements 2.8, 2.9**

- [ ] 8. Implementasi Forecasting Engine
  - [x] 8.1 Implementasi `AquaForecast` di `forecasting.js`
    - Implementasikan `linearFit()`, `seasonalProfile()`, `computeConfidence()`, dan `forecast()` (proyeksi 5 parameter + `projectedScore` via `calcQualityScore()`, gerbang kecukupan data, flag `notRecommended` saat skor < 60)
    - Perlakukan nilai 0 sebagai valid; jangan buang nilai nol dalam rentang fisik
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [ ] 8.2 Tulis property test untuk output well-formed
    - **Property 1: Forecast menghasilkan output well-formed**
    - **Validates: Requirements 1.1, 1.2**
  - [-] 8.3 Tulis property test untuk gerbang kecukupan data
    - **Property 2: Gerbang kecukupan data peramalan**
    - **Validates: Requirements 1.3**
  - [-] 8.4 Tulis property test untuk perlakuan nilai nol
    - **Property 3: Nilai nol diperlakukan valid pada peramalan**
    - **Validates: Requirements 1.4**
  - [-] 8.5 Tulis property test untuk flag "tidak direkomendasikan"
    - **Property 4: Penandaan "tidak direkomendasikan"**
    - **Validates: Requirements 1.6**
  - [-] 8.6 Tulis property test untuk rentang confidence
    - **Property 5: Confidence selalu dalam rentang valid**
    - **Validates: Requirements 1.5, 11.2**
  - [ ] 8.7 Tulis benchmark test kinerja peramalan
    - Ukur `forecast()` untuk window 30 hari selesai < 2 detik
    - _Requirements: 1.9_

- [ ] 9. Checkpoint - Pastikan seluruh tes lulus
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implementasi AI Consultant sadar-konteks
  - [x] 10.1 Implementasi `AquaAI` di `ai-context.js`
    - Implementasikan `buildContext()` (sensor terkini + tipe kulit Active_Profile + ringkasan riwayat sesi), `truncateContext()`, `appendTurn()`, `send()` (preferensi bahasa, timeout 30s via `Promise.race`, tahan saat API key kosong)
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.8, 3.9_
  - [ ] 10.2 Tulis property test untuk konteks sensor + tipe kulit
    - **Property 12: Konteks AI memuat kondisi sensor dan tipe kulit**
    - **Validates: Requirements 3.1**
  - [ ] 10.3 Tulis property test untuk ringkasan riwayat sesi
    - **Property 13: Konteks AI memuat ringkasan riwayat sesi**
    - **Validates: Requirements 3.2**
  - [ ] 10.4 Tulis property test untuk riwayat percakapan terurut
    - **Property 14: Riwayat percakapan dipertahankan terurut**
    - **Validates: Requirements 3.3**
  - [ ] 10.5 Tulis property test untuk API key kosong menahan pengiriman
    - **Property 15: API key kosong menahan pengiriman**
    - **Validates: Requirements 3.5**
  - [ ] 10.6 Tulis property test untuk preferensi bahasa pada permintaan
    - **Property 16: Preferensi bahasa disertakan pada permintaan AI**
    - **Validates: Requirements 3.8**
  - [ ] 10.7 Tulis property test untuk pemangkasan konteks
    - **Property 17: Pemangkasan konteks menghormati ambang token**
    - **Validates: Requirements 3.9**
  - [ ] 10.8 Tulis integration test untuk error/timeout & disclaimer (mock fetch)
    - Uji pesan kesalahan saat gagal/timeout dan disclaimer non-medis muncul tiap sesi; verifikasi prompt mensitir parameter spesifik
    - _Requirements: 3.4, 3.6, 3.7_

- [ ] 11. Implementasi Skin Diary & Progress Tracker
  - [x] 11.1 Implementasi `AquaSkinDiary` di `skin-diary.js`
    - Implementasikan `saveEntry()` (metrik turunan saja ke `localStorage` per profil, tanpa citra mentah), `syncEntry()` (metrik saja ke Firestore, status `pending` saat gagal), `deleteEntry()` (atomik all-or-nothing), `needsScanReminder()`
    - Gunakan output pipeline lokal `analyzeImagePixels()` + `buildLocalScanResult()` eksisting
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.8, 5.10_
  - [-] 11.2 Implementasi `AquaProgress` di `skin-diary.js`
    - Implementasikan `trendSeries()` (filter rentang 7/30/90 hari), `delta()` (selisih entri terbaru vs sebelumnya), `alignWithWaterScore()` (selaras jendela waktu dengan WQS)
    - _Requirements: 5.5, 5.6, 5.7_
  - [ ] 11.3 Tulis property test untuk tidak ada citra mentah
    - **Property 24: Tidak ada citra mentah pada payload tersimpan, sinkron, atau ekspor**
    - **Validates: Requirements 5.2, 5.3, 10.3**
  - [ ] 11.4 Tulis property test untuk status tertunda saat sinkron gagal
    - **Property 25: Sinkron gagal menghasilkan status tertunda**
    - **Validates: Requirements 5.4**
  - [ ] 11.5 Tulis property test untuk penghapusan atomik
    - **Property 29: Penghapusan entri bersifat atomik (all-or-nothing)**
    - **Validates: Requirements 5.8**
  - [ ] 11.6 Tulis property test untuk pengingat pemindaian
    - **Property 30: Pengingat pemindaian berdasarkan usia entri terbaru**
    - **Validates: Requirements 5.10**
  - [ ] 11.7 Tulis property test untuk filter tren rentang waktu
    - **Property 26: Tren metrik kulit tersaring oleh rentang waktu**
    - **Validates: Requirements 5.5**
  - [ ] 11.8 Tulis property test untuk delta metrik
    - **Property 27: Delta metrik antar entri benar**
    - **Validates: Requirements 5.6**
  - [ ] 11.9 Tulis property test untuk penyelarasan tren kulit & WQS
    - **Property 28: Penyelarasan tren kulit dan WQS berbagi jendela waktu**
    - **Validates: Requirements 5.7**

- [ ] 12. Checkpoint - Pastikan seluruh tes lulus
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implementasi Gamification Engine
  - [x] 13.1 Implementasi `AquaGamify` di `gamification.js`
    - Implementasikan `computeStreak()` (hari kalender berurutan, reset saat satu hari penuh terlewat), `milestoneReached()`, `evaluateChallenge()` (≥ 3 tantangan terukur), `levelForPoints()`, `buildLeaderboard()` (opt-in, display name tanpa email)
    - Catat notifikasi tonggak via Notification_Center; penyimpanan `aquent-gamify-{profileId}`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_
  - [ ] 13.2 Tulis property test untuk pertambahan streak
    - **Property 31: Streak bertambah pada hari kalender berurutan**
    - **Validates: Requirements 6.1**
  - [ ] 13.3 Tulis property test untuk reset streak
    - **Property 32: Streak reset setelah satu hari penuh terlewat**
    - **Validates: Requirements 6.2**
  - [ ] 13.4 Tulis property test untuk penghargaan tonggak streak
    - **Property 33: Penghargaan tonggak streak dan notifikasi**
    - **Validates: Requirements 6.3**
  - [ ] 13.5 Tulis property test untuk penyelesaian tantangan & poin
    - **Property 34: Penyelesaian tantangan dan penambahan poin**
    - **Validates: Requirements 6.5, 6.6**
  - [ ] 13.6 Tulis property test untuk pemetaan level
    - **Property 35: Level dipetakan dari total poin secara monoton**
    - **Validates: Requirements 6.7**
  - [ ] 13.7 Tulis property test untuk leaderboard opt-in
    - **Property 36: Papan peringkat hanya memuat peserta opt-in**
    - **Validates: Requirements 6.8, 6.9**
  - [ ] 13.8 Tulis property test untuk privasi identitas leaderboard
    - **Property 37: Identitas papan peringkat tidak mengekspos email**
    - **Validates: Requirements 6.10**

- [ ] 14. Implementasi Eco-Analytics Engine
  - [x] 14.1 Implementasi `AquaEco` di `eco-analytics.js`
    - Implementasikan `totalConsumption()` (0 valid), `estimateCost()` (liter × tarif, default terdokumentasi + tandai estimasi), `estimateCO2()` (faktor emisi, default terdokumentasi), `waterSaved()` (vs baseline dikonfigurasi)
    - Gunakan `ECO_DEFAULTS` dan preferensi `aquent-eco-prefs`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [-] 14.2 Tulis property test untuk total konsumsi
    - **Property 38: Total konsumsi air sama dengan jumlah volume periode**
    - **Validates: Requirements 7.1, 7.2**
  - [ ] 14.3 Tulis property test untuk linearitas biaya
    - **Property 39: Biaya air linear terhadap konsumsi dan tarif**
    - **Validates: Requirements 7.3**
  - [ ] 14.4 Tulis property test untuk linearitas emisi CO₂
    - **Property 40: Emisi CO₂ linear terhadap faktor emisi**
    - **Validates: Requirements 7.4**
  - [ ] 14.5 Tulis property test untuk default estimasi
    - **Property 41: Default terdokumentasi dipakai dan ditandai estimasi**
    - **Validates: Requirements 7.5**
  - [ ] 14.6 Tulis property test untuk air dihemat
    - **Property 42: Air dihemat dihitung terhadap baseline**
    - **Validates: Requirements 7.6**

- [ ] 15. Checkpoint - Pastikan seluruh tes lulus
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Implementasi Report Exporter (PDF)
  - [ ] 16.1 Muat jsPDF dan implementasi `AquaReport` di `report-export.js`
    - Tambahkan `<script>` jsPDF (+ jspdf-autotable) via CDN di `app.html` mengikuti pola Chart.js
    - Implementasikan `buildReportModel()` (WQS, 5 parameter, atribusi XAI, rentang waktu, stempel waktu, nama profil, disclaimer, data kulit kondisional, keterangan data hilang) dan `renderPDF()` (Blob di klien tanpa jaringan)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7_
  - [ ] 16.2 Tulis property test untuk PDF dihasilkan dari model valid
    - **Property 50: PDF dihasilkan untuk model laporan yang valid**
    - **Validates: Requirements 9.1**
  - [ ] 16.3 Tulis property test untuk seksi wajib model laporan
    - **Property 51: Model laporan memuat seksi wajib**
    - **Validates: Requirements 9.2, 9.4, 9.7**
  - [ ] 16.4 Tulis property test untuk inklusi data kulit kondisional
    - **Property 52: Inklusi data kulit bersifat kondisional**
    - **Validates: Requirements 9.3**
  - [ ] 16.5 Tulis property test untuk degradasi anggun saat data kurang
    - **Property 54: Degradasi anggun saat data kurang**
    - **Validates: Requirements 9.6**
  - [ ] 16.6 Tulis property test untuk bahasa laporan saat ekspor
    - **Property 53: Laporan menggunakan bahasa antarmuka saat ekspor**
    - **Validates: Requirements 9.5**
  - [ ] 16.7 Tulis benchmark test pembuatan PDF
    - Ukur pembuatan PDF rentang 30 hari selesai < 5 detik
    - _Requirements: 9.8_

- [ ] 17. Implementasi Data Exporter (Portabilitas/JSON)
  - [x] 17.1 Implementasi `AquaDataExport` di `data-export.js`
    - Implementasikan `collect()` (sesi, profil, survei, badge, entri Skin Diary, notifikasi; best-effort dengan `failures[]`) dan `buildExport()` (JSON + stempel waktu + pengenal pengguna, kecualikan citra mentah, tahan berkas saat gagal total)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  - [ ] 17.2 Tulis property test untuk kelengkapan koleksi data
    - **Property 55: Ekspor mengumpulkan seluruh kategori data yang tersedia**
    - **Validates: Requirements 10.1**
  - [ ] 17.3 Tulis property test untuk round-trip serialisasi JSON
    - **Property 56: Round-trip serialisasi JSON ekspor**
    - **Validates: Requirements 10.2, 10.4**
  - [ ] 17.4 Tulis property test untuk kegagalan sebagian
    - **Property 57: Kegagalan sebagian melaporkan bagian gagal dan tetap mengekspor data sukses**
    - **Validates: Requirements 10.5**
  - [ ] 17.5 Tulis property test untuk kegagalan total
    - **Property 58: Kegagalan total menahan pembuatan berkas**
    - **Validates: Requirements 10.6**

- [ ] 18. Integrasi UI & penyambungan akhir
  - [ ] 18.1 Muat seluruh modul engine baru di `app.html`
    - Tambahkan `<script>` untuk `config.js`, `sensors.js`, `xai.js`, `notifications.js`, `anomaly.js`, `alerts.js`, `forecasting.js`, `ai-context.js`, `skin-diary.js`, `gamification.js`, `eco-analytics.js`, `report-export.js`, `data-export.js` setelah `app.js`
    - _Requirements: Batasan Arsitektur (vanilla JS, pemuatan modul)_
  - [ ] 18.2 Render kartu sensor TDS & klorin dan panel peramalan di Dashboard
    - Tambahkan kartu sensor TDS & klorin (nilai/satuan/status, "tidak tersedia" saat hilang) dan satu line chart Chart.js untuk historis + proyeksi (garis putus-putus)
    - Sambungkan alert kritis agar tampil ≤ 3 detik pada event `aquent:newReading`
    - _Requirements: 4.3, 1.7, 2.7_
  - [ ] 18.3 Sambungkan event antar-modul (sensor → anomali → alert → notifikasi → XAI)
    - Hubungkan `AquaSensors` → `AquaAnomaly` → `AquaAlerts` → `AquaNotif`, dan jalur `AquaXAI` untuk atribusi + side factors; tandai entri Encyclopedia "relevan sekarang" saat TDS/klorin di luar aman
    - _Requirements: 2.7, 2.8, 4.4, 4.8_
  - [ ] 18.4 Sambungkan UI Skin Diary, Gamifikasi, Eco-Analytics, dan Notification Center
    - Render tren Skin Diary, badge unread notifikasi, papan peringkat opt-in, grafik tren biaya/emisi Chart.js; pasang badge tonggak streak
    - _Requirements: 5.5, 5.6, 5.7, 6.8, 7.7, 8.3_
  - [ ] 18.5 Tambahkan tombol ekspor PDF & ekspor data di halaman akun
    - Pasang tombol Report Exporter dan Data Exporter di `account.html`; ekspor berjalan klien-saja tanpa panggilan pihak ketiga
    - _Requirements: 9.1, 10.7, 10.8_
  - [ ] 18.6 Terapkan i18n & disclaimer pada seluruh UI baru
    - Tambahkan kunci i18n ID/EN untuk seluruh label fitur baru via mekanisme `t()`/`applyI18n()`/event `langchange`; tampilkan disclaimer non-medis pada AI & laporan
    - _Requirements: 1.8, 3.7, 4.5, 5.9, 7.8, 8.9, 11.4, 11.6_
  - [ ] 18.7 Perbarui aturan keamanan Firestore
    - Tambahkan `match /users/{uid}/skinMetrics/{id}` (read/write hanya pemilik) dan `match /leaderboard/{uid}` (write pemilik, read publik peserta opt-in) di `firestore.rules`
    - _Requirements: 5.3, 6.8_
  - [ ] 18.8 Tulis integration test untuk render UI & i18n (jsdom)
    - Uji render kartu sensor TDS/klorin, grafik peramalan & eco, peralihan bahasa, akses tombol ekspor di halaman akun tanpa panggilan pihak ketiga
    - _Requirements: 4.3, 1.7, 1.8, 5.9, 7.7, 7.8, 8.9, 10.7, 10.8, 11.6_
  - [ ] 18.9 Tulis property test untuk penandaan relevansi Encyclopedia
    - **Property 22: Entri Encyclopedia ditandai relevan saat nilai di luar aman**
    - **Validates: Requirements 4.8**

- [ ] 19. Final checkpoint - Pastikan seluruh tes lulus
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Task bertanda `*` bersifat opsional (uji unit/properti/integrasi/benchmark) dan dapat dilewati untuk MVP lebih cepat.
- Setiap task merujuk requirement spesifik untuk keterlacakan.
- Setiap *Correctness Property* (1–62) dari desain diimplementasikan oleh satu property-based test (≥ 100 iterasi) dengan tag `// Feature: advanced-features-upgrade, Property {nomor}: {teks}`.
- Checkpoint memastikan validasi inkremental; jalankan tes dengan `vitest --run` (bukan watch mode).
- Property test divalidasi terhadap properti universal; unit/integration/benchmark test menangani UI, i18n, kinerja, dan integrasi LLM eksternal sesuai Testing Strategy.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.5", "3.2", "3.3", "3.4", "3.5", "3.6", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 3, "tasks": ["2.4", "3.7", "3.8", "6.1", "8.1", "10.1", "11.1", "13.1", "14.1", "17.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "6.4", "6.5", "6.6", "7.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "11.2", "11.3", "11.4", "11.5", "11.6", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "14.2", "14.3", "14.4", "14.5", "14.6", "17.2", "17.3", "17.4", "17.5"] },
    { "id": 5, "tasks": ["7.2", "7.3", "11.7", "11.8", "11.9", "16.1"] },
    { "id": 6, "tasks": ["16.2", "16.3", "16.4", "16.5", "16.6", "16.7"] },
    { "id": 7, "tasks": ["18.1"] },
    { "id": 8, "tasks": ["18.2", "18.5", "18.7"] },
    { "id": 9, "tasks": ["18.3"] },
    { "id": 10, "tasks": ["18.4"] },
    { "id": 11, "tasks": ["18.6"] },
    { "id": 12, "tasks": ["18.8", "18.9"] }
  ]
}
```
