/* AQUENT — Firebase backend layer.
   Uses the same project, paths and record formats as the existing AQUENT app
   (aquent-id): RTDB sensors / controls / session / reminders / sessions/{uid} /
   profiles/{uid} / announcements, Firestore users/{uid}.
   Firebase config comes from Firebase Hosting's reserved /__/firebase/init.js,
   so no keys live in this repo. When Firebase is not available (file://, local
   preview) the app falls back to demo mode. */
(() => {
  const B = {
    available: false,
    user: null,
    role: "free",
    db: null,
    fs: null,
  };

  B.init = () => {
    try {
      if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) return false;
      B.db = firebase.database();
      B.fs = firebase.firestore ? firebase.firestore() : null;
      B.available = true;
    } catch (e) {
      console.warn("[AQUENT] Firebase unavailable, demo mode:", e.message);
      B.available = false;
    }
    return B.available;
  };

  /* ------------------------------------------------------------ auth -- */
  B.onAuth = (cb) => {
    if (!B.available) return cb(null);
    firebase.auth().onAuthStateChanged(async (user) => {
      B.user = user;
      if (user) {
        try { B.role = await ensureUserDoc(user); } catch (e) { B.role = "free"; }
      }
      cb(user);
    });
  };

  async function ensureUserDoc(user) {
    if (!B.fs) return "free";
    const ref = B.fs.collection("users").doc(user.uid);
    const snap = await ref.get();
    if (snap.exists) return snap.data().role || "free";
    await ref.set({
      email: user.email || "", displayName: user.displayName || "", photoURL: user.photoURL || "",
      role: "free", plan: "free", createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return "free";
  }

  const persist = async (remember) => {
    const P = firebase.auth.Auth.Persistence;
    try { await firebase.auth().setPersistence(remember === false ? P.SESSION : P.LOCAL); } catch (e) {}
  };
  B.signInGoogle = async () => {
    await persist(true);
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      return await firebase.auth().signInWithPopup(provider);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        return firebase.auth().signInWithRedirect(provider);
      }
      throw e;
    }
  };
  B.signInEmail = async (email, pass, remember) => { await persist(remember); return firebase.auth().signInWithEmailAndPassword(email, pass); };
  B.register = async (email, pass, name) => {
    await persist(true);
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, pass);
    if (name) await cred.user.updateProfile({ displayName: name });
    return cred;
  };
  B.resetPassword = (email) => firebase.auth().sendPasswordResetEmail(email);
  B.signOut = () => firebase.auth().signOut();

  B.authError = (e) => ({
    "auth/invalid-email": "Format email tidak valid.",
    "auth/user-not-found": "Akun tidak ditemukan.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/email-already-in-use": "Email sudah terdaftar. Silakan masuk.",
    "auth/weak-password": "Password minimal 6 karakter.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
    "auth/popup-closed-by-user": "Login Google dibatalkan.",
    "auth/network-request-failed": "Tidak ada koneksi internet.",
  }[e && e.code] || (e && e.message) || "Terjadi kesalahan.");

  /* ------------------------------------------------------------ rtdb --- */
  const ref = (p) => B.db.ref(p);
  const uid = () => B.user && B.user.uid;

  B.onConnection = (cb) => ref(".info/connected").on("value", (s) => cb(!!s.val()));
  B.subSensors = (cb) => ref("sensors").on("value", (s) => s.val() && cb(s.val()));
  B.subControls = (cb) => ref("controls").on("value", (s) => cb(s.val() || {}));
  B.setControl = (key, val) => ref("controls/" + key).set(val).catch((e) => console.warn(e.message));
  B.subSession = (cb) => ref("session").on("value", (s) => cb(s.val() || {}));
  B.setSession = (obj) => ref("session").update(obj).catch((e) => console.warn(e.message));

  B.saveSessionRecord = (rec) => {
    if (!uid()) return Promise.resolve();
    return ref(`sessions/${uid()}/${rec.ts}`).set(rec);
  };
  B.loadSessions = async () => {
    if (!uid()) return [];
    const snap = await ref(`sessions/${uid()}`).orderByKey().limitToLast(400).once("value");
    const d = snap.val() || {};
    return Object.entries(d).map(([k, v]) => ({ ...v, ts: parseInt(k, 10) || v.ts })).sort((a, b) => a.ts - b.ts);
  };

  B.subReminders = (cb) => ref("reminders").on("value", (s) => {
    const d = s.val() || {};
    cb(Object.entries(d).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.time || "").localeCompare(b.time || "")));
  });
  B.addReminder = (r) => ref("reminders").push(r);
  B.updateReminder = (id, patch) => ref("reminders/" + id).update(patch);
  B.deleteReminder = (id) => ref("reminders/" + id).remove();

  B.loadPrefs = async () => {
    if (!uid()) return {};
    const s = await ref(`profiles/${uid()}/prefs`).once("value");
    return s.val() || {};
  };
  B.savePrefs = (patch) => uid() ? ref(`profiles/${uid()}/prefs`).update(patch) : Promise.resolve();

  B.subAnnouncements = (cb) => ref("announcements").orderByChild("createdAt").limitToLast(1).on("value", (s) => {
    const d = s.val();
    if (!d) return;
    const [id, a] = Object.entries(d)[0];
    cb({ id, ...a });
  });

  window.AQB = B;
})();
