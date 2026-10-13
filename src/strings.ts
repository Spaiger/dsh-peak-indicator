/**
 * Capsule and tooltip copy.
 *
 * The strings are plain tables rather than a `ctx.locale` namespace: the DSH
 * browser client ships `zh` and `en` only, so a Russian dictionary could never
 * be selected through Settings → General → Language without also registering a
 * language pack. `pickLanguage()` therefore reads the browser language and
 * falls back to Russian, and `README.md` documents the `ctx.locale.register()`
 * route for a monorepo build that wants the framework's language preference.
 */

import { BEIJING_TZ, beijingParts, formatBeijingClock } from './beijing.ts'
import { OFF_PEAK_RATE_FACTOR, PEAK_WINDOWS, type DayRule, type PricingState } from './pricing.ts'

/** Languages this build ships. */
export type Language = 'ru' | 'en'

/** One language's complete copy set. */
export interface Strings {
  /** Capsule text while the full tariff applies; `{duration}` is the countdown. */
  readonly peakLabel: (duration: string) => string
  /** Capsule text while the discount applies; `{duration}` is the countdown. */
  readonly offPeakLabel: (duration: string) => string
  /** Screen-reader text, which cannot rely on the emoji or the colour. */
  readonly aria: (phase: string, duration: string) => string
  /** Tooltip: the current Beijing reading. */
  readonly tooltipTime: (clock: string, weekday: string) => string
  /** Tooltip: which rule owns today, already localized and expanded. */
  readonly tooltipRule: (rule: string) => string
  /** Tooltip: the current phase and the exact instant of the next change. */
  readonly tooltipNow: (phase: string, nextClock: string, nextWeekday: string) => string
  /** Tooltip: the full published rule set. */
  readonly tooltipRules: string[]
  /** Tooltip: shown once the hard-coded PRC calendar runs out. */
  readonly tooltipCalendarWarning: (years: string) => string
  /** Phase names used inside the tooltip. */
  readonly phasePeak: string
  readonly phaseOffPeak: string
  /** Countdown unit abbreviations. */
  readonly unitHours: string
  readonly unitMinutes: string
  /** Day-rule explanations. */
  readonly ruleHoliday: (weekday: string, date: string) => string
  readonly ruleMakeup: (weekday: string, date: string) => string
  readonly ruleWeekend: (weekday: string) => string
  readonly ruleWorkday: (weekday: string) => string
}

/** Peak windows rendered as `HH:MM–HH:MM`, shared by every language's rule text. */
export function peakWindowsText(): string {
  return PEAK_WINDOWS
    .map(window => `${secondsToClock(window.start)}–${secondsToClock(window.end)}`)
    .join(', ')
}

/** Discount rendered as a percentage, derived from the rate factor. */
export function discountPercent(): number {
  return Math.round((1 - OFF_PEAK_RATE_FACTOR) * 100)
}

/** Russian copy (default). */
export const ru: Strings = {
  peakLabel: duration => `⚡ Пик · до скидки ${duration}`,
  offPeakLabel: duration => `🌙 Непик · через ${duration} пик`,
  aria: (phase, duration) => `Тариф DeepSeek: ${phase}. До смены ${duration}.`,
  tooltipTime: (clock, weekday) => `Пекинское время (${BEIJING_TZ}): ${clock}, ${weekday}`,
  tooltipRule: rule => `Правило: ${rule}`,
  tooltipNow: (phase, nextClock, nextWeekday) => `Сейчас: ${phase} · смена на ${nextClock} (${nextWeekday})`,
  tooltipRules: [
    `Пик (полный тариф): пн–пт ${peakWindowsText()} по пекинскому времени.`,
    `Непик (−${discountPercent()}%): всё остальное время, включая выходные и официальные праздники КНР (весь день).`,
    'Перенесённые рабочие дни (调休) считаются обычными буднями.',
  ],
  tooltipCalendarWarning: years => `⚠ Календарь праздников КНР загружен только для ${years}: данные могут быть устаревшими.`,
  unitHours: 'ч',
  unitMinutes: 'м',
  phasePeak: '⚡ Пик (полный тариф)',
  phaseOffPeak: `🌙 Непик (скидка ${discountPercent()}%)`,
  ruleHoliday: (weekday, date) => `официальный праздник КНР — непик весь день (${weekday}, ${date})`,
  ruleMakeup: (weekday, date) => `перенесённый рабочий день (调休上班) — тариф как в будни (${weekday}, ${date})`,
  ruleWeekend: weekday => `выходной день (${weekday}) — непик весь день`,
  ruleWorkday: weekday => `будний день (${weekday}) — пик ${peakWindowsText()}, иначе непик`,
}

