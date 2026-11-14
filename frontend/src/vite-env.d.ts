/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовий шлях API (за замовчуванням '/api') */
  readonly VITE_API_BASE_URL?: string
  /** "true" у режимі dev:mock: запити обробляє src/mocks замість бекенду */
  readonly VITE_USE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
