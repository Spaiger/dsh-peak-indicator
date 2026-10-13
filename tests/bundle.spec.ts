/**
 * Built-artifact smoke test.
 *
 * Runs the emitted `lib/client.js` exactly the way the DSH client module system
 * does — `window.__ModuleLoader__.load({ id, factory })`, then
 * `factory(require)` with the shell's frozen module table — and asserts the
 * Cordis plugin shape, the slot registration, and what the capsule renders for
 * a DeepSeek and for a non-DeepSeek Session.
 *
 * Skipped until `npm run bundle` has produced the artifact.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInThisContext } from 'node:vm'
import * as React from 'react'
import { createElement } from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import TestRenderer from 'react-test-renderer'
import { beforeAll, describe, expect, it } from 'vitest'

const BUNDLE = resolve(import.meta.dirname, '../lib/client.js')

/** One registration recorded by the fake slot registry. */
interface Registration {
  readonly options: Record<string, unknown>
  readonly component: (props: never) => unknown
}

/** A fake `ctx` that records `slots.inject` / `slots.register` calls. */
function createFakeContext() {
  const injected: string[] = []
  const registered: Registration[] = []
  return {
    injected,
    registered,
    ctx: {
      slots: {
        inject: (name: string, run: () => unknown) => {
          injected.push(name)
          run()
        },
        register: (options: Record<string, unknown>, component: (props: never) => unknown) => {
          registered.push({ options, component })
        },
      },
    },
  }
}

/**
 * Stand-in for the shell's `Tooltip`.
 *
 * The real one is a DOM primitive (portal, ResizeObserver, pointer events) that
 * a Node test renderer cannot drive; this keeps the anchor and surfaces the
 * resolved label as an attribute, which is what the assertions need. The
 * component under test is unchanged: it still consumes the module table.
 */
/** One rendered capsule: the stub keeps the anchor and adds the label. */
type StubNode =
  | { readonly type: string; readonly props: Record<string, unknown>; readonly children: unknown[] }
  | null

function TooltipStub(props: {
  readonly label: string | (() => string)
  readonly children: React.ReactElement<Record<string, unknown>> | null
}): React.ReactElement | null {
  // The capsule renders `null` for a non-DeepSeek Session; a tooltip must not
  // resurrect it, so the stub propagates the absence.
  if (props.children === null || props.children === undefined) return null
  const label = typeof props.label === 'function' ? props.label() : props.label
  return createElement(props.children.type, { ...props.children.props, 'data-tooltip': label })
}

/** The rendered capsule, narrowed for assertions. */
function capsuleOf(renderer: TestRenderer.ReactTestRenderer | undefined): StubNode {
  return (renderer?.toJSON() ?? null) as StubNode
}

/** The shell's baseline module table, narrowed to what this bundle requests. */
function moduleTable(): (id: string) => unknown {
  const table: Record<string, unknown> = {
    'react': React,
    'react/jsx-runtime': ReactJsxRuntime,
    '@deepseek-ai/dsh-client-ui-primitives': { Tooltip: TooltipStub },
  }
  return (id: string): unknown => {
    if (!(id in table)) throw new Error(`module table cannot answer "${id}"`)
    return table[id]
  }
}

/** Load the built bundle through the loader handoff and materialize it. */
function materialize(): { inject: string[]; apply: (ctx: unknown) => void } {
  let registration: { id: string; factory: (require: (id: string) => unknown) => unknown } | null = null
  // The loader facade the shell installs before any plugin script runs. The
  // bundle is evaluated in this realm (not a fresh vm context) so it keeps the
  // real timers its interval needs.
  const loader = {
    load: (entry: { id: string; factory: (require: (id: string) => unknown) => unknown }) => {
      registration = entry
    },
  }
  const win = globalThis as { window?: { __ModuleLoader__?: unknown } }
  const previousWindow = win.window
  win.window = { __ModuleLoader__: loader }
  try {
    runInThisContext(readFileSync(BUNDLE, 'utf8'), { filename: BUNDLE })
  } finally {
    if (previousWindow === undefined) delete win.window
    else win.window = previousWindow
  }
  expect(registration).not.toBeNull()
  expect((registration as unknown as { id: string }).id).toBe('dsh-peak-indicator')
  const exports = (registration as unknown as { factory: (r: (id: string) => unknown) => unknown })
    .factory(moduleTable()) as { inject: string[]; apply: (ctx: unknown) => void }
  return exports
}

// The table hands the bundle this test file's own React and jsx-runtime, so the
// hooks the component calls belong to the renderer that drives it.
/** One Beijing instant, used to make the countdown deterministic. */
function bj(y: number, m: number, d: number, hh: number, mm: number): number {
  return Date.UTC(y, m - 1, d, hh - 8, mm)
}

