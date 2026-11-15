import { apiClient } from '@/lib/api-client'
import type { CityItem } from '@/types/common'

export const fetchCities = async (): Promise<CityItem[]> => {
  const { data } = await apiClient.get<CityItem[]>('/cities')
  return data
}
