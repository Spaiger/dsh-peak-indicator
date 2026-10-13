# dsh-peak-indicator

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

A client-only plugin for the **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH)** web UI: a compact ⚡ Peak / 🌙 Off-peak capsule in the Session header with a live countdown to the next tariff change.

```
⚡ Peak · discount in 1h 30m          🌙 Off-peak · peak in 04:32
```

- **Beijing time only** (`Asia/Shanghai`, UTC+8) — never the viewer's local zone.
- **PRC statutory holidays** are off-peak all day; **make-up workdays (调休上班)** follow the weekday rule even on Saturdays and Sundays.
- **Countdown to the next real phase change**, `Xh Ym` above one hour and `MM:SS` below it.
- **Hover tooltip** with the current Beijing clock, the rule that decided today, the exact switch instant, and the full published tariff text.
- **Hidden for non-DeepSeek sessions** — it never guesses and never misleads.
- **Zero network requests, zero server half.** Every decision is a pure function of one instant.

**Russian documentation / Документация на русском:** [README.ru.md](README.ru.md)

---

## Quick start

```bash
npm install          # .npmrc carries legacy-peer-deps (the DSH alpha line conflicts on cordis)
npm test             # builds both halves, then runs the 85-test suite
npm run demo         # builds dist/demo.html and prints a happy-dom render check
npm run verify       # typecheck → build → test → demo, in one go
```

The toolchain needs **Node 20+**; `tsdown` is pinned to `0.22.2` because `0.22.14+`
requires Node 22 (`Promise.withResolvers`). The plugin itself runs inside DSH,
not inside your toolchain.

---

## Tariff rules

Source: [DeepSeek API — Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing):
*“Peak hours are 09:00–12:00 and 14:00–18:00 Beijing time, Monday–Friday, excluding Chinese statutory holidays; all other times (including weekends and holidays, all day) are off-peak at 50% of the peak rate.”*

The evaluation ladder in [`src/pricing.ts`](src/pricing.ts) is contractual and must not be rearranged:

1. date is in `CN_HOLIDAYS` → **off-peak all day** (the hour is ignored);
2. date is in `CN_MAKEUP_WORKDAYS` → the day is an **ordinary weekday** (even on Sat/Sun);
3. otherwise ISO weekday 6 or 7 → **off-peak all day**;
4. otherwise (weekday) → hour inside `09:00–12:00` or `14:00–18:00` → **peak**, else **off-peak**.

Window edges are start-inclusive, end-exclusive: `12:00:00.000` Beijing is already off-peak.

### The PRC calendar (hard-coded, by design)

The 2026 tables come from the State Council notice **国办发明电〔2025〕7号** (2025-11-04, published in the State Council Gazette 2025 No. 32): 33 holiday days and 6 make-up workdays (`01-04`, `02-14`, `02-28`, `05-09`, `09-20`, `10-10`). No lunar-calendar arithmetic, no network — the hard-coded variant is the correct one for a billing indicator.

**2027 is intentionally empty** (`CN_HOLIDAYS_2027 = []`): the notice is normally published in November, and invented dates would silently misprice sessions. Until a year is covered, the capsule gets a dashed border and the tooltip warns `⚠ The PRC holiday calendar only covers 2026…`. Adding a year is two constants plus one line in `HOLIDAY_CALENDAR` — see the comment in [`src/holidays.ts`](src/holidays.ts).

---

## Installing into DSH

Works with DSH **0.2.x** (verified against the `0.2.0-rc.2` and `0.2.1-alpha.2` lines).

### The API this targets (and why it is not `definePlugin`)

The original brief described an SDK with `definePlugin(...)` and a
`conversation.session.header.actions` slot. The shipped DSH (checked against
`deepseek-ai/deepseek-harness`, line **0.2.1-alpha.2**) is Cordis-based and has
no `definePlugin`:

| Brief wording | Actual DSH |
|---|---|
| `definePlugin({...})` | a plugin is a module with `export const inject` and `export function apply(ctx)` |
| slot `conversation.session.header.actions`, `order: -20` | both seats exist: `conversation.session.header.actions` (title-adjacent, left) and **`conversation.session.header.utilities`** (right-aligned, next to the session-log export) |
| “DSH CSS modules” | inside the monorepo, `*.module.css` via the shared `clientBundle()` preset; a standalone tsdown/esbuild build emits a separate `lib/style.css` the loader never fetches, so the styles here are inlined through one shared `<style>` tag (a route the brief allows) |

