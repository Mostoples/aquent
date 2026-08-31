/* =====================================================
   AQUENT — Notification Center (AquaNotif)
   Spec: advanced-features-upgrade — Requirement 8

   Pusat notifikasi terpusat: riwayat & pengelolaan notifikasi per profil.
   Seluruh data disimpan di localStorage dengan kunci per-profil
   `aquent-notifications-{profileId}` sehingga setiap Active_Profile melihat
   notifikasinya sendiri (R8.8 — isolasi antar profil).

   Sumber notifikasi: Alert_Manager (water_quality), Gamification_Engine
   (gamification), penjadwal/pengingat (reminder), dan edukasi (education).

   Kontrak (lihat design.md §9):
     AquaNotif.add(notif, profileId)        => Notification
     AquaNotif.list(profileId, category)    => Notification[]  (terbaru-dulu)
     AquaNotif.unreadCount(profileId)       => number
     AquaNotif.markRead(id, profileId)      => Notification|null
     AquaNotif.markAllRead(profileId)       => number (jumlah yang berubah)
     AquaNotif.remove(id, profileId)        => boolean

   Notification: { id, profileId, category, title, body, ts, read }
   category ∈ 'water_quality' | 'gamification' | 'reminder' | 'education'

   Pola pemuatan: berkas .js biasa yang dimuat via <script> di app.html
   setelah app.js, dan SELF-REGISTER ke window + globalThis agar identik di
   browser maupun pada harness uji (Vitest + jsdom). Mengikuti konvensi
   penyimpanan JSON-array di app.js (getSessionHistory / aquent-sessions):
   baca dengan try/catch yang anggun terhadap data rusak/hilang.
   ===================================================== */

