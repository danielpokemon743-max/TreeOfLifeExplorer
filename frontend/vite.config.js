import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      // Redireciona chamadas do FastAPI para a porta 8000
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/otol-api': {
        target: 'https://api.opentreeoflife.org',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/otol-api/, '/v3')
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['@simplewebauthn/browser'],
        }
      }
    }
  }
})