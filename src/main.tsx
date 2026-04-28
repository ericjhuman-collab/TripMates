import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initErrorTracker } from './services/errorTracker'

// Init before render so anything that throws during mount is captured.
// No-op when VITE_SENTRY_DSN is not set.
initErrorTracker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
