import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'error'

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

/** Показати сповіщення: `showToast('Запит надіслано')`. Потрібен ToastProvider. */
export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
