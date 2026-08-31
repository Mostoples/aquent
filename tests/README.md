# AQUENT Test Infrastructure

Root-level test harness for AQUENT's vanilla-JS engine modules using
**Vitest + fast-check** in a **jsdom** environment. There is no build step —
this harness loads plain `.js` files the same way the browser does.

## Running tests

```bash
npm install     # once, installs vitest, fast-check, jsdom (root devDependencies)
npm test        # runs `vitest --run` (single run, not watch mode)
```

> The root `package.json` / `node_modules` are independent of `functions/`.
> Do not run these commands from `functions/`.

## Layout

```
tests/
  helpers/
    loadModule.js   # loads a vanilla module and returns its global namespace
    mocks.js        # localStorage / fetch / timer mocks
  fixtures/
    sample-module.js # reference module shape for the loading pattern
  smoke.test.js     # verifies the harness end-to-end (jsdom, fast-check, mocks)
  README.md
```

## The vanilla-module pattern

Engine modules (`config.js`, `forecasting.js`, `anomaly.js`, `xai.js`, ...) are
loaded in `app.html` via `<script>` and expose a global namespace. To make them
testable, a module should **self-register** onto `globalThis`/`window` in
addition to its top-level declaration:

```js
const AquaForecast = {
  forecast(history, horizonHours = 24) { /* ... */ },
};

if (typeof window !== 'undefined') window.AquaForecast = AquaForecast;
if (typeof globalThis !== 'undefined') globalThis.AquaForecast = AquaForecast;
```

In tests, load it and get the namespace back:

```js
import { loadModule } from './helpers/loadModule.js';

const AquaForecast = loadModule('forecasting.js', 'AquaForecast');
```

`loadModule` also supports modules that only declare a bare top-level
`const`/`function` (no explicit self-registration) by capturing the binding
after the script runs — but self-registration is preferred because the same
file then works identically in the browser and in tests.

## Mocks

```js
import {
  installLocalStorageMock,
  installFetchMock,
  makeResponse,
  useFakeTimers,
} from './helpers/mocks.js';

const ls = installLocalStorageMock();      // in-memory Web Storage; ls.restore() when done
const f  = installFetchMock({ 'thresholds.json': { ph: { min: 6.5 } } });
const t  = useFakeTimers(0);               // fake timers for AI 30s timeout / streak days
```

## Property tests

Each Correctness Property (1–62) from the design becomes one property-based test
with ≥ 100 iterations and a tag comment:

```js
// Feature: advanced-features-upgrade, Property {number}: {property text}
```
