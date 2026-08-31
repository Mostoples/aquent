/* =====================================================
   AQUENT — Alert_Manager (AquaAlerts)
   Spec: advanced-features-upgrade — Task 7.1
   Requirements: 2.4, 2.5, 2.8, 2.9

   Modul ini membangun, mengklasifikasikan, dan menyalurkan (dispatch)
   peringatan (alert) yang berasal dari Anomaly_Detector (anomaly.js) ke
   Notification_Center (notifications.js / AquaNotif), sambil menghormati
   preferensi kategori pengguna pada `aquent-alert-prefs`.

   Kontrak (lihat design.md §4 "Alert_Manager"):

     - createAlert(anomaly[, templates])  => Alert
         Bangun Alert dari sebuah anomali + template notifikasi. Alert WAJIB
         memuat nama parameter, nilai terukur, nilai baseline, dan tingkat
         keparahan (severity). Judul/isi diambil dari template water-quality
         pada data/notification_templates.json dan diinterpolasi.   (R2.4, R2.5)

     - classify(alert)  => 'critical' | 'warning' | 'info'
         Klasifikasikan severity sebuah alert/anomali. Mengembalikan severity
         masukan bila sudah valid; selain itu menurunkannya dari jumlah deviasi
         (σ) relatif terhadap faktor z-score k (AquaConfig.ANOMALY_K).   (R2.5)

     - dispatch(alert[, prefs])  => { shown:boolean, logged:boolean }
         Tampilkan + catat alert ke Notification_Center via AquaNotif.add().
         Bila kategori alert dinonaktifkan pengguna → tampilan & pencatatan
         DITAHAN ({shown:false, logged:false}). Bila tidak dinonaktifkan →
         alert ditampilkan dan dicatat.                              (R2.8, R2.9)

     - isSuppressed(category[, prefs])  => boolean
         True bila kategori dinonaktifkan pengguna pada preferensi.   (R2.9)

   Alert: { param, value, baseline, severity, category, type, templateKey,
            title, body, ts }
     · severity ∈ 'critical' | 'warning' | 'info'
     · category  = 'water_quality' (anomali sensor selalu kategori ini; R8.6)

   PREFERENSI (`aquent-alert-prefs`, lihat design.md Data Models):
     { water_quality: true, gamification: true, reminder: true, education: false }
   Nilai `false` berarti kategori DINONAKTIFKAN (suppressed). Bila preferensi
   tidak diberikan sebagai argumen, modul membacanya dari localStorage secara
   anggun (gagal/rusak → dianggap tidak ada preferensi → tidak menahan apa pun).

   CATATAN — TEMPLATE:
   Modul menyertakan salinan ringkas (judul/isi) dari blok `water_quality_alerts`
   pada data/notification_templates.json sebagai fallback bawaan, sehingga
   createAlert() berfungsi sinkron di browser maupun pada harness uji tanpa
   I/O. Di produksi, app.js dapat menyuntikkan objek template lengkap hasil
   fetch melalui argumen `templates` (atau AquaAlerts.setTemplates) agar judul
   mengikuti versi/bahasa terbaru.

   Pola pemuatan mengikuti anomaly.js / xai.js: namespace global `AquaAlerts`
   + dukungan module.exports agar dapat diuji via Vitest. Self-register agar
   berkas yang sama bekerja identik di browser (<script>) dan jsdom.
   ===================================================== */

