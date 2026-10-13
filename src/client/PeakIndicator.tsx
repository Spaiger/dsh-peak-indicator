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
import { getPricingState, type PricingState } from '../pricing.ts'
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
  // The tariff state is recomputed on the slow tick; only the countdown text
  // follows the fast tick, so a seconds display costs no extra calendar work.
  const slowNow = useClock(config.refreshMs)
  const state = useMemo(() => getPricingState(slowNow), [slowNow])
  const fastNow = useClock(showsSeconds(state.msUntilChange) ? config.fastRefreshMs : null)
  // Tooltip and accessible name follow the slow tick; only the countdown text
  // follows the fast one, so a seconds display costs no extra `Intl` work.
  const presentation = useMemo(() => buildPresentation(state, language), [state, language])
  const label = useMemo(
    () => buildLabel(state.phase, formatDuration(remainingMs(state, fastNow), language), language),
    [state.phase, language, state.msUntilChange, state.now, fastNow],
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

/**
 * Live countdown for one reading.
 * @param state - the reading from the slow tick.
 * @param now - the fast tick's sample.
 * @returns milliseconds left until the next phase change, clamped at zero.
 */
function remainingMs(state: PricingState, now: number): number {
  return Math.max(0, state.msUntilChange - (now - state.now))
}

/**
 * Component-local clock.
 * @param intervalMs - tick period, or `null` to freeze (hidden tab, no need).
 * @returns the current `Date.now()` sampled on that period.
 */
function useClock(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (intervalMs === null) return undefined
    setNow(Date.now())
    const timer = setInterval(() => {
      // A background tab is throttled and invisible; skip the work entirely.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      setNow(Date.now())
    }, intervalMs)
    return () => { clearInterval(timer) }
  }, [intervalMs])
  return now
}
