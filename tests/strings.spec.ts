/** Capsule and tooltip copy. */

import { describe, expect, it } from 'vitest'
import { getPricingState } from '../src/pricing.ts'
import {
  buildLabel,
  buildPresentation,
  discountPercent,
  formatDuration,
  peakWindowsText,
  pickLanguage,
  showsSeconds,
  weekdayName,
} from '../src/strings.ts'

/** One instant from Beijing wall-clock parts. */
function bj(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number {
  return Date.UTC(y, m - 1, d, hh - 8, mm, ss)
}

describe('countdown formatting', () => {
  it('shows hours and minutes above one hour', () => {
    expect(formatDuration(2 * 3600_000 + 15 * 60_000)).toBe('2ч 15м')
    expect(formatDuration(60 * 60_000)).toBe('1ч 0м')
    expect(formatDuration(9 * 3600_000 + 59 * 60_000 + 59_000)).toBe('9ч 59м')
    expect(formatDuration(2 * 3600_000 + 15 * 60_000, 'en')).toBe('2h 15m')
  })

  it('shows minutes and seconds below one hour', () => {
    expect(formatDuration(45 * 60_000)).toBe('45:00')
    expect(formatDuration(9 * 60_000 + 5_000)).toBe('09:05')
    expect(formatDuration(59_999)).toBe('00:59')
    expect(formatDuration(1_000)).toBe('00:01')
  })

  it('clamps at zero and switches to seconds under one hour', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(-5_000)).toBe('00:00')
    expect(showsSeconds(3_599_999)).toBe(true)
    expect(showsSeconds(3_600_000)).toBe(false)
  })
})

describe('capsule labels', () => {
  it('matches the required Russian copy', () => {
    expect(buildLabel('peak', '2ч 15м', 'ru')).toBe('⚡ Пик · до скидки 2ч 15м')
    expect(buildLabel('off-peak', '2ч 15м', 'ru')).toBe('🌙 Непик · через 2ч 15м пик')
  })

  it('offers an English variant of the same shape', () => {
    expect(buildLabel('peak', '2h 15m', 'en')).toBe('⚡ Peak · discount in 2h 15m')
    expect(buildLabel('off-peak', '04:32', 'en')).toBe('🌙 Off-peak · peak in 04:32')
  })

  it('localizes the whole capsule for an English browser', () => {
    const state = getPricingState(bj(2026, 10, 13, 10, 30))
    const view = buildPresentation(state, 'en')
    expect(buildLabel(state.phase, formatDuration(state.msUntilChange, 'en'), 'en'))
      .toBe('⚡ Peak · discount in 1h 30m')
    expect(view.ariaLabel).toBe('DeepSeek tariff: ⚡ Peak (full rate). Next change in 1h 30m.')
    expect(view.tooltip.split('\n')[1])
      .toBe('Rule: weekday (Tue) — peak 09:00–12:00, 14:00–18:00, otherwise off-peak')
  })

  it('derives the window text and discount from the tariff constants', () => {
    expect(peakWindowsText()).toBe('09:00–12:00, 14:00–18:00')
    expect(discountPercent()).toBe(50)
  })
})

describe('tooltip', () => {
  it('carries the Beijing clock, the deciding rule, the exact switch, and the rules', () => {
    const state = getPricingState(bj(2026, 10, 13, 10, 30))
    const lines = buildPresentation(state, 'ru').tooltip.split('\n')
    expect(lines[0]).toBe('Пекинское время (Asia/Shanghai): 2026-10-13 10:30:00, вт · 2026-10-13')
    expect(lines[1]).toBe('Правило: будний день (вт) — пик 09:00–12:00, 14:00–18:00, иначе непик')
    expect(lines[2]).toBe('Сейчас: ⚡ Пик (полный тариф) · смена на 2026-10-13 12:00:00 (вт · 2026-10-13)')
    expect(lines.slice(3).join('\n')).toContain('Пик (полный тариф): пн–пт 09:00–12:00, 14:00–18:00')
    expect(lines.slice(3).join('\n')).toContain('Непик (−50%)')
    expect(lines.slice(3).join('\n')).toContain('Перенесённые рабочие дни (调休) считаются обычными буднями.')
  })

  it('names the holiday rule on a statutory holiday', () => {
    const state = getPricingState(bj(2026, 10, 1, 10, 30))
    const view = buildPresentation(state, 'ru')
    expect(view.tooltip).toContain('официальный праздник КНР — непик весь день (чт, 2026-10-01)')
    expect(view.tooltip).toContain('🌙 Непик (скидка 50%)')
  })

  it('names the make-up rule on a transferred workday', () => {
    const state = getPricingState(bj(2026, 10, 10, 10, 30))
    expect(buildPresentation(state, 'ru').tooltip)
      .toContain('перенесённый рабочий день (调休上班) — тариф как в будни (сб, 2026-10-10)')
  })

  it('warns once the hard-coded calendar runs out', () => {
    const covered = buildPresentation(getPricingState(bj(2026, 10, 13, 10, 0)), 'ru')
    expect(covered.calendarStale).toBe(false)
    expect(covered.tooltip).not.toContain('Календарь праздников')

    const stale = buildPresentation(getPricingState(bj(2027, 3, 3, 10, 0)), 'ru')
    expect(stale.calendarStale).toBe(true)
    expect(stale.tooltip).toContain('⚠ Календарь праздников КНР загружен только для 2026')
  })

  it('has an accessible name that does not rely on colour or emoji', () => {
    const view = buildPresentation(getPricingState(bj(2026, 10, 13, 10, 30)), 'ru')
    expect(view.ariaLabel).toBe('Тариф DeepSeek: ⚡ Пик (полный тариф). До смены 1ч 30м.')
  })
})

describe('language selection', () => {
  it('follows the browser and defaults to Russian', () => {
    expect(pickLanguage('ru-RU')).toBe('ru')
    expect(pickLanguage('en-GB')).toBe('en')
    expect(pickLanguage('zh-CN')).toBe('ru')
    expect(pickLanguage(undefined)).toBe('ru')
  })

  it('localizes weekday names', () => {
    expect(weekdayName(1, 'ru')).toBe('пн')
    expect(weekdayName(7, 'ru')).toBe('вс')
    expect(weekdayName(6, 'en')).toBe('Sat')
    expect(weekdayName(8, 'en')).toBe('8')
  })
})
