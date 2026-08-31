// =====================================================
// AQUENT — Property test (Task 3.5)
// Spec: advanced-features-upgrade
// =====================================================
//
// Property 19 verifies the core XAI/Water-Quality-Score contract for the two
// "side" parameters (TDS & free chlorine): they have weight 0% and therefore
// MUST NOT influence the Water_Quality_Score. They are surfaced only as
// informational / alert factors with an explicit reason.
//
// The production Water_Quality_Score engine is `calcQualityScore()` in app.js,
// which reads `state.sensor` and the XAI weights from data/thresholds.json
// (single source of truth). It only consumes pH / temperature / turbidity and
// never references tds / chlorine — this test pins that behaviour so a future
// regression (e.g. someone wiring TDS into the score) is caught.
//
// The "weight 0% + reason" facet is asserted against thresholds.json directly
// (the documented weights), and — when the XAI engine module exists — against
// `AquaXAI.sideFactors()` as well.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';

import { loadModule, PROJECT_ROOT } from './helpers/loadModule.js';

// Production WQS engine + shared state object (same reference the engine closes over).
const [calcQualityScore, state] = loadModule('app.js', ['calcQualityScore', 'state']);

// thresholds.json is the single source of truth for XAI weights/justifications.
const TH = JSON.parse(
  fs.readFileSync(path.resolve(PROJECT_ROOT, 'data', 'thresholds.json'), 'utf8')
);

// AquaXAI (xai.js, task 3.1) may not exist yet — load it opportunistically so
// this test also covers sideFactors() once that module lands, without failing
// the suite while it is still pending.
let AquaXAI = null;
try {
  AquaXAI = loadModule('xai.js', 'AquaXAI');
} catch {
  AquaXAI = null;
}

/**
 * Compute the Water_Quality_Score for a full 5-parameter reading by driving the
 * real production engine: set state.sensor, then call calcQualityScore().
 */
function scoreFor(reading) {
  state.sensor = {
    ph: reading.ph,
    temperature: reading.temperature,
    turbidity: reading.turbidity,
    tds: reading.tds,
    chlorine: reading.chlorine,
  };
  const qs = calcQualityScore();
  // Return only the score-relevant fields for a stable comparison.
  return {
    total: qs.total,
    grade: qs.grade,
    phScore: qs.phScore,
    tempScore: qs.tempScore,
    turbScore: qs.turbScore,
  };
}

describe('XAI — Water Quality Score independence from TDS & chlorine (Property 19)', () => {
  // Feature: advanced-features-upgrade, Property 19: WQS independen terhadap TDS dan klorin
  it('does not change WQS when TDS/chlorine vary with pH/temp/turbidity held fixed', () => {
    fc.assert(
      fc.property(
        // Base reading: the three parameters that DO drive the score.
        fc.record({
          ph: fc.double({ min: 5, max: 9, noNaN: true }),
          temperature: fc.double({ min: 28, max: 48, noNaN: true }),
          turbidity: fc.double({ min: 0, max: 2, noNaN: true }),
        }),
        // Two arbitrary, independent (tds, chlorine) pairs.
        fc.double({ min: 0, max: 1000, noNaN: true }), // tds A
        fc.double({ min: 0, max: 5, noNaN: true }),    // chlorine A
        fc.double({ min: 0, max: 1000, noNaN: true }), // tds B
        fc.double({ min: 0, max: 5, noNaN: true }),    // chlorine B
        (base, tdsA, chlorineA, tdsB, chlorineB) => {
          const a = scoreFor({ ...base, tds: tdsA, chlorine: chlorineA });
          const b = scoreFor({ ...base, tds: tdsB, chlorine: chlorineB });
          // Same pH/temp/turbidity, any TDS/chlorine => identical score.
          expect(b).toEqual(a);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 19: WQS independen terhadap TDS dan klorin
  it('reports TDS and chlorine with weight 0% and a documented reason', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }), // tds
        fc.double({ min: 0, max: 5, noNaN: true }),    // chlorine
        (tds, chlorine) => {
          // thresholds.json: side parameters carry weight 0% with justification.
          for (const param of ['tds', 'chlorine']) {
            expect(TH[param].weight_xai).toBe(0);
            expect(typeof TH[param].weight_xai_justification).toBe('string');
            expect(TH[param].weight_xai_justification.length).toBeGreaterThan(0);
          }

          // When the XAI engine exists, sideFactors() must list both side
          // parameters at 0% weight with a non-empty reason.
          if (AquaXAI && typeof AquaXAI.sideFactors === 'function') {
            const reading = {
              ph: 7.2,
              temperature: 38,
              turbidity: 0.3,
              tds,
              chlorine,
            };
            const sides = AquaXAI.sideFactors(reading, TH) || [];
            for (const param of ['tds', 'chlorine']) {
              const f = sides.find((s) => s && s.param === param);
              expect(f).toBeTruthy();
              // weight reported as fraction 0 or percent 0 — both are "0%".
              expect(f.weight === 0 || f.weightPct === 0).toBe(true);
              const reason = f.reason || f.justification || '';
              expect(typeof reason).toBe('string');
              expect(reason.length).toBeGreaterThan(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