The default registration is `conversation.session.header.utilities` with
`order: -20` — first from the left in the right-aligned group, since the shipped
neighbours sit at `-10` (`dsh-client-ui-open-in-app`) and `0`
(`dsh-session-log-export`, the session-log export itself). That matches the
brief's primary variant; its alternative is one config key away:
`slot: 'conversation.session.header.actions'`.

Registration goes through `ctx.slots.inject(seat, …)` because both seats are
owned by `ui-conversation`: contributing through `inject` ties the entry's
lifetime to the owner's declaration instead of failing while the header is
unmounted.

### What DSH requires from an installable plugin

Installation is built around **bundles**: the plugin manager refuses any package without a `dsh.bundle.patch` declaration (`not-bundle`), and the browser half is discovered separately through `dsh.client`. This package declares both:

```json
{
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": [], "platform": "web" }
  }
}
```

```yaml
# cordis.patch.yml — one Loader row, no config, no service injection
- insert:
    - id: peak-indicator
      name: dsh-peak-indicator
```

A plugin package must also ship **two halves**, or the host fails to boot:

| Artifact | Loaded by | Why |
|---|---|---|
| `lib/index.js` (root `"."` export, ESM) | the Cordis Loader, in the host Node process | the Loader row names the package; without a root export boot dies with `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined` |
| `lib/client.js` (`exports["./client"]`, CJS in a `window.__ModuleLoader__.load({ id, factory })` wrapper) | `dsh-client-modules` → `/plugins` → the browser | the `dsh.client` manifest is what puts it into the boot graph |

The root module is a valid Cordis plugin with an intentionally empty `apply()` — the exact shape the shipped client-only packages use (`dsh-client-ui-open-in-app`, `dsh-client-ui-session`) — and doubles as a Node-side API for the tariff logic (`getPricingState`, `isPeak`, the holiday tables).

Version compatibility: every `@deepseek-ai/dsh*` peer range is checked against the running DSH version (`includePrerelease`); a miss hard-fails the install. The ranges here cover both shipped lines:

```json
"peerDependencies": {
  "@deepseek-ai/cordis": ">=4.0.4 <5.0.0-0",
  "@deepseek-ai/dsh": ">=0.2.0-rc.1 <0.3.0-0",
  "@deepseek-ai/dsh-client-ui-primitives": ">=0.0.1-0 <0.3.0-0"
}
```

### Way A — the web UI (Settings → Plugins → Add plugin)

```bash
git clone https://github.com/<you>/dsh-peak-indicator
cd dsh-peak-indicator
npm install
npm run build          # produces lib/index.js, lib/client.js, lib/types — DSH never builds for you
npm pack               # → dsh-peak-indicator-<version>.tgz
```

Then in DSH, **Settings → Plugins → Add plugin**, and enter any of:

| Source | Value |
|---|---|
| local directory | `/absolute/path/to/dsh-peak-indicator` |
| local tarball | `/absolute/path/to/dsh-peak-indicator-<version>.tgz` |
| npm | `dsh-peak-indicator` (once published; npmmirror selectable) |
| GitHub | `github:<you>/dsh-peak-indicator` or `git+https://…#<sha>` |

Installation targets the running host's profile (`desktop` for the Desktop app, `web` for `dsh web`). After the page reloads, `peak-indicator` appears in the boot graph and in the plugin list with its localized title/description from `locale/{en,ru,zh}.json`.

**Git installs build on the target machine**: pnpm ≥ 10 blocks a git dependency's `prepare` script until you allowlist it — copy the exact key pnpm prints into `$DSH_HOME/profiles/<profile>/pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-peak-indicator: true
```

That allowance executes package code at install time; pin a commit (`#<sha>`) for anything you do not own. Tarballs and registry installs need no allowance.

### Way B — the CLI

```bash
dsh plugin --profile web add /absolute/path/to/dsh-peak-indicator-<version>.tgz
dsh --profile web --dump-config     # must show a "# == dsh-peak-indicator" layer
dsh --profile web

# Desktop: launch and fully quit the app once first, so the profile initializes
dsh plugin --profile desktop add ./dsh-peak-indicator-<version>.tgz

# removal drops both the dependency and the layer
dsh plugin --profile web remove dsh-peak-indicator
```

