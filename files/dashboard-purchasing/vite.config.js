import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: [
      'IDWS-N26010',
      'idws-n26010',
      'IDWS-N26010.internal.detmold.com.au',
      'localhost',
      '10.62.11.92',      // ✅ UPDATED dari 10.62.11.106
      '127.0.0.1'
    ],
    proxy: {
      '/api': {
        target: 'http://10.62.11.92:5000', // ✅ UPDATED ke IP 10.62.11.92
        changeOrigin: true,
        secure: false,
        // Logger untuk memantau trafik proxy di terminal Vite
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('🔄 Proxy meneruskan request:', req.method, req.url);
          });
          proxy.on('error', (err, _req, _res) => {
            console.log('💥 Proxy Error:', err.message);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('✅ Proxy response:', proxyRes.statusCode, req.url);
          });
        }
      }
    }
  }
})