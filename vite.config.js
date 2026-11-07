import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/expense-tracker-web/',
  server: {
    host: true, // exposes on 0.0.0.0 so mobile devices on the same Wi-Fi can connect
    port: 5173,
  },
})
