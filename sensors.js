/* =====================================================
   AQUENT — Sensor Integration Module (AquaSensors)
   Spec: advanced-features-upgrade — Task 2.1

   Modul ini melengkapi platform menjadi 5 parameter (pH, suhu, turbidity,
   TDS, klorin bebas) sesuai klaim novelty N02. Tugasnya:
     - Membaca snapshot RTDB /sensors menjadi objek SensorReading
       (TDS & klorin dibaca bersama pH/suhu/turbidity).               (R4.1)
     - Membedakan nilai HILANG (=> null) dari nilai NOL (valid & tersedia).
       Nilai hilang TIDAK pernah dikembalikan sebagai placeholder/0.    (R4.2)
     - Memvalidasi pembacaan terhadap rentang fisik sensor.            (R2.6 dukung)
     - Mengklasifikasikan status diskret (low/normal/high/unavailable)
       berbasis rentang aman di data/thresholds.json.                  (R4.3)

   Catatan desain — rentang FISIK vs rentang AMAN:
     thresholds.json `min`/`max` mendefinisikan rentang AMAN/acceptable
     (mis. pH 6.5–8.5, TDS 0–300 ppm). Itu BUKAN batas fisik sensor.
     Pembacaan di luar rentang aman tetap bisa berupa pengukuran nyata
     yang harus ditandai (mis. TDS 350 ppm memicu alert air sadah — R4.6),
     bukan dibuang. Karena itu validitas FISIK memakai batas plausibilitas
     sensor yang lebih lebar (terdokumentasi di PHYSICAL_LIMITS), dengan
     batas bawah 0 untuk semua parameter sehingga nilai 0 selalu valid.

   Pola pemuatan mengikuti config.js / fixture: deklarasi namespace di
   level atas + self-register ke window & globalThis agar berkas yang sama
   berjalan tanpa perubahan di browser (<script>) maupun pengujian
   (Vitest + jsdom via loadModule).
   ===================================================== */

