/**
 * Manifest and artifact contract with the DSH host.
 *
 * These are the checks whose absence produced a real boot failure: the Cordis
 * Loader imports a row's **package name** in the host process, so the manifest
 * must answer the root `"."` export with a Node-importable module, while
 * `dsh-client-modules` separately resolves `exports["./client"]` because the
 * manifest declares `dsh.client`, and the plugin manager refuses any package
 * without `dsh.bundle`.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)

/** The published manifest. */
function manifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>
}

/** One export condition map, narrowed for `noUncheckedIndexedAccess`. */
function exportEntry(key: string): { types: string; default: string } {
  const exports = manifest().exports as Record<string, { types: string; default: string } | undefined>
  const entry = exports[key]
  if (entry === undefined) throw new Error(`package.json exports has no "${key}" entry`)
  return entry
}

/** Resolve one package specifier exactly the way Node would for the profile. */
function resolveExport(specifier: string): string {
  return require.resolve(specifier, { paths: [ROOT] })
}

describe('package manifest', () => {
  it('answers the root export the Cordis Loader imports', () => {
    expect(exportEntry('.').default).toBe('./lib/index.js')
    expect(exportEntry('.').types).toBe('./lib/types/index.d.ts')
    expect(manifest().main).toBe('lib/index.js')
    expect(manifest().types).toBe('lib/types/index.d.ts')
  })

  it('answers the ./client export dsh-client-modules resolves', () => {
    expect(exportEntry('./client').default).toBe('./lib/client.js')
  })

  it('declares both DSH roles: an installable bundle and a web client plugin', () => {
    const dsh = manifest().dsh as { bundle: { patch: string }; client: { platform: string; inject: string[] } }
    // Without dsh.bundle the plugin manager rejects the install with `not-bundle`.
    expect(dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(dsh.client.platform).toBe('web')
    expect(dsh.client.inject).toEqual([])
  })

  it('ships every file the two roles need', () => {
    const files = manifest().files as string[]
    for (const entry of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'locale/*.json']) {
      expect(files, entry).toContain(entry)
    }
  })

  it('keeps the DSH peer ranges wide enough for both shipped lines', () => {
    // The host refuses an install when a @deepseek-ai/dsh* peer range does not
    // satisfy the running DSH version (includePrerelease), so the ranges must
    // cover 0.2.0-rc.2 (cordis ~4.0.4) and 0.2.1-alpha.2 (cordis ~4.0.5-alpha.1).
    const peers = manifest().peerDependencies as Record<string, string>
    expect(peers['@deepseek-ai/cordis']).toBe('>=4.0.4 <5.0.0-0')
    expect(peers['@deepseek-ai/dsh']).toBe('>=0.2.0-rc.1 <0.3.0-0')
    expect(peers['@deepseek-ai/dsh-client-ui-primitives']).toBe('>=0.0.1-0 <0.3.0-0')
  })
})

describe('profile patch layer', () => {
  it('inserts exactly one Loader row naming this package', () => {
    const yaml = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
    const lines = yaml.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
    expect(lines).toContain('- insert:')
    expect(lines).toContain('id: peak-indicator')
    expect(lines).toContain(`name: ${manifest().name as string}`)
    // A client plugin row carries no config and no service injection.
    expect(lines).not.toContain('config:')
    expect(lines).not.toContain('inject:')
  })
})

describe('built artifacts', () => {
  it('resolves the root specifier to a Node-importable module', () => {
    const path = resolveExport('dsh-peak-indicator')
    expect(path.endsWith(join('lib', 'index.js'))).toBe(true)
  })

  it('root module is a valid Cordis plugin with no host-side behavior', async () => {
    // `ctx.registry.plugin(exports)` rejects anything that is not a function or
    // an object with `apply`, which is why a browser-only plugin still ships an
    // empty node-half `apply` (the shape `ui-open-in-app` and `ui-session` use).
    const root = await import(pathToFileURL(resolveExport('dsh-peak-indicator')).href) as {
      apply: (...args: unknown[]) => void
      inject?: unknown
    }
    expect(typeof root.apply).toBe('function')
    expect(root.apply()).toBeUndefined()
    // No host injections: the row must not wait on a service the host lacks.
    expect(root.inject).toBeUndefined()
  })

  it('root module republishes the tariff API for node-side consumers', async () => {
    const root = await import(pathToFileURL(resolveExport('dsh-peak-indicator')).href) as {
      getPricingState: (now?: number) => { phase: string; rule: string }
      isPeak: (now: number) => boolean
      CN_HOLIDAYS_2026: readonly string[]
    }
    // Tuesday 2026-10-13 10:30 Beijing: peak. Thursday 2026-10-01: holiday.
    expect(root.getPricingState(Date.UTC(2026, 9, 13, 2, 30)).phase).toBe('peak')
    expect(root.isPeak(Date.UTC(2026, 9, 13, 2, 30))).toBe(true)
    expect(root.getPricingState(Date.UTC(2026, 9, 1, 2, 30)).rule).toBe('holiday')
    expect(root.CN_HOLIDAYS_2026).toHaveLength(33)
  })

  it('keeps the Node half free of browser and React dependencies', () => {
    const source = readFileSync(join(ROOT, 'lib/index.js'), 'utf8')
    expect(source).not.toContain('require(')
    expect(source).not.toContain('__ModuleLoader__')
    expect(source).not.toContain('document.')
    expect(source).not.toContain('react')
  })

  it('resolves the ./client specifier to the loader-wrapped browser bundle', () => {
    const path = resolveExport('dsh-peak-indicator/client')
    expect(path.endsWith(join('lib', 'client.js'))).toBe(true)
    const source = readFileSync(path, 'utf8')
    // The lazy-CJS handoff, formatted by the bundler: registration on the
    // outside, `module.exports` returned from the factory on the inside.
    expect(source.startsWith('window.__ModuleLoader__.load({')).toBe(true)
    expect(source).toContain(`id: "${manifest().name as string}"`)
    expect(source).toMatch(/factory:\s*\(require\)\s*=>\s*\{/u)
    expect(source.replace(/\s+/gu, ' ')).toContain('return module.exports; } });')
    expect(source).toContain('exports.apply')
    expect(source).toContain('exports.inject')
  })

  it('serves the localized display metadata the plugin list reads', () => {
    for (const language of ['en', 'ru', 'zh']) {
      const path = resolveExport(`dsh-peak-indicator/locale/${language}.json`)
      const meta = JSON.parse(readFileSync(path, 'utf8')) as { meta: { title: string; description: string } }
      expect(meta.meta.title.length, language).toBeGreaterThan(0)
      expect(meta.meta.description.length, language).toBeGreaterThan(0)
    }
  })
})
