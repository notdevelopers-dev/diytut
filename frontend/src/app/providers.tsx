import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/feedback'
import { queryClient } from '@/lib/query-client'

/** Глобальні провайдери: помилки рендеру, React Query (сесія користувача теж у ньому). */
export const Providers = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </ErrorBoundary>
)
