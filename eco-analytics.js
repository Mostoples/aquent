/* =====================================================
   AQUENT — Eco_Analytics_Engine (AquaEco)
   Spec: advanced-features-upgrade — Requirement 7 (Eco-Analytics)

   Menghitung jejak konsumsi air pengguna: total konsumsi per periode,
   estimasi biaya air, estimasi emisi CO2 dari pemanas air, dan air yang
   dihemat terhadap baseline yang dapat dikonfigurasi.

   Kontrak (lihat design.md §8):
     AquaEco.totalConsumption(sessions, period, now) => number
     AquaEco.estimateCost(liters, ratePerLiter)      => { value, isEstimate, ratePerLiter }
     AquaEco.estimateCO2(sessions, emissionFactor)   => { value, isEstimate, emissionFactor, liters }
     AquaEco.waterSaved(sessions, baselineLiters)     => number

   Sumber konfigurasi (urutan resolusi nilai tarif/faktor/baseline):
     1. Argumen eksplisit yang diberikan pemanggil (dianggap nilai terkonfigurasi).
     2. Preferensi pengguna di localStorage `aquent-eco-prefs`
        (juga dianggap terkonfigurasi).
     3. Nilai default terdokumentasi `ECO_DEFAULTS` (dari config.js / AquaConfig).
        Ketika default ini dipakai (1 & 2 tidak tersedia), hasil ditandai
        sebagai estimasi (`isEstimate === true`).  (R7.5)

   Catatan perlakuan nilai:
     - Konsumsi nol diperlakukan sah (bukan error/NaN). Periode tanpa sesi → 0. (R7.2)
     - Volume sesi dibaca dari `volume_liters` (model `aquent-sessions` di app.js),
       dengan cadangan `volume`/`liters`. Nilai non-finite dianggap 0.
     - Biaya & emisi bersifat linear (value = besaran × tarif/faktor) tanpa
       pembulatan, agar properti linearitas terjaga. (R7.3, R7.4)

   Pola pemuatan mengikuti modul vanilla lain (config.js / xai.js): namespace
   global `AquaEco` + dukungan `module.exports` agar dapat diuji via Vitest.
   ===================================================== */

