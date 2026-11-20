import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_ME_QUERY_KEY } from '@/features/auth/hooks'
import { USER_SCOPED_META } from '@/lib/query-client'
import {
  fetchLoginStats,
  fetchOrganizationRequests,
  reviewOrganizationRequest,
} from './api'
import type { FetchOrganizationRequestsParams } from './api'
import type { OrganizationReview } from './types'

// Дані адмін-панелі бачить лише адміністратор, тож під час виходу вони
// прибираються з кешу разом з іншими даними користувача (USER_SCOPED_META)

const ORGANIZATION_REQUESTS_QUERY_KEY = ['admin', 'organizations'] as const

/** Заявки на створення організацій */
export const useOrganizationRequests = (
  params: FetchOrganizationRequestsParams,
) =>
  useQuery({
    queryKey: [...ORGANIZATION_REQUESTS_QUERY_KEY, params],
    queryFn: () => fetchOrganizationRequests(params),
    meta: USER_SCOPED_META,
  })

/**
 * Схвалити чи відхилити заявку. Рішення змінює статус організації, тож оновлюємо
 * список заявок, кеші організацій (каталог, профілі) і /auth/me, де є організація
 * користувача. Навіть після помилки: 409 означає, що заявку вже розглянув інший
 * адміністратор, і список має показати її новий статус.
 */
export const useReviewOrganizationRequest = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, review }: { id: number; review: OrganizationReview }) =>
      reviewOrganizationRequest(id, review),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ORGANIZATION_REQUESTS_QUERY_KEY,
        }),
        queryClient.invalidateQueries({ queryKey: ['organizations'] }),
        queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY }),
      ]),
  })
}

/** Статистика входів за період; дати у форматі YYYY-MM-DD, обидві межі включно */
export const useLoginStats = (dateFrom: string, dateTo: string) =>
  useQuery({
    queryKey: ['admin', 'stats', 'logins', { dateFrom, dateTo }],
    queryFn: () => fetchLoginStats(dateFrom, dateTo),
    meta: USER_SCOPED_META,
  })
