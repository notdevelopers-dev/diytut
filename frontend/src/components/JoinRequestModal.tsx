import { useState, useEffect } from 'react'

export interface JoinRequestModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (motivation: string) => Promise<void> | void
  organizationName: string
  isSubmitting?: boolean
  error?: string | null
}

export const JoinRequestModal = ({
  isOpen,
  onClose,
  onSubmit,
  organizationName,
  isSubmitting = false,
  error = null,
}: JoinRequestModalProps) => {
  const [motivation, setMotivation] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Reset internal state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setMotivation('')
      setValidationError(null)
    }
  }, [isOpen])

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSubmitting, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = motivation.trim()
    if (!trimmed) {
      setValidationError('Будь ласка, вкажіть вашу мотивацію або навички.')
      return
    }
    setValidationError(null)
    await onSubmit(trimmed)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-sky-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-gray-100 pb-4 mb-5">
          <div>
            <h2
              id="join-modal-title"
              className="text-xl font-bold text-ink sm:text-2xl"
            >
              Заявка на приєднання
            </h2>
            <p className="text-sm text-ink-muted mt-1">
              Організація: <strong className="text-sky-700">{organizationName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Закрити модальне вікно"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="motivation-input"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              Мотиваційний лист / Ваші навички <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-ink-muted mb-2">
              Розкажіть, чому ви хочете долучитися, який досвід маєте та скільки часу готові приділяти волонтерству.
            </p>
            <textarea
              id="motivation-input"
              data-testid="motivation-input"
              rows={5}
              maxLength={1000}
              value={motivation}
              onChange={(e) => {
                setMotivation(e.target.value)
                if (validationError) setValidationError(null)
              }}
              placeholder="Наприклад: Мене звати... Я маю досвід у комунікаціях та логістиці, готовий допомагати щосуботи..."
              disabled={isSubmitting}
              className="w-full rounded-xl border border-border p-3 text-sm text-ink placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
            />
            <div className="flex justify-between items-center mt-1 text-xs text-ink-muted">
              <span>Мінімум кілька речень</span>
              <span>{motivation.length} / 1000</span>
            </div>
          </div>

          {/* Validation or API error display */}
          {(validationError || error) && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-200"
            >
              {validationError || error}
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-ink-muted hover:bg-page hover:text-ink transition-colors cursor-pointer disabled:opacity-50"
            >
              Скасувати
            </button>
            <button
              type="submit"
              data-testid="submit-join-request-button"
              disabled={isSubmitting || !motivation.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover active:scale-98 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Надсилання...</span>
                </>
              ) : (
                'Надіслати заявку'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default JoinRequestModal