/** English copy. */
export const en: Strings = {
  peakLabel: duration => `⚡ Peak · discount in ${duration}`,
  offPeakLabel: duration => `🌙 Off-peak · peak in ${duration}`,
  aria: (phase, duration) => `DeepSeek tariff: ${phase}. Next change in ${duration}.`,
  tooltipTime: (clock, weekday) => `Beijing time (${BEIJING_TZ}): ${clock}, ${weekday}`,
  tooltipRule: rule => `Rule: ${rule}`,
  tooltipNow: (phase, nextClock, nextWeekday) => `Now: ${phase} · switches at ${nextClock} (${nextWeekday})`,
  tooltipRules: [
    `Peak (full rate): Mon–Fri ${peakWindowsText()} Beijing time.`,
    `Off-peak (−${discountPercent()}%): everything else, including weekends and PRC statutory holidays (all day).`,
    'Make-up workdays (调休) count as ordinary weekdays.',
  ],
  tooltipCalendarWarning: years => `⚠ The PRC holiday calendar only covers ${years}: the data may be stale.`,
  unitHours: 'h',
  unitMinutes: 'm',
  phasePeak: '⚡ Peak (full rate)',
  phaseOffPeak: `🌙 Off-peak (${discountPercent()}% off)`,
  ruleHoliday: (weekday, date) => `PRC statutory holiday — off-peak all day (${weekday}, ${date})`,
  ruleMakeup: (weekday, date) => `make-up workday (调休上班) — weekday tariff (${weekday}, ${date})`,
  ruleWeekend: weekday => `weekend (${weekday}) — off-peak all day`,
  ruleWorkday: weekday => `weekday (${weekday}) — peak ${peakWindowsText()}, otherwise off-peak`,
}

/** Every shipped language's copy, keyed by language id. */
export const STRINGS: Readonly<Record<Language, Strings>> = { ru, en }

/** Language of a weekday name. */
export type WeekdayNames = readonly [string, string, string, string, string, string, string]

const WEEKDAYS_RU: WeekdayNames = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const WEEKDAYS_EN: WeekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Pick the copy set for a browser language tag.
 * @param tag - BCP 47 tag, normally `navigator.language`.
 * @returns the matching language id, defaulting to Russian.
 */
export function pickLanguage(tag: string | undefined): Language {
  const base = (tag ?? '').toLowerCase().split('-')[0]
  return base === 'en' ? 'en' : 'ru'
}

/**
 * Localized short weekday name.
 * @param isoWeekdayNumber - ISO weekday, 1 = Monday … 7 = Sunday.
 * @param language - copy set to use.
 * @returns the localized name.
 */
export function weekdayName(isoWeekdayNumber: number, language: Language): string {
  const names = language === 'en' ? WEEKDAYS_EN : WEEKDAYS_RU
  return names[isoWeekdayNumber - 1] ?? String(isoWeekdayNumber)
}

