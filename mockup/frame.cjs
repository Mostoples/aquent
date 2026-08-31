/* =====================================================
   AQUAVIV — device frame renderer
   Membungkus setiap screenshot mentah (mockup/raw/*.png) ke dalam bingkai
   device Android, lalu menyimpan hasil siap-pakai ke mockup/out/.

   Menghasilkan 2 varian per halaman:
     *-flat.png  → tegak lurus, cocok untuk Play Store / dokumentasi
     *-3d.png    → pseudo-3D (perspective tilt), cocok untuk hero/pitch

   Prasyarat: mockup/serve.cjs berjalan (MOCK_AUTH tidak wajib untuk tahap ini).
   Jalankan:  node mockup/frame.cjs
   ===================================================== */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8099;
const BASE = `http://127.0.0.1:${PORT}/mockup/frame.html`;
const RAW = path.join(__dirname, 'raw');
const OUT = path.join(__dirname, 'out');

// Kanvas komposit (landscape, cukup lapang untuk device + caption).
const CW = 1600;
const CH = 1200;
const SCALE = 1; // kanvas sudah besar; @1x -> 1600x1200

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  throw new Error('Chrome/Edge tidak ditemukan');
}

const SUBTITLE = 'Smart Shower Water Quality Monitor';

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

function render(chrome, shot, mode, label, outFile) {
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  const url =
    BASE +
    '?shot=' + encodeURIComponent(shot) +
    '&mode=' + encodeURIComponent(mode) +
    '&label=' + encodeURIComponent(label) +
    '&sub=' + encodeURIComponent(SUBTITLE);

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
      `--window-size=${CW},${CH}`,
      '--virtual-time-budget=6000',
      `--screenshot=${outFile}`,
      url,
    ],
    { stdio: 'ignore', timeout: 120000 }
  );

  if (!fs.existsSync(outFile)) throw new Error('frame gagal: ' + path.basename(outFile));
  return pngSize(outFile);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const manifestPath = path.join(RAW, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('mockup/raw/manifest.json tidak ada — jalankan shoot.cjs lebih dulu');
  }
  const pages = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).filter((p) => p.ok);
  if (!pages.length) throw new Error('tidak ada screenshot valid di manifest');

  const chrome = findChrome();
  console.log('Chrome : ' + chrome);
  console.log('Kanvas : ' + CW + 'x' + CH + '\n');

  let ok = 0;
  let total = 0;

  for (const p of pages) {
    for (const mode of ['flat', 'tilt']) {
      total++;
      const suffix = mode === 'tilt' ? '3d' : 'flat';
      const name = `${p.slug}-${suffix}.png`;
      process.stdout.write(name.padEnd(26));
      try {
        const r = render(chrome, p.slug + '.png', mode, p.label, path.join(OUT, name));
        console.log(`OK   ${r.w}x${r.h}  ${(r.bytes / 1024).toFixed(0)} KB`);
        ok++;
      } catch (e) {
        console.log('GAGAL  ' + e.message);
      }
    }
  }

  console.log(`\n${ok}/${total} mockup dibuat -> mockup/out/`);
  if (ok !== total) process.exitCode = 1;
}

main();
