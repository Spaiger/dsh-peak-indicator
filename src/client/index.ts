/**
 * dsh-peak-indicator — browser half.
 *
 * A client-only DSH (DeepSeek Harness) plugin: it registers one Session-header
 * utility that shows the current DeepSeek tariff as a ⚡/🌙 capsule with a
 * countdown to the next change. All arithmetic is local (Beijing time plus a
 * hard-coded PRC holiday table); the plugin makes no request of any kind.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only declarations: the SlotMap rows, the `ctx.slots` service merge, and
// the session standard props. Cross-plugin edges stay type-only so the bundle
// resolves every runtime value against the shell's shared-module baseline.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { readConfig, resolveLanguage } from '../config.ts'
import { PeakIndicator } from './PeakIndicator.tsx'
import type { PeakIndicatorOwnProps } from './PeakIndicator.tsx'

/** Configuration surface accepted through `__DSH_PEAK_INDICATOR_CONFIG__`. */
export type { PeakIndicatorConfigInput, ResolvedConfig } from '../config.ts'
export type {
  PeakIndicatorActionProps, PeakIndicatorOwnProps, PeakIndicatorProps, PeakIndicatorSlot,
} from './PeakIndicator.tsx'

/** Cordis services this plugin needs: the slot registry only. */
export const inject = ['slots']

/**
 * Register the tariff capsule into the Session header.
 * @param ctx - browser context carrying the slot registry.
 */
export function apply(ctx: ClientContext): void {
  const config = readConfig()
  const language = resolveLanguage(
    config,
    typeof navigator === 'undefined' ? undefined : navigator.language,
  )
  // The seats sit in `conversation.session.header`, which `ui-conversation`
  // owns: contribute through `slots.inject` so the entry follows the owner's
  // declaration lifetime instead of failing while the header is unmounted.
  // Both seats are `list`/`session` with an empty owner share; `utilities` is
  // the right-aligned row beside the session-log action, `actions` the
  // title-adjacent row (ascending order, so a negative order sits leftmost).
  if (config.slot === 'conversation.session.header.actions') {
    function HeaderAction(
      props: PropsRuntime<'conversation.session.header.actions'> & PeakIndicatorOwnProps,
    ) {
      return PeakIndicator({ ...props, config, language })
    }
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'peak-indicator',
      order: config.order,
    }, HeaderAction))
    return
  }
  function HeaderUtility(
    props: PropsRuntime<'conversation.session.header.utilities'> & PeakIndicatorOwnProps,
  ) {
    return PeakIndicator({ ...props, config, language })
  }
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'peak-indicator',
    order: config.order,
  }, HeaderUtility))
}
