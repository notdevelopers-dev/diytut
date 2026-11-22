import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { AUTH_ME_QUERY_KEY } from '@/features/auth/hooks'
import { USER_SCOPED_META } from '@/lib/query-client'
import type {
  JoinRequestDecision,
  OrganizationJoinRequest,
} from '@/types/organization'
import {
  createJoinRequest,
  createOrganization,
  fetchIncomingJoinRequests,
  fetchMyJoinRequest,
  fetchMyOrganization,
  fetchMyOrganizations,
  fetchOrganization,
  fetchOrganizations,
  reviewJoinRequest,
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

const incomingRequestsKey = (organizationId: number | undefined) =>
  ['organizations', 'incoming-requests', organizationId] as const

/** Заявки на вступ, що чекають розгляду (кабінет організації) */
export const useIncomingJoinRequests = (
  organizationId: number | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: incomingRequestsKey(organizationId),
    queryFn: () => fetchIncomingJoinRequests(organizationId as number),
    // Заявки бачать лише власник і адміністратори: після виходу прибираємо з кешу
    meta: USER_SCOPED_META,
    enabled: enabled && Boolean(organizationId),
    // Учаснику без прав бекенд відповідає 403 — повторювати немає сенсу
    retry: false,
  })

/**
 * Схвалити або відхилити заявку на вступ. Після успіху заявка зникає зі списку
 * (показуємо лише pending), а дані організації оновлюються — у ній новий учасник.
 */
export const useReviewJoinRequest = (organizationId: number | undefined) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: JoinRequestDecision }) =>
      reviewJoinRequest(id, status),
    onSuccess: (_data, { id }) => {
      queryClient.setQueryData<OrganizationJoinRequest[]>(
        incomingRequestsKey(organizationId),
        (old) => old?.filter((r) => r.id !== id),
      )
    },
    // І після помилки (заявку вже розглянув інший адмін) — свіжий список із бекенду
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  })
}
