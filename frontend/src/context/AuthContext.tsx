import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { apiClient } from '../api/client'
import { getErrorStatus } from '../api/errors'
import type { OrgRole, OrgStatus } from '../utils/organization'
import type { Role, User } from '../types/auth'

export interface AuthContextType {
  user: User | null
  role: Role | null
  /** Поки чекаємо на першу відповідь /auth/me */
  isLoading: boolean
  isAuthenticated: boolean
  isProfileComplete: boolean
  /** Повторно запитує /auth/me (наприклад, після реєстрації) */
  refresh: () => Promise<void>
  logout: () => void
}

// oxlint-disable-next-line react/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Відповідь GET /api/auth/me (app.routers.auth)
type MeResponse =
  | {
      status: 'authenticated'
      user: {
        id: number
        email: string
        first_name: string
        last_name: string
        nickname: string
        phone: string
        birth_date: string
        gender: 'male' | 'female' | 'prefer_not_to_say'
        bio: string | null
        platform_role: 'user' | 'admin'
      }
      // Організація користувача або null (є в /auth/me з гілки be/org-profile)
      organization?: {
        id: number
        name: string
        status: OrgStatus
        role: OrgRole
      } | null
    }
  | {
      status: 'registration_required'
      email: string
      first_name: string | null
      last_name: string | null
    }

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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Сесія живе в httpOnly cookie, тож стан беремо лише з бекенду (/auth/me)
  const [session, setSession] = useState<{
    isLoading: boolean
    user: User | null
  }>({ isLoading: true, user: null })

  const refresh = useCallback(async () => {
    try {
      const response = await apiClient.get<MeResponse>('/auth/me')
      setSession({ isLoading: false, user: toUser(response.data) })
    } catch (err: unknown) {
      if (getErrorStatus(err) === 401) {
        // Не увійшов (або сесія скінчилась)
        setSession({ isLoading: false, user: null })
      } else {
        // Бекенд тимчасово недоступний: не «розлогінюємо» користувача, лишаємо попередній стан
        console.error('Не вдалося оновити дані сесії:', err)
        setSession((prev) => ({ ...prev, isLoading: false }))
      }
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  const logout = useCallback(() => {
    setSession({ isLoading: false, user: null })
    // Бекенд видаляє httpOnly cookie
    apiClient.post('/auth/logout').catch((error: unknown) => {
      console.error('Помилка під час виходу:', error)
    })
  }, [])

  const { isLoading, user } = session
  const isAuthenticated = user !== null
  const isProfileComplete = Boolean(user?.isProfileComplete)
  const role = user?.role ?? null

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      role,
      isLoading,
      isAuthenticated,
      isProfileComplete,
      refresh,
      logout,
    }),
    [
      user,
      role,
      isLoading,
      isAuthenticated,
      isProfileComplete,
      refresh,
      logout,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export { useAuth } from './useAuth.ts'
export default AuthContext
