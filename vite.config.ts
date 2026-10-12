import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { guide } from './plugins/guide/index.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    guide({
      dir: fileURLToPath(new URL('./guide', import.meta.url)),
      siteUrl: 'https://aboutf1.com',
      siteName: 'About F1',
      season: '2026',
    }),
  ],
})
