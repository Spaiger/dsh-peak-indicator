/** Configuration normalization. */

import { describe, expect, it } from 'vitest'
import {
  CONFIG_GLOBAL,
  DEFAULTS,
  normalizeConfig,
  readConfig,
  resolveLanguage,
} from '../src/config.ts'

describe('normalizeConfig', () => {
  it('returns the defaults for absent or malformed input', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULTS)
    expect(normalizeConfig(null)).toEqual(DEFAULTS)
    expect(normalizeConfig('nonsense')).toEqual(DEFAULTS)
    expect(normalizeConfig({})).toEqual(DEFAULTS)
  })

  it('keeps the required defaults', () => {
    expect(DEFAULTS.refreshMs).toBe(30_000)
    expect(DEFAULTS.fastRefreshMs).toBe(1_000)
    expect(DEFAULTS.slot).toBe('conversation.session.header.utilities')
    expect(DEFAULTS.order).toBe(-20)
    expect(DEFAULTS.showWhenUnknown).toBe(false)
    expect(DEFAULTS.providerIds).toContain('deepseek-account')
    expect(DEFAULTS.providerIds).toContain('deepseek-official')
  })

  it('merges the accepted fields', () => {
    const config = normalizeConfig({
      refreshMs: 60_000,
      order: 40,
      slot: 'conversation.session.header.actions',
      language: 'en',
      showWhenUnknown: true,
      providerIds: ['my-proxy'],
    })
    expect(config.refreshMs).toBe(60_000)
    expect(config.order).toBe(40)
    expect(config.slot).toBe('conversation.session.header.actions')
    expect(config.language).toBe('en')
    expect(config.showWhenUnknown).toBe(true)
    expect(config.providerIds).toEqual(['my-proxy'])
    // Untouched fields keep their default.
    expect(config.modelPrefixes).toEqual(DEFAULTS.modelPrefixes)
  })

  it('rejects values it cannot use', () => {
    const config = normalizeConfig({
      refreshMs: 0,
      fastRefreshMs: 'fast',
      order: Number.NaN,
      slot: 'conversation.session.header.corner',
      language: 'de',
      providerIds: 'deepseek',
      modelPrefixes: [],
    })
    expect(config.refreshMs).toBe(DEFAULTS.refreshMs)
    expect(config.fastRefreshMs).toBe(DEFAULTS.fastRefreshMs)
    expect(config.order).toBe(DEFAULTS.order)
    expect(config.slot).toBe(DEFAULTS.slot)
    expect(config.language).toBeUndefined()
    expect(config.providerIds).toEqual(DEFAULTS.providerIds)
    expect(config.modelPrefixes).toEqual(DEFAULTS.modelPrefixes)
  })
})

describe('readConfig', () => {
  it('reads the injected global', () => {
    const scope = { [CONFIG_GLOBAL]: { refreshMs: 15_000 } }
    expect(readConfig(scope).refreshMs).toBe(15_000)
  })

  it('falls back to the defaults with no global', () => {
    expect(readConfig({})).toEqual(DEFAULTS)
    expect(readConfig(undefined)).toEqual(DEFAULTS)
    expect(readConfig(globalThis)).toEqual(DEFAULTS)
  })
})

describe('resolveLanguage', () => {
  it('prefers the configured language', () => {
    expect(resolveLanguage({ ...DEFAULTS, language: 'en' }, 'ru-RU')).toBe('en')
  })

  it('follows the browser otherwise', () => {
    expect(resolveLanguage(DEFAULTS, 'en-US')).toBe('en')
    expect(resolveLanguage(DEFAULTS, 'ru-RU')).toBe('ru')
    expect(resolveLanguage(DEFAULTS, undefined)).toBe('ru')
  })
})
