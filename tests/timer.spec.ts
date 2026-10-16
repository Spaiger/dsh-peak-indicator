/**
 * Countdown liveness over a mounted component's lifetime.
 *
 * Two regressions live here. The frozen-label bug: the countdown subtracted a
 * *stopped* clock and cancelled every update, pinning the label at its
 * mount-time value. And the polling-waste bug: a fixed 30 s interval re-rendered
 * twice per displayed minute and still showed a minute up to 29 s stale. The
 * current design wakes on display-digit boundaries instead — one wake per wall
 * minute above one hour, one per wall second below — so these tests assert
 * both liveness and the aligned rate: half a minute must pass silently, the
 * minute boundary must move the label, and a phase change must land exactly on
 * its instant with zero polling latency.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInThisContext } from 'node:vm'
import * as React from 'react'
import { createElement } from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import TestRenderer from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const BUNDLE = resolve(import.meta.dirname, '../lib/client.js')

/** Stand-in for the shell's Tooltip: keeps the anchor, surfaces the label. */
function TooltipStub(props: {
  readonly label: string | (() => string)
  readonly children: React.ReactElement<Record<string, unknown>> | null
}): React.ReactElement | null {
  if (props.children === null || props.children === undefined) return null
  const label = typeof props.label === 'function' ? props.label() : props.label
  return createElement(props.children.type, { ...props.children.props, 'data-tooltip': label })
}

/** Materialize the built bundle the way the DSH module system does. */
function materialize(): { apply: (ctx: unknown) => void } {
  let registration: { factory: (require: (id: string) => unknown) => unknown } | null = null
  const win = globalThis as { window?: { __ModuleLoader__?: unknown } }
  const previous = win.window
  win.window = { __ModuleLoader__: { load: (entry: typeof registration) => { registration = entry } } }
  try {
    runInThisContext(readFileSync(BUNDLE, 'utf8'), { filename: BUNDLE })
  } finally {
    if (previous === undefined) delete win.window
    else win.window = previous
  }
  const table: Record<string, unknown> = {
    'react': React,
    'react/jsx-runtime': ReactJsxRuntime,
    '@deepseek-ai/dsh-client-ui-primitives': { Tooltip: TooltipStub },
  }
  return (registration as unknown as { factory: (r: (id: string) => unknown) => unknown })
    .factory(id => table[id]) as { apply: (ctx: unknown) => void }
}

/** Register the plugin against a stub context and return the capsule component. */
function capsuleComponent(): (props: Record<string, unknown>) => unknown {
  const registered: { component: (props: Record<string, unknown>) => unknown }[] = []
  materialize().apply({
    slots: {
      inject: (_name: string, run: () => void) => { run() },
      register: (_options: unknown, component: (props: Record<string, unknown>) => unknown) => {
        registered.push({ component })
      },
    },
  })
  const entry = registered[0]
  if (entry === undefined) throw new Error('the plugin registered no slot entry')
  return entry.component
}

/** One Beijing instant. */
function bj(y: number, m: number, d: number, hh: number, mm: number, ss = 0): number {
  return Date.UTC(y, m - 1, d, hh - 8, mm, ss)
}

/** Render one mounted capsule over a DeepSeek session. */
function mount(component: (props: Record<string, unknown>) => unknown): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined
  TestRenderer.act(() => {
    renderer = TestRenderer.create(createElement(component as never, {
      useProjection: () => ({
        next: { provider: 'deepseek-account', model: 'deepseek-v4-pro' },
        lastUsed: null,
      }),
    }))
  })
  return renderer as TestRenderer.ReactTestRenderer
}

/** The capsule's visible text. */
function labelOf(renderer: TestRenderer.ReactTestRenderer): string {
  const node = renderer.toJSON() as { children: string[] } | null
  return (node?.children ?? []).map(String).join('')
}

describe('countdown liveness on a mounted capsule', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('wakes once per minute above one hour, and never between boundaries', () => {
    // Tuesday 2026-10-13 18:30:00 Beijing: off-peak until Wednesday 09:00 → 14h 30m.
    vi.setSystemTime(bj(2026, 10, 13, 18, 30))
    const renderer = mount(capsuleComponent())
    try {
      expect(labelOf(renderer)).toBe('🌙 Непик · через 14ч 30м пик')

      // Half a minute later nothing may have re-rendered: the next wake is the
      // 18:31 boundary. This pins the aligned rate (one wake per minute, the
      // old 30 s poll fired twice per minute and half of its renders were
      // no-ops that still showed a stale minute).
      TestRenderer.act(() => { vi.advanceTimersByTime(30_000) })
      expect(labelOf(renderer)).toBe('🌙 Непик · через 14ч 30м пик')

      // The boundary wake moves the minute, exactly and immediately.
      TestRenderer.act(() => { vi.advanceTimersByTime(30_000) })
      expect(labelOf(renderer)).toBe('🌙 Непик · через 14ч 29м пик')

      // Four more boundaries. This is the assertion the frozen-clock bug failed.
      TestRenderer.act(() => { vi.advanceTimersByTime(4 * 60_000) })
      expect(labelOf(renderer)).toBe('🌙 Непик · через 14ч 25м пик')

      // Still minute mode half an hour on.
      TestRenderer.act(() => { vi.advanceTimersByTime(26 * 60_000) })
      expect(labelOf(renderer)).toBe('🌙 Непик · через 13ч 59м пик')
    } finally {
      TestRenderer.act(() => { renderer.unmount() })
    }
  })

  it('ticks every second under one hour, aligned to second boundaries', () => {
    // Wednesday 2026-10-14 08:15:00 Beijing: 45 minutes to the peak window.
    vi.setSystemTime(bj(2026, 10, 14, 8, 15))
    const renderer = mount(capsuleComponent())
    try {
      expect(labelOf(renderer)).toBe('🌙 Непик · через 45:00 пик')
      TestRenderer.act(() => { vi.advanceTimersByTime(1_000) })
      expect(labelOf(renderer)).toBe('🌙 Непик · через 44:59 пик')
      TestRenderer.act(() => { vi.advanceTimersByTime(59_000) })
      expect(labelOf(renderer)).toBe('🌙 Непик · через 44:00 пик')
    } finally {
      TestRenderer.act(() => { renderer.unmount() })
    }
  })

  it('flips the capsule exactly at the phase change, with zero latency', () => {
    // Wednesday 2026-10-14 08:59:40 Beijing: 20 seconds to the peak window.
    vi.setSystemTime(bj(2026, 10, 14, 8, 59, 40))
    const renderer = mount(capsuleComponent())
    try {
      expect(labelOf(renderer)).toBe('🌙 Непик · через 00:20 пик')
      // Second-boundary wakes cross 09:00:00 exactly; the wake on the boundary
      // flips the phase with no polling lag (the old 30 s poll showed the old
      // phase for up to half a minute here).
      TestRenderer.act(() => { vi.advanceTimersByTime(20_000) })
      expect(labelOf(renderer)).toBe('⚡ Пик · до скидки 3ч 0м')
      // Back above one hour the clock relaxes to minute wakes.
      TestRenderer.act(() => { vi.advanceTimersByTime(60_000) })
      expect(labelOf(renderer)).toBe('⚡ Пик · до скидки 2ч 59м')
    } finally {
      TestRenderer.act(() => { renderer.unmount() })
    }
  })
})
