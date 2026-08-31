/* =====================================================
   AQUENT — Data Exporter (AquaDataExport)
   Spec: advanced-features-upgrade — Task 17.1 (Requirement 10)

   Portabilitas data / GDPR: pengguna mengunduh SELURUH datanya sebagai
   berkas JSON yang dapat dibaca mesin, sepenuhnya di sisi klien tanpa
   mengirim apa pun ke server pihak ketiga (R10.7).

   Dua tahap (lihat design.md §11 — Data_Exporter):
     AquaDataExport.collect(uid, profileId, options)
        => Promise<{ data:Object, failures:string[] }>
        Kumpulkan tiap kategori secara BEST-EFFORT: sesi, profil, survei,
        badge, entri Skin Diary, dan notifikasi (R10.1). Setiap sumber
        dibungkus try/catch — kegagalan satu sumber dicatat di `failures[]`
        dan TIDAK menggagalkan sumber lain (R10.5).

     AquaDataExport.buildExport(collected, uid)
        => { ok, blob, json, failures, error }
        Bungkus data terkumpul menjadi objek JSON + metadata (stempel waktu
        ekspor + pengenal pengguna, R10.4) dan sebuah Blob unduhan (R10.2).
        Citra kulit mentah DIKECUALIKAN (R10.3). Bila pengumpulan gagal
        TOTAL (tidak ada satu pun kategori yang berhasil), pembuatan berkas
        DITAHAN dan pesan kesalahan dikembalikan (R10.6).

   Keputusan desain:
     - "Best-effort per sumber": kontrak `collect()` memetakan tiap kategori
       ke sebuah collector (fungsi). Default collectors membaca sumber nyata
       aplikasi (localStorage + Firebase RTDB best-effort). Collector dapat
       di-inject lewat `options.collectors` agar logika dapat diuji secara
       deterministik (mis. mensimulasikan kegagalan sebagian/total) tanpa
       menyentuh I/O nyata.
     - "Tanpa citra mentah": seluruh data terkumpul disaring rekursif
       (`_stripImages`) untuk membuang field bernuansa citra (image/photo/
       base64/dataUrl/pixels/thumbnail). Model data turunan kita memang tak
       menyimpan citra, namun penyaringan ini menjadi jaring pengaman R10.3.
     - "JSON fixed-point": objek ekspor dinormalisasi via satu putaran
       JSON.parse(JSON.stringify(...)) sehingga serialisasinya idempoten —
       round-trip menghasilkan struktur deep-equal (R10.2) dan menjamin
       berkas .json yang stabil & portabel.

   Pola pemuatan mengikuti notifications.js / sensors.js: namespace
   dideklarasikan via IIFE lalu SELF-REGISTER ke window + globalThis agar
   berkas yang sama bekerja tanpa perubahan di browser (<script> di app.html
   setelah app.js) maupun pada harness uji (Vitest + jsdom via loadModule).
   ===================================================== */

