import { createSeedDb } from './data'
import type { MockAccountId, MockDb } from './data'

const DB_KEY = 'diytut-mock-db'
const SESSION_KEY = 'diytut-mock-session'

/** Хто зараз «увійшов»: користувач із бази, новий користувач без анкети або ніхто. */
export type MockSession = { kind: 'user'; userId: number } | { kind: 'new' }

const readJson = <T>(key: string): T | null => {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

const writeJson = (key: string, value: unknown) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // sessionStorage недоступний: стан живе лише до перезавантаження сторінки
  }
}

let db: MockDb = readJson<MockDb>(DB_KEY) ?? createSeedDb()

export const getDb = (): MockDb => db

/** Зберігає зміни в sessionStorage, щоб вони пережили перезавантаження вкладки. */
export const saveDb = () => writeJson(DB_KEY, db)

export const getSession = (): MockSession | null =>
  readJson<MockSession>(SESSION_KEY)

export const setSession = (session: MockSession | null) => {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // див. вище
  }
}

const ACCOUNT_USER_IDS = { volunteer: 1, owner: 2, admin: 3 } as const

/** Вхід під тестовим обліковим записом зі сторінки входу. */
export const signInAs = (account: MockAccountId) => {
  if (account === 'new') {
    setSession({ kind: 'new' })
    return
  }
  setSession({ kind: 'user', userId: ACCOUNT_USER_IDS[account] })
}

/** Скидає всі тестові дані до початкових і виходить із сесії. */
export const resetMockData = () => {
  db = createSeedDb()
  saveDb()
  setSession(null)
}
