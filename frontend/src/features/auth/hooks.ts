import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getErrorStatus } from '@/lib/errors'
import { fetchMe, logoutRequest, registerUser } from './api'
import type { MeResponse } from './api'
import type { Role, User } from './types'

export const AUTH_ME_QUERY_KEY = ['auth', 'me'] as const

const toUser = (me: MeResponse): User => {
  if (me.status === 'registration_required') {
    // Увійшов через Google, але анкету ще не заповнив
    return {
      email: me.email,
      firstName: me.first_name ?? undefined,
      lastName: me.last_name ?? undefined,
      role: 'volunteer',
      isProfileComplete: false,
    }
  }
  const u = me.user
  return {
    id: String(u.id),
    name: `${u.first_name} ${u.last_name}`,
    firstName: u.first_name,
    lastName: u.last_name,
    nickname: u.nickname,
    email: u.email,
    phone: u.phone,
    dateOfBirth: u.birth_date,
    gender: u.gender,
    bio: u.bio ?? undefined,
    role: u.platform_role === 'admin' ? 'admin' : 'volunteer',
    isProfileComplete: true,
    organization: me.organization
      ? {
          id: me.organization.id,
          name: me.organization.name,
          role: me.organization.role,
          status: me.organization.status,
        }
      : null,
  }
}

/**
 * Поточний користувач із GET /auth/me (сесія живе в httpOnly cookie, тож стан
 * беремо лише з бекенду). `null` означає «не увійшов».
 */
export const useCurrentUser = () =>
  useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        return toUser(await fetchMe())
      } catch (err: unknown) {
        // 401: не увійшов (або сесія скінчилась). Інші помилки лишають попередні дані
        if (getErrorStatus(err) === 401) return null
        throw err
      }
    },
    retry: 1,
  })

export const useRegister = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: registerUser,
    // Бекенд замінив cookie `registration` на `session`: оновлюємо стан із /auth/me
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY }),
  })
}

export const useLogout = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logoutRequest,
    onMutate: () => {
      // Користувача прибираємо одразу, не чекаючи відповіді
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, null)
    },
    onError: (error: unknown) => {
      console.error('Помилка під час виходу:', error)
    },
  })
}

export interface AuthState {
  user: User | null
  role: Role | null
  /** Поки чекаємо на першу відповідь /auth/me */
  isLoading: boolean
  isAuthenticated: boolean
  isProfileComplete: boolean
  /** Повторно запитує /auth/me (наприклад, після створення організації) */
  refresh: () => Promise<void>
  logout: () => void
}

export const useAuth = (): AuthState => {
  const { data, isLoading, refetch } = useCurrentUser()
  const { mutate: logoutMutate } = useLogout()
  const user = data ?? null

  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  const logout = useCallback(() => logoutMutate(), [logoutMutate])

  return {
    user,
    role: user?.role ?? null,
    isLoading,
    isAuthenticated: user !== null,
    isProfileComplete: Boolean(user?.isProfileComplete),
    refresh,
    logout,
  }
}
