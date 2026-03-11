import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// VITE_API_TARGET: overridden to http://gateway:8080 inside Docker containers.
// Defaults to http://localhost:8080 for normal local (non-Docker) dev.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // open:true cannot work inside a Docker container — disable it there.
    open: !process.env.VITE_API_TARGET,
    proxy: {
      '/api': {
        target: apiTarget,  // All APIs routed to Go backend / gateway container
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      }
    }
  }
})