describe('built client bundle', () => {
  let plugin: { inject: string[]; apply: (ctx: unknown) => void }
  let available = true

  beforeAll(() => {
    try {
      readFileSync(BUNDLE)
      plugin = materialize()
    } catch (error) {
      available = false
      console.warn(`lib/client.js missing or unloadable, skipping: ${String(error)}`)
    }
  })

  it('registers as a Cordis plugin needing only the slot registry', () => {
    if (!available) return
    expect(plugin.inject).toEqual(['slots'])
    expect(typeof plugin.apply).toBe('function')
  })

  it('contributes one entry to the right-aligned Session utilities', () => {
    if (!available) return
    const fake = createFakeContext()
    plugin.apply(fake.ctx)
    expect(fake.injected).toEqual(['conversation.session.header.utilities'])
    expect(fake.registered).toHaveLength(1)
    expect(fake.registered[0]?.options).toMatchObject({
      name: 'conversation.session.header.utilities',
      id: 'peak-indicator',
      order: -20,
    })
  })

  it('renders nothing for a non-DeepSeek Session', () => {
    if (!available) return
    const capsule = renderCapsule(bj(2026, 10, 13, 10, 30), {
      next: { provider: 'openai', model: 'gpt-5.2' },
      lastUsed: { provider: 'openai', model: 'gpt-5.2' },
    })
    expect(capsule).toBeNull()
  })

  it('renders nothing while the host projects no model selection', () => {
    if (!available) return
    expect(renderCapsule(bj(2026, 10, 13, 10, 30), undefined)).toBeNull()
  })

  it('renders the peak capsule for a DeepSeek Session', () => {
    if (!available) return
    // Tuesday 2026-10-13 10:30 Beijing: inside 09:00–12:00, 1ч 30м to the gap.
    const capsule = renderCapsule(bj(2026, 10, 13, 10, 30), {
      next: { provider: 'deepseek-account', model: 'deepseek-v4-pro' },
      lastUsed: null,
    })
    expect(capsule).not.toBeNull()
    expect(capsule?.type).toBe('span')
    expect(capsule?.props['data-phase']).toBe('peak')
    expect(capsule?.props['data-rule']).toBe('workday')
    expect(capsule?.props.className).toContain('dshpi-peak')
    expect(capsule?.props['aria-label']).toContain('Тариф DeepSeek')
    expect(text(capsule)).toBe('⚡ Пик · до скидки 1ч 30м')
    const tooltip = String(capsule?.props['data-tooltip'] ?? '')
    expect(tooltip).toContain('Пекинское время (Asia/Shanghai): 2026-10-13 10:30:00')
    expect(tooltip).toContain('смена на 2026-10-13 12:00:00')
  })

  it('renders the off-peak capsule on a statutory holiday', () => {
    if (!available) return
    // Thursday 2026-10-01 10:30 Beijing: National Day, a peak hour otherwise.
    const capsule = renderCapsule(bj(2026, 10, 1, 10, 30), {
      next: { provider: 'deepseek-official', model: 'deepseek-flash' },
      lastUsed: null,
    })
    expect(capsule?.props['data-phase']).toBe('off-peak')
    expect(capsule?.props['data-rule']).toBe('holiday')
    expect(capsule?.props.className).toContain('dshpi-offpeak')
    expect(text(capsule)).toMatch(/^🌙 Непик · через \d+ч \d+м пик$/u)
    expect(String(capsule?.props['data-tooltip'] ?? '')).toContain('официальный праздник КНР')
  })

  it('renders the make-up workday Saturday as a weekday', () => {
    if (!available) return
    // Saturday 2026-10-10 15:00 Beijing: 调休上班 for the National Day run.
    const capsule = renderCapsule(bj(2026, 10, 10, 15, 0), {
      next: { provider: 'deepseek-account', model: 'deepseek-v4-pro' },
      lastUsed: null,
    })
    expect(capsule?.props['data-phase']).toBe('peak')
    expect(capsule?.props['data-rule']).toBe('makeup-workday')
    expect(text(capsule)).toBe('⚡ Пик · до скидки 3ч 0м')
  })

  it('marks the capsule when the hard-coded calendar has run out', () => {
    if (!available) return
    const capsule = renderCapsule(bj(2027, 3, 3, 10, 0), {
      next: { provider: 'deepseek-account', model: 'deepseek-v4-pro' },
      lastUsed: null,
    })
    expect(capsule?.props.className).toContain('dshpi-stale')
    expect(String(capsule?.props['data-tooltip'] ?? '')).toContain('Календарь праздников КНР загружен только для 2026')
  })
})

/**
 * Materialize the bundle, register it against a fake context, and render one
 * capsule with a fixed clock and a fixed model route.
 * @param now - the instant `Date.now()` reports during the first render.
 * @param projection - the `modelSelection` projection the session hook yields.
 * @returns the rendered capsule, or `null` when the component hid itself.
 */
function renderCapsule(
  now: number,
  projection: { next: unknown; lastUsed: unknown } | undefined,
): StubNode {
  const component = registerOnce().component as unknown as (props: Record<string, unknown>) => unknown
  const realNow = Date.now
  Date.now = () => now
  let renderer: TestRenderer.ReactTestRenderer | undefined
  try {
    TestRenderer.act(() => {
      renderer = TestRenderer.create(createElement(component as never, {
        // Mirrors the framework hook's selector overload, which the component
        // uses: `useProjection(key, selector)` must apply the selector.
        useProjection: (_key: string, selector?: (value: unknown) => unknown) =>
          selector === undefined ? projection : selector(projection),
      }))
    })
  } finally {
    Date.now = realNow
  }
  return capsuleOf(renderer)
}

/** Concatenate a rendered capsule's text children. */
function text(capsule: StubNode): string {
  if (capsule === null) return ''
  return (capsule.children ?? []).map(child => String(child)).join('')
}

/** Apply the plugin once against a fresh fake context and return its entry. */
function registerOnce(): Registration {
  const fake = createFakeContext()
  materialize().apply(fake.ctx)
  const entry = fake.registered[0]
  if (entry === undefined) throw new Error('the plugin registered no slot entry')
  return entry
}
