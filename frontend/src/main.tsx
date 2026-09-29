import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './global.css'   // แทน './index.css'
import App from './App.tsx'
import { AuthProvider } from './features/auth/context/AuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)