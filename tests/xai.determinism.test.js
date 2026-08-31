// =====================================================
// AQUENT — XAI determinism property test
// =====================================================
// Feature: advanced-features-upgrade, Property 62: Determinisme atribusi XAI untuk masukan identik
//
// Property 62 (Requirement 11.7): AquaXAI.attributeScore() menghasilkan
// atribusi faktor yang DETERMINISTIK untuk Sensor_Reading yang identik —
// memanggilnya dua kali dengan masukan yang sama menghasilkan keluaran yang
// sama persis (tidak ada keacakan pada jalur produksi).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';

const AquaXAI = loadModule('xai.js', 'AquaXAI');

// thresholds.json (single source of truth) — bobot & rentang parameter skor.
const TH = {
  ph: { min: 6.5, max: 8.5, optimal_min: 6.5, optimal_max: 7.5, weight_xai: 0.35, unit: 'pH' },
  temp: { min: 33, max: 40, optimal_min: 36, optimal_max: 38, weight_xai: 0.35, unit: '°C' },
  turbidity: { min: 0, max: 1, optimal_min: 0, optimal_max: 0.5, weight_xai: 0.3, unit: 'NTU' },
  tds: { min: 0, max: 300, optimal_min: 50, optimal_max: 200, weight_xai: 0.0, unit: 'ppm' },
  chlorine: { min: 0.1, max: 0.5, optimal_min: 0.2, optimal_max: 0.4, weight_xai: 0.0, unit: 'mg/L' },
};

// Smart generator: Sensor_Reading yang melingkupi seluruh ruang masukan yang
// relevan — di bawah, di dalam, dan di atas rentang aman tiap parameter, plus
// nilai nol (valid) dan nilai ekstrem. Rentang sengaja diperluas melewati batas
// fisik agar jalur peluruhan skor (di luar rentang aman) ikut teruji.
const readingArb = fc.record({
  ph: fc.double({ min: 0, max: 14, noNaN: true }),
  temperature: fc.double({ min: 0, max: 60, noNaN: true }),
  turbidity: fc.double({ min: 0, max: 5, noNaN: true }),
  // Disertakan untuk realisme reading; tidak memengaruhi attributeScore (bobot 0%).
  tds: fc.double({ min: 0, max: 600, noNaN: true }),
  chlorine: fc.double({ min: 0, max: 2, noNaN: true }),
});

describe('Property 62: Determinisme atribusi XAI untuk masukan identik (R11.7)', () => {
  it('attributeScore() menghasilkan keluaran identik untuk masukan yang sama', () => {
    fc.assert(
      fc.property(readingArb, (reading) => {
        // Dua salinan masukan yang setara secara struktural namun objek terpisah,
        // memastikan determinisme berdasar NILAI (bukan identitas referensi).
        const a = AquaXAI.attributeScore({ ...reading }, TH);
        const b = AquaXAI.attributeScore({ ...reading }, TH);

        // Keluaran harus sama persis (urutan, param, persentase, skor, bobot).
        expect(a).toEqual(b);
      }),
      { numRuns: 200 }
    );
  });

  it('pemanggilan berulang pada objek reading yang sama tetap stabil', () => {
    fc.assert(
      fc.property(readingArb, fc.integer({ min: 2, max: 6 }), (reading, times) => {
        const first = AquaXAI.attributeScore(reading, TH);
        for (let i = 0; i < times; i++) {
          expect(AquaXAI.attributeScore(reading, TH)).toEqual(first);
        }
      }),
      { numRuns: 150 }
    );
  });
});
