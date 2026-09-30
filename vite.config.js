import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // listen on all interfaces so it's reachable via hostname/LAN IP, not just localhost
    // Vite blocks requests whose Host header isn't recognized (DNS-rebinding
    // protection) - add any hostname/FQDN you'll access the dev server through.
    allowedHosts: ['gbl25108053.hc.cloud.uk.hsbc'],
    proxy: {
      '/api/chat': {
        target: 'http://127.0.0.1:4000',
        rewrite: () => '/v1/chat/completions',
        changeOrigin: true,
      },
      '/api/models': {
        target: 'http://127.0.0.1:3030',
        rewrite: () => '/v1/models',
        changeOrigin: true,
      },
      '/api/diagram': {
        target: 'http://127.0.0.1:3030',
        rewrite: (path) => path.replace(/^\/api\/diagram/, '/v1/diagram'),
        changeOrigin: true,
      },
    },
  },
})
