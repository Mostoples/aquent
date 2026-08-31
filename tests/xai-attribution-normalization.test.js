// =====================================================
// AQUENT — property test: XAI factor attribution normalization
// Spec: advanced-features-upgrade — Task 3.3
//
//   Property 59: Atribusi faktor XAI ternormalisasi 100%
//   Validates: Requirements 11.1
//
// For every Sensor_Reading, the sum of `contributionPct` across all factors
// that contribute to the Water_Quality_Score equals 100% (within a
// floating-point epsilon), and every individual contribution lies in [0, 100].
//
// `AquaXAI.attributeScore(reading, TH)` returns the CONTRIBUTING factors only
// (pH, temperature, turbidity). TDS and chlorine are weight-0 "side factors"
// returned separately by `AquaXAI.sideFactors()` and are therefore NOT part of
// the normalized 100% attribution (see design — Requirements 4.5 / 11.4).
// =====================================================

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';

import { loadModule, PROJECT_ROOT } from './helpers/loadModule.js';

// Load the production module exactly as the browser would (self-registers to
// globalThis), then read the canonical thresholds the module is designed for.
const AquaXAI = loadModule('xai.js', 'AquaXAI');
const TH = JSON.parse(
  fs.readFileSync(path.resolve(PROJECT_ROOT, 'data', 'thresholds.json'), 'utf8')
);

// Floating-point tolerance for the normalized sum.
const EPS = 1e-6;

// Smart generator: a Sensor_Reading spanning the physical input space for the
// three scoring parameters (so we exercise in-range -> deficit 0, partial
// deficit, and fully-out-of-range -> large deficit). TDS & chlorine are also
// varied to confirm they never leak into the normalized attribution sum.
const readingArb = fc.record({
  ph: fc.double({ min: 0, max: 14, noNaN: true }),
  temperature: fc.double({ min: 0, max: 50, noNaN: true }),
  turbidity: fc.double({ min: 0, max: 5, noNaN: true }),
  tds: fc.double({ min: 0, max: 1000, noNaN: true }),
  chlorine: fc.double({ min: 0, max: 5, noNaN: true }),
});

describe('AquaXAI.attributeScore — Property 59: attribution normalizes to 100%', () => {
  // Feature: advanced-features-upgrade, Property 59: Atribusi faktor XAI ternormalisasi 100%
  it('sums contributing factors to 100% with each contribution in [0,100]', () => {
    fc.assert(
      fc.property(readingArb, (reading) => {
        const factors = AquaXAI.attributeScore(reading, TH);

        // Result must be a non-empty list of factor attributions.
        expect(Array.isArray(factors)).toBe(true);
        expect(factors.length).toBeGreaterThan(0);

        let sum = 0;
        for (const f of factors) {
          // Each contribution is a finite number bounded to [0, 100].
          expect(typeof f.contributionPct).toBe('number');
          expect(Number.isFinite(f.contributionPct)).toBe(true);
          expect(f.contributionPct).toBeGreaterThanOrEqual(0);
          expect(f.contributionPct).toBeLessThanOrEqual(100);
          sum += f.contributionPct;
        }

        // Normalized total equals 100% within floating-point tolerance.
        expect(Math.abs(sum - 100)).toBeLessThanOrEqual(EPS);
      }),
      { numRuns: 200 }
    );
  });
});
