// =====================================================
// AQUENT — Property test (Task 3.8)
// Spec: advanced-features-upgrade
// =====================================================
//
// Property 60 pins the XAI transparency contract for factor explanations:
// for EVERY known parameter, AquaXAI.explainFactor() must produce a non-empty
// narrative text AND at least one scientific citation, and every citation it
// returns must be a genuine member of data/references.json (no fabricated
// references). This drives the real AquaXAI surface across many inputs
// (>= 100 iterations) with no mocking of production logic.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';

import { loadModule, PROJECT_ROOT } from './helpers/loadModule.js';

let AquaXAI;
let TH;
let REFERENCES;
let REFERENCE_IDS;

beforeAll(() => {
  AquaXAI = loadModule('xai.js', 'AquaXAI');
  TH = JSON.parse(
    fs.readFileSync(path.resolve(PROJECT_ROOT, 'data', 'thresholds.json'), 'utf8')
  );
  REFERENCES = JSON.parse(
    fs.readFileSync(path.resolve(PROJECT_ROOT, 'data', 'references.json'), 'utf8')
  );
  // The authoritative set of reference ids the citations must belong to.
  REFERENCE_IDS = new Set(REFERENCES.map((r) => r.id));
});

// Every accepted parameter spelling and the reading field it is read from.
// `temp` and `temperature` are aliases that resolve to the same threshold key.
const PARAM_FIELD = {
  ph: 'ph',
  temp: 'temp',
  temperature: 'temperature',
  turbidity: 'turbidity',
  tds: 'tds',
  chlorine: 'chlorine',
};

// Wide numeric ranges per canonical parameter so the generator visits the
// low / normal / high status bands (out-of-range included) for each factor.
const VALUE_RANGE = {
  ph: { min: 3, max: 12 },
  temp: { min: 20, max: 55 },
  turbidity: { min: 0, max: 5 },
  tds: { min: 0, max: 800 },
  chlorine: { min: 0, max: 3 },
};

function canonicalOf(param) {
  return param === 'temperature' ? 'temp' : param;
}

// Build a Sensor_Reading that carries `value` on the field matching `param`.
function readingFor(param, value) {
  const reading = {};
  reading[PARAM_FIELD[param]] = value;
  return reading;
}

// A case = a known parameter (any accepted spelling) + a value drawn from that
// parameter's range. Occasionally emit a missing (null) value to also cover the
// "unavailable" status path, which must still yield narrative + citations.
function arbExplainCase() {
  return fc
    .constantFrom(...Object.keys(PARAM_FIELD))
    .chain((param) => {
      const range = VALUE_RANGE[canonicalOf(param)];
      const value = fc.oneof(
        { weight: 9, arbitrary: fc.double({ ...range, noNaN: true }) },
        { weight: 1, arbitrary: fc.constant(null) }
      );
      return fc.record({ param: fc.constant(param), value });
    });
}

describe('Property 60 — factor explanation contains narrative and references', () => {
  // Feature: advanced-features-upgrade, Property 60: Penjelasan faktor memuat narasi dan rujukan
  // Validates: Requirements 11.3
  it('produces non-empty narrative AND >=1 references.json citation for every known parameter', () => {
    fc.assert(
      fc.property(arbExplainCase(), ({ param, value }) => {
        const result = AquaXAI.explainFactor(param, readingFor(param, value), TH, REFERENCES);

        // A known parameter always yields an explanation object.
        expect(result).not.toBeNull();
        expect(result.param).toBe(canonicalOf(param));

        // Narrative text must be present, non-empty, and fully interpolated.
        expect(typeof result.text).toBe('string');
        expect(result.text.trim().length).toBeGreaterThan(0);
        expect(result.text).not.toContain('{value}');

        // The short narrative summary is also a non-empty string.
        expect(typeof result.short).toBe('string');
        expect(result.short.trim().length).toBeGreaterThan(0);

        // At least one scientific citation is attached...
        expect(Array.isArray(result.citations)).toBe(true);
        expect(result.citations.length).toBeGreaterThanOrEqual(1);

        // ...and every citation is a genuine member of references.json.
        result.citations.forEach((citation) => {
          expect(citation).toBeTruthy();
          expect(REFERENCE_IDS.has(citation.id)).toBe(true);
        });
      }),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 60: Penjelasan faktor memuat narasi dan rujukan
  // Validates: Requirements 11.3
  it('never returns duplicate or fabricated citations across the parameter space', () => {
    fc.assert(
      fc.property(arbExplainCase(), ({ param, value }) => {
        const result = AquaXAI.explainFactor(param, readingFor(param, value), TH, REFERENCES);
        const ids = result.citations.map((c) => c.id);

        // No fabricated ids (every id resolves to a references.json entry).
        ids.forEach((id) => expect(REFERENCE_IDS.has(id)).toBe(true));

        // Citations are distinct (no padding the list with repeats to reach 1).
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: 200 }
    );
  });
});
