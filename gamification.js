/* =====================================================
   AQUENT — Gamification_Engine (AquaGamify)
   Spec: advanced-features-upgrade — Requirement 6 (Gamifikasi Lanjutan)

   Mengelola streak harian, tonggak (milestone) streak, tantangan terukur,
   pemetaan level dari total poin, dan papan peringkat (leaderboard) opt-in.

   Kontrak (lihat design.md §7):
     AquaGamify.computeStreak(sessions, now)            => number
     AquaGamify.milestoneReached(prevStreak, newStreak, profileId) => number|null
     AquaGamify.evaluateChallenge(challenge, sessions)  => { complete, progress, target, points, id }
     AquaGamify.levelForPoints(points, thresholds)      => { level, name, threshold }
     AquaGamify.buildLeaderboard(entries)               => LeaderboardRow[]

   Helper penyimpanan/penerapan (penyimpanan `aquent-gamify-{profileId}`):
     AquaGamify.getState(profileId)                     => GamifyState
     AquaGamify.saveState(state, profileId)             => GamifyState
     AquaGamify.applyChallenge(challengeId, sessions, profileId) => { ...result, awarded, pointsAdded }

   Model penyimpanan (design.md §Data Models):
     aquent-gamify-{profileId} = {
       points, streak, lastSessionDay,
       challenges: { '<id>': { progress, complete } },
       optInLeaderboard, displayName
     }

   Sumber konstanta (single-source dari config.js / AquaConfig):
     - STREAK_MILESTONES = [7,14,21,30,60,100]   (R6.3)
     - LEVEL_THRESHOLDS  = [0,100,300,500]        (R6.7)

   Notifikasi tonggak dicatat ke Notification_Center via AquaNotif.add()
   (kategori 'gamification') ketika sebuah tonggak streak terlewati (R6.3).

   Pola pemuatan mengikuti modul vanilla lain (config.js / xai.js /
   eco-analytics.js): namespace global `AquaGamify` + dukungan module.exports
   agar dapat diuji via Vitest + jsdom.
   ===================================================== */

