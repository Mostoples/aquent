/* =====================================================
   AQUENT — AI_Consultant sadar-konteks & sadar-riwayat (AquaAI)
   Spec: advanced-features-upgrade — Requirement 3

   Modul perluasan AI Konsultan yang membuat jawaban Gemini lebih personal:
   sadar kondisi sensor real-time, tipe kulit Active_Profile, dan ringkasan
   riwayat sesi pengguna, sambil mempertahankan riwayat percakapan satu sesi.

   CAKUPAN (kontrak — lihat design.md §5 "AI_Consultant"):
     AquaAI.buildContext(state, sessionHistory)      → string konteks
       · snapshot 5 parameter sensor terkini             (R3.1)
       · tipe kulit Active_Profile                        (R3.1)
       · ringkasan riwayat sesi terbaru                   (R3.2)
     AquaAI.truncateContext(contextStr, maxTokens)   → string (≤ ambang token, R3.9)
     AquaAI.appendTurn(conversation, role, text)     → Message[] (urutan terjaga, R3.3)
     AquaAI.send(conversation, contextStr, lang, key)→ Promise<AIResponse>
       · preferensi bahasa pada permintaan                (R3.8)
       · timeout 30s via Promise.race (AI_TIMEOUT_MS)     (R3.6)
       · tahan pengiriman saat API key kosong + instruksi (R3.5)

   Konstanta numerik (AI_TIMEOUT_MS) diambil dari config.js (AquaConfig) bila
   tersedia; bila tidak, dipakai default terdokumentasi yang setara.

   Pola pemuatan mengikuti modul vanilla lain (config.js, xai.js): namespace
   global `AquaAI` + dukungan `module.exports` agar dapat diuji via Vitest.
   ===================================================== */

