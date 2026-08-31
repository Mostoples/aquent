import { defineConfig } from 'vitest/config';

// Vitest configuration for AQUENT.
//
// AQUENT is a vanilla-JS static web app: there is NO build step and the engine
// modules are plain `.js` files loaded via <script> that attach themselves to a
// global namespace (e.g. AquaForecast, AquaAnomaly, AquaXAI). The `jsdom`
// environment gives those modules a browser-like global (window/document) so
// they can be loaded and exercised in unit/property tests without a bundler.
export default defineConfig({
  test: {
    // Browser-like globals for vanilla modules that touch window/document.
    environment: 'jsdom',
    // Expose describe/it/expect/vi without importing them in every file.
    globals: true,
    // Only pick up our root-level tests; never reach into functions/.
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs}'],
    exclude: ['**/node_modules/**', 'functions/**', '.firebase/**'],
  },
});
