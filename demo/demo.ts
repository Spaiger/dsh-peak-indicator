/**
 * Demo facade: the plugin's pure surface, gathered for the standalone preview
 * (`npm run demo`). The DSH bundle itself never imports this file.
 */

import { formatBeijingClock, fromBeijing, isoWeekday } from '../src/beijing.ts'
import {
  calendarCoverage,
  CN_HOLIDAYS_2026,
  CN_MAKEUP_WORKDAYS_2026,
  COVERED_YEARS,
  isCnHoliday,
  isCnMakeupWorkday,
} from '../src/holidays.ts'
import { getPricingState, PEAK_WINDOWS } from '../src/pricing.ts'
import { isDeepSeekSession } from '../src/provider.ts'
import { buildLabel, buildPresentation, formatDuration, weekdayName } from '../src/strings.ts'
import { CAPSULE_CSS, capsuleClass, CLASSES } from '../src/client/styles.ts'

export const demo = {
  CAPSULE_CSS,
  CLASSES,
  capsuleClass,
  getPricingState,
  buildPresentation,
  buildLabel,
  formatDuration,
  formatBeijingClock,
  weekdayName,
  fromBeijing,
  isoWeekday,
  isDeepSeekSession,
  isCnHoliday,
  isCnMakeupWorkday,
  calendarCoverage,
  PEAK_WINDOWS,
  CN_HOLIDAYS_2026,
  CN_MAKEUP_WORKDAYS_2026,
  COVERED_YEARS,
}
