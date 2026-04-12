import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': 'http://127.0.0.1:8011',
      '/items': 'http://127.0.0.1:8011',
      '/references': 'http://127.0.0.1:8011',
      '/demo-queries': 'http://127.0.0.1:8011',
      '/query': 'http://127.0.0.1:8011',
      '/explain': 'http://127.0.0.1:8011',
      '/corpus': 'http://127.0.0.1:8011',
    },
  },
})