`dsh plugin --profile <name> …` forwards to pnpm inside the profile directory, so every pnpm verb works. The first add initializes the profile with `@deepseek-ai/dsh-base` and appends this bundle to `dsh.profile.bundles`.

### Way C — a patch layer by hand

Two lines in `$DSH_HOME/profiles/<profile>/cordis.patch.yml` (or any `--patch` overlay), with the package resolvable from that profile:

```yaml
- insert:
    - id: peak-indicator
      name: dsh-peak-indicator
```

Layer order: profile bundles → the profile's own patch → `$DSH_HOME/cordis.patch.yml` → `--patch` overlays; later layers win per row `id`.

### Verifying an install

1. `dsh --profile web --dump-config` shows the bundle's layer and the `peak-indicator` row.
2. **Settings → Plugins** lists the plugin without page-sync errors.
3. A DeepSeek session's header shows the capsule on the right, left of the session-log export action (`order: -20` in `conversation.session.header.utilities`); a non-DeepSeek session shows nothing.
4. From a live page: `cordis_inspect_query { platform: "client", provider: "Slots", method: "listSubTree", args: { root: "conversation.session.header.utilities" } }` — `peak-indicator` must be among the occupants.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined` at profile boot | the root `"."` export or a built `lib/index.js` is missing — rebuild (`npm run build`) and reinstall; present since 0.1.1 |
| `invalid plugin, expect function or object with an "apply" method` | the root module must export `apply()`; this package does |
| `not-bundle` from the plugin manager | `dsh.bundle.patch` missing from the installed package.json |
| `incompatible-version` | a `@deepseek-ai/dsh*` peer range does not match your DSH. Widen the range, or grant an exact exemption: `dsh plugin --profile web allow-version dsh-peak-indicator@<ver> --dsh-version <your dsh> --accept-risk` |
| `Cannot find module …/lib/index.js` / `…/lib/client.js` | installed from sources without a build: local directories are linked as-is, so run `npm install && npm run build` there first; git installs need `prepare` + `allowBuilds`; tarballs carry everything |
| `failed to clear non-directory dirent … (os error 5)` on Windows | pnpm cannot replace the previous entry: stop every DSH process/editor holding the profile or the plugin sources, delete `C:\Users\<you>\.dsh\profiles\web\node_modules\dsh-peak-indicator` manually (`rd` alone if it is a junction, `rd /s /q` if a real directory), then re-add; a reboot clears stubborn handles |
| `Promise.withResolvers is not a function` while building | a `tsdown` newer than `0.22.2` requires Node 22; the pin in `package.json` is deliberate |
| `ERESOLVE` during `npm install` | the DSH alpha line has an unresolvable cordis peer conflict; the repo's `.npmrc` sets `legacy-peer-deps=true` |
| No capsule although the plugin is listed | the session is not DeepSeek (check the composer's model route), or your DSH build does not declare `conversation.session.header.utilities` (needs `ui-conversation`) |

---

## Configuration

Options are read from a global before the bundle materializes (the same trick the shipped `dsh-client-ui-sidebar-documentpreview` uses), so configuration needs neither services nor network:

```js
globalThis.__DSH_PEAK_INDICATOR_CONFIG__ = {
  providerIds: ['deepseek-account', 'deepseek-official', 'my-deepseek-proxy'],
  providerPrefixes: ['deepseek'],
  modelPrefixes: ['deepseek-'],
  showWhenUnknown: false,        // show the capsule before the session's first model request
  refreshMs: 30_000,             // tariff recalculation period (the spec's 30 s)
  fastRefreshMs: 1_000,          // tick period while the countdown shows seconds
  language: undefined,           // 'ru' | 'en'; undefined follows navigator.language
  slot: 'conversation.session.header.utilities',   // or 'conversation.session.header.actions'
  order: -20,
}
```

Every field is optional; malformed values fall back to defaults (`normalizeConfig` is unit-tested). Capsule copy lives in [`src/strings.ts`](src/strings.ts): Russian by default (the original brief's strings), English for `en*` browsers. To follow DSH's own language preference instead, register the dictionaries with `ctx.locale` and declare `locale: NS` on the slot registration — the monorepo route, documented in [README.ru.md](README.ru.md) §6 and §9.8.

---

## How it works

- **Timezone safety.** The only conversion path is `Intl.DateTimeFormat` with `timeZone: 'Asia/Shanghai'`; the reverse direction uses the constant +08:00 offset (China has had no DST since 1991). The suite runs at `TZ=Pacific/Kiritimati` (UTC+14) and asserts the local date differs, so nothing can pass by relying on the machine's zone.
- **Transitions, not day boundaries.** The countdown targets the next *phase* change. Midnight into a holiday changes the rule but not the phase, so the timer runs on to the first real switch — e.g. straight to 09:00 on the first workday after a holiday run.
- **Refresh cadence.** The tariff state recalculates every 30 s; when less than an hour remains the capsule shows seconds and the tick tightens to 1 s so the display does not jump in half-minute steps. Background tabs skip ticks entirely.
- **Session detection.** The durable model route comes from the `modelSelection` projection (`{ lastUsed, next }`) via the framework's `useProjection` hook. Shipped DeepSeek provider ids are `deepseek-account` and `deepseek-official`; a user-defined provider still matches through the `deepseek-*` model prefix. `next` wins over `lastUsed`, so switching away hides the capsule immediately. No projection at all (capability absent) means hidden, even with `showWhenUnknown`.
- **DSH client discipline.** No subscription machinery in the component (local `useState` clock + framework hooks only), derived values via `useMemo`, styles injected as one shared `<style>` tag from a component effect (the DSH module system is lazy-CJS), and the browser bundle keeps only baseline externals: `react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`. Everything else, including the stylesheet, is inlined.
- **Accessibility.** Colour is never the only carrier: emoji, text, `data-phase`, `data-rule`, and an `aria-label` all state the phase.

---

## Demo

```bash
npm run demo     # builds dist/demo.html and prints a happy-dom render check
```

`dist/demo.html` is a single self-contained page (inlined CSS + bundle, no network): a mock DSH session header with the live capsule and tooltip, a Beijing-time scrubber, quick cases (weekday peak, weekend, 2026-10-01 holiday, make-up Saturdays, the sub-hour seconds mode, uncovered 2027), a 24-hour timeline, a 7-day strip, and the acceptance-case table computed on the fly. Open it directly in a browser — it also renders inside sandboxed previews.

---

## Repository layout

```
dsh-peak-indicator/
├── package.json             # dsh.bundle.patch + dsh.client { platform: web }, root & ./client exports
├── cordis.patch.yml         # the profile layer: one Loader row { id, name }
├── locale/{en,ru,zh}.json   # display title/description for Settings → Plugins
├── tsconfig.json            # browser program (src), DSH-strict compiler flags
├── tsconfig.build.json      # emits lib/types (JS + .d.ts)
├── tsconfig.test.json       # test program (node types)
├── tsdown.config.ts         # two artifacts: lib/index.js (node) + lib/client.js (browser)
├── vitest.config.ts         # TZ=Pacific/Kiritimati, on purpose
├── src/
│   ├── index.ts             # node half: empty apply() + the pure tariff API
│   ├── beijing.ts           # Asia/Shanghai via Intl, reverse conversion, calendar walk
│   ├── holidays.ts          # CN_HOLIDAYS_2026 / CN_MAKEUP_WORKDAYS_2026 (+ empty 2027)
│   ├── pricing.ts           # getPricingState(instant): phase, rule, next transition
│   ├── strings.ts           # capsule & tooltip copy (ru/en), countdown formatting
│   ├── provider.ts          # "is this session DeepSeek?"
│   ├── config.ts            # configuration normalization
│   └── client/
│       ├── index.ts         # browser entry: inject + apply, slot registration
│       ├── PeakIndicator.tsx# the capsule (hooks, countdown, tooltip)
│       └── styles.ts        # inline styles + shared <style> injection
├── tests/                   # 85 tests across 6 specs (see below)
├── demo/                    # standalone preview (dist/demo.html)
├── tools/verify-demo.mjs    # happy-dom render check for the demo page
└── .github/workflows/ci.yml # typecheck + build + tests + demo on Node 20 & 22
```

## Development

```bash
npm install        # .npmrc carries legacy-peer-deps for the DSH alpha line
npm test           # bundles first (the bundle spec tests the artifact), then 85 tests
npm run verify     # typecheck → build → test → demo, in one go
```

| Script | What it does |
|---|---|
| `npm run typecheck` | two strict programs: browser `src` and node `tests` |
| `npm run build` | typecheck → `tsc -p tsconfig.build.json` → `tsdown` (both halves) |
| `npm run bundle` | browser + node bundles only |
| `npm run types` | declarations into `lib/types` |
| `npm run test:unit` | vitest without rebuilding |
| `npm run demo` | build + render-check `dist/demo.html` |

### Tests

85 tests, all green on CI (Node 20 and 22):

- **`pricing.spec.ts` (31)** — every case the brief demands (weekday peak hour, weekday off-peak hour, Saturday, Sunday, weekday holiday inside a peak window, make-up workday Saturday), window edges to the millisecond, midnight-into-holiday, a holiday run ending on a weekend, Friday 18:00 → Monday 09:00, the New-Year boundary into an uncovered year, table integrity (make-up days only on weekends, never on holidays), and a **minute-by-minute sweep of a full week** asserting every instant's next transition is in the future, flips the phase, and lands exactly on a tariff boundary.
- **`strings.spec.ts` (14)** — Russian and English capsule/tooltip copy, countdown formats, the stale-calendar warning, accessible names.
- **`provider.spec.ts` (12)** — DeepSeek detection by provider id, prefix, model prefix, `next` vs `lastUsed`, absent projection.
- **`config.spec.ts` (8)** — normalization and fallbacks.
- **`bundle.spec.ts` (8)** — executes the built `lib/client.js` through `window.__ModuleLoader__.load({ id, factory })`, materializes it with a fake module table, runs `apply()` against a stub `ctx`, and renders the registered component: plugin shape (`inject === ['slots']`, registration into `conversation.session.header.utilities` with `id: 'peak-indicator'`, `order: -20`), `null` for non-DeepSeek sessions, correct text/`data-*`/tooltip otherwise.
- **`install.spec.ts` (12)** — the host contract: root `"."` and `./client` exports, `dsh.bundle` + `dsh.client`, `files`, peer ranges, patch layer contents, root module as a valid Cordis plugin with a no-op `apply`, and a Node half free of browser/React dependencies.

### Build pipeline

`npm run build` = typecheck → `tsc -p tsconfig.build.json` (writes JS **and** `.d.ts` into `lib/types`) → `tsdown`. Like the monorepo preset, bundling consumes the emitted `lib/types/**.js` rather than `src`, so relative `.ts` specifiers are already rewritten and `lib/client.js.map` chains back through the tsc maps into the TypeScript sources. `lib/client.js` is CommonJS wrapped exactly as the shared preset wraps it:

```js
window.__ModuleLoader__.load({ id: "dsh-peak-indicator", factory: (require) => { … return module.exports } });
```

### Contributing back into the DSH monorepo

For a first-party contribution instead of an external package: move the directory to `packages/client/peak-indicator`, rename to `@deepseek-ai/dsh-client-ui-peak-indicator`, replace `tsdown.config.ts` with the shared preset (`clientBundle(...)`), switch tsconfigs to `extends: "../../../tsconfig.base.client.json"` with project references, use `workspace:*` versions, and add a `- id: ui-peak-indicator` row to `packages/bundle/web-app/cordis.patch.yml`. That route also unlocks CSS Modules and the framework locale system. Full walkthrough in [README.ru.md](README.ru.md) §9.8.

---

## Deliberately not done

- No lunar-calendar computation — hard-coded tables only (the brief's Variant A).
- No reliance on the viewer's timezone; no DST handling beyond "China has none".
- No network requests, no caching outside the plugin, no server half.
- Non-DeepSeek sessions render `null`, not "hidden by CSS".
- The countdown never claims a change at a boundary the user cannot observe.

## Limitations

- Countdowns longer than a day render in hours (`166h 30m` across long holiday runs) — the brief's `Xh Ym` format, without day units.
- An uncovered year is treated as ordinary weekdays, but the capsule marks itself stale (dashed border + tooltip warning) instead of pretending to know.
- `Tooltip` from `@deepseek-ai/dsh-client-ui-primitives` is the only runtime UI dependency; it is part of the shell's baseline module table, but on very old DSH builds swap it for `title` or a custom hover card.

## License

MIT — see [LICENSE](LICENSE).