const AquaNotif = (function () {
  'use strict';

  /** Prefix kunci localStorage per profil (R8.8). */
  const STORAGE_PREFIX = 'aquent-notifications-';

  /** Kategori notifikasi yang valid (R8.6). */
  const CATEGORIES = ['water_quality', 'gamification', 'reminder', 'education'];

  /**
   * Penghitung monoton untuk menjamin keunikan id meski beberapa notifikasi
   * dibuat dalam milidetik yang sama (Date.now() bisa identik).
   * @type {number}
   */
  let _seq = 0;

  /**
   * Selesaikan profileId efektif. Bila tidak diberikan (null/undefined),
   * coba ambil dari Active_Profile aplikasi (getActiveProfile dari app.js),
   * lalu jatuh ke 'default' — mengikuti pola saveCurrentSession() di app.js.
   * Nilai lain (termasuk string kosong) dipertahankan apa adanya agar
   * isolasi antar profil tetap deterministik.
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

  /**
   * Bangun kunci localStorage untuk sebuah profil.
   * @param {string} [profileId]
   * @returns {string}
   */
  function _key(profileId) {
    return STORAGE_PREFIX + _resolveProfileId(profileId);
  }

  /**
   * Baca daftar notifikasi mentah dari localStorage. Anggun terhadap data
   * hilang/rusak: selalu kembalikan array (kosong bila gagal parse atau
   * bukan array). Mengikuti pola try/catch getSessionHistory() di app.js.
   * @param {string} [profileId]
   * @returns {Array<Object>}
   */
  function _read(profileId) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return [];
      const raw = localStorage.getItem(_key(profileId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Tulis daftar notifikasi ke localStorage (best-effort, anggun bila gagal).
   * @param {string} [profileId]
   * @param {Array<Object>} list
   */
  function _write(profileId, list) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(_key(profileId), JSON.stringify(list));
    } catch (_) {
      /* kuota penuh / storage tidak tersedia — abaikan secara anggun */
    }
  }

  /**
   * Hasilkan id unik untuk notifikasi baru. Gabungkan stempel waktu +
   * penghitung monoton + komponen acak agar tetap unik dalam batch cepat.
   * @returns {string}
   */
  function _genId() {
    _seq = (_seq + 1) % 1e9;
    const rand = Math.random().toString(36).slice(2, 8);
    return `ntf_${Date.now()}_${_seq}_${rand}`;
  }

  /**
   * Normalisasi sebuah record mentah menjadi bentuk Notification yang stabil.
   * Dipakai saat membaca dari storage agar field selalu terdefinisi.
   * @param {Object} n
   * @returns {Object}
   */
  function _normalize(n) {
    return {
      id: n && n.id != null ? String(n.id) : _genId(),
      profileId: n && n.profileId != null ? String(n.profileId) : '',
      category: n && n.category != null ? n.category : null,
      title: n && n.title != null ? n.title : '',
      body: n && n.body != null ? n.body : '',
      ts: n && Number.isFinite(n.ts) ? n.ts : 0,
      read: !!(n && n.read),
    };
  }

  const AquaNotif = {
    /** Kategori yang dikenali (read-only referensi). */
    CATEGORIES: CATEGORIES.slice(),

    /**
     * Tambahkan notifikasi baru untuk sebuah profil (R8.2).
     * Menetapkan id unik dan ts bila tidak disediakan; `read` default false.
     * Notifikasi disimpan (append) ke storage profil terkait.
     *
     * @param {Object} notif                  Data notifikasi parsial.
     * @param {string} [notif.id]             Bila ada, dipakai apa adanya.
     * @param {string} [notif.category]       Salah satu kategori valid.
     * @param {string} [notif.title]
     * @param {string} [notif.body]
     * @param {number} [notif.ts]             Epoch ms; default Date.now().
     * @param {boolean} [notif.read]          Default false.
     * @param {string} [profileId]
     * @returns {Object} Notification yang tersimpan.
     */
    add(notif, profileId) {
      const src = notif || {};
      const pid = _resolveProfileId(profileId);
      const notification = {
        id: src.id != null ? String(src.id) : _genId(),
        profileId: pid,
        category: src.category != null ? src.category : null,
        title: src.title != null ? src.title : '',
        body: src.body != null ? src.body : '',
        ts: Number.isFinite(src.ts) ? src.ts : Date.now(),
        read: src.read === true,
      };
      const list = _read(profileId);
      list.push(notification);
      _write(profileId, list);
      return notification;
    },

    /**
     * Daftar notifikasi profil, diurutkan terbaru-dulu berdasarkan ts (R8.1).
     * Bila `category` diberikan, hanya kembalikan notifikasi kategori tsb
     * (R8.6). Selalu kembalikan array baru (tidak membocorkan referensi store).
     *
     * @param {string} [profileId]
     * @param {string} [category]  Filter kategori opsional.
     * @returns {Array<Object>} Notification[] terbaru-dulu.
     */
    list(profileId, category) {
      let items = _read(profileId).map(_normalize);
      if (category !== undefined && category !== null) {
        items = items.filter((n) => n.category === category);
      }
      // Terbaru-dulu: ts menurun. Sort stabil untuk ts yang sama.
      items.sort((a, b) => b.ts - a.ts);
      return items;
    },

    /**
     * Jumlah notifikasi yang belum dibaca pada sebuah profil (R8.3).
     * @param {string} [profileId]
     * @returns {number}
     */
    unreadCount(profileId) {
      return _read(profileId).reduce(
        (acc, n) => acc + (n && n.read === true ? 0 : 1),
        0
      );
    },

    /**
     * Tandai satu notifikasi sebagai telah dibaca (R8.4).
     * @param {string} id
     * @param {string} [profileId]
     * @returns {Object|null} Notifikasi yang diperbarui, atau null bila tak ada.
     */
    markRead(id, profileId) {
      const target = id != null ? String(id) : null;
      if (target === null) return null;
      const list = _read(profileId);
      let updated = null;
      for (let i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].id) === target) {
          list[i].read = true;
          updated = _normalize(list[i]);
          break;
        }
      }
      if (updated) _write(profileId, list);
      return updated;
    },

    /**
     * Tandai SELURUH notifikasi profil sebagai telah dibaca (R8.5).
     * Bersifat idempoten: pemanggilan berulang tidak mengubah keadaan.
     * @param {string} [profileId]
     * @returns {number} Jumlah notifikasi yang berubah status pada panggilan ini.
     */
    markAllRead(profileId) {
      const list = _read(profileId);
      let changed = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].read !== true) {
          list[i].read = true;
          changed++;
        }
      }
      if (changed > 0) _write(profileId, list);
      return changed;
    },

    /**
     * Hapus satu notifikasi dari daftar & penyimpanan (R8.7).
     * @param {string} id
     * @param {string} [profileId]
     * @returns {boolean} true bila ada notifikasi yang terhapus.
     */
    remove(id, profileId) {
      const target = id != null ? String(id) : null;
      if (target === null) return false;
      const list = _read(profileId);
      const next = list.filter((n) => !(n && String(n.id) === target));
      if (next.length === list.length) return false;
      _write(profileId, next);
      return true;
    },
  };

  return AquaNotif;
})();

// Self-register agar berkas yang sama bekerja di browser (<script>) dan pada
// harness uji (Vitest + jsdom). Lihat tests/README.md.
if (typeof window !== 'undefined') window.AquaNotif = AquaNotif;
if (typeof globalThis !== 'undefined') globalThis.AquaNotif = AquaNotif;
