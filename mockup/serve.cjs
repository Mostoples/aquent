/* =====================================================
   AQUAVIV — static server mini untuk pipeline mockup
   Tanpa dependency eksternal (hanya modul inti Node).

   Dipakai agar halaman dirender via http:// (bukan file://),
   sehingga path absolut seperti /app.js & /data/*.json resolve
   dengan benar saat di-screenshot Chrome headless.

   Jalankan:  node mockup/serve.cjs [port]
   ===================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 8099;

// Aktifkan stub auth via env MOCK_AUTH=1 (dipakai pipeline mockup).
const MOCK_AUTH = process.env.MOCK_AUTH === '1';

/**
 * STUB Firebase yang disisipkan ke <head> SEBELUM script produksi berjalan.
 * Tujuannya: halaman ber-gate auth (app.html/account.html) bisa dirender
 * headless tanpa redirect ke /login.html, dan dashboard terisi data demo.
 *
 * Ini murni untuk keperluan screenshot mockup. Tidak ada file produksi yang
 * diubah, dan stub hanya menyala saat MOCK_AUTH=1.
 */
const STUB = `<script>
(function () {
  'use strict';

  // ---- Data sensor demo (nilai sehat, semua dalam rentang aman) ----
  var DEMO = { ph: 7.2, temperature: 37.4, turbidity: 0.3, tds: 180, chlorine: 0.3 };

  function snap(val) {
    return {
      val: function () { return val; },
      exists: function () { return val !== null && val !== undefined; },
      forEach: function () {},
      data: function () { return val; }
    };
  }

  function ref(pathStr) {
    var api = {
      on: function (evt, cb) {
        if (typeof cb !== 'function') return api;
        if (String(pathStr).indexOf('.info/connected') !== -1) cb(snap(true));
        else if (String(pathStr).indexOf('sensors') !== -1) cb(snap(DEMO));
        else cb(snap(null));
        return api;
      },
      once: function () { 
        var v = String(pathStr).indexOf('sensors') !== -1 ? DEMO : null;
        return Promise.resolve(snap(v)); 
      },
      off: function () { return api; },
      set: function () { return Promise.resolve(); },
      update: function () { return Promise.resolve(); },
      remove: function () { return Promise.resolve(); },
      push: function () { return Promise.resolve({ key: 'demo' }); },
      child: function (c) { return ref(pathStr + '/' + c); },
      orderByChild: function () { return api; },
      limitToLast: function () { return api; },
      equalTo: function () { return api; }
    };
    return api;
  }

  var USER = {
    uid: 'mockup-demo-uid',
    email: 'demo@aquaviv.app',
    displayName: 'Demo',
    emailVerified: true
  };

  function docApi() {
    var d = {
      get: function () {
        return Promise.resolve({
          exists: true,
          data: function () { return { role: 'free', plan: 'free', displayName: 'Demo' }; }
        });
      },
      set: function () { return Promise.resolve(); },
      update: function () { return Promise.resolve(); },
      delete: function () { return Promise.resolve(); },
      collection: function () { return collApi(); },
      onSnapshot: function () { return function () {}; }
    };
    return d;
  }

  function collApi() {
    var c = {
      doc: function () { return docApi(); },
      add: function () { return Promise.resolve({ id: 'demo' }); },
      get: function () { return Promise.resolve({ empty: true, docs: [], forEach: function () {} }); },
      where: function () { return c; },
      orderBy: function () { return c; },
      limit: function () { return c; },
      onSnapshot: function () { return function () {}; }
    };
    return c;
  }

  // SIGNED_IN = false dipakai untuk halaman PUBLIK (mis. login.html): SDK
  // harus tetap merespons agar overlay "Memeriksa sesi..." hilang, namun user
  // bernilai null supaya halaman tidak me-redirect ke dashboard.
  var SIGNED_IN = window.__AQUAVIV_SIGNED_IN__ !== false;

  var authApi = {
    onAuthStateChanged: function (cb) {
      // Panggil segera: user demo (halaman ber-gate) atau null (halaman publik).
      if (typeof cb === 'function') {
        setTimeout(function () { cb(SIGNED_IN ? USER : null); }, 0);
      }
      return function () {};
    },
    setPersistence: function () { return Promise.resolve(); },
    signOut: function () { return Promise.resolve(); },
    sendPasswordResetEmail: function () { return Promise.resolve(); },
    signInWithEmailAndPassword: function () { return Promise.resolve({ user: USER }); },
    createUserWithEmailAndPassword: function () { return Promise.resolve({ user: USER }); },
    currentUser: SIGNED_IN ? USER : null
  };
  authApi.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };

  function firestoreFn() {
    return { collection: function () { return collApi(); }, doc: function () { return docApi(); } };
  }
  firestoreFn.FieldValue = {
    serverTimestamp: function () { return new Date(); },
    increment: function (n) { return n; },
    arrayUnion: function () { return []; },
    delete: function () { return null; }
  };
  firestoreFn.Timestamp = { now: function () { return { toDate: function () { return new Date(); } }; } };

  window.firebase = {
    initializeApp: function () { return {}; },
    app: function () { return {}; },
    apps: [{}],
    auth: function () { return authApi; },
    database: function () { return { ref: ref }; },
    firestore: firestoreFn,
    messaging: function () {
      return {
        getToken: function () { return Promise.resolve('demo-token'); },
        onMessage: function () {},
        requestPermission: function () { return Promise.resolve(); }
      };
    }
  };
  window.firebase.auth.Auth = authApi.Auth;

  // Tandai mode mockup agar mudah dikenali bila perlu.
  window.__AQUAVIV_MOCKUP__ = true;
})();
</script>`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/**
 * Probe audit layout: dijalankan setelah halaman selesai memuat, menulis hasil
 * pengukuran ke document.title agar terbaca lewat --dump-dom.
 * Disuntikkan hanya bila request memuat ?__audit=1.
 */
