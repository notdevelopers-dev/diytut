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

export const ORGANIZATIONS_PAGE_SIZE = 6

/**
 * Каталог організацій: фільтр за містом і пагінація «Завантажити ще» виконуються
 * на бекенді (city_id, limit, offset). Бекенд не повертає загальну кількість,
 * тому неповна сторінка означає, що наступної немає.
 */
export const useOrganizations = (
  cityId: number | null,
  pageSize = ORGANIZATIONS_PAGE_SIZE,
) =>
  useInfiniteQuery({
    queryKey: ['organizations', 'list', { cityId, pageSize }],
    queryFn: ({ pageParam }) =>
      fetchOrganizations({
        city_id: cityId,
        limit: pageSize,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < pageSize ? undefined : allPages.length * pageSize,
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
