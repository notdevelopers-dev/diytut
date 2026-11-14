/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовий шлях API (за замовчуванням '/api') */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
