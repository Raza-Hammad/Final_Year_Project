import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Google OAuth matches page origins exactly. Bind the IPv4 loopback so
    // http://127.0.0.1:5173 works (default "localhost" can bind IPv6 ::1 only on
    // Windows, making that origin unreachable). Both origins are listed in docs/GOOGLE_OAUTH.md.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
