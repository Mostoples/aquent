// =====================================================
// AQUENT — Notification Center (AquaNotif) property tests
// Spec: advanced-features-upgrade — Requirement 8.8 (per-profile isolation)
// =====================================================
//
// AquaNotif persists notifications under per-profile localStorage keys
// `aquent-notifications-{profileId}`. This file verifies that the data of one
// Active_Profile is never visible to another profile (read isolation) and that
// mutating one profile's notifications never affects another's (write
// isolation).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';
import { installLocalStorageMock } from './helpers/mocks.js';

const STORAGE_PREFIX = 'aquent-notifications-';

// Load the vanilla module once; it reads localStorage lazily at call time, so
// it will pick up whichever mock is installed on globalThis per test.
const AquaNotif = loadModule('notifications.js', 'AquaNotif');

// --- Generators -------------------------------------------------------------

// Two or more DISTINCT profile ids. Non-empty so they never collapse onto the
// 'default' fallback inside _resolveProfileId.
const profileIdsArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), {
  minLength: 2,
  maxLength: 4,
});

const categoryArb = fc.constantFrom(
  'water_quality',
  'gamification',
  'reminder',
  'education'
);

// A partial notification payload (id/profileId are assigned by AquaNotif.add).
const notifArb = fc.record({
  category: categoryArb,
  title: fc.string({ maxLength: 40 }),
  body: fc.string({ maxLength: 80 }),
  ts: fc.integer({ min: 0, max: 2_000_000_000_000 }),
  read: fc.boolean(),
});

const notifListArb = fc.array(notifArb, { maxLength: 12 });

describe('AquaNotif — per-profile isolation', () => {
  let ls;

  beforeEach(() => {
    ls = installLocalStorageMock();
  });

  afterEach(() => {
    ls.restore();
  });

  // Feature: advanced-features-upgrade, Property 49: Isolasi notifikasi antar profil
  // Validates: Requirements 8.8
  it('keeps notifications of one profile invisible to other profiles', () => {
    fc.assert(
      fc.property(
        profileIdsArb,
        notifListArb,
        notifListArb,
        (profiles, notifsA, notifsB) => {
          // Fresh store for every generated example.
          localStorage.clear();

          const [a, b] = profiles;

          const addedA = notifsA.map((n) => AquaNotif.add(n, a));
          const addedB = notifsB.map((n) => AquaNotif.add(n, b));

          const idsA = new Set(addedA.map((n) => n.id));
          const idsB = new Set(addedB.map((n) => n.id));

          const listA = AquaNotif.list(a);
          const listB = AquaNotif.list(b);

          // Each profile sees exactly its own notifications — no more, no less.
          expect(listA.length).toBe(addedA.length);
          expect(listB.length).toBe(addedB.length);

          // Every notification returned for A belongs to A (and likewise B),
          // and the two id sets never overlap.
          for (const n of listA) {
            expect(idsA.has(n.id)).toBe(true);
            expect(idsB.has(n.id)).toBe(false);
            expect(n.profileId).toBe(a);
          }
          for (const n of listB) {
            expect(idsB.has(n.id)).toBe(true);
            expect(idsA.has(n.id)).toBe(false);
            expect(n.profileId).toBe(b);
          }

          // Unread counts are isolated: A's count reflects only A's payloads.
          const expectedUnreadA = notifsA.filter((n) => n.read !== true).length;
          const expectedUnreadB = notifsB.filter((n) => n.read !== true).length;
          expect(AquaNotif.unreadCount(a)).toBe(expectedUnreadA);
          expect(AquaNotif.unreadCount(b)).toBe(expectedUnreadB);

          // Isolation holds at the storage layer too: each profile uses its own
          // `aquent-notifications-{profileId}` key and no other.
          const rawA = JSON.parse(
            localStorage.getItem(STORAGE_PREFIX + a) || '[]'
          );
          const rawB = JSON.parse(
            localStorage.getItem(STORAGE_PREFIX + b) || '[]'
          );
          expect(rawA.length).toBe(addedA.length);
          expect(rawB.length).toBe(addedB.length);
          for (const n of rawA) expect(idsB.has(String(n.id))).toBe(false);
          for (const n of rawB) expect(idsA.has(String(n.id))).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Feature: advanced-features-upgrade, Property 49: Isolasi notifikasi antar profil
  // Validates: Requirements 8.8
  it('mutations on one profile never affect another profile', () => {
    fc.assert(
      fc.property(
        profileIdsArb,
        notifListArb,
        notifListArb,
        (profiles, notifsA, notifsB) => {
          localStorage.clear();

          const [a, b] = profiles;
          notifsA.forEach((n) => AquaNotif.add(n, a));
          const addedB = notifsB.map((n) => AquaNotif.add(n, b));

          // Snapshot B before mutating A.
          const beforeB = AquaNotif.list(b);
          const beforeUnreadB = AquaNotif.unreadCount(b);

          // Mutate A: mark all read, then remove everything.
          AquaNotif.markAllRead(a);
          for (const n of AquaNotif.list(a)) AquaNotif.remove(n.id, a);

          // B is untouched by any of A's mutations.
          const afterB = AquaNotif.list(b);
          expect(afterB).toEqual(beforeB);
          expect(AquaNotif.unreadCount(b)).toBe(beforeUnreadB);

          // Removing a B notification via the wrong profile (A) is a no-op.
          if (addedB.length > 0) {
            const removedViaWrongProfile = AquaNotif.remove(addedB[0].id, a);
            expect(removedViaWrongProfile).toBe(false);
            expect(AquaNotif.list(b).length).toBe(addedB.length);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
