// =====================================================
// AQUENT — Anomaly_Detector property tests
// Spec: advanced-features-upgrade — Task 6.4
// =====================================================
//
// Feature: advanced-features-upgrade, Property 8: Ambang anomali z-score
//
// Property 8 (design.md):
//   "Untuk setiap baseline dan nilai pembacaan, isAnomaly() bernilai benar
//    jika dan hanya jika |value − mean| > k · std (dengan k = 3 default)."
//
// Requirement 2.3 (requirements.md):
//   "WHEN sebuah Sensor_Reading untuk satu parameter menyimpang lebih dari 3
//    deviasi standar dari Baseline, THE Anomaly_Detector SHALL menandai
//    pembacaan tersebut sebagai anomali."
//
// Validates: Requirements 2.3

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';

// Load config.js first so AquaConfig.ANOMALY_K (= 3) is reachable on globalThis.
// anomaly.js reads it lazily for the default-k path of isAnomaly().
const AquaConfig = loadModule('config.js', 'AquaConfig');
const AquaAnomaly = loadModule('anomaly.js', 'AquaAnomaly');

// ANOMALY_K is the documented default z-score factor (k = 3, Requirement 2.3).
const ANOMALY_K = AquaConfig.ANOMALY_K;

// Finite, well-behaved real numbers for mean / value. Bounded so products
// k·std stay far from the float-overflow edge (no spurious Infinity).
const realNumber = fc.double({
  min: -1e6,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});

// Standard deviation: a strictly positive finite number (baselines from
// computeBaseline() are always ≥ ANOMALY_MIN_STD > 0).
const positiveStd = fc.double({
  min: 1e-3,
  max: 1e5,
  noNaN: true,
  noDefaultInfinity: true,
});

// z-score factor k: a positive finite number (the contract is stated for the
// general k, with k = 3 as the documented default).
const positiveK = fc.double({
  min: 1e-3,
  max: 50,
  noNaN: true,
  noDefaultInfinity: true,
});

// Reference definition of the z-score threshold, computed with EXACTLY the same
// operation order as the production code so the IFF check is bit-faithful.
function expectedIsAnomaly(value, mean, std, k) {
  return Math.abs(value - mean) > k * std;
}

describe('Property 8: z-score anomaly threshold (isAnomaly is true iff |value - mean| > k*std)', () => {
  it('matches |value - mean| > k*std for arbitrary baseline, value and explicit k', () => {
    fc.assert(
      fc.property(realNumber, realNumber, positiveStd, positiveK, (value, mean, std, k) => {
        const baseline = { mean, std };
        const expected = expectedIsAnomaly(value, mean, std, k);
        expect(AquaAnomaly.isAnomaly(value, baseline, k)).toBe(expected);
      }),
      { numRuns: 300 }
    );
  });

  it('uses the documented default k = ANOMALY_K (3) when k is omitted', () => {
    fc.assert(
      fc.property(realNumber, realNumber, positiveStd, (value, mean, std) => {
        const baseline = { mean, std };
        const expected = expectedIsAnomaly(value, mean, std, ANOMALY_K);
        // Both omitting k and passing a non-numeric k fall back to ANOMALY_K.
        expect(AquaAnomaly.isAnomaly(value, baseline)).toBe(expected);
        expect(AquaAnomaly.isAnomaly(value, baseline, undefined)).toBe(expected);
      }),
      { numRuns: 300 }
    );
  });

  // Boundary semantics: the comparison is STRICT (>), so a deviation of exactly
  // k·std is NOT an anomaly, while anything beyond it is. Using integers makes
  // mean ± k·std exactly representable in floating point, so the boundary is
  // exercised with no rounding ambiguity.
  it('treats exactly k*std as NOT anomalous, and anything strictly beyond as anomalous', () => {
    const smallInt = fc.integer({ min: 1, max: 1000 });
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }), // mean
        smallInt, // std (integer ⇒ exact products)
        fc.integer({ min: 1, max: 20 }), // k (integer ⇒ exact products)
        fc.constantFrom(-1, 1), // direction of deviation
        (mean, std, k, sign) => {
          const baseline = { mean, std };
          const threshold = k * std; // exact for integer k, std

          // Exactly on the boundary: |value - mean| === k*std ⇒ NOT anomaly.
          const atBoundary = mean + sign * threshold;
          expect(AquaAnomaly.isAnomaly(atBoundary, baseline, k)).toBe(false);

          // Just inside the boundary ⇒ NOT anomaly.
          const inside = mean + sign * (threshold - 1);
          expect(AquaAnomaly.isAnomaly(inside, baseline, k)).toBe(false);

          // Just outside the boundary ⇒ anomaly.
          const outside = mean + sign * (threshold + 1);
          expect(AquaAnomaly.isAnomaly(outside, baseline, k)).toBe(true);
        }
      ),
      { numRuns: 300 }
    );
  });
});
