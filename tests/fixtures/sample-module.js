/* =====================================================
   AQUENT test fixture — sample vanilla module
   -----------------------------------------------------
   Mirrors the shape of a real engine module: a top-level namespace declaration
   plus an explicit self-registration onto globalThis. New engine modules
   (config.js, forecasting.js, ...) should follow this pattern so the same file
   loads unchanged both in app.html (<script>) and in tests (loadModule).
   ===================================================== */
const AquaSample = {
  add(a, b) {
    return a + b;
  },
  echo(x) {
    return x;
  },
};

// Self-registration: works in the browser and is captured by loadModule.
// `typeof window` guard keeps this safe in non-DOM contexts.
if (typeof window !== 'undefined') {
  window.AquaSample = AquaSample;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AquaSample = AquaSample;
}
