import { useQuery } from '@tanstack/react-query'
import { fetchCities } from './api'

export const CITIES_QUERY_KEY = ['cities'] as const

/** Список міст із GET /api/cities. Без підстановки вигаданих міст при помилці. */
export const useCities = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: CITIES_QUERY_KEY,
    queryFn: fetchCities,
    // Міста майже не змінюються
    staleTime: Infinity,
  })

  return {
    cities: data ?? [],
    isLoading,
    error: isError
      ? 'Не вдалося завантажити список міст. Оновіть сторінку.'
      : null,
  }
}