const AquaSensors = (function () {
  'use strict';

  /**
   * Parameter kanonik pada SensorReading (urutan tampilan kartu sensor).
   * @type {string[]}
   */
  const PARAMS = ['ph', 'temperature', 'turbidity', 'tds', 'chlorine'];

  /**
   * Alias nama parameter → kunci yang dipakai di data/thresholds.json.
   * thresholds.json memakai `temp`, sedangkan SensorReading memakai
   * `temperature`. Pemetaan ini menerima kedua ejaan agar pemanggil bebas
   * memakai kunci reading ('temperature') maupun kunci threshold ('temp').
   */
  const THRESHOLD_KEY = {
    ph: 'ph',
    temperature: 'temp',
    temp: 'temp',
    turbidity: 'turbidity',
    tds: 'tds',
    chlorine: 'chlorine'
  };

  /**
   * Alias nama parameter → kunci pada objek SensorReading.
   * Memungkinkan isAvailable() dipanggil dengan 'temp' maupun 'temperature'.
   */
  const READING_KEY = {
    ph: 'ph',
    temperature: 'temperature',
    temp: 'temperature',
    turbidity: 'turbidity',
    tds: 'tds',
    chlorine: 'chlorine'
  };

  /**
   * Batas plausibilitas FISIK sensor (di-key dengan kunci threshold).
   * Lebih lebar dari rentang aman thresholds.json. Batas bawah 0 untuk
   * semua parameter → nilai 0 selalu dianggap valid secara fisik.
   *   - ph        : skala pH 0–14
   *   - temp      : air cair pada tekanan normal, plausibilitas sensor 0–100 °C
   *   - turbidity : rentang umum sensor turbidimeter (NTU)
   *   - tds       : rentang umum TDS meter (ppm)
   *   - chlorine  : plausibilitas klorin bebas (mg/L)
   */
  const PHYSICAL_LIMITS = {
    ph: { min: 0, max: 14 },
    temp: { min: 0, max: 100 },
    turbidity: { min: 0, max: 4000 },
    tds: { min: 0, max: 5000 },
    chlorine: { min: 0, max: 10 }
  };

  /**
   * Daftar nama field alternatif pada snapshot RTDB untuk tiap parameter.
   * Sensor lapangan kadang memakai ejaan berbeda; kita terima beberapa
   * alias umum namun selalu mengembalikan SensorReading berkunci kanonik.
   */
  const SNAPSHOT_FIELDS = {
    ph: ['ph', 'pH', 'PH'],
    temperature: ['temperature', 'temp', 'suhu'],
    turbidity: ['turbidity', 'turb', 'ntu', 'NTU'],
    tds: ['tds', 'TDS', 'ppm'],
    chlorine: ['chlorine', 'freeChlorine', 'chlorine_free', 'klorin', 'cl']
  };

  const TS_FIELDS = ['ts', 'timestamp', 'time', 't'];

  // ---------- helper internal (privat) ----------

  /**
   * Konversi nilai mentah snapshot menjadi number|null.
   * Aturan kunci (R4.2): nilai HILANG/non-numerik → null; nilai NOL → 0
   * (tetap dipertahankan, bukan dianggap hilang).
   * @param {*} raw
   * @returns {number|null}
   */
  function toNumberOrNull(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : null; // NaN/Infinity → null
    }
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (s === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    // boolean, object, array, dll. bukan pembacaan sensor yang valid
    return null;
  }

  /**
   * Ambil nilai field pertama yang ada (tidak undefined) dari snapshot,
   * mencoba beberapa nama alias secara berurutan.
   * @param {Object} raw
   * @param {string[]} keys
   * @returns {*}
   */
  function readField(raw, keys) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (raw[k] !== undefined) return raw[k];
    }
    return undefined;
  }

  /** Kunci threshold untuk sebuah nama parameter (mis. 'temperature' → 'temp'). */
  function thresholdKeyOf(param) {
    return THRESHOLD_KEY[param] || param;
  }

  /** Ambil entri threshold untuk sebuah parameter (toleran kedua ejaan). */
  function thresholdFor(param, TH) {
    if (!TH) return undefined;
    const key = thresholdKeyOf(param);
    return TH[key] !== undefined ? TH[key] : TH[param];
  }

  // ---------- API publik ----------

  /**
   * Baca snapshot RTDB /sensors → SensorReading.
   * Nilai hilang dikembalikan sebagai `null` (bukan placeholder/0);
   * nilai 0 dipertahankan apa adanya. TDS & klorin dibaca bersama
   * pH/suhu/turbidity.                                              (R4.1, R4.2)
   *
   * @param {Object|null} rawSnapshot  Objek hasil snapshot.val() RTDB.
   * @returns {{ph:number|null, temperature:number|null, turbidity:number|null,
   *            tds:number|null, chlorine:number|null, ts:number}} SensorReading
   */
  function parseReading(rawSnapshot) {
    const raw = (rawSnapshot && typeof rawSnapshot === 'object') ? rawSnapshot : {};

    const reading = {
      ph: toNumberOrNull(readField(raw, SNAPSHOT_FIELDS.ph)),
      temperature: toNumberOrNull(readField(raw, SNAPSHOT_FIELDS.temperature)),
      turbidity: toNumberOrNull(readField(raw, SNAPSHOT_FIELDS.turbidity)),
      tds: toNumberOrNull(readField(raw, SNAPSHOT_FIELDS.tds)),
      chlorine: toNumberOrNull(readField(raw, SNAPSHOT_FIELDS.chlorine))
    };

    const tsNum = toNumberOrNull(readField(raw, TS_FIELDS));
    reading.ts = tsNum === null ? Date.now() : tsNum;

    return reading;
  }

  /**
   * True bila parameter ADA di sumber (termasuk nilai 0).
   * null/undefined/non-numerik → false. Membedakan "hilang" dari "nol".  (R4.2)
   *
   * @param {Object} reading  SensorReading (hasil parseReading).
   * @param {string} param    Nama parameter ('ph'|'temperature'|'turbidity'|'tds'|'chlorine').
   * @returns {boolean}
   */
  function isAvailable(reading, param) {
    if (!reading || typeof reading !== 'object') return false;
    const key = READING_KEY[param] || param;
    const v = reading[key];
    return typeof v === 'number' && Number.isFinite(v); // 0 → true; null → false
  }

  /**
   * Validasi terhadap rentang FISIK sensor (lihat PHYSICAL_LIMITS).
   * Nilai 0 dianggap valid untuk semua parameter; nilai di luar rentang
   * fisik (mis. negatif, pH > 14) dianggap tidak valid. Dipakai untuk
   * mengeluarkan pembacaan tak-valid dari perhitungan baseline.         (R2.6)
   *
   * @param {string} param
   * @param {number} value
   * @param {Object} [TH]  thresholds.json; bila diberikan, parameter wajib
   *                       dikenal di dalamnya.
   * @returns {boolean}
   */
  function isPhysicallyValid(param, value, TH) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;

    const key = thresholdKeyOf(param);
    const limit = PHYSICAL_LIMITS[key];
    if (!limit) return false; // parameter tidak dikenal

    // Bila thresholds.json disediakan, parameter harus dikenal di sana juga.
    if (TH && !thresholdFor(param, TH)) return false;

    return value >= limit.min && value <= limit.max;
  }

  /**
   * Status diskret berbasis rentang AMAN thresholds.json.               (R4.3)
   *   - 'unavailable' : nilai tidak tersedia (null/non-numerik) atau
   *                     threshold parameter tidak ada.
   *   - 'low'         : value < min (di bawah rentang aman).
   *   - 'high'        : value > max (di atas rentang aman).
   *   - 'normal'      : min ≤ value ≤ max.
   *
   * @param {string} param
   * @param {number|null} value
   * @param {Object} TH  thresholds.json.
   * @returns {'low'|'normal'|'high'|'unavailable'}
   */
  function classifyStatus(param, value, TH) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'unavailable';

    const entry = thresholdFor(param, TH);
    if (!entry || typeof entry.min !== 'number' || typeof entry.max !== 'number') {
      return 'unavailable'; // tak bisa diklasifikasi tanpa rentang aman
    }

    if (value < entry.min) return 'low';
    if (value > entry.max) return 'high';
    return 'normal';
  }

  return {
    PARAMS: PARAMS,
    PHYSICAL_LIMITS: PHYSICAL_LIMITS,
    parseReading: parseReading,
    isAvailable: isAvailable,
    isPhysicallyValid: isPhysicallyValid,
    classifyStatus: classifyStatus
  };
})();

// Self-registration: bekerja di browser dan ditangkap oleh loadModule saat uji.
if (typeof window !== 'undefined') {
  window.AquaSensors = AquaSensors;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AquaSensors = AquaSensors;
}
