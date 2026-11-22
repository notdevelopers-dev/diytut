import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useMarkAllRead, useNotifications } from '../hooks'
import { NotificationItem } from './NotificationItem'

/** Скільки останніх сповіщень показувати у випадному списку */
const DROPDOWN_LIMIT = 6

/**
 * Випадний список сповіщень під дзвіночком (SCRUM-136): останні сповіщення
 * поточного режиму, «Позначити все прочитаним» і перехід до всіх сповіщень.
 */
export const NotificationsDropdown = ({
  style,
  onClose,
}: {
  /** Положення на екрані (рахує дзвіночок) */
  style: CSSProperties
  onClose: () => void
}) => {
  const { items, unreadCount, isLoading, isError, mode } = useNotifications()
  const { mutate: markAllRead, isPending } = useMarkAllRead()
  const title =
    mode === 'organization' ? 'Сповіщення організації' : 'Сповіщення'

  return (
    <div
      role="dialog"
      aria-label={title}
      style={style}
      className="fixed z-40 flex max-h-[min(560px,calc(100dvh-7rem))] flex-col overflow-hidden rounded-2xl border-2 border-[#DCECFF] bg-white shadow-xl"
    >
      <div className="flex items-center justify-between gap-3 border-b-2 border-[#DCECFF] px-4 py-3">
        <span className="text-base font-bold text-black">{title}</span>
        <button
          type="button"
          onClick={() => markAllRead(items)}
          disabled={unreadCount === 0 || isPending}
          className="cursor-pointer text-xs font-medium text-main hover:text-main-hover disabled:cursor-default disabled:text-[#8B99AA]"
        >
          ✓ Позначити все прочитаним
        </button>
      </div>

      <div className="flex-1 divide-y divide-[#EEF4FB] overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-[#8B99AA]">
            Завантаження...
          </p>
        ) : isError ? (
          <p className="px-4 py-6 text-center text-sm text-red-700">
            Не вдалося завантажити сповіщення
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#8B99AA]">
            Сповіщень поки немає
          </p>
        ) : (
          items
            .slice(0, DROPDOWN_LIMIT)
            .map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                compact
                onOpen={onClose}
              />
            ))
        )}
      </div>

      <Link
        to="/notifications"
        onClick={onClose}
        className="border-t-2 border-[#DCECFF] px-4 py-3 text-center text-sm font-medium text-main no-underline hover:bg-[#F3F8FF]"
      >
        Усі сповіщення
      </Link>
    </div>
  )
}
