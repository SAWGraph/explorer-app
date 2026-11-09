import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { reportsDevOnly } from './vite.reports'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), reportsDevOnly(env.VITE_API_BASE_URL)],
  }
})
