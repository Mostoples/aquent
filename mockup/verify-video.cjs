/* =====================================================
   AQUAVIV — verifikasi video showcase
   Memastikan MP4 hasil render benar-benar valid dan UI-nya BERGERAK
   (bukan rangkaian gambar statis).

   Yang diperiksa:
     1. Metadata: codec, resolusi, fps, durasi (via ffprobe).
     2. Gerakan: ambil sampel frame di beberapa titik waktu, hitung
        selisih piksel antar sampel. Video statis -> selisih ~0.
     3. Tidak ada frame kosong/hitam.

   Jalankan:  node mockup/verify-video.cjs
   ===================================================== */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MP4 = path.join(__dirname, 'video', 'aquaviv-showcase.mp4');
const TMP = path.join(__dirname, '.vtest');

if (!fs.existsSync(MP4)) {
  console.error('Video tidak ditemukan: ' + MP4);
  process.exit(1);
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

// ---------- 1) Metadata ----------
const probe = execFileSync(
  'ffprobe',
  ['-v', 'error', '-select_streams', 'v:0',
   '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt',
   '-show_entries', 'format=duration,size',
   '-of', 'default=noprint_wrappers=1', MP4],
  { encoding: 'utf8' }
);
const meta = {};
probe.split('\n').forEach((l) => {
  const [k, v] = l.split('=');
  if (k && v !== undefined) meta[k.trim()] = v.trim();
});

console.log('=== METADATA ===');
console.log(`  codec     : ${meta.codec_name}`);
console.log(`  resolusi  : ${meta.width}x${meta.height}`);
console.log(`  pix_fmt   : ${meta.pix_fmt}`);
console.log(`  fps       : ${meta.r_frame_rate}`);
console.log(`  frame     : ${meta.nb_frames}`);
console.log(`  durasi    : ${parseFloat(meta.duration).toFixed(2)} s`);
console.log(`  ukuran    : ${(parseInt(meta.size, 10) / 1024).toFixed(0)} KB`);

const dur = parseFloat(meta.duration);

// ---------- 2) Sampel frame ----------
// Ambil 12 sampel merata sepanjang video.
const N = 12;
const times = [];
for (let i = 0; i < N; i++) times.push(+(dur * (i + 0.5) / N).toFixed(2));

function grab(t, idx) {
  const f = path.join(TMP, 's' + String(idx).padStart(2, '0') + '.png');
  execFileSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-ss', String(t), '-i', MP4, '-frames:v', '1', f],
    { stdio: 'ignore', timeout: 60000 }
  );
  return fs.existsSync(f) ? f : null;
}

/** Piksel grayscale kecil dari area layar device. */
function pixels(file) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-vf', 'crop=420:900:150:90,scale=48:96,format=gray',
     '-f', 'rawvideo', 'pipe:1'],
    { maxBuffer: 32 * 1024 * 1024 }
  );
}

function stats(buf) {
  let sum = 0;
  for (const b of buf) sum += b;
  const avg = sum / buf.length;
  let v = 0;
  for (const b of buf) v += (b - avg) ** 2;
  return { avg, sd: Math.sqrt(v / buf.length) };
}

console.log('\n=== SAMPEL FRAME ===');
const samples = [];
for (let i = 0; i < times.length; i++) {
  const f = grab(times[i], i);
  if (!f) { console.log(`  t=${times[i]}s  GAGAL diambil`); continue; }
  const px = pixels(f);
  const st = stats(px);
  samples.push({ t: times[i], px, ...st });
  console.log(`  t=${String(times[i]).padStart(5)}s  avg=${st.avg.toFixed(1).padStart(6)}  stddev=${st.sd.toFixed(1).padStart(6)}`);
}

// ---------- 3) Analisis gerakan ----------
let moved = 0;
let totalDiff = 0;
console.log('\n=== GERAKAN ANTAR SAMPEL ===');
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1].px;
  const b = samples[i].px;
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let k = 0; k < n; k++) s += Math.abs(a[k] - b[k]);
  const d = s / n;
  totalDiff += d;
  if (d > 1.5) moved++;
  console.log(`  ${String(samples[i - 1].t).padStart(5)}s -> ${String(samples[i].t).padStart(5)}s : ${d.toFixed(2)}`);
}

const avgDiff = totalDiff / Math.max(1, samples.length - 1);
const blank = samples.filter((s) => s.sd < 3).length;

console.log('\n=== KESIMPULAN ===');
console.log(`  rata-rata perubahan : ${avgDiff.toFixed(2)}`);
console.log(`  transisi bergerak   : ${moved}/${samples.length - 1}`);
console.log(`  frame nyaris kosong : ${blank}/${samples.length}`);

const ok =
  meta.codec_name === 'h264' &&
  meta.pix_fmt === 'yuv420p' &&
  Number(meta.width) === 1920 &&
  Number(meta.height) === 1080 &&
  dur > 8 &&
  avgDiff > 1.5 &&
  blank === 0;

console.log('\n' + (ok
  ? 'LULUS: video valid, UI bergerak/scroll, tidak ada frame kosong.'
  : 'PERIKSA: ada kriteria yang belum terpenuhi.'));

fs.rmSync(TMP, { recursive: true, force: true });
if (!ok) process.exitCode = 1;
