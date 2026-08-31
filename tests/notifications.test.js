// =====================================================
// AQUENT — Notification Center property tests
// Spec: advanced-features-upgrade — Requirement 8
// =====================================================
//
// Property-based tests for AquaNotif (notifications.js) using Vitest + fast-check.
// Run with `vitest --run` (single run, not watch mode).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';
import { installLocalStorageMock } from './helpers/mocks.js';

let ls;
let AquaNotif;

beforeEach(() => {
  // Fresh in-memory localStorage so each test starts from a clean store.
  ls = installLocalStorageMock();
  // Load the vanilla module after storage is installed; the module reads
  // localStorage lazily per call, so the order is not strictly required, but
  // this keeps the harness deterministic.
  AquaNotif = loadModule('notifications.js', 'AquaNotif');
});

afterEach(() => {
  ls?.restore();
});

// Generator: a single notification with a controlled, finite timestamp and a
// valid category. Timestamps span a wide range (including 0) so ordering is
// exercised across many distinct and duplicate values.
const notifArb = fc.record({
  ts: fc.integer({ min: 0, max: 4_102_444_800_000 }), // 1970..2100 epoch ms
  category: fc.constantFrom(
    'water_quality',
    'gamification',
    'reminder',
    'education'
  ),
  title: fc.string(),
  body: fc.string(),
});

describe('AquaNotif.list ordering (Property 43)', () => {
  // Feature: advanced-features-upgrade, Property 43: Daftar notifikasi terurut terbaru-dulu
  // Validates: Requirements 8.1
  it('returns notifications sorted newest-first regardless of insertion order', () => {
    fc.assert(
      fc.property(fc.array(notifArb, { maxLength: 40 }), (notifs) => {
        // Isolate each iteration: clear the store and use a fixed profile.
        localStorage.clear();
        const profileId = 'p-prop43';

        // Insert in the (arbitrary) order fast-check produced.
        for (const n of notifs) {
          AquaNotif.add(n, profileId);
        }

        const result = AquaNotif.list(profileId);

        // 1) Same number of notifications come back as were inserted.
        expect(result.length).toBe(notifs.length);

        // 2) Result is sorted strictly newest-first: each ts >= the next ts,
        //    i.e. non-increasing timestamps (descending order).
        for (let i = 0; i + 1 < result.length; i++) {
          expect(result[i].ts).toBeGreaterThanOrEqual(result[i + 1].ts);
        }

        // 3) The returned timestamps are exactly the inserted ones, just
        //    reordered (nothing dropped or invented).
        const inserted = notifs.map((n) => n.ts).sort((a, b) => b - a);
        const returned = result.map((n) => n.ts);
        expect(returned).toEqual(inserted);
      }),
      { numRuns: 200 }
    );
  });
});
