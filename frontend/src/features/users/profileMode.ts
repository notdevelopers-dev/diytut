import { useSyncExternalStore } from 'react'
import { useAuth } from '@/features/auth/hooks'

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

/** Поточний режим; без організації — завжди «волонтер». */
export const useProfileMode = (): ProfileMode => {
  const { user } = useAuth()
  const mode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return user?.organization ? mode : 'volunteer'
}
