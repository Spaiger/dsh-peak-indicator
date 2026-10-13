/**
 * DeepSeek peak / off-peak tariff state — a pure function of one instant.
 *
 * Rules (https://api-docs.deepseek.com/zh-cn/quick_start/pricing):
 * peak hours are Beijing time 09:00–12:00 and 14:00–18:00, Monday–Friday,
 * excluding PRC statutory holidays; every other moment is off-peak at 50% of
 * the peak rate. Make-up workdays (调休上班) are ordinary weekdays, so they
 * carry peak hours even when they fall on a Saturday or Sunday.
 *
 * Evaluation order is contractual and must not be rearranged:
 * holiday → make-up workday → weekend → hour window.
 */

import {
  beijingParts,
  fromBeijing,
  isoWeekday,
  nextDateKey,
  splitBeijingDateKey,
  type BeijingParts,
} from './beijing.ts'
import { calendarCoverage, isCnHoliday, isCnMakeupWorkday } from './holidays.ts'

/** One peak window: start inclusive, end exclusive, in seconds since Beijing midnight. */
export interface PeakWindow {
  /** Window start, seconds since Beijing midnight. */
  readonly start: number
  /** Window end, seconds since Beijing midnight (exclusive). */
  readonly end: number
}

/** The two published peak windows of a Beijing workday. */
export const PEAK_WINDOWS: readonly PeakWindow[] = [
  { start: 9 * 3600, end: 12 * 3600 },
  { start: 14 * 3600, end: 18 * 3600 },
]

/** Off-peak price as a fraction of the peak price. */
export const OFF_PEAK_RATE_FACTOR = 0.5

/** Tariff state of one instant. */
export type PricingPhase = 'peak' | 'off-peak'

/** Which rule decided the day's tariff shape. */
export type DayRule = 'holiday' | 'makeup-workday' | 'weekend' | 'workday'

/** Complete tariff reading for one instant. */
export interface PricingState {
  /** The instant this reading describes (Unix epoch milliseconds). */
  readonly now: number
  /** Whether the full tariff (`peak`) or the 50% tariff (`off-peak`) applies. */
  readonly phase: PricingPhase
  /** Rule that decided the day, for the tooltip's explanation line. */
  readonly rule: DayRule
  /** Beijing date key `YYYY-MM-DD` of the instant. */
  readonly date: string
  /** ISO weekday of the Beijing day: 1 = Monday … 7 = Sunday. */
  readonly weekday: number
  /** Seconds since Beijing midnight. */
  readonly secondsOfDay: number
  /** Peak window containing the instant, when the instant is peak. */
  readonly window: PeakWindow | null
  /** Instant of the next phase change (Unix epoch milliseconds). */
  readonly nextChangeAt: number
  /** Phase that begins at {@link nextChangeAt}. */
  readonly nextPhase: PricingPhase
  /** Milliseconds from {@link PricingState.now} to {@link PricingState.nextChangeAt}. */
  readonly msUntilChange: number
  /** Whether this build's holiday table covers the instant's Beijing year. */
  readonly calendarCovered: boolean
  /** Beijing date key from which this build warns about stale calendar data. */
  readonly calendarWarningFrom: string
}

/**
 * Classify one Beijing calendar day.
 * @param date - `YYYY-MM-DD` in Beijing time.
 * @param weekday - ISO weekday of that date, 1 = Monday … 7 = Sunday.
 * @returns the rule that owns the day's tariff shape.
 */
export function classifyDay(date: string, weekday: number): DayRule {
  // 1. A statutory holiday is off-peak all day, whatever the hour or weekday.
  if (isCnHoliday(date)) return 'holiday'
  // 2. A make-up workday is an ordinary weekday even on a Saturday/Sunday.
  if (isCnMakeupWorkday(date)) return 'makeup-workday'
  // 3. Otherwise Saturday (6) and Sunday (7) are off-peak all day.
  if (weekday === 6 || weekday === 7) return 'weekend'
  return 'workday'
}

/**
 * Whether one Beijing second-of-day falls inside a peak window.
 * @param secondsOfDay - seconds since Beijing midnight.
 * @param windows - candidate peak windows (defaults to {@link PEAK_WINDOWS}).
 * @returns the containing window, or `null` outside every window.
 */
