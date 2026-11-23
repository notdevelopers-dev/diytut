import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * Підтвердження дії у стилі сайту замість системного window.confirm: біла картка
 * в блакитній рамці, кнопки «Скасувати» й дії. Закривається Escape, кліком поза
 * вікном і «Скасувати» (поки дія не виконується).
 */
export const ConfirmDialog = ({
  title,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Скасувати',
  tone = 'danger',
  isPending = false,
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  /** Текст кнопки дії, поки запит виконується */
  pendingLabel?: string
  cancelLabel?: string
  /** danger — червона кнопка (відхилити, скасувати участь), primary — блакитна */
  tone?: 'danger' | 'primary'
  isPending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) => {
  const id = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isPending, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
        className="flex w-full max-w-[420px] flex-col gap-4 rounded-[5px] border border-main bg-white p-5 shadow-xl"
      >
        <h2 id={`${id}-title`} className="text-xl font-normal text-black">
          {title}
        </h2>
        <div id={`${id}-text`} className="text-sm text-black">
          {children}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-8 cursor-pointer rounded-[5px] border border-main bg-white px-4 text-sm text-black hover:bg-[#F3F8FF] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`h-8 cursor-pointer rounded-[5px] px-4 text-sm hover:brightness-95 disabled:cursor-wait disabled:opacity-60 ${
              tone === 'danger'
                ? 'bg-[#E14848] text-white'
                : 'bg-main text-black'
            }`}
          >
            {isPending && pendingLabel ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
