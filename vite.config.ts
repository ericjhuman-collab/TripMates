import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  build: {
    sourcemap: false,
  },
  // Replace `console.log/debug/info/warn` with no-ops in production
  // bundles only. `console.error` is preserved so genuine failures still
  // surface and any future error-tracker (Sentry) hook can pick them up.
  // Dev (`vite serve`) is unaffected because `command === 'build'` only
  // matches at build-time.
  ...(command === 'build' && {
    define: {
      'console.log': '(()=>{})',
      'console.debug': '(()=>{})',
      'console.info': '(()=>{})',
      'console.warn': '(()=>{})',
    },
  }),
}))
