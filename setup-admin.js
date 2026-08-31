/* =====================================================
   AQUENT — Bootstrap Admin Script
   Set role=admin di Firestore + tandai meta/admins di RTDB
   untuk satu UID. Pakai Firebase Admin SDK + service-account.json
   =====================================================
   Cara pakai:
     1. Pastikan service-account.json ada di root project
     2. npm install firebase-admin
     3. node setup-admin.js <UID>     ← UID dari Firebase Console > Auth
        ATAU
        node setup-admin.js <email@example.com>
   ===================================================== */

// Pakai firebase-admin dari folder functions/ kalau di root belum install
let admin;
try { admin = require('firebase-admin'); }
catch {
  try { admin = require('./functions/node_modules/firebase-admin'); }
  catch {
    console.error('✗ firebase-admin belum terinstall. Jalankan: cd functions && npm install');
    process.exit(1);
  }
}
const path = require('path');

const SA = path.join(__dirname, 'service-account.json');
let serviceAccount;
try { serviceAccount = require(SA); }
catch { console.error('✗ service-account.json tidak ditemukan di', SA); process.exit(1); }

const getDatabaseURL = require('./_dburl');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: getDatabaseURL(serviceAccount.project_id),
});

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node setup-admin.js <uid|email>');
    process.exit(1);
  }

  let uid = arg;
  // Kalau argumen mengandung @, treat sebagai email → resolve ke UID
  if (arg.includes('@')) {
    try {
      const userRecord = await admin.auth().getUserByEmail(arg);
      uid = userRecord.uid;
      console.log(`✓ Email ${arg} → UID: ${uid}`);
    } catch (e) {
      console.error('✗ User dengan email tersebut belum daftar:', e.message);
      process.exit(1);
    }
  } else {
    // Verifikasi UID valid
    try {
      const u = await admin.auth().getUser(uid);
      console.log(`✓ UID ${uid} terverifikasi (email: ${u.email || 'N/A'})`);
    } catch (e) {
      console.error('✗ UID tidak ditemukan:', e.message);
      process.exit(1);
    }
  }

  // 1. Tandai role=admin di Firestore users/{uid}
  const userRef = admin.firestore().collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    await userRef.set({
      email:     (await admin.auth().getUser(uid)).email || '',
      role:      'admin',
      plan:      'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✓ Firestore: users/' + uid + ' dibuat dengan role=admin');
  } else {
    await userRef.update({ role:'admin', plan:'admin' });
    console.log('✓ Firestore: users/' + uid + '.role di-update ke admin');
  }

  // 2. Tandai meta/admins/{uid} = true di RTDB
  await admin.database().ref('meta/admins/' + uid).set(true);
  console.log('✓ RTDB: meta/admins/' + uid + ' = true');

  // 3. (Opsional) custom claim — bisa dipakai untuk Cloud Functions nanti
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  console.log('✓ Auth: custom claim {admin:true} tersetel');

  console.log('\n✅ Selesai. User dengan UID ' + uid + ' sekarang admin.');
  console.log('   Login dengan akun tersebut → akan otomatis redirect ke /admin.html');
  console.log('   (Logout & login ulang kalau sudah login agar token refresh)');
  process.exit(0);
})().catch(e => {
  console.error('\n✗ Error:', e.message);
  process.exit(1);
});
