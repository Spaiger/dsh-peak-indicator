/** Session provider detection: the capsule must stay hidden off DeepSeek. */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  isDeepSeekModelId,
  isDeepSeekProviderId,
  isDeepSeekRoute,
  isDeepSeekSession,
} from '../src/provider.ts'

describe('provider ids', () => {
  it('accepts the shipped DeepSeek provider groups', () => {
    expect(isDeepSeekProviderId('deepseek-account')).toBe(true)
    expect(isDeepSeekProviderId('deepseek-official')).toBe(true)
    expect(isDeepSeekProviderId('deepseek')).toBe(true)
  })

  it('accepts a user-configured DeepSeek provider by prefix', () => {
    expect(isDeepSeekProviderId('deepseek-eu')).toBe(true)
    expect(isDeepSeekProviderId('DeepSeek-Platform')).toBe(true)
  })

  it('rejects every other provider', () => {
    for (const id of ['openai', 'anthropic', 'openrouter', 'qwen', 'z-ai', 'moonshot', '']) {
      expect(isDeepSeekProviderId(id), id).toBe(false)
    }
    expect(isDeepSeekProviderId(undefined)).toBe(false)
    expect(isDeepSeekProviderId(null)).toBe(false)
  })
})

describe('model ids', () => {
  it('accepts DeepSeek models behind a non-DeepSeek provider id', () => {
    expect(isDeepSeekModelId('deepseek-v4-pro')).toBe(true)
    expect(isDeepSeekModelId('deepseek-flash')).toBe(true)
    expect(isDeepSeekModelId('DeepSeek-V3.2')).toBe(true)
  })

  it('rejects other models', () => {
    expect(isDeepSeekModelId('gpt-5.2')).toBe(false)
    expect(isDeepSeekModelId('claude-sonnet-5')).toBe(false)
    expect(isDeepSeekModelId('')).toBe(false)
  })
})

describe('routes', () => {
  it('is DeepSeek when either signal matches', () => {
    expect(isDeepSeekRoute({ provider: 'deepseek-account', model: 'deepseek-v4-pro' })).toBe(true)
    expect(isDeepSeekRoute({ provider: 'openrouter', model: 'deepseek-v4-flash' })).toBe(true)
    expect(isDeepSeekRoute({ provider: 'deepseek-official', model: 'some-alias' })).toBe(true)
  })

  it('is not DeepSeek when neither signal matches', () => {
    expect(isDeepSeekRoute({ provider: 'openai', model: 'gpt-5.2' })).toBe(false)
    expect(isDeepSeekRoute({})).toBe(false)
  })

  it('honours showWhenUnknown for an unresolved route', () => {
    expect(isDeepSeekRoute(null)).toBe(false)
    expect(isDeepSeekRoute(undefined)).toBe(false)
    expect(isDeepSeekRoute(null, { ...DEFAULT_CONFIG, showWhenUnknown: true })).toBe(true)
  })
})

describe('sessions', () => {
  it('follows the next selection, falling back to the last used one', () => {
    expect(isDeepSeekSession({
      next: { provider: 'deepseek-account', model: 'deepseek-v4-pro' },
      lastUsed: null,
    })).toBe(true)
    // The user just switched away: `next` wins over the recorded history.
    expect(isDeepSeekSession({
      next: { provider: 'openai', model: 'gpt-5.2' },
      lastUsed: { provider: 'deepseek-account', model: 'deepseek-v4-pro' },
    })).toBe(false)
    // No `next` yet: the last used route decides.
    expect(isDeepSeekSession({
      next: null,
      lastUsed: { provider: 'deepseek-official', model: 'deepseek-flash' },
    })).toBe(true)
  })

  it('hides the capsule when the host projected no model selection', () => {
    expect(isDeepSeekSession(undefined)).toBe(false)
    expect(isDeepSeekSession(null)).toBe(false)
    // Capability absent is not an "unknown route": `showWhenUnknown` must not
    // turn it into a DeepSeek session.
    expect(isDeepSeekSession(undefined, { ...DEFAULT_CONFIG, showWhenUnknown: true })).toBe(false)
    expect(isDeepSeekSession(null, { ...DEFAULT_CONFIG, showWhenUnknown: true })).toBe(false)
  })

  it('lets showWhenUnknown decide for a session with no route yet', () => {
    expect(isDeepSeekSession({ next: null, lastUsed: null })).toBe(false)
    expect(isDeepSeekSession({})).toBe(false)
    expect(isDeepSeekSession({ next: null, lastUsed: null }, { ...DEFAULT_CONFIG, showWhenUnknown: true })).toBe(true)
  })

  it('accepts extra ids from configuration', () => {
    const config = { ...DEFAULT_CONFIG, providerIds: [...DEFAULT_CONFIG.providerIds, 'my-proxy'] }
    expect(isDeepSeekSession({ next: { provider: 'my-proxy', model: 'ds-chat' } }, config)).toBe(true)
    expect(isDeepSeekSession({ next: { provider: 'my-proxy', model: 'ds-chat' } })).toBe(false)
  })
})
