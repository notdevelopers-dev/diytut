import { apiClient } from '@/lib/api-client'
import type { Project } from '@/types/project'

export interface FetchProjectsParams {
  /** Пошук за назвою й описом (бекенд, ilike) */
  search?: string
  city_id?: number | null
  limit?: number
  offset?: number
}

/** Каталог: опубліковані проєкти, що ще не завершилися, нові першими. */
export const fetchProjects = async (
  params?: FetchProjectsParams,
): Promise<Project[]> => {
  const search = params?.search?.trim()
  const { data } = await apiClient.get<Project[]>('/projects', {
    params: {
      ...(search ? { search } : {}),
      ...(params?.city_id ? { city_id: params.city_id } : {}),
      ...(params?.limit ? { limit: params.limit } : {}),
      ...(params?.offset ? { offset: params.offset } : {}),
    },
  })
  return data
}
