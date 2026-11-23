import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks'
import { fetchOrganizations } from '@/features/organizations/api'
import { USER_SCOPED_META } from '@/lib/query-client'
import type { JoinRequest } from '@/types/organization'
import type { ProjectCategory, ProjectJoinRequestStatus } from '@/types/project'
import {
  cancelProjectJoinRequest,
  createProjectJoinRequest,
  fetchCategories,
  fetchMyProjectRequestStatuses,
  fetchProjects,
} from './api'

/** 12 ділиться і на 2, і на 3, і на 4 колонки: ряди сітки лишаються повними */
export const PROJECTS_PAGE_SIZE = 12

/** Ліміти бекенду для ?tags= (app.routers.projects) */
const MAX_TAG_FILTERS = 20
const MAX_TAG_FILTER_LENGTH = 100

/**
 * Рядок пошуку → текст і хештеги: «прибирання #толока #Дніпро» дає
 * search «прибирання» і tags [«толока», «дніпро»]. Самотній «#» ігнорується;
 * регістр і апострофи бекенд нормалізує сам.
 */
export const parseSearchQuery = (
  query: string,
): { search: string; tags: string[] } => {
  const words = query.trim().split(/\s+/).filter(Boolean)
  const tags = words
    .filter((word) => word.startsWith('#'))
    .map((word) => word.replace(/^#+/, ''))
    .filter((tag) => tag.length > 0 && tag.length <= MAX_TAG_FILTER_LENGTH)
  const search = words.filter((word) => !word.startsWith('#')).join(' ')
  return { search, tags: [...new Set(tags)].slice(0, MAX_TAG_FILTERS) }
}

export interface ProjectFilters {
  /** Рядок із поля пошуку: текст і/або #хештеги */
  query: string
  cityId: number | null
  categories: ProjectCategory[]
}

/**
 * Каталог із кнопкою «Показати ще»: пошук, хештеги, сфери, місто й зсув виконує
 * бекенд. Довантажувати є що, поки показано менше, ніж total.
 */
export const useProjects = (
  { query, cityId, categories }: ProjectFilters,
  pageSize = PROJECTS_PAGE_SIZE,
) => {
  const { search, tags } = parseSearchQuery(query)
  // Порядок вибраних сфер не важливий: однаковий ключ кешу для однакового набору
  const sortedCategories = [...categories].sort()
  return useInfiniteQuery({
    queryKey: [
      'projects',
      'list',
      { search, tags, cityId, categories: sortedCategories, pageSize },
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchProjects({
        search,
        tags,
        city_id: cityId,
        categories: sortedCategories,
        limit: pageSize,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastOffset + pageSize < lastPage.total
        ? lastOffset + pageSize
        : undefined,
    // Поки йде новий пошук, лишаємо попередні результати замість скелетонів
    placeholderData: keepPreviousData,
    // Учасникам бекенд віддає точні час і адресу (R-22)
    meta: USER_SCOPED_META,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.items),
      total: data.pages.at(-1)?.total ?? 0,
    }),
  })
}

/** Сфери для фільтра й підписів на картках */
export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    // Список змінюється лише з деплоєм
    staleTime: Infinity,
  })

/**
 * Назви організацій для карток: список проєктів повертає лише organization_id.
 * Проєкти публікують тільки схвалені організації, а GET /organizations віддає саме їх
 * (до 100 — максимум бекенду; якщо організацій більше, у картці назви не буде).
 */
export const useOrganizationNames = () =>
  useQuery({
    queryKey: ['organizations', 'names'],
    queryFn: () => fetchOrganizations({ limit: 100 }),
    staleTime: 5 * 60 * 1000,
    select: (organizations) =>
      new Map(organizations.items.map((org) => [org.id, org.name])),
  })

const MY_REQUEST_STATUSES_KEY = ['projects', 'my-request-statuses'] as const

/**
 * Стани кнопок «Приєднатись» для карток сторінки: запит на кожні PROJECTS_PAGE_SIZE
 * карток, а не на кожну. Каталог дописує проєкти сторінками, тож «Показати ще» додає
 * один запит, а вже завантажені групи лишаються в кеші.
 */
export const useMyProjectRequestStatuses = (projectIds: number[]) => {
  const {
    isAuthenticated,
    isProfileComplete,
    isLoading: isAuthLoading,
  } = useAuth()
  // Заявки має лише користувач із заповненою анкетою
  const canHaveRequests = isAuthenticated && isProfileComplete
  const chunks: number[][] = []
  for (let i = 0; i < projectIds.length; i += PROJECTS_PAGE_SIZE) {
    chunks.push(projectIds.slice(i, i + PROJECTS_PAGE_SIZE))
  }
  return useQueries({
    queries: chunks.map((ids) => ({
      queryKey: [...MY_REQUEST_STATUSES_KEY, ids],
      queryFn: () => fetchMyProjectRequestStatuses(ids),
      enabled: canHaveRequests,
      meta: USER_SCOPED_META,
    })),
    combine: (results) => ({
      canHaveRequests,
      isLoading:
        isAuthLoading ||
        (canHaveRequests && results.some((result) => result.isLoading)),
      // Без входу — порожньо: кеш попереднього користувача не показуємо
      statuses: new Map<number, ProjectJoinRequestStatus>(
        canHaveRequests
          ? results.flatMap((result) =>
              (result.data ?? []).map((status) => [status.project_id!, status]),
            )
          : [],
      ),
    }),
  })
}

/** Підставляє нову заявку в групу станів, де є її проєкт, без повторного запиту */
const putStatus = (queryClient: QueryClient, joinRequest: JoinRequest) => {
  const status: ProjectJoinRequestStatus = {
    ...joinRequest,
    can_reapply_at: null,
  }
  for (const [key, data] of queryClient.getQueriesData<
    ProjectJoinRequestStatus[]
  >({ queryKey: MY_REQUEST_STATUSES_KEY })) {
    const ids = key[2] as number[]
    if (!ids.includes(status.project_id!)) continue
    queryClient.setQueryData(key, [
      ...(data ?? []).filter((item) => item.project_id !== status.project_id),
      status,
    ])
  }
}

const useJoinRequestMutation = <TVariables>(
  mutationFn: (variables: TVariables) => Promise<JoinRequest>,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (joinRequest) => putStatus(queryClient, joinRequest),
    // Стан кнопки міг застаріти (заявку змінено з іншої вкладки тощо): перечитуємо
    onError: () =>
      queryClient.invalidateQueries({ queryKey: MY_REQUEST_STATUSES_KEY }),
  })
}

/** Подати заявку: після успіху кнопка одразу переходить у «Запит очікує» */
export const useCreateProjectJoinRequest = (projectId: number) =>
  useJoinRequestMutation((message: string) =>
    createProjectJoinRequest(projectId, message),
  )

/** Скасувати заявку: кнопка знову стає «Приєднатись» */
export const useCancelProjectJoinRequest = (projectId: number) =>
  useJoinRequestMutation(() => cancelProjectJoinRequest(projectId))