export function matchPeakWindow(
  secondsOfDay: number,
  windows: readonly PeakWindow[] = PEAK_WINDOWS,
): PeakWindow | null {
  return windows.find(window => secondsOfDay >= window.start && secondsOfDay < window.end) ?? null
}

/**
 * Tariff phase of one Beijing day at one second-of-day.
 * @param rule - the day's classification from {@link classifyDay}.
 * @param secondsOfDay - seconds since Beijing midnight.
 * @returns `peak` only inside a workday peak window.
 */
export function phaseForDay(rule: DayRule, secondsOfDay: number): PricingPhase {
  if (rule === 'holiday' || rule === 'weekend') return 'off-peak'
  return matchPeakWindow(secondsOfDay) === null ? 'off-peak' : 'peak'
}

/**
 * Compute the complete tariff reading for one instant.
 * @param now - Unix epoch milliseconds, normally `Date.now()`.
 * @returns state, the deciding rule, and the next phase change.
 */
export function getPricingState(now: number = Date.now()): PricingState {
  const parts = beijingParts(now)
  const rule = classifyDay(parts.date, parts.weekday)
  const window = matchPeakWindow(parts.secondsOfDay)
  const phase: PricingPhase = phaseForDay(rule, parts.secondsOfDay)
  const nextChangeAt = findNextTransition(now, parts, phase)
  const coverage = calendarCoverage(now)
  return {
    now,
    phase,
    rule,
    date: parts.date,
    weekday: parts.weekday,
    secondsOfDay: parts.secondsOfDay,
    // A weekend/holiday second is never peak, so the window only matters on workdays.
    window: phase === 'peak' ? window : null,
    nextChangeAt,
    nextPhase: phase === 'peak' ? 'off-peak' : 'peak',
    msUntilChange: nextChangeAt - now,
    calendarCovered: coverage.covered,
    calendarWarningFrom: coverage.warningFrom,
  }
}

/** Whether one instant is inside peak tariff. */
export function isPeak(now: number = Date.now()): boolean {
  const parts = beijingParts(now)
  return phaseForDay(classifyDay(parts.date, parts.weekday), parts.secondsOfDay) === 'peak'
}

/**
 * Phase of one Beijing day at one second-of-day, without the transition scan.
 * Handy in tests that only assert the classification ladder.
 * @param date - `YYYY-MM-DD` in Beijing time.
 * @param weekday - ISO weekday of that date.
 * @param secondsOfDay - seconds since Beijing midnight.
 * @returns the tariff phase.
 */
export function phaseOf(date: string, weekday: number, secondsOfDay: number): PricingPhase {
  return phaseForDay(classifyDay(date, weekday), secondsOfDay)
}

/**
 * Find the next instant at which the tariff phase changes.
 *
 * Walks day by day from the current Beijing day and returns the first boundary
 * whose phase differs from the current one, so a holiday that swallows several
 * peak windows still yields the true next change (for example Friday 18:00 →
 * the first peak hour after the holiday run ends).
 * @param now - the reference instant.
 * @param parts - Beijing reading of `now`.
 * @param phase - phase at `now`.
 * @returns Unix epoch milliseconds of the next phase change.
 */
export function findNextTransition(now: number, parts: BeijingParts, phase: PricingPhase): number {
  let date = parts.date
  // 400 Beijing days bound the scan: the PRC calendar never leaves a phase
  // unchanged for longer, and an uncovered future year must not loop forever.
  for (let day = 0; day < 400; day += 1) {
    const [year, month, dayOfMonth] = splitBeijingDateKey(date)
    const midnight = fromBeijing(year, month, dayOfMonth)
    const rule = classifyDay(date, isoWeekday(year, month, dayOfMonth))
    const edges = rule === 'holiday' || rule === 'weekend'
      ? []
      : PEAK_WINDOWS.flatMap(window => [window.start, window.end]).sort((left, right) => left - right)
    for (const seconds of [0, ...edges]) {
      const boundary = midnight + seconds * 1000
      if (boundary <= now) continue
      // A boundary belongs to the day it starts, so the day's own rule decides
      // its phase (midnight of a holiday is off-peak even after a peak Friday).
      if (phaseForDay(rule, seconds) !== phase) return boundary
    }
    date = nextDateKey(date)
  }
  // Unreachable with a sane calendar; fail soft by pointing at the next midnight.
  return fromBeijing(parts.year, parts.month, parts.day) + 86_400_000
}
