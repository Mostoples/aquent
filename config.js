/* =====================================================
   AQUENT — Konstanta Konfigurasi Bersama (AquaConfig)
   Spec: advanced-features-upgrade

   Modul ini memusatkan seluruh konstanta numerik/ambang yang dipakai
   lintas engine baru (Forecasting, Anomaly, Alert, Gamification,
   Eco-Analytics, AI Consultant, Report Exporter, XAI). Memusatkan nilai
   di satu tempat menjaga konsistensi dan memudahkan keterlacakan ke
   acceptance criteria.

   Cara pakai:
   1. Browser (statis): tambahkan <script src="config.js"></script>
      sebelum app.js dan modul engine lain di app.html.
      Akses via global: AquaConfig.FORECAST_MIN_DAYS, dst.
   2. Pengujian (Vitest + jsdom): modul juga di-ekspor via module.exports
      sehingga dapat di-`require('../config.js')` atau diimpor.

   Pola pemuatan ini mengikuti gaya namespace global modul eksisting
   (mis. i18n.js, app.js) namun ditambah dukungan module.exports agar
   kompatibel dengan infrastruktur uji yang disiapkan di task 1.1.
   ===================================================== */

(function (root, factory) {
  'use strict';
  // Bangun namespace sekali (hindari double-load di browser).
  var AquaConfig = factory();

  // Ekspos sebagai global (browser window / jsdom / worker → globalThis).
  if (root && !root.AquaConfig) {
    root.AquaConfig = AquaConfig;
  }

  // Ekspos untuk lingkungan CommonJS (Vitest/Node) bila tersedia.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AquaConfig;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var AquaConfig = {
    // ----- Forecasting_Engine (R1) -----

    /**
     * Rentang minimal Historical_Window (hari) yang wajib tersedia sebelum
     * peramalan dihitung. Bagian dari gerbang kecukupan data.
     * Requirement 1.3
     * @type {number}
     */
    FORECAST_MIN_DAYS: 7,

    /**
     * Jumlah minimal Sensor_Reading valid yang wajib tersedia sebelum
     * peramalan dihitung. Bagian dari gerbang kecukupan data.
     * Requirement 1.3
     * @type {number}
     */
    FORECAST_MIN_READINGS: 24,

    /**
     * Horizon peramalan default dalam jam (proyeksi 24 jam ke depan).
     * Requirement 1.1
     * @type {number}
     */
    FORECAST_HORIZON_H: 24,

    /**
     * Ambang Water_Quality_Score proyeksi; di bawah nilai ini periode
     * ditandai "tidak direkomendasikan untuk mandi".
     * Requirement 1.6
     * @type {number}
     */
    FORECAST_NOT_REC_SCORE: 60,

    // ----- Anomaly_Detector (R2) -----

    /**
     * Faktor z-score (k) ambang anomali: |value − mean| > k · std.
     * Requirement 2.3
     * @type {number}
     */
    ANOMALY_K: 3,

    /**
     * Deviasi standar minimum positif yang dipakai saat seluruh nilai dalam
     * window identik (σ = 0), mencegah pembagian nol / seluruh nilai dianggap
     * anomali.
     * Requirement 2.2
     * @type {number}
     */
    ANOMALY_MIN_STD: 0.01,

    // ----- XAI_Engine (R11) -----

    /**
     * Ambang Confidence_Score (persen). Output dengan confidence di bawah
     * nilai ini ditandai sebagai "ketidakpastian tinggi".
     * Requirement 11.5
     * @type {number}
     */
    CONFIDENCE_LOW: 50,

    // ----- Gamification_Engine (R6) -----

    /**
     * Tonggak streak harian yang memberi penghargaan + notifikasi.
     * Requirement 6.3
     * @type {number[]}
     */
    STREAK_MILESTONES: [7, 14, 21, 30, 60, 100],

    /**
     * Ambang total poin untuk pemetaan level (monoton).
     * Indeks 0..3 → Bronze / Silver / Gold / Platinum.
     * Requirement 6.7
     * @type {number[]}
     */
    LEVEL_THRESHOLDS: [0, 100, 300, 500],

    // ----- Skin_Diary (R5) -----

    /**
     * Usia (hari) entri pemindaian terbaru yang memicu pengingat pemindaian
     * berkala. Entri lebih tua dari nilai ini → tampilkan pengingat.
     * Requirement 5.10
     * @type {number}
     */
    SKIN_SCAN_REMINDER_DAYS: 14,

    // ----- AI_Consultant (R3) -----

    /**
     * Batas waktu (milidetik) permintaan ke layanan AI; melebihi nilai ini
     * dianggap timeout dan menampilkan pesan kesalahan.
     * Requirement 3.6
     * @type {number}
     */
    AI_TIMEOUT_MS: 30000,

    // ----- Report_Exporter (R9) -----

    /**
     * Anggaran waktu (milidetik) pembuatan PDF untuk rentang laporan 30 hari.
     * Requirement 9.8
     * @type {number}
     */
    PDF_RANGE_BUDGET_MS: 5000,

    // ----- Eco_Analytics_Engine (R7) -----

    /**
     * Nilai default terdokumentasi untuk Eco-Analytics, dipakai bila pengguna
     * belum mengatur preferensi. Hasil yang memakai default ini ditandai
     * sebagai estimasi.
     * Requirement 7.5
     * @property {number} ratePerLiter            Tarif air per liter (mata uang lokal, contoh tarif PDAM).
     * @property {number} emissionFactor          Faktor emisi (kg CO2 per liter air panas).
     * @property {number} baselineLitersPerSession Baseline konsumsi air per sesi (liter) untuk perhitungan penghematan.
     * @property {string} currency                Kode mata uang default.
     */
    ECO_DEFAULTS: {
      ratePerLiter: 0.005,
      emissionFactor: 0.0002,
      baselineLitersPerSession: 60,
      currency: 'IDR'
    }
  };

  // Bekukan agar konstanta tidak termutasi secara tidak sengaja saat runtime.
  // Bekukan juga objek/array bersarang (freeze dangkal tidak cukup).
  if (Object.freeze) {
    Object.freeze(AquaConfig.STREAK_MILESTONES);
    Object.freeze(AquaConfig.LEVEL_THRESHOLDS);
    Object.freeze(AquaConfig.ECO_DEFAULTS);
    Object.freeze(AquaConfig);
  }

  return AquaConfig;
});
