import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { fetchOrganizations } from '@/features/organizations/api'
import type { ProjectCategory } from '@/types/project'
import { fetchCategories, fetchProjects } from './api'

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
 * бекенд. Загальної кількості бекенд не повертає, тому просимо на один проєкт більше,
 * ніж показуємо: якщо він прийшов, є що довантажувати.
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
      new Map(organizations.map((org) => [org.id, org.name])),
  })
