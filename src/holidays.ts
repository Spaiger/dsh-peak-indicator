/**
 * Official PRC holiday calendar (Variant A: hard-coded dates, no lunar
 * calendar arithmetic, no network).
 *
 * Source for 2026: 国务院办公厅关于2026年部分节假日安排的通知,
 * 国办发明电〔2025〕7号, published 2025-11-04 —
 * http://www.gov.cn/zhengce/content/ (国务院公报 2025 年第 32 号).
 *
 * Tariff source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing —
 * 北京时间周一至周五（不含中国法定节假日）9:00–12:00、14:00–18:00 为高峰时段；
 * 其余时段（含周末及法定节假日全天）为空闲时段，空闲时段价格为高峰时段的 50%。
 *
 * ## Adding the next year
 *
 * The State Council publishes the following year's arrangement in November.
 * Copy the block below, fill in the two arrays, add the year to
 * `HOLIDAY_CALENDAR`, and extend `COVERED_YEARS`. Nothing else changes: the
 * lookup is a merged `Set`, and `calendarCoverage()` starts warning in the UI
 * once the visible day leaves the covered range.
 */

import { beijingDateKey, fromBeijing } from './beijing.ts'

/**
 * 2026 statutory holidays — the whole day is off-peak regardless of the hour.
 *
 * 一、元旦 1月1日–3日；二、春节 2月15日–23日；三、清明节 4月4日–6日；
 * 四、劳动节 5月1日–5日；五、端午节 6月19日–21日；六、中秋节 9月25日–27日；
 * 七、国庆节 10月1日–7日。
 */
export const CN_HOLIDAYS_2026 = [
  // 元旦 New Year: Thu 01-01 … Sat 01-03.
  '2026-01-01', '2026-01-02', '2026-01-03',
  // 春节 Spring Festival: Sun 02-15 (腊月廿八) … Mon 02-23 (正月初七).
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  // 清明节 Qingming: Sat 04-04 … Mon 04-06.
  '2026-04-04', '2026-04-05', '2026-04-06',
  // 劳动节 Labour Day: Fri 05-01 … Tue 05-05.
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  // 端午节 Dragon Boat: Fri 06-19 … Sun 06-21.
  '2026-06-19', '2026-06-20', '2026-06-21',
  // 中秋节 Mid-Autumn: Fri 09-25 … Sun 09-27.
  '2026-09-25', '2026-09-26', '2026-09-27',
  // 国庆节 National Day: Thu 10-01 … Wed 10-07.
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
] as const satisfies readonly string[]

/**
 * 2026 make-up workdays (调休上班) — a Saturday/Sunday that is worked, so it
 * follows the ordinary weekday peak rule instead of the weekend rule.
 *
 * 1月4日（周日）、2月14日（周六）、2月28日（周六）、5月9日（周六）、
 * 9月20日（周日）、10月10日（周六）上班。
 */
export const CN_MAKEUP_WORKDAYS_2026 = [
  '2026-01-04', // Sunday, works for 元旦
  '2026-02-14', // Saturday, works for 春节
  '2026-02-28', // Saturday, works for 春节
  '2026-05-09', // Saturday, works for 劳动节
  '2026-09-20', // Sunday, works for 国庆节
  '2026-10-10', // Saturday, works for 国庆节
] as const satisfies readonly string[]

/**
 * 2027 statutory holidays.
 *
 * The State Council had not published the 2027 arrangement at the time of
 * writing (it normally lands in November 2026), so this table is intentionally
 * empty — an empty year means "no known holiday", and `calendarCoverage()`
 * reports 2027 as uncovered so the capsule can warn instead of silently
 * treating a holiday as a peak workday. Fill it in as soon as 国办发明电 for
 * 2027 is published.
 */
export const CN_HOLIDAYS_2027: readonly string[] = []

/** 2027 make-up workdays; empty until the 2027 arrangement is published. */
export const CN_MAKEUP_WORKDAYS_2027: readonly string[] = []

