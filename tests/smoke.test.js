// =====================================================
// AQUENT — infrastructure smoke test
// =====================================================
// Confirms the test harness itself works end-to-end:
//   1. jsdom environment provides window/document.
//   2. fast-check property tests run (>= 100 iterations).
//   3. loadModule loads a vanilla module and returns its global namespace.
//   4. localStorage / fetch / timer mocks behave as expected.
// This file is the documented reference for the testing pattern. It exercises
// no production code yet (engine modules arrive in later tasks).

import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';

import { loadModule } from './helpers/loadModule.js';
import {
  installLocalStorageMock,
  installFetchMock,
  makeResponse,
  useFakeTimers,
} from './helpers/mocks.js';

describe('jsdom environment', () => {
  it('exposes browser globals', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
    const el = document.createElement('div');
    el.textContent = 'aquent';
    expect(el.textContent).toBe('aquent');
  });
});

describe('fast-check property testing', () => {
  it('runs >= 100 iterations and proves a simple property', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a; // commutativity
      }),
      { numRuns: 100 }
    );
  });
});

describe('loadModule (vanilla module loading pattern)', () => {
  it('loads a vanilla module and returns its global namespace', () => {
    const AquaSample = loadModule('tests/fixtures/sample-module.js', 'AquaSample');
    expect(typeof AquaSample).toBe('object');
    expect(AquaSample.add(2, 3)).toBe(5);
    expect(AquaSample.echo('hi')).toBe('hi');
  });

  it('makes the namespace reachable on globalThis after load', () => {
    loadModule('tests/fixtures/sample-module.js', 'AquaSample');
    expect(globalThis.AquaSample).toBeDefined();
    expect(globalThis.AquaSample.add(10, 20)).toBe(30);
  });
});

describe('localStorage mock', () => {
  let ls;
  afterEach(() => ls?.restore());

  it('stores, reads, and round-trips JSON values', () => {
    ls = installLocalStorageMock();
    localStorage.setItem('aquent-sessions', JSON.stringify([{ ph: 7.2 }]));
    const back = JSON.parse(localStorage.getItem('aquent-sessions'));
    expect(back).toEqual([{ ph: 7.2 }]);
    expect(localStorage.length).toBe(1);
    localStorage.removeItem('aquent-sessions');
    expect(localStorage.getItem('aquent-sessions')).toBeNull();
  });
});

describe('fetch mock', () => {
  let fetchMock;
  afterEach(() => fetchMock?.restore());

  it('routes by URL substring and records calls', async () => {
    fetchMock = installFetchMock({
      'data/thresholds.json': { ph: { min: 6.5, max: 8.5 } },
    });
    const res = await fetch('data/thresholds.json');
    const json = await res.json();
    expect(res.ok).toBe(true);
    expect(json.ph.max).toBe(8.5);
    expect(fetchMock.mock.calls[0].url).toContain('thresholds.json');
  });

  it('supports a function handler and explicit responses', async () => {
    fetchMock = installFetchMock(() => makeResponse({ error: 'boom' }, { status: 500 }));
    const res = await fetch('https://example.test/api');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
  });
});

describe('timer mock', () => {
  it('advances fake time deterministically (e.g. AI timeout / streak day)', () => {
    const timers = useFakeTimers(0);
    let fired = false;
    setTimeout(() => {
      fired = true;
    }, 30000);
    expect(fired).toBe(false);
    timers.advance(30000);
    expect(fired).toBe(true);
    timers.restore();
  });
});
