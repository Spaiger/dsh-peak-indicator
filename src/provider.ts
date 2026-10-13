/**
 * Session provider detection: the capsule is a DeepSeek tariff fact, so it must
 * stay hidden for sessions routed to another provider.
 *
 * The DSH session model publishes the durable model route through the
 * `modelSelection` projection (`{ lastUsed, next }`, each a
 * `{ provider, model }` pair). The shipped DeepSeek provider group ids are
 * `deepseek-account` (the signed-in DeepSeek account) and `deepseek-official`
 * (an API-key DeepSeek provider); a user-configured provider keeps its own id,
 * so the model-name prefix is checked as a second signal.
 */

/** One model route as published by the `modelSelection` projection. */
export interface ModelRoute {
  readonly provider?: string | null
  readonly model?: string | null
}

/** The projection value this plugin reads. */
export interface ModelSelectionProjectionLike {
  readonly lastUsed?: ModelRoute | null
  readonly next?: ModelRoute | null
}

/** Plugin configuration. */
export interface PeakIndicatorConfig {
  /** Provider group ids that count as DeepSeek. */
  readonly providerIds: readonly string[]
  /** Match any provider id starting with one of these prefixes. */
  readonly providerPrefixes: readonly string[]
  /** Match any model id starting with one of these prefixes. */
  readonly modelPrefixes: readonly string[]
  /** Show the capsule while the session has no resolved model route yet. */
  readonly showWhenUnknown: boolean
}

/** Default DeepSeek matching rules. */
export const DEFAULT_CONFIG: PeakIndicatorConfig = {
  providerIds: ['deepseek-account', 'deepseek-official', 'deepseek'],
  providerPrefixes: ['deepseek'],
  modelPrefixes: ['deepseek-'],
  showWhenUnknown: false,
}

/**
 * Whether one provider id names DeepSeek.
 * @param provider - provider group id from the model route.
 * @param config - matching rules.
 * @returns whether the id is a DeepSeek provider.
 */
export function isDeepSeekProviderId(
  provider: string | null | undefined,
  config: PeakIndicatorConfig = DEFAULT_CONFIG,
): boolean {
  if (provider === null || provider === undefined || provider === '') return false
  const id = provider.toLowerCase()
  if (config.providerIds.includes(id)) return true
  return config.providerPrefixes.some(prefix => id.startsWith(prefix.toLowerCase()))
}

/**
 * Whether one model id is a DeepSeek model, the fallback signal for a
 * user-configured provider that proxies DeepSeek models.
 * @param model - model id from the model route.
 * @param config - matching rules.
 * @returns whether the model id looks like a DeepSeek model.
 */
export function isDeepSeekModelId(
  model: string | null | undefined,
  config: PeakIndicatorConfig = DEFAULT_CONFIG,
): boolean {
  if (model === null || model === undefined || model === '') return false
  const id = model.toLowerCase()
  return config.modelPrefixes.some(prefix => id.startsWith(prefix.toLowerCase()))
}

/**
 * Whether one model route is billed by DeepSeek.
 * @param route - the route to test; `null`/`undefined` means "unresolved".
 * @param config - matching rules.
 * @returns whether the DeepSeek tariff applies to this route.
 */
export function isDeepSeekRoute(
  route: ModelRoute | null | undefined,
  config: PeakIndicatorConfig = DEFAULT_CONFIG,
): boolean {
  if (route === null || route === undefined) return config.showWhenUnknown
  return isDeepSeekProviderId(route.provider, config) || isDeepSeekModelId(route.model, config)
}

/**
 * Whether the capsule should render for one session's model selection.
 *
 * `next` is the route the following request uses and wins; `lastUsed` is the
 * fallback for a session whose selection has not been re-published yet.
 * @param projection - the `modelSelection` projection value, or `undefined`
 * when the host has not projected it (capability absent).
 * @param config - matching rules.
 * @returns whether this session is a DeepSeek session.
 */
export function isDeepSeekSession(
  projection: ModelSelectionProjectionLike | null | undefined,
  config: PeakIndicatorConfig = DEFAULT_CONFIG,
): boolean {
  // No projection at all means the host never folded a model selection for this
  // session (capability absent): that is not an "unknown route", so the capsule
  // stays hidden even when `showWhenUnknown` is on.
  if (projection === null || projection === undefined) return false
  // `next` is the route the following request uses, so a resolved `next`
  // decides on its own: a session that just switched away from DeepSeek must
  // stop showing the DeepSeek tariff immediately, not keep it from history.
  if (projection.next !== null && projection.next !== undefined) {
    return isDeepSeekRoute(projection.next, config)
  }
  // No `next` yet: fall back to the route the last request consumed.
  if (projection.lastUsed !== null && projection.lastUsed !== undefined) {
    return isDeepSeekRoute(projection.lastUsed, config)
  }
  // Neither route resolved: the session has not made a model request yet, so
  // `showWhenUnknown` decides whether to guess.
  return config.showWhenUnknown
}
