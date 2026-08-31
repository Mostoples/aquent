// =====================================================
// AQUENT — unit tests: AquaSensors physical validity & status
// Spec: advanced-features-upgrade — Task 2.5
//   - isPhysicallyValid: value 0 valid; values outside physical range invalid
//   - classifyStatus: returns low/normal/high/unavailable correctly
//   _Requirements: 4.3_
// =====================================================
//
// These are EXAMPLE-based unit tests (not property tests). They pin down the
// concrete behaviour of the two pure helpers against the real thresholds.json
// "safe range" and the module's wider PHYSICAL_LIMITS plausibility range.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { loadModule, PROJECT_ROOT } from './helpers/loadModule.js';

// Load the production module exactly as the browser would (self-registers to
// globalThis), then read the canonical thresholds the module is designed for.
const AquaSensors = loadModule('sensors.js', 'AquaSensors');
const TH = JSON.parse(
  fs.readFileSync(path.resolve(PROJECT_ROOT, 'data', 'thresholds.json'), 'utf8')
);

describe('AquaSensors.isPhysicallyValid', () => {
  // --- value 0 is valid for every parameter (physical lower bound is 0) ---
  it('treats 0 as a valid measurement for all parameters', () => {
    for (const param of ['ph', 'temperature', 'turbidity', 'tds', 'chlorine']) {
      expect(AquaSensors.isPhysicallyValid(param, 0, TH)).toBe(true);
    }
  });

  // --- typical in-range readings are valid ---
  it('accepts values within the physical plausibility range', () => {
    expect(AquaSensors.isPhysicallyValid('ph', 7.2, TH)).toBe(true);
    expect(AquaSensors.isPhysicallyValid('ph', 14, TH)).toBe(true); // upper bound inclusive
    expect(AquaSensors.isPhysicallyValid('temperature', 38, TH)).toBe(true);
    expect(AquaSensors.isPhysicallyValid('turbidity', 500, TH)).toBe(true);
    expect(AquaSensors.isPhysicallyValid('tds', 350, TH)).toBe(true); // outside SAFE range but physically valid
    expect(AquaSensors.isPhysicallyValid('chlorine', 0.05, TH)).toBe(true);
  });

  // --- values outside the physical range are invalid ---
  it('rejects values below the physical minimum (negatives)', () => {
    expect(AquaSensors.isPhysicallyValid('ph', -0.1, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('temperature', -5, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('turbidity', -1, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('tds', -10, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('chlorine', -0.01, TH)).toBe(false);
  });

  it('rejects values above the physical maximum', () => {
    expect(AquaSensors.isPhysicallyValid('ph', 14.5, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('temperature', 120, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('turbidity', 5000, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('tds', 6000, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('chlorine', 11, TH)).toBe(false);
  });

  // --- non-numeric / missing values are invalid ---
  it('rejects non-numeric, null, undefined, and NaN/Infinity values', () => {
    expect(AquaSensors.isPhysicallyValid('ph', null, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('ph', undefined, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('ph', '7', TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('ph', NaN, TH)).toBe(false);
    expect(AquaSensors.isPhysicallyValid('ph', Infinity, TH)).toBe(false);
  });

  // --- unknown parameter handling ---
  it('rejects unknown parameters', () => {
    expect(AquaSensors.isPhysicallyValid('salinity', 5, TH)).toBe(false);
  });

  // --- 'temp' alias resolves to the temperature limits ---
  it("accepts the 'temp' alias for temperature", () => {
    expect(AquaSensors.isPhysicallyValid('temp', 38, TH)).toBe(true);
    expect(AquaSensors.isPhysicallyValid('temp', 0, TH)).toBe(true);
    expect(AquaSensors.isPhysicallyValid('temp', -1, TH)).toBe(false);
  });

  // --- works without thresholds supplied (physical limits only) ---
  it('validates against physical limits even when TH is omitted', () => {
    expect(AquaSensors.isPhysicallyValid('ph', 7)).toBe(true);
    expect(AquaSensors.isPhysicallyValid('ph', 20)).toBe(false);
  });
});

describe('AquaSensors.classifyStatus', () => {
  // --- normal: within the safe [min, max] range (bounds inclusive) ---
  it("returns 'normal' for values within the safe range", () => {
    expect(AquaSensors.classifyStatus('ph', 7.2, TH)).toBe('normal');
    expect(AquaSensors.classifyStatus('ph', 6.5, TH)).toBe('normal'); // lower bound inclusive
    expect(AquaSensors.classifyStatus('ph', 8.5, TH)).toBe('normal'); // upper bound inclusive
    expect(AquaSensors.classifyStatus('temperature', 37, TH)).toBe('normal');
    expect(AquaSensors.classifyStatus('tds', 180, TH)).toBe('normal');
    expect(AquaSensors.classifyStatus('chlorine', 0.3, TH)).toBe('normal');
  });

  // --- low: below the safe minimum ---
  it("returns 'low' for values below the safe minimum", () => {
    expect(AquaSensors.classifyStatus('ph', 6.0, TH)).toBe('low');
    expect(AquaSensors.classifyStatus('temperature', 30, TH)).toBe('low');
    expect(AquaSensors.classifyStatus('chlorine', 0.05, TH)).toBe('low');
    // chlorine safe min is 0.1, so 0 falls in the 'low' band
    expect(AquaSensors.classifyStatus('chlorine', 0, TH)).toBe('low');
  });

  // --- high: above the safe maximum ---
  it("returns 'high' for values above the safe maximum", () => {
    expect(AquaSensors.classifyStatus('ph', 9.0, TH)).toBe('high');
    expect(AquaSensors.classifyStatus('temperature', 45, TH)).toBe('high');
    expect(AquaSensors.classifyStatus('turbidity', 2, TH)).toBe('high');
    expect(AquaSensors.classifyStatus('tds', 350, TH)).toBe('high');
    expect(AquaSensors.classifyStatus('chlorine', 0.8, TH)).toBe('high');
  });

  // --- unavailable: missing / non-numeric values ---
  it("returns 'unavailable' for null, undefined, NaN, and non-numeric values", () => {
    expect(AquaSensors.classifyStatus('ph', null, TH)).toBe('unavailable');
    expect(AquaSensors.classifyStatus('ph', undefined, TH)).toBe('unavailable');
    expect(AquaSensors.classifyStatus('ph', NaN, TH)).toBe('unavailable');
    expect(AquaSensors.classifyStatus('ph', '7.2', TH)).toBe('unavailable');
  });

  // --- unavailable: no threshold entry for the parameter ---
  it("returns 'unavailable' when no threshold entry exists for the parameter", () => {
    expect(AquaSensors.classifyStatus('salinity', 5, TH)).toBe('unavailable');
    expect(AquaSensors.classifyStatus('ph', 7.2, {})).toBe('unavailable');
    expect(AquaSensors.classifyStatus('ph', 7.2, null)).toBe('unavailable');
  });

  // --- 'temp' alias resolves to the temperature thresholds ---
  it("returns the correct status using the 'temp' alias", () => {
    expect(AquaSensors.classifyStatus('temp', 37, TH)).toBe('normal');
    expect(AquaSensors.classifyStatus('temp', 30, TH)).toBe('low');
    expect(AquaSensors.classifyStatus('temp', 45, TH)).toBe('high');
  });
});
