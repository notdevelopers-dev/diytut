import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiProxyTarget,
    },
  },
})
