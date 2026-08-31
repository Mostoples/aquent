/* =====================================================
   AQUAVIV — perekam scroll halaman (tall capture)
   Menangkap SELURUH tinggi halaman pada viewport Android 412px, sehingga
   video showcase dapat men-scroll UI secara mulus (bukan potongan statis).

   Cara kerja:
     1. Halaman dimuat di iframe berlebar 412px (mockup/shot-wrapper.html)
        dengan tinggi iframe disetel = tinggi penuh dokumen.
     2. Chrome menangkap satu gambar tinggi (mis. 412 x 4200).
     3. ffmpeg meng-crop ke lebar device, hasil disimpan ke mockup/tall/.

   Video renderer (video.cjs) kemudian menggeser gambar tinggi ini di dalam
   bingkai device untuk menghasilkan efek scroll.

   Prasyarat: serve.cjs berjalan dengan MOCK_AUTH=1, ffmpeg tersedia.
   Jalankan:  node mockup/scroll-shot.cjs
   ===================================================== */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(__dirname, 'tall');
const TMP = path.join(__dirname, '.tmp');

const VW = 412;          // lebar device (CSS px)
const VH = 915;          // tinggi viewport device
const SCALE = 2;         // faktor skala tangkapan
const MAX_TALL = 6000;   // batas tinggi dokumen yang ditangkap (CSS px)

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome/Edge tidak ditemukan');

const PAGES = [
  { slug: '01-landing', url: '/index.html', wait: 11000 },
  { slug: '02-login', url: '/login.html', wait: 8000 },
  { slug: '03-dashboard', url: '/app.html', wait: 16000 },
  { slug: '04-account', url: '/account.html', wait: 12000 },
  { slug: '05-help', url: '/help.html', wait: 9000 },
];

/** Ukur tinggi penuh dokumen halaman (CSS px) melalui wrapper. */
function measureHeight(page) {
  const url = `${BASE}/mockup/shot-wrapper.html?page=${encodeURIComponent(page.url)}` +
              `&w=${VW}&h=${VH}&measure=1`;
  const dom = execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
     '--no-default-browser-check', '--window-size=1400,1100',
     `--virtual-time-budget=${page.wait}`, '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000, stdio: ['ignore','pipe','ignore'] }
  );
  const m = dom.match(/MEASURE::(\d+)/);
  if (!m) return null;
  return Math.min(MAX_TALL, Math.max(VH, parseInt(m[1], 10)));
}

/** Tangkap halaman penuh dengan tinggi iframe = tinggi dokumen. */
function captureTall(page, docH) {
  const tmp = path.join(TMP, page.slug + '-tallraw.png');
  const out = path.join(OUT, page.slug + '.png');
  for (const f of [tmp, out]) if (fs.existsSync(f)) fs.unlinkSync(f);

  const winH = Math.min(16000, docH + 60);
  const url = `${BASE}/mockup/shot-wrapper.html?page=${encodeURIComponent(page.url)}` +
              `&w=${VW}&h=${docH}`;

  execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
     '--no-default-browser-check', '--disable-extensions',
     `--force-device-scale-factor=${SCALE}`,
     `--window-size=1400,${winH}`,
     `--virtual-time-budget=${page.wait + 4000}`,
     `--screenshot=${tmp}`, url],
    { stdio: 'ignore', timeout: 240000 }
  );
  if (!fs.existsSync(tmp)) throw new Error('tangkapan gagal');

  // Crop ke lebar device x tinggi dokumen (skala @SCALE).
  execFileSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-i', tmp,
     '-vf', `crop=${VW * SCALE}:${docH * SCALE}:0:0`, out],
    { stdio: 'ignore', timeout: 180000 }
  );
  if (!fs.existsSync(out)) throw new Error('crop gagal');
  fs.unlinkSync(tmp);

  const b = fs.readFileSync(out);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  console.log(`Tangkapan penuh (scroll) @ ${VW}px, skala ${SCALE}x\n`);
  const manifest = [];

  for (const p of PAGES) {
    process.stdout.write('ukur   ' + p.slug.padEnd(14));
    let docH;
    try {
      docH = measureHeight(p);
      if (!docH) throw new Error('tinggi tidak terbaca');
      console.log(`tinggi dokumen = ${docH}px`);
    } catch (e) {
      console.log('GAGAL  ' + e.message);
      manifest.push({ slug: p.slug, ok: false });
      continue;
    }

    process.stdout.write('tangkap' + ' ' + p.slug.padEnd(13));
    try {
      const r = captureTall(p, docH);
      console.log(`OK   ${r.w}x${r.h}  ${(r.bytes / 1024).toFixed(0)} KB`);
      manifest.push({
        slug: p.slug, url: p.url, ok: true,
        w: r.w, h: r.h, docH,
        // Berapa "layar" tinggi halaman ini (untuk durasi scroll di video).
        screens: +(docH / VH).toFixed(2),
      });
    } catch (e) {
      console.log('GAGAL  ' + e.message);
      manifest.push({ slug: p.slug, ok: false });
    }
  }

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const ok = manifest.filter((m) => m.ok).length;
  console.log(`\n${ok}/${manifest.length} tangkapan penuh -> mockup/tall/`);
  if (ok !== manifest.length) process.exitCode = 1;
}

main();
