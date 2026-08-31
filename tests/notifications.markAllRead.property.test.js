// =====================================================
// AQUENT — Notification Center property test
// Task 4.6 — markAllRead idempotency
// =====================================================
// Validates that AquaNotif.markAllRead() leaves every notification of a
// profile marked read (unreadCount === 0) and that calling it repeatedly does
// not change the stored state — i.e. the operation is idempotent (R8.5).

import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';
import { installLocalStorageMock } from './helpers/mocks.js';

const AquaNotif = loadModule('notifications.js', 'AquaNotif');

// A single notification draft for AquaNotif.add(). `read` varies so generated
// profiles contain a mix of read/unread items (and sometimes all-read or
// empty), exercising both the "changes something" and "changes nothing" paths.
const notifArb = fc.record({
  category: fc.constantFrom('water_quality', 'gamification', 'reminder', 'education'),
  title: fc.string(),
  body: fc.string(),
  ts: fc.integer({ min: 0, max: 4_102_444_800_000 }),
  read: fc.boolean(),
});

describe('AquaNotif.markAllRead — Property 47 (idempotent)', () => {
  let ls;
  afterEach(() => ls?.restore());

  // Feature: advanced-features-upgrade, Property 47: Tandai semua dibaca bersifat idempoten
  it('marks everything read and is unchanged on repeated calls (>=100 runs)', () => {
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

            // First call: everything must end up read.
            const firstChanged = AquaNotif.markAllRead(profileId);
            expect(firstChanged).toBe(
              drafts.filter((d) => d.read !== true).length
            );
            expect(AquaNotif.unreadCount(profileId)).toBe(0);

            const stateAfterFirst = JSON.stringify(AquaNotif.list(profileId));

            // Second (and third) call: idempotent — nothing changes.
            const secondChanged = AquaNotif.markAllRead(profileId);
            expect(secondChanged).toBe(0);
            expect(AquaNotif.unreadCount(profileId)).toBe(0);
            expect(JSON.stringify(AquaNotif.list(profileId))).toBe(stateAfterFirst);

            const thirdChanged = AquaNotif.markAllRead(profileId);
            expect(thirdChanged).toBe(0);
            expect(JSON.stringify(AquaNotif.list(profileId))).toBe(stateAfterFirst);
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
