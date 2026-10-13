/** Throwaway check: render dist/demo.html in happy-dom and print what it shows. */
import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'

const html = readFileSync(new URL('../dist/demo.html', import.meta.url), 'utf8')
const win = new Window({ url: 'http://localhost/', settings: { disableJavaScriptFileLoading: true } })
win.document.write(html)
const d = win.document
const text = (id) => (d.getElementById(id)?.textContent ?? '<missing>')
const capsule = () => d.getElementById('capsule')

console.log('capsule class :', capsule()?.className)
console.log('capsule text  :', text('capsule'))
console.log('phase/rule    :', capsule()?.getAttribute('data-phase'), capsule()?.getAttribute('data-rule'))
console.log('tooltip       :', text('tooltip').split('\n').slice(0, 3).join(' / '))
console.log('readout rows  :', d.getElementById('readout')?.children.length)
console.log('timeline segs :', d.getElementById('timeline')?.children.length)
console.log('week days     :', d.getElementById('week')?.children.length)
console.log('acceptance    :', [...(d.getElementById('acceptance')?.children ?? [])].map(tr => tr.lastElementChild?.textContent).join(' '))
console.log('visibility    :', text('visibility-note').slice(0, 60))
console.log('style injected:', [...d.head.querySelectorAll('style')].some(s => s.textContent.includes('dshpi-capsule')))

function choose(id, value) {
  const el = d.getElementById(id)
  el.value = value
  el.dispatchEvent(new win.Event('change'))
}
function preset(at) {
  const btn = [...d.querySelectorAll('button[data-at]')].find(b => b.getAttribute('data-at') === at)
  btn.dispatchEvent(new win.Event('click'))
}

choose('provider', 'openai')
console.log('--- openai ---')
console.log('capsule text  :', JSON.stringify(text('capsule')), 'visibility:', capsule()?.style.visibility)
console.log('note          :', text('visibility-note').slice(0, 70))

choose('provider', 'deepseek-account')
preset('2026-10-01T10:30')
console.log('--- holiday preset (2026-10-01 10:30 Beijing) ---')
console.log('capsule text  :', text('capsule'))
console.log('rule attr     :', capsule()?.getAttribute('data-rule'))
console.log('tooltip rule  :', text('tooltip').split('\n')[1])

preset('2026-10-10T15:00')
console.log('--- make-up Saturday (2026-10-10 15:00) ---')
console.log('capsule text  :', text('capsule'), '| rule:', capsule()?.getAttribute('data-rule'))

preset('2026-10-13T11:59:30')
console.log('--- under one hour (2026-10-13 11:59:30) ---')
console.log('capsule text  :', text('capsule'))

preset('2027-03-03T10:00')
console.log('--- uncovered year (2027-03-03) ---')
console.log('capsule class :', capsule()?.className)
console.log('tooltip last  :', text('tooltip').split('\n').pop())

choose('language', 'en')
preset('2026-10-13T10:30')
console.log('--- english ---')
console.log('capsule text  :', text('capsule'))
console.log('tooltip line1 :', text('tooltip').split('\n')[0])

win.happyDOM.close()
process.exit(0)
