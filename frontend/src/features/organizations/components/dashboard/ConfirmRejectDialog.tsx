import { useEffect, useRef } from 'react'

/**
 * Підтвердження відхилення заявки (стилі макета: біла картка в блакитній рамці,
 * червона кнопка дії). Закривається Escape, кліком поза вікном і «Скасувати».
 * `withIgnore` — «Відхилити й ігнорувати» для заявки на проєкт (SCRUM-164).
 */
export const ConfirmRejectDialog = ({
  applicantName,
  withIgnore = false,
  isPending,
  onConfirm,
  onCancel,
}: {
  applicantName: string
  withIgnore?: boolean
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) => {
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
        aria-labelledby="reject-title"
        aria-describedby="reject-text"
        className="flex w-full max-w-[420px] flex-col gap-4 rounded-[5px] border border-main bg-white p-5 shadow-xl"
      >
        <h2 id="reject-title" className="text-xl font-normal text-black">
          {withIgnore ? 'Відхилити й ігнорувати?' : 'Відхилити заявку?'}
        </h2>
        <p id="reject-text" className="text-sm text-black">
          Заявку <strong className="font-semibold">{applicantName}</strong> буде
          відхилено, а волонтер отримає сповіщення. Скасувати це рішення не
          можна.
          {withIgnore &&
            ' Волонтер також не зможе подавати заявки на проєкти вашої організації, доки ви не знімете ігнор.'}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-8 cursor-pointer rounded-[5px] border border-main bg-white px-4 text-sm text-black hover:bg-[#F3F8FF] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="h-8 cursor-pointer rounded-[5px] bg-[#E14848] px-4 text-sm text-white hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
          >
            {isPending
              ? 'Відхилення…'
              : withIgnore
                ? 'Відхилити й ігнорувати'
                : 'Відхилити'}
          </button>
        </div>
      </div>
    </div>
  )
}
