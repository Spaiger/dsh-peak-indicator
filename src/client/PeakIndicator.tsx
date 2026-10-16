/**
 * The ⚡/🌙 capsule: a Session-header utility that states the current DeepSeek
 * tariff and counts down to the next change.
 *
 * The component owns no subscription machinery (DSH client rule): the clock is
 * component-local `useState` + `setInterval`, live session data arrives through
 * the framework `useProjection` hook, and every derived value is a `useMemo`
 * over those two.
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the `conversation.session.header.*` SlotMap rows and the session
// standard props (`sessionId`, `useSession`, `useProjection`).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { ModelSelectionProjection } from '@deepseek-ai/dsh-api-session-controller/types'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { getPricingState } from '../pricing.ts'
import { isDeepSeekSession } from '../provider.ts'
import { buildLabel, buildPresentation, formatDuration, showsSeconds, type Language } from '../strings.ts'
import type { ResolvedConfig } from '../config.ts'
import { capsuleClass, useCapsuleStyle } from './styles.ts'

/** Slot the capsule registers into: the right-aligned Session-header utilities. */
export type PeakIndicatorSlot =
  | 'conversation.session.header.utilities'
  | 'conversation.session.header.actions'

/** Props the capsule needs beyond the slot's own runtime share. */
export interface PeakIndicatorOwnProps {
  /** Resolved plugin configuration. */
  readonly config: ResolvedConfig
  /** Copy set to render. */
  readonly language: Language
}

/** Complete props of one registered capsule, for the utilities seat. */
export type PeakIndicatorProps =
  PropsRuntime<'conversation.session.header.utilities'> & PeakIndicatorOwnProps

/** Complete props of one registered capsule, for the title-adjacent actions seat. */
export type PeakIndicatorActionProps =
  PropsRuntime<'conversation.session.header.actions'> & PeakIndicatorOwnProps

/**
 * Render the tariff capsule for the surrounding Session, or nothing when the
 * Session is not routed to DeepSeek.
 * @param props - slot runtime share plus configuration and language.
 * @returns the capsule, or `null` for a non-DeepSeek Session.
 */
export function PeakIndicator(props: PeakIndicatorProps | PeakIndicatorActionProps): ReactNode {
  const { config, language, useProjection } = props
  const matching = useMemo(() => ({
    providerIds: config.providerIds,
    providerPrefixes: config.providerPrefixes,
    modelPrefixes: config.modelPrefixes,
    showWhenUnknown: config.showWhenUnknown,
  }), [config])
  const deepseek = useProjection('modelSelection', projection => isDeepSeekSession(
    projection as ModelSelectionProjection | undefined,
    matching,
  ))
  // One shared <style> tag per document, installed on the first mounted capsule
  // and removed with the last one (a component effect, not module evaluation:
  // the DSH module system is lazy-CJS).
  useEffect(useCapsuleStyle, [])
  // One clock, woken exactly when a displayed digit can change: on every wall
  // minute while the countdown shows minutes (one wake per minute, half the old
  // 30 s polling rate), on every wall second while it shows seconds. Every
  // tariff boundary (09:00, 12:00, 14:00, 18:00, midnight) lies on a minute
  // boundary, so the aligned wake also flips the phase with zero latency —
  // no polling lag and no wake that cannot change the label.
  const [granularity, setGranularity] = useState(MINUTE_MS)
  const now = useAlignedClock(granularity)
  const state = useMemo(() => getPricingState(now), [now])
  useEffect(() => {
    const next = showsSeconds(state.msUntilChange) ? SECOND_MS : MINUTE_MS
    if (next !== granularity) setGranularity(next)
  }, [state, granularity])
  // The reading and the label share one instant, so the countdown is exactly
  // `msUntilChange` of the render's reading: there is no second time source to
  // drift or freeze against the state.
  const presentation = useMemo(() => buildPresentation(state, language), [state, language])
  const label = useMemo(
    () => buildLabel(state.phase, formatDuration(state.msUntilChange, language), language),
    [state, language],
  )
  if (!deepseek) return null
  return (
    <Tooltip
      label={() => presentation.tooltip}
      side="bottom"
      align="end"
      portal
      delayMs={150}
      maxWidth={420}
    >
      <span
        className={capsuleClass(state.phase, presentation.calendarStale)}
        data-phase={state.phase}
        data-rule={state.rule}
        aria-label={presentation.ariaLabel}
      >
        {label}
      </span>
    </Tooltip>
  )
}

/** One second, in milliseconds: the seconds-mode wake period. */
const SECOND_MS = 1_000

/** One minute, in milliseconds: the minutes-mode wake period. */
const MINUTE_MS = 60_000

/**
 * Component-local clock woken on display-digit boundaries.
 *
 * A chained `setTimeout` fires on the next multiple of `granularityMs` in wall
 * time (epoch-aligned; Beijing is a whole-minute offset, so wall and Beijing
 * boundaries coincide). Each wake recomputes from `Date.now()`, which makes the
 * chain self-correcting after a system-clock step; sleeping machines fire the
 * overdue wake on resume; `visibilitychange` resyncs the instant the tab
 * returns. Background tabs skip the render work but keep the chain, where the
 * browser's own throttling (≥1/min for chained timeouts) caps the rate.
 * @param granularityMs - wake period: 60 000 while the label shows minutes,
 * 1 000 while it shows seconds.
 * @returns the instant of the latest wake.
 */
function useAlignedClock(granularityMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let active = true
    const schedule = () => {
      if (!active) return
      const delay = granularityMs - (Date.now() % granularityMs)
      timer = setTimeout(() => {
        if (!active) return
        // A hidden tab is throttled and invisible: skip the render work, keep
        // the chain; the visibility listener resyncs on return.
        if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
          setNow(Date.now())
        }
        schedule()
      }, delay)
    }
    const resync = () => {
      if (active) setNow(Date.now())
    }
    schedule()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resync)
    return () => {
      active = false
      if (timer !== undefined) clearTimeout(timer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resync)
    }
  }, [granularityMs])
  return now
}
