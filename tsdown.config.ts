/**
 * Two artifacts, one per consumer:
 *
 * - `lib/index.js` — the **Node half**. The Cordis Loader imports the row's
 *   package name (`dsh-peak-indicator`) in the host process, so the manifest
 *   must answer the root `"."` export; without it boot fails with
 *   `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined`. This plugin is
 *   client-only, so the root module is browser-free and exports just the tariff
 *   logic and the PRC calendar (useful for tests, scripts, and the SDK).
 * - `lib/client.js` — the **browser half**, resolved through
 *   `exports["./client"]` by `dsh-client-modules` because the manifest declares
 *   `dsh.client`. CommonJS wrapped in the lazy-CJS handoff the module system
 *   expects: `window.__ModuleLoader__.load({ id, factory })`.
 *
 * Every shell-baseline module (`PLATFORM_MODULES`: react, react/jsx-runtime,
 * react-dom, @deepseek-ai/cordis, @deepseek-ai/dsh-client-store,
 * @deepseek-ai/dsh-client-ui-slots, @deepseek-ai/dsh-client-ui-primitives,
 * @deepseek-ai/dsh-client-ui-dockkit) stays an external `require()` answered by
 * the frozen module table; everything else inlines. This plugin has no other
 * runtime dependency: its `@deepseek-ai/dsh-client-ui-*` and
 * `@deepseek-ai/dsh-api-*` edges are `import type` only, and the stylesheet is a
 * string (`src/client/styles.ts`), so `lib/client.js` is the whole browser plugin.
 *
 * Both entries build from tsc's `lib/types` half rather than from `src`, exactly
 * like the monorepo preset: relative `.ts` specifiers are already rewritten to
 * `.js`, and the source maps chain back through the tsc maps into TypeScript.
 *
 * Inside the repository, delete this file and use the shared preset instead:
 *
 * ```ts
 * import { clientBundle } from '../tsdown.client.ts'
 * export default clientBundle('@deepseek-ai/dsh-client-ui-peak-indicator', ['lib/types/index.js'])
 * ```
 */
import { defineConfig } from 'tsdown'

/** Plugin id the loader keys the factory under; equals the package name. */
const PLUGIN_ID = 'dsh-peak-indicator'

/** Shell-seeded modules every dynamic client bundle resolves against. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

export default defineConfig([
  // Node half: plain ESM, no wrapper, no browser globals.
  {
    entry: { index: 'lib/types/index.js' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
  },
  // Browser half: the loader factory the DSH module system materializes.
  {
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2024',
    // The loader serves `lib/client.js`; with `"type": "module"` in the manifest
    // a CJS output would otherwise be emitted as `client.cjs` and never resolve.
    fixedExtension: false,
    outputOptions: {
      entryFileNames: '[name].js',
      // Executing the script only registers the factory; every module body side
      // effect (including the style tag) runs at materialization. Mirrors
      // packages/client/tsdown.client.ts in the monorepo.
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
    // Types ship from `tsc -p tsconfig.build.json` (lib/types).
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: (id: string) => PLATFORM_MODULES.includes(id),
      alwaysBundle: (id: string) => !PLATFORM_MODULES.includes(id),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
  },
])
