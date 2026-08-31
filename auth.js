/* =====================================================
   AQUENT — auth.js  v1.0
   Shared Firebase Auth + Firestore role utilities
   ===================================================== */

const PLAN_META = {
  free:     { label:'Free',     color:'#8b949e', icon:'ph-leaf',         aiMsgPerDay:5,  skinScan:true,  multiProfile:false },
  premium:  { label:'Premium',  color:'#f0c040', icon:'ph-star',         aiMsgPerDay:-1, skinScan:true,  multiProfile:false },
  ultimate: { label:'Ultimate', color:'#00b4d8', icon:'ph-lightning',    aiMsgPerDay:-1, skinScan:true,  multiProfile:true  },
  admin:    { label:'Admin',    color:'#ff6b6b', icon:'ph-shield-check',  aiMsgPerDay:-1, skinScan:true,  multiProfile:true  },
};

let _authUser  = null;
let _authRole  = 'free';
let _authReady = false;
const _authCbs = [];

/* ---- Session persistence ----
   Firebase menyimpan sesi di IndexedDB per-origin. Jangan bergantung pada
   default SDK: tetapkan eksplisit supaya sesi bertahan setelah tab/browser
   ditutup (LOCAL). Mode SESSION dipakai bila pengguna tidak mencentang
   "Ingat saya" — sesi hilang begitu tab ditutup. */
const PERSIST_KEY = 'aquent-persist';

function _persistenceMode() {
  return localStorage.getItem(PERSIST_KEY) === 'session' ? 'session' : 'local';
}

/**
 * Terapkan persistensi sesi ke instance Auth.
 * @param {'local'|'session'} [mode] Bila kosong, pakai preferensi tersimpan.
 * @returns {Promise<void>} Selalu resolve — kegagalan persistensi tidak boleh
 *   memblokir login (mis. IndexedDB diblokir di mode privat).
 */
async function setAuthPersistence(mode) {
  if (mode) localStorage.setItem(PERSIST_KEY, mode === 'session' ? 'session' : 'local');
  const want = mode || _persistenceMode();
  const P = firebase.auth.Auth.Persistence;
  try {
    await firebase.auth().setPersistence(want === 'session' ? P.SESSION : P.LOCAL);
  } catch (e) {
    // IndexedDB/localStorage tidak tersedia → SDK jatuh ke in-memory.
    console.warn('[AQUENT] Persistensi sesi tidak dapat diterapkan:', e.message);
  }
}

/* Cache role terakhir supaya UI tidak menunggu Firestore saat sesi dipulihkan */
function _roleCacheKey(uid) { return 'aquent-role-' + uid; }

/* Call fn once auth + role are resolved (or immediately if already done) */
function onAuthReady(fn) {
  if (_authReady) { fn({ user:_authUser, role:_authRole }); return; }
  _authCbs.push(fn);
}

function _resolveAuth(user, role) {
  _authUser = user; _authRole = role; _authReady = true;
  _authCbs.splice(0).forEach(fn => fn({ user, role }));
}

async function _getOrCreateRole(user) {
  const db  = firebase.firestore();
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const role = snap.data().role || 'free';
    try { localStorage.setItem(_roleCacheKey(user.uid), role); } catch {}
    return role;
  }
  await ref.set({
    email:       user.email       || '',
    displayName: user.displayName || '',
    photoURL:    user.photoURL    || '',
    role:        'free',
    plan:        'free',
    createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
  });
  return 'free';
}

/*
 * Call this once per page.
 * requireAuth:  redirect to /login.html if not signed in
 * requireAdmin: redirect to /app.html if signed in but not admin
 */
function initAuthListener({ requireAuth = false, requireAdmin = false } = {}) {
  // Terapkan persistensi SEBELUM listener dipasang agar sesi tersimpan
  // dipulihkan dengan mode yang benar saat halaman dibuka kembali.
  setAuthPersistence();

  firebase.auth().onAuthStateChanged(async user => {
    if (!user) {
      _resolveAuth(null, 'free');
      // Simpan tujuan supaya setelah login pengguna kembali ke halaman ini.
      if (requireAuth) {
        const back = location.pathname + location.search + location.hash;
        try { sessionStorage.setItem('aquent-after-login', back); } catch {}
        window.location.href = '/login.html';
      }
      return;
    }
    let role = null;
    try {
      role = await _getOrCreateRole(user);
    } catch (e) {
      console.warn('Role fetch error:', e.message);
      // Firestore tidak terjangkau — pakai role terakhir yang diketahui
      // supaya pengguna tidak kehilangan akses fitur saat jaringan buruk.
      try { role = localStorage.getItem(_roleCacheKey(user.uid)); } catch {}
    }
    _resolveAuth(user, role || 'free');
    if (requireAdmin && (role || 'free') !== 'admin') window.location.href = '/app.html';
  });
}

function getAuthUser()       { return _authUser; }
function getAuthRole()       { return _authRole; }
function getPlanMeta(role)   { return PLAN_META[role] || PLAN_META.free; }

async function authSignOut() {
  const uid = _authUser && _authUser.uid;
  await firebase.auth().signOut();
  try {
    if (uid) localStorage.removeItem(_roleCacheKey(uid));
    sessionStorage.removeItem('aquent-after-login');
  } catch {}
  window.location.href = '/login.html';
}

/* ---- Daily AI message counter (free plan limit: 5/day) ---- */
function _aiKey() {
  return 'aquent-ai-' + new Date().toISOString().slice(0, 10);
}
function getTodayAiCount()    { return parseInt(localStorage.getItem(_aiKey()) || '0'); }
function incrementAiCount()   { localStorage.setItem(_aiKey(), getTodayAiCount() + 1); }
function canSendAiMsg(role) {
  const m = getPlanMeta(role);
  return m.aiMsgPerDay === -1 || getTodayAiCount() < m.aiMsgPerDay;
}
function remainingAiMsg(role) {
  const m = getPlanMeta(role);
  if (m.aiMsgPerDay === -1) return Infinity;
  return Math.max(0, m.aiMsgPerDay - getTodayAiCount());
}
