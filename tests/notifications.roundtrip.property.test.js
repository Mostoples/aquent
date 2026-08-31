// =====================================================
// AQUENT — Notification Center property test
// Feature: advanced-features-upgrade, Property 44: Round-trip tambah/hapus notifikasi
// =====================================================
//
// Property 44 (design.md §Correctness Properties):
//   "Untuk setiap notifikasi yang ditambahkan, notifikasi tersebut muncul pada
//    daftar profil yang sama; dan untuk setiap notifikasi yang dihapus,
//    notifikasi tersebut tidak lagi muncul pada daftar maupun penyimpanan."
//
// Validates: Requirements 8.2, 8.7
//
// In plain terms: AquaNotif.add() then remove() is a round-trip. Added items
// are retrievable from the list before removal; after removing them the store
// returns to its prior state and the removed ids appear in neither the list nor
// the underlying localStorage.

import { describe, it, afterEach, expect } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';
import { installLocalStorageMock } from './helpers/mocks.js';

// localStorage key prefix used by notifications.js (R8.8 — per-profile storage).
const STORAGE_PREFIX = 'aquent-notifications-';

/** Read the raw persisted notification array for a profile straight from store. */
function readStored(profileId) {
  const raw = localStorage.getItem(STORAGE_PREFIX + String(profileId));
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

// A single notification payload (id is assigned by add(), so we omit it here).
const notifArb = fc.record({
  category: fc.constantFrom('water_quality', 'gamification', 'reminder', 'education'),
  title: fc.string(),
  body: fc.string(),
  ts: fc.integer({ min: 0, max: 2_000_000_000_000 }),
  read: fc.boolean(),
});

// Profiles to exercise per-profile isolation without empty-string edge noise.
const profileArb = fc.constantFrom('default', 'p1', 'p2', 'kids', 'guest');

describe('AquaNotif — Property 44: round-trip add/remove', () => {
  let ls;

  afterEach(() => {
    ls?.restore();
  });

  // Feature: advanced-features-upgrade, Property 44: Round-trip tambah/hapus notifikasi
  it('add() makes a notification retrievable, and remove() restores the prior state', () => {
    fc.assert(
      fc.property(
        fc.array(notifArb, { maxLength: 8 }),
        notifArb,
        profileArb,
        (priorNotifs, target, profileId) => {
          // Fresh in-memory localStorage for each generated case.
          ls = installLocalStorageMock();
          const AquaNotif = loadModule('notifications.js', 'AquaNotif');

          // Establish an arbitrary prior state for this profile.
          for (const n of priorNotifs) AquaNotif.add(n, profileId);

          const priorList = AquaNotif.list(profileId);
          const priorStored = readStored(profileId);

          // --- add(): the notification must appear in the same profile's list.
          const added = AquaNotif.add(target, profileId);
          const listAfterAdd = AquaNotif.list(profileId);

          expect(listAfterAdd.some((n) => n.id === added.id)).toBe(true);
          // Retrievable item carries the data we supplied.
          const fetched = listAfterAdd.find((n) => n.id === added.id);
          expect(fetched.profileId).toBe(String(profileId));
          expect(fetched.category).toBe(target.category);
          // Adding exactly one item grows the list by one.
          expect(listAfterAdd.length).toBe(priorList.length + 1);

          // --- remove(): round-trip back to the prior state.
          const removed = AquaNotif.remove(added.id, profileId);
          expect(removed).toBe(true);

          const listAfterRemove = AquaNotif.list(profileId);
          const storedAfterRemove = readStored(profileId);

          // No longer present in the list (R8.7).
          expect(listAfterRemove.some((n) => n.id === added.id)).toBe(false);
          // No longer present in the underlying storage (R8.7).
          expect(storedAfterRemove.some((n) => String(n.id) === added.id)).toBe(false);

          // The store returns to its prior state: list and persisted contents
          // match what they were before the add/remove round-trip.
          expect(listAfterRemove).toEqual(priorList);
          expect(storedAfterRemove).toEqual(priorStored);

          ls.restore();
          ls = null;
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 44: Round-trip tambah/hapus notifikasi
  it('a batch of additions is fully retrievable, then fully removable from list and storage', () => {
    fc.assert(
      fc.property(
        fc.array(notifArb, { minLength: 1, maxLength: 12 }),
        profileArb,
        (notifs, profileId) => {
          ls = installLocalStorageMock();
          const AquaNotif = loadModule('notifications.js', 'AquaNotif');

          // Add every notification; each added id must be retrievable.
          const ids = [];
          for (const n of notifs) {
            const added = AquaNotif.add(n, profileId);
            ids.push(added.id);
            expect(AquaNotif.list(profileId).some((x) => x.id === added.id)).toBe(true);
          }
          expect(AquaNotif.list(profileId).length).toBe(notifs.length);

          // Remove every notification; none may remain in list or storage.
          for (const id of ids) {
            expect(AquaNotif.remove(id, profileId)).toBe(true);
          }
          expect(AquaNotif.list(profileId)).toEqual([]);
          expect(readStored(profileId)).toEqual([]);

          ls.restore();
          ls = null;
        }
      ),
      { numRuns: 200 }
    );
  });
});
