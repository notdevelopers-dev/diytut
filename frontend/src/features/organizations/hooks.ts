import {
  useInfiniteQuery,
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

export const ORGANIZATIONS_PAGE_SIZE = 12

/**
 * Каталог із кнопкою «Показати ще»: фільтр за містом і зсув виконує бекенд
 * (city_id, limit, offset). Загальної кількості бекенд не повертає, тому просимо
 * на одну організацію більше, ніж показуємо: якщо вона прийшла, є що довантажувати.
 */
export const useOrganizations = (
  cityId: number | null,
  pageSize = ORGANIZATIONS_PAGE_SIZE,
) =>
  useInfiniteQuery({
    queryKey: ['organizations', 'list', { cityId, pageSize }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchOrganizations({
        city_id: cityId,
        limit: pageSize + 1,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastPage.length > pageSize ? lastOffset + pageSize : undefined,
    select: (data) => ({
      items: data.pages.flatMap((rows) => rows.slice(0, pageSize)),
    }),
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
