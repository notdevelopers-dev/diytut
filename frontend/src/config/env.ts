/** Типізований доступ до змінних оточення Vite (import.meta.env). */
export const env = {
  /** Базовий шлях API; у dev його проксує Vite (див. vite.config.ts) */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  isDev: import.meta.env.DEV,
} as const
