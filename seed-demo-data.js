/* =====================================================
   AQUENT — Seed Demo Data
   Generate data realistic untuk testing halaman admin:
   - sessions/{uid}/{ts}    — riwayat mandi (default 50 user × 30 hari)
   - surveys/{uid}/{ts}     — kuesioner P15 (default 30 responden)
   - announcements/{id}     — pengumuman contoh
   - users (Firestore)      — opsional bila <count user real

   Cara pakai:
     node seed-demo-data.js                       # default
     node seed-demo-data.js --users=20 --days=14
     node seed-demo-data.js --clear               # hapus dulu sebelum seed
     node seed-demo-data.js --only=surveys        # hanya seed surveys

   ===================================================== */

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
const SA   = path.join(__dirname, 'service-account.json');
let serviceAccount;
try { serviceAccount = require(SA); }
catch { console.error('✗ service-account.json tidak ditemukan.'); process.exit(1); }

const getDatabaseURL = require('./_dburl');
admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: getDatabaseURL(serviceAccount.project_id),
});

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.+))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const NUM_USERS    = +args.users    || 20;
const DAYS         = +args.days     || 30;
const NUM_SURVEYS  = +args.surveys  || 30;
const ONLY         = args.only;        // 'sessions' | 'surveys' | 'announcements'
const SHOULD_CLEAR = !!args.clear;

const rand    = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick    = arr => arr[Math.floor(Math.random() * arr.length)];
const round   = (v, d = 2) => +v.toFixed(d);

const SKIN_TYPES = ['dry', 'normal', 'oily', 'combination', 'sensitive'];
const NAMES = [
  'Budi Santoso','Siti Aminah','Joko Widodo','Dewi Lestari','Rudi Hartono',
  'Ayu Kusuma','Andi Pratama','Maya Sari','Bagus Wibowo','Lina Putri',
  'Doni Saputra','Indah Permata','Eko Nugroho','Rina Wati','Hadi Suharto',
  'Nina Aulia','Dimas Aditya','Sari Mulyani','Reza Mahendra','Putri Anggraini',
];

/* ===== Generators ===== */

function genUid(i) { return `demo_user_${String(i).padStart(3, '0')}`; }

function genSession(ts, profileId) {
  const ph    = round(rand(6.0, 8.5), 1);
  const temp  = round(rand(34, 41), 1);
  const turb  = round(rand(0.05, 1.2), 2);
  const dur   = round(rand(4, 14), 1);
  const vol   = round(dur * rand(7, 12), 1);
  const saved = round(rand(5, 35), 1);

  // Quality score deterministic dari sensor (mirip frontend)
  const phScore   = (ph >= 6.5 && ph <= 7.5) ? 100 : (ph >= 6.0 && ph <= 8.5 ? 75 : 50);
  const tempScore = (temp >= 36 && temp <= 38) ? 100 : (temp >= 34 && temp <= 41 ? 78 : 55);
  const turbScore = turb <= 0.5 ? 100 : turb <= 1 ? 75 : 50;
  const qs        = Math.round(phScore * 0.35 + tempScore * 0.35 + turbScore * 0.30);

  return {
    ts, profileId,
    ph, temperature: temp, turbidity: turb,
    duration_min:   dur,
    volume_liters:  vol,
    quality_score:  qs,
    water_saved_pct: saved,
  };
}

function genLikert7(targetMean = 5.5, sd = 1.2) {
  // Normal-ish around target, clamp 1-7
  const v = Math.round(targetMean + (Math.random() - .5) * sd * 2);
  return Math.max(1, Math.min(7, v));
}
function genLikert5(targetMean = 4) {
  return Math.max(1, Math.min(5, Math.round(targetMean + (Math.random() - .5) * 1.6)));
}
function genUEQ() {
  return Math.max(-3, Math.min(3, Math.round((Math.random() - .35) * 5)));
}

