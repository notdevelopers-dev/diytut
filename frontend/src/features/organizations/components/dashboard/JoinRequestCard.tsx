import type { OrganizationJoinRequest } from '@/types/organization'
import { applicantName, formatDateTime, JOIN_REQUEST_GRID } from './format'

/**
 * Заявка на вступ: волонтер і контакт, супровідний лист («Переглянути»), дата
 * подачі, статус і кнопки «Схвалити» / «Відхилити». Поки запит до бекенду триває,
 * кнопки неактивні.
 */
export const JoinRequestCard = ({
  request,
  cityName,
  isMessageOpen,
  onToggleMessage,
  onAccept,
  onReject,
  pendingAction,
}: {
  request: OrganizationJoinRequest
  cityName?: string
  isMessageOpen: boolean
  onToggleMessage: () => void
  onAccept: () => void
  onReject: () => void
  /** Яка дія зараз виконується для цієї заявки */
  pendingAction: 'accepted' | 'rejected' | null
}) => {
  const { date, time } = formatDateTime(request.created_at)
  const contact = [
    request.user.nickname ? `@${request.user.nickname}` : null,
    cityName,
  ]
    .filter(Boolean)
    .join(' · ')
  const isBusy = pendingAction !== null
  const name = applicantName(request)

  return (
    <li className="flex flex-col">
      <div
        className={`relative grid grid-cols-1 gap-2 bg-[#F3F8FF] px-3 py-3 text-sm ${JOIN_REQUEST_GRID}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] bg-main"
        />
        <div className="flex flex-col">
          <span className="text-black">{name}</span>
          <span className="text-xs text-black">{contact || '—'}</span>
        </div>
        <div className="flex flex-col items-start gap-1">
          <span className="text-black">Вступ до організації</span>
          {request.message && (
            <button
              type="button"
              onClick={onToggleMessage}
              aria-expanded={isMessageOpen}
              className="h-5 cursor-pointer rounded-[5px] border border-main bg-white px-3 text-xs text-black hover:bg-[#F3F8FF]"
            >
              {isMessageOpen ? 'Сховати' : 'Переглянути'}
            </button>
          )}
        </div>
        <div className="flex gap-2 text-black md:flex-col md:gap-0">
          <span>{date}</span>
          <span>{time}</span>
        </div>
        <div>
          <span className="inline-flex h-6 items-center rounded-[5px] bg-info px-3 text-xs text-black">
            На розгляді
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={isBusy}
            aria-label={`Схвалити заявку: ${name}`}
            className="h-6 cursor-pointer rounded-[5px] bg-[#B5F291] px-3 text-xs text-black hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
          >
            {pendingAction === 'accepted' ? 'Схвалення…' : 'Схвалити'}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={isBusy}
            aria-label={`Відхилити заявку: ${name}`}
            className="h-6 cursor-pointer rounded-[5px] bg-[#E14848] px-3 text-xs text-white hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
          >
            {pendingAction === 'rejected' ? 'Відхилення…' : 'Відхилити'}
          </button>
        </div>
      </div>
      {isMessageOpen && request.message && (
        <div className="bg-white px-3 py-3 text-sm whitespace-pre-wrap text-black">
          <span className="font-semibold">Мотивація: </span>
          {request.message}
        </div>
      )}
    </li>
  )
}