/** The localized capsule copy, minus the countdown the fast tick moves. */
export interface Presentation {
  /** Accessible name of the capsule. */
  readonly ariaLabel: string
  /** Tooltip body; the DSH bubble renders `\n` as a line break. */
  readonly tooltip: string
  /** Whether the tooltip carries the stale-calendar warning. */
  readonly calendarStale: boolean
  /** Language the copy was built in. */
  readonly language: Language
}

/**
 * Build the tooltip and accessible name for one tariff reading.
 * @param state - the reading from `getPricingState()`.
 * @param language - copy set to use.
 * @returns the localized presentation.
 */
export function buildPresentation(state: PricingState, language: Language = 'ru'): Presentation {
  const strings = STRINGS[language]
  const remaining = formatDuration(state.msUntilChange, language)
  const weekday = weekdayName(state.weekday, language)
  const ruleText = describeRule(state.rule, state, weekday, strings)
  const next = beijingParts(state.nextChangeAt)
  const lines = [
    strings.tooltipTime(formatBeijingClock(state.now), `${weekday} · ${state.date}`),
    strings.tooltipRule(ruleText),
    strings.tooltipNow(
      state.phase === 'peak' ? strings.phasePeak : strings.phaseOffPeak,
      formatBeijingClock(state.nextChangeAt),
      `${weekdayName(next.weekday, language)} · ${next.date}`,
    ),
    ...strings.tooltipRules,
  ]
  const calendarStale = !state.calendarCovered
  if (calendarStale) {
    lines.push(strings.tooltipCalendarWarning(state.calendarWarningFrom.slice(0, 4)))
  }
  return {
    ariaLabel: strings.aria(
      state.phase === 'peak' ? strings.phasePeak : strings.phaseOffPeak,
      remaining,
    ),
    tooltip: lines.join('\n'),
    calendarStale,
    language,
  }
}

/**
 * Build the capsule text for one phase and countdown.
 * @param phase - the tariff phase to announce.
 * @param duration - formatted countdown to the next change.
 * @param language - copy set to use.
 * @returns the capsule label.
 */
export function buildLabel(
  phase: PricingState['phase'],
  duration: string,
  language: Language = 'ru',
): string {
  const strings = STRINGS[language]
  return phase === 'peak' ? strings.peakLabel(duration) : strings.offPeakLabel(duration)
}

/**
 * Localized explanation of the rule that owns the current day.
 * @param rule - the deciding rule.
 * @param state - the reading being presented.
 * @param weekday - localized weekday name of the reading.
 * @param strings - copy set to use.
 * @returns one sentence describing why today is priced the way it is.
 */
export function describeRule(
  rule: DayRule,
  state: PricingState,
  weekday: string,
  strings: Strings,
): string {
  switch (rule) {
    case 'holiday':
      return strings.ruleHoliday(weekday, state.date)
    case 'makeup-workday':
      return strings.ruleMakeup(weekday, state.date)
    case 'weekend':
      return strings.ruleWeekend(weekday)
    case 'workday':
      return strings.ruleWorkday(weekday)
  }
}

/**
 * Format a countdown: `Xч Yм` above one hour, `MM:SS` below it, so the last
 * hour of a window counts down visibly.
 * @param ms - remaining milliseconds; a negative value clamps to zero.
 * @param language - copy set whose unit abbreviations to use.
 * @returns the localized countdown text.
 */
export function formatDuration(ms: number, language: Language = 'ru'): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours === 0) return `${pad2(minutes)}:${pad2(seconds)}`
  const { unitHours, unitMinutes } = STRINGS[language]
  return `${hours}${unitHours} ${minutes}${unitMinutes}`
}

/**
 * Whether a countdown should tick every second instead of every refresh.
 * @param ms - remaining milliseconds.
 * @returns whether the capsule shows seconds.
 */
export function showsSeconds(ms: number): boolean {
  return ms < 3_600_000
}

/** Seconds-of-day as `HH:MM`. */
function secondsToClock(seconds: number): string {
  return `${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor((seconds % 3600) / 60))}`
}

/** Two-digit zero padding. */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

