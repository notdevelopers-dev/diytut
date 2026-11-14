import { apiClient } from '@/lib/api-client'
import { TEST_CITIES, hasTestSession } from '@/features/auth/testSession' // TEST-LOGIN
import type { CityItem } from '@/types/common'

export const fetchCities = async (): Promise<CityItem[]> => {
  if (hasTestSession()) return TEST_CITIES // TEST-LOGIN
  const { data } = await apiClient.get<CityItem[]>('/cities')
  return data
}
