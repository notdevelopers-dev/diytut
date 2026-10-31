import { createContext, useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Ролі користувачів у системі «ДійТут»:
 * - 'volunteer': звичайний волонтер, який шукає ініціативи та долучається до дій
 * - 'organization': благодійний фонд, ГО чи ініціативна група, що публікує потреби
 * - 'admin': адміністратор платформи з доступом до панелі керування /admin
 */
export type Role = 'volunteer' | 'organization' | 'admin'

/**
 * Модель профілю користувача в контексті
 */
export interface User {
  id?: string
  name?: string
  email?: string
  role: Role
  /** Чи заповнена обов'язкова анкета користувача */
  isProfileComplete: boolean
}

/**
 * Інтерфейс авторизаційного контексту
 */
export interface AuthContextType {
  /** Дані авторизованого користувача або null */
  user: User | null
  /** JWT токен доступу до API або null */
  token: string | null
  /** Поточна роль користувача для швидкої перевірки прав */
  role: Role | null
  /** Чи увійшов користувач у систему */
  isAuthenticated: boolean
  /** Чи пройшов користувач обов'язкове заповнення анкети */
  isProfileComplete: boolean
  /** Функція входу: оновлює стан та зберігає сесію в localStorage */
  login: (
    token: string,
    role: Role,
    isProfileComplete?: boolean,
    userData?: Partial<User>,
  ) => void
  /** Функція виходу: очищує стан і видаляє сесію з localStorage */
  logout: () => void
  /** Оновлення статусу заповнення анкети */
  setProfileComplete: (isComplete: boolean) => void
}

export const STORAGE_KEY_TOKEN = 'token'
export const STORAGE_KEY_USER = 'user'

// oxlint-disable-next-line react/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Синхронне відновлення стану сесії з localStorage під час першого рендеру.
 * Це гарантує, що при перезавантаженні сторінки (F5) користувача не викидає з акаунта
 * і не відбувається миготіння екрана (flicker).
 */
const getInitialSession = (): { token: string | null; user: User | null } => {
  try {
    const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN)
    const storedUser = localStorage.getItem(STORAGE_KEY_USER)
    if (storedToken && storedUser) {
      return {
        token: storedToken,
        user: JSON.parse(storedUser) as User,
      }
    }
  } catch (error) {
    console.error('Помилка при відновленні сесії з localStorage:', error)
  }
  return { token: null, user: null }
}

/**
 * Провайдер стану автентифікації для всього застосунку «ДійТут»
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<{
    token: string | null
    user: User | null
  }>(getInitialSession)

  const login = useCallback(
    (
      newToken: string,
      role: Role,
      isProfileComplete = true,
      userData: Partial<User> = {},
    ) => {
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
      }

      setSession({ token: newToken, user: newUser })

      try {
        localStorage.setItem(STORAGE_KEY_TOKEN, newToken)
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser))
      } catch (error) {
        console.error('Помилка збереження сесії в localStorage:', error)
      }
    },
    [],
  )

  const logout = useCallback(() => {
    setSession({ token: null, user: null })
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN)
      localStorage.removeItem(STORAGE_KEY_USER)
    } catch (error) {
      console.error('Помилка очищення сесії з localStorage:', error)
    }
  }, [])

  const setProfileComplete = useCallback((isComplete: boolean) => {
    setSession((prev) => {
      if (!prev.user) return prev
      const updatedUser: User = {
        ...prev.user,
        isProfileComplete: isComplete,
      }
      try {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser))
      } catch (error) {
        console.error('Помилка оновлення статусу анкети в localStorage:', error)
      }
      return {
        ...prev,
        user: updatedUser,
      }
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
