import { useQuery } from '@tanstack/react-query'
import { fetchOrganizations } from '@/features/organizations/api'
import { fetchProjects } from '@/features/projects/api'
import { USER_SCOPED_META } from '@/lib/query-client'
import { fetchStats } from './api'

/** Скільки карток показувати у вітрині на головній (SCRUM-134) */
export const SHOWCASE_SIZE = 3

/** Лічильники платформи; дані змінюються повільно, тож кешуємо на хвилину */
export const useStats = () =>
  useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    staleTime: 60 * 1000,
  })

/** Свіжі проєкти для вітрини (бекенд віддає активні опубліковані) */
export const useShowcaseProjects = () =>
  useQuery({
    queryKey: ['home', 'projects'],
    queryFn: () => fetchProjects({ limit: SHOWCASE_SIZE }),
    select: (page) => page.items,
    // Учасникам бекенд віддає точні час і адресу (R-22)
    meta: USER_SCOPED_META,
  })

/** Перевірені організації для вітрини */
export const useShowcaseOrganizations = () =>
  useQuery({
    queryKey: ['home', 'organizations'],
    queryFn: () => fetchOrganizations({ limit: SHOWCASE_SIZE }),
    select: (page) => page.items,
  })