const AquaDataExport = (function () {
  'use strict';

  /**
   * Kategori data pengguna yang diekspor, dalam urutan kanonik (R10.1).
   * Nama ini juga dipakai sebagai entri pada `failures[]` saat sebuah
   * kategori gagal dikumpulkan (R10.5).
   * @type {string[]}
   */
  const CATEGORIES = [
    'sessions',
    'profiles',
    'surveys',
    'badges',
    'skinDiary',
    'notifications',
  ];

  /** Versi & skema berkas ekspor (untuk keterlacakan/portabilitas). */
  const EXPORT_SCHEMA = 'aquent-data-export';
  const EXPORT_VERSION = 1;

  /**
   * Regex nama field yang mengindikasikan citra mentah / data biner besar.
   * Field dengan nama yang cocok dibuang dari ekspor (R10.3). Case-insensitive.
   */
  const IMAGE_KEY_RE = /(image|photo|pixels|base64|dataurl|thumbnail|rawimg|imgdata|snapshot)/i;

  // ---------------------------------------------------------------------------
  // Helper internal
  // ---------------------------------------------------------------------------

  /**
   * Ambil localStorage secara anggun; lempar bila tidak tersedia sehingga
   * collector pemanggil mencatatnya sebagai kegagalan (best-effort).
   * @returns {Storage}
   */
  function _ls() {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    if (typeof window !== 'undefined' && window && window.localStorage) {
      return window.localStorage;
    }
    throw new Error('localStorage unavailable');
  }

  /**
   * Buang field bernuansa citra secara rekursif dari struktur apa pun (R10.3).
   * Menyalin objek/array (tidak memutasi masukan). Nilai primitif diteruskan.
   * @param {*} value
   * @returns {*}
   */
  function _stripImages(value) {
    if (Array.isArray(value)) {
      return value.map(_stripImages);
    }
    if (value && typeof value === 'object') {
      const out = {};
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (IMAGE_KEY_RE.test(k)) continue; // buang field citra mentah
        out[k] = _stripImages(value[k]);
      }
      return out;
    }
    return value;
  }

  /**
   * Parse JSON dengan anggun; kembalikan `fallback` bila gagal/kosong.
   * @param {string|null} raw
   * @param {*} fallback
   */
  function _parseJson(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
      const v = JSON.parse(raw);
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  /** Kunci skin diary per profil (sesuai model data design.md). */
  function _skinDiaryKey(profileId) {
    return 'aquent-skin-diary-' + (profileId != null ? String(profileId) : 'default');
  }

  /** Kunci notifikasi per profil (sesuai notifications.js). */
  function _notifKey(profileId) {
    return 'aquent-notifications-' + (profileId != null ? String(profileId) : 'default');
  }

  // ---------------------------------------------------------------------------
  // Default collectors (membaca sumber nyata aplikasi — best-effort)
  // ---------------------------------------------------------------------------

  /**
   * Bangun peta collector default untuk sumber data nyata aplikasi.
   * Setiap collector mengembalikan data kategori (boleh kosong) atau MELEMPAR
   * bila sumbernya tidak dapat dibaca — lemparan tersebut ditangkap oleh
   * `collect()` dan dicatat pada `failures[]` (R10.5).
   *
   * @param {string} uid
   * @param {string} profileId
   * @returns {Object<string, function(string, string): (any|Promise<any>)>}
   */
  function _defaultCollectors(uid, profileId) {
    return {
      // Riwayat sesi mandi — localStorage `aquent-sessions` (R10.1).
      sessions() {
        const all = _parseJson(_ls().getItem('aquent-sessions'), []);
        return Array.isArray(all) ? all : [];
      },

      // Profil multi-profile — localStorage `aquent-profiles-v2` ({list,active}).
      profiles() {
        const parsed = _parseJson(_ls().getItem('aquent-profiles-v2'), null);
        return parsed || { list: [], active: null };
      },

      // Hasil survei — kanonik di RTDB `surveys/{uid}`; fallback flag lokal.
      async surveys() {
        const db =
          typeof state !== 'undefined' && state && state.db ? state.db : null;
        if (db && uid) {
          const snap = await db.ref('surveys/' + uid).once('value');
          return snap && typeof snap.val === 'function' ? snap.val() || {} : {};
        }
        // Tanpa koneksi DB: laporkan minimal status penyelesaian lokal.
        const done = _ls().getItem('aquent-survey-done') === '1';
        return { completed: done };
      },

      // Badge & XP gamifikasi — localStorage.
      badges() {
        const earned = _parseJson(_ls().getItem('aquent-earned-badges'), []);
        const xpRaw = _ls().getItem('aquent-xp');
        const xp = Number.parseInt(xpRaw || '0', 10);
        return {
          earned: Array.isArray(earned) ? earned : [],
          xp: Number.isFinite(xp) ? xp : 0,
        };
      },

      // Entri Skin Diary (metrik turunan saja) — localStorage per profil.
      skinDiary() {
        const entries = _parseJson(_ls().getItem(_skinDiaryKey(profileId)), []);
        return Array.isArray(entries) ? entries : [];
      },

      // Notifikasi per profil — pakai AquaNotif bila tersedia, jika tidak baca
      // langsung dari localStorage.
      notifications() {
        if (
          typeof AquaNotif !== 'undefined' &&
          AquaNotif &&
          typeof AquaNotif.list === 'function'
        ) {
          return AquaNotif.list(profileId);
        }
        const list = _parseJson(_ls().getItem(_notifKey(profileId)), []);
        return Array.isArray(list) ? list : [];
      },
    };
  }

  // ---------------------------------------------------------------------------
  // API publik
  // ---------------------------------------------------------------------------

  /**
   * Kumpulkan seluruh data pengguna secara BEST-EFFORT per sumber (R10.1, R10.5).
   *
   * Setiap kategori dijalankan dalam try/catch terpisah: bila berhasil,
   * datanya (sudah disaring dari citra) masuk ke `data[kategori]`; bila gagal,
   * nama kategori dicatat ke `failures[]` dan kategori lain tetap diproses.
   *
   * @param {string} uid                    Pengenal pengguna (untuk sumber yang butuh).
   * @param {string} profileId              Active_Profile (untuk store per-profil).
   * @param {Object} [options]
   * @param {Object<string,function>} [options.collectors]
   *        Override collector per kategori (dipakai untuk pengujian/DI). Bila
   *        diberikan, hanya kategori pada peta ini yang dikumpulkan.
   * @param {string[]} [options.categories] Subset/urutan kategori yang dikumpulkan.
   * @returns {Promise<{data:Object, failures:string[]}>}
   */
  async function collect(uid, profileId, options) {
    const opts = options || {};
    const usingCustom =
      opts.collectors && typeof opts.collectors === 'object';
    const collectors = usingCustom
      ? opts.collectors
      : _defaultCollectors(uid, profileId);
    const categories = Array.isArray(opts.categories)
      ? opts.categories
      : Object.keys(collectors);

    const data = {};
    const failures = [];

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const fn = collectors[cat];
      if (typeof fn !== 'function') continue; // sumber tak terkonfigurasi → lewati
      try {
        const result = await fn(uid, profileId);
        // Saring citra mentah pada titik koleksi (R10.3 — jaring pengaman).
        data[cat] = _stripImages(result);
      } catch (_) {
        failures.push(cat);
      }
    }

    return { data, failures };
  }

  /**
   * Bungkus hasil koleksi menjadi berkas JSON unduhan + metadata.
   *
   * Menerima bentuk `{data, failures}` (keluaran `collect()`) maupun objek data
   * mentah. Menyertakan stempel waktu ekspor + pengenal pengguna (R10.4),
   * memastikan tanpa citra mentah (R10.3), serta menormalisasi objek ekspor ke
   * "JSON fixed-point" sehingga serialisasinya idempoten (round-trip deep-equal,
   * R10.2).
   *
   * Kegagalan TOTAL (tidak ada kategori yang berhasil dikumpulkan) → berkas
   * DITAHAN, kembalikan `{ ok:false, blob:null, json:null, error, failures }`
   * (R10.6).
   *
   * @param {{data:Object, failures?:string[]}|Object} collected
   * @param {string} uid
   * @returns {{ok:boolean, blob:(Blob|null), json:(Object|null), failures:string[], error:(string|null)}}
   */
  function buildExport(collected, uid) {
    const src = collected && typeof collected === 'object' ? collected : {};
    const hasWrapper =
      src.data && typeof src.data === 'object' && !Array.isArray(src.data);
    const data = hasWrapper ? src.data : src;
    const failures = Array.isArray(src.failures) ? src.failures.slice() : [];

    const collectedCategories = data && typeof data === 'object' ? Object.keys(data) : [];

    // R10.6 — kegagalan total: tidak ada satu pun kategori berhasil.
    if (collectedCategories.length === 0) {
      return {
        ok: false,
        blob: null,
        json: null,
        failures: failures,
        error: 'export_failed_total',
      };
    }

    const now = Date.now();
    let json = {
      meta: {
        app: 'AQUENT',
        schema: EXPORT_SCHEMA,
        version: EXPORT_VERSION,
        exportedAt: now, // stempel waktu ekspor (R10.4)
        exportedAtISO: new Date(now).toISOString(),
        userId: uid != null ? String(uid) : null, // pengenal pengguna (R10.4)
        note:
          'Citra kulit mentah tidak disertakan karena diproses & disimpan secara lokal.',
      },
      failures: failures, // bagian yang gagal dikumpulkan (R10.5)
      data: _stripImages(data), // jaring pengaman tanpa citra (R10.3)
    };

    // Normalisasi ke JSON fixed-point: round-trip menghasilkan deep-equal (R10.2).
    let serialized;
    try {
      serialized = JSON.stringify(json, null, 2);
      json = JSON.parse(serialized);
      serialized = JSON.stringify(json, null, 2); // dari objek yang sudah normal
    } catch (_) {
      // Data tak dapat diserialisasi (mis. struktur sirkular) → tahan berkas.
      return {
        ok: false,
        blob: null,
        json: null,
        failures: failures,
        error: 'export_serialization_failed',
      };
    }

    // Bangun Blob unduhan di klien (R10.2, R10.7). Blob mungkin tak tersedia di
    // sebagian lingkungan uji headless — itu tidak menggagalkan model JSON.
    let blob = null;
    try {
      if (typeof Blob !== 'undefined') {
        blob = new Blob([serialized], { type: 'application/json' });
      }
    } catch (_) {
      blob = null;
    }

    return {
      ok: true,
      blob: blob,
      json: json,
      failures: failures,
      error: null,
    };
  }

  return {
    CATEGORIES: CATEGORIES.slice(),
    EXPORT_SCHEMA: EXPORT_SCHEMA,
    EXPORT_VERSION: EXPORT_VERSION,
    collect: collect,
    buildExport: buildExport,
  };
})();

// Self-register agar berkas yang sama bekerja di browser (<script>) dan pada
// harness uji (Vitest + jsdom). Lihat tests/README.md.
if (typeof window !== 'undefined') window.AquaDataExport = AquaDataExport;
if (typeof globalThis !== 'undefined') globalThis.AquaDataExport = AquaDataExport;
