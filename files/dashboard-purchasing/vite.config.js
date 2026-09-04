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
      '10.62.11.106',
      '127.0.0.1'
    ]
  }
})