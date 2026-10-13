/**
 * Tariff-rule coverage.
 *
 * Every instant below is built from Beijing wall-clock parts, and the suite
 * runs under `TZ=Pacific/Kiritimati` (UTC+14, see vitest.config.ts) with an
 * explicit local-zone cross-check, so a green run proves no decision depends on
 * the machine's zone.
 */

import { describe, expect, it } from 'vitest'
import {
  beijingParts,
  fromBeijing,
  formatBeijingClock,
  formatBeijingWeekday,
  isoWeekday,
  nextDateKey,
} from '../src/beijing.ts'
import {
  CN_HOLIDAYS_2026,
  CN_MAKEUP_WORKDAYS_2026,
  calendarCoverage,
  isCnHoliday,
} from '../src/holidays.ts'
import {
  classifyDay,
  findNextTransition,
  getPricingState,
  isPeak,
  matchPeakWindow,
  phaseForDay,
  PEAK_WINDOWS,
} from '../src/pricing.ts'

/**
 * One instant from Beijing wall-clock parts.
 * @param y - Beijing year.
 * @param m - Beijing month, 1-12.
 * @param d - Beijing day of month.
 * @param hh - Beijing hour.
 * @param mm - Beijing minute.
 * @param ss - Beijing second.
 * @param ms - milliseconds.
 * @returns Unix epoch milliseconds.
 */
function bj(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0, ms = 0): number {
  return Date.UTC(y, m - 1, d, hh - 8, mm, ss, ms)
}

describe('suite environment', () => {
  it('runs away from Beijing time, so the assertions cannot pass by accident', () => {
    // vitest.config.ts pins UTC+14; if that ever stops applying, the
    // local-zone cross-checks below would silently lose their meaning.
    expect(process.env.TZ).toBe('Pacific/Kiritimati')
    expect(new Date(bj(2026, 10, 13, 0, 30)).getHours()).not.toBe(0)
  })
})

describe('Beijing calendar conversion', () => {
  it('reads an instant as Beijing parts regardless of the process zone', () => {
    const now = bj(2026, 10, 13, 14, 5, 6)
    const parts = beijingParts(now)
    expect(parts).toMatchObject({
      year: 2026, month: 10, day: 13, weekday: 2,
      hour: 14, minute: 5, second: 6,
      date: '2026-10-13', secondsOfDay: 14 * 3600 + 5 * 60 + 6,
    })
  })

  it('belongs to the next Beijing day while the local zone still shows the previous one', () => {
    // 2026-10-13T17:00:00Z is 01:00 on 10-14 in Beijing and 13:00 on 10-13 in New York.
    const now = Date.UTC(2026, 9, 13, 17, 0, 0)
    expect(beijingParts(now).date).toBe('2026-10-14')
    expect(new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })).toBe('2026-10-13')
    expect(isPeak(now)).toBe(false) // 01:00 Beijing, Wednesday: off-peak
  })

  it('round-trips a wall-clock reading', () => {
    expect(fromBeijing(2026, 2, 15, 9, 0, 0)).toBe(bj(2026, 2, 15, 9, 0, 0))
    expect(formatBeijingClock(bj(2026, 10, 13, 9, 5, 0))).toBe('2026-10-13 09:05:00')
    expect(formatBeijingClock(bj(2026, 10, 13, 9, 5, 0), false)).toBe('2026-10-13 09:05')
    expect(formatBeijingWeekday(bj(2026, 10, 13))).toBe('Tue')
  })

  it('walks the calendar across month, year, and leap boundaries', () => {
    expect(isoWeekday(2026, 10, 13)).toBe(2)
    expect(isoWeekday(2026, 10, 18)).toBe(7) // Sunday
    expect(nextDateKey('2026-10-31')).toBe('2026-11-01')
    expect(nextDateKey('2026-12-31')).toBe('2027-01-01')
    expect(nextDateKey('2028-02-28')).toBe('2028-02-29') // leap
    expect(nextDateKey('2026-02-28')).toBe('2026-03-01')
  })
})