/** One year of the PRC calendar: its holidays and its make-up workdays. */
export interface HolidayYear {
  /** Calendar year the two tables describe. */
  readonly year: number
  /** Statutory holidays: whole-day off-peak. */
  readonly holidays: readonly string[]
  /** Make-up workdays: weekend days that follow the weekday rule. */
  readonly makeupWorkdays: readonly string[]
}

/** Every year this build knows about, newest last. */
export const HOLIDAY_CALENDAR: readonly HolidayYear[] = [
  { year: 2026, holidays: CN_HOLIDAYS_2026, makeupWorkdays: CN_MAKEUP_WORKDAYS_2026 },
  { year: 2027, holidays: CN_HOLIDAYS_2027, makeupWorkdays: CN_MAKEUP_WORKDAYS_2027 },
]

/** Years with a published, complete arrangement. */
export const COVERED_YEARS: readonly number[] = HOLIDAY_CALENDAR
  .filter(entry => entry.holidays.length > 0)
  .map(entry => entry.year)

/**
 * Warning lead time after the last covered year ends: the capsule starts
 * reporting "calendar data may be stale" this many days before the hard-coded
 * table runs out, which is enough time to ship the next 国办发明电 tables.
 */
export const COVERAGE_WARNING_DAYS = 30

/** Merged holiday keys of every known year. */
export const CN_HOLIDAYS: ReadonlySet<string> = new Set(
  HOLIDAY_CALENDAR.flatMap(entry => [...entry.holidays]),
)

/** Merged make-up workday keys of every known year. */
export const CN_MAKEUP_WORKDAYS: ReadonlySet<string> = new Set(
  HOLIDAY_CALENDAR.flatMap(entry => [...entry.makeupWorkdays]),
)

/**
 * Whether one Beijing date key is a statutory holiday.
 * @param date - `YYYY-MM-DD` in Beijing time.
 * @returns whether the whole day is off-peak.
 */
export function isCnHoliday(date: string): boolean {
  return CN_HOLIDAYS.has(date)
}

/**
 * Whether one Beijing date key is a make-up workday.
 * @param date - `YYYY-MM-DD` in Beijing time.
 * @returns whether a weekend day must be treated as a weekday.
 */
export function isCnMakeupWorkday(date: string): boolean {
  return CN_MAKEUP_WORKDAYS.has(date)
}

/**
 * Whether a Beijing calendar year has a published arrangement in this build.
 * @param year - full year.
 * @returns whether the holiday tables can be trusted for that year.
 */
export function isYearCovered(year: number): boolean {
  return COVERED_YEARS.includes(year)
}

/** Coverage of the calendar around one instant's Beijing day. */
export interface CalendarCoverage {
  /** Whether the Beijing day's year has a published arrangement. */
  readonly covered: boolean
  /** Years this build knows about, ascending. */
  readonly coveredYears: readonly number[]
  /**
   * Beijing date key from which this build starts warning that its calendar
   * data may be stale (end of the last covered year minus
   * {@link COVERAGE_WARNING_DAYS}).
   */
  readonly warningFrom: string
}

/**
 * Report calendar coverage for one instant, so the UI can warn before the
 * hard-coded table runs out instead of mislabelling a 2027 holiday as a peak
 * workday.
 * @param timestamp - Unix epoch milliseconds.
 * @returns coverage for the instant's Beijing day.
 */
export function calendarCoverage(timestamp: number): CalendarCoverage {
  const year = new Date(timestamp + 8 * 3_600_000).getUTCFullYear()
  const lastCovered = COVERED_YEARS[COVERED_YEARS.length - 1]
  return {
    covered: lastCovered !== undefined && year <= lastCovered,
    coveredYears: COVERED_YEARS,
    // Trusted to the end of the last covered year; the warning lead starts
    // `COVERAGE_WARNING_DAYS` earlier so a stale build is visible in advance.
    warningFrom: beijingDateKey(lastCovered === undefined
      ? fromBeijing(year, 1, 1)
      : fromBeijing(lastCovered, 12, 31) - COVERAGE_WARNING_DAYS * 86_400_000),
  }
}
