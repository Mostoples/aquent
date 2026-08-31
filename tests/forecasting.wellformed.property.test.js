// =====================================================
// AQUENT — Forecasting_Engine property tests
// Spec: advanced-features-upgrade — Task 8.2
// =====================================================
//
// Feature: advanced-features-upgrade, Property 1: Forecast menghasilkan output well-formed
//
// Property 1 (design.md):
//   "Untuk setiap Historical_Window yang mencukupi (>= 7 hari rentang dan
//    >= 24 reading valid), forecast() menghasilkan projectedScore numerik dalam
//    rentang [0, 100], nilai proyeksi untuk kelima parameter (pH, suhu,
//    turbidity, TDS, klorin) yang semuanya berhingga (finite), dan deret yang
//    mencakup horizon yang diminta."
//
// Validates: Requirements 1.1, 1.2
//
// What this exercises
// -------------------
// AquaForecast.forecast(history, horizonHours, TH) is the production entry
// point. Given a Historical_Window that satisfies the data-sufficiency gate
// (>= FORECAST_MIN_DAYS span AND >= FORECAST_MIN_READINGS valid readings), it
// must always return a well-formed `ok` result:
//   - projected.{ph,temperature,turbidity,tds,chlorine} are all finite numbers,
//   - projectedScore is finite and within [0, 100],
//   - confidence is finite and within [0, 100],
//   - notRecommended is a boolean,
//   - series is a non-empty array whose projected portion reaches the
//     requested horizon.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';

import { loadModule, PROJECT_ROOT } from './helpers/loadModule.js';

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

// Load shared config first so AquaForecast resolves AquaConfig (FORECAST_MIN_DAYS
// = 7, FORECAST_MIN_READINGS = 24, FORECAST_HORIZON_H = 24) the same way the
// browser would, then load the production engine.
const AquaConfig = loadModule('config.js', 'AquaConfig');
const AquaForecast = loadModule('forecasting.js', 'AquaForecast');

// data/thresholds.json is the single source of truth for parameter ranges and
// XAI weights; pass it through so the projected Water_Quality_Score is computed
// exactly as production would.
const TH = JSON.parse(
  fs.readFileSync(path.resolve(PROJECT_ROOT, 'data', 'thresholds.json'), 'utf8')
);

// Sanity: the gate constants we generate against match what the engine uses.
const MIN_READINGS = AquaConfig.FORECAST_MIN_READINGS; // 24
const MIN_DAYS = AquaConfig.FORECAST_MIN_DAYS; // 7

// The five canonical parameters that forecast() projects.
const PARAMS = ['ph', 'temperature', 'turbidity', 'tds', 'chlorine'];

// A single reading's values. Each generator stays within the PHYSICAL limits
// used by forecasting.js (so every reading counts as valid and the sufficiency
// gate is satisfied). fc.constant(0) is mixed in so zero — a valid measurement
// per R1.4 — is exercised and never silently dropped.
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

// A sufficient-history plan:
//   - between MIN_READINGS and 80 readings (always >= 24),
//   - spanning 8..30 days (always comfortably >= 7, with margin so integer-ms
//     rounding can never push the computed span below the 7-day gate),
//   - a horizon of 1..72 hours.
const historyPlan = fc.record({
  values: fc.array(readingValues, { minLength: MIN_READINGS, maxLength: 80 }),
  spanDays: fc.double({ min: 8, max: 30, noNaN: true, noDefaultInfinity: true }),
  horizon: fc.integer({ min: 1, max: 72 }),
});

// Materialize a plan into a Historical_Window: timestamps are spread evenly
// across the chosen span (first reading at the origin, last at origin + span),
// which also varies hour-of-day to exercise the seasonal profile.
const ORIGIN = Date.UTC(2026, 0, 1, 0, 0, 0);

