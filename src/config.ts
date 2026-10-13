/**
 * Plugin configuration: pure normalization of an optional host-supplied object.
 *
 * Following the shipped client-plugin pattern (see
 * `dsh-client-ui-sidebar-documentpreview`), the browser half reads its
 * configuration from a global the host injects, so no Cordis service and no
 * network is involved. Everything has a default, so the plugin also runs with
 * no configuration at all.
 */

import { pickLanguage, type Language } from './strings.ts'

/** Global the host may populate before the bundle materializes. */
export const CONFIG_GLOBAL = '__DSH_PEAK_INDICATOR_CONFIG__'

/** Accepted configuration surface; every field is optional. */
export interface PeakIndicatorConfigInput {
  /** Extra provider group ids that count as DeepSeek. */
  readonly providerIds?: readonly string[]
  /** Extra provider-id prefixes that count as DeepSeek. */
  readonly providerPrefixes?: readonly string[]
  /** Extra model-id prefixes that count as DeepSeek. */
  readonly modelPrefixes?: readonly string[]
  /** Show the capsule while a session's model route is still unresolved. */
  readonly showWhenUnknown?: boolean
  /** Capsule recalculation period in milliseconds. */
  readonly refreshMs?: number
  /** Recalculation period used while the countdown shows seconds. */
  readonly fastRefreshMs?: number
  /** Force one language instead of following the browser. */
  readonly language?: string
  /** Slot the capsule registers into. */
  readonly slot?: 'conversation.session.header.utilities' | 'conversation.session.header.actions'
  /** List `order` of the capsule inside its slot. */
  readonly order?: number
}

/** Resolved configuration: every field present. */
export interface ResolvedConfig extends Required<Omit<PeakIndicatorConfigInput, 'language'>> {
  /** Forced language, or `undefined` to follow the browser. */
  readonly language: Language | undefined
}

/** Default configuration. */
export const DEFAULTS: ResolvedConfig = {
  providerIds: ['deepseek-account', 'deepseek-official', 'deepseek'],
  providerPrefixes: ['deepseek'],
  modelPrefixes: ['deepseek-'],
  showWhenUnknown: false,
  refreshMs: 30_000,
  fastRefreshMs: 1_000,
  language: undefined,
  slot: 'conversation.session.header.utilities',
  order: -20,
}

/**
 * Merge a partial, untrusted configuration over the defaults.
 * @param input - the host-supplied object; anything malformed is ignored.
 * @returns the resolved configuration.
 */
export function normalizeConfig(input: unknown): ResolvedConfig {
  if (typeof input !== 'object' || input === null) return DEFAULTS
  const raw = input as Record<string, unknown>
  return {
    providerIds: stringArray(raw.providerIds, DEFAULTS.providerIds),
    providerPrefixes: stringArray(raw.providerPrefixes, DEFAULTS.providerPrefixes),
    modelPrefixes: stringArray(raw.modelPrefixes, DEFAULTS.modelPrefixes),
    showWhenUnknown: booleanOf(raw.showWhenUnknown, DEFAULTS.showWhenUnknown),
    refreshMs: positiveInt(raw.refreshMs, DEFAULTS.refreshMs),
    fastRefreshMs: positiveInt(raw.fastRefreshMs, DEFAULTS.fastRefreshMs),
    ...languageOf(raw.language),
    slot: raw.slot === 'conversation.session.header.actions'
      ? 'conversation.session.header.actions'
      : DEFAULTS.slot,
    order: Number.isFinite(raw.order) ? Number(raw.order) : DEFAULTS.order,
  }
}

/**
 * Read the configuration global and resolve it.
 * @param scope - object carrying the global, normally `globalThis`.
 * @returns the resolved configuration.
 */
export function readConfig(scope: unknown = globalThis): ResolvedConfig {
  if (typeof scope !== 'object' || scope === null) return DEFAULTS
  return normalizeConfig((scope as Record<string, unknown>)[CONFIG_GLOBAL])
}

/**
 * Language to render: the forced configuration value, else the browser's.
 * @param config - resolved configuration.
 * @param navigatorLanguage - `navigator.language`, when available.
 * @returns the language id.
 */
export function resolveLanguage(config: ResolvedConfig, navigatorLanguage?: string): Language {
  return config.language ?? pickLanguage(navigatorLanguage)
}

/** Accept a string array, else fall back. */
function stringArray(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) return fallback
  const items = value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
  return items.length === 0 ? fallback : items
}

/** Accept a boolean, else fall back. */
function booleanOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Accept a positive finite integer, else fall back. */
function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 100) return fallback
  return Math.floor(value)
}

/** Accept a shipped language id, else follow the browser. */
function languageOf(value: unknown): { language: Language | undefined } {
  if (value === 'ru' || value === 'en') return { language: value }
  return { language: undefined }
}
