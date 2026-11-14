// TEST-LOGIN: тимчасовий вхід без Google і бекенду, лише для перевірки інтерфейсу.
// Перед демонстрацією видалити: цей файл, кнопку в LoginPage.tsx і рядки з
// позначкою TEST-LOGIN у hooks.ts (знайти: пошук по "TEST-LOGIN").

import type { User } from './types'

const STORAGE_KEY = 'diytut-test-session'

/** Вигаданий користувач із заповненою анкетою, без організації. */
export const TEST_USER: User = {
  id: '0',
  name: 'Тестовий Користувач',
  firstName: 'Тестовий',
  lastName: 'Користувач',
  nickname: 'test_user',
  email: 'test.user@example.com',
  phone: '+380000000000',
  dateOfBirth: '2000-01-01',
  gender: 'prefer_not_to_say',
  role: 'volunteer',
  isProfileComplete: true,
  organization: null,
}

export const hasTestSession = (): boolean => {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const startTestSession = () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // sessionStorage недоступний: вхід просто не спрацює
  }
}

export const clearTestSession = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // нічого очищати
  }
}
