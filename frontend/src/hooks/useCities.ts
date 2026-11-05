import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'

export interface CityItem {
  id: number
  name: string
  region: string
}

/** Список міст із GET /api/cities. Без підстановки вигаданих міст при помилці. */
export const useCities = () => {
  const [cities, setCities] = useState<CityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    apiClient
      .get<CityItem[]>('/cities')
      .then(({ data }) => {
        if (isMounted) setCities(data)
      })
      .catch(() => {
        if (isMounted) {
          setError('Не вдалося завантажити список міст. Оновіть сторінку.')
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  return { cities, isLoading, error }
}
