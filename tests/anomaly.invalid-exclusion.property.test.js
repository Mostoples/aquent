// =====================================================
// AQUENT — Anomaly_Detector property test
// Spec: advanced-features-upgrade — Task 6.5
//
// Feature: advanced-features-upgrade, Property 10: Pembacaan tak-valid fisik dikeluarkan dari baseline
//
// Property 10 (design.md):
//   "Untuk setiap Historical_Window yang mengandung nilai di luar rentang
//    fisik thresholds.json, baseline yang dihitung sama dengan baseline yang
//    dihitung hanya atas subset pembacaan yang valid secara fisik."
//
// Validates: Requirements 2.6
//
// In other words: physically-invalid readings (negatives / values outside the
// sensor's physical plausibility range) must NOT influence the baseline
// mean/std/count produced by AquaAnomaly.computeBaseline(). The baseline over a
// window that mixes valid + invalid readings must equal the baseline computed
// over only the valid subset. Note: value 0 is physically VALID and must be
// kept; the safe range in thresholds.json (e.g. TDS 0..300) is NOT the physical
// limit — only physically-implausible values are excluded.
// =====================================================

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';

import { loadModule, PROJECT_ROOT } from './helpers/loadModule.js';

// Load the production module exactly as the browser would (self-registers a
// global namespace), then read the canonical thresholds it is designed for.
// NOTE: sensors.js is intentionally NOT loaded, so anomaly.js uses its own
// equivalent PHYSICAL_LIMITS fallback for physical-validity checks.
const AquaAnomaly = loadModule('anomaly.js', 'AquaAnomaly');
const TH = JSON.parse(
  fs.readFileSync(path.resolve(PROJECT_ROOT, 'data', 'thresholds.json'), 'utf8')
);

// Physical plausibility limits, mirroring PHYSICAL_LIMITS in anomaly.js. These
// are the bounds used to decide validity (lower bound 0 => value 0 is valid).
// Keyed by the SensorReading field name used in the test.
const PHYS = {
  ph: { min: 0, max: 14 },
  temperature: { min: 0, max: 100 },
  turbidity: { min: 0, max: 4000 },
  tds: { min: 0, max: 5000 },
  chlorine: { min: 0, max: 10 },
};

const PARAMS = Object.keys(PHYS);

const MS_PER_HOUR = 3600000;

// A "slot" describes one reading to place into the window: whether it is valid,
// plus the raw fractions used to materialize an actual numeric value.
const slotArb = fc.record({
  isValid: fc.boolean(),
  // Fraction in [0,1] -> position inside the physical [min,max] range.
  frac: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  // For invalid values: choose below-range vs above-range, and how far out.
  below: fc.boolean(),
  outMag: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
});

