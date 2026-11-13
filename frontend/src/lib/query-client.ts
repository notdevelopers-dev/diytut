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
