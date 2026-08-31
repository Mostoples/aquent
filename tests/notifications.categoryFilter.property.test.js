// =====================================================
// AQUENT — Notification Center property test
// Task 4.7 — category filter
// =====================================================
// Validates that AquaNotif.list(profileId, category) returns ONLY the
// notifications whose category matches the selected one (R8.6). The filter
// must be both sound (every returned item belongs to the selected category)
// and complete (every stored item of that category is returned).

import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';
import { installLocalStorageMock } from './helpers/mocks.js';

const AquaNotif = loadModule('notifications.js', 'AquaNotif');

// Valid notification categories (design.md §9 / R8.6).
const CATEGORIES = ['water_quality', 'gamification', 'reminder', 'education'];

// A single notification draft for AquaNotif.add(). The category is drawn from
// the four valid categories so generated profiles contain a mix that exercises
// every filter branch (including categories with zero matching items).
const notifArb = fc.record({
  category: fc.constantFrom(...CATEGORIES),
  title: fc.string(),
  body: fc.string(),
  ts: fc.integer({ min: 0, max: 4_102_444_800_000 }),
  read: fc.boolean(),
});

describe('AquaNotif.list category filter — Property 48', () => {
  let ls;
  afterEach(() => ls?.restore());

  // Feature: advanced-features-upgrade, Property 48: Filter kategori hanya mengembalikan kategori terpilih
  it('returns only notifications of the selected category (>=100 runs)', () => {
    fc.assert(
      fc.property(
        // Non-empty profile id so isolation is deterministic and not 'default'.
        fc.string({ minLength: 1 }),
        fc.array(notifArb, { maxLength: 30 }),
        (profileId, drafts) => {
          // Fresh, isolated store per run so prior iterations cannot leak in.
          ls = installLocalStorageMock();
          try {
            for (const d of drafts) AquaNotif.add(d, profileId);

            // Unfiltered list returns everything that was added.
            expect(AquaNotif.list(profileId).length).toBe(drafts.length);

            for (const category of CATEGORIES) {
              const filtered = AquaNotif.list(profileId, category);

              // Soundness: every returned item belongs to the selected category.
              for (const n of filtered) {
                expect(n.category).toBe(category);
              }

              // Completeness: the filter returns every stored item of that
              // category — no matching notification is dropped.
              const expectedCount = drafts.filter(
                (d) => d.category === category
              ).length;
              expect(filtered.length).toBe(expectedCount);
            }
          } finally {
            ls.restore();
            ls = null;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
