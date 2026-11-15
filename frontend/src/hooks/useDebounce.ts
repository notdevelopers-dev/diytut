import { useEffect, useState } from 'react'

/** Значення, що оновлюється лише після паузи в змінах (для пошуку, фільтрів). */
export const useDebounce = <T>(value: T, delayMs = 300): T => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
