export const PHONE_PREFIX = '+380'
export const PHONE_PATTERN = /^\+380\d{9}$/

/** Нормалізує введення до формату +380XXXXXXXXX (лише цифри, не довше 13 символів) */
export const normalizePhone = (input: string): string => {
  const value = input.startsWith(PHONE_PREFIX) ? input : PHONE_PREFIX
  return '+' + value.slice(1).replace(/\D/g, '').slice(0, 12)
}

export const isValidPhone = (phone: string): boolean =>
  PHONE_PATTERN.test(phone)
