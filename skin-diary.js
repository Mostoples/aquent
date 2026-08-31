/* =====================================================
   AQUENT — Skin Diary (AquaSkinDiary)
   Spec: advanced-features-upgrade — Task 11.1
   Requirements: 5.1, 5.2, 5.3, 5.4, 5.8, 5.10

   Catatan kronologis pemindaian kulit yang PRIVACY-FIRST: citra kulit mentah
   diproses sepenuhnya di perangkat (pipeline lokal `analyzeImagePixels()` +
   `buildLocalScanResult()` di app.js) dan TIDAK PERNAH meninggalkan klien.
   Modul ini hanya menyimpan/menyinkronkan METRIK NUMERIK TURUNAN.

   Kontrak (lihat design.md §6 — Skin_Diary):
     AquaSkinDiary.saveEntry(entry, profileId)        => SkinEntry
         Simpan entri (metrik turunan saja) ke localStorage per profil pada
         kunci `aquent-skin-diary-{profileId}`. Citra mentah tidak pernah
         ditulis — payload disaring sebagai jaring pengaman.        (R5.1, R5.2)

     AquaSkinDiary.syncEntry(entry, profileId, options) => Promise<'synced'|'pending'>
         Sinkron HANYA metrik numerik (tanpa citra) ke Firestore
         users/{uid}/skinMetrics/{id}. Bila sinkron gagal (jaringan/server),
         status entri ditandai 'pending' dan entri tetap dipertahankan untuk
         dicoba ulang di latar belakang.                            (R5.3, R5.4)

     AquaSkinDiary.deleteEntry(entryId, profileId, options) => Promise<{ok}>
         Hapus entri secara ATOMIK (all-or-nothing) dari lokal + Firestore:
         bila salah satu sisi gagal, kedua salinan dipertahankan konsisten dan
         operasi dilaporkan gagal; bila kedua sisi berhasil, keduanya terhapus. (R5.8)

     AquaSkinDiary.needsScanReminder(entries, now) => boolean
         True jika dan hanya jika entri TERBARU berusia lebih dari
         SKIN_SCAN_REMINDER_DAYS (config.js, default 14 hari).      (R5.10)

   Helper turunan-metrik (jembatan ke pipeline lokal app.js):
     AquaSkinDiary.deriveMetrics(source)   => {saturation,redness,oiliness,texture,sharpness}
     AquaSkinDiary.buildEntry(opts)        => SkinEntry (metrik saja, tanpa citra)

   SkinEntry:
     { id, profileId, ts, metrics:{saturation,redness,oiliness,texture,sharpness},
       score, skinType, confidence, syncStatus:'local'|'synced'|'pending' }

   Pola pemuatan mengikuti modul engine lain (notifications.js / sensors.js /
   data-export.js): namespace dideklarasikan via IIFE lalu SELF-REGISTER ke
   window + globalThis agar berkas yang sama bekerja tanpa perubahan di browser
   (<script> di app.html setelah app.js) maupun pada harness uji (Vitest +
   jsdom via loadModule), DITAMBAH dukungan module.exports untuk `require()`.

   EKSTENSIBILITAS — Task 11.2 (AquaProgress):
     Berkas ini juga menjadi rumah bagi `AquaProgress` (trendSeries / delta /
     alignWithWaterScore) yang ditambahkan pada task 11.2. AquaProgress ditulis
     sebagai BLOK IIFE terpisah yang men-self-register namespace-nya sendiri,
     sehingga dapat ditambahkan di bawah blok ini tanpa konflik dengan
     AquaSkinDiary. Lihat penanda di akhir berkas.
   ===================================================== */

