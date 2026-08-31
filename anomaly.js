/* =====================================================
   AQUENT — Anomaly_Detector (AquaAnomaly)
   Spec: advanced-features-upgrade — Task 6.1
   Requirements: 2.1, 2.2, 2.3, 2.6, 4.6, 4.7

   Modul deteksi anomali sisi-klien. Pendekatan: z-score terhadap rata-rata
   bergerak (rolling mean ± k·σ) atas Historical_Window 7 hari — deterministik
   dan explainable (sejalan kebutuhan transparansi XAI). API:

     - computeBaseline(history, param, TH)
         Baseline {mean, std, count} per parameter dari window 7 hari.
         · mean  = rata-rata aritmetika nilai valid dalam window         (R2.1)
         · std   = deviasi standar POPULASI window                        (R2.1)
         · Bila window konstan (σ = 0) → std = ANOMALY_MIN_STD positif    (R2.2)
         · Pembacaan di luar rentang FISIK thresholds.json dikecualikan   (R2.6)

     - isAnomaly(value, baseline, k)
         True jika dan hanya jika |value − mean| > k · std (k = ANOMALY_K). (R2.3)

     - evaluate(reading, history, TH)
         Entry utama: gabungkan baseline + z-score → daftar anomali, dan
         picu jalur ambang khusus:
           · TDS > 300 ppm                 → 'hard_water'   (R4.6)
           · klorin > 0.5 mg/L             → 'chlorine_high'(R4.7)
           · klorin < 0.1 mg/L             → 'chlorine_low' (R4.7)
         Nilai tak-valid fisik pada reading dikecualikan dari jalur z-score. (R2.6)

   CATATAN — rentang FISIK vs rentang AMAN:
     thresholds.json `min`/`max` adalah rentang AMAN (mis. TDS 0–300). Itu
     BUKAN batas fisik sensor. Pembacaan di luar rentang aman tetap pengukuran
     nyata (mis. TDS 350 → alert air sadah, BUKAN dibuang). Validitas FISIK
     memakai batas plausibilitas sensor yang lebih lebar (PHYSICAL_LIMITS,
     selaras sensors.js), dengan batas bawah 0 sehingga nilai 0 selalu valid.

   Pola pemuatan mengikuti config.js / xai.js: namespace global `AquaAnomaly`
   + dukungan module.exports agar dapat diuji via Vitest. Konstanta ANOMALY_K
   & ANOMALY_MIN_STD dibaca dari AquaConfig saat runtime (lazy) dengan fallback
   terdokumentasi, dan validitas fisik memakai AquaSensors bila tersedia.
   ===================================================== */

