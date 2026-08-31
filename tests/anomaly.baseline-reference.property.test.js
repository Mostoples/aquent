// =====================================================
// AQUENT — Anomaly_Detector baseline property test
// Spec: advanced-features-upgrade — Task 6.2
// =====================================================
//
// Feature: advanced-features-upgrade, Property 6: Baseline cocok dengan statistik rujukan
//
// Property 6 (design.md):
//   "Untuk setiap window numerik, computeBaseline() menghasilkan `mean` yang
//    sama dengan rata-rata aritmetika window dan `std` yang sama dengan deviasi
//    standar window (dalam batas epsilon) terhadap implementasi rujukan
//    independen."
//
// computeBaseline() memakai deviasi standar POPULASI (÷N) atas Historical_Window
// 7 hari, mengecualikan pembacaan tak-valid fisik, dan memakai ANOMALY_MIN_STD
// saat window konstan (σ = 0). Property ini menguji bahwa untuk window yang
// SELURUH nilainya valid secara fisik dan berada DALAM jendela 7 hari, mean &
// std cocok dengan perhitungan rujukan independen.
//
// Validates: Requirements 2.1

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';

// Muat config lebih dulu agar AquaAnomaly membaca ANOMALY_MIN_STD dari
// AquaConfig (lazy via globalThis); fallback terdokumentasi juga 0.01.
const AquaConfig = loadModule('config.js', 'AquaConfig');
const AquaAnomaly = loadModule('anomaly.js', 'AquaAnomaly');

const MIN_STD = AquaConfig.ANOMALY_MIN_STD; // 0.01 (R2.2)
const MS_PER_DAY = 86400000;
const WINDOW_MS = 7 * MS_PER_DAY;

// thresholds.json (single source of truth) — kunci kanonik + rentang aman.
// computeBaseline memerlukan parameter dikenal di TH agar lolos cek validitas.
const TH = {
  ph: { min: 6.5, max: 8.5 },
  temp: { min: 33, max: 40 },
  turbidity: { min: 0, max: 1 },
  tds: { min: 0, max: 300 },
  chlorine: { min: 0.1, max: 0.5 },
};

// Rentang FISIK plausibel per parameter (mirror PHYSICAL_LIMITS di anomaly.js).
// Nilai dibangkitkan DALAM rentang ini sehingga seluruhnya valid secara fisik
// dan tidak ada yang dikecualikan dari baseline → window rujukan = semua nilai.
const PARAM_RANGES = {
  ph: { min: 0, max: 14 },
  temperature: { min: 0, max: 100 },
  turbidity: { min: 0, max: 4000 },
  tds: { min: 0, max: 5000 },
  chlorine: { min: 0, max: 10 },
};

// ----- Implementasi RUJUKAN independen (dua-lintasan, std populasi) -----

function refMean(values) {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function refPopulationStd(values, mean) {
  let sq = 0;
  for (const v of values) {
    const d = v - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / values.length);
}

// Kesetaraan numerik dengan toleransi relatif+absolut. Karena rujukan memakai
// algoritma dua-lintasan yang sama, selisih seharusnya mendekati epsilon mesin.
function approxEqual(a, b, relEps = 1e-9, absEps = 1e-9) {
  return Math.abs(a - b) <= Math.max(absEps, relEps * Math.max(Math.abs(a), Math.abs(b)));
}

// Generator pintar: pilih satu parameter, lalu window 1..60 nilai DALAM rentang
// fisiknya (semuanya valid → tidak ada eksklusi). Mencakup nilai batas (0,
// min/max) sehingga jalur statistik teruji lintas seluruh ruang masukan.
const numericWindowArb = fc.constantFrom(...Object.keys(PARAM_RANGES)).chain((param) => {
  const r = PARAM_RANGES[param];
  return fc.record({
    param: fc.constant(param),
    values: fc.array(
      fc.double({ min: r.min, max: r.max, noNaN: true, noDefaultInfinity: true }),
      { minLength: 1, maxLength: 60 }
    ),
  });
});

// Generator untuk jalur OBJEK SensorReading + stempel waktu, seluruh ts berada
// dalam jendela 7 hari (offset 0..WINDOW_MS dari anchor) sehingga semua nilai
// masuk window → window rujukan = semua nilai.
const tsWindowArb = fc.constantFrom(...Object.keys(PARAM_RANGES)).chain((param) => {
  const r = PARAM_RANGES[param];
  return fc.record({
    param: fc.constant(param),
    anchor: fc.integer({ min: 1_600_000_000_000, max: 1_800_000_000_000 }),
    points: fc.array(
      fc.record({
        value: fc.double({ min: r.min, max: r.max, noNaN: true, noDefaultInfinity: true }),
        offset: fc.integer({ min: 0, max: WINDOW_MS }),
      }),
      { minLength: 1, maxLength: 40 }
    ),
  });
});

function makeReading(param, value, ts) {
  // Untuk 'temperature', readParamValue membaca reading.temperature; untuk
  // parameter lain kunci langsung. Set reading[param] memenuhi keduanya.
  const reading = { ts };
  reading[param] = value;
  return reading;
}

describe('Property 6: Baseline cocok dengan statistik rujukan (R2.1)', () => {
  it('mean & std (populasi) cocok dengan rujukan untuk window numerik valid', () => {
    fc.assert(
      fc.property(numericWindowArb, ({ param, values }) => {
        const baseline = AquaAnomaly.computeBaseline(values, param, TH);

        // Seluruh nilai valid fisik → tidak ada yang dibuang.
        expect(baseline.count).toBe(values.length);

        const expectedMean = refMean(values);
        const refStd = refPopulationStd(values, expectedMean);
        // Window konstan (refStd === 0) → impl memakai ANOMALY_MIN_STD (R2.2).
        const expectedStd = refStd > 0 ? refStd : MIN_STD;

        expect(approxEqual(baseline.mean, expectedMean)).toBe(true);
        expect(approxEqual(baseline.std, expectedStd)).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  it('mean & std cocok dengan rujukan untuk SensorReading + ts dalam jendela 7 hari', () => {
    fc.assert(
      fc.property(tsWindowArb, ({ param, anchor, points }) => {
        const history = points.map((p) => makeReading(param, p.value, anchor + p.offset));
        const values = points.map((p) => p.value);

        const baseline = AquaAnomaly.computeBaseline(history, param, TH);

        // Semua ts dalam jendela 7 hari → seluruh nilai dipakai.
        expect(baseline.count).toBe(values.length);

        const expectedMean = refMean(values);
        const refStd = refPopulationStd(values, expectedMean);
        const expectedStd = refStd > 0 ? refStd : MIN_STD;

        expect(approxEqual(baseline.mean, expectedMean)).toBe(true);
        expect(approxEqual(baseline.std, expectedStd)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('contoh terhitung-tangan: [2,4,4,4,5,5,7,9] → mean 5, std populasi 2', () => {
    // Sanity check deterministik untuk meng-anchor implementasi rujukan.
    const baseline = AquaAnomaly.computeBaseline([2, 4, 4, 4, 5, 5, 7, 9], 'ph', TH);
    expect(baseline.count).toBe(8);
    expect(approxEqual(baseline.mean, 5)).toBe(true);
    expect(approxEqual(baseline.std, 2)).toBe(true);
  });
});
