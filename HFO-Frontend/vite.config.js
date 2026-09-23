import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs' // 👈 Add this to read directories
import { defineConfig, loadEnv } from 'vite'
import { runtimeConfigPlugin } from './runtime-config.js'
import react from '@vitejs/plugin-react-swc'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 1. Automatically find all HTML files in your root directory
const getHtmlInputs = () => {
  const inputs = {}
  const files = readdirSync(__dirname)
  
  files.forEach(file => {
    if (file.endsWith('.html')) {
      // e.g., "about-us.html" becomes an entry named "about-us"
      const name = file.replace('.html', '')
      inputs[name] = resolve(__dirname, file)
    }
  })
  
  return inputs
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_')
  const apiBase = env.VITE_API_BASE_URL || (command === 'serve'
    ? 'http://localhost:8000'
    : 'https://perpetual-tranquility-production-d044.up.railway.app')
  return {
  plugins: [
    runtimeConfigPlugin(__dirname, apiBase),
    react({
      include: '**/*.{js,jsx,ts,tsx}',
    }),
  ],
  esbuild: {
    loader: 'jsx',
    jsx: 'automatic',
  },
  build: {
    rollupOptions: {
      // 2. Pass the automatically generated object here
      input: getHtmlInputs(),
    },
  },
  }
})
