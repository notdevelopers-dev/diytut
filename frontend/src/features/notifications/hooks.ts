import { useMemo } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks'
import { useProfileMode } from '@/features/users/profileMode'
import {
  fetchNotifications,
  markNotificationRead,
  NOTIFICATIONS_PAGE_SIZE,
} from './api'
import type { AppNotification } from './api'
import { filterByMode } from './utils'

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const

/** Як часто перевіряти нові сповіщення, поки сторінка відкрита */
const REFRESH_MS = 30_000

/**
 * Сповіщення поточного користувача для поточного режиму (волонтер / організація).
 * Бекенд віддає до 50 за раз; «Показати ще» довантажує наступні.
 */
export const useNotifications = () => {
  const { isAuthenticated, user } = useAuth()
  const mode = useProfileMode()

  const query = useInfiniteQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchNotifications(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === NOTIFICATIONS_PAGE_SIZE
        ? pages.length * NOTIFICATIONS_PAGE_SIZE
        : undefined,
    enabled: isAuthenticated,
    refetchInterval: REFRESH_MS,
  })

  const items = useMemo(
    () =>
      filterByMode(
        query.data?.pages.flat() ?? [],
        mode,
        Boolean(user?.organization),
      ),
    [query.data, mode, user?.organization],
  )
  const unreadCount = items.filter((n) => !n.is_read).length

  return { ...query, items, unreadCount, mode }
}

/** Оновлюємо сповіщення в кеші, не чекаючи нового запиту */
const useSetRead = () => {
  const queryClient = useQueryClient()
  return (ids: Set<number>) =>
    queryClient.setQueryData<{
      pages: AppNotification[][]
      pageParams: number[]
    }>(NOTIFICATIONS_QUERY_KEY, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) =>
              page.map((n) => (ids.has(n.id) ? { ...n, is_read: true } : n)),
            ),
          }
        : data,
    )
}

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient()
  const setRead = useSetRead()
  return useMutation({
    mutationFn: markNotificationRead,
    onMutate: (id) => setRead(new Set([id])),
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  })
}

/**
 * «Позначити все прочитаним» лише для поточного режиму: POST /notifications/read-all
 * позначив би й сповіщення іншого режиму, тож позначаємо кожне окремо.
 */
export const useMarkAllRead = () => {
  const queryClient = useQueryClient()
  const setRead = useSetRead()
  return useMutation({
    mutationFn: async (items: AppNotification[]) => {
      const unread = items.filter((n) => !n.is_read)
      await Promise.all(unread.map((n) => markNotificationRead(n.id)))
      return unread
    },
    onMutate: (items) =>
      setRead(new Set(items.filter((n) => !n.is_read).map((n) => n.id))),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  })
}
