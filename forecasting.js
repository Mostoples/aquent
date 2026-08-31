/* =====================================================
   AQUENT — Forecasting_Engine (AquaForecast)
   Spec: advanced-features-upgrade — Task 8.1 (Requirement 1)

   Analitik prediktif & peramalan tren kualitas air SISI KLIEN. Modul ini
   memproyeksikan kelima parameter sensor (pH, suhu, turbidity, TDS, klorin)
   dan Water_Quality_Score untuk horizon ke depan dari Historical_Window.

   ALGORITMA (sesuai design.md — Keputusan Teknis Kunci):
     Regresi linear kuadrat-terkecil (deterministik, O(n)) digabung dengan
     dekomposisi musiman jam-per-hari. Untuk tiap parameter:
        proyeksi(t) = (intercept + slope · t) + seasonalOffset(jam-dalam-hari)
     Pendekatan statistik ringan ini berjalan < 2 dtk untuk 30 hari data di
     klien tanpa pustaka ML berat (Ahmed & Mumtaz, 2019 — disederhanakan).

   API PUBLIK (kontrak design.md §2 Forecasting_Engine):
     - linearFit(points)                  → {slope, intercept}        (least squares)
     - seasonalProfile(history, param)    → number[24]                (offset per jam)
     - computeConfidence(history, param, fit) → number [0,100]
     - forecast(history, horizonHours=24, TH?) → ForecastResult | {status:'insufficient_data'}

   KETENTUAN PENTING:
     - Gerbang kecukupan data (R1.3): < FORECAST_MIN_DAYS rentang ATAU
       < FORECAST_MIN_READINGS reading valid → {status:'insufficient_data'}.
       Konstanta dari config.js (AquaConfig).
     - Nilai NOL diperlakukan VALID (R1.4): tidak ada penyaringan nilai nol;
       hanya nilai di luar rentang FISIK yang dikecualikan.
     - projectedScore dihitung via logika calcQualityScore() (disalin setara
       dari app.js / xai.js, bobot tunggal-sumber dari thresholds.json).
     - notRecommended = projectedScore < FORECAST_NOT_REC_SCORE (R1.6).
     - Confidence_Score selalu [0,100] (R1.5) — memakai semantik AquaXAI.confidence
       jenis 'forecast' bila modul XAI tersedia.

   POLA PEMUATAN: mengikuti config.js / xai.js — namespace global `AquaForecast`
   + dukungan module.exports agar dapat diuji via Vitest (jsdom).
   ===================================================== */

