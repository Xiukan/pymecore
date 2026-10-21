import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    // Las pruebas de Playwright (e2e/) las corre su propio runner.
    include: ['src/**/*.test.ts'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
