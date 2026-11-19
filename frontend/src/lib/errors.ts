import { isAxiosError } from 'axios'

/** HTTP-статус відповіді або undefined, якщо відповіді не було (мережа тощо) */
export const getErrorStatus = (err: unknown): number | undefined =>
  isAxiosError(err) ? err.response?.status : undefined

/**
 * Текст помилки бекенду: рядок `detail` або повідомлення помилок полів FastAPI
 * (`detail: [{ msg }]`, у тому ж форматі віддає й `field_error`).
 */
export const getApiErrorMessage = (err: unknown, fallback: string): string => {
  const detail: unknown = isAxiosError<{ detail?: unknown }>(err)
    ? err.response?.data?.detail
    : undefined
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: unknown) => (item as { msg?: unknown } | null)?.msg)
      .filter((msg): msg is string => typeof msg === 'string')
    if (messages.length) return messages.join('. ')
  }
  return fallback
}
