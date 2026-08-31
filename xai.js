/* =====================================================
   AQUENT — XAI_Engine (AquaXAI)
   Spec: advanced-features-upgrade  (Requirement 4.4–4.5, 11 — Transparansi XAI)

   Modul lintas-fitur yang menghasilkan transparansi untuk keluaran cerdas:
   atribusi faktor Water_Quality_Score, faktor sampingan TDS/klorin, narasi +
   rujukan ilmiah, serta Confidence_Score dan peringatan ketidakpastian.

   CAKUPAN (modul tunggal & koheren):
   - attributeScore(reading, TH)            → atribusi faktor ternormalisasi 100%
   - sideFactors(reading, TH)               → TDS & klorin (bobot 0% + alasan)
   - explainFactor(param, reading, TH, refs)→ narasi + rujukan ilmiah
   - confidence(kind, payload)              → Confidence_Score umum [0,100]
   - isHighUncertainty(score)               → flag < CONFIDENCE_LOW
   - uncertaintyWarning(score, lang)        → flag + pesan peringatan

   Logika skor (scoreParam/scoreTurbidity/calcQualityScore) disalin agar setara
   dengan app.js, dengan bobot tunggal-sumber dari data/thresholds.json.

   Pola pemuatan mengikuti modul vanilla lain (lihat config.js): namespace
   global `AquaXAI` + dukungan module.exports agar dapat diuji via Vitest.
   ===================================================== */

