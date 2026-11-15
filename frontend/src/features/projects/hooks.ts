import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { fetchOrganizations } from '@/features/organizations/api'
import { fetchProjects } from './api'

/** 12 ділиться і на 2, і на 3, і на 4 колонки: ряди сітки лишаються повними */
export const PROJECTS_PAGE_SIZE = 12

/**
 * Каталог із кнопкою «Показати ще»: пошук, фільтр за містом і зсув виконує бекенд.
 * Загальної кількості бекенд не повертає, тому просимо на один проєкт більше,
 * ніж показуємо: якщо він прийшов, є що довантажувати.
 */
export const useProjects = (
  search: string,
  cityId: number | null,
  pageSize = PROJECTS_PAGE_SIZE,
) =>
  useInfiniteQuery({
    queryKey: ['projects', 'list', { search, cityId, pageSize }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchProjects({
        search,
        city_id: cityId,
        limit: pageSize + 1,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastPage.length > pageSize ? lastOffset + pageSize : undefined,
    // Поки йде новий пошук, лишаємо попередні результати замість скелетонів
    placeholderData: keepPreviousData,
    select: (data) => ({
      items: data.pages.flatMap((rows) => rows.slice(0, pageSize)),
    }),
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
      new Map(organizations.map((org) => [org.id, org.name])),
  })
