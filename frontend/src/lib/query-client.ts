import { QueryClient } from '@tanstack/react-query'
import { getErrorStatus } from '@/lib/errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx не повторюємо: повтор нічого не змінить
      retry: (failureCount, error) => {
        const status = getErrorStatus(error)
        if (status !== undefined && status >= 400 && status < 500) return false
        return failureCount < 2
      },
    },
  },
})

/**
 * Позначка запитів із даними поточного користувача (заявки, членства). Під час виходу
 * їх прибираємо з кешу, щоб наступний користувач у цьому браузері не побачив чужого.
 */
export const USER_SCOPED_META = { userScoped: true } as const

export const removeUserScopedQueries = (client: QueryClient) =>
  client.removeQueries({
    predicate: (query) => query.meta?.userScoped === true,
  })