(function (root, factory) {
  'use strict';
  var AquaXAI = factory(root);

  // Ekspos sebagai global (browser window / jsdom / worker → globalThis).
  if (root && !root.AquaXAI) {
    root.AquaXAI = AquaXAI;
  }

  // Ekspos untuk lingkungan CommonJS (Vitest/Node) bila tersedia.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root && root.AquaXAI ? root.AquaXAI : AquaXAI;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utilitas numerik
  // ---------------------------------------------------------------------------

  /** Konversi ke angka berhingga; nilai non-finite/non-numerik → fallback. */
  function num(value, fallback) {
    var n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Apakah sebuah nilai numerik tersedia & berhingga. */
  function isFiniteNum(value) {
    if (value === null || value === undefined || value === '') return false;
    var n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n);
  }

  /** Jepit (clamp) ke rentang [lo, hi]. */
  function clamp(value, lo, hi) {
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
  }

  /** Jepit ke rentang [0, 1]. */
  function clamp01(value) {
    return clamp(num(value, 0), 0, 1);
  }

  /**
   * Ambang confidence rendah dari AquaConfig bila tersedia, jika tidak pakai
   * default terdokumentasi (50%). Dibaca lazy agar berfungsi di browser maupun
   * pengujian. Requirement 11.5
   */
  function confidenceLowThreshold() {
    var cfg = (root && root.AquaConfig) || (typeof AquaConfig !== 'undefined' ? AquaConfig : null);
    if (cfg && typeof cfg.CONFIDENCE_LOW === 'number') {
      return cfg.CONFIDENCE_LOW;
    }
    return 50;
  }

  // ---------------------------------------------------------------------------
  // Logika skor parameter — setara scoreParam()/scoreTurbidity() di app.js
  // ---------------------------------------------------------------------------

  /** Skor linear-bertahap untuk parameter dua-batas (pH, suhu). 0–100. */
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
    var t = trT || {};
    var optimal_max = num(t.optimal_max, 0.5);
    var max = num(t.max, 1);
    if (value <= optimal_max) return 100;
    if (value <= max) return 50 + 50 * (max - value) / (max - optimal_max);
    return Math.max(0, 50 - (value - max) * 50);
  }

  /** Skor parameter ter-bulat & terjepit ke [0,100] (aman terhadap non-finite). */
  function safeParamScore(raw) {
    var s = num(raw, 0);
    return clamp(Math.round(s), 0, 100);
  }

  // Default thresholds (cadangan bila TH tidak lengkap) — selaras app.js.
  var DEFAULT_TH = {
    ph: { optimal_min: 6.5, optimal_max: 7.5, min: 6.5, max: 8.5, weight_xai: 0.35, unit: 'pH' },
    temp: { optimal_min: 36, optimal_max: 38, min: 33, max: 40, weight_xai: 0.35, unit: '°C' },
    turbidity: { optimal_min: 0, optimal_max: 0.5, min: 0, max: 1, weight_xai: 0.30, unit: 'NTU' },
    tds: { min: 0, max: 300, optimal_min: 50, optimal_max: 200, weight_xai: 0.0, unit: 'ppm' },
    chlorine: { min: 0.1, max: 0.5, optimal_min: 0.2, optimal_max: 0.4, weight_xai: 0.0, unit: 'mg/L' }
  };

  // ---------------------------------------------------------------------------
  // Pembacaan nilai & status rentang
  // ---------------------------------------------------------------------------

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

  /** Baca nilai sensor untuk kunci kanonik dari objek reading. */
  function readValue(reading, key) {
    var r = reading || {};
    if (key === 'temp') {
      return r.temperature !== undefined ? r.temperature : r.temp;
    }
    return r[key];
  }

  /** Status rentang: 'low' | 'normal' | 'high' | 'unavailable'. */
  function rangeStatus(value, t) {
    if (!isFiniteNum(value)) return 'unavailable';
    var v = num(value, NaN);
    if (v < num(t.min, -Infinity)) return 'low';
    if (v > num(t.max, Infinity)) return 'high';
    return 'normal';
  }

  // ---------------------------------------------------------------------------
  // Narasi & rujukan
  // ---------------------------------------------------------------------------

  /** Format nilai untuk interpolasi {value}. */
  function fmtValue(v) {
    if (!isFiniteNum(v)) return '—';
    return String(typeof v === 'number' ? v : Number(v));
  }

  /** Ganti seluruh placeholder {value} dengan nilai terformat. */
  function interpolate(template, value) {
    return String(template || '').replace(/\{value\}/g, fmtValue(value));
  }

  // Rujukan utama per parameter (id sesuai data/references.json).
  var PREFERRED_REFS = {
    ph: ['lambers-2019', 'priya-2020'],
    temp: ['wollenberg-2022'],
    turbidity: ['parra-2020'],
    tds: ['jabbar-lopez-2021', 'perkin-2021', 'thyssen-2021'],
    chlorine: ['bates-2020', 'perkin-2021']
  };

  /** Saran tindakan ringkas per parameter & status (tanpa placeholder). */
  var ACTIONS = {
    ph: {
      low: 'Pertimbangkan filter alkali atau netralkan air sebelum mandi.',
      high: 'Pertimbangkan filter penyeimbang pH atau persingkat durasi mandi.',
      normal: 'pH dalam batas aman; tidak ada tindakan khusus diperlukan.'
    },
    temp: {
      low: 'Naikkan suhu air ke kisaran 36–38°C untuk pembersihan optimal.',
      high: 'Turunkan suhu air ke kisaran 36–38°C untuk melindungi skin barrier.',
      normal: 'Suhu sudah ideal; pertahankan di kisaran 36–38°C.'
    },
    turbidity: {
      low: 'Tidak ada tindakan diperlukan; air sudah jernih.',
      high: 'Aktifkan filter sedimen dan tunda mandi hingga air menjadi jernih.',
      normal: 'Kejernihan air baik; pertahankan pemeliharaan filter rutin.'
    },
    tds: {
      low: 'Tidak perlu tindakan; air tergolong lunak dan aman untuk kulit.',
      high: 'Pertimbangkan water softener atau filter penurun TDS.',
      normal: 'Kesadahan air dalam batas aman; pemantauan rutin sudah cukup.'
    },
    chlorine: {
      low: 'Periksa sumber air; klorin terlalu rendah dapat berarti perlindungan mikroba kurang.',
      high: 'Pertimbangkan filter karbon aktif atau shower filter untuk mengurangi klorin.',
      normal: 'Kadar klorin dalam rentang aman WHO; tidak ada tindakan khusus diperlukan.'
    }
  };

  /** Susun narasi + ringkasan untuk satu parameter pada status tertentu. */
  function buildNarrative(t, status, value) {
    var basis = t.scientific_basis || '';
    if (status === 'unavailable') {
      var unavailText =
        (basis ? basis + ' ' : '') +
        'Nilai sensor untuk parameter ini belum tersedia, sehingga penjelasan ' +
        'kontekstual tidak dapat dihitung saat ini.';
      return { text: unavailText, short: 'Data parameter tidak tersedia.' };
    }

    var impact;
    var alert;
    if (status === 'low') {
      impact = t.skin_impact_low;
      alert = t.alert_low;
    } else if (status === 'high') {
      impact = t.skin_impact_high;
      alert = t.alert_high;
    } else {
      impact = t.skin_impact_normal;
      alert = t.alert_normal;
    }

    var alertI = interpolate(alert || '', value);
    var parts = [];
    if (basis) parts.push(basis);
    if (impact) parts.push(impact);
    if (alertI) parts.push(alertI);

    return {
      text: parts.join(' '),
      short: alertI || impact || basis
    };
  }

  /** Pilih rujukan ilmiah (anggota references.json) untuk parameter. */
  function resolveCitations(key, references) {
    var refs = Array.isArray(references) ? references : [];
    var byId = {};
    refs.forEach(function (r) {
      if (r && r.id) byId[r.id] = r;
    });

    var out = [];
    var preferred = PREFERRED_REFS[key] || [];
    preferred.forEach(function (id) {
      if (byId[id]) out.push(byId[id]);
    });

    // Cadangan: pilih berdasarkan parameters_covered agar tetap ≥1 rujukan.
    if (out.length === 0) {
      refs.forEach(function (r) {
        if (r && Array.isArray(r.parameters_covered) && r.parameters_covered.indexOf(key) !== -1) {
          out.push(r);
        }
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Namespace publik
  // ---------------------------------------------------------------------------

  var AquaXAI = {
    /**
     * Atribusi faktor untuk Water_Quality_Score (deterministik).
     * kontribusi_i = weight_i × deficit_i, lalu dinormalisasi ke jumlah 100%.
     * Hanya pH, suhu, dan kekeruhan yang berkontribusi (TDS & klorin bobot 0%).
     *
     * Requirements 11.1, 11.7
     *
     * @param {Object} reading  Sensor_Reading ({ ph, temperature, turbidity, ... }).
     * @param {Object} TH       Thresholds (data/thresholds.json).
     * @returns {{param:string, contributionPct:number, paramScore:number, weight:number}[]}
     */
    attributeScore: function attributeScore(reading, TH) {
      var th = TH || {};
      var phT = th.ph || DEFAULT_TH.ph;
      var tT = th.temp || DEFAULT_TH.temp;
      var trT = th.turbidity || DEFAULT_TH.turbidity;

      var phVal = num(readValue(reading, 'ph'), 0);
      var tempVal = num(readValue(reading, 'temp'), 0);
      var turbVal = num(readValue(reading, 'turbidity'), 0);

      var phScore = safeParamScore(
        scoreParam(phVal, num(phT.optimal_min, 6.5), num(phT.optimal_max, 7.5), num(phT.min, 6.5), num(phT.max, 8.5))
      );
      var tempScore = safeParamScore(
        scoreParam(tempVal, num(tT.optimal_min, 36), num(tT.optimal_max, 38), num(tT.min, 33), num(tT.max, 40))
      );
      var turbScore = safeParamScore(scoreTurbidity(turbVal, trT));

      var factors = [
        { param: 'ph', paramScore: phScore, weight: num(phT.weight_xai, 0.35) },
        { param: 'temperature', paramScore: tempScore, weight: num(tT.weight_xai, 0.35) },
        { param: 'turbidity', paramScore: turbScore, weight: num(trT.weight_xai, 0.30) }
      ];

      // kontribusi = bobot × defisit (defisit = 100 − skor parameter).
      var contributions = factors.map(function (f) {
        return f.weight * (100 - f.paramScore);
      });
      var totalContribution = contributions.reduce(function (a, b) {
        return a + b;
      }, 0);

      var totalWeight = factors.reduce(function (a, f) {
        return a + f.weight;
      }, 0);

      return factors.map(function (f, i) {
        var pct;
        if (totalContribution > 0) {
          // Normalisasi proporsional terhadap defisit berbobot.
          pct = (contributions[i] / totalContribution) * 100;
        } else if (totalWeight > 0) {
          // Semua parameter optimal (defisit 0): atribusi menurut bobot inheren.
          pct = (f.weight / totalWeight) * 100;
        } else {
          pct = 100 / factors.length;
        }
        return {
          param: f.param,
          contributionPct: clamp(pct, 0, 100),
          paramScore: f.paramScore,
          weight: f.weight
        };
      });
    },

    /**
     * Faktor sampingan TDS & klorin: bobot 0% (tidak mengubah Water_Quality_Score)
     * disertai alasan terdokumentasi. Requirements 4.5, 11.4
     *
     * @param {Object} reading  Sensor_Reading.
     * @param {Object} TH       Thresholds.
     * @returns {{param:string, value:number, weight:number, status:string, reason:string}[]}
     */
    sideFactors: function sideFactors(reading, TH) {
      var th = TH || {};
      return ['tds', 'chlorine'].map(function (key) {
        var t = th[key] || DEFAULT_TH[key];
        var rawValue = readValue(reading, key);
        var value = isFiniteNum(rawValue) ? num(rawValue, 0) : null;
        var status = rangeStatus(rawValue, t);
        var reason =
          (t && typeof t.weight_xai_justification === 'string' && t.weight_xai_justification.length > 0)
            ? t.weight_xai_justification
            : (key === 'tds'
              ? 'TDS bersifat kumulatif lintas-sesi dan memiliki variabilitas sensor tinggi, sehingga dikecualikan dari skor (bobot 0%) dan disajikan sebagai faktor informatif.'
              : 'Risiko klorin bersifat dua-arah (terlalu rendah maupun terlalu tinggi) dan tidak linear, sehingga dikecualikan dari skor (bobot 0%) dan disajikan sebagai faktor informatif.');
        return {
          param: key,
          value: value,
          weight: 0,
          status: status,
          reason: reason
        };
      });
    },

    /**
     * Narasi naratif + rujukan ilmiah untuk satu faktor. Requirements 4.4, 11.3
     *
     * @param {string} param      Nama parameter (ph/temp/temperature/turbidity/tds/chlorine).
     * @param {Object} reading    Sensor_Reading.
     * @param {Object} TH         Thresholds.
     * @param {Array}  references Basis data rujukan (data/references.json).
     * @returns {Object|null} { param, status, short, text, action, outOfRange, citations } atau null.
     */
    explainFactor: function explainFactor(param, reading, TH, references) {
      var key = canonicalKey(param);
      if (!key) return null;

      var th = TH || {};
      var t = th[key] || DEFAULT_TH[key];
      if (!t) return null;

      var rawValue = readValue(reading, key);
      var status = rangeStatus(rawValue, t);
      var outOfRange = status === 'low' || status === 'high';

      var narrative = buildNarrative(t, status, rawValue);
      var action = status === 'unavailable'
        ? 'Aktifkan atau periksa sensor untuk parameter ini agar penjelasan dapat dihitung.'
        : ((ACTIONS[key] && ACTIONS[key][status]) || '');

      return {
        param: key,
        status: status,
        short: narrative.short,
        text: narrative.text,
        action: action,
        outOfRange: outOfRange,
        citations: resolveCitations(key, references)
      };
    },

    /**
     * Confidence_Score umum untuk keluaran analitik (forecast/anomaly/scan).
     * Selalu pada rentang [0, 100] dan deterministik untuk masukan identik.
     * Requirements 11.2, 1.5
     *
     * @param {'forecast'|'anomaly'|'scan'|string} kind  Jenis keluaran.
     * @param {Object} [payload]  Sinyal masukan spesifik per jenis.
     * @returns {number}  Confidence_Score pada [0, 100].
     */
    confidence: function confidence(kind, payload) {
      var p = payload || {};
      var raw;

      switch (kind) {
        case 'forecast': {
          var r2 = clamp01(p.r2);
          var sufficiency = clamp01(p.sufficiency);
          var recency = clamp01(p.recency);
          raw = 100 * (0.6 * r2 + 0.25 * sufficiency + 0.15 * recency);
          break;
        }
        case 'anomaly': {
          var sampleRatio = clamp01(p.sampleRatio);
          var stability = clamp01(p.stability);
          raw = 100 * (0.5 * sampleRatio + 0.5 * stability);
          break;
        }
        case 'scan': {
          raw = num(p.confidence, 0);
          break;
        }
        default: {
          raw = num(p.confidence, num(p.score, 0));
          break;
        }
      }

      return clamp(Math.round(raw), 0, 100);
    },

    /**
     * Apakah Confidence_Score tergolong "ketidakpastian tinggi"
     * (benar jika dan hanya jika score < ambang CONFIDENCE_LOW). Requirement 11.5
     *
     * @param {number} confidenceScore  Confidence_Score (0–100).
     * @returns {boolean}
     */
    isHighUncertainty: function isHighUncertainty(confidenceScore) {
      return num(confidenceScore, 0) < confidenceLowThreshold();
    },

    /**
     * Flag + pesan peringatan ketidakpastian tinggi untuk Confidence_Score.
     * `message` bernilai null bila confidence ≥ ambang. Requirement 11.5
     *
     * @param {number} confidenceScore  Confidence_Score (0–100).
     * @param {'id'|'en'} [lang='id']   Bahasa pesan.
     * @returns {{ highUncertainty: boolean, message: (string|null) }}
     */
    uncertaintyWarning: function uncertaintyWarning(confidenceScore, lang) {
      var high = AquaXAI.isHighUncertainty(confidenceScore);
      if (!high) {
        return { highUncertainty: false, message: null };
      }
      var en = lang === 'en';
      var score = clamp(Math.round(num(confidenceScore, 0)), 0, 100);
      var message = en
        ? 'High uncertainty: confidence ' + score + '% is below the ' +
          confidenceLowThreshold() + '% threshold. Interpret this result with caution.'
        : 'Ketidakpastian tinggi: tingkat keyakinan ' + score + '% berada di bawah ambang ' +
          confidenceLowThreshold() + '%. Tafsirkan hasil ini dengan hati-hati.';
      return { highUncertainty: true, message: message };
    }
  };

  return AquaXAI;
});
