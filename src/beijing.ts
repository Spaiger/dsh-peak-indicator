/**
 * Beijing wall-clock helpers (Asia/Shanghai, UTC+8, no daylight saving).
 *
 * Every tariff decision in this plugin is made on the Beijing calendar, never
 * on the viewer's local zone: `Intl.DateTimeFormat` with an explicit
 * `timeZone` is the only conversion path, so a browser in any zone (and any
 * historical DST rule) yields the same answer.
 */

/** IANA zone the DeepSeek tariff is defined in. */
export const BEIJING_TZ = 'Asia/Shanghai'

/** Locale used for every `Intl` format below (number/date shapes only, no localized words). */
const FORMAT_LOCALE = 'en-CA'

/** Cached formatters: constructing `Intl.DateTimeFormat` per call is measurably slow on a 1 s tick. */
const partsFormatter = new Intl.DateTimeFormat(FORMAT_LOCALE, {
  timeZone: BEIJING_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const clockFormatter = new Intl.DateTimeFormat(FORMAT_LOCALE, {
  timeZone: BEIJING_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const weekdayFormatter = new Intl.DateTimeFormat(FORMAT_LOCALE, {
  timeZone: BEIJING_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
})

/** One Beijing calendar reading of an instant. */
export interface BeijingParts {
  readonly year: number
  readonly month: number
  readonly day: number
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  readonly weekday: number
  readonly hour: number
  readonly minute: number
  readonly second: number
  /** `YYYY-MM-DD` in Beijing time — the key of the holiday tables. */
  readonly date: string
  /** Seconds since Beijing midnight. */
  readonly secondsOfDay: number
}

/**
 * Read one instant as Beijing wall-clock parts.
 * @param timestamp - Unix epoch milliseconds (for example `Date.now()`).
 * @returns the Beijing calendar reading of that instant.
 */
export function beijingParts(timestamp: number): BeijingParts {
  const parts: Record<string, number> = {}
  for (const part of partsFormatter.formatToParts(timestamp)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  const year = parts.year ?? 1970
  const month = parts.month ?? 1
  const day = parts.day ?? 1
  const hour = parts.hour ?? 0
  const minute = parts.minute ?? 0
  const second = parts.second ?? 0
  // `en-CA` + `2-digit` yields `YYYY-MM-DD, HH:MM:SS`; the weekday formatter
  // is asked separately so the date string never carries a localized name.
  const weekday = isoWeekday(year, month, day)
  return {
    year,
    month,
    day,
    weekday,
    hour,
    minute,
    second,
    date: formatDateKey(year, month, day),
    secondsOfDay: hour * 3600 + minute * 60 + second,
  }
}

/**
 * Convert a Beijing wall-clock reading back to an exact instant.
 *
 * Asia/Shanghai has had no DST since 1991 and none is scheduled, so the offset
 * is the constant +08:00; deriving it from `Intl` per call would only add cost.
 * @param year - Beijing year.
 * @param month - Beijing month, 1-12.
 * @param day - Beijing day of month.
 * @param hour - Beijing hour, 0-23.
 * @param minute - Beijing minute, 0-59.
 * @param second - Beijing second, 0-59.
 * @returns Unix epoch milliseconds of that Beijing wall-clock reading.
 */
export function fromBeijing(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute, second) - 8 * 3_600_000
}

/**
 * Parse one `YYYY-MM-DD` holiday-table key into a Beijing instant.
 * @param date - calendar key as written in the holiday tables.
 * @param hour - Beijing hour of the requested reading.
 * @param minute - Beijing minute of the requested reading.
 * @returns Unix epoch milliseconds, or `null` when the key is malformed.
 */
export function fromBeijingDateKey(date: string, hour = 0, minute = 0): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null
  const [year, month, day] = splitBeijingDateKey(date)
  return fromBeijing(year, month, day, hour, minute)
}

/**
 * Format an instant as a Beijing date key.
 * @param timestamp - Unix epoch milliseconds.
 * @returns `YYYY-MM-DD` in Beijing time.
 */
export function beijingDateKey(timestamp: number): string {
  return beijingParts(timestamp).date
}

/**
 * Format an instant as a Beijing clock reading for display.
 * @param timestamp - Unix epoch milliseconds.
 * @param withSeconds - include the seconds field.
 * @returns `YYYY-MM-DD HH:MM` (or `YYYY-MM-DD HH:MM:SS`).
 */
export function formatBeijingClock(timestamp: number, withSeconds = true): string {
  // `en-CA` renders `YYYY-MM-DD, HH:MM:SS`; the comma becomes the separating space.
  const text = clockFormatter.format(timestamp).replace(', ', ' ')
  return withSeconds ? text : text.slice(0, 'YYYY-MM-DD HH:MM'.length)
}

/**
 * Beijing weekday of an instant as a short English name.
 * @param timestamp - Unix epoch milliseconds.
 * @returns `Mon`, `Tue`, … as `Intl` renders it for the Beijing calendar day.
 */
export function formatBeijingWeekday(timestamp: number): string {
  // `en-CA` renders `Tue, 2026-10-13`: the name precedes the date.
  const text = weekdayFormatter.format(timestamp)
  const comma = text.indexOf(',')
  return comma < 0 ? text.trim() : text.slice(0, comma).trim()
}

/** Zero-pad a calendar key component. */
function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/**
 * Build the `YYYY-MM-DD` key of a Beijing calendar date.
 * @param year - Beijing year.
 * @param month - Beijing month, 1-12.
 * @param day - Beijing day of month.
 * @returns the holiday-table key form.
 */
export function formatDateKey(year: number, month: number, day: number): string {
  return `${pad(year)}-${pad(month)}-${pad(day)}`
}

/** Days in one Beijing calendar month (Shanghai has no DST, so this is plain). */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/**
 * ISO weekday of a calendar date: 1 = Monday … 7 = Sunday.
 * @param year - full year.
 * @param month - month, 1-12.
 * @param day - day of month.
 * @returns the ISO weekday number.
 */
export function isoWeekday(year: number, month: number, day: number): number {
  // `Date.UTC(...).getUTCDay()` is zone-free and immune to the local calendar.
  const sundayBased = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return sundayBased === 0 ? 7 : sundayBased
}

/**
 * Next Beijing calendar day after a date key.
 * @param date - `YYYY-MM-DD` key.
 * @returns the following day's key.
 */
export function nextDateKey(date: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date)
  if (parts === null) return date
  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  const length = month === 2 && isLeapYear(year) ? 29 : (MONTH_LENGTHS[month - 1] ?? 30)
  if (day < length) return formatDateKey(year, month, day + 1)
  if (month < 12) return formatDateKey(year, month + 1, 1)
  return formatDateKey(year + 1, 1, 1)
}

/**
 * Split a `YYYY-MM-DD` key into its numeric calendar parts.
 * @param date - calendar key as written in the holiday tables.
 * @returns `[year, month, day]`; a malformed key yields `[1970, 1, 1]`.
 */
export function splitBeijingDateKey(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date)
  if (match === null) return [1970, 1, 1]
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Gregorian leap-year rule.
 * @param year - full year.
 * @returns whether the year has 29 days in February.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}
