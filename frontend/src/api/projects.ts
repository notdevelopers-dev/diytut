import { apiClient } from './client'
import type { Project } from '../types/project'

/** Максимум, який бекенд віддає за один запит (limit ≤ 100) */
const PROJECTS_LIMIT = 100

export interface FetchProjectsParams {
  /** Пошук бекенд виконує за назвою й описом */
  search?: string
  city_id?: number | null
}

/**
 * Каталог: бекенд віддає лише опубліковані проєкти, що ще не завершилися.
 * Без `limit` він повертає лише 20, тому просимо максимум.
 */
export const fetchProjects = async (
  params?: FetchProjectsParams,
): Promise<Project[]> => {
  const { data } = await apiClient.get<Project[]>('/projects', {
    params: {
      limit: PROJECTS_LIMIT,
      ...(params?.search ? { search: params.search } : {}),
      ...(params?.city_id ? { city_id: params.city_id } : {}),
    },
  })
  return data
}

/** Назви організацій за id: у списку проєктів бекенд повертає лише organization_id. */
export const fetchOrganizationNames = async (): Promise<
  Map<number, string>
> => {
  const { data } = await apiClient.get<{ id: number; name: string }[]>(
    '/organizations',
    { params: { limit: PROJECTS_LIMIT } },
  )
  return new Map(data.map((org) => [org.id, org.name]))
}
