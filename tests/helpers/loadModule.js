// =====================================================
// AQUENT test helper — loadModule
// =====================================================
//
// WHY THIS EXISTS
// ---------------
// AQUENT ships as a vanilla-JS static site with NO build step. Engine modules
// are plain `.js` files included with <script> tags in app.html. In the browser
// each module declares a namespace at the top level, e.g.:
//
//     const AquaForecast = { forecast() { ... } };
//
// In a real browser a top-level `const` is reachable as a bare global
// (`AquaForecast`) but NOT as a property of `window`. That makes such files
// awkward to pull into unit/property tests, where we want a concrete reference
// to the namespace object.
//
// THE PATTERN
// -----------
// `loadModule(relativePath, names)` reads the module source, executes it in the
// current (jsdom) global context, and returns the requested namespace
// object(s). It works with BOTH styles a module might use:
//
//   1. Bare top-level declaration:        const AquaForecast = { ... }
//   2. Explicit self-registration:        globalThis.AquaForecast = { ... }
//                                          (or `window.AquaForecast = ...`)
//
// For style (1) we append a tiny capture line to the source so the top-level
// binding is copied onto `globalThis` before the script scope is torn down.
// For style (2) the assignment already lands on `globalThis`, so we just read
// it back. New engine modules are ENCOURAGED to self-register (style 2) so the
// same file works unchanged in the browser and in tests, but either style is
// supported here.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// tests/helpers -> project root
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Load a vanilla AQUENT `.js` module and return its global namespace(s).
 *
 * @param {string} relativePath  Path to the module, relative to project root
 *                               (e.g. 'forecasting.js' or 'config.js').
 * @param {string|string[]} names  The global namespace name(s) the module
 *                               exposes (e.g. 'AquaForecast' or
 *                               ['AquaConfig', 'ECO_DEFAULTS']).
 * @returns {object|object[]}    The namespace object, or an array of them when
 *                               `names` is an array.
 */
export function loadModule(relativePath, names) {
  const abs = path.resolve(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`loadModule: file not found: ${abs}`);
  }

  const requested = Array.isArray(names) ? names : [names];
  let source = fs.readFileSync(abs, 'utf8');

  // Append capture lines so top-level `const`/`let`/`function` bindings become
  // reachable on globalThis after the script runs. Wrapped in try/catch so a
  // module that does not declare every requested name still loads cleanly.
  const capture = requested
    .map(
      (n) =>
        `try { if (typeof ${n} !== 'undefined') globalThis[${JSON.stringify(
          n
        )}] = ${n}; } catch (e) {}`
    )
    .join('\n');

  // Wrap the module + capture in an IIFE. This makes a module's top-level
  // `const`/`let`/`function` declarations FUNCTION-scoped instead of landing in
  // the realm's shared global lexical scope. Without this, loading the same
  // module twice throws "Identifier '...' has already been declared". The
  // capture lines run inside the same IIFE so they can still see those bindings,
  // and references to other modules' globals resolve up the scope chain to
  // globalThis as in the browser.
  const wrapped = `(function(){\n${source}\n;${capture}\n})();`;

  // runInThisContext shares the current global object (the jsdom window in the
  // Vitest jsdom environment); the IIFE keeps each load's top-level scope
  // isolated so repeated loads never collide on `const` redeclaration.
  vm.runInThisContext(wrapped, { filename: abs });

  const resolved = requested.map((n) => {
    const value = globalThis[n];
    if (typeof value === 'undefined') {
      throw new Error(
        `loadModule: '${relativePath}' did not expose a global named '${n}'. ` +
          `Ensure the module declares it at top level or assigns globalThis.${n}.`
      );
    }
    return value;
  });

  return Array.isArray(names) ? resolved : resolved[0];
}

/**
 * Execute an inline vanilla-module source string the same way `loadModule`
 * does. Handy for tiny fixtures in tests without touching disk.
 *
 * @param {string} source  JavaScript source for a vanilla module.
 * @param {string|string[]} names  Global name(s) to capture and return.
 */
export function loadModuleSource(source, names) {
  const requested = Array.isArray(names) ? names : [names];
  const capture = requested
    .map(
      (n) =>
        `try { if (typeof ${n} !== 'undefined') globalThis[${JSON.stringify(
          n
        )}] = ${n}; } catch (e) {}`
    )
    .join('\n');
  vm.runInThisContext(`(function(){\n${source}\n;${capture}\n})();`, {
    filename: 'inline-module.js',
  });
  const resolved = requested.map((n) => globalThis[n]);
  return Array.isArray(names) ? resolved : resolved[0];
}
