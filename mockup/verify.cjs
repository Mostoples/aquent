/* =====================================================
   AQUAVIV — verifikasi mockup
   Mengecek tiap PNG hasil benar-benar memuat konten visual (bukan layar
   kosong/hitam). Verifikasi dilakukan pada SCREENSHOT MENTAH (mockup/raw/),
   yaitu area layar murni tanpa bezel/latar dekoratif, sehingga statistiknya
   mencerminkan konten aplikasi — bukan bingkai.

   Ambang dipilih longgar namun cukup untuk membedakan halaman bertema gelap
   yang berisi konten (stddev > 6, gradasi > 30) dari layar kosong
   (stddev ~0, gradasi < 5).

   Jalankan:  node mockup/verify.cjs
   ===================================================== */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, 'raw');
const OUT = path.join(__dirname, 'out');
const W = 96;
const H = 208;

function stats(file, w, h) {
  const buf = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', 'pipe:1'],
    { maxBuffer: 1024 * 1024 * 64 }
  );
  if (!buf.length) return null;

  let sum = 0;
  for (const b of buf) sum += b;
  const avg = sum / buf.length;

  let varSum = 0;
  for (const b of buf) varSum += (b - avg) ** 2;
  const sd = Math.sqrt(varSum / buf.length);

  return { avg, sd, uniq: new Set(buf).size };
}

function report(title, dir, w, h) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  if (!files.length) return { total: 0, bad: 0 };

  console.log('\n' + title);
  console.log('berkas'.padEnd(26) + 'avg'.padStart(7) + 'stddev'.padStart(9) + 'shades'.padStart(8) + '   status');
  console.log('-'.repeat(62));

  let bad = 0;
  for (const f of files) {
    const s = stats(path.join(dir, f), w, h);
    if (!s) {
      console.log(f.padEnd(26) + '  (gagal dibaca)');
      bad++;
      continue;
    }
    // Layar kosong/hitam solid -> stddev mendekati 0 dan gradasi sangat sedikit.
    const ok = s.sd > 6 && s.uniq > 30;
    if (!ok) bad++;
    console.log(
      f.padEnd(26) +
        s.avg.toFixed(1).padStart(7) +
        s.sd.toFixed(1).padStart(9) +
        String(s.uniq).padStart(8) +
        '   ' + (ok ? 'OK' : 'PERIKSA')
    );
  }
  console.log('-'.repeat(62));
  console.log(`${files.length - bad}/${files.length} memuat konten visual`);
  return { total: files.length, bad };
}

function main() {
  // Utama: screenshot mentah = area layar aplikasi murni.
  const raw = report('== SCREENSHOT MENTAH (area layar aplikasi) ==', RAW, W, H);
  // Sekunder: hasil komposit berbingkai.
  const out = report('== MOCKUP BERBINGKAI (komposit) ==', OUT, 128, 96);

  const bad = raw.bad + out.bad;
  console.log(`\nTOTAL: ${raw.total + out.total - bad}/${raw.total + out.total} berkas lolos`);
  if (bad) process.exitCode = 1;
}

main();
