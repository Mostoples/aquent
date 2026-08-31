// =====================================================
// AQUENT — Forecasting_Engine property tests
// Spec: advanced-features-upgrade — Task 8.3
// =====================================================
//
// Feature: advanced-features-upgrade, Property 2: Gerbang kecukupan data peramalan
//
// Property 2 (design.md):
//   "Untuk setiap Historical_Window yang memiliki kurang dari 7 hari rentang
//    ATAU kurang dari 24 reading valid, forecast() mengembalikan status
//    insufficient_data dan tidak menghasilkan proyeksi."
//
// Validates: Requirements 1.3
//
// What this exercises
// -------------------
// AquaForecast.forecast(history, horizonHours, TH) gates on data sufficiency
// BEFORE projecting. The gate (R1.3) fires when EITHER:
//   - the valid-reading count is below FORECAST_MIN_READINGS (24), OR
//   - the historical span is below FORECAST_MIN_DAYS (7 days),
// in which case forecast() returns { status: 'insufficient_data' } and never a
// projection. Only when BOTH conditions are satisfied (>= 24 valid readings AND
// >= 7 days span) does it return { status: 'ok' } with a projection.
//
// A "valid reading" is one with a finite timestamp AND at least one physically
// valid parameter; readings whose parameters are all missing/out-of-range do
// not count toward the 24-reading floor — so they are exercised here too.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';

import { loadModule, PROJECT_ROOT } from './helpers/loadModule.js';

const MS_PER_DAY = 86400000;

// Load shared config first so AquaForecast resolves AquaConfig
// (FORECAST_MIN_DAYS = 7, FORECAST_MIN_READINGS = 24) exactly as the browser
// would, then load the production engine.
const AquaConfig = loadModule('config.js', 'AquaConfig');
const AquaForecast = loadModule('forecasting.js', 'AquaForecast');

// data/thresholds.json is the single source of truth for parameter ranges and
// XAI weights; pass it through so projection (when it occurs) matches prod.
const TH = JSON.parse(
  fs.readFileSync(path.resolve(PROJECT_ROOT, 'data', 'thresholds.json'), 'utf8')
);

// The gate constants we generate against — must match what the engine uses.
const MIN_READINGS = AquaConfig.FORECAST_MIN_READINGS; // 24
const MIN_DAYS = AquaConfig.FORECAST_MIN_DAYS; // 7

// A fixed origin so timestamps are deterministic across runs.
const ORIGIN = Date.UTC(2026, 0, 1, 0, 0, 0);

// A single valid reading's values. Each value stays within the PHYSICAL limits
// used by forecasting.js so the reading always counts as valid. fc.constant(0)
// is mixed in so zero — a valid measurement per R1.4 — counts as a real
// reading and is never silently dropped from the sufficiency tally.
const physicalValue = (min, max) =>
  fc.oneof(
    { weight: 1, arbitrary: fc.constant(0) },
    {
      weight: 6,
      arbitrary: fc.double({ min, max, noNaN: true, noDefaultInfinity: true }),
    }
  );

const readingValues = fc.record({
  ph: physicalValue(0, 14),
  temperature: physicalValue(0, 100),
  turbidity: physicalValue(0, 4000),
  tds: physicalValue(0, 5000),
  chlorine: physicalValue(0, 10),
});

// An all-null reading: it has a timestamp but no physically valid parameter, so
// the engine must NOT count it toward the 24-reading floor.
const NULL_READING = {
  ph: null,
  temperature: null,
  turbidity: null,
  tds: null,
  chlorine: null,
};

// Spread `values` evenly across `spanDays`, anchored at ORIGIN.
function buildHistory(values, spanDays) {
  const n = values.length;
  if (n === 0) return [];
  const spanMs = spanDays * MS_PER_DAY;
  if (n === 1) return [{ ts: ORIGIN, ...values[0] }];
  return values.map((v, i) => ({
    ts: Math.round(ORIGIN + (i / (n - 1)) * spanMs),
    ...v,
  }));
}

// Assert an insufficient_data verdict carries NO projection (R1.3).
function expectInsufficient(result) {
  expect(result).toBeTruthy();
  expect(result.status).toBe('insufficient_data');
  // No projection of any kind is produced when the gate fires.
  expect(result.projected).toBeUndefined();
  expect(result.projectedScore).toBeUndefined();
  expect(result.series).toBeUndefined();
}

