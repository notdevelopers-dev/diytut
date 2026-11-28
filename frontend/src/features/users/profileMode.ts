import { useEffect, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router-dom'
import { logoutRequest } from '@/features/auth/api'
import { useAuth } from '@/features/auth/hooks'
import { useMyOrganizations } from '@/features/organizations/hooks'
import type { OrganizationMembership } from '@/types/organization'

/**
 * Режим профілю: волонтер чи організація.
 * Бекенду для перемикання не треба — усі ендпоінти організації (/organizations/me тощо)
 * працюють із тією самою сесією користувача, тож режим впливає лише на інтерфейс.
 */
export type ProfileMode = 'volunteer' | 'organization'

const STORAGE_KEY = 'diytut.profileMode'
const listeners = new Set<() => void>()

const readMode = (): ProfileMode => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'organization'
      ? 'organization'
      : 'volunteer'
  } catch {
    return 'volunteer'
  }
}

let currentMode: ProfileMode = readMode()

export const setProfileMode = (mode: ProfileMode) => {
  currentMode = mode
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Сховище недоступне (приватне вікно) — режим живе до перезавантаження
  }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => currentMode

/**
 * «Змінити профіль»: вийти й одразу відкрити вхід через Google, щоб увійти іншим акаунтом.
 * Чекаємо на вихід, щоб нова сесія не перетнулася зі старою.
 */
export const changeAccount = async () => {
  try {
    await logoutRequest()
  } catch {
    // Навіть якщо вихід не вдався, вхід через Google поставить нову сесію
  }
  setProfileMode('volunteer')
  window.location.href = '/api/auth/google/login'
}

/** Поточний режим; без організації — завжди «волонтер». */
export const useProfileMode = (): ProfileMode => {
  const { user } = useAuth()
  const mode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return user?.organization ? mode : 'volunteer'
}

/*
 * Активна організація (SCRUM-158): користувач може належати до кількох. Обрану
 * пам'ятаємо в localStorage, а сторінки організації передають її id бекенду
 * (?organization_id=). Без вибору — організація за замовчуванням, як на бекенді:
 * перша в GET /users/me/organizations (та, до якої приєднався найраніше).
 */
const ACTIVE_ORG_KEY = 'diytut.activeOrganizationId'

const readActiveOrganizationId = (): number | null => {
  try {
    const value = Number(localStorage.getItem(ACTIVE_ORG_KEY))
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

let activeOrganizationId: number | null = readActiveOrganizationId()

export const setActiveOrganization = (organizationId: number) => {
  activeOrganizationId = organizationId
  try {
    localStorage.setItem(ACTIVE_ORG_KEY, String(organizationId))
  } catch {
    // Сховище недоступне — вибір живе до перезавантаження
  }
  listeners.forEach((listener) => listener())
}

/** Перейти в режим організації саме цієї організації */
export const switchToOrganization = (organizationId: number) => {
  setActiveOrganization(organizationId)
  setProfileMode('organization')
}

const getActiveOrganizationId = () => activeOrganizationId

/**
 * Організації користувача й активна з них. Поки список вантажиться, активною
 * вважається організація з /auth/me (за замовчуванням), тож інтерфейс не блимає.
 */
export const useActiveOrganization = (): {
  organization: OrganizationMembership | null
  organizations: OrganizationMembership[]
  isLoading: boolean
} => {
  const { user } = useAuth()
  const fallback = user?.organization
    ? {
        id: Number(user.organization.id),
        name: user.organization.name,
        status: user.organization.status,
        role: user.organization.role,
      }
    : null
  const { data, isLoading } = useMyOrganizations(Boolean(fallback))
  const storedId = useSyncExternalStore(
    subscribe,
    getActiveOrganizationId,
    getActiveOrganizationId,
  )
  if (!fallback)
    return { organization: null, organizations: [], isLoading: false }
  const organizations = data ?? [fallback as OrganizationMembership]
  const organization =
    organizations.find((org) => org.id === storedId) ?? organizations[0]
  return { organization, organizations, isLoading }
}

/**
 * Посилання зі сповіщень бекенду називають організацію (?organization_id=…):
 * якщо користувач у ній, робимо її активною, щоб сторінка показала саме її.
 */
export const useOrganizationFromUrl = () => {
  const [searchParams] = useSearchParams()
  const { organizations } = useActiveOrganization()
  const requestedId = Number(searchParams.get('organization_id'))
  const isMember = organizations.some((org) => org.id === requestedId)
  useEffect(() => {
    if (isMember && requestedId !== activeOrganizationId) {
      setActiveOrganization(requestedId)
    }
  }, [isMember, requestedId])
}