(function (root, factory) {
  'use strict';
  var AquaAlerts = factory(root);

  // Ekspos sebagai global (browser window / jsdom / worker → globalThis).
  if (root && !root.AquaAlerts) {
    root.AquaAlerts = AquaAlerts;
  }

  // Ekspos untuk lingkungan CommonJS (Vitest/Node) bila tersedia.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root && root.AquaAlerts ? root.AquaAlerts : AquaAlerts;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konstanta lokal
  // ---------------------------------------------------------------------------

  /** Kunci localStorage preferensi kategori peringatan (R2.9). */
  var ALERT_PREFS_KEY = 'aquent-alert-prefs';

  /** Severity yang valid (R2.5). */
  var SEVERITIES = ['critical', 'warning', 'info'];

  /** Kategori notifikasi untuk seluruh alert anomali sensor (R8.6). */
  var DEFAULT_CATEGORY = 'water_quality';

  /** Fallback faktor z-score k (selaras config.js / anomaly.js). */
  var DEFAULT_K = 3;

  /**
   * Salinan ringkas blok `water_quality_alerts` dari
   * data/notification_templates.json (judul + isi saja). Dipakai sebagai
   * fallback bawaan agar createAlert() bekerja sinkron tanpa I/O. Di produksi,
   * template lengkap (i18n) dapat disuntikkan via argumen / setTemplates.
   */
  var BUILTIN_TEMPLATES = {
    critical: {
      turbidity_high: {
        title: '⚠️ Air Keruh Terdeteksi',
        body: 'Kekeruhan {value} NTU — di atas batas aman. Tunda mandi hingga air kembali jernih.'
      },
      ph_very_low: {
        title: '⚠️ pH Air Sangat Asam',
        body: 'pH air {value} — jauh di bawah normal. Dapat menyebabkan iritasi kulit. Hindari mandi dulu.'
      },
      ph_very_high: {
        title: '⚠️ pH Air Sangat Basa',
        body: 'pH air {value} — terlalu basa. Dapat merusak lapisan pelindung kulit. Pertimbangkan filter.'
      },
      temp_too_hot: {
        title: '🔥 Air Terlalu Panas',
        body: 'Suhu air {value}°C — melebihi batas aman 40°C. Turunkan suhu untuk melindungi kulitmu.'
      }
    },
    warning: {
      tds_high: {
        title: '💧 Air Sadah Terdeteksi',
        body: 'TDS {value} ppm — air cukup keras. Bisa memperburuk kulit kering. Oleskan moisturizer segera setelah mandi.'
      },
      chlorine_high: {
        title: '🧪 Klorin Tinggi',
        body: 'Klorin {value} mg/L — di atas batas optimal. Pertimbangkan shower filter karbon aktif.'
      },
      chlorine_low: {
        title: 'ℹ️ Klorin Sangat Rendah',
        body: 'Klorin {value} mg/L — terlalu rendah. Air mungkin kurang terlindungi dari bakteri. Periksa sumber air.'
      },
      temp_cold: {
        title: '🧊 Air Terlalu Dingin',
        body: 'Suhu air {value}°C — di bawah optimal. Naikkan ke 36–38°C untuk pembersihan kulit yang efektif.'
      },
      quality_score_low: {
        title: '📉 Skor Air Turun',
        body: 'Skor kualitas air saat ini {score}/100 (Grade {grade}). {param} menjadi faktor utama. Cek dashboard.'
      }
    },
    info: {
      quality_excellent: {
        title: '✅ Kondisi Air Optimal!',
        body: 'Skor kualitas air {score}/100 — Grade A. Waktu yang tepat untuk mandi sehat, {name}!'
      },
      quality_restored: {
        title: '✅ Kualitas Air Pulih',
        body: 'Air kembali ke kondisi normal. Skor: {score}/100. Aman untuk mandi sekarang.'
      }
    }
  };

  /** Label parameter (ID) untuk interpolasi {param} & judul fallback. */
  var PARAM_LABELS = {
    ph: 'pH',
    temp: 'Suhu',
    temperature: 'Suhu',
    turbidity: 'Kekeruhan',
    tds: 'TDS',
    chlorine: 'Klorin'
  };

  /** Template yang disuntikkan via setTemplates() (opsional). */
  var _injectedTemplates = null;

  // ---------------------------------------------------------------------------
  // Utilitas
  // ---------------------------------------------------------------------------

  /** Konversi ke angka berhingga, atau null bila tidak valid. */
  function numOrNull(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    var n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /** Petakan nama parameter ke kunci kanonik (toleran temp/temperature). */
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

  /** Label tampilan untuk parameter (fallback ke nama mentah). */
  function paramLabel(param) {
    var p = String(param || '').toLowerCase();
    return PARAM_LABELS[p] || String(param || '');
  }

  /** Faktor z-score k aktif (AquaConfig.ANOMALY_K) dengan fallback. */
  function configK() {
    var cfg = (root && root.AquaConfig) || (typeof AquaConfig !== 'undefined' ? AquaConfig : null);
    if (cfg && typeof cfg.ANOMALY_K === 'number' && Number.isFinite(cfg.ANOMALY_K)) {
      return cfg.ANOMALY_K;
    }
    return DEFAULT_K;
  }

  /** Format angka untuk interpolasi: bilangan bulat apa adanya, selainnya ~2 desimal. */
  function fmtNumber(value) {
    var n = numOrNull(value);
    if (n === null) return '—';
    if (Number.isInteger(n)) return String(n);
    return String(Math.round(n * 100) / 100);
  }

  /**
   * Interpolasi placeholder template ({value}, {param}, {score}, {grade},
   * {name}) dari objek konteks. Placeholder tanpa nilai konteks digantikan
   * string kosong agar tidak menyisakan kurung kurawal.
   */
  function interpolate(template, ctx) {
    var c = ctx || {};
    return String(template == null ? '' : template).replace(
      /\{(value|param|score|grade|name)\}/g,
      function (_m, key) {
        if (key === 'value') return fmtNumber(c.value);
        if (key === 'param') return c.param != null ? String(c.param) : '';
        if (c[key] === null || c[key] === undefined) return '';
        return String(c[key]);
      }
    );
  }

  /** Referensi ke Notification_Center (AquaNotif) bila tersedia. */
  function notifCenter() {
    if (root && root.AquaNotif) return root.AquaNotif;
    if (typeof AquaNotif !== 'undefined') return AquaNotif;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Resolusi template
  // ---------------------------------------------------------------------------

  /**
   * Normalisasikan sumber template menjadi subtree water-quality
   * ({ critical, warning, info }). Menerima:
   *   - objek notification_templates.json penuh (punya `water_quality_alerts`)
   *   - subtree langsung (punya `critical`/`warning`/`info`)
   *   - null/tidak dikenal → fallback bawaan.
   */
  function resolveTemplates(templates) {
    var src = templates || _injectedTemplates;
    if (src && typeof src === 'object') {
      if (src.water_quality_alerts && typeof src.water_quality_alerts === 'object') {
        return src.water_quality_alerts;
      }
      if (src.critical || src.warning || src.info) {
        return src;
      }
    }
    return BUILTIN_TEMPLATES;
  }

  /** Cari sebuah template berdasarkan key di seluruh tier severity. */
  function lookupTemplate(tree, key) {
    if (!tree || !key) return null;
    var tiers = ['critical', 'warning', 'info'];
    for (var i = 0; i < tiers.length; i++) {
      var tier = tree[tiers[i]];
      if (tier && tier[key]) return tier[key];
    }
    return null;
  }

  /**
   * Tentukan kunci template untuk sebuah anomali berdasarkan tipe jalur,
   * parameter, dan arah penyimpangan (high/low).
   */
  function pickTemplateKey(param, type, direction) {
    // Jalur ambang khusus (anomaly.js: hard_water / chlorine_high / chlorine_low).
    if (type === 'hard_water') return 'tds_high';
    if (type === 'chlorine_high') return 'chlorine_high';
    if (type === 'chlorine_low') return 'chlorine_low';

    // Jalur z-score: arah penyimpangan menentukan template.
    switch (canonicalKey(param)) {
      case 'ph':
        return direction === 'high' ? 'ph_very_high' : 'ph_very_low';
      case 'temp':
        return direction === 'high' ? 'temp_too_hot' : 'temp_cold';
      case 'turbidity':
        // Kekeruhan rendah = baik → tidak ada template alert.
        return direction === 'high' ? 'turbidity_high' : null;
      case 'tds':
        return 'tds_high';
      case 'chlorine':
        return direction === 'high' ? 'chlorine_high' : 'chlorine_low';
      default:
        return null;
    }
  }

  /** Arah penyimpangan dari tipe jalur khusus bila baseline tak diketahui. */
  function directionFromType(type) {
    if (type === 'chlorine_low') return 'low';
    return 'high';
  }

  /** Judul fallback bila tidak ada template yang cocok. */
  function fallbackTitle(param, direction) {
    var label = paramLabel(param);
    var arah = direction === 'low' ? 'rendah tidak wajar' : 'tinggi tidak wajar';
    return '⚠️ Anomali ' + label + ' (' + arah + ')';
  }

  /** Isi fallback bila tidak ada template yang cocok. */
  function fallbackBody(param, value, baseline, direction) {
    var label = paramLabel(param);
    var arah = direction === 'low' ? 'di bawah' : 'di atas';
    return (
      label + ' terukur ' + fmtNumber(value) + ' — menyimpang ' + arah +
      ' nilai baseline ' + fmtNumber(baseline) + '. Periksa kondisi air sebelum mandi.'
    );
  }

  // ---------------------------------------------------------------------------
  // Resolusi preferensi
  // ---------------------------------------------------------------------------

  /**
   * Selesaikan objek preferensi kategori. Bila `prefs` diberikan sebagai objek,
   * dipakai apa adanya; selain itu dibaca dari localStorage (`aquent-alert-prefs`)
   * secara anggun terhadap data hilang/rusak.
   * @returns {Object} peta kategori → boolean (true=aktif, false=dinonaktifkan)
   */
  function resolveAlertPrefs(prefs) {
    if (prefs && typeof prefs === 'object') return prefs;
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var raw = localStorage.getItem(ALERT_PREFS_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      }
    } catch (_) {
      /* localStorage tidak tersedia / JSON rusak — anggap tanpa preferensi */
    }
    return {};
  }

  // ---------------------------------------------------------------------------
  // API publik
  // ---------------------------------------------------------------------------

  /**
   * Klasifikasikan severity sebuah alert/anomali → {critical|warning|info}.
   * Requirement 2.5
   *
   * Mengembalikan severity masukan bila sudah salah satu nilai valid; jika
   * tidak, menurunkannya dari jumlah deviasi (σ): ≥ 2k σ → critical, > k σ →
   * warning, selain itu info. Bila tak ada sinyal → 'warning' (konservatif).
   *
   * @param {Object} alert  Alert atau anomali ({severity?, deviations?}).
   * @returns {'critical'|'warning'|'info'}
   */
  function classify(alert) {
    var a = alert || {};
    var sev = String(a.severity || '').toLowerCase();
    if (SEVERITIES.indexOf(sev) !== -1) return sev;

    var dev = numOrNull(a.deviations);
    if (dev !== null) {
      var k = configK();
      if (dev >= 2 * k) return 'critical';
      if (dev > k) return 'warning';
      return 'info';
    }
    return 'warning';
  }

  /**
   * Bangun Alert dari sebuah anomali + template. Requirements 2.4, 2.5
   *
   * Alert yang dihasilkan memuat nama parameter, nilai terukur, nilai baseline,
   * dan severity (R2.4), dengan severity ∈ {critical, warning, info} (R2.5).
   * Judul & isi diambil dari template water-quality (notification_templates.json)
   * lalu diinterpolasi; bila tak ada template cocok, dipakai teks fallback.
   *
   * @param {Object} anomaly             Anomali dari AquaAnomaly.evaluate().
   * @param {string} anomaly.param       Nama parameter.
   * @param {number} anomaly.value       Nilai terukur.
   * @param {number} anomaly.baseline    Nilai baseline (mean).
   * @param {string} [anomaly.severity]  'critical'|'warning'|'info'.
   * @param {number} [anomaly.deviations] Jumlah σ (untuk klasifikasi).
   * @param {string} [anomaly.type]      'zscore'|'hard_water'|'chlorine_high'|'chlorine_low'.
   * @param {number} [anomaly.ts]        Stempel waktu (epoch ms).
   * @param {Object} [templates]         Sumber template (penuh atau subtree).
   * @returns {Object} Alert.
   */
  function createAlert(anomaly, templates) {
    var a = anomaly || {};
    var value = numOrNull(a.value);
    var baseline = numOrNull(a.baseline);
    var severity = classify(a);

    var direction;
    if (value !== null && baseline !== null) {
      direction = value >= baseline ? 'high' : 'low';
    } else {
      direction = directionFromType(a.type);
    }

    var key = pickTemplateKey(a.param, a.type, direction);
    var tpl = lookupTemplate(resolveTemplates(templates), key);

    var ctx = {
      value: value,
      param: paramLabel(a.param),
      score: numOrNull(a.score),
      grade: a.grade != null ? a.grade : null,
      name: a.name != null ? a.name : null
    };

    var title = tpl ? interpolate(tpl.title, ctx) : fallbackTitle(a.param, direction);
    var body = tpl ? interpolate(tpl.body, ctx) : fallbackBody(a.param, value, baseline, direction);

    return {
      param: a.param,
      value: value,
      baseline: baseline,
      severity: severity,
      category: DEFAULT_CATEGORY,
      type: a.type != null ? a.type : null,
      templateKey: key || null,
      title: title,
      body: body,
      ts: Number.isFinite(a.ts) ? a.ts : Date.now()
    };
  }

  /**
   * True bila kategori dinonaktifkan pengguna pada preferensi. Requirement 2.9
   * Sebuah kategori dianggap dinonaktifkan jika dan hanya jika preferensinya
   * bernilai `false` secara eksplisit. Kategori tanpa preferensi → aktif.
   *
   * @param {string} category  Kategori notifikasi.
   * @param {Object} [prefs]   Peta preferensi; bila kosong dibaca dari localStorage.
   * @returns {boolean}
   */
  function isSuppressed(category, prefs) {
    var p = resolveAlertPrefs(prefs);
    return p[category] === false;
  }

  /**
   * Tampilkan + catat alert ke Notification_Center. Requirements 2.8, 2.9
   *
   * Bila kategori alert dinonaktifkan → tampilan & pencatatan DITAHAN
   * ({shown:false, logged:false}). Bila tidak → alert ditampilkan (shown:true)
   * dan dicatat ke AquaNotif (logged:true bila pencatatan berhasil).
   *
   * @param {Object} alert    Alert dari createAlert().
   * @param {Object} [prefs]  Preferensi kategori; bila kosong dibaca dari localStorage.
   * @returns {{shown:boolean, logged:boolean}}
   */
  function dispatch(alert, prefs) {
    var a = alert || {};
    var category = a.category != null ? a.category : DEFAULT_CATEGORY;
    var p = resolveAlertPrefs(prefs);

    if (isSuppressed(category, p)) {
      return { shown: false, logged: false };
    }

    var logged = false;
    var center = notifCenter();
    if (center && typeof center.add === 'function') {
      try {
        center.add(
          {
            category: category,
            title: a.title != null ? a.title : '',
            body: a.body != null ? a.body : '',
            ts: Number.isFinite(a.ts) ? a.ts : Date.now()
          },
          a.profileId
        );
        logged = true;
      } catch (_) {
        logged = false;
      }
    }

    return { shown: true, logged: logged };
  }

  /**
   * Suntikkan objek template (mis. notification_templates.json hasil fetch)
   * agar createAlert() memakai judul/isi terbaru (i18n) alih-alih fallback.
   * @param {Object} templates
   */
  function setTemplates(templates) {
    _injectedTemplates = templates && typeof templates === 'object' ? templates : null;
  }

  return {
    SEVERITIES: SEVERITIES.slice(),
    ALERT_PREFS_KEY: ALERT_PREFS_KEY,
    createAlert: createAlert,
    classify: classify,
    dispatch: dispatch,
    isSuppressed: isSuppressed,
    setTemplates: setTemplates
  };
});
