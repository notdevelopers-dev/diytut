import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/app/App'
import '@/styles/globals.css'

const start = async () => {
  // Тестовий режим без бекенду. Умова записана прямо, щоб Vite у продакшні
  // замінив її на false і прибрав import('@/mocks') із бандла
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    const { enableMocks } = await import('@/mocks')
    enableMocks()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