function genSurvey(ts) {
  const tamMean   = rand(5.0, 6.4);
  const xaiMean   = rand(4.8, 6.2);
  const susMean   = rand(3.4, 4.6);
  const susNeg    = rand(1.8, 2.6);

  const fillL7 = (count, mean) => {
    const out = {};
    for (let i = 1; i <= count; i++) out[`item${i}`] = genLikert7(mean);
    return out;
  };

  return {
    submittedAt:   ts,
    duration_sec:  randInt(180, 720),
    completed:     true,
    section_A: {
      gender:        pick(['L','P','Lainnya']),
      ageGroup:      pick(['<17','17-24','25-34','35-44','45-54','55+']),
      education:     pick(['SMA','D3','S1','S2','S3']),
      skinType:      pick(SKIN_TYPES),
      skinCondition: pick(['Normal','Berjerawat','Eksim','Sensitif','Dehidrasi']),
      usageFreq:     pick(['Setiap hari','3-5x/minggu','1-2x/minggu','Jarang']),
      usageDuration: pick(['<1 minggu','1-2 minggu','2-4 minggu','>1 bulan']),
      featuresUsed:  pick([
        ['Dashboard','AI Chat'],
        ['Dashboard','Skin Scan','AI Chat'],
        ['Dashboard','Eco-Monitor','Dermal Guide'],
        ['Dashboard','AI Chat','History','Recommender'],
      ]),
    },
    section_B: {
      // TAM Likert 1-7
      PU1: genLikert7(tamMean), PU2: genLikert7(tamMean), PU3: genLikert7(tamMean),
      PU4: genLikert7(tamMean), PU5: genLikert7(tamMean), PU6: genLikert7(tamMean),
      PEOU1: genLikert7(tamMean+0.2), PEOU2: genLikert7(tamMean+0.2), PEOU3: genLikert7(tamMean+0.2),
      PEOU4: genLikert7(tamMean+0.2), PEOU5: genLikert7(tamMean+0.2), PEOU6: genLikert7(tamMean+0.2),
      ATU1: genLikert7(tamMean), ATU2: genLikert7(tamMean), ATU3: genLikert7(tamMean),
      BIU1: genLikert7(tamMean-0.1), BIU2: genLikert7(tamMean-0.1), BIU3: genLikert7(tamMean-0.1),
    },
    section_C: {
      // SUS Likert 1-5 (genap = negatif → score lebih rendah)
      SUS1: genLikert5(susMean),  SUS2: genLikert5(susNeg),
      SUS3: genLikert5(susMean),  SUS4: genLikert5(susNeg),
      SUS5: genLikert5(susMean),  SUS6: genLikert5(susNeg),
      SUS7: genLikert5(susMean),  SUS8: genLikert5(susNeg),
      SUS9: genLikert5(susMean),  SUS10: genLikert5(susNeg),
    },
    section_D: {
      UEQ1: genUEQ(), UEQ2: genUEQ(), UEQ3: genUEQ(), UEQ4: genUEQ(),
      UEQ5: genUEQ(), UEQ6: genUEQ(), UEQ7: genUEQ(), UEQ8: genUEQ(),
      UEQ9: genUEQ(), UEQ10: genUEQ(), UEQ11: genUEQ(), UEQ12: genUEQ(),
    },
    section_E: {
      XAIT1: genLikert7(xaiMean), XAIT2: genLikert7(xaiMean),
      XAIT3: genLikert7(xaiMean), XAIT4: genLikert7(xaiMean),
      AIT1: genLikert7(xaiMean-0.3), AIT2: genLikert7(xaiMean-0.3),
      AIT3: genLikert7(xaiMean-0.3), AIT4: genLikert7(xaiMean-0.3),
    },
    section_F: {
      WQL1: genLikert7(5.2), WQL2: genLikert7(5.2), WQL3: genLikert7(5.2), WQL4: genLikert7(5.2),
      BCI1: genLikert7(5.5), BCI2: genLikert7(5.5), BCI3: genLikert7(5.5), BCI4: genLikert7(5.5),
      IDPT1:genLikert7(5.3), IDPT2:genLikert7(5.3), IDPT3:genLikert7(5.3), IDPT4:genLikert7(5.3),
      SRP1: genLikert7(5.4), SRP2: genLikert7(5.4), SRP3: genLikert7(5.4), SRP4: genLikert7(5.4),
      ECO1: genLikert7(5.8), ECO2: genLikert7(5.8), ECO3: genLikert7(5.8), ECO4: genLikert7(5.8),
    },
    section_G: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`G${i + 1}`, genLikert5(4)])
    ),
    section_H: {
      H1_text: pick([
        'Fitur AI Chat sangat membantu saya memahami pH air shower yang aman.',
        'Visualisasi skor air mudah dipahami, terutama warna gauge.',
        'Saya suka penjelasan XAI yang menjelaskan kenapa skornya rendah.',
        '',
      ]),
      H2_text: pick([
        'Loading awal terasa agak lambat di koneksi 3G.',
        'Skin scanner kadang error kalau cahaya kurang.',
        'Belum ada notifikasi alert kualitas air.',
        '',
      ]),
      H3_text: pick([
        'Tambahkan integrasi smartwatch untuk reminder mandi.',
        'Mode dark/light/elegant sangat membantu.',
        'Bisa export riwayat ke PDF akan lebih bagus.',
        '',
      ]),
      H4_text: pick(['8','9','7','10','6','9','8']),
    },
    deviceInfo: {
      userAgent:    'Mozilla/5.0 (DemoBot)',
      screenWidth:  pick([360, 414, 768, 1024, 1440]),
      platform:     pick(['Win32','MacIntel','Linux x86_64','iPhone','Android']),
    },
  };
}

