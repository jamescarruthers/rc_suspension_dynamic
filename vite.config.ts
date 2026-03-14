import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/rc_suspension_dynamic/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['rk4-wasm'],
  },
})