function buildHistory(plan) {
  const n = plan.values.length; // always >= 24 => n > 1
  const spanMs = plan.spanDays * MS_PER_DAY;
  return plan.values.map((v, i) => ({
    ts: Math.round(ORIGIN + (i / (n - 1)) * spanMs),
    ph: v.ph,
    temperature: v.temperature,
    turbidity: v.turbidity,
    tds: v.tds,
    chlorine: v.chlorine,
  }));
}

describe('Property 1: forecast() produces well-formed output for sufficient history', () => {
  // Feature: advanced-features-upgrade, Property 1: Forecast menghasilkan output well-formed
  it('returns a well-formed ok result (finite projections, score in [0,100], series reaching horizon)', () => {
    fc.assert(
      fc.property(historyPlan, (plan) => {
        const history = buildHistory(plan);
        const horizon = plan.horizon;

        const result = AquaForecast.forecast(history, horizon, TH);

        // Given sufficient data, the engine must produce a projection (R1.1/1.2),
        // never the insufficient_data status.
        expect(result.status).toBe('ok');

        // Projected values for ALL five parameters exist and are finite (R1.2).
        expect(result.projected).toBeTruthy();
        for (const param of PARAMS) {
          expect(Number.isFinite(result.projected[param])).toBe(true);
        }

        // projectedScore is a finite number within [0, 100] (R1.1).
        expect(Number.isFinite(result.projectedScore)).toBe(true);
        expect(result.projectedScore).toBeGreaterThanOrEqual(0);
        expect(result.projectedScore).toBeLessThanOrEqual(100);

        // confidence is a finite number within [0, 100] (R1.5 well-formedness).
        expect(Number.isFinite(result.confidence)).toBe(true);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);

        // notRecommended is a strict boolean.
        expect(typeof result.notRecommended).toBe('boolean');

        // The horizon is echoed back.
        expect(result.horizonHours).toBe(horizon);

        // series is a non-empty array of well-formed points.
        expect(Array.isArray(result.series)).toBe(true);
        expect(result.series.length).toBeGreaterThan(0);
        for (const point of result.series) {
          expect(Number.isFinite(point.ts)).toBe(true);
          if (point.actual !== undefined) {
            expect(Number.isFinite(point.actual)).toBe(true);
          }
          if (point.projected !== undefined) {
            expect(Number.isFinite(point.projected)).toBe(true);
          }
        }

        // The series must COVER the requested horizon: its projected tail
        // reaches exactly lastTs + round(horizon) hours.
        const lastTs = Math.max(...history.map((r) => r.ts));
        const projectedPoints = result.series.filter(
          (p) => p.projected !== undefined
        );
        expect(projectedPoints.length).toBeGreaterThan(0);
        const maxProjectedTs = Math.max(...projectedPoints.map((p) => p.ts));
        const steps = Math.max(1, Math.round(horizon));
        expect(maxProjectedTs).toBe(lastTs + steps * MS_PER_HOUR);
      }),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 1: Forecast menghasilkan output well-formed
  it('honors the default horizon (FORECAST_HORIZON_H) and stays well-formed', () => {
    fc.assert(
      fc.property(
        fc.record({
          values: fc.array(readingValues, {
            minLength: MIN_READINGS,
            maxLength: 60,
          }),
          spanDays: fc.double({
            min: 8,
            max: 30,
            noNaN: true,
            noDefaultInfinity: true,
          }),
        }),
        (plan) => {
          const history = buildHistory({ ...plan, horizon: 0 });

          // Omit horizonHours entirely => engine falls back to FORECAST_HORIZON_H.
          const result = AquaForecast.forecast(history, undefined, TH);

          expect(result.status).toBe('ok');
          expect(result.horizonHours).toBe(AquaConfig.FORECAST_HORIZON_H);
          for (const param of PARAMS) {
            expect(Number.isFinite(result.projected[param])).toBe(true);
          }
          expect(result.projectedScore).toBeGreaterThanOrEqual(0);
          expect(result.projectedScore).toBeLessThanOrEqual(100);
          expect(typeof result.notRecommended).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });
});
