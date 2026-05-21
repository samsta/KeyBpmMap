import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  base: '/KeyBpmMap/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
})
