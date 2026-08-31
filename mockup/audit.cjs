/* =====================================================
   AQUAVIV — audit layout mobile
   Mengukur masalah layout nyata pada viewport Android (412px) dengan
   menyuntikkan probe ke halaman via Chrome headless --dump-dom.

   Yang diukur per halaman:
     - horizontal overflow (scrollWidth > clientWidth)
     - elemen yang melebar melewati viewport (penyebab overflow)
     - teks terlalu kecil (< 12px)
     - target sentuh < 44x44 px (pedoman aksesibilitas)

   Prasyarat: mockup/serve.cjs berjalan dengan MOCK_AUTH=1.
   Jalankan:  node mockup/audit.cjs
   ===================================================== */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const VW = 412;
const VH = 915;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
function findChrome() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  throw new Error('Chrome/Edge tidak ditemukan');
}

const PAGES = [
  { slug: '01-landing', url: '/index.html', wait: 9000 },
  { slug: '02-login', url: '/login.html', wait: 7000 },
  { slug: '03-dashboard', url: '/app.html', wait: 14000 },
  { slug: '04-account', url: '/account.html', wait: 11000 },
  { slug: '05-help', url: '/help.html', wait: 7000 },
];

/**
 * Perbaikan aksesibilitas dipasang di dalam @media (pointer: coarse), sehingga
 * audit HARUS mengemulasi perangkat sentuh agar aturan tersebut ikut aktif.
 * --touch-events + --enable-features=TouchpadAndWheelScrollLatching membuat
 * Chrome melaporkan pointer kasar seperti ponsel sungguhan.
 */
const TOUCH_FLAGS = ['--touch-events=enabled'];

/**
 * Probe dijalankan di dalam halaman. Hasil ditulis ke <title> sebagai JSON
 * agar mudah diambil dari --dump-dom tanpa perlu CDP/puppeteer.
 */
const PROBE = `
(function () {
  function sel(el) {
    if (!el || el === document.body) return 'body';
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      var c = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
      if (c) s += '.' + c;
    }
    return s;
  }

  var docW = document.documentElement.clientWidth;
  var res = {
    viewport: docW,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body ? document.body.scrollWidth : 0,
    overflowPx: Math.max(0, document.documentElement.scrollWidth - docW),
    wideEls: [],
    smallText: [],
    smallTaps: []
  };

  var all = document.querySelectorAll('*');
  var seenWide = {}, seenText = {}, seenTap = {};

  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    // 1) Elemen melewati batas kanan viewport.
    if (r.right > docW + 1.5 && r.width > 24) {
      var k = sel(el);
      if (!seenWide[k]) {
        seenWide[k] = 1;
        res.wideEls.push({ el: k, right: Math.round(r.right), w: Math.round(r.width) });
      }
    }

    // 2) Teks terlalu kecil (hanya elemen yang memang punya teks langsung).
    var hasText = false;
    for (var n = 0; n < el.childNodes.length; n++) {
      var cn = el.childNodes[n];
      if (cn.nodeType === 3 && cn.textContent.trim().length > 1) { hasText = true; break; }
    }
    if (hasText) {
      var fs2 = parseFloat(cs.fontSize);
      if (fs2 && fs2 < 12) {
        var k2 = sel(el) + '@' + fs2;
        if (!seenText[k2]) {
          seenText[k2] = 1;
          res.smallText.push({ el: sel(el), px: +fs2.toFixed(1) });
        }
      }
    }

    // 3) Target sentuh terlalu kecil.
    var tag = el.tagName.toLowerCase();
    var clickable = tag === 'button' || tag === 'a' || tag === 'select' ||
      (tag === 'input' && ['button','submit','checkbox','radio'].indexOf(el.type) !== -1) ||
      el.hasAttribute('onclick') || cs.cursor === 'pointer';
    if (clickable && r.width > 0 && (r.width < 44 || r.height < 44)) {
      var k3 = sel(el);
      if (!seenTap[k3]) {
        seenTap[k3] = 1;
        res.smallTaps.push({ el: k3, w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
  }

  res.wideEls = res.wideEls.slice(0, 12);
  res.smallText = res.smallText.slice(0, 12);
  res.smallTaps = res.smallTaps.slice(0, 12);

  document.title = 'AUDIT::' + JSON.stringify(res);
})();
`;

function audit(chrome, page) {
  // PENTING: Chrome headless di Windows punya lebar jendela minimum (~500px),
  // sehingga --window-size=412 diabaikan dan halaman dirender pada ~512px.
  // Karena itu halaman dimuat di dalam iframe berlebar TEPAT 412px lewat
  // shot-wrapper.html; iframe punya viewport sendiri sehingga media query &
  // layout mobile terpicu pada lebar yang benar.
  const inner = encodeURIComponent(page.url + '?__audit=1');
  const url = `${BASE}/mockup/shot-wrapper.html?page=${inner}&w=${VW}&h=${VH}`;

  const dom = execFileSync(
    chrome,
    [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      ...TOUCH_FLAGS,
      '--window-size=1400,1000',
      `--virtual-time-budget=${page.wait + 4000}`,
      '--dump-dom', url,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64, timeout: 180000, stdio: ['ignore','pipe','ignore'] }
  );

  const m = dom.match(/AUDIT::(\{[\s\S]*?\})<\/title>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function main() {
  const chrome = findChrome();
  console.log(`Audit layout mobile @ ${VW}x${VH}\n`);

  const report = {};
  for (const p of PAGES) {
    process.stdout.write('audit ' + p.slug.padEnd(14));
    const r = audit(chrome, p);
    if (!r) { console.log('GAGAL (probe tidak terbaca)'); continue; }
    report[p.slug] = r;
    const flag = r.overflowPx > 0 ? `OVERFLOW +${r.overflowPx}px` : 'no-overflow';
    console.log(`${flag}  wide=${r.wideEls.length} smallText=${r.smallText.length} smallTap=${r.smallTaps.length}`);
  }

  console.log('\n' + '='.repeat(66));
  for (const [slug, r] of Object.entries(report)) {
    console.log('\n### ' + slug);
    console.log(`  viewport=${r.viewport}  scrollWidth=${r.scrollW}  overflow=+${r.overflowPx}px`);
    if (r.wideEls.length) {
      console.log('  -- elemen melewati viewport:');
      r.wideEls.forEach((e) => console.log(`     ${e.el}  w=${e.w}  right=${e.right}`));
    }
    if (r.smallText.length) {
      console.log('  -- teks < 12px:');
      r.smallText.forEach((e) => console.log(`     ${e.el}  ${e.px}px`));
    }
    if (r.smallTaps.length) {
      console.log('  -- target sentuh < 44px:');
      r.smallTaps.forEach((e) => console.log(`     ${e.el}  ${e.w}x${e.h}`));
    }
  }

  fs.writeFileSync(path.join(__dirname, 'audit-report.json'), JSON.stringify(report, null, 2));
  console.log('\nLaporan -> mockup/audit-report.json');
}

main();
