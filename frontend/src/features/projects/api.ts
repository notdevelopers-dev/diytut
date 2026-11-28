import { apiClient } from '@/lib/api-client'
import type { JoinRequest, JoinRequestStatus } from '@/types/organization'
import type {
  CategoryItem,
  ExperienceLevel,
  Project,
  ProjectCategory,
  ProjectDetail,
  ProjectJoinRequest,
  ProjectJoinRequestStatus,
} from '@/types/project'

export interface FetchProjectsParams {
  /** Пошук за назвою й описом (бекенд, ilike) */
  search?: string
  city_id?: number | null
  /** Проєкти з будь-якою з цих сфер */
  categories?: ProjectCategory[]
  /** Проєкти з будь-яким із цих хештегів (без «#») */
  tags?: string[]
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
      // Масиви йдуть як ?tags=a&tags=b (paramsSerializer у lib/api-client)
      ...(params?.categories?.length ? { categories: params.categories } : {}),
      ...(params?.tags?.length ? { tags: params.tags } : {}),
      ...(params?.limit ? { limit: params.limit } : {}),
      ...(params?.offset ? { offset: params.offset } : {}),
    },
  })
  return data
}

/** Усі сфери для фільтра: GET /api/categories (список змінюється лише з деплоєм) */
export const fetchCategories = async (): Promise<CategoryItem[]> => {
  const { data } = await apiClient.get<CategoryItem[]>('/categories')
  return data
}

/**
 * Останні заявки користувача на ці проєкти одним запитом (до 100 id); проєктів без
 * заявок у відповіді немає
 */
export const fetchMyProjectRequestStatuses = async (
  projectIds: number[],
): Promise<ProjectJoinRequestStatus[]> => {
  const { data } = await apiClient.get<ProjectJoinRequestStatus[]>(
    '/projects/my-request-statuses',
    { params: { project_id: projectIds } },
  )
  return data
}

/** Заявка на проєкт; супровідний лист необов'язковий (до 1000 символів) */
export const createProjectJoinRequest = async (
  projectId: number,
  message: string,
): Promise<JoinRequest> => {
  const { data } = await apiClient.post<JoinRequest>(
    `/projects/${projectId}/join-requests`,
    { message: message.trim() || null },
  )
  return data
}

/** Скасувати свою заявку (в очікуванні чи схвалену) до початку події */
export const cancelProjectJoinRequest = async (
  projectId: number,
): Promise<JoinRequest> => {
  const { data } = await apiClient.delete<JoinRequest>(
    `/projects/${projectId}/my-request`,
  )
  return data
}

/** Проєкт разом із числом зайнятих місць; чернетку бачать лише учасники організації */
export const fetchProject = async (
  projectId: number,
): Promise<ProjectDetail> => {
  const { data } = await apiClient.get<ProjectDetail>(`/projects/${projectId}`)
  return data
}

/** Скільки заявок на проєкт за раз (ліміт бекенду — 100) */
export const PROJECT_REQUESTS_PAGE_SIZE = 20

/**
 * Заявки на проєкт для його організації (owner і admin), давніші першими, з рівнем
 * і годинами волонтера. Без статусу бекенд віддає ті, що на розгляді.
 */
export const fetchProjectJoinRequests = async (
  projectId: number,
  status: JoinRequestStatus,
  offset: number,
): Promise<ProjectJoinRequest[]> => {
  const { data } = await apiClient.get<ProjectJoinRequest[]>(
    `/projects/${projectId}/join-requests`,
    { params: { status, limit: PROJECT_REQUESTS_PAGE_SIZE, offset } },
  )
  return data
}

/** Тіло POST /projects (app.schemas.projects.ProjectCreate) */
export interface ProjectPayload {
  /** Від імені якої з організацій користувача; без поля — організація за замовчуванням */
  organization_id?: number
  /** draft: лише назва обов'язкова; published: повна перевірка полів */
  status: 'draft' | 'published'
  title: string
  description?: string
  starts_at?: string
  ends_at?: string
  is_online: boolean
  city_id?: number
  address?: string
  capacity?: number
  volunteer_hours?: number
  is_adult_only: boolean
  experience_level: ExperienceLevel
  categories: ProjectCategory[]
  tags: string[]
}

/** Створити проєкт від імені однієї з організацій користувача */
export const createProject = async (
  payload: ProjectPayload,
): Promise<Project> => {
  const { data } = await apiClient.post<Project>('/projects', payload)
  return data
}