describe('PRC holiday tables (国办发明电〔2025〕7号)', () => {
  it('carries the published 2026 day counts', () => {
    expect(CN_HOLIDAYS_2026).toHaveLength(33) // 3 + 9 + 3 + 5 + 3 + 3 + 7
    expect(CN_MAKEUP_WORKDAYS_2026).toHaveLength(6)
  })

  it('lists make-up workdays only on weekends, and never on a holiday', () => {
    for (const date of CN_MAKEUP_WORKDAYS_2026) {
      const [year, month, day] = date.split('-').map(Number) as [number, number, number]
      expect([6, 7], `${date} must be a Saturday or Sunday`).toContain(isoWeekday(year, month, day))
      expect(isCnHoliday(date), `${date} must not also be a holiday`).toBe(false)
    }
  })

  it('keeps every key in its own year table', () => {
    for (const date of CN_HOLIDAYS_2026) expect(date.startsWith('2026-')).toBe(true)
  })

  it('reports calendar coverage and its stale-data warning', () => {
    expect(calendarCoverage(bj(2026, 10, 13)).covered).toBe(true)
    expect(calendarCoverage(bj(2027, 6, 1)).covered).toBe(false)
    // The 2027 tables are intentionally empty until the notice is published.
    expect(calendarCoverage(bj(2026, 12, 10)).warningFrom).toBe('2026-12-01')
  })
})

describe('Classification ladder (holiday → make-up → weekend → hour)', () => {
  it('prefers the holiday over a weekday hour window', () => {
    // 2026-10-01 is a Thursday and the first National Day holiday.
    expect(classifyDay('2026-10-01', 4)).toBe('holiday')
    expect(phaseForDay('holiday', 10 * 3600)).toBe('off-peak')
  })

  it('treats a make-up Saturday as a weekday', () => {
    expect(classifyDay('2026-02-14', 6)).toBe('makeup-workday')
    expect(phaseForDay('makeup-workday', 10 * 3600)).toBe('peak')
    expect(phaseForDay('makeup-workday', 13 * 3600)).toBe('off-peak')
  })

  it('treats an ordinary weekend as off-peak all day', () => {
    expect(classifyDay('2026-10-17', 6)).toBe('weekend')
    expect(classifyDay('2026-10-18', 7)).toBe('weekend')
    expect(phaseForDay('weekend', 10 * 3600)).toBe('off-peak')
  })

  it('applies the hour windows only on workdays', () => {
    expect(classifyDay('2026-10-13', 2)).toBe('workday')
    for (const [seconds, expected] of [
      [0, 'off-peak'], [8 * 3600 + 59 * 60 + 59, 'off-peak'],
      [9 * 3600, 'peak'], [11 * 3600 + 59 * 60 + 59, 'peak'],
      [12 * 3600, 'off-peak'], [13 * 3600 + 59 * 60 + 59, 'off-peak'],
      [14 * 3600, 'peak'], [17 * 3600 + 59 * 60 + 59, 'peak'],
      [18 * 3600, 'off-peak'], [23 * 3600 + 59 * 60 + 59, 'off-peak'],
    ] as const) {
      expect(phaseForDay('workday', seconds), `workday @${seconds}s`).toBe(expected)
    }
  })

  it('matches the window edges as start-inclusive, end-exclusive', () => {
    expect(matchPeakWindow(9 * 3600)).toEqual(PEAK_WINDOWS[0])
    expect(matchPeakWindow(12 * 3600 - 1)).toEqual(PEAK_WINDOWS[0])
    expect(matchPeakWindow(12 * 3600)).toBeNull()
    expect(matchPeakWindow(18 * 3600 - 1)).toEqual(PEAK_WINDOWS[1])
    expect(matchPeakWindow(18 * 3600)).toBeNull()
  })
})

