import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { AUTH_ME_QUERY_KEY } from '@/features/auth/hooks'
import { USER_SCOPED_META } from '@/lib/query-client'
import {
  createJoinRequest,
  createOrganization,
  fetchIncomingJoinRequests,
  fetchMyJoinRequest,
  fetchMyOrganization,
  fetchMyOrganizations,
  fetchOrganization,
  fetchOrganizations,
  updateMyOrganization,
} from './api'

export const ORGANIZATIONS_PAGE_SIZE = 12

/**
 * Каталог із кнопкою «Показати ще»: фільтр за містом і зсув виконує бекенд
 * (city_id, limit, offset). Довантажувати є що, поки показано менше, ніж total.
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
        limit: pageSize,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastOffset + pageSize < lastPage.total
        ? lastOffset + pageSize
        : undefined,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.items),
      total: data.pages.at(-1)?.total ?? 0,
    }),
  })

export const MY_ORGANIZATION_QUERY_KEY = ['organizations', 'me'] as const

/** Профіль власної організації; `enabled=false`, якщо організації в користувача немає. */
export const useMyOrganization = (enabled = true) =>
  useQuery({
    queryKey: MY_ORGANIZATION_QUERY_KEY,
    queryFn: fetchMyOrganization,
    enabled,
    meta: USER_SCOPED_META,
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

/** Публічна сторінка організації /organizations/:id */
export const useOrganization = (organizationId: number) =>
  useQuery({
    queryKey: ['organizations', 'detail', organizationId],
    queryFn: () => fetchOrganization(organizationId),
    enabled: Number.isInteger(organizationId) && organizationId > 0,
    // 404 (немає або не схвалена) не має сенсу повторювати
    retry: false,
  })

export const MY_ORGANIZATIONS_QUERY_KEY = ['organizations', 'mine'] as const

/** Членства поточного користувача; лише для того, хто увійшов */
export const useMyOrganizations = (enabled: boolean) =>
  useQuery({
    queryKey: MY_ORGANIZATIONS_QUERY_KEY,
    queryFn: fetchMyOrganizations,
    enabled,
    meta: USER_SCOPED_META,
  })

const myJoinRequestKey = (organizationId: number) =>
  ['organizations', 'join-request', organizationId] as const

/** Остання заявка користувача до організації (або `null`) */
export const useMyJoinRequest = (organizationId: number, enabled: boolean) =>
  useQuery({
    queryKey: myJoinRequestKey(organizationId),
    queryFn: () => fetchMyJoinRequest(organizationId),
    enabled,
    meta: USER_SCOPED_META,
  })

/** Подати заявку: після успіху кнопка одразу переходить у «Запит очікує» */
export const useCreateJoinRequest = (organizationId: number) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => createJoinRequest(organizationId, message),
    onSuccess: (joinRequest) => {
      queryClient.setQueryData(myJoinRequestKey(organizationId), joinRequest)
    },
  })
}

/** Заявки на вступ, що чекають розгляду (кабінет організації) */
export const useIncomingJoinRequests = (
  organizationId: number | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['organizations', 'incoming-requests', organizationId],
    queryFn: () => fetchIncomingJoinRequests(organizationId as number),
    // Заявки бачать лише власник і адміністратори: після виходу прибираємо з кешу
    meta: USER_SCOPED_META,
    enabled: enabled && Boolean(organizationId),
    // Учаснику без прав бекенд відповідає 403 — повторювати немає сенсу
    retry: false,
  })