(function (root, factory) {
  'use strict';
  var AquaGamify = factory(root);

  // Ekspos sebagai global (browser window / jsdom / worker → globalThis).
  if (root && !root.AquaGamify) {
    root.AquaGamify = AquaGamify;
  }

  // Ekspos untuk lingkungan CommonJS (Vitest/Node) bila tersedia.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root && root.AquaGamify ? root.AquaGamify : AquaGamify;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konstanta & utilitas
  // ---------------------------------------------------------------------------

  /** Milidetik dalam satu hari kalender (24 jam). */
  var DAY_MS = 24 * 60 * 60 * 1000;

  /** Prefix kunci localStorage per profil (R6 — penyimpanan per profil). */
  var STORAGE_PREFIX = 'aquent-gamify-';

  /** Tonggak streak cadangan bila AquaConfig belum dimuat. Requirement 6.3 */
  var FALLBACK_MILESTONES = [7, 14, 21, 30, 60, 100];

  /** Ambang level cadangan bila AquaConfig belum dimuat. Requirement 6.7 */
  var FALLBACK_LEVEL_THRESHOLDS = [0, 100, 300, 500];

  /** Nama level berurutan (selaras LEVEL_THRESHOLDS). Requirement 6.7 */
  var LEVEL_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum'];

  /** Skor minimum yang dianggap Grade A (selaras calcQualityScore di app.js). */
  var GRADE_A_MIN = 90;

  /** Konversi ke angka berhingga; nilai non-finite → fallback. */
  function num(value, fallback) {
    var n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Apakah sebuah nilai dapat dikonversi menjadi angka berhingga. */
  function isFiniteNum(value) {
    if (value === null || value === undefined || value === '') return false;
    var n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n);
  }

  /**
   * Ambil AquaConfig dari root/global bila tersedia (dibaca lazy agar bekerja
   * di browser maupun pengujian, mengikuti pola xai.js / eco-analytics.js).
   * @returns {Object|null}
   */
  function cfg() {
    return (root && root.AquaConfig) || (typeof AquaConfig !== 'undefined' ? AquaConfig : null);
  }

  /** Tonggak streak terkonfigurasi (AquaConfig.STREAK_MILESTONES) atau cadangan. */
  function streakMilestones() {
    var c = cfg();
    if (c && Array.isArray(c.STREAK_MILESTONES) && c.STREAK_MILESTONES.length) {
      return c.STREAK_MILESTONES.slice();
    }
    return FALLBACK_MILESTONES.slice();
  }

  /** Ambang level terkonfigurasi (AquaConfig.LEVEL_THRESHOLDS) atau cadangan. */
  function levelThresholds() {
    var c = cfg();
    if (c && Array.isArray(c.LEVEL_THRESHOLDS) && c.LEVEL_THRESHOLDS.length) {
      return c.LEVEL_THRESHOLDS.slice();
    }
    return FALLBACK_LEVEL_THRESHOLDS.slice();
  }

  /** Referensi AquaNotif (Notification Center) bila tersedia. */
  function notif() {
    return (root && root.AquaNotif) || (typeof AquaNotif !== 'undefined' ? AquaNotif : null);
  }

  /**
   * Indeks hari kalender (lokal) dari sebuah stempel waktu epoch ms. Dua
   * stempel waktu pada hari kalender yang sama menghasilkan indeks identik,
   * sehingga perbandingan "hari berurutan" menjadi selisih bilangan bulat.
   * @param {number} ts
   * @returns {number}
   */
  function dayIndex(ts) {
    var d = new Date(ts);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  }

  /**
   * Selesaikan profileId efektif (mengikuti pola notifications.js / app.js):
   * null/undefined → coba getActiveProfile(), jatuh ke 'default'. Nilai lain
   * dipertahankan apa adanya agar isolasi antar profil deterministik.
   * @param {string} [profileId]
   * @returns {string}
   */
  function resolveProfileId(profileId) {
    if (profileId === null || profileId === undefined) {
      try {
        if (typeof getActiveProfile === 'function') {
          var p = getActiveProfile();
          if (p && p.id) return String(p.id);
        }
      } catch (_) {
        /* getActiveProfile tidak tersedia (mis. lingkungan uji) — abaikan */
      }
      return 'default';
    }
    return String(profileId);
  }

  /** Bangun kunci localStorage untuk sebuah profil. */
  function storageKey(profileId) {
    return STORAGE_PREFIX + resolveProfileId(profileId);
  }

  /**
   * Skor kualitas sebuah sesi. Membaca `quality_score` (kanonik di model
   * `aquent-sessions`), dengan cadangan `qualityScore`/`score`.
   * @param {Object} session
   * @returns {number|null}
   */
  function sessionScore(session) {
    if (!session || typeof session !== 'object') return null;
    if (isFiniteNum(session.quality_score)) return Number(session.quality_score);
    if (isFiniteNum(session.qualityScore)) return Number(session.qualityScore);
    if (isFiniteNum(session.score)) return Number(session.score);
    return null;
  }

  /** True bila sesi tergolong Grade A (grade==='A' atau skor ≥ GRADE_A_MIN). */
  function isGradeA(session) {
    if (session && typeof session.grade === 'string') {
      return session.grade.toUpperCase() === 'A';
    }
    var s = sessionScore(session);
    return s !== null && s >= GRADE_A_MIN;
  }

  /** Turbidity (NTU) sebuah sesi atau null bila tak tersedia. */
  function sessionTurbidity(session) {
    if (!session || typeof session !== 'object') return null;
    if (isFiniteNum(session.turbidity)) return Number(session.turbidity);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Katalog tantangan terukur (≥ 3) — Requirement 6.4
  // ---------------------------------------------------------------------------

  /**
   * Definisi tantangan terstruktur dengan kriteria penyelesaian TERUKUR.
   * Setiap entri: { id, type, target, windowDays?, threshold?, points, title }.
   *   - type 'grade_a_count'      : jumlah sesi Grade A dalam jendela windowDays
   *   - type 'session_count'      : jumlah total sesi tercatat
   *   - type 'streak'             : nilai streak harian saat ini
   *   - type 'low_turbidity_count': jumlah sesi dengan turbidity ≤ threshold
   * @type {Array<Object>}
   */
  var CHALLENGES = [
    {
      id: 'grade-a-5in7',
      type: 'grade_a_count',
      target: 5,
      windowDays: 7,
      points: 100,
      title: '5 sesi Grade A dalam 7 hari'
    },
    {
      id: 'streak-7',
      type: 'streak',
      target: 7,
      points: 70,
      title: 'Pertahankan streak 7 hari'
    },
    {
      id: 'sessions-10',
      type: 'session_count',
      target: 10,
      points: 50,
      title: 'Catat 10 sesi mandi'
    },
    {
      id: 'clear-water-3',
      type: 'low_turbidity_count',
      target: 3,
      threshold: 0.5,
      points: 40,
      title: '3 sesi dengan air jernih (≤ 0.5 NTU)'
    }
  ];

  /** Peta id → definisi tantangan, untuk resolusi cepat. */
  var CHALLENGE_BY_ID = (function () {
    var map = {};
    for (var i = 0; i < CHALLENGES.length; i++) map[CHALLENGES[i].id] = CHALLENGES[i];
    return map;
  })();

  /**
   * Selesaikan deskriptor tantangan menjadi definisi lengkap. Menerima:
   *   - string id → ambil dari katalog
   *   - object {id,...} → gabungkan dengan default katalog (field eksplisit menang)
   * Mengembalikan null bila tak dapat diselesaikan.
   * @param {string|Object} challenge
   * @returns {Object|null}
   */
  function resolveChallenge(challenge) {
    if (typeof challenge === 'string') {
      return CHALLENGE_BY_ID[challenge] || null;
    }
    if (challenge && typeof challenge === 'object') {
      var base = challenge.id && CHALLENGE_BY_ID[challenge.id] ? CHALLENGE_BY_ID[challenge.id] : {};
      var merged = {
        id: challenge.id != null ? challenge.id : base.id,
        type: challenge.type != null ? challenge.type : base.type,
        target: isFiniteNum(challenge.target) ? Number(challenge.target) : base.target,
        windowDays: isFiniteNum(challenge.windowDays) ? Number(challenge.windowDays) : base.windowDays,
        threshold: isFiniteNum(challenge.threshold) ? Number(challenge.threshold) : base.threshold,
        points: isFiniteNum(challenge.points) ? Number(challenge.points) : base.points,
        title: challenge.title != null ? challenge.title : base.title
      };
      return merged.type ? merged : null;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Penyimpanan keadaan gamifikasi per profil
  // ---------------------------------------------------------------------------

  /** Bentuk keadaan default (struktur stabil). */
  function defaultState() {
    return {
      points: 0,
      streak: 0,
      lastSessionDay: null,
      challenges: {},
      optInLeaderboard: false,
      displayName: ''
    };
  }

  /**
   * Baca keadaan gamifikasi profil dari localStorage. Anggun terhadap data
   * hilang/rusak (mengikuti pola getSessionHistory di app.js): selalu
   * kembalikan objek keadaan dengan field terdefinisi.
   * @param {string} [profileId]
   * @returns {Object} GamifyState
   */
  function readState(profileId) {
    var base = defaultState();
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return base;
      var raw = localStorage.getItem(storageKey(profileId));
      if (!raw) return base;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
      return {
        points: isFiniteNum(parsed.points) ? Number(parsed.points) : 0,
        streak: isFiniteNum(parsed.streak) ? Number(parsed.streak) : 0,
        lastSessionDay: parsed.lastSessionDay != null ? parsed.lastSessionDay : null,
        challenges: parsed.challenges && typeof parsed.challenges === 'object' && !Array.isArray(parsed.challenges)
          ? parsed.challenges
          : {},
        optInLeaderboard: parsed.optInLeaderboard === true,
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : ''
      };
    } catch (_) {
      return base;
    }
  }

  /**
   * Tulis keadaan gamifikasi profil (best-effort, anggun bila gagal).
   * @param {Object} state
   * @param {string} [profileId]
   */
  function writeState(state, profileId) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(storageKey(profileId), JSON.stringify(state));
    } catch (_) {
      /* kuota penuh / storage tidak tersedia — abaikan secara anggun */
    }
  }

  // ---------------------------------------------------------------------------
  // Namespace publik
  // ---------------------------------------------------------------------------

  var AquaGamify = {
    /** Prefix kunci penyimpanan (referensi read-only). */
    STORAGE_PREFIX: STORAGE_PREFIX,

    /** Katalog tantangan (salinan dangkal, referensi). Requirement 6.4 */
    CHALLENGES: CHALLENGES.map(function (c) { return Object.assign({}, c); }),

    /** Nama-nama level berurutan (referensi). Requirement 6.7 */
    LEVEL_NAMES: LEVEL_NAMES.slice(),

    /**
     * Hitung streak harian dari daftar sesi berdasarkan HARI KALENDER.
     *
     * Definisi: streak adalah panjang rangkaian hari kalender berurutan yang
     * berakhir pada aktivitas terkini, dengan ketentuan:
     *   - Hari-hari sesi diturunkan dari `ts` tiap sesi (zona waktu lokal).
     *   - Jika hari sesi terbaru lebih dari satu hari sebelum hari `now`
     *     (artinya ada satu hari kalender penuh terlewat), streak = 0. (R6.2)
     *   - Selain itu, hitung mundur dari hari sesi terbaru selama hari-hari
     *     berurutan tanpa jeda; berhenti pada jeda pertama (tidak melanjutkan
     *     hitungan dari sebelum jeda). (R6.1, R6.2)
     *
     * Beberapa sesi pada hari yang sama hanya dihitung satu kali. Sesi tanpa
     * `ts` berhingga, dan sesi bertanggal di masa depan relatif `now`,
     * diabaikan.
     *
     * @param {Array<Object>} sessions  Daftar sesi (model `aquent-sessions`).
     * @param {number} [now=Date.now()] Waktu acuan (epoch ms).
     * @returns {number} Nilai streak harian (≥ 0).
     */
    computeStreak: function computeStreak(sessions, now) {
      var list = Array.isArray(sessions) ? sessions : [];
      var ref = isFiniteNum(now) ? Number(now) : Date.now();
      var todayIdx = dayIndex(ref);

      // Kumpulkan hari-hari unik (≤ hari ini) dari sesi dengan ts berhingga.
      var daySet = {};
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (!s || !isFiniteNum(s.ts)) continue;
        var di = dayIndex(Number(s.ts));
        if (di > todayIdx) continue; // abaikan sesi masa depan
        daySet[di] = true;
      }

      var days = Object.keys(daySet).map(Number);
      if (days.length === 0) return 0;

      days.sort(function (a, b) { return b - a; }); // menurun (terbaru dulu)

      var mostRecent = days[0];
      // Satu hari kalender penuh terlewat menjelang kini → streak putus. (R6.2)
      if (todayIdx - mostRecent > 1) return 0;

      // Hitung mundur rangkaian hari berurutan dari hari terbaru. (R6.1)
      var streak = 1;
      for (var j = 1; j < days.length; j++) {
        if (days[j] === days[j - 1] - 1) {
          streak++;
        } else {
          break; // jeda ditemukan: jangan lanjutkan dari sebelum jeda
        }
      }
      return streak;
    },

    /**
     * Tentukan tonggak streak yang baru terlewati pada transisi
     * prevStreak → newStreak, lalu (bila ada) catat notifikasi penghargaan ke
     * Notification_Center. (R6.3)
     *
     * Mengembalikan tonggak m ∈ STREAK_MILESTONES dengan
     * `prevStreak < m <= newStreak`; bila beberapa tonggak terlewati sekaligus,
     * dikembalikan yang TERBESAR (tonggak paling jauh yang dicapai). Bila tidak
     * ada tonggak terlewati, mengembalikan null dan tidak mencatat notifikasi.
     *
     * Saat sebuah tonggak terdeteksi dan AquaNotif tersedia, sebuah notifikasi
     * kategori 'gamification' dicatat ke profil terkait.
     *
     * @param {number} prevStreak  Nilai streak sebelumnya.
     * @param {number} newStreak   Nilai streak baru.
     * @param {string} [profileId] Profil tujuan pencatatan notifikasi.
     * @returns {number|null} Tonggak yang dicapai, atau null.
     */
    milestoneReached: function milestoneReached(prevStreak, newStreak, profileId) {
      var prev = num(prevStreak, 0);
      var next = num(newStreak, 0);
      if (next <= prev) return null;

      var milestones = streakMilestones();
      var reached = null;
      for (var i = 0; i < milestones.length; i++) {
        var m = milestones[i];
        if (prev < m && m <= next) {
          if (reached === null || m > reached) reached = m;
        }
      }
      if (reached === null) return null;

      // Catat notifikasi penghargaan tonggak ke Notification_Center (R6.3).
      var nc = notif();
      if (nc && typeof nc.add === 'function') {
        try {
          nc.add(
            {
              category: 'gamification',
              title: '🔥 Streak ' + reached + ' Hari!',
              body:
                'Selamat! Kamu mencapai streak ' + reached +
                ' hari berturut-turut. Teruskan kebiasaan mandi sehatmu!'
            },
            resolveProfileId(profileId)
          );
        } catch (_) {
          /* pencatatan notifikasi best-effort — jangan gagalkan deteksi */
        }
      }
      return reached;
    },

    /**
     * Evaluasi kriteria sebuah tantangan terhadap daftar sesi. Fungsi MURNI
     * (tanpa efek samping/penyimpanan).
     *
     * @param {string|Object} challenge  Id tantangan atau deskriptor objek.
     * @param {Array<Object>} sessions   Daftar sesi.
     * @returns {{complete:boolean, progress:number, target:number, points:number, id:(string|undefined)}}
     */
    evaluateChallenge: function evaluateChallenge(challenge, sessions) {
      var def = resolveChallenge(challenge);
      var list = Array.isArray(sessions) ? sessions : [];

      if (!def) {
        return { complete: false, progress: 0, target: 0, points: 0, id: undefined };
      }

      var target = isFiniteNum(def.target) ? Number(def.target) : 0;
      var points = isFiniteNum(def.points) ? Number(def.points) : 0;
      var progress = 0;

      switch (def.type) {
        case 'grade_a_count': {
          // Jumlah sesi Grade A dalam jendela windowDays terakhir (relatif
          // sesi terbaru bila ada jendela; tanpa jendela → seluruh riwayat).
          var windowDays = isFiniteNum(def.windowDays) ? Number(def.windowDays) : null;
          var refTs = null;
          if (windowDays !== null) {
            for (var a = 0; a < list.length; a++) {
              if (list[a] && isFiniteNum(list[a].ts)) {
                var t = Number(list[a].ts);
                if (refTs === null || t > refTs) refTs = t;
              }
            }
          }
          for (var b = 0; b < list.length; b++) {
            var s1 = list[b];
            if (!isGradeA(s1)) continue;
            if (windowDays !== null) {
              if (!s1 || !isFiniteNum(s1.ts)) continue;
              if (refTs - Number(s1.ts) > windowDays * DAY_MS) continue;
            }
            progress++;
          }
          break;
        }
        case 'session_count': {
          progress = list.length;
          break;
        }
        case 'streak': {
          // Streak relatif aktivitas terbaru (sesi terbaru sebagai acuan).
          var latest = null;
          for (var c = 0; c < list.length; c++) {
            if (list[c] && isFiniteNum(list[c].ts)) {
              var tc = Number(list[c].ts);
              if (latest === null || tc > latest) latest = tc;
            }
          }
          progress = AquaGamify.computeStreak(list, latest === null ? Date.now() : latest);
          break;
        }
        case 'low_turbidity_count': {
          var thr = isFiniteNum(def.threshold) ? Number(def.threshold) : 0.5;
          for (var d = 0; d < list.length; d++) {
            var turb = sessionTurbidity(list[d]);
            if (turb !== null && turb <= thr) progress++;
          }
          break;
        }
        default:
          progress = 0;
      }

      return {
        complete: target > 0 ? progress >= target : false,
        progress: progress,
        target: target,
        points: points,
        id: def.id
      };
    },

    /**
     * Terapkan hasil evaluasi tantangan ke keadaan tersimpan profil. Menjamin
     * poin tantangan ditambahkan TEPAT SEKALI: bila tantangan sudah ditandai
     * selesai sebelumnya, pemanggilan ulang tidak menambah poin lagi. (R6.5, R6.6)
     *
     * @param {string|Object} challenge  Id tantangan atau deskriptor objek.
     * @param {Array<Object>} sessions   Daftar sesi.
     * @param {string} [profileId]
     * @returns {{id, complete, progress, target, awarded:boolean, pointsAdded:number, totalPoints:number}}
     */
    applyChallenge: function applyChallenge(challenge, sessions, profileId) {
      var res = AquaGamify.evaluateChallenge(challenge, sessions);
      var state = readState(profileId);
      var id = res.id;

      if (!id) {
        return {
          id: undefined,
          complete: res.complete,
          progress: res.progress,
          target: res.target,
          awarded: false,
          pointsAdded: 0,
          totalPoints: state.points
        };
      }

      var prev = state.challenges[id] && typeof state.challenges[id] === 'object'
        ? state.challenges[id]
        : { progress: 0, complete: false };

      var awarded = false;
      var pointsAdded = 0;

      if (res.complete && prev.complete !== true) {
        // Selesai untuk pertama kali → tambahkan poin (tepat sekali). (R6.5)
        state.points = num(state.points, 0) + res.points;
        pointsAdded = res.points;
        awarded = true;
      }
      // Kriteria belum terpenuhi → tahan penandaan selesai & poin. (R6.6)

      state.challenges[id] = {
        progress: res.progress,
        complete: res.complete === true || prev.complete === true
      };
      writeState(state, profileId);

      return {
        id: id,
        complete: state.challenges[id].complete,
        progress: res.progress,
        target: res.target,
        awarded: awarded,
        pointsAdded: pointsAdded,
        totalPoints: state.points
      };
    },

    /**
     * Petakan total poin → level memakai ambang terdefinisi (monoton).
     * Mengembalikan level dengan ambang TERTINGGI yang tidak melebihi poin.
     * Pemetaan bersifat non-menurun terhadap kenaikan poin. (R6.7)
     *
     * Penomoran level 1-based (level 1 = ambang terendah). Poin di bawah ambang
     * terendah dijepit ke level 1.
     *
     * @param {number} points        Total poin.
     * @param {number[]} [thresholds] Ambang menaik; default AquaConfig.LEVEL_THRESHOLDS.
     * @returns {{level:number, name:string, threshold:number}}
     */
    levelForPoints: function levelForPoints(points, thresholds) {
      var src = Array.isArray(thresholds) && thresholds.length ? thresholds.slice() : levelThresholds();
      // Pastikan menaik agar pemetaan monoton, lalu saring nilai non-finite.
      src = src.filter(isFiniteNum).map(Number).sort(function (a, b) { return a - b; });
      if (src.length === 0) src = FALLBACK_LEVEL_THRESHOLDS.slice();

      var p = num(points, 0);
      var idx = 0; // jepit ke level terendah bila poin di bawah ambang terendah
      for (var i = 0; i < src.length; i++) {
        if (src[i] <= p) idx = i;
        else break;
      }
      return {
        level: idx + 1,
        name: LEVEL_NAMES[idx] || ('Level ' + (idx + 1)),
        threshold: src[idx]
      };
    },

    /**
     * Bangun papan peringkat HANYA dari peserta opt-in, menggunakan nama
     * tampilan dan TANPA mengekspos alamat email. (R6.8, R6.9, R6.10)
     *
     * Input `entries`: array objek pengguna, mis.
     *   { uid?, displayName?, email?, points, level?, optInLeaderboard }
     *
     * Baris keluaran diurutkan poin menurun, diberi peringkat 1..n, dan hanya
     * memuat field aman: { rank, displayName, points, level }. Field `email`
     * (atau identitas mirip email) tidak pernah disertakan.
     *
     * @param {Array<Object>} entries
     * @returns {Array<{rank:number, displayName:string, points:number, level:number}>}
     */
    buildLeaderboard: function buildLeaderboard(entries) {
      var list = Array.isArray(entries) ? entries : [];

      // Hanya peserta opt-in (R6.8, R6.9).
      var optIn = list.filter(function (e) {
        return e && typeof e === 'object' && e.optInLeaderboard === true;
      });

      // Petakan ke baris aman (tanpa email). Nama tampilan wajib non-email (R6.10).
      var rows = optIn.map(function (e) {
        var points = isFiniteNum(e.points) ? Number(e.points) : 0;
        var name = typeof e.displayName === 'string' && e.displayName.trim() !== ''
          ? e.displayName
          : 'Anonymous'; // fallback aman; JANGAN gunakan email
        var level = isFiniteNum(e.level) ? Number(e.level) : AquaGamify.levelForPoints(points).level;
        return { displayName: name, points: points, level: level };
      });

      // Urut poin menurun (stabil untuk poin sama), lalu beri peringkat.
      rows.sort(function (a, b) { return b.points - a.points; });
      for (var i = 0; i < rows.length; i++) {
        rows[i] = { rank: i + 1, displayName: rows[i].displayName, points: rows[i].points, level: rows[i].level };
      }
      return rows;
    },

    /**
     * Baca keadaan gamifikasi profil (salinan aman untuk lapisan UI).
     * @param {string} [profileId]
     * @returns {Object} GamifyState
     */
    getState: function getState(profileId) {
      return readState(profileId);
    },

    /**
     * Tulis (gabungkan) keadaan gamifikasi profil ke penyimpanan.
     * @param {Object} patch       Bagian keadaan yang ingin ditimpa.
     * @param {string} [profileId]
     * @returns {Object} Keadaan tersimpan setelah penggabungan.
     */
    saveState: function saveState(patch, profileId) {
      var current = readState(profileId);
      var next = Object.assign({}, current, patch && typeof patch === 'object' ? patch : {});
      writeState(next, profileId);
      return next;
    }
  };

  return AquaGamify;
});
