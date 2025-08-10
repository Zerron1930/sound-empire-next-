// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',         // make it explicit that index.html is in repo root
  build: { outDir: 'dist' },
})
