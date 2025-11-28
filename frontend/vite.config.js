import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Expose root .env to the frontend so both backend and frontend share the same file
export default defineConfig({
  envDir: '..',
  plugins: [react()],
  server: {
    port: 3000,
  },
})