(function (root, factory) {
  'use strict';
  var AquaAI = factory(root);

  // Ekspos sebagai global (browser window / jsdom / worker → globalThis).
  if (root && !root.AquaAI) {
    root.AquaAI = AquaAI;
  }
  // Pastikan juga terlihat pada window bila berbeda dari root (jsdom).
  if (typeof window !== 'undefined' && !window.AquaAI) {
    window.AquaAI = (root && root.AquaAI) || AquaAI;
  }

  // Ekspos untuk lingkungan CommonJS (Vitest/Node) bila tersedia.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root && root.AquaAI ? root.AquaAI : AquaAI;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konstanta terdokumentasi
  // ---------------------------------------------------------------------------

  /**
   * Estimasi kasar jumlah karakter per token. Heuristik umum (~4 char/token)
   * yang dipakai untuk menjaga konteks di bawah ambang token tanpa memuat
   * tokenizer berat di sisi klien. Requirement 3.9
   * @type {number}
   */
  var CHARS_PER_TOKEN = 4;

  /**
   * Ambang token default untuk konteks bila pemanggil tidak menyuplai batas.
   * Konservatif agar konteks + percakapan tetap ringkas. Requirement 3.9
   * @type {number}
   */
  var DEFAULT_MAX_CONTEXT_TOKENS = 1200;

  /** Penanda pemangkasan yang ditambahkan saat konteks dipotong. */
  var TRUNCATION_MARKER = ' …';

  /** Jumlah maksimal sesi terbaru yang diringkas ke dalam konteks. */
  var SESSION_SUMMARY_MAX = 5;

  /** Jumlah maksimal giliran percakapan yang dikirim pada permintaan. */
  var CONVERSATION_MAX_TURNS = 12;

  /** Model Gemini & endpoint (selaras dengan callGemini() di app.js). */
  var GEMINI_MODEL = 'gemini-2.0-flash';
  var GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

  /** Kunci localStorage tempat pengguna menyimpan API key Gemini (app.js). */
  var GEMINI_KEY_STORAGE = 'aquent-gemini-key';

  /** Label tipe kulit (selaras dengan app.js). */
  var SKIN_LABELS = {
    normal: 'Normal',
    sensitive: 'Sensitif',
    oily: 'Berminyak',
    dry: 'Kering'
  };

  // ---------------------------------------------------------------------------
  // Utilitas
  // ---------------------------------------------------------------------------

  /** Apakah sebuah nilai numerik tersedia & berhingga (0 dianggap valid). */
  function isFiniteNum(value) {
    if (value === null || value === undefined || value === '') return false;
    var n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n);
  }

  /** Format nilai numerik untuk konteks; nilai hilang → 'tidak tersedia'. */
  function fmt(value) {
    return isFiniteNum(value) ? String(Number(value)) : 'tidak tersedia';
  }

  /**
   * Estimasi jumlah token sebuah string (heuristik ~CHARS_PER_TOKEN char/token).
   * Selalu mengembalikan bilangan bulat ≥ 0. Requirement 3.9
   * @param {string} str
   * @returns {number}
   */
  function estimateTokens(str) {
    var s = str == null ? '' : String(str);
    if (s.length === 0) return 0;
    return Math.ceil(s.length / CHARS_PER_TOKEN);
  }

  /**
   * Ambang AI_TIMEOUT_MS dari AquaConfig bila tersedia; jika tidak, default
   * 30000 ms (30 detik). Dibaca lazy agar berfungsi di browser maupun uji.
   * Requirement 3.6
   * @returns {number}
   */
  function aiTimeoutMs() {
    var cfg = (root && root.AquaConfig) || (typeof AquaConfig !== 'undefined' ? AquaConfig : null);
    if (cfg && typeof cfg.AI_TIMEOUT_MS === 'number' && cfg.AI_TIMEOUT_MS > 0) {
      return cfg.AI_TIMEOUT_MS;
    }
    return 30000;
  }

  /** Nama bahasa lengkap dari kode bahasa ('id' → Bahasa Indonesia). */
  function languageName(lang) {
    return String(lang).toLowerCase() === 'en' ? 'English' : 'Bahasa Indonesia';
  }

  /** Normalisasi kode bahasa ke 'id' | 'en' (default 'id'). */
  function normalizeLang(lang) {
    return String(lang || 'id').toLowerCase() === 'en' ? 'en' : 'id';
  }

  /**
   * Baca nilai sensor dari objek state. Mendukung alias `temp`/`temperature`.
   * @param {Object} sensor
   * @param {string} key
   * @returns {*}
   */
  function readSensor(sensor, key) {
    var s = sensor || {};
    if (key === 'temperature') {
      return s.temperature !== undefined ? s.temperature : s.temp;
    }
    return s[key];
  }

  /**
   * Tentukan tipe kulit Active_Profile dari state. Prioritas:
   *   1. state.activeProfile.skinType  (objek profil aktif bila disertakan)
   *   2. state.skinType                (cermin tipe kulit aktif di app.js)
   *   3. getActiveProfile()?.skinType  (fallback global di browser)
   *   4. 'normal'
   * Requirement 3.1
   * @param {Object} st
   * @returns {string}
   */
  function resolveSkinType(st) {
    var s = st || {};
    if (s.activeProfile && s.activeProfile.skinType) return String(s.activeProfile.skinType);
    if (s.skinType) return String(s.skinType);
    try {
      var getter = (root && root.getActiveProfile) ||
        (typeof getActiveProfile !== 'undefined' ? getActiveProfile : null);
      if (typeof getter === 'function') {
        var p = getter();
        if (p && p.skinType) return String(p.skinType);
      }
    } catch (_) {
      /* getActiveProfile tidak tersedia di lingkungan uji — abaikan */
    }
    return 'normal';
  }

  /** Label tipe kulit yang ramah-baca. */
  function skinLabel(skinType) {
    var key = String(skinType || 'normal').toLowerCase();
    return SKIN_LABELS[key] || skinType || 'Normal';
  }

  /** Format stempel waktu epoch ms → tanggal lokal ringkas (aman bila invalid). */
  function fmtDate(ts) {
    if (!isFiniteNum(ts)) return '—';
    try {
      var d = new Date(Number(ts));
      if (isNaN(d.getTime())) return '—';
      var dd = d.getDate();
      var mm = d.getMonth() + 1;
      var hh = String(d.getHours()).padStart(2, '0');
      var mi = String(d.getMinutes()).padStart(2, '0');
      return dd + '/' + mm + ' ' + hh + ':' + mi;
    } catch (_) {
      return '—';
    }
  }

  // ---------------------------------------------------------------------------
  // Bagian konteks
  // ---------------------------------------------------------------------------

  /**
   * Susun baris snapshot sensor terkini (5 parameter). Requirement 3.1
   * @param {Object} st
   * @returns {string}
   */
  function sensorSnapshot(st) {
    var sensor = (st && st.sensor) || {};
    var ph = readSensor(sensor, 'ph');
    var temp = readSensor(sensor, 'temperature');
    var turb = readSensor(sensor, 'turbidity');
    var tds = readSensor(sensor, 'tds');
    var chl = readSensor(sensor, 'chlorine');

    return 'Kondisi sensor air saat ini: ' +
      'pH=' + fmt(ph) + ' (aman 6.5–8.5), ' +
      'Suhu=' + fmt(temp) + '°C (optimal 36–38°C), ' +
      'Kekeruhan=' + fmt(turb) + ' NTU (aman ≤1.0 NTU), ' +
      'TDS=' + fmt(tds) + ' ppm, ' +
      'Klorin=' + fmt(chl) + ' mg/L.';
  }

  /**
   * Susun ringkasan riwayat sesi terbaru: jumlah sesi, rata-rata skor kualitas,
   * dan daftar singkat sesi terbaru. Requirement 3.2
   * @param {Array<Object>} sessionHistory
   * @returns {string}
   */
  function sessionSummary(sessionHistory) {
    var arr = Array.isArray(sessionHistory) ? sessionHistory.filter(Boolean) : [];
    if (arr.length === 0) {
      return 'Ringkasan riwayat sesi: belum ada sesi mandi tercatat.';
    }

    // Urut menaik berdasarkan ts agar "terbaru" konsisten.
    var sorted = arr.slice().sort(function (a, b) {
      return (Number(a.ts) || 0) - (Number(b.ts) || 0);
    });

    var scores = arr
      .map(function (s) { return Number(s.quality_score); })
      .filter(function (n) { return Number.isFinite(n); });
    var avgScore = scores.length
      ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length)
      : null;

    var recent = sorted.slice(-SESSION_SUMMARY_MAX);
    var lines = recent.map(function (s) {
      var parts = [];
      parts.push(fmtDate(s.ts));
      if (Number.isFinite(Number(s.quality_score))) {
        parts.push('skor ' + Math.round(Number(s.quality_score)) + '/100');
      }
      if (isFiniteNum(s.ph)) parts.push('pH ' + Number(s.ph));
      if (isFiniteNum(s.temperature)) parts.push(Number(s.temperature) + '°C');
      return '• ' + parts.join(', ');
    });

    var header = 'Ringkasan riwayat sesi: ' + arr.length + ' sesi tercatat' +
      (avgScore !== null ? ', rata-rata skor kualitas ' + avgScore + '/100' : '') +
      '. ' + recent.length + ' sesi terbaru:';

    return header + '\n' + lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Pembangunan permintaan
  // ---------------------------------------------------------------------------

  /**
   * Render giliran percakapan menjadi transkrip teks (urutan terjaga).
   * @param {Array<Object>} conversation
   * @returns {string}
   */
  function renderConversation(conversation) {
    var arr = Array.isArray(conversation) ? conversation.filter(Boolean) : [];
    if (arr.length === 0) return '(belum ada percakapan)';
    var recent = arr.slice(-CONVERSATION_MAX_TURNS);
    return recent
      .map(function (m) {
        var role = m && m.role === 'user' ? 'User' : 'AI';
        var text = m && m.text != null ? String(m.text) : '';
        return role + ': ' + text;
      })
      .join('\n');
  }

  /**
   * Bangun prompt lengkap yang dikirim ke Gemini. Menyertakan preferensi bahasa
   * (R3.8), disclaimer non-medis, konteks (sensor + kulit + riwayat), dan
   * transkrip percakapan (R3.3).
   * @param {Array<Object>} conversation
   * @param {string} contextStr
   * @param {'id'|'en'} lang
   * @returns {string}
   */
  function buildPrompt(conversation, contextStr, lang) {
    var code = normalizeLang(lang);
    var name = languageName(code);

    var langDirective = code === 'en'
      ? 'Respond primarily in English (language preference: en). You may answer in another language only if the question context clearly requires it.'
      : 'Jawab terutama dalam Bahasa Indonesia (preferensi bahasa: id). Kamu boleh menjawab dalam bahasa lain hanya bila konteks pertanyaan jelas menuntut demikian.';

    var persona = code === 'en'
      ? 'You are AQUENT AI, a friendly skin & water health consultant. Always provide Explainable AI (XAI): cite the specific water parameter values you base recommendations on, and state a confidence level.'
      : 'Kamu adalah AQUENT AI, asisten kesehatan kulit dan air yang ramah. Selalu sertakan XAI (Explainable AI): sebutkan parameter air spesifik beserta nilainya yang menjadi dasar rekomendasi, dan nyatakan tingkat kepercayaan.';

    var disclaimer = code === 'en'
      ? 'IMPORTANT: You are not a doctor. This is not professional medical advice; recommend consulting a professional for serious skin issues.'
      : 'PENTING: Kamu bukan dokter. Ini bukan nasihat medis profesional; sarankan konsultasi tenaga kesehatan untuk masalah kulit serius.';

    return [
      persona,
      langDirective,
      disclaimer,
      '',
      'Preferensi bahasa / Language preference: ' + name + ' (' + code + ').',
      '',
      'KONTEKS:',
      String(contextStr == null ? '' : contextStr),
      '',
      'Riwayat percakapan:',
      renderConversation(conversation)
    ].join('\n');
  }

  /**
   * Selesaikan API key efektif: parameter diutamakan, fallback ke localStorage
   * (`aquent-gemini-key`, pola app.js). String kosong → dianggap belum diatur.
   * @param {string} [apiKey]
   * @returns {string}
   */
  function resolveApiKey(apiKey) {
    if (typeof apiKey === 'string' && apiKey.trim() !== '') {
      return apiKey.trim();
    }
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var stored = localStorage.getItem(GEMINI_KEY_STORAGE);
        if (stored && String(stored).trim() !== '') return String(stored).trim();
      }
    } catch (_) {
      /* localStorage tidak tersedia — abaikan */
    }
    return '';
  }

  /** Pesan instruksi konfigurasi API key (ditampilkan saat key kosong). R3.5 */
  function missingKeyMessage(lang) {
    return normalizeLang(lang) === 'en'
      ? 'Gemini API key is not configured. Open Settings and add your Gemini API key to enable the AI Consultant.'
      : 'Kunci API Gemini belum dikonfigurasi. Buka Pengaturan dan tambahkan kunci API Gemini Anda untuk mengaktifkan AI Konsultan.';
  }

  /** Pesan kesalahan saat permintaan gagal/timeout (R3.6). */
  function failureMessage(lang, kind) {
    var en = normalizeLang(lang) === 'en';
    if (kind === 'timeout') {
      return en
        ? 'The AI request timed out after 30 seconds. Please check your connection and try again.'
        : 'Permintaan AI melebihi batas 30 detik. Periksa koneksi Anda dan coba lagi.';
    }
    return en
      ? 'The AI request failed. Please verify your API key and network connection, then try again.'
      : 'Permintaan AI gagal. Periksa kunci API dan koneksi jaringan Anda, lalu coba lagi.';
  }

  // ---------------------------------------------------------------------------
  // Namespace publik
  // ---------------------------------------------------------------------------

  var AquaAI = {
    /** Konstanta yang berguna untuk pemanggil/pengujian (read-only). */
    CHARS_PER_TOKEN: CHARS_PER_TOKEN,
    DEFAULT_MAX_CONTEXT_TOKENS: DEFAULT_MAX_CONTEXT_TOKENS,

    /** Estimasi token sebuah string (heuristik). */
    estimateTokens: estimateTokens,

    /**
     * Rakit konteks AI: snapshot 5 parameter sensor terkini + tipe kulit
     * Active_Profile + ringkasan riwayat sesi terbaru.
     * Requirements 3.1, 3.2
     *
     * @param {Object} state            State aplikasi ({ sensor, skinType, activeProfile? }).
     * @param {Array<Object>} sessionHistory  Riwayat sesi (aquent-sessions).
     * @returns {string} String konteks siap-pakai untuk permintaan AI.
     */
    buildContext: function buildContext(state, sessionHistory) {
      var st = state || (root && root.state) || {};
      var type = resolveSkinType(st);

      var parts = [
        sensorSnapshot(st),
        'Tipe kulit pengguna (Active_Profile): ' + skinLabel(type) + '.',
        sessionSummary(sessionHistory)
      ];

      return parts.join('\n');
    },

    /**
     * Pangkas konteks agar estimasi tokennya tidak melebihi `maxTokens`.
     * Bila sudah di bawah ambang, dikembalikan apa adanya. Bila melebihi,
     * dipotong pada batas karakter yang sesuai dan diberi penanda pemangkasan,
     * dengan jaminan estimasi token hasil ≤ `maxTokens`.
     * Requirement 3.9
     *
     * @param {string} contextStr
     * @param {number} [maxTokens]  Default DEFAULT_MAX_CONTEXT_TOKENS.
     * @returns {string}
     */
    truncateContext: function truncateContext(contextStr, maxTokens) {
      var s = contextStr == null ? '' : String(contextStr);
      var max = (Number.isFinite(maxTokens) && maxTokens > 0)
        ? Math.floor(maxTokens)
        : DEFAULT_MAX_CONTEXT_TOKENS;

      if (estimateTokens(s) <= max) return s;

      var charBudget = max * CHARS_PER_TOKEN;

      // Budget terlalu kecil bahkan untuk penanda → potong keras pada budget.
      if (charBudget <= TRUNCATION_MARKER.length) {
        return s.slice(0, charBudget);
      }

      var sliceLen = charBudget - TRUNCATION_MARKER.length;
      var head = s.slice(0, sliceLen);

      // Rapikan ke batas spasi terdekat bila tidak memotong terlalu banyak.
      var lastSpace = head.lastIndexOf(' ');
      if (lastSpace > sliceLen * 0.5) {
        head = head.slice(0, lastSpace);
      }

      var result = head + TRUNCATION_MARKER;

      // Jaring pengaman: pastikan estimasi token hasil ≤ ambang.
      if (estimateTokens(result) > max) {
        result = result.slice(0, charBudget);
      }
      return result;
    },

    /**
     * Tambahkan satu giliran ke riwayat percakapan, mempertahankan urutan.
     * Mengembalikan array BARU (tidak memutasi masukan) agar aman dipakai pada
     * state imutabel. Requirement 3.3
     *
     * @param {Array<Object>} conversation  Riwayat percakapan saat ini.
     * @param {string} role                 'user' | 'ai' (lainnya → 'user').
     * @param {string} text                 Isi pesan.
     * @returns {Array<Object>} Riwayat baru dengan giliran terbaru di akhir.
     */
    appendTurn: function appendTurn(conversation, role, text) {
      var base = Array.isArray(conversation) ? conversation.slice() : [];
      var normalizedRole = role === 'ai' || role === 'assistant' || role === 'model'
        ? 'ai'
        : 'user';
      base.push({
        role: normalizedRole,
        text: text == null ? '' : String(text),
        ts: Date.now()
      });
      return base;
    },

    /**
     * Kirim permintaan ke Gemini dengan preferensi bahasa + timeout 30 detik
     * (via Promise.race terhadap AI_TIMEOUT_MS). Bila API key kosong, pengiriman
     * DITAHAN dan dikembalikan respons "held" berisi instruksi konfigurasi
     * (tanpa memanggil jaringan).
     * Requirements 3.5, 3.6, 3.8
     *
     * @param {Array<Object>} conversation  Riwayat percakapan satu sesi.
     * @param {string} contextStr           Konteks (hasil buildContext/truncateContext).
     * @param {'id'|'en'} [lang='id']        Preferensi bahasa.
     * @param {string} [apiKey]             API key; fallback ke localStorage.
     * @returns {Promise<Object>} AIResponse terstruktur.
     */
    send: function send(conversation, contextStr, lang, apiKey) {
      var code = normalizeLang(lang);
      var key = resolveApiKey(apiKey);

      // R3.5 — API key kosong: tahan pengiriman, kembalikan instruksi.
      if (!key) {
        var msg = missingKeyMessage(code);
        return Promise.resolve({
          ok: false,
          status: 'held',
          held: true,
          sent: false,
          reason: 'missing_api_key',
          lang: code,
          message: msg,
          text: msg
        });
      }

      var prompt = buildPrompt(conversation, contextStr, code);
      var url = GEMINI_ENDPOINT + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
      var body = {
        contents: [{ parts: [{ text: prompt }] }]
      };

      // R3.6 — timeout 30s via Promise.race terhadap fetch.
      var timeoutMs = aiTimeoutMs();
      var timer = null;
      var timeoutPromise = new Promise(function (resolve) {
        timer = setTimeout(function () {
          resolve({ __timeout: true });
        }, timeoutMs);
      });

      var fetchFn = (root && root.fetch) || (typeof fetch !== 'undefined' ? fetch : null);

      var requestPromise;
      if (typeof fetchFn !== 'function') {
        requestPromise = Promise.resolve({ __error: new Error('fetch unavailable') });
      } else {
        requestPromise = fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (res) {
          if (!res || !res.ok) {
            var status = res ? res.status : 0;
            return { __error: new Error('HTTP ' + status) };
          }
          return res.json().then(function (json) {
            return { __json: json };
          });
        }).catch(function (e) {
          return { __error: e };
        });
      }

      return Promise.race([requestPromise, timeoutPromise]).then(function (outcome) {
        if (timer) clearTimeout(timer);

        // Timeout menang balapan (R3.6).
        if (outcome && outcome.__timeout) {
          return {
            ok: false,
            status: 'timeout',
            sent: true,
            lang: code,
            message: failureMessage(code, 'timeout')
          };
        }

        // Kesalahan jaringan/HTTP (R3.6).
        if (outcome && outcome.__error) {
          return {
            ok: false,
            status: 'error',
            sent: true,
            lang: code,
            message: failureMessage(code, 'error'),
            error: outcome.__error && outcome.__error.message
          };
        }

        // Sukses: ekstrak teks balasan dari struktur respons Gemini.
        var json = outcome && outcome.__json;
        var reply = null;
        try {
          reply = json &&
            json.candidates &&
            json.candidates[0] &&
            json.candidates[0].content &&
            json.candidates[0].content.parts &&
            json.candidates[0].content.parts[0] &&
            json.candidates[0].content.parts[0].text;
        } catch (_) {
          reply = null;
        }

        if (!reply) {
          return {
            ok: false,
            status: 'error',
            sent: true,
            lang: code,
            message: failureMessage(code, 'error'),
            raw: json
          };
        }

        return {
          ok: true,
          status: 'ok',
          sent: true,
          lang: code,
          text: reply,
          raw: json
        };
      });
    }
  };

  return AquaAI;
});