describe('getPricingState — required acceptance cases', () => {
  it('ordinary weekday, peak hour', () => {
    // Tuesday 2026-10-13 10:30 Beijing.
    const state = getPricingState(bj(2026, 10, 13, 10, 30))
    expect(state.phase).toBe('peak')
    expect(state.rule).toBe('workday')
    expect(state.window).toEqual({ start: 9 * 3600, end: 12 * 3600 })
    expect(state.nextPhase).toBe('off-peak')
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2026-10-13 12:00:00')
    expect(state.msUntilChange).toBe(90 * 60_000)
  })

  it('ordinary weekday, off-peak hour', () => {
    // Tuesday 2026-10-13 13:00 Beijing (lunch gap).
    const state = getPricingState(bj(2026, 10, 13, 13, 0))
    expect(state.phase).toBe('off-peak')
    expect(state.rule).toBe('workday')
    expect(state.window).toBeNull()
    expect(state.nextPhase).toBe('peak')
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2026-10-13 14:00:00')
    expect(state.msUntilChange).toBe(60 * 60_000)
  })

  it('Saturday', () => {
    const state = getPricingState(bj(2026, 10, 17, 10, 30))
    expect(state.phase).toBe('off-peak')
    expect(state.rule).toBe('weekend')
    expect(state.weekday).toBe(6)
    // Next peak: Monday 2026-10-19 09:00.
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2026-10-19 09:00:00')
    expect(state.nextPhase).toBe('peak')
  })

  it('Sunday', () => {
    const state = getPricingState(bj(2026, 10, 18, 15, 0))
    expect(state.phase).toBe('off-peak')
    expect(state.rule).toBe('weekend')
    expect(state.weekday).toBe(7)
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2026-10-19 09:00:00')
  })

  it('statutory holiday falling on a weekday, inside a peak window', () => {
    // Thursday 2026-10-01 10:30 Beijing: National Day, would otherwise be peak.
    const state = getPricingState(bj(2026, 10, 1, 10, 30))
    expect(state.phase).toBe('off-peak')
    expect(state.rule).toBe('holiday')
    expect(isCnHoliday(state.date)).toBe(true)
    expect(isPeak(state.now)).toBe(false)
    // The holiday runs to 10-07; 10-08 is a Thursday, so the next peak is that
    // morning rather than anything inside the holiday.
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2026-10-08 09:00:00')
  })

  it('holiday weekend day stays a holiday, not a weekend', () => {
    // Saturday 2026-10-03 is inside the National Day run.
    expect(getPricingState(bj(2026, 10, 3, 10, 0)).rule).toBe('holiday')
  })

  it('make-up workday Saturday follows the weekday rule', () => {
    // Saturday 2026-10-10 is a 调休上班 day for the National Day run.
    const peak = getPricingState(bj(2026, 10, 10, 10, 30))
    expect(peak.rule).toBe('makeup-workday')
    expect(peak.phase).toBe('peak')
    expect(formatBeijingClock(peak.nextChangeAt)).toBe('2026-10-10 12:00:00')

    const gap = getPricingState(bj(2026, 10, 10, 12, 30))
    expect(gap.phase).toBe('off-peak')
    expect(formatBeijingClock(gap.nextChangeAt)).toBe('2026-10-10 14:00:00')

    // 2026-09-20 is a Sunday make-up workday before the National Day run.
    const sunday = getPricingState(bj(2026, 9, 20, 15, 0))
    expect(sunday.rule).toBe('makeup-workday')
    expect(sunday.phase).toBe('peak')
  })

  it('make-up workday outside the windows is off-peak', () => {
    expect(getPricingState(bj(2026, 1, 4, 20, 0)).phase).toBe('off-peak')
    expect(getPricingState(bj(2026, 1, 4, 20, 0)).rule).toBe('makeup-workday')
  })
})

