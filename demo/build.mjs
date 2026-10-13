/**
 * Build the standalone preview: `npm run demo` → `dist/demo.html`.
 *
 * The page is one self-contained file (inlined CSS, inlined bundle, no network),
 * so it also renders inside a sandboxed preview frame.
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const marker = '/*__DEMO_BUNDLE__*/'

const result = await build({
  entryPoints: [resolve(root, 'demo/demo.ts')],
  bundle: true,
  format: 'iife',
  globalName: '__peakDemoExports',
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  minify: false,
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
})

const code = result.outputFiles[0]?.text
if (code === undefined) throw new Error('demo: esbuild produced no output')

const template = await readFile(resolve(root, 'demo/demo.html'), 'utf8')
if (!template.includes(marker)) throw new Error(`demo: ${marker} is missing from demo.html`)
// The bundle is inserted as the body of a <script> element, so a literal
// `</script>` inside a string would close it early.
const html = template.replace(marker, () => `${code}\nwindow.__peakDemo = __peakDemoExports.demo;`.replace(/<\/script/gu, '<\\/script'))

await mkdir(resolve(root, 'dist'), { recursive: true })
const out = resolve(root, 'dist/demo.html')
await writeFile(out, html, 'utf8')
console.log(`demo: wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`)