(function (root, factory) {
  'use strict';
  var AquaForecast = factory(root);

  // Ekspos sebagai global (browser window / jsdom / worker → globalThis).
  if (root && !root.AquaForecast) {
    root.AquaForecast = AquaForecast;
  }

  // Ekspos untuk lingkungan CommonJS (Vitest/Node) bila tersedia.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root && root.AquaForecast ? root.AquaForecast : AquaForecast;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konstanta & resolusi konfigurasi
  // ---------------------------------------------------------------------------

  var MS_PER_HOUR = 3600000;
  var MS_PER_DAY = 86400000;

  /** Parameter sensor kanonik yang diproyeksikan (urutan tampilan). */
  var PARAMS = ['ph', 'temperature', 'turbidity', 'tds', 'chlorine'];

  /** Parameter yang berkontribusi pada Water_Quality_Score. */
  var SCORED_PARAMS = ['ph', 'temperature', 'turbidity'];

  /**
   * Batas plausibilitas FISIK sensor (di-key dengan nama parameter reading).
   * Selaras dengan PHYSICAL_LIMITS di sensors.js. Batas bawah 0 untuk semua
   * parameter → nilai 0 selalu valid secara fisik (R1.4).
   */
  var PHYSICAL_LIMITS = {
    ph: { min: 0, max: 14 },
    temperature: { min: 0, max: 100 },
    turbidity: { min: 0, max: 4000 },
    tds: { min: 0, max: 5000 },
    chlorine: { min: 0, max: 10 }
  };

  /** Default thresholds (cadangan bila TH tak lengkap) — selaras app.js/xai.js. */
  var DEFAULT_TH = {
    ph: { optimal_min: 6.5, optimal_max: 7.5, min: 6.5, max: 8.5, weight_xai: 0.35 },
    temp: { optimal_min: 36, optimal_max: 38, min: 33, max: 40, weight_xai: 0.35 },
    turbidity: { optimal_min: 0, optimal_max: 0.5, min: 0, max: 1, weight_xai: 0.30 },
    tds: { optimal_min: 50, optimal_max: 200, min: 0, max: 300, weight_xai: 0.0 },
    chlorine: { optimal_min: 0.2, optimal_max: 0.4, min: 0.1, max: 0.5, weight_xai: 0.0 }
  };

  /** Ambil objek AquaConfig (browser global / Node) bila tersedia. */
  function getConfig() {
    if (root && root.AquaConfig) return root.AquaConfig;
    if (typeof AquaConfig !== 'undefined') return AquaConfig; // eslint-disable-line no-undef
    return null;
  }

  /** Baca konstanta dari AquaConfig dengan fallback terdokumentasi. */
  function cfg(name, fallback) {
    var c = getConfig();
    if (c && typeof c[name] === 'number') return c[name];
    return fallback;
  }

  /** Modul XAI (untuk semantik confidence bersama) bila tersedia. */
  function getXAI() {
    if (root && root.AquaXAI) return root.AquaXAI;
    if (typeof AquaXAI !== 'undefined') return AquaXAI; // eslint-disable-line no-undef
    return null;
  }

  /** Thresholds global app.js (window.TH) bila tersedia & TH tak diberikan. */
  function getGlobalTH() {
    if (root && root.TH) return root.TH;
    if (typeof TH !== 'undefined' && TH) return TH; // eslint-disable-line no-undef
    return null;
  }

  // ---------------------------------------------------------------------------
  // Utilitas numerik
  // ---------------------------------------------------------------------------

  function isFiniteNum(v) {
    if (v === null || v === undefined || v === '') return false;
    var n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n);
  }

  function num(v, fallback) {
    var n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function clamp01(v) {
    return clamp(num(v, 0), 0, 1);
  }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  /** Baca nilai parameter dari sebuah reading (toleran ejaan temp/temperature). */
  function readVal(reading, param) {
    if (!reading || typeof reading !== 'object') return undefined;
    if (param === 'temperature') {
      return reading.temperature !== undefined ? reading.temperature : reading.temp;
    }
    return reading[param];
  }

  /** Batas fisik untuk parameter (toleran 'temp'). */
  function physicalLimit(param) {
    if (param === 'temp') return PHYSICAL_LIMITS.temperature;
    return PHYSICAL_LIMITS[param];
  }

  /**
   * Validitas FISIK: nilai berhingga dalam batas plausibilitas sensor.
   * Nilai 0 valid; negatif / di luar rentang fisik tidak valid (R1.4).
   */
  function physicallyValid(param, value) {
    if (!isFiniteNum(value)) return false;
    var lim = physicalLimit(param);
    if (!lim) return false;
    var v = num(value, NaN);
    return v >= lim.min && v <= lim.max;
  }

  /** Resolusi entri thresholds untuk parameter (toleran temp/temperature). */
  function thFor(TH, param) {
    var th = TH || {};
    if (param === 'temperature' || param === 'temp') {
      return th.temp || th.temperature || DEFAULT_TH.temp;
    }
    return th[param] || DEFAULT_TH[param] || {};
  }

  // ---------------------------------------------------------------------------
  // Logika Water_Quality_Score — setara calcQualityScore() di app.js
  // ---------------------------------------------------------------------------

  /** Skor linear-bertahap parameter dua-batas (pH, suhu). 0–100. */
  function scoreParam(value, optimal_min, optimal_max, safe_min, safe_max) {
    if (value >= optimal_min && value <= optimal_max) return 100;
    if (value >= safe_min && value <= safe_max) {
      if (value < optimal_min && optimal_min > safe_min) {
        return 50 + 50 * (value - safe_min) / (optimal_min - safe_min);
      }
      if (value > optimal_max && safe_max > optimal_max) {
        return 50 + 50 * (safe_max - value) / (safe_max - optimal_max);
      }
      return 75;
    }
    var excess = value < safe_min ? safe_min - value : value - safe_max;
    return Math.max(0, 50 - excess * 25);
  }

  /** Skor kekeruhan (satu-batas atas). 0–100. */
  function scoreTurbidity(value, trT) {
    var t = trT || DEFAULT_TH.turbidity;
    var optimal_max = num(t.optimal_max, 0.5);
    var max = num(t.max, 1);
    if (value <= optimal_max) return 100;
    if (value <= max) return 50 + 50 * (max - value) / (max - optimal_max);
    return Math.max(0, 50 - (value - max) * 50);
  }

  /**
   * Hitung Water_Quality_Score dari nilai pH/suhu/kekeruhan, setara dengan
   * calcQualityScore() di app.js (bobot tunggal-sumber dari thresholds.json,
   * pembulatan & cap 100 identik). Selalu mengembalikan [0, 100].
   *
   * @param {number} ph
   * @param {number} temperature
   * @param {number} turbidity
   * @param {Object} TH  thresholds.json (opsional; fallback default app.js).
   * @returns {number}
   */
  function qualityScore(ph, temperature, turbidity, TH) {
    var th = TH || {};
    var phT = th.ph || DEFAULT_TH.ph;
    var tT = th.temp || DEFAULT_TH.temp;
    var trT = th.turbidity || DEFAULT_TH.turbidity;

    var phScore = Math.round(
      scoreParam(num(ph, 0), num(phT.optimal_min, 6.5), num(phT.optimal_max, 7.5), num(phT.min, 6.5), num(phT.max, 8.5))
    );
    var tempScore = Math.round(
      scoreParam(num(temperature, 0), num(tT.optimal_min, 36), num(tT.optimal_max, 38), num(tT.min, 33), num(tT.max, 40))
    );
    var turbScore = Math.round(scoreTurbidity(num(turbidity, 0), trT));

    var total = Math.min(100, Math.round(
      phScore * num(phT.weight_xai, 0.35) +
      tempScore * num(tT.weight_xai, 0.35) +
      turbScore * num(trT.weight_xai, 0.30)
    ));

    return clamp(total, 0, 100);
  }

  // ---------------------------------------------------------------------------
  // Ekstraksi titik data (sumber tunggal — dipakai fit & confidence)
  // ---------------------------------------------------------------------------

  /** Entri history dengan ts berhingga, terurut naik berdasarkan ts. */
  function timestampedReadings(history) {
    var list = Array.isArray(history) ? history : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e && typeof e === 'object' && isFiniteNum(e.ts)) {
        out.push(e);
      }
    }
    out.sort(function (a, b) {
      return num(a.ts, 0) - num(b.ts, 0);
    });
    return out;
  }

  /** Origin waktu (ts minimum) dari kumpulan reading ber-ts. */
  function originOf(readings) {
    if (!readings.length) return 0;
    return num(readings[0].ts, 0); // sudah terurut naik
  }

  /**
   * Titik regresi {x (jam sejak origin), y (nilai parameter)} untuk satu
   * parameter. Hanya menyertakan pembacaan yang VALID secara fisik — nilai
   * nol disertakan (R1.4), nilai di luar rentang fisik dikecualikan.
   *
   * @param {Object[]} history  Historical_Window.
   * @param {string} param      Nama parameter.
   * @returns {Array<{x:number, y:number}>}
   */
  function validPoints(history, param) {
    var readings = timestampedReadings(history);
    var origin = originOf(readings);
    var pts = [];
    for (var i = 0; i < readings.length; i++) {
      var raw = readVal(readings[i], param);
      if (physicallyValid(param, raw)) {
        pts.push({
          x: (num(readings[i].ts, origin) - origin) / MS_PER_HOUR,
          y: num(raw, 0)
        });
      }
    }
    return pts;
  }

  // ---------------------------------------------------------------------------
  // API: linearFit
  // ---------------------------------------------------------------------------

  /**
   * Regresi linear kuadrat-terkecil deterministik.
   * Menerima titik berbentuk {x, y} maupun pasangan [x, y].
   *
   * Kasus tepi:
   *   - 0 titik         → {slope:0, intercept:0}
   *   - 1 titik         → {slope:0, intercept:y}
   *   - seluruh x sama  → {slope:0, intercept:mean(y)} (hindari bagi nol)
   *
   * @param {Array<{x:number,y:number}>|Array<[number,number]>} points
   * @returns {{slope:number, intercept:number}}
   */
  function linearFit(points) {
    var pts = Array.isArray(points) ? points : [];
    var xs = [];
    var ys = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var x;
      var y;
      if (Array.isArray(p)) {
        x = p[0];
        y = p[1];
      } else if (p && typeof p === 'object') {
        x = p.x;
        y = p.y;
      }
      if (isFiniteNum(x) && isFiniteNum(y)) {
        xs.push(num(x, 0));
        ys.push(num(y, 0));
      }
    }

    var n = xs.length;
    if (n === 0) return { slope: 0, intercept: 0 };
    if (n === 1) return { slope: 0, intercept: ys[0] };

    var sumX = 0;
    var sumY = 0;
    var sumXX = 0;
    var sumXY = 0;
    for (var j = 0; j < n; j++) {
      sumX += xs[j];
      sumY += ys[j];
      sumXX += xs[j] * xs[j];
      sumXY += xs[j] * ys[j];
    }

    var denom = n * sumXX - sumX * sumX;
    if (denom === 0) {
      // Seluruh x identik → tren tak terdefinisi; pakai rata-rata sebagai konstanta.
      return { slope: 0, intercept: sumY / n };
    }

    var slope = (n * sumXY - sumX * sumY) / denom;
    var intercept = (sumY - slope * sumX) / n;
    return { slope: slope, intercept: intercept };
  }

  // ---------------------------------------------------------------------------
  // API: seasonalProfile
  // ---------------------------------------------------------------------------

  /**
   * Profil musiman jam-per-hari: rata-rata SIMPANGAN nilai parameter terhadap
   * rata-rata keseluruhan untuk tiap jam-dalam-hari (0–23). Jam tanpa data
   * bernilai 0 (tanpa kontribusi musiman).
   *
   * @param {Object[]} history  Historical_Window.
   * @param {string} param      Nama parameter.
   * @returns {number[]}        Array panjang 24 (offset musiman per jam).
   */
  function seasonalProfile(history, param) {
    var profile = new Array(24);
    var sums = new Array(24);
    var counts = new Array(24);
    var h;
    for (h = 0; h < 24; h++) {
      profile[h] = 0;
      sums[h] = 0;
      counts[h] = 0;
    }

    var readings = timestampedReadings(history);
    var values = [];
    var hours = [];
    for (var i = 0; i < readings.length; i++) {
      var raw = readVal(readings[i], param);
      if (physicallyValid(param, raw)) {
        var hour = new Date(num(readings[i].ts, 0)).getHours();
        values.push(num(raw, 0));
        hours.push(hour);
      }
    }

    if (!values.length) return profile;

    var overallMean = mean(values);
    for (var k = 0; k < values.length; k++) {
      var hr = hours[k];
      sums[hr] += values[k] - overallMean;
      counts[hr] += 1;
    }
    for (h = 0; h < 24; h++) {
      profile[h] = counts[h] > 0 ? sums[h] / counts[h] : 0;
    }
    return profile;
  }

  // ---------------------------------------------------------------------------
  // API: computeConfidence
  // ---------------------------------------------------------------------------

  /**
   * Confidence_Score [0,100] untuk proyeksi satu parameter, memadukan:
   *   - r2          : kualitas kecocokan (R²) regresi linear,
   *   - sufficiency : kecukupan jumlah reading vs FORECAST_MIN_READINGS,
   *   - recency     : cakupan temporal vs FORECAST_MIN_DAYS.
   * Memakai semantik AquaXAI.confidence('forecast', …) bila modul XAI tersedia
   * (R11.2/1.5), jika tidak memakai formula setara secara internal.
   *
   * @param {Object[]} history  Historical_Window.
   * @param {string} param      Nama parameter.
   * @param {{slope:number,intercept:number}} [fit]  Hasil linearFit (opsional;
   *        bila tak diberikan / tak valid akan dihitung ulang dari titik).
   * @returns {number}  Confidence_Score pada [0,100].
   */
  function computeConfidence(history, param, fit) {
    var pts = validPoints(history, param);
    var n = pts.length;
    if (n === 0) return 0;

    var ys = pts.map(function (p) { return p.y; });
    var meanY = mean(ys);

    var useFit = (fit && isFiniteNum(fit.slope) && isFiniteNum(fit.intercept))
      ? fit
      : linearFit(pts);

    var ssTot = 0;
    var ssRes = 0;
    var minX = Infinity;
    var maxX = -Infinity;
    for (var i = 0; i < n; i++) {
      var dy = ys[i] - meanY;
      ssTot += dy * dy;
      var pred = useFit.intercept + useFit.slope * pts[i].x;
      var rr = ys[i] - pred;
      ssRes += rr * rr;
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].x > maxX) maxX = pts[i].x;
    }

    // R²: untuk window konstan (ssTot≈0) anggap kecocokan sempurna.
    var r2 = ssTot > 0 ? clamp01(1 - ssRes / ssTot) : 1;

    var minReadings = cfg('FORECAST_MIN_READINGS', 24);
    var minDays = cfg('FORECAST_MIN_DAYS', 7);
    var spanDays = (maxX - minX) / 24;

    var sufficiency = clamp01(n / minReadings);
    var recency = clamp01(spanDays / minDays);

    var xai = getXAI();
    if (xai && typeof xai.confidence === 'function') {
      return xai.confidence('forecast', { r2: r2, sufficiency: sufficiency, recency: recency });
    }

    // Fallback setara dengan AquaXAI.confidence('forecast', …).
    var raw = 100 * (0.6 * r2 + 0.25 * sufficiency + 0.15 * recency);
    return clamp(Math.round(raw), 0, 100);
  }

  // ---------------------------------------------------------------------------
  // Proyeksi parameter
  // ---------------------------------------------------------------------------

  /** Nilai fallback berhingga untuk parameter tanpa data (tengah rentang). */
  function fallbackValue(param, TH) {
    var t = thFor(TH, param);
    if (isFiniteNum(t.optimal_min) && isFiniteNum(t.optimal_max)) {
      return (num(t.optimal_min, 0) + num(t.optimal_max, 0)) / 2;
    }
    if (isFiniteNum(t.min) && isFiniteNum(t.max)) {
      return (num(t.min, 0) + num(t.max, 0)) / 2;
    }
    return 0;
  }

  /**
   * Proyeksikan satu parameter pada waktu xHours (jam sejak origin) dengan
   * jam-dalam-hari targetHour. Hasil dijepit ke batas fisik agar berhingga.
   */
  function projectAt(param, xHours, targetHour, fit, profile, pointCount, TH) {
    var base;
    if (pointCount > 0 && fit) {
      base = fit.intercept + fit.slope * xHours;
    } else {
      base = fallbackValue(param, TH);
    }
    var seasonal = (profile && isFiniteNum(profile[targetHour])) ? profile[targetHour] : 0;
    var val = base + seasonal;

    var lim = physicalLimit(param);
    if (lim) val = clamp(val, lim.min, lim.max);
    if (!isFiniteNum(val)) val = fallbackValue(param, TH);
    return val;
  }

  // ---------------------------------------------------------------------------
  // API: forecast
  // ---------------------------------------------------------------------------

  /**
   * Proyeksikan kelima parameter + Water_Quality_Score untuk horizon ke depan.
   *
   * Gerbang kecukupan data (R1.3): bila rentang < FORECAST_MIN_DAYS hari ATAU
   * jumlah reading valid < FORECAST_MIN_READINGS → kembalikan
   * {status:'insufficient_data'} tanpa proyeksi.
   *
   * @param {Object[]} history       Historical_Window (array SensorReading).
   * @param {number} [horizonHours]  Horizon proyeksi (jam). Default FORECAST_HORIZON_H.
   * @param {Object} [TH]            thresholds.json (opsional; fallback global/​default).
   * @returns {ForecastResult|{status:'insufficient_data', reason:string}}
   *
   * @typedef {Object} ForecastResult
   * @property {'ok'} status
   * @property {{ph:number,temperature:number,turbidity:number,tds:number,chlorine:number}} projected
   * @property {number} projectedScore   Water_Quality_Score proyeksi [0,100]
   * @property {number} confidence        Confidence_Score [0,100]
   * @property {boolean} notRecommended    true ⇔ projectedScore < FORECAST_NOT_REC_SCORE
   * @property {number} horizonHours
   * @property {Array<{ts:number, actual?:number, projected?:number}>} series
   */
  function forecast(history, horizonHours, TH) {
    var horizon = isFiniteNum(horizonHours) && num(horizonHours, 0) > 0
      ? num(horizonHours, 24)
      : cfg('FORECAST_HORIZON_H', 24);

    var th = TH || getGlobalTH() || null;

    var minDays = cfg('FORECAST_MIN_DAYS', 7);
    var minReadings = cfg('FORECAST_MIN_READINGS', 24);
    var notRecScore = cfg('FORECAST_NOT_REC_SCORE', 60);

    var readings = timestampedReadings(history);

    // Reading "valid" untuk gerbang: ber-ts dan punya ≥1 parameter valid fisik.
    var validReadings = [];
    for (var i = 0; i < readings.length; i++) {
      var anyValid = false;
      for (var p = 0; p < PARAMS.length; p++) {
        if (physicallyValid(PARAMS[p], readVal(readings[i], PARAMS[p]))) {
          anyValid = true;
          break;
        }
      }
      if (anyValid) validReadings.push(readings[i]);
    }

    var count = validReadings.length;
    var origin = originOf(validReadings);
    var lastTs = count ? num(validReadings[count - 1].ts, origin) : origin;
    var spanDays = count ? (lastTs - origin) / MS_PER_DAY : 0;

    // Gerbang kecukupan data (R1.3).
    if (count < minReadings || spanDays < minDays) {
      return {
        status: 'insufficient_data',
        reason: count < minReadings
          ? 'fewer than ' + minReadings + ' valid readings'
          : 'less than ' + minDays + ' days of history'
      };
    }

    var lastHours = (lastTs - origin) / MS_PER_HOUR;
    var targetHours = lastHours + horizon;
    var targetHour = new Date(lastTs + horizon * MS_PER_HOUR).getHours();

    // Hitung fit + profil musiman + confidence per parameter.
    var fits = {};
    var profiles = {};
    var counts = {};
    var projected = {};
    var scoredConfidences = [];

    for (var q = 0; q < PARAMS.length; q++) {
      var param = PARAMS[q];
      var pts = validPoints(validReadings, param);
      counts[param] = pts.length;
      fits[param] = pts.length ? linearFit(pts) : null;
      profiles[param] = seasonalProfile(validReadings, param);
      projected[param] = projectAt(param, targetHours, targetHour, fits[param], profiles[param], pts.length, th);

      if (SCORED_PARAMS.indexOf(param) !== -1) {
        scoredConfidences.push(computeConfidence(validReadings, param, fits[param]));
      }
    }

    var projectedScore = qualityScore(projected.ph, projected.temperature, projected.turbidity, th);
    var notRecommended = projectedScore < notRecScore;

    // Confidence keseluruhan = rata-rata confidence parameter ber-skor.
    var confidence = scoredConfidences.length
      ? clamp(Math.round(mean(scoredConfidences)), 0, 100)
      : 0;

    // Deret untuk grafik garis: historis (actual) + proyeksi per jam (projected),
    // memastikan deret mencakup horizon yang diminta.
    var series = buildSeries(validReadings, origin, lastTs, lastHours, horizon, fits, profiles, counts, th);

    return {
      status: 'ok',
      projected: projected,
      projectedScore: projectedScore,
      confidence: confidence,
      notRecommended: notRecommended,
      horizonHours: horizon,
      series: series
    };
  }

  /** Bangun deret historis (actual WQS) + proyeksi per jam (projected WQS). */
  function buildSeries(readings, origin, lastTs, lastHours, horizon, fits, profiles, counts, TH) {
    var series = [];

    // Historis: skor aktual bila pH/suhu/kekeruhan ketiganya valid fisik.
    for (var i = 0; i < readings.length; i++) {
      var r = readings[i];
      var ph = readVal(r, 'ph');
      var temp = readVal(r, 'temperature');
      var turb = readVal(r, 'turbidity');
      if (physicallyValid('ph', ph) && physicallyValid('temperature', temp) && physicallyValid('turbidity', turb)) {
        series.push({ ts: num(r.ts, origin), actual: qualityScore(ph, temp, turb, TH) });
      }
    }

    // Proyeksi: langkah per jam 1..horizon (terakhir tepat pada horizon).
    var steps = Math.max(1, Math.round(horizon));
    for (var h = 1; h <= steps; h++) {
      var xHours = lastHours + h;
      var tsH = lastTs + h * MS_PER_HOUR;
      var hourOfDay = new Date(tsH).getHours();
      var phP = projectAt('ph', xHours, hourOfDay, fits.ph, profiles.ph, counts.ph, TH);
      var tempP = projectAt('temperature', xHours, hourOfDay, fits.temperature, profiles.temperature, counts.temperature, TH);
      var turbP = projectAt('turbidity', xHours, hourOfDay, fits.turbidity, profiles.turbidity, counts.turbidity, TH);
      series.push({ ts: tsH, projected: qualityScore(phP, tempP, turbP, TH) });
    }

    return series;
  }

  // ---------------------------------------------------------------------------
  // Namespace publik
  // ---------------------------------------------------------------------------

  var AquaForecast = {
    PARAMS: PARAMS,
    SCORED_PARAMS: SCORED_PARAMS,
    PHYSICAL_LIMITS: PHYSICAL_LIMITS,

    linearFit: linearFit,
    seasonalProfile: seasonalProfile,
    computeConfidence: computeConfidence,
    forecast: forecast,

    // Pembantu yang diekspos untuk keterujian & penggunaan ulang.
    validPoints: validPoints,
    qualityScore: qualityScore
  };

  return AquaForecast;
});