const ANNOUNCEMENTS = [
  { type:'info',    title:'Selamat datang di AQUENT',                       body:'Terima kasih telah bergabung. Eksplor fitur AI Chat & Skin Scanner untuk pengalaman maksimal.' },
  { type:'warning', title:'Pemeliharaan terjadwal',                          body:'Sistem akan offline pada Sabtu 02:00–04:00 WIB untuk maintenance database.' },
  { type:'success', title:'Update fitur baru: Elegant Mode',                 body:'Coba tampilan baru kami di Settings → Theme. Ada 3 mode: Dark, Light, Elegant.' },
  { type:'urgent',  title:'Filter air perlu diganti dalam 3 hari',           body:'Berdasarkan data sensor, filter Anda telah digunakan >30 hari. Aktifkan Auto-Filter di Controls.' },
];

/* ===== Actions ===== */

async function clearDemoData() {
  console.log('🗑  Menghapus demo data lama...');
  const db = admin.database();
  const fs = admin.firestore();
  const auth = admin.auth();

  // RTDB sessions
  const sessSnap = await db.ref('sessions').once('value');
  const sessData = sessSnap.val() || {};
  for (const uid of Object.keys(sessData)) {
    if (uid.startsWith('demo_user_')) await db.ref(`sessions/${uid}`).remove();
  }
  // RTDB surveys
  const survSnap = await db.ref('surveys').once('value');
  const survData = survSnap.val() || {};
  for (const uid of Object.keys(survData)) {
    if (uid.startsWith('demo_user_')) await db.ref(`surveys/${uid}`).remove();
  }
  // RTDB profiles
  const profSnap = await db.ref('profiles').once('value');
  const profData = profSnap.val() || {};
  for (const uid of Object.keys(profData)) {
    if (uid.startsWith('demo_user_')) await db.ref(`profiles/${uid}`).remove();
  }
  // Pengumuman demo
  const annSnap = await db.ref('announcements').once('value');
  const annData = annSnap.val() || {};
  for (const [id, a] of Object.entries(annData)) {
    if (a.createdBy === 'demo-seed') await db.ref(`announcements/${id}`).remove();
  }
  // Firestore demo users
  const userQuery = await fs.collection('users').where('isDemoUser', '==', true).get();
  let fsDeleted = 0;
  const batch = fs.batch();
  userQuery.docs.forEach(d => { batch.delete(d.ref); fsDeleted++; });
  if (fsDeleted) await batch.commit();
  // Auth demo users
  let authDeleted = 0;
  for (let i = 0; i < 100; i++) {
    const uid = genUid(i);
    try { await auth.deleteUser(uid); authDeleted++; }
    catch { /* tidak ada */ }
  }
  console.log(`✓ Cleared: ${fsDeleted} firestore, ${authDeleted} auth, plus RTDB nodes.`);
}

async function seedSessions() {
  console.log(`🚿 Generating ${NUM_USERS} users × ${DAYS} hari sessions...`);
  const db   = admin.database();
  const now  = Date.now();
  let total  = 0;
  for (let i = 0; i < NUM_USERS; i++) {
    const uid       = genUid(i);
    const profileId = `p_demo_${i}`;
    const updates   = {};
    for (let d = 0; d < DAYS; d++) {
      // 1-2 sesi per hari, kadang skip
      const sessionsToday = Math.random() < 0.85 ? randInt(1, 2) : 0;
      for (let s = 0; s < sessionsToday; s++) {
        const ts   = now - (DAYS - d) * 86_400_000 + randInt(5, 22) * 3_600_000 + randInt(0, 59) * 60_000;
        updates[`sessions/${uid}/${ts}`] = genSession(ts, profileId);
        total++;
      }
    }
    await db.ref().update(updates);
    process.stdout.write(`\r   ✓ ${i + 1}/${NUM_USERS} users (total ${total} sesi)`);
  }
  console.log(`\n✓ Selesai seed ${total} sessions.`);
}

