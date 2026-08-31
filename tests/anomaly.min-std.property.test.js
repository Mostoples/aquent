// =====================================================
// AQUENT — Anomaly_Detector minimum-std property test
// Spec: advanced-features-upgrade — Task 6.3
// =====================================================
//
// Feature: advanced-features-upgrade, Property 7: Deviasi standar minimum positif untuk window konstan
//
// Property 7 (design.md):
//   "Untuk setiap window yang seluruh nilainya identik, computeBaseline().std
//    sama dengan ANOMALY_MIN_STD dan bernilai positif (tidak pernah nol)."
//
//   For every window whose values are ALL identical (a constant window), the
//   baseline standard deviation returned by AquaAnomaly.computeBaseline()
//   equals the configured ANOMALY_MIN_STD and is strictly positive — it must
//   never collapse to zero. This floor is what prevents a division-by-zero /
//   "everything-is-an-anomaly" failure when a parameter is perfectly flat.
//
// Validates: Requirements 2.2

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';

let AquaConfig;
let AquaAnomaly;
let MIN_STD;

beforeAll(() => {
  // config.js must load first so AquaAnomaly reads ANOMALY_MIN_STD from it
  // (the production module reads the constant from AquaConfig at runtime).
  AquaConfig = loadModule('config.js', 'AquaConfig');
  AquaAnomaly = loadModule('anomaly.js', 'AquaAnomaly');
  MIN_STD = AquaConfig.ANOMALY_MIN_STD;
});

// The five canonical parameters and their plausible physical ranges (lower
// bound 0 so every generated value is physically valid and therefore retained
// in the baseline window — guaranteeing the window stays constant, count = n).
const PARAM_RANGES = {
  ph: { min: 0, max: 14 },
  temperature: { min: 0, max: 100 },
  turbidity: { min: 0, max: 4000 },
  tds: { min: 0, max: 5000 },
  chlorine: { min: 0, max: 10 },
};

const PARAMS = Object.keys(PARAM_RANGES);

// A realistic constant value for a parameter: a finite reading at the kind of
// precision real sensors report (two decimal places) within the parameter's
// physical range. Real readings carry decimals (pH 7.20, chlorine 0.30, ...),
// and a perfectly flat decimal reading is the exact scenario the
// ANOMALY_MIN_STD floor exists to protect. Two-decimal values are used (rather
// than arbitrary doubles) so any counterexample is an obviously realistic
// sensor value, not a denormalised edge number.
function arbConstantValue(param) {
  const { min, max } = PARAM_RANGES[param];
  const steps = Math.round((max - min) * 100); // 0.01 resolution
  return fc.integer({ min: 0, max: steps }).map((k) => min + k / 100);
}

// A (param, constant value) pair drawn together so the value stays inside the
// chosen parameter's range and fast-check can shrink both coherently.
const arbParamValue = fc
  .constantFrom(...PARAMS)
  .chain((param) => arbConstantValue(param).map((value) => ({ param, value })));

// Window length: at least one reading, up to a couple of months of dailies.
const arbWindowLen = fc.integer({ min: 1, max: 60 });

describe('Property 7: minimum positive std for a constant window', () => {
  it('returns std === ANOMALY_MIN_STD (and > 0) for a constant numeric window', () => {
    fc.assert(
      fc.property(arbParamValue, arbWindowLen, ({ param, value }, n) => {
        const window = new Array(n).fill(value);

        const baseline = AquaAnomaly.computeBaseline(window, param, undefined);

        // mean of a constant window is that constant.
        expect(baseline.mean).toBeCloseTo(value, 9);
        // every value is physically valid, so all are retained.
        expect(baseline.count).toBe(n);

        // The heart of Property 7: a constant window has zero spread, so the
        // engine must floor the std at the configured positive minimum.
        expect(baseline.std).toBeGreaterThan(0);
        expect(baseline.std).toBe(MIN_STD);
      }),
      { numRuns: 200 }
    );
  });

  it('floors std at ANOMALY_MIN_STD for windows built from SensorReading objects', () => {
    // Same property, but exercised through the object-shaped Historical_Window
    // (timestamped readings) that evaluate() consumes in production. The window
    // is anchored on a recent base time so all readings fall inside the 7-day
    // window and remain constant for the parameter under test.
    const baseTs = Date.UTC(2026, 0, 15); // fixed, deterministic anchor
    const MS_PER_DAY = 86400000;

    fc.assert(
      fc.property(
        arbParamValue,
        fc.integer({ min: 1, max: 7 }), // days span kept within the 7-day window
        fc.integer({ min: 2, max: 40 }),
        ({ param, value }, days, n) => {
          const window = [];
          for (let i = 0; i < n; i++) {
            // spread readings across the last `days` days (all within 7 days)
            const ts = baseTs - Math.round((i / n) * days) * MS_PER_DAY;
            const reading = { ts };
            // write under the canonical key; temperature uses 'temperature'.
            reading[param] = value;
            window.push(reading);
          }

          const baseline = AquaAnomaly.computeBaseline(window, param, undefined);

          expect(baseline.count).toBe(n);
          expect(baseline.mean).toBeCloseTo(value, 9);
          expect(baseline.std).toBeGreaterThan(0);
          expect(baseline.std).toBe(MIN_STD);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('uses the minimum-std floor even for a single-element window', () => {
    // A window of one element is the degenerate constant case (zero spread).
    fc.assert(
      fc.property(arbParamValue, ({ param, value }) => {
        const baseline = AquaAnomaly.computeBaseline([value], param, undefined);

        expect(baseline.count).toBe(1);
        expect(baseline.std).toBeGreaterThan(0);
        expect(baseline.std).toBe(MIN_STD);
      }),
      { numRuns: 100 }
    );
  });
});
