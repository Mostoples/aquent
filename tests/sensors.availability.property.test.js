// =====================================================
// AQUENT — Sensor Integration Module property tests
// Spec: advanced-features-upgrade — Task 2.2
// =====================================================
//
// Feature: advanced-features-upgrade, Property 18: Ketersediaan parameter membedakan nilai hilang dari nol
//
// Property 18 (design.md):
//   "Untuk setiap snapshot sensor, isAvailable(reading, param) bernilai benar
//    ketika parameter ada (termasuk nilai 0) dan bernilai salah hanya ketika
//    nilainya null/undefined; status yang ditampilkan adalah 'tidak tersedia'
//    hanya untuk nilai yang benar-benar hilang."
//
// Validates: Requirements 4.1, 4.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';

const AquaSensors = loadModule('sensors.js', 'AquaSensors');

// The five canonical parameters of a SensorReading (R4.1).
const PARAMS = ['ph', 'temperature', 'turbidity', 'tds', 'chlorine'];

// Safe ranges mirroring data/thresholds.json (note: temperature -> 'temp' key).
// classifyStatus() uses these to decide low/normal/high vs. 'unavailable'.
const TH = {
  ph: { min: 6.5, max: 8.5 },
  temp: { min: 33, max: 40 },
  turbidity: { min: 0, max: 1 },
  tds: { min: 0, max: 300 },
  chlorine: { min: 0.1, max: 0.5 },
};

// A "present" sensor value: any finite number. Availability is about PRESENCE,
// not physical validity, so negatives and out-of-range values still count as
// present. fc.constant(0) is mixed in so the missing-vs-zero distinction — the
// heart of Property 18 — is exercised on every run.
const presentValue = fc.oneof(
  { weight: 1, arbitrary: fc.constant(0) },
  {
    weight: 3,
    arbitrary: fc.double({
      min: -100,
      max: 5000,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  }
);

// Five ways a parameter can appear in a snapshot. 'present' and 'zero' mean the
// value is there (available); 'null' / 'undefined' / 'absent' mean it is truly
// missing (unavailable).
const KINDS = ['present', 'zero', 'null', 'undefined', 'absent'];

const paramPlan = fc.record({
  kind: fc.constantFrom(...KINDS),
  value: presentValue,
});

const readingPlan = fc.record({
  ph: paramPlan,
  temperature: paramPlan,
  turbidity: paramPlan,
  tds: paramPlan,
  chlorine: paramPlan,
});

/**
 * Materialize a plan into a raw object (canonical keys) plus the expected
 * availability map. 'absent' leaves the key off entirely; 'undefined' sets it
 * explicitly to undefined.
 */
function build(plan) {
  const raw = {};
  const expected = {};
  for (const p of PARAMS) {
    const { kind, value } = plan[p];
    expected[p] = kind === 'present' || kind === 'zero';
    if (kind === 'present') raw[p] = value;
    else if (kind === 'zero') raw[p] = 0;
    else if (kind === 'null') raw[p] = null;
    else if (kind === 'undefined') raw[p] = undefined;
    // 'absent' => leave raw[p] unset
  }
  return { raw, expected };
}

describe('Property 18: isAvailable distinguishes missing values from zero', () => {
  it('isAvailable is true exactly when the parameter is present (including 0)', () => {
    fc.assert(
      fc.property(readingPlan, (plan) => {
        const { raw, expected } = build(plan);
        for (const param of PARAMS) {
          expect(AquaSensors.isAvailable(raw, param)).toBe(expected[param]);
        }
      }),
      { numRuns: 300 }
    );
  });

  it('treats value 0 as available while null / undefined / missing are unavailable', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PARAMS), (param) => {
        // Zero is a real measurement => available (NOT treated as missing).
        const zero = { [param]: 0 };
        expect(AquaSensors.isAvailable(zero, param)).toBe(true);

        // Genuinely missing values => unavailable.
        expect(AquaSensors.isAvailable({ [param]: null }, param)).toBe(false);
        expect(AquaSensors.isAvailable({ [param]: undefined }, param)).toBe(false);
        expect(AquaSensors.isAvailable({}, param)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('after parseReading, "unavailable" status shows up only for genuinely missing values', () => {
    fc.assert(
      fc.property(readingPlan, (plan) => {
        const { raw, expected } = build(plan);
        const reading = AquaSensors.parseReading(raw);

        for (const param of PARAMS) {
          // parseReading must never invent a value: missing => null, 0 stays 0.
          expect(AquaSensors.isAvailable(reading, param)).toBe(expected[param]);

          const status = AquaSensors.classifyStatus(param, reading[param], TH);
          if (expected[param]) {
            // Present (incl. 0) => a concrete status, never 'unavailable'.
            expect(status).not.toBe('unavailable');
          } else {
            // Truly missing => the displayed status is 'unavailable'.
            expect(status).toBe('unavailable');
          }
        }
      }),
      { numRuns: 300 }
    );
  });
});