async function seedSurveys() {
  console.log(`📊 Generating ${NUM_SURVEYS} survey responses...`);
  const db  = admin.database();
  const now = Date.now();
  for (let i = 0; i < NUM_SURVEYS; i++) {
    const uid = genUid(i);
    const ts  = now - randInt(0, DAYS) * 86_400_000 - randInt(0, 23) * 3_600_000;
    await db.ref(`surveys/${uid}/${ts}`).set(genSurvey(ts));
    process.stdout.write(`\r   ✓ ${i + 1}/${NUM_SURVEYS}`);
  }
  console.log('\n✓ Selesai seed surveys.');
}

async function seedAnnouncements() {
  console.log(`📢 Generating ${ANNOUNCEMENTS.length} announcements...`);
  const db = admin.database();
  const now = Date.now();
  for (let i = 0; i < ANNOUNCEMENTS.length; i++) {
    const a = ANNOUNCEMENTS[i];
    const ref = db.ref('announcements').push();
    await ref.set({
      ...a,
      createdAt: now - i * 3_600_000,
      createdBy: 'demo-seed',
    });
  }
  console.log('✓ Selesai seed announcements.');
}

async function seedDemoUsers() {
  console.log(`👤 Generating ${NUM_USERS} demo users di Firestore...`);
  const db = admin.firestore();
  const auth = admin.auth();
  const batch = db.batch();
  let authCreated = 0, authReused = 0;

  for (let i = 0; i < NUM_USERS; i++) {
    const uid   = genUid(i);
    const email = `demo${i}@aquent.test`;
    const name  = NAMES[i % NAMES.length];

    // Buat (atau update) auth user dengan UID custom agar match dengan demo data
    try {
      await auth.getUser(uid);
      authReused++;
    } catch {
      try {
        await auth.createUser({
          uid,
          email,
          emailVerified: true,
          displayName:   name,
          password:      'demo123456',          // testing only
          disabled:      false,
        });
        authCreated++;
      } catch (e) {
        // Bisa terjadi kalau email sudah dipakai user lain — abaikan
        console.warn(`   ⚠ Auth ${uid}: ${e.message}`);
      }
    }

    const ref = db.collection('users').doc(uid);
    batch.set(ref, {
      email,
      displayName: name,
      photoURL:    '',
      role:        i < 3 ? 'premium' : i < 5 ? 'ultimate' : 'free',
      plan:        i < 3 ? 'premium' : i < 5 ? 'ultimate' : 'free',
      createdAt:   admin.firestore.Timestamp.fromMillis(Date.now() - randInt(1, 60) * 86_400_000),
      isDemoUser:  true,
    });
  }
  await batch.commit();
  console.log(`✓ Selesai: ${authCreated} auth user baru, ${authReused} reuse, ${NUM_USERS} firestore docs.`);
  console.log('   Login credentials demo: demo0@aquent.test ... demo' + (NUM_USERS-1) + '@aquent.test (password: demo123456)');
}

/* ===== Run ===== */

(async () => {
  console.log('═══════════════════════════════════════');
  console.log('  AQUENT — Demo Data Seeder');
  console.log('═══════════════════════════════════════');
  console.log(`  Project: ${serviceAccount.project_id}`);
  console.log(`  Users:   ${NUM_USERS}`);
  console.log(`  Days:    ${DAYS}`);
  console.log(`  Surveys: ${NUM_SURVEYS}`);
  if (ONLY)         console.log(`  Only:    ${ONLY}`);
  if (SHOULD_CLEAR) console.log('  Mode:    CLEAR + SEED');
  console.log('═══════════════════════════════════════\n');

  try {
    if (SHOULD_CLEAR) await clearDemoData();

    const tasks = ONLY ? [ONLY] : ['users', 'sessions', 'surveys', 'announcements'];
    if (tasks.includes('users'))         await seedDemoUsers();
    if (tasks.includes('sessions'))      await seedSessions();
    if (tasks.includes('surveys'))       await seedSurveys();
    if (tasks.includes('announcements')) await seedAnnouncements();

    console.log('\n✅ Selesai. Cek halaman admin untuk lihat data.');
    process.exit(0);
  } catch (e) {
    console.error('\n✗ Error:', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
})();