const AquaSkinDiary = (function () {
  'use strict';

  /** Prefix kunci localStorage per profil (konsisten dengan data-export.js). */
  const STORAGE_PREFIX = 'aquent-skin-diary-';

  /** Milidetik per hari kalender. */
  const MS_PER_DAY = 86400000;

  /** Fallback terdokumentasi bila AquaConfig belum dimuat. Requirement 5.10. */
  const DEFAULT_REMINDER_DAYS = 14;

  /**
   * Kunci metrik kanonik SkinEntry (urutan stabil). Hanya metrik numerik
   * turunan ini yang disimpan — tidak ada field citra. Design §6 / Data Models.
   * @type {string[]}
   */
  const METRIC_KEYS = ['saturation', 'redness', 'oiliness', 'texture', 'sharpness'];

  /**
   * Pemetaan field keluaran pipeline lokal (analyzeImagePixels) → kunci metrik
   * kanonik. Menerima beberapa alias agar dapat menerima `pixels` mentah maupun
   * objek metrik yang sudah dinormalisasi.
   */
  const METRIC_ALIASES = {
    saturation: ['saturation', 'hydrationProxy', 'hydration', 'hydrationLevel'],
    redness: ['redness', 'rednessIndex'],
    oiliness: ['oiliness', 'oilinessProxy'],
    texture: ['texture', 'textureScore'],
    sharpness: ['sharpness', 'sharpnessScore'],
  };

  /**
   * Regex nama field yang mengindikasikan citra mentah / data biner besar.
   * Field yang cocok dibuang dari payload tersimpan & tersinkron sebagai jaring
   * pengaman privasi (R5.2, R5.3). Selaras dengan data-export.js (R10.3).
   */
  const IMAGE_KEY_RE = /(image|photo|pixels|base64|dataurl|thumbnail|rawimg|imgdata|snapshot|frame|canvas)/i;

  /**
   * Penghitung monoton untuk menjamin keunikan id meski beberapa entri dibuat
   * dalam milidetik yang sama.
   * @type {number}
   */
  let _seq = 0;

  // ---------------------------------------------------------------------------
  // Helper internal
  // ---------------------------------------------------------------------------

  /**
   * Selesaikan profileId efektif. Bila tidak diberikan (null/undefined), coba
   * ambil dari Active_Profile aplikasi (getActiveProfile dari app.js), lalu
   * jatuh ke 'default' — mengikuti pola saveCurrentSession() di app.js dan
   * _resolveProfileId() di notifications.js. Nilai lain (termasuk string
   * kosong) dipertahankan apa adanya agar isolasi antar profil deterministik.
   * @param {string} [profileId]
   * @returns {string}
   */
  function _resolveProfileId(profileId) {
    if (profileId === null || profileId === undefined) {
      try {
        if (typeof getActiveProfile === 'function') {
          const p = getActiveProfile();
          if (p && p.id) return String(p.id);
        }
      } catch (_) {
        /* getActiveProfile tidak tersedia di lingkungan uji — abaikan */
      }
      return 'default';
    }
    return String(profileId);
  }

  /** Bangun kunci localStorage untuk sebuah profil. */
  function _key(profileId) {
    return STORAGE_PREFIX + _resolveProfileId(profileId);
  }

  /** Akses localStorage secara anggun; null bila tidak tersedia. */
  function _ls() {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    if (typeof window !== 'undefined' && window && window.localStorage) {
      return window.localStorage;
    }
    return null;
  }

  /**
   * Baca daftar entri mentah dari localStorage. Anggun terhadap data
   * hilang/rusak: selalu kembalikan array. Mengikuti pola getSessionHistory()
   * di app.js.
   * @param {string} [profileId]
   * @returns {Array<Object>}
   */
  function _read(profileId) {
    try {
      const ls = _ls();
      if (!ls) return [];
      const raw = ls.getItem(_key(profileId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Tulis daftar entri ke localStorage. Mengembalikan true bila berhasil,
   * false bila storage tidak tersedia / kuota penuh (dipakai deleteEntry untuk
   * menjaga semantik atomik).
   * @param {string} [profileId]
   * @param {Array<Object>} list
   * @returns {boolean}
   */
  function _write(profileId, list) {
    try {
      const ls = _ls();
      if (!ls) return false;
      ls.setItem(_key(profileId), JSON.stringify(list));
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Hasilkan id unik untuk entri baru. */
  function _genId() {
    _seq = (_seq + 1) % 1e9;
    const rand = Math.random().toString(36).slice(2, 8);
    return `sd_${Date.now()}_${_seq}_${rand}`;
  }

  /** Konversi ke angka berhingga, atau null bila tidak valid. */
  function _numOrNull(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (s === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  /**
   * Buang field bernuansa citra secara rekursif (jaring pengaman R5.2/R5.3).
   * Menyalin struktur (tidak memutasi masukan). Primitif diteruskan apa adanya.
   * @param {*} value
   * @returns {*}
   */
  function _stripImages(value) {
    if (Array.isArray(value)) return value.map(_stripImages);
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

  /** Ambil nilai alias pertama yang ada dari sebuah objek sumber. */
  function _readAlias(src, aliases) {
    for (let i = 0; i < aliases.length; i++) {
      const k = aliases[i];
      if (src[k] !== undefined && src[k] !== null) return src[k];
    }
    return undefined;
  }

  /**
   * Turunkan lima metrik kanonik dari keluaran pipeline lokal. Menerima:
   *   - objek metrik yang sudah dinormalisasi ({saturation, redness, ...}),
   *   - objek `pixels` dari analyzeImagePixels() ({hydrationProxy, rednessIndex, ...}),
   *   - objek hasil buildLocalScanResult() (yang memuat `pixels`).
   * Nilai dikoersikan ke angka berhingga; field yang hilang → null.
   *
   * @param {Object} source
   * @returns {{saturation:(number|null), redness:(number|null), oiliness:(number|null), texture:(number|null), sharpness:(number|null)}}
   */
  function deriveMetrics(source) {
    const metrics = {};
    for (let i = 0; i < METRIC_KEYS.length; i++) metrics[METRIC_KEYS[i]] = null;
    if (!source || typeof source !== 'object') return metrics;

    // Sumber yang mungkin memuat metrik, dari yang paling kanonik ke mentah:
    //   `.metrics` (sudah dinormalisasi) → objek itu sendiri (metrik top-level)
    //   → `.pixels` (keluaran analyzeImagePixels) → `.scanResult(.pixels)`
    //   (keluaran buildLocalScanResult). Urutan menentukan prioritas.
    const candidates = [];
    if (source.metrics && typeof source.metrics === 'object') candidates.push(source.metrics);
    candidates.push(source);
    if (source.pixels && typeof source.pixels === 'object') candidates.push(source.pixels);
    if (source.scanResult && typeof source.scanResult === 'object') {
      candidates.push(source.scanResult);
      if (source.scanResult.pixels && typeof source.scanResult.pixels === 'object') {
        candidates.push(source.scanResult.pixels);
      }
    }

    for (let i = 0; i < METRIC_KEYS.length; i++) {
      const key = METRIC_KEYS[i];
      const aliases = METRIC_ALIASES[key];
      for (let c = 0; c < candidates.length; c++) {
        const v = _numOrNull(_readAlias(candidates[c], aliases));
        if (v !== null) {
          metrics[key] = v;
          break;
        }
      }
    }
    return metrics;
  }

  /**
   * Bangun SkinEntry bersih (metrik turunan saja) dari sebuah scan/entri mentah.
   * Hanya field aman yang dipertahankan — citra & field tak dikenal dibuang.
   *
   * @param {Object} opts
   * @param {Object} [opts.scanResult]  Keluaran buildLocalScanResult().
   * @param {Object} [opts.pixels]      Keluaran analyzeImagePixels().
   * @param {Object} [opts.metrics]     Metrik yang sudah dinormalisasi.
   * @param {number} [opts.score]       Skor kulit (mis. skinScore).
   * @param {string} [opts.skinType]
   * @param {number} [opts.confidence]
   * @param {string} [opts.skinDiaryId]/[opts.id]
   * @param {number} [opts.ts]
   * @param {string} [opts.profileId]
   * @param {string} [opts.syncStatus]
   * @returns {Object} SkinEntry
   */
  function buildEntry(opts) {
    const src = opts || {};
    // Sumber metrik bisa berupa scanResult (memuat pixels), pixels, atau metrics.
    const metricSource =
      (src.metrics && { metrics: src.metrics }) ||
      src.scanResult ||
      (src.pixels && { pixels: src.pixels }) ||
      src;
    const metrics = deriveMetrics(metricSource);

    const scan = src.scanResult && typeof src.scanResult === 'object' ? src.scanResult : {};

    const score =
      _numOrNull(src.score) !== null
        ? _numOrNull(src.score)
        : _numOrNull(scan.skinScore !== undefined ? scan.skinScore : scan.score);

    const confidence =
      _numOrNull(src.confidence) !== null
        ? _numOrNull(src.confidence)
        : _numOrNull(scan.confidence);

    const skinType =
      src.skinType != null
        ? String(src.skinType)
        : scan.skinType != null
        ? String(scan.skinType)
        : null;

    return _normalizeEntry(
      {
        id: src.id != null ? src.id : src.skinDiaryId,
        ts: src.ts,
        metrics: metrics,
        score: score,
        skinType: skinType,
        confidence: confidence,
        syncStatus: src.syncStatus,
      },
      src.profileId
    );
  }

  /**
   * Normalisasi sebuah entri menjadi SkinEntry kanonik. Membangun objek BARU
   * berisi HANYA field aman (tanpa citra), sehingga tidak mungkin membocorkan
   * data citra mentah dari masukan (R5.2). Metrik dibatasi ke lima kunci kanonik
   * dan dikoersikan ke angka/null.
   *
   * @param {Object} entry
   * @param {string} [profileId]
   * @returns {Object} SkinEntry
   */
  function _normalizeEntry(entry, profileId) {
    const src = entry && typeof entry === 'object' ? entry : {};
    const pid = _resolveProfileId(profileId != null ? profileId : src.profileId);

    // Bangun metrik bersih dari sumber apa pun (metrics/pixels/scan) lalu
    // pertahankan hanya lima kunci kanonik sebagai angka/null. deriveMetrics
    // sudah tahu cara mendescend ke `.metrics`, `.pixels`, dan `.scanResult`.
    const derived = deriveMetrics(src);
    const metrics = {};
    for (let i = 0; i < METRIC_KEYS.length; i++) {
      metrics[METRIC_KEYS[i]] = derived[METRIC_KEYS[i]];
    }

    const syncStatus =
      src.syncStatus === 'synced' || src.syncStatus === 'pending' ? src.syncStatus : 'local';

    return {
      id: src.id != null ? String(src.id) : _genId(),
      profileId: pid,
      ts: Number.isFinite(src.ts) ? src.ts : Date.now(),
      metrics: metrics,
      score: _numOrNull(src.score),
      skinType: src.skinType != null ? String(src.skinType) : null,
      confidence: _numOrNull(src.confidence),
      syncStatus: syncStatus,
    };
  }

  /**
   * Bangun payload sinkron Firestore — HANYA metrik numerik, tanpa citra dan
   * tanpa field internal lokal (id/profileId/syncStatus dikelola di luar
   * dokumen). Design Firestore model: { ts, metrics, score, skinType, confidence }.
   * @param {Object} entry  SkinEntry tersimpan.
   * @returns {Object}
   */
  function _syncPayload(entry) {
    const e = entry || {};
    const payload = {
      ts: Number.isFinite(e.ts) ? e.ts : Date.now(),
      metrics: {},
      score: _numOrNull(e.score),
      skinType: e.skinType != null ? String(e.skinType) : null,
      confidence: _numOrNull(e.confidence),
    };
    const m = e.metrics && typeof e.metrics === 'object' ? e.metrics : {};
    for (let i = 0; i < METRIC_KEYS.length; i++) {
      payload.metrics[METRIC_KEYS[i]] = _numOrNull(m[METRIC_KEYS[i]]);
    }
    // Jaring pengaman: pastikan tidak ada field citra menyusup.
    return _stripImages(payload);
  }

  /** Konstanta usia pengingat (hari) dari AquaConfig dengan fallback. R5.10. */
  function _reminderDays() {
    const cfg =
      (typeof globalThis !== 'undefined' && globalThis.AquaConfig) ||
      (typeof AquaConfig !== 'undefined' ? AquaConfig : null);
    if (cfg && typeof cfg.SKIN_SCAN_REMINDER_DAYS === 'number' && cfg.SKIN_SCAN_REMINDER_DAYS >= 0) {
      return cfg.SKIN_SCAN_REMINDER_DAYS;
    }
    return DEFAULT_REMINDER_DAYS;
  }

  /** Resolusi Firestore instance dari options atau global firebase. */
  function _resolveFirestore(opts) {
    const o = opts || {};
    // 1) Instance/factory di-inject langsung.
    if (o.firestore) {
      return typeof o.firestore === 'function' ? o.firestore() : o.firestore;
    }
    if (o.db) return o.db;
    // 2) Global firebase (browser).
    try {
      const fb =
        (typeof globalThis !== 'undefined' && globalThis.firebase) ||
        (typeof firebase !== 'undefined' ? firebase : null);
      if (fb && typeof fb.firestore === 'function') return fb.firestore();
    } catch (_) {
      /* firebase tidak tersedia */
    }
    return null;
  }

  /** Resolusi uid dari options atau auth.js getAuthUser(). */
  function _resolveUid(opts) {
    const o = opts || {};
    if (o.uid != null) return String(o.uid);
    try {
      if (typeof getAuthUser === 'function') {
        const u = getAuthUser();
        if (u && u.uid) return String(u.uid);
      }
    } catch (_) {
      /* auth tidak tersedia */
    }
    return null;
  }

  /**
   * Implementasi default penulisan metrik ke Firestore
   * users/{uid}/skinMetrics/{id}. MELEMPAR bila gagal (ditangkap pemanggil →
   * status 'pending'). Bila Firestore/uid tidak tersedia, dianggap GAGAL
   * (tidak ada tujuan sinkron) sehingga status menjadi 'pending'. R5.3, R5.4.
   */
  async function _defaultSync(payload, entry, opts) {
    const fs = _resolveFirestore(opts);
    const uid = _resolveUid(opts);
    if (!fs || !uid) {
      throw new Error('firestore_unavailable');
    }
    await fs
      .collection('users')
      .doc(uid)
      .collection('skinMetrics')
      .doc(String(entry.id))
      .set(payload);
  }

  /**
   * Implementasi default penghapusan metrik dari Firestore. Bila Firestore/uid
   * tidak tersedia, dianggap TIDAK ADA salinan remote → sukses (no-op) sehingga
   * entri lokal-saja tetap dapat dihapus. MELEMPAR hanya bila operasi remote
   * yang nyata gagal. R5.8.
   */
  async function _defaultRemoteDelete(entryId, profileId, opts) {
    const fs = _resolveFirestore(opts);
    const uid = _resolveUid(opts);
    if (!fs || !uid) return; // tidak ada tujuan remote → anggap sukses
    await fs
      .collection('users')
      .doc(uid)
      .collection('skinMetrics')
      .doc(String(entryId))
      .delete();
  }

  /** Tetapkan syncStatus pada entri tersimpan (upsert bila belum ada). */
  function _persistStatus(entry, profileId, status) {
    const pid = _resolveProfileId(profileId);
    const list = _read(profileId);
    let found = false;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === String(entry.id)) {
        list[i].syncStatus = status;
        entry.syncStatus = status;
        found = true;
        break;
      }
    }
    if (!found) {
      entry.syncStatus = status;
      entry.profileId = pid;
      list.push(entry);
    }
    _write(profileId, list);
  }

  // ---------------------------------------------------------------------------
  // API publik
  // ---------------------------------------------------------------------------

  /**
   * Simpan entri Skin Diary (metrik turunan saja) ke localStorage per profil.
   * Citra mentah tidak pernah ditulis — payload dinormalisasi ke SkinEntry
   * bersih. Bila entri dengan id sama sudah ada, entri di-UPSERT (diganti).
   * Requirements 5.1, 5.2
   *
   * @param {Object} entry       SkinEntry mentah / scan (boleh memuat pixels/scanResult).
   * @param {string} [profileId] Active_Profile.
   * @returns {Object} SkinEntry yang tersimpan (tanpa citra).
   */
  function saveEntry(entry, profileId) {
    const normalized = _normalizeEntry(entry || {}, profileId);
    const list = _read(profileId);
    let replaced = false;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === normalized.id) {
        list[i] = normalized;
        replaced = true;
        break;
      }
    }
    if (!replaced) list.push(normalized);
    _write(profileId, list);
    return normalized;
  }

  /**
   * Sinkron HANYA metrik numerik (tanpa citra) ke Firestore. Bila gagal,
   * status entri ditandai 'pending' dan entri tetap dipertahankan untuk dicoba
   * ulang. Bila berhasil, status menjadi 'synced'. Requirements 5.3, 5.4
   *
   * @param {Object} entry        SkinEntry (atau mentah; akan dinormalisasi).
   * @param {string} [profileId]
   * @param {Object} [options]
   * @param {function} [options.sync]  Override penulisan remote untuk pengujian/DI:
   *        (payload, entry, options) => Promise. MELEMPAR/reject → 'pending'.
   * @param {Object|function} [options.firestore] Instance/factory Firestore.
   * @param {string} [options.uid]
   * @returns {Promise<'synced'|'pending'>}
   */
  async function syncEntry(entry, profileId, options) {
    const opts = options || {};
    // Pastikan entri ada di store kanonik sebelum disinkron.
    const normalized = _normalizeEntry(entry || {}, profileId);
    const existing = _read(profileId).find(
      (e) => e && String(e.id) === normalized.id
    );
    const target = existing ? _normalizeEntry(existing, profileId) : normalized;
    if (!existing) {
      // Simpan dulu (status 'local') agar tidak hilang saat sinkron gagal.
      saveEntry(target, profileId);
    }

    const payload = _syncPayload(target); // metrik saja, tanpa citra (R5.3)
    const syncFn = typeof opts.sync === 'function' ? opts.sync : _defaultSync;

    try {
      await syncFn(payload, target, opts);
      _persistStatus(target, profileId, 'synced');
      return 'synced';
    } catch (_) {
      // Gagal jaringan/server → tandai tertunda, pertahankan entri (R5.4).
      _persistStatus(target, profileId, 'pending');
      return 'pending';
    }
  }

  /**
   * Hapus entri secara ATOMIK (all-or-nothing) dari lokal + Firestore.
   * Strategi: coba hapus sisi REMOTE (lebih rawan gagal) lebih dulu; bila gagal,
   * sisi lokal TIDAK disentuh sehingga kedua salinan tetap konsisten dan operasi
   * dilaporkan gagal. Bila remote sukses (atau tidak ada tujuan remote), barulah
   * sisi lokal dihapus. Requirements 5.8
   *
   * @param {string} entryId
   * @param {string} [profileId]
   * @param {Object} [options]
   * @param {function} [options.remoteDelete]  Override penghapusan remote untuk
   *        pengujian/DI: (entryId, profileId, options) => Promise. reject → gagal.
   * @param {Object|function} [options.firestore]
   * @param {string} [options.uid]
   * @returns {Promise<{ok:boolean}>}
   */
  async function deleteEntry(entryId, profileId, options) {
    const opts = options || {};
    const id = entryId != null ? String(entryId) : null;
    if (id === null) return { ok: false };

    const pid = _resolveProfileId(profileId);
    const before = _read(profileId);
    const existsLocal = before.some((e) => e && String(e.id) === id);

    // Fase 1 — hapus sisi remote terlebih dulu (rawan gagal).
    const remoteDelete =
      typeof opts.remoteDelete === 'function' ? opts.remoteDelete : _defaultRemoteDelete;
    try {
      await remoteDelete(id, pid, opts);
    } catch (_) {
      // Remote gagal → batalkan; jangan sentuh lokal. Kedua salinan dipertahankan.
      return { ok: false };
    }

    // Fase 2 — remote sukses (atau tidak ada): hapus sisi lokal.
    if (existsLocal) {
      const after = before.filter((e) => !(e && String(e.id) === id));
      const wrote = _write(profileId, after);
      if (!wrote) {
        // Penulisan lokal gagal → laporkan gagal (jaga konsistensi).
        return { ok: false };
      }
    }
    return { ok: true };
  }

  /**
   * True jika dan hanya jika entri TERBARU berusia lebih dari
   * SKIN_SCAN_REMINDER_DAYS (default 14) hari relatif terhadap `now`.
   * Tanpa entri valid → false (tidak ada "entri terbaru"). Requirements 5.10
   *
   * @param {Array<Object>} entries  Kumpulan SkinEntry (dengan field ts).
   * @param {number} [now]           Epoch ms; default Date.now().
   * @returns {boolean}
   */
  function needsScanReminder(entries, now) {
    if (!Array.isArray(entries) || entries.length === 0) return false;
    const ref = Number.isFinite(now) ? now : Date.now();

    let latestTs = null;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const ts = e && _numOrNull(e.ts);
      if (ts === null) continue;
      if (latestTs === null || ts > latestTs) latestTs = ts;
    }
    if (latestTs === null) return false; // tidak ada stempel waktu valid

    const maxAgeMs = _reminderDays() * MS_PER_DAY;
    return ref - latestTs > maxAgeMs; // "lebih dari" → perbandingan ketat
  }

  return {
    STORAGE_PREFIX: STORAGE_PREFIX,
    METRIC_KEYS: METRIC_KEYS.slice(),
    deriveMetrics: deriveMetrics,
    buildEntry: buildEntry,
    saveEntry: saveEntry,
    syncEntry: syncEntry,
    deleteEntry: deleteEntry,
    needsScanReminder: needsScanReminder,
  };
})();

// Self-register agar berkas yang sama bekerja di browser (<script> di app.html
// setelah app.js) dan pada harness uji (Vitest + jsdom via loadModule).
if (typeof window !== 'undefined') window.AquaSkinDiary = AquaSkinDiary;
if (typeof globalThis !== 'undefined') globalThis.AquaSkinDiary = AquaSkinDiary;

// Dukungan CommonJS untuk `require()` (Vitest/Node). Task 11.2 akan menambahkan
// AquaProgress pada berkas ini; saat itu module.exports dapat diperluas menjadi
// { AquaSkinDiary, AquaProgress } tanpa mengubah blok di atas.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AquaSkinDiary;
  module.exports.AquaSkinDiary = AquaSkinDiary;
}

// =====================================================
// Task 11.2 — AquaProgress (trendSeries / delta / alignWithWaterScore)
// ditambahkan DI BAWAH sini sebagai blok IIFE self-register terpisah.
// Jangan modifikasi blok AquaSkinDiary di atas.
// =====================================================
