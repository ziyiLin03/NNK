import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { runtimeConfigPlugin } from '../runtime-config.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
test('unconfigured production pages use the new Railway service', () => {
  const window = { location: { hostname: 'nnk-nu.vercel.app' } }
  runInNewContext(readFileSync(join(root, 'public/config.js'), 'utf8'), { window })
  assert.equal(window.API_BASE_URL, 'https://perpetual-tranquility-production-d044.up.railway.app')
  assert.equal(window.HFO_ANALYTICS_API, window.API_BASE_URL)
})
test('production config preserves custom API for legacy scripts and analytics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hfo-config-'))
  try {
    runtimeConfigPlugin(root, 'https://backend.example.com///').writeBundle({ dir })
    const window = { location: { hostname: 'frontend.example.com' } }
    runInNewContext(readFileSync(join(dir, 'config.js'), 'utf8'), { window })
    assert.equal(window.API_BASE_URL, 'https://backend.example.com')
    assert.equal(window.HFO_ANALYTICS_API, window.API_BASE_URL)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('development serves config synchronously, including cache-busting queries', () => {
  let handler
  runtimeConfigPlugin(root, 'http://localhost:8000').configureServer({
    middlewares: { use(fn) { handler = fn } },
  })
  const window = { location: { hostname: 'localhost' } }
  handler({ url: '/config.js?v=1' }, {
    setHeader() {},
    end(source) { runInNewContext(source, { window }) },
  }, () => assert.fail('config was not served'))
  assert.equal(window.API_BASE_URL, 'http://localhost:8000')
  let passed = false
  handler({ url: '/login.js' }, {}, () => { passed = true })
  assert.equal(passed, true)
})
test('all map pages load the shared configuration before their scripts', () => {
  for (const name of ['map1', 'map2', 'map3']) {
    const html = readFileSync(join(root, `${name}.html`), 'utf8')
    assert.ok(html.indexOf('/config.js') >= 0)
    assert.ok(!html.includes('window.API_BASE_URL ='))
    assert.ok(html.indexOf('/config.js') < html.indexOf(`/src/${name}.js`))
  }
})
test('photo capture offers a gallery/file picker without forcing the camera', () => {
  const html = readFileSync(join(root, 'take-picture.html'), 'utf8')
  assert.match(html, /id="device-image-input"/)
  assert.match(html, /accept="image\/\*"/)
  assert.doesNotMatch(html, /capture="environment"/)
  assert.match(html, /id="upload-device-button"/)
})
