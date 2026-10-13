/**
 * Capsule styling.
 *
 * Inline styles with a plugin-owned `<style>` tag, which is one of the two
 * routes the brief allows and the safer one for a single-package build: the
 * monorepo preset compiles `*.module.css` through lightningcss and injects it
 * when the bundle factory runs, while a standalone `tsdown`/`esbuild` build
 * emits a separate `lib/style.css` that the DSH module loader would never
 * fetch. Keeping the sheet in the bundle means `lib/client.js` is the whole
 * plugin.
 *
 * Injection is deferred to the component's first mount, not module evaluation:
 * the DSH client module system is lazy-CJS, and a bundle is only supposed to
 * register its factory until something materializes it.
 */

/** Class names this plugin owns, prefixed so they cannot collide in the header. */
export const CLASSES = {
  capsule: 'dshpi-capsule',
  peak: 'dshpi-peak',
  offPeak: 'dshpi-offpeak',
  stale: 'dshpi-stale',
} as const

/** Marker attribute of the injected tag; also its deduplication key. */
export const STYLE_TAG_ID = 'dsh-peak-indicator/capsule.css'

/**
 * The stylesheet.
 *
 * Colours are the tariff red/green from the brief on a transparent fill with a
 * hairline `currentcolor` border, so the capsule sits on any header theme. The
 * state is also carried by `data-phase` and by the text itself, never by colour
 * alone.
 */
export const CAPSULE_CSS = `
.${CLASSES.capsule} {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid currentcolor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
  user-select: none;
  cursor: default;
  font-variant-numeric: tabular-nums;
  opacity: 0.95;
}
.${CLASSES.capsule}:focus-visible {
  outline: 2px solid currentcolor;
  outline-offset: 2px;
}
.${CLASSES.peak} { color: #e5484d; }
.${CLASSES.offPeak} { color: #30a46c; }
.${CLASSES.stale} { border-style: dashed; opacity: 0.8; }
@media (prefers-contrast: more) {
  .${CLASSES.capsule} { opacity: 1; border-width: 2px; }
}
`.trim()

/** Live capsule count, so the shared tag outlives every instance but one. */
let mounted = 0
let tag: HTMLStyleElement | null = null

/**
 * Count one mounted capsule, installing the shared stylesheet on the first one
 * and removing it when the last one unmounts.
 *
 * Called from a component effect rather than at module evaluation: the DSH
 * client module system is lazy-CJS, where a bundle only registers its factory
 * and every side effect belongs to materialization or later.
 * @returns the effect's disposer.
 */
export function useCapsuleStyle(): () => void {
  if (typeof document === 'undefined') return () => {}
  mounted += 1
  if (tag === null) {
    tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-peak-indicator'
    tag.dataset.pluginCss = STYLE_TAG_ID
    tag.textContent = CAPSULE_CSS
    document.head.appendChild(tag)
  }
  return () => {
    mounted -= 1
    if (mounted > 0 || tag === null) return
    tag.remove()
    tag = null
  }
}

/**
 * Compose the capsule's class list for one reading.
 * @param phase - the tariff phase.
 * @param stale - whether the hard-coded PRC calendar has run out.
 * @returns the class attribute value.
 */
export function capsuleClass(phase: 'peak' | 'off-peak', stale: boolean): string {
  const state = phase === 'peak' ? CLASSES.peak : CLASSES.offPeak
  return stale ? `${CLASSES.capsule} ${state} ${CLASSES.stale}` : `${CLASSES.capsule} ${state}`
}
