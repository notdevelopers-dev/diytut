import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { getApiErrorMessage, getErrorStatus } from '@/lib/errors'

/** Ліміт бекенду (app.schemas.join_requests.JoinRequestMessage) */
const MAX_MESSAGE_LENGTH = 1000

interface JoinRequestModalProps {
  /** Назва організації чи проєкту під заголовком */
  subtitle: string
  title?: string
  isSubmitting: boolean
  error: unknown
  /** Текст помилки для користувача; за замовчуванням — для заявки на вступ до ГО */
  describeError?: (error: unknown) => string
  onSubmit: (message: string) => void
  onClose: () => void
}

/** Тексти для відповідей бекенду на заявку на вступ, які користувач може побачити */
const organizationErrorText = (error: unknown) => {
  switch (getErrorStatus(error)) {
    case 409:
      return getApiErrorMessage(error, '').includes('member')
        ? 'Ви вже учасник цієї організації.'
        : 'Ви вже надіслали запит до цієї організації.'
    case 401:
      return 'Сесія завершилась. Увійдіть знову.'
    case 404:
      return 'Організацію не знайдено.'
    default:
      return 'Не вдалося надіслати запит. Спробуйте ще раз.'
  }
}

/** Модальне вікно «Запит на приєднання» за макетом Figma: до ГО чи на проєкт. */
export const JoinRequestModal = ({
  subtitle,
  title = 'Запит на приєднання до ГО',
  isSubmitting,
  error,
  describeError = organizationErrorText,
  onSubmit,
  onClose,
}: JoinRequestModalProps) => {
  const [message, setMessage] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const messageId = useId()

  // Нативний <dialog>: фокус усередині, Esc закриває, фон неактивний
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(message)
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!isSubmitting) onClose()
      }}
      // Клік по затемненню поза вікном закриває його
      onClick={(e) => {
        if (e.target === dialogRef.current && !isSubmitting) onClose()
      }}
      data-testid="join-request-modal"
      className="m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[5px] border border-[#C2D4EA] bg-white p-0 backdrop:bg-[#1a2c4a]/40"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
        <div className="text-center">
          <h2 id={titleId} className="text-base font-normal text-black">
            {title}
          </h2>
          <p className="text-base break-words text-black">{subtitle}</p>
        </div>

        <label
          htmlFor={messageId}
          className="text-center text-xs text-[#8B99AA]"
        >
          Опишіть вашу мотивацію та досвід волонтерства
        </label>
        <textarea
          id={messageId}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={7}
          placeholder="Опис"
          className="w-full resize-y rounded-[5px] border border-[#C2D4EA] p-2 text-sm text-black outline-none placeholder:text-[#8B99AA] focus:border-main"
        />
        <p className="-mt-2 text-right text-[10px] text-[#8B99AA]">
          {message.length}/{MAX_MESSAGE_LENGTH}
        </p>

        {Boolean(error) && (
          <p role="alert" className="text-center text-xs text-red-600">
            {describeError(error)}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="cursor-pointer rounded-[5px] border border-[#C2D4EA] px-3 py-1 text-sm text-black hover:bg-[#F7FBFF] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Скасувати
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="join-request-submit"
            className="cursor-pointer rounded-[5px] bg-main px-4 py-1.5 text-sm text-black hover:bg-main-hover disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting ? 'Надсилаємо...' : 'Надіслати запит'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
