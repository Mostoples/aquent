// =====================================================
// AQUENT — unit tests for AquaXAI.explainFactor()
// Spec: advanced-features-upgrade — Task 3.2
// Requirements: 4.4 (penjelasan + saran tindakan TDS/klorin di luar rentang),
//               11.3 (narasi naratif + rujukan ilmiah dari references.json)
// =====================================================

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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

const refIds = (refs) => new Set(refs.map((r) => r.id));

describe('AquaXAI.explainFactor — narrative + references (R11.3)', () => {
  it('returns non-empty narrative and at least one references.json citation for pH high', () => {
    const result = AquaXAI.explainFactor('ph', { ph: 9.2 }, TH, REFERENCES);
    expect(result).not.toBeNull();
    expect(result.status).toBe('high');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.short.length).toBeGreaterThan(0);
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
    // Every citation must be a member of references.json
    const ids = refIds(REFERENCES);
    result.citations.forEach((c) => expect(ids.has(c.id)).toBe(true));
  });

  it('interpolates the actual sensor value into the narrative', () => {
    const result = AquaXAI.explainFactor('ph', { ph: 9.2 }, TH, REFERENCES);
    expect(result.text).toContain('9.2');
    expect(result.text).not.toContain('{value}');
  });

  it('accepts both temp and temperature spellings', () => {
    const a = AquaXAI.explainFactor('temp', { temperature: 45 }, TH, REFERENCES);
    const b = AquaXAI.explainFactor('temperature', { temperature: 45 }, TH, REFERENCES);
    expect(a.status).toBe('high');
    expect(b.status).toBe('high');
    expect(a.text).toEqual(b.text);
    expect(a.citations.length).toBeGreaterThanOrEqual(1);
  });

  it('provides a citation member of references.json for every known parameter', () => {
    const ids = refIds(REFERENCES);
    const cases = [
      ['ph', { ph: 7.0 }],
      ['temp', { temperature: 37 }],
      ['turbidity', { turbidity: 0.3 }],
      ['tds', { tds: 150 }],
      ['chlorine', { chlorine: 0.3 }],
    ];
    cases.forEach(([param, reading]) => {
      const r = AquaXAI.explainFactor(param, reading, TH, REFERENCES);
      expect(r).not.toBeNull();
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.citations.length).toBeGreaterThanOrEqual(1);
      r.citations.forEach((c) => expect(ids.has(c.id)).toBe(true));
    });
  });
});

describe('AquaXAI.explainFactor — TDS/chlorine out-of-range path (R4.4)', () => {
  it('produces non-empty explanation AND an action suggestion for TDS > 300 ppm', () => {
    const result = AquaXAI.explainFactor('tds', { tds: 420 }, TH, REFERENCES);
    expect(result.status).toBe('high');
    expect(result.outOfRange).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.action.length).toBeGreaterThan(0);
    expect(result.text).toContain('420');
  });

  it('produces explanation + action for chlorine high (> 0.5 mg/L)', () => {
    const result = AquaXAI.explainFactor('chlorine', { chlorine: 0.9 }, TH, REFERENCES);
    expect(result.status).toBe('high');
    expect(result.outOfRange).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.action.length).toBeGreaterThan(0);
  });

  it('produces explanation + action for chlorine low (< 0.1 mg/L)', () => {
    const result = AquaXAI.explainFactor('chlorine', { chlorine: 0.02 }, TH, REFERENCES);
    expect(result.status).toBe('low');
    expect(result.outOfRange).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.action.length).toBeGreaterThan(0);
  });

  it('marks in-range parameters as not out-of-range', () => {
    const result = AquaXAI.explainFactor('tds', { tds: 150 }, TH, REFERENCES);
    expect(result.status).toBe('normal');
    expect(result.outOfRange).toBe(false);
  });
});

describe('AquaXAI.explainFactor — edge cases', () => {
  it('returns null for an unknown parameter', () => {
    expect(AquaXAI.explainFactor('salinity', { salinity: 5 }, TH, REFERENCES)).toBeNull();
  });

  it('handles unavailable (missing) values without throwing', () => {
    const result = AquaXAI.explainFactor('tds', { tds: null }, TH, REFERENCES);
    expect(result.status).toBe('unavailable');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.outOfRange).toBe(false);
  });

  it('does not leave dangling {value} placeholders in any output text', () => {
    const r = AquaXAI.explainFactor('turbidity', { turbidity: 2.5 }, TH, REFERENCES);
    expect(r.text).not.toContain('{value}');
    expect(r.short).not.toContain('{value}');
    expect(r.action).not.toContain('{');
  });

  it('is deterministic for identical inputs', () => {
    const a = AquaXAI.explainFactor('tds', { tds: 420 }, TH, REFERENCES);
    const b = AquaXAI.explainFactor('tds', { tds: 420 }, TH, REFERENCES);
    expect(a).toEqual(b);
  });
});
