import { apiClient } from '@/lib/api-client'

/** GET /api/stats (app.schemas.stats.PlatformStatsRead) */
export interface PlatformStats {
  volunteers_count: number
  organizations_count: number
  projects_count: number
}

export const fetchStats = async (): Promise<PlatformStats> => {
  const { data } = await apiClient.get<PlatformStats>('/stats')
  return data
}
