/* =====================================================
   AQUENT — Finish Setup (all-in-one)
   Jalankan SETELAH RTDB di-create di Firebase Console.

   Langkah otomatis:
     1. Auto-detect URL RTDB instance (cek beberapa region)
     2. Deploy database.rules.json via REST API
     3. Seed demo data (panggil seed-demo-data.js)
     4. Set admin (kalau argumen email/uid diberikan)

   Cara pakai:
     node finish-setup.js                      # detect + rules + seed
     node finish-setup.js admin@example.com    # + jadikan admin
   ===================================================== */

const path  = require('path');
const https = require('https');
const { execSync } = require('child_process');
const admin = require(path.join(__dirname, 'functions', 'node_modules', 'firebase-admin'));
const sa    = require('./service-account.json');

admin.initializeApp({ credential: admin.credential.cert(sa) });
const PROJECT = sa.project_id;

async function getToken() {
  const tok = await admin.app().options.credential.getAccessToken();
  return tok.access_token;
}

function rtdbReq(method, host, pathname, token, bodyStr) {
  return new Promise(resolve => {
    const options = {
      method, hostname: host, path: pathname, timeout: 15000,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const r = https.request(options, res => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('timeout', () => { r.destroy(); resolve({ status: 'TIMEOUT' }); });
    r.on('error', e => resolve({ status: 'ERR', body: e.message }));
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

async function detectHost(token) {
  const hosts = [
    `${PROJECT}-default-rtdb.firebaseio.com`,
    `${PROJECT}-default-rtdb.asia-southeast1.firebasedatabase.app`,
    `${PROJECT}-default-rtdb.us-central1.firebasedatabase.app`,
    `${PROJECT}-default-rtdb.europe-west1.firebasedatabase.app`,
  ];
  for (const h of hosts) {
    const r = await rtdbReq('GET', h, '/.json?shallow=true&access_token=' + token, token);
    if (r.status === 200) return h;
  }
  return null;
}

(async () => {
  console.log('═══════════════════════════════════════');
  console.log('  AQUENT — Finish Setup');
  console.log('═══════════════════════════════════════\n');

  const token = await getToken();

  // 1. Detect RTDB
  console.log('1. Deteksi RTDB instance...');
  const host = await detectHost(token);
  if (!host) {
    console.error('\n✗ RTDB belum aktif di region manapun.');
    console.error('  Buat dulu di: https://console.firebase.google.com/project/' + PROJECT + '/database');
    console.error('  Lalu jalankan ulang: node finish-setup.js');
    process.exit(1);
  }
  const dbUrl = 'https://' + host;
  console.log('   ✓ RTDB aktif:', dbUrl);
  // Set env untuk child scripts
  process.env.AQUENT_DB_URL = dbUrl;

  // 2. Deploy rules via REST
  console.log('\n2. Deploy database rules...');
  const fs = require('fs');
  const rules = fs.readFileSync(path.join(__dirname, 'database.rules.json'), 'utf8');
  const put = await rtdbReq('PUT', host, '/.settings/rules.json?access_token=' + token, token, rules);
  if (put.status === 200) {
    console.log('   ✓ Rules ter-deploy ke', host);
  } else {
    console.log('   ⚠ Rules deploy status:', put.status, String(put.body).slice(0, 200));
    console.log('   (Lanjut — rules bisa di-deploy manual via Firebase CLI nanti)');
  }

  // 3. Seed demo data
  console.log('\n3. Seed demo data...');
  try {
    execSync('node seed-demo-data.js', {
      cwd: __dirname, stdio: 'inherit',
      env: { ...process.env, AQUENT_DB_URL: dbUrl },
    });
  } catch (e) {
    console.error('   ⚠ Seed gagal:', e.message);
  }

  // 4. Set admin (opsional)
  const adminArg = process.argv[2];
  if (adminArg) {
    console.log('\n4. Set admin:', adminArg);
    try {
      execSync(`node setup-admin.js ${adminArg}`, {
        cwd: __dirname, stdio: 'inherit',
        env: { ...process.env, AQUENT_DB_URL: dbUrl },
      });
    } catch (e) {
      console.error('   ⚠ Set admin gagal:', e.message);
    }
  } else {
    console.log('\n4. (Skip set admin — tidak ada email/uid diberikan)');
    console.log('   Jalankan nanti: node setup-admin.js <email>');
  }

  console.log('\n✅ Finish setup selesai.');
  console.log('   DATABASE_URL:', dbUrl);
  process.exit(0);
})().catch(e => { console.error('✗ Error:', e.message); process.exit(1); });
