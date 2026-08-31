// =====================================================
// AQUENT — Property test (Task 3.7)
// Spec: advanced-features-upgrade
// =====================================================
//
// Property 20 pins the XAI contract for the two "side" parameters that carry a
// 0% score weight but still matter for skin safety: TDS (water hardness) and
// free chlorine. The requirement (R4.4) is that whenever one of these reads
// OUTSIDE its safe range — either low or high — the XAI engine must produce a
// non-empty narrative explanation AND a concrete, non-empty action suggestion
// built from the existing XAI templates (data/thresholds.json), not a raw
// placeholder.
//
// Safe ranges are read straight from data/thresholds.json (the single source of
// truth): a value is "out of safe range" when it is strictly below `min` (low)
// or strictly above `max` (high). The generators below construct values that
// are guaranteed to fall outside the range by subtracting/adding a positive
// offset from the documented bound, so every generated case is genuinely out of
// range regardless of how the thresholds are tuned.
//
// No production logic is mocked: this exercises the real AquaXAI.explainFactor()
// surface across >= 100 iterations.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';

import { loadModule, PROJECT_ROOT } from './helpers/loadModule.js';

let AquaXAI;
let TH;
let REFERENCES;

beforeAll(() => {
  AquaXAI = loadModule('xai.js', 'AquaXAI');
  TH = JSON.parse(
    fs.readFileSync(path.resolve(PROJECT_ROOT, 'data/thresholds.json'), 'utf8')
  );
  REFERENCES = JSON.parse(
    fs.readFileSync(path.resolve(PROJECT_ROOT, 'data/references.json'), 'utf8')
  );
});

// The two side parameters this property governs (R4.4). Both use the canonical
// reading key (xai.js reads `reading.tds` / `reading.chlorine` directly).
const SIDE_PARAMS = ['tds', 'chlorine'];

/**
 * An arbitrary over { param, side, value } where `value` is guaranteed to sit
 * strictly outside the parameter's safe range:
 *   - low:  value = min - offset  (offset > 0)  => value < min
 *   - high: value = max + offset  (offset > 0)  => value > max
 * Offsets span a wide, realistic-enough band to stress both sides of each
 * threshold without ever landing back inside the range.
 */
function outOfRangeCaseArb() {
  return fc
    .tuple(
      fc.constantFrom(...SIDE_PARAMS),
      fc.constantFrom('low', 'high'),
      fc.double({ min: 1e-3, max: 1000, noNaN: true })
    )
    .map(([param, side, offset]) => {
      const t = TH[param];
      const value = side === 'low' ? t.min - offset : t.max + offset;
      return { param, side, value };
    });
}

describe('XAI — explanation generated for out-of-safe-range parameters (Property 20)', () => {
  // Feature: advanced-features-upgrade, Property 20: Penjelasan XAI dihasilkan untuk parameter di luar rentang aman
  // Validates: Requirements 4.4
  it('produces non-empty explanation + action for any TDS/chlorine value outside its safe range', () => {
    fc.assert(
      fc.property(outOfRangeCaseArb(), ({ param, side, value }) => {
        const reading = { [param]: value };
        const result = AquaXAI.explainFactor(param, reading, TH, REFERENCES);

        // A known side parameter always yields a result object.
        expect(result).not.toBeNull();
        expect(result.param).toBe(param);

        // Out-of-range detection matches the generated side (low/high).
        expect(result.status).toBe(side);
        expect(result.outOfRange).toBe(true);

        // Non-empty narrative explanation text built from the XAI templates.
        expect(typeof result.text).toBe('string');
        expect(result.text.trim().length).toBeGreaterThan(0);
        expect(typeof result.short).toBe('string');
        expect(result.short.trim().length).toBeGreaterThan(0);

        // Non-empty, concrete action suggestion.
        expect(typeof result.action).toBe('string');
        expect(result.action.trim().length).toBeGreaterThan(0);

        // Templates must be interpolated, not surfaced raw.
        expect(result.text).not.toContain('{value}');
        expect(result.short).not.toContain('{value}');
        expect(result.action).not.toContain('{value}');

        // The explanation references the existing scientific basis (>= 1 citation).
        expect(Array.isArray(result.citations)).toBe(true);
        expect(result.citations.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 20: Penjelasan XAI dihasilkan untuk parameter di luar rentang aman
  // Validates: Requirements 4.4
  it('keeps in-range TDS/chlorine values flagged as NOT out-of-range (boundary contrast)', () => {
    const inRangeArb = fc
      .tuple(
        fc.constantFrom(...SIDE_PARAMS),
        fc.double({ min: 0, max: 1, noNaN: true })
      )
      .map(([param, ratio]) => {
        const t = TH[param];
        // Interpolate strictly inside (min, max) using the ratio.
        const value = t.min + ratio * (t.max - t.min);
        return { param, value };
      });

    fc.assert(
      fc.property(inRangeArb, ({ param, value }) => {
        const reading = { [param]: value };
        const result = AquaXAI.explainFactor(param, reading, TH, REFERENCES);
        expect(result).not.toBeNull();
        // Values within [min, max] are normal => not out of range.
        expect(result.status).toBe('normal');
        expect(result.outOfRange).toBe(false);
      }),
      { numRuns: 200 }
    );
  });
});