const planArb = fc.record({
  param: fc.constantFrom(...PARAMS),
  // Extra mixed readings (any combination of valid/invalid).
  slots: fc.array(slotArb, { minLength: 0, maxLength: 48 }),
  // Guarantees the window is non-trivial: at least one valid + one invalid.
  guaranteedValidFrac: fc.double({
    min: 0,
    max: 1,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  guaranteedInvalid: slotArb,
});

/** Materialize a physically-VALID value for `param` from a [0,1] fraction. */
function validValue(param, frac) {
  const { min, max } = PHYS[param];
  return min + frac * (max - min); // within [min, max] (inclusive) => valid
}

/** Materialize a physically-INVALID value for `param` (strictly out of range). */
function invalidValue(param, below, outMag) {
  const { min, max } = PHYS[param];
  return below ? min - 1e-3 - outMag : max + 1e-3 + outMag;
}

/**
 * Build two parallel inputs from a plan:
 *   - `full`  : every reading (valid + invalid), invalids interspersed.
 *   - `valid` : only the physically-valid readings, in the SAME relative order.
 * `asObjects` controls whether readings are SensorReading objects (with ts) or
 * bare numbers. Valid readings appear in identical order in both arrays so the
 * baseline computation is performed over an identical value sequence.
 */
function buildInputs(plan, asObjects) {
  const { param, slots, guaranteedValidFrac, guaranteedInvalid } = plan;
  const full = [];
  const valid = [];
  let idx = 0;

  // Newest timestamp now; each subsequent reading is one hour older. The total
  // span stays well under the 7-day window so no valid reading is dropped by
  // the window filter (max ~50 readings => < 50h << 168h).
  const baseTs = 1_700_000_000_000;
  const wrap = (value, isValid) => {
    if (!asObjects) return value;
    const ts = baseTs - idx * MS_PER_HOUR;
    idx += 1;
    const obj = { ts };
    obj[param] = value;
    return obj;
  };

  // Guaranteed invalid first => the window always "contains values outside the
  // physical range" as the property requires.
  full.push(
    wrap(invalidValue(param, guaranteedInvalid.below, guaranteedInvalid.outMag), false)
  );

  for (const s of slots) {
    if (s.isValid) {
      const v = validValue(param, s.frac);
      full.push(wrap(v, true));
      valid.push(asObjects ? full[full.length - 1] : v);
    } else {
      full.push(wrap(invalidValue(param, s.below, s.outMag), false));
    }
  }

  // Guaranteed valid last => the valid subset is always non-empty.
  const gv = validValue(param, guaranteedValidFrac);
  full.push(wrap(gv, true));
  valid.push(asObjects ? full[full.length - 1] : gv);

  return { param, full, valid, validCount: valid.length, invalidCount: full.length - valid.length };
}

function expectSameBaseline(a, b) {
  // count is an exact integer; mean/std are computed over an identical value
  // sequence so they match to floating-point precision.
  expect(a.count).toBe(b.count);
  expect(a.mean).toBeCloseTo(b.mean, 9);
  expect(a.std).toBeCloseTo(b.std, 9);
}

describe('AquaAnomaly.computeBaseline — Property 10: physically-invalid readings excluded from baseline', () => {
  // Feature: advanced-features-upgrade, Property 10: Pembacaan tak-valid fisik dikeluarkan dari baseline
  it('baseline over mixed numeric window equals baseline over the valid subset', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const { param, full, valid, validCount, invalidCount } = buildInputs(plan, false);

        const baseFull = AquaAnomaly.computeBaseline(full, param, TH);
        const baseValid = AquaAnomaly.computeBaseline(valid, param, TH);

        // Sanity: the window genuinely contained invalid readings, and the
        // valid subset is strictly smaller.
        expect(invalidCount).toBeGreaterThanOrEqual(1);
        expect(full.length).toBeGreaterThan(valid.length);

        // The invalid readings were excluded: count reflects only valid ones.
        expect(baseFull.count).toBe(validCount);

        // Core property: mixed-window baseline == valid-subset baseline.
        expectSameBaseline(baseFull, baseValid);
      }),
      { numRuns: 300 }
    );
  });

  it('baseline over mixed SensorReading objects equals baseline over the valid subset', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const { param, full, valid, validCount } = buildInputs(plan, true);

        const baseFull = AquaAnomaly.computeBaseline(full, param, TH);
        const baseValid = AquaAnomaly.computeBaseline(valid, param, TH);

        // All readings sit within the 7-day window, so every valid reading is
        // counted and invalid ones are dropped regardless of their timestamps.
        expect(baseFull.count).toBe(validCount);
        expectSameBaseline(baseFull, baseValid);
      }),
      { numRuns: 200 }
    );
  });

  it('value 0 is physically valid and remains in the baseline (not treated as invalid)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PARAMS),
        fc.array(
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
          { minLength: 1, maxLength: 20 }
        ),
        (param, fracs) => {
          // Window: a real zero reading plus other valid readings, and one
          // out-of-range invalid that must be excluded.
          const others = fracs.map((f) => validValue(param, f));
          const withZero = [0, ...others, invalidValue(param, false, 5)];
          const validOnly = [0, ...others];

          const baseFull = AquaAnomaly.computeBaseline(withZero, param, TH);
          const baseValid = AquaAnomaly.computeBaseline(validOnly, param, TH);

          // Zero counts as a valid reading; only the out-of-range value is cut.
          expect(baseFull.count).toBe(validOnly.length);
          expectSameBaseline(baseFull, baseValid);
        }
      ),
      { numRuns: 200 }
    );
  });
});
