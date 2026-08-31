/* =====================================================
   AQUAVIV — renderer video showcase
   Membuat MP4 dengan UI yang men-SCROLL di dalam bingkai smartphone Android.

   Alur:
     1. Untuk setiap halaman, gambar tinggi dari mockup/tall/ digeser ke atas
        (efek scroll) di dalam bingkai device pseudo-3D.
     2. Tiap frame dirender Chrome headless ke PNG (mockup/.frames/).
     3. ffmpeg menyusun seluruh frame menjadi MP4 (H.264, yuv420p).

   Scene per halaman: fade-in -> tahan -> scroll turun -> tahan -> fade-out,
   dengan easing agar gerakan terasa halus (bukan linear kaku).

   Prasyarat: serve.cjs berjalan, ffmpeg tersedia, mockup/tall/ sudah terisi
   (jalankan scroll-shot.cjs lebih dulu).

   Jalankan:  node mockup/video.cjs
   ===================================================== */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8099;
const BASE = `http://127.0.0.1:${PORT}/mockup/video-frame.html`;
const TALL = path.join(__dirname, 'tall');
const FRAMES = path.join(__dirname, '.frames');
const OUT = path.join(__dirname, 'video');

// Kanvas video: Full HD landscape.
const CW = 1920;
const CH = 1080;
const FPS = 30;

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome/Edge tidak ditemukan');

const LABELS = {
  '01-landing': { title: 'Landing', sub: 'Pantau kualitas air mandi secara real-time' },
  '02-login': { title: 'Masuk / Daftar', sub: 'Autentikasi Google atau email' },
  '03-dashboard': { title: 'Dashboard', sub: 'Skor kualitas air & penjelasan XAI' },
  '04-account': { title: 'Akun & Privasi', sub: 'Kendali data sesuai UU PDP & GDPR' },
  '05-help': { title: 'Bantuan & FAQ', sub: 'Panduan lengkap penggunaan' },
};

/** Easing halus (cubic in-out) untuk gerakan scroll & transisi. */
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Susun daftar frame untuk satu halaman.
 * Fase: masuk (fade+zoom) -> tahan -> scroll -> tahan -> keluar (fade).
 */
function buildScene(page) {
  const frames = [];
  const scrollable = page.docH > 915 + 8;

  const fIn = Math.round(FPS * 0.7);          // fade-in
  const hold1 = Math.round(FPS * 1.0);        // tahan di atas
  // Durasi scroll proporsional tinggi halaman (0.9 dtk per layar, 1.6–5 dtk).
  const scrollSec = scrollable
    ? Math.max(1.6, Math.min(5.0, (page.docH / 915) * 0.9))
    : 0;
  const fScroll = Math.round(FPS * scrollSec);
  const hold2 = Math.round(FPS * (scrollable ? 0.8 : 1.2));
  const fOut = Math.round(FPS * 0.5);         // fade-out

  const push = (i, total, phase, opts) => {
    frames.push({ slug: page.slug, phase, ...opts });
  };

  // 1) Masuk: opacity 0->1, sedikit zoom & rotasi mendekat.
  for (let i = 0; i < fIn; i++) {
    const t = easeInOut(clamp01(i / Math.max(1, fIn - 1)));
    push(i, fIn, 'in', {
      opacity: t.toFixed(4),
      pan: 0,
      rotY: (-24 + 8 * t).toFixed(3),
      scale: (0.93 + 0.05 * t).toFixed(4),
    });
  }
  // 2) Tahan di puncak halaman.
  for (let i = 0; i < hold1; i++) {
    push(i, hold1, 'hold1', { opacity: 1, pan: 0, rotY: -16, scale: 0.98 });
  }
  // 3) Scroll: geser konten dari atas ke bawah.
  for (let i = 0; i < fScroll; i++) {
    const t = easeInOut(clamp01(i / Math.max(1, fScroll - 1)));
    push(i, fScroll, 'scroll', {
      opacity: 1,
      pan: t.toFixed(5),
      rotY: (-16 + 3 * t).toFixed(3),
      scale: 0.98,
    });
  }
  // 4) Tahan di bawah.
  for (let i = 0; i < hold2; i++) {
    push(i, hold2, 'hold2', {
      opacity: 1, pan: scrollable ? 1 : 0, rotY: -13, scale: 0.98,
    });
  }
  // 5) Keluar: fade out sambil menjauh sedikit.
  for (let i = 0; i < fOut; i++) {
    const t = easeInOut(clamp01(i / Math.max(1, fOut - 1)));
    push(i, fOut, 'out', {
      opacity: (1 - t).toFixed(4),
      pan: scrollable ? 1 : 0,
      rotY: (-13 - 6 * t).toFixed(3),
      scale: (0.98 - 0.03 * t).toFixed(4),
    });
  }
  return frames;
}

