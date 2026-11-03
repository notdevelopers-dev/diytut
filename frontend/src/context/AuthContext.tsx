import { createContext, useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Role = 'volunteer' | 'organization' | 'admin'

export interface OrganizationData {
  id?: number | string
  name: string
  email: string
  phone: string
  cityId: number
  cityName?: string
  edrpou?: string | null
  description: string
  roleInOrg?: 'Власник' | 'Адміністратор' | 'Учасник'
}

export interface User {
  id?: string
  name?: string
  firstName?: string
  lastName?: string
  nickname?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  gender?: 'prefer_not_to_say' | 'prefer_not_to_tell' | 'female' | 'male'
  city?: string
  bio?: string
  role: Role
  isProfileComplete: boolean
  isProfileCompleted?: boolean
  organization?: OrganizationData | null
}

export interface AuthContextType {
  user: User | null
  token: string | null
  role: Role | null
  isAuthenticated: boolean
  isProfileComplete: boolean
  isProfileCompleted?: boolean
  // Активний режим відображення: чи ми дивимось як волонтер, чи як організація
  activeMode: 'volunteer' | 'organization'
  switchActiveMode: () => void
  updateOrganization: (orgData: Partial<OrganizationData>) => void
  login: (
    token: string,
    role: Role,
    isProfileComplete?: boolean,
    userData?: Partial<User>,
  ) => void
  logout: () => void
  setProfileComplete: (isComplete: boolean) => void
}

export const STORAGE_KEY_TOKEN = 'token'
export const STORAGE_KEY_USER = 'user'
export const STORAGE_KEY_ORG = 'user_organization'

// oxlint-disable-next-line react/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

const getInitialSession = (): {
  token: string | null
  user: User | null
  org: OrganizationData | null
} => {
  try {
    const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN)
    const storedUser = localStorage.getItem(STORAGE_KEY_USER)
    const storedOrg = localStorage.getItem(STORAGE_KEY_ORG)
    if (storedToken && storedUser) {
      const parsedUser = JSON.parse(storedUser) as User
      const parsedOrg = storedOrg
        ? (JSON.parse(storedOrg) as OrganizationData)
        : null
      return {
        token: storedToken,
        user: { ...parsedUser, organization: parsedOrg },
        org: parsedOrg,
      }
    }
  } catch (error) {
    console.error('Помилка при відновленні сесії:', error)
  }
  return { token: null, user: null, org: null }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const initial = getInitialSession()
  const [session, setSession] = useState<{
    token: string | null
    user: User | null
  }>({ token: initial.token, user: initial.user })

  // Режим відображення: 'volunteer' або 'organization'
  const [activeMode, setActiveMode] = useState<'volunteer' | 'organization'>(
    'volunteer',
  )

  // Перемикач профілю ("Переключити профіль" із макета)
  const switchActiveMode = useCallback(() => {
    setActiveMode((prev) =>
      prev === 'volunteer' ? 'organization' : 'volunteer',
    )
  }, [])

  // Оновлення даних організації (редагування)
  const updateOrganization = useCallback(
    (orgData: Partial<OrganizationData>) => {
      setSession((prev) => {
        if (!prev.user) return prev
        const currentOrg = prev.user.organization ?? {
          name: '',
          email: prev.user.email ?? '',
          phone: '',
          cityId: 1,
          cityName: '',
          description: '',
          roleInOrg: 'Власник',
        }
        const updatedOrg: OrganizationData = { ...currentOrg, ...orgData }
        const updatedUser: User = { ...prev.user, organization: updatedOrg }

        try {
          localStorage.setItem(STORAGE_KEY_ORG, JSON.stringify(updatedOrg))
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser))
        } catch (err) {
          console.error('Помилка збереження організації:', err)
        }

        return { ...prev, user: updatedUser }
      })
    },
    [],
  )

  const login = useCallback(
    (
      newToken: string,
      role: Role,
      isProfileComplete = true,
      userData: Partial<User> = {},
    ) => {
      // Якщо в пам'яті вже є створена організація — підтягуємо її
      let existingOrg: OrganizationData | null = null
      try {
        const storedOrg = localStorage.getItem(STORAGE_KEY_ORG)
        if (storedOrg) existingOrg = JSON.parse(storedOrg)
      } catch {}

      const newUser: User = {
        id: userData.id ?? `usr_${Date.now()}`,
        name:
          userData.name ??
          (role === 'admin'
            ? 'Адміністратор'
            : role === 'organization'
              ? 'Благодійний Фонд'
              : 'Волонтер'),
        email: userData.email ?? `${role}@diytut.org`,
        role,
        isProfileComplete,
        organization: existingOrg,
        ...userData,
      }

      setSession({ token: newToken, user: newUser })

      try {
        localStorage.setItem(STORAGE_KEY_TOKEN, newToken)
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser))
      } catch (error) {
        console.error('Помилка збереження сесії:', error)
      }
    },
    [],
  )

  const logout = useCallback(() => {
    setSession({ token: null, user: null })
    setActiveMode('volunteer')
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN)
      localStorage.removeItem(STORAGE_KEY_USER)
    } catch {}
  }, [])

  const setProfileComplete = useCallback((isComplete: boolean) => {
    setSession((prev) => {
      if (!prev.user) return prev
      const updatedUser: User = { ...prev.user, isProfileComplete: isComplete }
      try {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser))
      } catch {}
      return { ...prev, user: updatedUser }
    })
  }, [])

  const { token, user } = session
  const isAuthenticated = Boolean(token && user)
  const isProfileComplete = Boolean(user?.isProfileComplete)
  const role = user?.role ?? null

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      role,
      isAuthenticated,
      isProfileComplete,
      isProfileCompleted: isProfileComplete,
      activeMode,
      switchActiveMode,
      updateOrganization,
      login,
      logout,
      setProfileComplete,
    }),
    [
      user,
      token,
      role,
      isAuthenticated,
      isProfileComplete,
      activeMode,
      switchActiveMode,
      updateOrganization,
      login,
      logout,
      setProfileComplete,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export { useAuth } from './useAuth.ts'
export default AuthContext
