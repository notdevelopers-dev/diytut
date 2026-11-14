import { apiClient } from '@/lib/api-client'
import { mockAdapter } from './adapter'

/** Підміняє мережевий шар axios на тестовий: бекенд не потрібен. */
export const enableMocks = () => {
  apiClient.defaults.adapter = mockAdapter
  console.info(
    '[mock] Режим без бекенду: усі запити /api обробляє src/mocks (npm run dev:mock)',
  )
}
