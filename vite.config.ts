import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const packageMetadata = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version?: unknown }

if (typeof packageMetadata.version !== 'string' || packageMetadata.version.length === 0) {
  throw new Error('package.json must define a non-empty string version')
}

const version = packageMetadata.version

export default defineConfig({
  base: '/KeyBpmMap/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
})
