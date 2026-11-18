import { useNavigate } from 'react-router-dom'
import type { AppNotification } from '../api'
import { useMarkNotificationRead } from '../hooks'
import { formatNotificationDate, getOpenableLink, getTypeMeta } from '../utils'

/**
 * Один рядок сповіщення (для випадного списку й сторінки).
 * Клік позначає прочитаним; якщо сторінка за посиланням уже існує — відкриває її.
 */
export const NotificationItem = ({
  notification,
  compact = false,
  onOpen,
}: {
  notification: AppNotification
  compact?: boolean
  /** Викликається після переходу (напр. щоб закрити випадний список) */
  onOpen?: () => void
}) => {
  const navigate = useNavigate()
  const { mutate: markRead } = useMarkNotificationRead()
  const link = getOpenableLink(notification.link)
  const meta = getTypeMeta(notification.type)
  const { date, time } = formatNotificationDate(notification.created_at)

  const handleClick = () => {
    if (!notification.is_read) markRead(notification.id)
    if (link) {
      onOpen?.()
      void navigate(link)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={link ? 'Відкрити' : undefined}
      className={`relative flex w-full items-start gap-3 text-left transition-colors ${
        compact ? 'px-4 py-3' : 'px-4 py-4 sm:px-5'
      } ${notification.is_read ? 'bg-white' : 'bg-[#F3F8FF]'} ${
        link ? 'cursor-pointer hover:bg-[#E8F2FF]' : 'cursor-default'
      }`}
    >
      {/* Смужка непрочитаного, як у макеті */}
      {!notification.is_read && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] bg-main"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
          >
            {meta.label}
          </span>
          {!notification.is_read && (
            <span className="text-[11px] font-semibold text-main">Нове</span>
          )}
        </div>
        <span
          className={`text-sm text-black ${notification.is_read ? 'font-medium' : 'font-bold'}`}
        >
          {notification.title}
        </span>
        <span
          className={`text-sm text-[#5F6F82] ${compact ? 'line-clamp-2' : ''}`}
        >
          {notification.message}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end text-xs text-[#8B99AA]">
        <span>{date}</span>
        <span>{time}</span>
      </div>
    </button>
  )
}
