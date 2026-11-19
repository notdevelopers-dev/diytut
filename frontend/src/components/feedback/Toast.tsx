import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { ToastContext } from './useToast'
import type { ToastKind } from './useToast'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const TOAST_DURATION_MS = 4000

/** Короткі сповіщення внизу екрана («Запит надіслано» тощо). */
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, kind, message }])
      setTimeout(() => dismiss(id), TOAST_DURATION_MS)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* role="status": читач екрана озвучує нове сповіщення */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-testid="toast"
            className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-[5px] border px-4 py-2 text-sm text-black shadow-md ${
              toast.kind === 'success'
                ? 'border-[#8fd46a] bg-[#B5F291]'
                : 'border-red-300 bg-red-50'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Закрити сповіщення"
              className="cursor-pointer text-black/60 hover:text-black"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
