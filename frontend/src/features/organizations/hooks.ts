import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { AUTH_ME_QUERY_KEY } from '@/features/auth/hooks'
import {
  createOrganization,
  fetchMyOrganization,
  fetchOrganizations,
  updateMyOrganization,
} from './api'

export const ORGANIZATIONS_PAGE_SIZE = 10

/**
 * Одна сторінка каталогу: фільтр за містом і зсув виконує бекенд (city_id, limit, offset).
 * Загальної кількості бекенд не повертає, тому просимо на одну організацію більше,
 * ніж показуємо: якщо вона прийшла, наступна сторінка існує.
 */
export const useOrganizations = (
  cityId: number | null,
  page: number,
  pageSize = ORGANIZATIONS_PAGE_SIZE,
) =>
  useQuery({
    queryKey: ['organizations', 'list', { cityId, page, pageSize }],
    queryFn: () =>
      fetchOrganizations({
        city_id: cityId,
        limit: pageSize + 1,
        offset: (page - 1) * pageSize,
      }),
    select: (rows) => ({
      items: rows.slice(0, pageSize),
      hasNext: rows.length > pageSize,
    }),
    // Таблиця не блимає, поки вантажиться сусідня сторінка
    placeholderData: keepPreviousData,
  })

export const MY_ORGANIZATION_QUERY_KEY = ['organizations', 'me'] as const

/** Профіль власної організації; `enabled=false`, якщо організації в користувача немає. */
export const useMyOrganization = (enabled = true) =>
  useQuery({
    queryKey: MY_ORGANIZATION_QUERY_KEY,
    queryFn: fetchMyOrganization,
    enabled,
  })

/** Після створення чи зміни організація приходить у /auth/me: скидаємо його кеш. */
const useInvalidateOrganizationData = () => {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['organizations'] }),
      queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY }),
    ])
  }
}

export const useCreateOrganization = () => {
  const invalidate = useInvalidateOrganizationData()
  return useMutation({
    mutationFn: createOrganization,
    onSuccess: invalidate,
  })
}

export const useUpdateOrganization = () => {
  const invalidate = useInvalidateOrganizationData()
  return useMutation({
    mutationFn: updateMyOrganization,
    onSuccess: invalidate,
  })
}