describe('Property 2: forecast() data-sufficiency gate', () => {
  // Feature: advanced-features-upgrade, Property 2: Gerbang kecukupan data peramalan
  it('returns insufficient_data when there are fewer than FORECAST_MIN_READINGS valid readings (any span)', () => {
    fc.assert(
      fc.property(
        fc.record({
          // 0..(MIN_READINGS - 1) valid readings => always below the floor.
          values: fc.array(readingValues, {
            minLength: 0,
            maxLength: MIN_READINGS - 1,
          }),
          // Span is irrelevant here (even a long one cannot rescue too-few
          // readings); vary it to prove the count branch dominates.
          spanDays: fc.double({
            min: 0,
            max: 30,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          horizon: fc.integer({ min: 1, max: 72 }),
        }),
        ({ values, spanDays, horizon }) => {
          const history = buildHistory(values, spanDays);
          expectInsufficient(AquaForecast.forecast(history, horizon, TH));
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 2: Gerbang kecukupan data peramalan
  it('returns insufficient_data when the span is shorter than FORECAST_MIN_DAYS (even with >= 24 readings)', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Plenty of valid readings so the count branch is satisfied...
          values: fc.array(readingValues, {
            minLength: MIN_READINGS,
            maxLength: 80,
          }),
          // ...but the span stays strictly below 7 days (margin keeps integer-ms
          // rounding from ever reaching the 7-day boundary).
          spanDays: fc.double({
            min: 0,
            max: 6.5,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          horizon: fc.integer({ min: 1, max: 72 }),
        }),
        ({ values, spanDays, horizon }) => {
          const history = buildHistory(values, spanDays);
          expectInsufficient(AquaForecast.forecast(history, horizon, TH));
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 2: Gerbang kecukupan data peramalan
  it('counts only valid readings: invalid (all-null) readings cannot satisfy the floor', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Fewer than 24 genuinely valid readings...
          validValues: fc.array(readingValues, {
            minLength: 0,
            maxLength: MIN_READINGS - 1,
          }),
          // ...padded with any number of all-null (invalid) readings that must
          // be ignored by the gate.
          invalidCount: fc.integer({ min: 1, max: 40 }),
          // A comfortably-long span so span is NOT the limiting factor; the
          // insufficiency must come purely from the valid-reading count.
          spanDays: fc.double({
            min: 8,
            max: 30,
            noNaN: true,
            noDefaultInfinity: true,
          }),
        }),
        ({ validValues, invalidCount, spanDays }) => {
          const spanMs = spanDays * MS_PER_DAY;

          // Valid readings spread across the full span.
          const nv = validValues.length;
          const valid = validValues.map((v, i) => ({
            ts: Math.round(ORIGIN + (nv <= 1 ? 0 : (i / (nv - 1)) * spanMs)),
            ...v,
          }));

          // Invalid readings also spread across the span (they have timestamps
          // but no valid parameter, so they must not count).
          const invalid = [];
          for (let i = 0; i < invalidCount; i++) {
            invalid.push({
              ts: Math.round(ORIGIN + (i / invalidCount) * spanMs),
              ...NULL_READING,
            });
          }

          const history = valid.concat(invalid);
          expectInsufficient(AquaForecast.forecast(history, 24, TH));
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 2: Gerbang kecukupan data peramalan
  it('returns ok (a projection) only when BOTH conditions hold: >= 24 valid readings AND >= 7 days span', () => {
    fc.assert(
      fc.property(
        fc.record({
          values: fc.array(readingValues, {
            minLength: MIN_READINGS,
            maxLength: 80,
          }),
          // Strictly above the 7-day floor (margin guards integer-ms rounding).
          spanDays: fc.double({
            min: 8,
            max: 30,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          horizon: fc.integer({ min: 1, max: 72 }),
        }),
        ({ values, spanDays, horizon }) => {
          const history = buildHistory(values, spanDays);
          const result = AquaForecast.forecast(history, horizon, TH);

          // Gate is satisfied => engine projects rather than withholding.
          expect(result.status).toBe('ok');
          expect(result.projected).toBeTruthy();
          expect(Number.isFinite(result.projectedScore)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
