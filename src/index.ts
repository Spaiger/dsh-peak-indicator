/**
 * Peak/off-peak indicator, node half.
 *
 * Pure UI plugin, shaped exactly like the shipped `dsh-client-ui-*` packages
 * (`ui-open-in-app`, `ui-session`): the empty `apply` exists so the Loader row
 * resolves to a valid Cordis plugin — `ctx.registry.plugin()` throws
 * `invalid plugin, expect function or object with an "apply" method` for
 * anything else — while the browser half ships via `exports["./client"]` and is
 * discovered through the `dsh.client` manifest declaration.
 *
 * Both halves are mandatory for an installed plugin: without a root `"."`
 * export the host boot fails with
 * `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined`, and without
 * `./client` there is nothing for the browser to load.
 *
 * The rest of this module republishes the tariff logic and the PRC calendar, so
 * tests, scripts, and SDK-side code can answer "is this instant peak in
 * Beijing?" without a browser.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}

export {
  BEIJING_TZ,
  beijingDateKey,
  beijingParts,
  formatBeijingClock,
  formatBeijingWeekday,
  formatDateKey,
  fromBeijing,
  fromBeijingDateKey,
  isLeapYear,
  isoWeekday,
  nextDateKey,
  splitBeijingDateKey,
  type BeijingParts,
} from './beijing.ts'

export {
  calendarCoverage,
  CN_HOLIDAYS,
  CN_HOLIDAYS_2026,
  CN_HOLIDAYS_2027,
  CN_MAKEUP_WORKDAYS,
  CN_MAKEUP_WORKDAYS_2026,
  CN_MAKEUP_WORKDAYS_2027,
  COVERAGE_WARNING_DAYS,
  COVERED_YEARS,
  HOLIDAY_CALENDAR,
  isCnHoliday,
  isCnMakeupWorkday,
  isYearCovered,
  type CalendarCoverage,
  type HolidayYear,
} from './holidays.ts'

export {
  classifyDay,
  findNextTransition,
  getPricingState,
  isPeak,
  matchPeakWindow,
  OFF_PEAK_RATE_FACTOR,
  PEAK_WINDOWS,
  phaseForDay,
  phaseOf,
  type DayRule,
  type PeakWindow,
  type PricingPhase,
  type PricingState,
} from './pricing.ts'

export {
  buildLabel,
  buildPresentation,
  describeRule,
  discountPercent,
  en,
  formatDuration,
  peakWindowsText,
  pickLanguage,
  ru,
  showsSeconds,
  STRINGS,
  weekdayName,
  type Language,
  type Presentation,
  type Strings,
  type WeekdayNames,
} from './strings.ts'

export {
  DEFAULT_CONFIG,
  isDeepSeekModelId,
  isDeepSeekProviderId,
  isDeepSeekRoute,
  isDeepSeekSession,
  type ModelRoute,
  type ModelSelectionProjectionLike,
  type PeakIndicatorConfig,
} from './provider.ts'

export {
  CONFIG_GLOBAL,
  DEFAULTS,
  normalizeConfig,
  readConfig,
  resolveLanguage,
  type PeakIndicatorConfigInput,
  type ResolvedConfig,
} from './config.ts'
