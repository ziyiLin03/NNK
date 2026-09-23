import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function runtimeConfigPlugin(root, apiBase) {
  const source = `window.API_BASE_URL = ${JSON.stringify(apiBase.replace(/\/+$/, ''))};\n`
    + readFileSync(resolve(root, 'public/config.js'), 'utf8')
  return {
    name: 'hfo-runtime-config',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/config.js') return next()
        res.setHeader('Content-Type', 'application/javascript')
        res.setHeader('Cache-Control', 'no-store')
        res.end(source)
      })
    },
    writeBundle(options) {
      writeFileSync(resolve(options.dir, 'config.js'), source)
    },
  }
}
