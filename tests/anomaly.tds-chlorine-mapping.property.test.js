// =====================================================
// AQUENT — Anomaly_Detector property test (Task 6.6)
// Spec: advanced-features-upgrade
// =====================================================
//
// Feature: advanced-features-upgrade, Property 21: Pemetaan alert TDS dan klorin berbasis ambang
//
// Property 21 (design.md / requirements R4.6, R4.7):
//   Untuk setiap Sensor_Reading, AquaAnomaly.evaluate() memetakan parameter
//   TDS & klorin ke alert berbasis ambang:
//     · TDS  > 300 ppm   -> anomali type 'hard_water'     (R4.6)
//     · klorin > 0.5 mg/L -> anomali type 'chlorine_high'  (R4.7)
//     · klorin < 0.1 mg/L -> anomali type 'chlorine_low'   (R4.7)
//   Nilai yang berada di dalam rentang aman thresholds.json (TDS <= 300,
//   0.1 <= klorin <= 0.5) TIDAK menghasilkan alert ambang khusus tersebut.
//
//   Catatan: jalur z-score (type 'zscore') terpisah dari jalur ambang khusus.
//   Properti ini hanya menyangkut tiga type ambang di atas, sehingga assertion
//   memfilter berdasarkan `type` (sebuah 'zscore' tidak melanggar properti).
//
// Validates: Requirements 4.6, 4.7

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';

import { loadModule, PROJECT_ROOT } from './helpers/loadModule.js';

const AquaAnomaly = loadModule('anomaly.js', 'AquaAnomaly');

// thresholds.json is the single source of truth for the special-path limits
// (TDS max 300, chlorine min 0.1 / max 0.5). Drive the test with the real file.
const TH = JSON.parse(
  fs.readFileSync(path.resolve(PROJECT_ROOT, 'data', 'thresholds.json'), 'utf8')
);

const TDS_MAX = TH.tds.max; // 300
const CHLORINE_MAX = TH.chlorine.max; // 0.5
const CHLORINE_MIN = TH.chlorine.min; // 0.1

// The three special threshold-alert types under test.
const SPECIAL_TYPES = ['hard_water', 'chlorine_high', 'chlorine_low'];

/** Anomalies of a given `type` (and optionally `param`) from an evaluate() result. */
function ofType(anomalies, type, param) {
  return anomalies.filter(
    (a) => a && a.type === type && (param === undefined || a.param === param)
  );
}

/** True when the result contains ANY of the three special threshold alerts. */
function hasAnySpecial(anomalies) {
  return anomalies.some((a) => a && SPECIAL_TYPES.includes(a.type));
}

// Sensor values inside their safe ranges, used to keep the "other" parameters
// neutral so they never collide with the parameter under test. Empty history is
// passed to evaluate(), which suppresses the z-score path (needs >= 2 readings),
// isolating the pure threshold mapping.
const safePh = fc.double({ min: 6.5, max: 8.5, noNaN: true });
const safeTemp = fc.double({ min: 33, max: 40, noNaN: true });
const safeTurb = fc.double({ min: 0, max: 1, noNaN: true });
const safeTds = fc.double({ min: 0, max: TDS_MAX, noNaN: true }); // <= 300
const safeChlorine = fc.double({ min: CHLORINE_MIN, max: CHLORINE_MAX, noNaN: true }); // [0.1, 0.5]