const AUDIT_PROBE_PATH = path.join(__dirname, 'audit-probe.js');

function auditProbeTag() {
  if (!fs.existsSync(AUDIT_PROBE_PATH)) return '';
  const js = fs.readFileSync(AUDIT_PROBE_PATH, 'utf8');
  return `<script>window.addEventListener('load',function(){setTimeout(function(){\n${js}\n},1200);});</script>`;
}

const server = http.createServer((req, res) => {
  // Buang query/hash, cegah path traversal.
  const rawUrl = req.url;
  const isAudit = /[?&]__audit=1/.test(rawUrl);
  let rel = decodeURIComponent(rawUrl.split('?')[0].split('#')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';

  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(abs, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + rel);
      return;
    }
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';

    // Untuk halaman ber-gate auth (app.html / account.html / admin.html),
    // sisipkan STUB Firebase sebelum script apa pun berjalan supaya halaman
    // tidak me-redirect ke /login.html saat dirender headless. Stub ini hanya
    // aktif pada request dari pipeline mockup dan TIDAK mengubah file produksi.
    // Halaman PUBLIK tetap perlu stub Firebase (agar overlay "Memeriksa sesi..."
    // hilang), tetapi dengan user NULL supaya login.html tidak me-redirect ke
    // /app.html. Halaman ber-gate auth memakai user demo agar lolos gate.
    const PUBLIC_PAGES = ['/index.html', '/login.html', '/help.html', '/404.html'];
    const isPublic = PUBLIC_PAGES.includes(rel);

    if (type.startsWith('text/html') && (MOCK_AUTH || isAudit)) {
      let html = buf.toString('utf8');
      if (MOCK_AUTH) {
        const flag = isPublic
          ? '<script>window.__AQUAVIV_SIGNED_IN__=false;</script>\n'
          : '';
        html = html.replace(/<head([^>]*)>/i, `<head$1>\n${flag}${STUB}`);
      }
      if (isAudit) html = html.replace(/<\/body>/i, `${auditProbeTag()}\n</body>`);
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }

    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('mockup server siap di http://127.0.0.1:' + PORT + ' (root: ' + ROOT + ')');
});
