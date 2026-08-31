// =====================================================
// AQUENT — Notification Center property test
// Task 4.5 — markRead
// =====================================================
//
// Feature: advanced-features-upgrade, Property 46: Menandai dibaca mengurangi cacah belum dibaca
//
// Validates: Requirements 8.4
//
// Property text (design.md §Property 46):
//   "Untuk setiap notifikasi belum dibaca, markRead() menjadikan read === true
//    dan mengurangi unreadCount sebesar satu."
//
// Concretely we verify, across many randomly generated notification sets, that
// AquaNotif.markRead():
//   - marking an UNREAD notification as read decreases unreadCount() by exactly 1
//     and sets that notification's `read` flag to true; and
//   - marking an ALREADY-READ notification leaves unreadCount() unchanged
//     (and the notification stays read).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';
import { installLocalStorageMock } from './helpers/mocks.js';

let AquaNotif;
let ls;

beforeEach(() => {
  ls = installLocalStorageMock();
  AquaNotif = loadModule('notifications.js', 'AquaNotif');
});

afterEach(() => {
  ls?.restore();
});

const PID = 'p-test';

// Smart generator: a non-empty list of notifications, each carrying an explicit
// `read` flag so we control the unread population, plus an index used to pick a
// target notification to mark read. Categories/timestamps are realistic but
// irrelevant to this property.
const notifArb = fc.record({
  category: fc.constantFrom('water_quality', 'gamification', 'reminder', 'education'),
  title: fc.string({ maxLength: 20 }),
  body: fc.string({ maxLength: 40 }),
  ts: fc.integer({ min: 1_600_000_000_000, max: 1_800_000_000_000 }),
  read: fc.boolean(),
});

describe('Property 46: markRead decreases unread count', () => {
  it('marking unread -> read decreases unreadCount by 1; already-read unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(notifArb, { minLength: 1, maxLength: 25 }),
        fc.nat(),
        (notifs, pickSeed) => {
          // Isolate each iteration: fresh storage for the profile.
          localStorage.clear();

          // Seed the store and capture the assigned ids in insertion order.
          const ids = notifs.map((n) => AquaNotif.add(n, PID).id);

          const target = pickSeed % notifs.length;
          const targetId = ids[target];
          const wasUnread = notifs[target].read !== true;

          const before = AquaNotif.unreadCount(PID);

          const updated = AquaNotif.markRead(targetId, PID);

          // markRead always reports the notification as read now.
          expect(updated).not.toBeNull();
          expect(updated.id).toBe(targetId);
          expect(updated.read).toBe(true);

          // The persisted notification reflects read === true.
          const persisted = AquaNotif.list(PID).find((n) => n.id === targetId);
          expect(persisted).toBeDefined();
          expect(persisted.read).toBe(true);

          const after = AquaNotif.unreadCount(PID);

          if (wasUnread) {
            // Marking an unread notification read drops the count by exactly 1.
            expect(after).toBe(before - 1);
          } else {
            // Marking an already-read notification changes nothing.
            expect(after).toBe(before);
          }

          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('marking the same notification read twice is idempotent for unreadCount', () => {
    fc.assert(
      fc.property(
        fc.array(notifArb, { minLength: 1, maxLength: 25 }),
        fc.nat(),
        (notifs, pickSeed) => {
          localStorage.clear();
          const ids = notifs.map((n) => AquaNotif.add(n, PID).id);
          const targetId = ids[pickSeed % notifs.length];

          AquaNotif.markRead(targetId, PID);
          const afterFirst = AquaNotif.unreadCount(PID);
          AquaNotif.markRead(targetId, PID);
          const afterSecond = AquaNotif.unreadCount(PID);

          // Second mark on an already-read notification must not change the count.
          expect(afterSecond).toBe(afterFirst);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('markRead — concrete edge cases', () => {
  it('returns null and leaves unreadCount unchanged for an unknown id', () => {
    localStorage.clear();
    AquaNotif.add({ category: 'reminder', read: false }, PID);
    AquaNotif.add({ category: 'reminder', read: false }, PID);
    const before = AquaNotif.unreadCount(PID);

    expect(AquaNotif.markRead('does-not-exist', PID)).toBeNull();
    expect(AquaNotif.unreadCount(PID)).toBe(before);
  });

  it('marking the only unread notification brings unreadCount to 0', () => {
    localStorage.clear();
    const a = AquaNotif.add({ category: 'water_quality', read: true }, PID);
    const b = AquaNotif.add({ category: 'water_quality', read: false }, PID);

    expect(AquaNotif.unreadCount(PID)).toBe(1);
    AquaNotif.markRead(b.id, PID);
    expect(AquaNotif.unreadCount(PID)).toBe(0);
    // The already-read sibling is untouched.
    expect(AquaNotif.list(PID).find((n) => n.id === a.id).read).toBe(true);
  });
});