describe('Property 21: threshold-based TDS & chlorine alert mapping', () => {
  // Feature: advanced-features-upgrade, Property 21: Pemetaan alert TDS dan klorin berbasis ambang
  it('TDS > 300 ppm produces a hard_water alert', () => {
    fc.assert(
      fc.property(
        // tds strictly above 300, up to the physical ceiling (5000 ppm).
        fc.double({ min: 0.001, max: 4700, noNaN: true, noDefaultInfinity: true }),
        safePh,
        safeTemp,
        safeTurb,
        safeChlorine,
        (excess, ph, temperature, turbidity, chlorine) => {
          const tds = TDS_MAX + excess; // > 300
          const reading = { ph, temperature, turbidity, tds, chlorine, ts: Date.now() };

          const anomalies = AquaAnomaly.evaluate(reading, [], TH);
          const hard = ofType(anomalies, 'hard_water', 'tds');

          expect(hard.length).toBe(1);
          expect(hard[0].value).toBe(tds);
          expect(hard[0].threshold).toBe(TDS_MAX);
          // A safe chlorine value must not raise any chlorine alert here.
          expect(ofType(anomalies, 'chlorine_high').length).toBe(0);
          expect(ofType(anomalies, 'chlorine_low').length).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 21: Pemetaan alert TDS dan klorin berbasis ambang
  it('chlorine > 0.5 mg/L produces a chlorine_high alert (and not chlorine_low)', () => {
    fc.assert(
      fc.property(
        // chlorine strictly above 0.5, up to the physical ceiling (10 mg/L).
        fc.double({ min: 0.001, max: 9.5, noNaN: true, noDefaultInfinity: true }),
        safePh,
        safeTemp,
        safeTurb,
        safeTds,
        (excess, ph, temperature, turbidity, tds) => {
          const chlorine = CHLORINE_MAX + excess; // > 0.5
          const reading = { ph, temperature, turbidity, tds, chlorine, ts: Date.now() };

          const anomalies = AquaAnomaly.evaluate(reading, [], TH);
          const high = ofType(anomalies, 'chlorine_high', 'chlorine');

          expect(high.length).toBe(1);
          expect(high[0].value).toBe(chlorine);
          expect(high[0].threshold).toBe(CHLORINE_MAX);
          // High chlorine must never also be flagged low.
          expect(ofType(anomalies, 'chlorine_low').length).toBe(0);
          // A safe TDS value must not raise a hard_water alert.
          expect(ofType(anomalies, 'hard_water').length).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 21: Pemetaan alert TDS dan klorin berbasis ambang
  it('chlorine < 0.1 mg/L produces a chlorine_low alert (and not chlorine_high)', () => {
    fc.assert(
      fc.property(
        // chlorine strictly below 0.1, down to 0 (zero is a valid measurement).
        fc.double({ min: 0, max: CHLORINE_MIN - 1e-4, noNaN: true }),
        safePh,
        safeTemp,
        safeTurb,
        safeTds,
        (chlorine, ph, temperature, turbidity, tds) => {
          const reading = { ph, temperature, turbidity, tds, chlorine, ts: Date.now() };

          const anomalies = AquaAnomaly.evaluate(reading, [], TH);
          const low = ofType(anomalies, 'chlorine_low', 'chlorine');

          expect(low.length).toBe(1);
          expect(low[0].value).toBe(chlorine);
          expect(low[0].threshold).toBe(CHLORINE_MIN);
          // Low chlorine must never also be flagged high.
          expect(ofType(anomalies, 'chlorine_high').length).toBe(0);
          // A safe TDS value must not raise a hard_water alert.
          expect(ofType(anomalies, 'hard_water').length).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 21: Pemetaan alert TDS dan klorin berbasis ambang
  it('values within the safe range produce no special threshold alert', () => {
    fc.assert(
      fc.property(
        safePh,
        safeTemp,
        safeTurb,
        safeTds, // 0 .. 300 (boundary 300 inclusive is safe)
        safeChlorine, // 0.1 .. 0.5 (boundaries inclusive are safe)
        (ph, temperature, turbidity, tds, chlorine) => {
          const reading = { ph, temperature, turbidity, tds, chlorine, ts: Date.now() };

          const anomalies = AquaAnomaly.evaluate(reading, [], TH);

          // No hard_water / chlorine_high / chlorine_low for in-range values.
          expect(hasAnySpecial(anomalies)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  // Feature: advanced-features-upgrade, Property 21: Pemetaan alert TDS dan klorin berbasis ambang
  it('exact safe boundaries (TDS=300, chlorine=0.1 and 0.5) raise no special alert', () => {
    const base = { ph: 7.2, temperature: 38, turbidity: 0.3, ts: Date.now() };

    // TDS exactly at the max is NOT > 300 -> no hard_water.
    let a = AquaAnomaly.evaluate({ ...base, tds: TDS_MAX, chlorine: 0.3 }, [], TH);
    expect(ofType(a, 'hard_water').length).toBe(0);

    // Chlorine exactly at the upper bound is NOT > 0.5 -> no chlorine_high.
    a = AquaAnomaly.evaluate({ ...base, tds: 150, chlorine: CHLORINE_MAX }, [], TH);
    expect(ofType(a, 'chlorine_high').length).toBe(0);
    expect(ofType(a, 'chlorine_low').length).toBe(0);

    // Chlorine exactly at the lower bound is NOT < 0.1 -> no chlorine_low.
    a = AquaAnomaly.evaluate({ ...base, tds: 150, chlorine: CHLORINE_MIN }, [], TH);
    expect(ofType(a, 'chlorine_low').length).toBe(0);
    expect(ofType(a, 'chlorine_high').length).toBe(0);
  });
});
