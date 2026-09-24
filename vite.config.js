import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANTE: cambia 'cepal-cluster' por el nombre exacto de tu repo en GitHub
export default defineConfig({
  plugins: [react()],
  base: '/cepal-cluster/',
})