(function (root, factory) {
  'use strict';
  var AquaEco = factory(root);

  // Ekspos sebagai global (browser window / jsdom / worker → globalThis).
  if (root && !root.AquaEco) {
    root.AquaEco = AquaEco;
  }

  // Ekspos untuk lingkungan CommonJS (Vitest/Node) bila tersedia.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root && root.AquaEco ? root.AquaEco : AquaEco;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konstanta & utilitas
  // ---------------------------------------------------------------------------

  /** Milidetik dalam satu hari kalender (24 jam). */
  var DAY_MS = 24 * 60 * 60 * 1000;

  /** Kunci localStorage untuk preferensi Eco pengguna (R7.5). */
  var PREFS_KEY = 'aquent-eco-prefs';

  /**
   * Default terdokumentasi cadangan, selaras dengan AquaConfig.ECO_DEFAULTS di
   * config.js. Dipakai bila AquaConfig belum dimuat (mis. pengujian unit modul
   * tunggal). Nilai kanonik tetap berasal dari config.js saat tersedia.
   * @type {{ratePerLiter:number, emissionFactor:number, baselineLitersPerSession:number, currency:string}}
   */
  var FALLBACK_DEFAULTS = {
    ratePerLiter: 0.005,
    emissionFactor: 0.0002,
    baselineLitersPerSession: 60,
    currency: 'IDR'
  };

  /** Apakah sebuah nilai dapat dikonversi menjadi angka berhingga. */
  function isFiniteNum(value) {
    if (value === null || value === undefined || value === '') return false;
    var n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n);
  }

  /** Konversi ke angka berhingga; nilai non-finite → fallback. */
  function num(value, fallback) {
    var n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Ambil ECO_DEFAULTS dari AquaConfig (config.js) bila tersedia, jika tidak
   * pakai FALLBACK_DEFAULTS. Dibaca lazy agar berfungsi di browser maupun
   * pengujian (mengikuti pola pembacaan AquaConfig di xai.js). Requirement 7.5
   * @returns {{ratePerLiter:number, emissionFactor:number, baselineLitersPerSession:number, currency:string}}
   */
  function ecoDefaults() {
    var cfg = (root && root.AquaConfig) || (typeof AquaConfig !== 'undefined' ? AquaConfig : null);
    if (cfg && cfg.ECO_DEFAULTS) {
      var d = cfg.ECO_DEFAULTS;
      return {
        ratePerLiter: num(d.ratePerLiter, FALLBACK_DEFAULTS.ratePerLiter),
        emissionFactor: num(d.emissionFactor, FALLBACK_DEFAULTS.emissionFactor),
        baselineLitersPerSession: num(d.baselineLitersPerSession, FALLBACK_DEFAULTS.baselineLitersPerSession),
        currency: typeof d.currency === 'string' ? d.currency : FALLBACK_DEFAULTS.currency
      };
    }
    return {
      ratePerLiter: FALLBACK_DEFAULTS.ratePerLiter,
      emissionFactor: FALLBACK_DEFAULTS.emissionFactor,
      baselineLitersPerSession: FALLBACK_DEFAULTS.baselineLitersPerSession,
      currency: FALLBACK_DEFAULTS.currency
    };
  }

  /**
   * Baca preferensi pengguna dari localStorage `aquent-eco-prefs`. Anggun
   * terhadap data hilang/rusak: selalu kembalikan objek (kosong bila gagal).
   * Mengikuti pola try/catch pembacaan storage di notifications.js / app.js.
   * @returns {Object}
   */
  function readPrefs() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return {};
      var raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  /**
   * Selesaikan satu nilai konfigurasi numerik mengikuti urutan resolusi:
   * argumen eksplisit → preferensi pengguna → default terdokumentasi.
   * `isDefault` benar hanya bila nilai default terdokumentasi yang dipakai
   * (argumen & preferensi tidak tersedia) — dasar penandaan estimasi (R7.5).
   *
   * @param {*} explicit       Nilai eksplisit dari pemanggil (boleh undefined).
   * @param {string} prefKey   Kunci pada objek preferensi `aquent-eco-prefs`.
   * @param {number} fallback  Nilai default terdokumentasi (dari ECO_DEFAULTS).
   * @returns {{value:number, isDefault:boolean}}
   */
  function resolveConfigValue(explicit, prefKey, fallback) {
    if (isFiniteNum(explicit)) {
      return { value: Number(explicit), isDefault: false };
    }
    var prefs = readPrefs();
    if (prefs && isFiniteNum(prefs[prefKey])) {
      return { value: Number(prefs[prefKey]), isDefault: false };
    }
    return { value: num(fallback, 0), isDefault: true };
  }

  /**
   * Volume air (liter) satu sesi. Membaca `volume_liters` (kanonik di model
   * `aquent-sessions`), dengan cadangan `volume`/`liters`. Nilai non-finite
   * dianggap 0 sehingga konsumsi nol tetap sah (R7.2).
   * @param {Object} session
   * @returns {number}
   */
  function sessionVolume(session) {
    if (!session || typeof session !== 'object') return 0;
    if (isFiniteNum(session.volume_liters)) return Number(session.volume_liters);
    if (isFiniteNum(session.volume)) return Number(session.volume);
    if (isFiniteNum(session.liters)) return Number(session.liters);
    return 0;
  }

  /** Jumlah seluruh volume sesi pada daftar (tanpa penyaringan periode). */
  function sumVolumes(sessions) {
    var list = Array.isArray(sessions) ? sessions : [];
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      total += sessionVolume(list[i]);
    }
    return total;
  }

  /**
   * Lebar jendela periode dalam milidetik. Mengembalikan `null` untuk periode
   * "all"/tidak dikenal → tanpa penyaringan waktu (seluruh sesi disertakan).
   * Menerima nama periode ID maupun EN agar tahan terhadap pemanggil UI.
   * @param {string} period
   * @returns {number|null}
   */
  function periodWindowMs(period) {
    switch (String(period === undefined || period === null ? 'all' : period).toLowerCase()) {
      case 'daily':
      case 'day':
      case 'harian':
        return DAY_MS;
      case 'weekly':
      case 'week':
      case 'mingguan':
        return 7 * DAY_MS;
      case 'monthly':
      case 'month':
      case 'bulanan':
        return 30 * DAY_MS;
      case 'all':
      case '':
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Namespace publik
  // ---------------------------------------------------------------------------

  var AquaEco = {
    /** Kunci localStorage preferensi (referensi read-only). */
    PREFS_KEY: PREFS_KEY,

    /**
     * Preferensi Eco efektif: gabungan default terdokumentasi + nilai
     * tersimpan di `aquent-eco-prefs`. Berguna untuk lapisan UI (R7.5–R7.8).
     * @returns {{ratePerLiter:number, emissionFactor:number, baselineLitersPerSession:number, currency:string}}
     */
    getPrefs: function getPrefs() {
      var defaults = ecoDefaults();
      var prefs = readPrefs();
      return {
        ratePerLiter: isFiniteNum(prefs.ratePerLiter) ? Number(prefs.ratePerLiter) : defaults.ratePerLiter,
        emissionFactor: isFiniteNum(prefs.emissionFactor) ? Number(prefs.emissionFactor) : defaults.emissionFactor,
        baselineLitersPerSession: isFiniteNum(prefs.baselineLitersPerSession)
          ? Number(prefs.baselineLitersPerSession)
          : defaults.baselineLitersPerSession,
        currency: typeof prefs.currency === 'string' && prefs.currency ? prefs.currency : defaults.currency
      };
    },

    /**
     * Total konsumsi air untuk sebuah periode. Menjumlahkan `volume_liters`
     * seluruh sesi yang jatuh dalam jendela periode relatif terhadap `now`.
     * Periode tanpa sesi menghasilkan 0 (nilai sah, bukan error/NaN). (R7.1, R7.2)
     *
     * Semantik jendela (rolling window relatif `now`, inklusif kedua batas):
     *   daily  → (now − 1 hari, now]   weekly → (now − 7 hari, now]
     *   monthly→ (now − 30 hari, now]  all/undefined → seluruh sesi (tanpa filter)
     *
     * Untuk periode berjendela, sesi tanpa `ts` berhingga dikecualikan
     * (tak dapat ditempatkan dalam waktu); untuk `all`, seluruh sesi disertakan.
     *
     * @param {Array<Object>} sessions  Daftar sesi (model `aquent-sessions`).
     * @param {string} [period='all']   'daily'|'weekly'|'monthly'|'all' (atau ID).
     * @param {number} [now=Date.now()] Waktu acuan (epoch ms) untuk jendela.
     * @returns {number} Total liter (≥ 0 bila volume non-negatif; 0 bila kosong).
     */
    totalConsumption: function totalConsumption(sessions, period, now) {
      var list = Array.isArray(sessions) ? sessions : [];
      var windowMs = periodWindowMs(period);

      // Periode "all": tanpa penyaringan waktu.
      if (windowMs === null) {
        return sumVolumes(list);
      }

      var ref = isFiniteNum(now) ? Number(now) : Date.now();
      var lowerBound = ref - windowMs;
      var total = 0;
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var ts = s && isFiniteNum(s.ts) ? Number(s.ts) : null;
        if (ts === null) continue;
        if (ts < lowerBound || ts > ref) continue;
        total += sessionVolume(s);
      }
      return total;
    },

    /**
     * Estimasi biaya air = liter × tarif per liter. Linear terhadap kedua
     * masukan (tanpa pembulatan). Bila tarif tidak diberikan (argumen maupun
     * preferensi), tarif default terdokumentasi dipakai dan hasil ditandai
     * estimasi. (R7.3, R7.5)
     *
     * @param {number} liters         Total konsumsi air (liter). 0 sah.
     * @param {number} [ratePerLiter] Tarif per liter (mata uang lokal).
     * @returns {{value:number, isEstimate:boolean, ratePerLiter:number}}
     */
    estimateCost: function estimateCost(liters, ratePerLiter) {
      var L = isFiniteNum(liters) ? Number(liters) : 0;
      var rate = resolveConfigValue(ratePerLiter, 'ratePerLiter', ecoDefaults().ratePerLiter);
      return {
        value: L * rate.value,
        isEstimate: rate.isDefault,
        ratePerLiter: rate.value
      };
    },

    /**
     * Estimasi emisi CO2 dari energi pemanas air = total liter × faktor emisi.
     * Berskala linear terhadap faktor emisi (untuk himpunan sesi tetap). Bila
     * faktor tidak diberikan (argumen maupun preferensi), faktor default
     * terdokumentasi dipakai dan hasil ditandai estimasi. (R7.4, R7.5)
     *
     * @param {Array<Object>} sessions   Daftar sesi (sumber total liter).
     * @param {number} [emissionFactor]  kg CO2 per liter air panas.
     * @returns {{value:number, isEstimate:boolean, emissionFactor:number, liters:number}}
     */
    estimateCO2: function estimateCO2(sessions, emissionFactor) {
      var liters = sumVolumes(sessions);
      var factor = resolveConfigValue(emissionFactor, 'emissionFactor', ecoDefaults().emissionFactor);
      return {
        value: liters * factor.value,
        isEstimate: factor.isDefault,
        emissionFactor: factor.value,
        liters: liters
      };
    },

    /**
     * Air yang dihemat dibandingkan baseline penggunaan per sesi yang dapat
     * dikonfigurasi. (R7.6)
     *
     * Formula terdefinisi:
     *   waterSaved = (baselineLiters × jumlah_sesi) − total_konsumsi_aktual
     *
     * Nilai positif berarti konsumsi di bawah baseline (menghemat); nilai
     * negatif berarti konsumsi melebihi baseline. Bila baseline tidak diberikan
     * (argumen maupun preferensi), baseline default terdokumentasi dipakai.
     *
     * @param {Array<Object>} sessions      Daftar sesi.
     * @param {number} [baselineLiters]     Baseline liter per sesi.
     * @returns {number} Selisih liter terhadap baseline (boleh negatif).
     */
    waterSaved: function waterSaved(sessions, baselineLiters) {
      var list = Array.isArray(sessions) ? sessions : [];
      var baseline = resolveConfigValue(baselineLiters, 'baselineLitersPerSession', ecoDefaults().baselineLitersPerSession);
      var baselineTotal = baseline.value * list.length;
      var actualTotal = sumVolumes(list);
      return baselineTotal - actualTotal;
    }
  };

  return AquaEco;
});