function renderFrame(frame, index) {
  const lab = LABELS[frame.slug] || { title: frame.slug, sub: '' };
  const file = path.join(FRAMES, String(index).padStart(5, '0') + '.png');

  const url = BASE +
    '?shot=' + encodeURIComponent(frame.slug + '.png') +
    '&pan=' + frame.pan +
    '&opacity=' + frame.opacity +
    '&rotY=' + frame.rotY +
    '&scale=' + frame.scale +
    '&title=' + encodeURIComponent(lab.title) +
    '&sub=' + encodeURIComponent(lab.sub);

  execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
     '--no-default-browser-check', '--disable-extensions',
     '--force-device-scale-factor=1',
     `--window-size=${CW},${CH}`,
     '--virtual-time-budget=1200',
     `--screenshot=${file}`, url],
    { stdio: 'ignore', timeout: 60000 }
  );
  if (!fs.existsSync(file)) throw new Error('frame ' + index + ' gagal');
  return file;
}

function main() {
  const manifestPath = path.join(TALL, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('mockup/tall/manifest.json tidak ada — jalankan scroll-shot.cjs dulu');
  }
  const pages = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).filter((p) => p.ok);
  if (!pages.length) throw new Error('tidak ada tangkapan valid');

  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  // Susun seluruh frame dari semua scene.
  const all = [];
  for (const p of pages) all.push(...buildScene(p));

  const totalSec = (all.length / FPS).toFixed(1);
  console.log(`Kanvas : ${CW}x${CH} @ ${FPS}fps`);
  console.log(`Scene  : ${pages.length} halaman`);
  console.log(`Frame  : ${all.length} (~${totalSec} detik)\n`);

  let done = 0;
  const t0 = Date.now();
  for (let i = 0; i < all.length; i++) {
    renderFrame(all[i], i);
    done++;
    if (done % 15 === 0 || done === all.length) {
      const pct = ((done / all.length) * 100).toFixed(0);
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      process.stdout.write(`\r  render frame ${done}/${all.length}  (${pct}%)  ${el}s   `);
    }
  }
  console.log('\n');

  // Susun MP4. yuv420p + faststart agar kompatibel luas (WA, browser, PowerPoint).
  const mp4 = path.join(OUT, 'aquaviv-showcase.mp4');
  if (fs.existsSync(mp4)) fs.unlinkSync(mp4);

  execFileSync(
    'ffmpeg',
    ['-v', 'error', '-y',
     '-framerate', String(FPS),
     '-i', path.join(FRAMES, '%05d.png'),
     '-c:v', 'libx264',
     '-preset', 'slow',
     '-crf', '19',
     '-pix_fmt', 'yuv420p',
     '-movflags', '+faststart',
     mp4],
    { stdio: 'inherit', timeout: 900000 }
  );

  if (!fs.existsSync(mp4)) throw new Error('penyusunan MP4 gagal');
  const kb = (fs.statSync(mp4).size / 1024).toFixed(0);
  console.log(`MP4 dibuat: mockup/video/aquaviv-showcase.mp4  (${kb} KB, ~${totalSec}s)`);

  // Frame mentah dibuang agar tidak memakan ruang.
  fs.rmSync(FRAMES, { recursive: true, force: true });
}

main();
