// =====================================================
// AQUENT — Notification Center property test
// Property 45: unread count equals number of unread notifications
// =====================================================
// Loads the vanilla `notifications.js` module (AquaNotif) into the jsdom
// harness and verifies the universal relationship between unreadCount() and the
// notifications whose `read` flag is false.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';
import { installLocalStorageMock } from './helpers/mocks.js';

const CATEGORIES = ['water_quality', 'gamification', 'reminder', 'education'];

describe('Notification Center — unread count (Property 45)', () => {
  let ls;
  let AquaNotif;

  beforeEach(() => {
    ls = installLocalStorageMock();
    AquaNotif = loadModule('notifications.js', 'AquaNotif');
  });

  afterEach(() => {
    ls.restore();
  });

  // Feature: advanced-features-upgrade, Property 45: Jumlah belum dibaca sama dengan cacah notifikasi belum dibaca
  // Validates: Requirements 8.3
  it('unreadCount() equals the count of notifications with read === false', () => {
    fc.assert(
      fc.property(
        // A collection of notifications with a mix of read/unread states.
        fc.array(
          fc.record({
            category: fc.constantFrom(...CATEGORIES),
            title: fc.string(),
            body: fc.string(),
            ts: fc.integer({ min: 0, max: 4_102_444_800_000 }),
            read: fc.boolean(),
          }),
          { maxLength: 40 }
        ),
        // Exercise several distinct profiles to confirm per-profile counting.
        fc.constantFrom('default', 'p1', 'p2', 'profile-three'),
        (notifs, profileId) => {
          // Fresh per-iteration state so each run is independent.
          localStorage.clear();

          notifs.forEach((n) => AquaNotif.add(n, profileId));

          // Reference count: a notification is unread unless read === true.
          const expectedUnread = notifs.filter((n) => n.read !== true).length;

          expect(AquaNotif.unreadCount(profileId)).toBe(expectedUnread);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Anchor example: zero notifications → zero unread.
  it('reports zero unread for an empty notification list', () => {
    expect(AquaNotif.unreadCount('default')).toBe(0);
  });

  // Anchor example: all unread → count equals total.
  it('counts every notification when none are read', () => {
    AquaNotif.add({ category: 'reminder', title: 'a' }, 'default');
    AquaNotif.add({ category: 'gamification', title: 'b' }, 'default');
    expect(AquaNotif.unreadCount('default')).toBe(2);
  });

  // Anchor example: read notifications are excluded from the count.
  it('excludes notifications explicitly marked read', () => {
    AquaNotif.add({ category: 'water_quality', title: 'a', read: true }, 'default');
    AquaNotif.add({ category: 'water_quality', title: 'b', read: false }, 'default');
    expect(AquaNotif.unreadCount('default')).toBe(1);
  });
});
