// =====================================================
// AQUENT — Session storage round-trip property tests
// Spec: advanced-features-upgrade — Task 2.4
// =====================================================
//
// Feature: advanced-features-upgrade, Property 23: Round-trip penyimpanan sesi mempertahankan TDS dan klorin
//
// Property 23 (design.md):
//   "Untuk setiap sesi yang disimpan, rekaman yang tersimpan memuat field TDS
//    dan klorin beserta seluruh metrik sesi, dan membaca kembali rekaman
//    menghasilkan nilai yang sama dengan yang disimpan."
//
// Validates: Requirements 4.9, 5.1
//
// What this exercises
// -------------------
// `saveCurrentSession()` reads the live `state.sensor` (5 params) + `state.session`
// metrics, appends a record to localStorage key `aquent-sessions`, and
// `getSessionHistory()` reads it back. The property: whatever TDS/chlorine (and
// the other session metrics) we put in must come back byte-for-byte after a
// localStorage JSON round-trip — and a *missing* parameter (null/undefined)
// must round-trip as `null`, never an invented placeholder.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';
import { installLocalStorageMock } from './helpers/mocks.js';

// `saveCurrentSession()` reaches `getAuthUser()` (defined in auth.js, which is
// NOT loaded here) via `_sessionsRef()`. In the browser that global exists; in
// tests we stub it to return null so the Firebase best-effort write is skipped
// (state.db is null anyway). It is resolved at call time, so defining it before
// loading app.js is sufficient.
globalThis.getAuthUser = () => null;

// Load the production functions exactly as the browser would. app.js's BOOT
// logic lives inside a DOMContentLoaded listener (never fires here), so loading
// the file only declares functions + the shared `state` object.
const [saveCurrentSession, getSessionHistory, calcQualityScore, state] =
  loadModule('app.js', [
    'saveCurrentSession',
    'getSessionHistory',
    'calcQualityScore',
    'state',
  ]);

const SESSIONS_KEY = 'aquent-sessions';

let ls;
beforeAll(() => {
  ls = installLocalStorageMock();
});
afterAll(() => {
  ls.restore();
});

// A sensor parameter is either a concrete finite measurement or genuinely
// missing (null / undefined). `noNaN`/`noDefaultInfinity` keep values JSON-safe;
// `-0` is normalised to `+0` because a localStorage JSON round-trip turns "-0"
// into 0, and that normalisation should not look like a mismatch.
const measurement = (min, max) =>
  fc
    .double({ min, max, noNaN: true, noDefaultInfinity: true })
    .map((v) => (v === 0 ? 0 : v));

const maybeMeasurement = (min, max) =>
  fc.oneof(
    { weight: 4, arbitrary: measurement(min, max) },
    { weight: 1, arbitrary: fc.constant(null) },
    { weight: 1, arbitrary: fc.constant(undefined) }
  );

// A full session plan: the 5 sensor params (TDS & chlorine may be missing) plus
// the session-level metrics saveCurrentSession() persists.
const sessionPlan = fc.record({
  ph: measurement(0, 14),
  temperature: measurement(0, 60),
  turbidity: measurement(0, 5),
  tds: maybeMeasurement(0, 2000),
  chlorine: maybeMeasurement(0, 10),
  duration_min: measurement(0, 240),
  volume_liters: measurement(0, 500),
  water_saved_pct: measurement(0, 100),
});

// `saveCurrentSession` stores `value ?? null`, so a missing (null/undefined)
// input is expected to read back as exactly `null`.
const expectMissingAsNull = (v) => (typeof v === 'number' ? v : null);

describe('Property 23: session storage round-trips TDS and chlorine', () => {
  it('saved TDS/chlorine (and all session metrics) read back unchanged; missing => null', () => {
    fc.assert(
      fc.property(sessionPlan, (plan) => {
        // Start each run from a clean, non-empty history so getSessionHistory()
        // returns [] (never falls back to generated demo data).
        localStorage.setItem(SESSIONS_KEY, '[]');

        // Drive the live state the way the running app would before a save.
        state.sensor.ph = plan.ph;
        state.sensor.temperature = plan.temperature;
        state.sensor.turbidity = plan.turbidity;
        state.sensor.tds = plan.tds; // may be null/undefined
        state.sensor.chlorine = plan.chlorine; // may be null/undefined

        state.session.startTime = Date.now(); // truthy => save proceeds
        state.session.duration = plan.duration_min;
        state.session.usage = plan.volume_liters;
        state.session.saved = plan.water_saved_pct;

        const expectedScore = calcQualityScore().total;

        // --- act: persist, then read back through the public read path ---
        saveCurrentSession();
        const history = getSessionHistory();

        // Exactly one record should have been appended.
        expect(Array.isArray(history)).toBe(true);
        expect(history.length).toBe(1);

        const saved = history[history.length - 1];

        // Core of Property 23: TDS & chlorine survive the round-trip, with a
        // missing input preserved as null (never an invented placeholder).
        expect(saved.tds).toBe(expectMissingAsNull(plan.tds));
        expect(saved.chlorine).toBe(expectMissingAsNull(plan.chlorine));

        // The record must contain the TDS/chlorine fields explicitly (R4.9:
        // both included in the stored session), even when null.
        expect(Object.prototype.hasOwnProperty.call(saved, 'tds')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(saved, 'chlorine')).toBe(true);

        // ...alongside ALL the other session metrics, unchanged.
        expect(saved.ph).toBe(plan.ph);
        expect(saved.temperature).toBe(plan.temperature);
        expect(saved.turbidity).toBe(plan.turbidity);
        expect(saved.duration_min).toBe(plan.duration_min);
        expect(saved.volume_liters).toBe(plan.volume_liters);
        expect(saved.water_saved_pct).toBe(plan.water_saved_pct);
        expect(saved.quality_score).toBe(expectedScore);

        // A timestamp is recorded with each entry (R5.1: metrics + timestamp).
        expect(Number.isFinite(saved.ts)).toBe(true);
        expect(saved.profileId).toBe('default');
      }),
      { numRuns: 200 }
    );
  });

  it('a session written then re-read is deep-equal to what getSessionHistory returns', () => {
    fc.assert(
      fc.property(sessionPlan, (plan) => {
        localStorage.setItem(SESSIONS_KEY, '[]');

        state.sensor.ph = plan.ph;
        state.sensor.temperature = plan.temperature;
        state.sensor.turbidity = plan.turbidity;
        state.sensor.tds = plan.tds;
        state.sensor.chlorine = plan.chlorine;
        state.session.startTime = Date.now();
        state.session.duration = plan.duration_min;
        state.session.usage = plan.volume_liters;
        state.session.saved = plan.water_saved_pct;

        saveCurrentSession();

        // Reading twice must be stable, and a manual parse of the raw storage
        // must match the public read path exactly (true round-trip).
        const first = getSessionHistory();
        const second = getSessionHistory();
        const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY));

        expect(second).toEqual(first);
        expect(raw).toEqual(first);
      }),
      { numRuns: 100 }
    );
  });
});
