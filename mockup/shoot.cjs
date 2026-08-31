/* =====================================================
   AQUAVIV — screenshot runner (Chrome headless)
   Merender tiap halaman pada viewport Android PRESISI 412x915, lalu menyimpan
   PNG @2x ke mockup/raw/.

   CATATAN TEKNIS (penting):
   Chrome headless di Windows mengabaikan --window-size bernilai kecil; jendela
   punya lebar minimum (~500px), sehingga permintaan 412px sebelumnya menghasilkan
   render pada 512px dan layout mobile tampak salah. Solusinya: halaman dimuat di
   dalam <iframe> berlebar TEPAT 412px (mockup/shot-wrapper.html) di jendela besar,
   lalu hasil tangkapan di-CROP ke 412x915 dengan ffmpeg. Iframe punya viewport
   sendiri sehingga media query & layout mobile terpicu pada lebar yang benar.

   Prasyarat: mockup/serve.cjs berjalan dengan MOCK_AUTH=1, ffmpeg tersedia.
   Jalankan:  node mockup/shoot.cjs
   ===================================================== */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(__dirname, 'raw');
const TMP = path.join(__dirname, '.tmp');

// Viewport Android referensi (Pixel 5/6 kelas menengah).
const VW = 412;
const VH = 915;
const SCALE = 2; // -> hasil akhir 824 x 1830

// Jendela pembungkus harus lebih besar dari lebar minimum Chrome.
const WIN_W = 1400;
const WIN_H = 1100;

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
  { slug: '01-landing', url: '/index.html', wait: 10000, label: 'Landing' },
  { slug: '02-login', url: '/login.html', wait: 8000, label: 'Login' },
  { slug: '03-dashboard', url: '/app.html', wait: 15000, label: 'Dashboard' },
  { slug: '04-account', url: '/account.html', wait: 12000, label: 'Akun & Privasi' },
  { slug: '05-help', url: '/help.html', wait: 8000, label: 'Bantuan & FAQ' },
];

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

function shoot(chrome, page) {
  const tmpFile = path.join(TMP, page.slug + '-wide.png');
  const outFile = path.join(OUT, page.slug + '.png');
  for (const f of [tmpFile, outFile]) if (fs.existsSync(f)) fs.unlinkSync(f);

  const inner = encodeURIComponent(page.url);
  const url = `${BASE}/mockup/shot-wrapper.html?page=${inner}&w=${VW}&h=${VH}`;

  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--force-device-scale-factor=${SCALE}`,
      `--window-size=${WIN_W},${WIN_H}`,
      `--virtual-time-budget=${page.wait + 3000}`,
      `--screenshot=${tmpFile}`,
      url,
    ],
    { stdio: 'ignore', timeout: 180000 }
  );
  if (!fs.existsSync(tmpFile)) throw new Error('tangkapan gagal');

  // Crop presisi area iframe (kiri-atas) ke ukuran device @SCALE.
  const cw = VW * SCALE;
  const ch = VH * SCALE;
  execFileSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-i', tmpFile, '-vf', `crop=${cw}:${ch}:0:0`, outFile],
    { stdio: 'ignore', timeout: 120000 }
  );
  if (!fs.existsSync(outFile)) throw new Error('crop gagal');

  fs.unlinkSync(tmpFile);
  return pngSize(outFile);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  const chrome = findChrome();
  console.log('Chrome  : ' + chrome);
  console.log(`Viewport: ${VW}x${VH} @${SCALE}x  ->  ${VW * SCALE}x${VH * SCALE}`);
  console.log(`Metode  : iframe presisi di jendela ${WIN_W}x${WIN_H} + crop ffmpeg\n`);

  const results = [];
  for (const page of PAGES) {
    process.stdout.write('render ' + page.slug.padEnd(14));
    try {
      const r = shoot(chrome, page);
      const okSize = r.w === VW * SCALE && r.h === VH * SCALE;
      console.log(`OK   ${r.w}x${r.h}  ${(r.bytes / 1024).toFixed(0)} KB` + (okSize ? '' : '  <- ukuran tak sesuai'));
      results.push({ ...page, ...r, ok: okSize });
    } catch (e) {
      console.log('GAGAL  ' + String(e.message).split('\n')[0]);
      results.push({ ...page, ok: false, error: e.message });
    }
  }

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} halaman berhasil dirender -> mockup/raw/`);

  fs.writeFileSync(
    path.join(OUT, 'manifest.json'),
    JSON.stringify(
      results.map((r) => ({
        slug: r.slug, label: r.label, url: r.url,
        ok: r.ok, w: r.w || null, h: r.h || null,
      })),
      null, 2
    )
  );
  if (ok !== results.length) process.exitCode = 1;
}

main();
