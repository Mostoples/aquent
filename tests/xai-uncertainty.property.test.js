// =====================================================
// AQUENT — XAI uncertainty warning property test
// Spec: advanced-features-upgrade
// =====================================================
// Property 61 ties the high-uncertainty warning produced by the XAI engine to
// the CONFIDENCE_LOW threshold defined in config.js. It exercises the real
// AquaXAI.confidence() surface across many inputs (>= 100 iterations) and the
// warning it drives, with no mocking of production logic.

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';

let AquaConfig;
let AquaXAI;

beforeAll(() => {
  // config.js must load first so AquaXAI reads CONFIDENCE_LOW from it.
  AquaConfig = loadModule('config.js', 'AquaConfig');
  AquaXAI = loadModule('xai.js', 'AquaXAI');
});

// A generator over the three analytic output kinds and their input signals,
// constrained to each kind's real input space so confidence() is exercised the
// way production drives it.
function arbConfidenceCase() {
  const unit = fc.float({ min: 0, max: 1, noNaN: true });
  return fc.oneof(
    fc.record({
      kind: fc.constant('forecast'),
      payload: fc.record({ r2: unit, sufficiency: unit, recency: unit }),
    }),
    fc.record({
      kind: fc.constant('anomaly'),
      payload: fc.record({ sampleRatio: unit, stability: unit }),
    }),
    fc.record({
      kind: fc.constant('scan'),
      payload: fc.record({
        confidence: fc.float({ min: 0, max: 100, noNaN: true }),
      }),
    })
  );
}

describe('Property 61 — high uncertainty warning below confidence threshold', () => {
  // Feature: advanced-features-upgrade, Property 61: Peringatan ketidakpastian tinggi di bawah ambang confidence
  // Validates: Requirements 11.5
  it('flags high uncertainty if and only if Confidence_Score < CONFIDENCE_LOW', () => {
    const LOW = AquaConfig.CONFIDENCE_LOW;

    fc.assert(
      fc.property(arbConfidenceCase(), ({ kind, payload }) => {
        const score = AquaXAI.confidence(kind, payload);

        // Confidence_Score is always a valid percentage (R11.2 / R1.5).
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);

        const warning = AquaXAI.uncertaintyWarning(score);
        const shouldWarn = score < LOW;

        // The iff at the heart of Property 61.
        expect(warning.highUncertainty).toBe(shouldWarn);
        expect(AquaXAI.isHighUncertainty(score)).toBe(shouldWarn);

        // A warning message is produced exactly when the flag is set.
        if (shouldWarn) {
          expect(typeof warning.message).toBe('string');
          expect(warning.message.length).toBeGreaterThan(0);
        } else {
          expect(warning.message).toBeNull();
        }
      }),
      { numRuns: 200 }
    );
  });

  it('treats every score in [0,100] consistently with the threshold (iff)', () => {
    const LOW = AquaConfig.CONFIDENCE_LOW;

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (score) => {
        const warning = AquaXAI.uncertaintyWarning(score);
        expect(warning.highUncertainty).toBe(score < LOW);
      }),
      { numRuns: 200 }
    );
  });

  it('respects the threshold boundary (strictly-less-than)', () => {
    const LOW = AquaConfig.CONFIDENCE_LOW; // 50 by config

    // At the threshold: NOT high uncertainty (strictly less than required).
    expect(AquaXAI.isHighUncertainty(LOW)).toBe(false);
    expect(AquaXAI.uncertaintyWarning(LOW).message).toBeNull();

    // Just below the threshold: high uncertainty with a message.
    expect(AquaXAI.isHighUncertainty(LOW - 1)).toBe(true);
    expect(AquaXAI.uncertaintyWarning(LOW - 1).message).toBeTruthy();

    // Extremes.
    expect(AquaXAI.isHighUncertainty(0)).toBe(true);
    expect(AquaXAI.isHighUncertainty(100)).toBe(false);
  });
});