describe('Window edges and transitions', () => {
  it('flips exactly on each window edge', () => {
    expect(isPeak(bj(2026, 10, 13, 8, 59, 59, 999))).toBe(false)
    expect(isPeak(bj(2026, 10, 13, 9, 0, 0, 0))).toBe(true)
    expect(isPeak(bj(2026, 10, 13, 11, 59, 59, 999))).toBe(true)
    expect(isPeak(bj(2026, 10, 13, 12, 0, 0, 0))).toBe(false)
    expect(isPeak(bj(2026, 10, 13, 14, 0, 0, 0))).toBe(true)
    expect(isPeak(bj(2026, 10, 13, 17, 59, 59, 999))).toBe(true)
    expect(isPeak(bj(2026, 10, 13, 18, 0, 0, 0))).toBe(false)
  })

  it('counts down to the imminent change', () => {
    const state = getPricingState(bj(2026, 10, 13, 11, 59, 30))
    expect(state.msUntilChange).toBe(30_000)
    expect(state.nextPhase).toBe('off-peak')
  })

  it('skips a midnight that changes the rule but not the phase', () => {
    // Wednesday 2026-09-30 23:30 is off-peak, and the National Day run that
    // starts at midnight is off-peak too: the countdown must not stop at a
    // boundary the user cannot observe, so it runs to Thursday 2026-10-08 09:00.
    const state = getPricingState(bj(2026, 9, 30, 23, 30))
    expect(state.phase).toBe('off-peak')
    expect(state.rule).toBe('workday')
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2026-10-08 09:00:00')
    expect(state.nextPhase).toBe('peak')
    // The holiday itself is still classified correctly at midnight.
    expect(getPricingState(bj(2026, 10, 1, 0, 0)).rule).toBe('holiday')
  })

  it('leaves a peak Friday into the weekend', () => {
    const state = getPricingState(bj(2026, 10, 16, 17, 0)) // Friday afternoon peak
    expect(state.phase).toBe('peak')
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2026-10-16 18:00:00')
    const after = getPricingState(state.nextChangeAt)
    expect(after.phase).toBe('off-peak')
    expect(formatBeijingClock(after.nextChangeAt)).toBe('2026-10-19 09:00:00') // Monday
  })

  it('bridges a holiday run that ends on a weekend', () => {
    // Saturday 2026-02-21 is inside the Spring Festival run; 02-22/02-23 are
    // holiday Sunday/Monday, so the next peak is Tuesday 02-24 09:00.
    const state = getPricingState(bj(2026, 2, 21, 10, 0))
    expect(state.rule).toBe('holiday')
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2026-02-24 09:00:00')
  })

  it('handles the day before a make-up workday', () => {
    // Friday 2026-02-13 18:00 → off-peak; the next peak is the make-up
    // Saturday 02-14 09:00, not Monday.
    const state = getPricingState(bj(2026, 2, 13, 18, 0))
    expect(state.phase).toBe('off-peak')
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2026-02-14 09:00:00')
  })

  it('crosses the New Year boundary into an uncovered year', () => {
    // Wednesday 2026-12-31 23:59 is off-peak and stays off-peak across
    // midnight, so the countdown runs to the first 2027 peak hour. 2027 has no
    // published tables in this build: 01-01 is a Friday and is therefore treated
    // as an ordinary workday, with the coverage flag reporting the gap.
    const state = getPricingState(bj(2026, 12, 31, 23, 59))
    expect(state.calendarCovered).toBe(true)
    expect(formatBeijingClock(state.nextChangeAt)).toBe('2027-01-01 09:00:00')
    const nextYear = getPricingState(bj(2027, 1, 1, 0, 0))
    expect(nextYear.calendarCovered).toBe(false)
    expect(nextYear.rule).toBe('workday')
    expect(formatBeijingClock(nextYear.nextChangeAt)).toBe('2027-01-01 09:00:00')
  })

  it('finds a transition from every minute of a representative week', () => {
    // Sweep 2026-10-12T00:00 .. 2026-10-19T00:00 Beijing in one-minute steps:
    // the next change must always be in the future, must flip the phase, and
    // must land on a tariff boundary.
    const boundaries = new Set<number>([0, ...PEAK_WINDOWS.flatMap(w => [w.start, w.end])])
    for (let t = bj(2026, 10, 12); t < bj(2026, 10, 19); t += 60_000) {
      const parts = beijingParts(t)
      const state = getPricingState(t)
      expect(state.nextChangeAt, formatBeijingClock(t)).toBeGreaterThan(t)
      expect(state.nextChangeAt - t).toBeLessThanOrEqual(4 * 24 * 3600_000)
      const at = beijingParts(state.nextChangeAt)
      expect(boundaries.has(at.secondsOfDay), formatBeijingClock(state.nextChangeAt)).toBe(true)
      expect(state.nextPhase).not.toBe(state.phase)
      expect(getPricingState(state.nextChangeAt).phase).toBe(state.nextPhase)
      expect(parts.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
    }
  })

  it('terminates when the calendar has no peak day left', () => {
    // A synthetic far-future instant still yields a finite, sane answer.
    const at = findNextTransition(bj(2031, 5, 1, 10, 0), beijingParts(bj(2031, 5, 1, 10, 0)), 'peak')
    expect(at).toBe(bj(2031, 5, 1, 12, 0))
  })
})