(function (root, factory) {
  'use strict';
  var AquaAnomaly = factory(root);

  // Ekspos sebagai global (browser window / jsdom / worker → globalThis).
  if (root && !root.AquaAnomaly) {
    root.AquaAnomaly = AquaAnomaly;
  }

  // Ekspos untuk lingkungan CommonJS (Vitest/Node) bila tersedia.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root && root.AquaAnomaly ? root.AquaAnomaly : AquaAnomaly;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konstanta lokal
  // ---------------------------------------------------------------------------

  /** Milidetik per hari kalender. */
  var MS_PER_DAY = 86400000;

  /**
   * Rentang Historical_Window untuk baseline anomali (hari). Requirement 2.1.
   * (R2.1 menetapkan window 7 hari; tidak ada konstanta khusus di config.js,
   * jadi didefinisikan & didokumentasikan di sini.)
   */
  var WINDOW_DAYS = 7;
  var WINDOW_MS = WINDOW_DAYS * MS_PER_DAY;

  /**
   * Jumlah minimum pembacaan valid dalam baseline sebelum jalur z-score
   * dijalankan oleh evaluate(). Dengan < 2 nilai, dispersi tidak bermakna
   * (std jatuh ke ANOMALY_MIN_STD) sehingga hampir semua pembacaan akan
   * tampak anomali — itu derau, bukan sinyal. Jalur ambang khusus TDS/klorin
   * TIDAK tunduk pada gerbang ini (murni berbasis ambang).
   */
  var MIN_BASELINE_COUNT = 2;

  /** Fallback default terdokumentasi bila AquaConfig belum dimuat. */
  var DEFAULT_K = 3;          // Requirement 2.3
  var DEFAULT_MIN_STD = 0.01; // Requirement 2.2

  /**
   * Batas plausibilitas FISIK sensor (di-key dengan kunci threshold), selaras
   * dengan PHYSICAL_LIMITS di sensors.js. Dipakai sebagai fallback ketika
   * AquaSensors belum dimuat. Batas bawah 0 → nilai 0 selalu valid.
   */
  var PHYSICAL_LIMITS = {
    ph: { min: 0, max: 14 },
    temp: { min: 0, max: 100 },
    turbidity: { min: 0, max: 4000 },
    tds: { min: 0, max: 5000 },
    chlorine: { min: 0, max: 10 }
  };

  /** Parameter kanonik pada SensorReading (urutan tampilan kartu sensor). */
  var PARAMS = ['ph', 'temperature', 'turbidity', 'tds', 'chlorine'];

  // Ambang default jalur khusus (selaras thresholds.json; fallback bila TH kosong).
  var DEFAULT_TDS_MAX = 300;      // R4.6 — air sadah
  var DEFAULT_CHLORINE_MAX = 0.5; // R4.7 — klorin tinggi
  var DEFAULT_CHLORINE_MIN = 0.1; // R4.7 — klorin rendah

  // ---------------------------------------------------------------------------
  // Utilitas
  // ---------------------------------------------------------------------------

  /** Konversi ke angka berhingga, atau null bila tidak valid (NaN/Infinity/non-numerik). */
  function numericOrNull(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string') {
      var s = raw.trim();
      if (s === '') return null;
      var n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  /** Petakan nama parameter ke kunci kanonik thresholds, atau null bila asing. */
  function canonicalKey(param) {
    switch (String(param || '').toLowerCase()) {
      case 'ph':
        return 'ph';
      case 'temp':
      case 'temperature':
        return 'temp';
      case 'turbidity':
        return 'turbidity';
      case 'tds':
        return 'tds';
      case 'chlorine':
        return 'chlorine';
      default:
        return null;
    }
  }

  /** Baca nilai parameter dari objek reading (toleran alias temp/temperature). */
  function readParamValue(reading, param) {
    if (!reading || typeof reading !== 'object') return undefined;
    var p = String(param || '').toLowerCase();
    if (p === 'temp' || p === 'temperature') {
      return reading.temperature !== undefined ? reading.temperature : reading.temp;
    }
    return reading[p];
  }

  /** Ambil entri threshold untuk sebuah parameter (toleran ejaan temp/temperature). */
  function thresholdFor(param, TH) {
    if (!TH) return undefined;
    var key = canonicalKey(param);
    if (!key) return undefined;
    return TH[key] !== undefined ? TH[key] : TH[param];
  }

  /** Baca angka dari TH[key][field], atau fallback bila tak tersedia. */
  function thresholdNumber(TH, key, field, fallback) {
    var entry = TH && TH[key];
    if (entry && typeof entry[field] === 'number' && Number.isFinite(entry[field])) {
      return entry[field];
    }
    return fallback;
  }

  /** Faktor z-score k aktif (AquaConfig.ANOMALY_K) dengan fallback terdokumentasi. */
  function configK() {
    var cfg = (root && root.AquaConfig) || (typeof AquaConfig !== 'undefined' ? AquaConfig : null);
    if (cfg && typeof cfg.ANOMALY_K === 'number' && Number.isFinite(cfg.ANOMALY_K)) {
      return cfg.ANOMALY_K;
    }
    return DEFAULT_K;
  }

  /** Deviasi standar minimum positif (AquaConfig.ANOMALY_MIN_STD) dengan fallback. */
  function configMinStd() {
    var cfg = (root && root.AquaConfig) || (typeof AquaConfig !== 'undefined' ? AquaConfig : null);
    if (cfg && typeof cfg.ANOMALY_MIN_STD === 'number' && cfg.ANOMALY_MIN_STD > 0) {
      return cfg.ANOMALY_MIN_STD;
    }
    return DEFAULT_MIN_STD;
  }

  /**
   * Validitas FISIK sebuah nilai. Pakai AquaSensors.isPhysicallyValid bila
   * tersedia (sumber kebenaran tunggal), jika tidak gunakan fallback inline
   * yang setara. Nilai 0 valid; di luar rentang fisik (negatif, pH > 14, dst.)
   * tidak valid. Dipakai untuk mengecualikan pembacaan tak-valid dari baseline.
   * Requirement 2.6
   */
  function isPhysicallyValidValue(param, value, TH) {
    var AS = (root && root.AquaSensors) || (typeof AquaSensors !== 'undefined' ? AquaSensors : null);
    if (AS && typeof AS.isPhysicallyValid === 'function') {
      return AS.isPhysicallyValid(param, value, TH);
    }
    // Fallback inline (mirror sensors.js).
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    var key = canonicalKey(param);
    var limit = key && PHYSICAL_LIMITS[key];
    if (!limit) return false;
    // Bila thresholds.json disediakan, parameter harus dikenal di sana juga.
    if (TH && !thresholdFor(param, TH)) return false;
    return value >= limit.min && value <= limit.max;
  }

  /**
   * Ekstraksi nilai parameter yang VALID secara fisik dan berada dalam
   * Historical_Window 7 hari. Menerima array SensorReading (objek) maupun
   * array angka mentah.
   *   - Objek  : ambil reading[param] + reading.ts.
   *   - Angka  : diperlakukan sebagai nilai tanpa stempel waktu.
   * Window 7 hari di-anchor pada stempel waktu TERBARU yang ditemukan; bila
   * tidak ada stempel waktu sama sekali, seluruh nilai valid dipakai.
   *
   * @returns {number[]} nilai-nilai valid dalam window (urutan dipertahankan)
   */
  function extractWindowValues(history, param, TH) {
    if (!Array.isArray(history)) return [];

    var entries = [];
    for (var i = 0; i < history.length; i++) {
      var item = history[i];
      var value;
      var ts;
      if (typeof item === 'number') {
        value = item;
        ts = null;
      } else if (item && typeof item === 'object') {
        value = numericOrNull(readParamValue(item, param));
        ts = numericOrNull(item.ts);
      } else {
        continue;
      }
      if (!isPhysicallyValidValue(param, value, TH)) continue; // R2.6
      entries.push({ value: value, ts: ts });
    }

    // Filter window 7 hari bila ada stempel waktu (R2.1).
    var maxTs = null;
    for (var j = 0; j < entries.length; j++) {
      if (entries[j].ts !== null && (maxTs === null || entries[j].ts > maxTs)) {
        maxTs = entries[j].ts;
      }
    }

    var out = [];
    for (var m = 0; m < entries.length; m++) {
      var e = entries[m];
      if (maxTs === null || e.ts === null || e.ts >= maxTs - WINDOW_MS) {
        out.push(e.value);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // API publik
  // ---------------------------------------------------------------------------

  /**
   * Hitung Baseline per parameter dari Historical_Window 7 hari. Requirement 2.1, 2.2, 2.6
   *
   * @param {Array<Object|number>} history  Riwayat SensorReading (atau angka).
   * @param {string} param                  Nama parameter (ph/temperature/temp/turbidity/tds/chlorine).
   * @param {Object} [TH]                    thresholds.json (untuk eksklusi nilai tak-valid fisik).
   * @returns {{mean:number, std:number, count:number}}
   *          mean = rata-rata aritmetika; std = deviasi standar populasi
   *          (≥ ANOMALY_MIN_STD bila window konstan); count = jumlah nilai valid.
   */
  function computeBaseline(history, param, TH) {
    var values = extractWindowValues(history, param, TH);
    var n = values.length;
    var minStd = configMinStd();

    if (n === 0) {
      // Tidak ada data valid: baseline netral dengan std minimum positif.
      return { mean: 0, std: minStd, count: 0 };
    }

    var sum = 0;
    var minV = values[0];
    var maxV = values[0];
    for (var i = 0; i < n; i++) {
      var x = values[i];
      sum += x;
      if (x < minV) minV = x;
      if (x > maxV) maxV = x;
    }
    var mean = sum / n;

    var sq = 0;
    for (var j = 0; j < n; j++) {
      var d = values[j] - mean;
      sq += d * d;
    }
    var variance = sq / n; // deviasi standar POPULASI (÷N)
    var std = Math.sqrt(variance);

    // Window konstan → pakai deviasi standar minimum positif. R2.2
    //
    // Deteksi "konstan" lewat RENTANG nilai (maxV − minV === 0), BUKAN lewat
    // std hasil hitung. Untuk window yang seluruh nilainya identik namun bukan
    // bilangan yang terbagi rata (mis. tujuh kali 0.34), pembulatan penjumlahan
    // membuat `mean` sedikit melenceng sehingga menyisakan variance residual
    // amat kecil (std ≈ 5.55e-17 > 0). Guard lama `!(std > 0)` hanya menangkap
    // std yang TEPAT nol, sehingga residual itu lolos dan ANOMALY_MIN_STD
    // (lantai minimum untuk window konstan) terlewati. Memeriksa rentang nilai
    // mendeteksi window konstan secara robust tanpa menyentuh window yang
    // benar-benar bervariasi (std-nya tetap apa adanya). `!(std > 0)`
    // dipertahankan sebagai jaring pengaman defensif (mis. NaN).
    if (maxV - minV === 0 || !(std > 0)) std = minStd;

    return { mean: mean, std: std, count: n };
  }

  /**
   * True jika dan hanya jika |value − mean| > k · std. Requirement 2.3
   * Implementasi murni dari ambang z-score (tanpa substitusi std), sehingga
   * setara persis dengan definisi formal. Pemanggil sebaiknya memakai baseline
   * dari computeBaseline() yang std-nya sudah ≥ ANOMALY_MIN_STD.
   *
   * @param {number} value                Nilai terukur.
   * @param {{mean:number, std:number}} baseline  Baseline.
   * @param {number} [k]                   Faktor z-score (default ANOMALY_K = 3).
   * @returns {boolean}
   */
  function isAnomaly(value, baseline, k) {
    if (!baseline || typeof baseline !== 'object') return false;
    var kk = (typeof k === 'number' && Number.isFinite(k)) ? k : configK();
    var v = Number(value);
    var mean = Number(baseline.mean);
    var std = Number(baseline.std);
    if (!Number.isFinite(v) || !Number.isFinite(mean) || !Number.isFinite(std)) return false;
    return Math.abs(v - mean) > kk * std;
  }

  /** Klasifikasi severity z-score berdasarkan jumlah σ. */
  function zScoreSeverity(deviations, k) {
    // ≥ 2k σ (mis. ≥ 6σ saat k=3) → kritis; selebihnya (> k σ) → peringatan.
    return deviations >= 2 * k ? 'critical' : 'warning';
  }

  /** Tambahkan anomali jalur ambang khusus bila ambang terlampaui. */
  function pushThresholdAnomaly(out, reading, history, TH, param, type) {
    var value = numericOrNull(readParamValue(reading, param));
    if (value === null) return; // parameter tidak tersedia → tidak bisa melampaui ambang

    var limit;
    var breached;
    if (type === 'hard_water') {
      limit = thresholdNumber(TH, 'tds', 'max', DEFAULT_TDS_MAX);
      breached = value > limit; // R4.6 — TDS > 300 ppm
    } else if (type === 'chlorine_high') {
      limit = thresholdNumber(TH, 'chlorine', 'max', DEFAULT_CHLORINE_MAX);
      breached = value > limit; // R4.7 — klorin > 0.5 mg/L
    } else if (type === 'chlorine_low') {
      limit = thresholdNumber(TH, 'chlorine', 'min', DEFAULT_CHLORINE_MIN);
      breached = value < limit; // R4.7 — klorin < 0.1 mg/L
    } else {
      return;
    }
    if (!breached) return;

    var baseline = computeBaseline(history, param, TH);
    var deviations = baseline.std > 0 ? Math.abs(value - baseline.mean) / baseline.std : 0;

    out.push({
      param: param,
      value: value,
      baseline: baseline.mean,
      std: baseline.std,
      deviations: deviations,
      severity: 'warning',
      type: type,
      threshold: limit
    });
  }

  /**
   * Evaluasi satu Sensor_Reading → daftar anomali. Requirement 2.3, 2.6, 4.6, 4.7
   * Menggabungkan:
   *   (a) jalur z-score per parameter (mengecualikan nilai tak-valid fisik), dan
   *   (b) jalur ambang khusus TDS/klorin (murni berbasis ambang).
   *
   * @param {Object} reading                 Sensor_Reading terkini.
   * @param {Array<Object|number>} history    Riwayat untuk baseline.
   * @param {Object} [TH]                      thresholds.json.
   * @returns {Array<Object>} daftar anomali (lihat bentuk objek di pushThresholdAnomaly / di bawah).
   */
  function evaluate(reading, history, TH) {
    var anomalies = [];
    if (!reading || typeof reading !== 'object') return anomalies;

    var k = configK();

    // (a) Jalur z-score untuk kelima parameter.
    for (var i = 0; i < PARAMS.length; i++) {
      var param = PARAMS[i];
      var value = numericOrNull(readParamValue(reading, param));
      if (value === null) continue;                                 // tidak tersedia
      if (!isPhysicallyValidValue(param, value, TH)) continue;      // tak-valid fisik → bukan anomali (R2.6)

      var baseline = computeBaseline(history, param, TH);
      if (baseline.count < MIN_BASELINE_COUNT) continue;            // data tak cukup untuk menilai

      if (isAnomaly(value, baseline, k)) {                          // R2.3
        var deviations = baseline.std > 0 ? Math.abs(value - baseline.mean) / baseline.std : 0;
        anomalies.push({
          param: param,
          value: value,
          baseline: baseline.mean,
          std: baseline.std,
          deviations: deviations,
          severity: zScoreSeverity(deviations, k),
          type: 'zscore',
          threshold: null
        });
      }
    }

    // (b) Jalur ambang khusus TDS & klorin (R4.6, R4.7).
    pushThresholdAnomaly(anomalies, reading, history, TH, 'tds', 'hard_water');
    pushThresholdAnomaly(anomalies, reading, history, TH, 'chlorine', 'chlorine_high');
    pushThresholdAnomaly(anomalies, reading, history, TH, 'chlorine', 'chlorine_low');

    return anomalies;
  }

  return {
    PARAMS: PARAMS,
    WINDOW_DAYS: WINDOW_DAYS,
    computeBaseline: computeBaseline,
    isAnomaly: isAnomaly,
    evaluate: evaluate
  };
});
