// =====================================================
// AQUENT test helper — reusable mocks
// =====================================================
//
// Shared, dependency-light mocks for the things AQUENT engine modules touch:
//   - localStorage  (sessions, notifications, gamify, eco prefs, ...)
//   - fetch         (Gemini API, Firestore REST, data/*.json)
//   - timers        (AI 30s timeout, streak/day boundaries)
//
// These are framework-agnostic where possible. The timer helpers wrap Vitest's
// fake timers (`vi`) which Vitest exposes as a global when `globals: true`.

/* -----------------------------------------------------
 * localStorage
 * --------------------------------------------------- */

/**
 * Create an in-memory localStorage-compatible store.
 * Implements the Web Storage API surface AQUENT uses.
 *
 * @returns {Storage & { _data: Map<string,string> }}
 */
export function createLocalStorageMock() {
  const data = new Map();
  const store = {
    _data: data,
    get length() {
      return data.size;
    },
    getItem(key) {
      return data.has(String(key)) ? data.get(String(key)) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    },
    clear() {
      data.clear();
    },
    key(index) {
      return Array.from(data.keys())[index] ?? null;
    },
  };
  return store;
}

/**
 * Install a fresh localStorage mock onto globalThis (and window, if present).
 * Returns the mock plus a `restore()` to put back whatever was there before.
 */
export function installLocalStorageMock() {
  const mock = createLocalStorageMock();
  const prevGlobal = globalThis.localStorage;
  const hadWindow = typeof globalThis.window !== 'undefined';
  const prevWindow = hadWindow ? globalThis.window.localStorage : undefined;

  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    configurable: true,
    writable: true,
  });
  if (hadWindow) {
    Object.defineProperty(globalThis.window, 'localStorage', {
      value: mock,
      configurable: true,
      writable: true,
    });
  }

  return {
    mock,
    restore() {
      Object.defineProperty(globalThis, 'localStorage', {
        value: prevGlobal,
        configurable: true,
        writable: true,
      });
      if (hadWindow) {
        Object.defineProperty(globalThis.window, 'localStorage', {
          value: prevWindow,
          configurable: true,
          writable: true,
        });
      }
    },
  };
}

/* -----------------------------------------------------
 * fetch
 * --------------------------------------------------- */

/**
 * Build a minimal Response-like object.
 *
 * @param {*} body   Object (JSON-encoded), string, or pre-stringified body.
 * @param {object} [opts]
 * @param {number} [opts.status=200]
 * @param {boolean} [opts.ok]      Defaults to status in [200,299].
 */
export function makeResponse(body, opts = {}) {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const isString = typeof body === 'string';
  const text = isString ? body : JSON.stringify(body);
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => (isString ? JSON.parse(text) : body),
    text: async () => text,
    clone() {
      return makeResponse(body, opts);
    },
  };
}

/**
 * Create a fetch mock.
 *
 * - Pass a function to fully control responses: `(url, init) => Response`.
 * - Pass a map of `{ 'substring-of-url': bodyOrResponse }` for simple routing.
 * - Pass nothing for a fetch that always resolves `{}` with 200.
 *
 * The returned function records calls on `.calls` for assertions.
 *
 * @param {Function|Object} [handler]
 */
export function createFetchMock(handler) {
  const calls = [];

  const fn = async (url, init) => {
    calls.push({ url: String(url), init });

    if (typeof handler === 'function') {
      const result = await handler(String(url), init);
      return result && result.json ? result : makeResponse(result ?? {});
    }

    if (handler && typeof handler === 'object') {
      for (const key of Object.keys(handler)) {
        if (String(url).includes(key)) {
          const v = handler[key];
          return v && v.json ? v : makeResponse(v);
        }
      }
      return makeResponse({}, { status: 404, ok: false });
    }

    return makeResponse({});
  };

  fn.calls = calls;
  return fn;
}

/**
 * Install a fetch mock onto globalThis (and window). Returns the mock plus a
 * `restore()`.
 */
export function installFetchMock(handler) {
  const mock = createFetchMock(handler);
  const prevGlobal = globalThis.fetch;
  const hadWindow = typeof globalThis.window !== 'undefined';
  const prevWindow = hadWindow ? globalThis.window.fetch : undefined;

  globalThis.fetch = mock;
  if (hadWindow) globalThis.window.fetch = mock;

  return {
    mock,
    restore() {
      globalThis.fetch = prevGlobal;
      if (hadWindow) globalThis.window.fetch = prevWindow;
    },
  };
}

/* -----------------------------------------------------
 * timers
 * --------------------------------------------------- */

/**
 * Enable Vitest fake timers and optionally pin "now".
 * Use for streak/day-boundary logic and AI timeout (30s) tests.
 *
 * @param {number|Date} [now]  Initial system time.
 * @returns {{ advance:Function, runAll:Function, setSystemTime:Function, restore:Function }}
 */
export function useFakeTimers(now) {
  // `vi` is provided globally by Vitest when globals:true (see vitest.config.js).
  vi.useFakeTimers();
  if (now !== undefined) vi.setSystemTime(now);
  return {
    advance: (ms) => vi.advanceTimersByTime(ms),
    advanceAsync: (ms) => vi.advanceTimersByTimeAsync(ms),
    runAll: () => vi.runAllTimers(),
    setSystemTime: (t) => vi.setSystemTime(t),
    restore: () => vi.useRealTimers(),
  };
}
