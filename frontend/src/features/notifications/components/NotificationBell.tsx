import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import bellIcon from '@/assets/icons/notifications/bell.svg'
import { useAuth } from '@/features/auth/hooks'
import { useMarkAllRead, useNotifications } from '../hooks'
import { NotificationItem } from './NotificationItem'

/** Скільки останніх сповіщень показувати у випадному списку */
const DROPDOWN_LIMIT = 6

/**
 * Дзвіночок у шапці з лічильником непрочитаних і випадним списком (SCRUM-136).
 * Вигляд дзвіночка — з Figma («Сповіщення — 2 непрочитані»).
 */
export const NotificationBell = () => {
  const { isAuthenticated } = useAuth()
  const { items, unreadCount, isLoading, isError, mode } = useNotifications()
  const { mutate: markAllRead, isPending } = useMarkAllRead()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Закриваємо кліком поза компонентом або Esc
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  // Лише для тих, хто увійшов (критерій приймання)
  if (!isAuthenticated) return null

  const badge = unreadCount > 9 ? '9+' : String(unreadCount)
  const title =
    mode === 'organization' ? 'Сповіщення організації' : 'Сповіщення'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={
          unreadCount > 0
            ? `Сповіщення: ${unreadCount} непрочитаних`
            : 'Сповіщення'
        }
        aria-expanded={isOpen}
        className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[5px] sm:size-10 border border-main bg-[#DCECFF] transition-transform hover:scale-105 active:scale-95"
      >
        <img src={bellIcon} alt="" width={22} height={22} />
        {/* Лічильник ховаємо, коли непрочитаних немає (критерій приймання) */}
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E14848] px-1 text-[11px] leading-none font-medium text-white">
            {badge}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={title}
          className="fixed top-20 right-3 left-3 z-40 flex max-h-[min(560px,calc(100dvh-6rem))] flex-col overflow-hidden rounded-2xl border-2 border-[#DCECFF] bg-white shadow-xl sm:absolute sm:top-12 sm:right-0 sm:left-auto sm:w-[400px]"
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
                    onOpen={() => setIsOpen(false)}
                  />
                ))
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => setIsOpen(false)}
            className="border-t-2 border-[#DCECFF] px-4 py-3 text-center text-sm font-medium text-main no-underline hover:bg-[#F3F8FF]"
          >
            Усі сповіщення
          </Link>
        </div>
      )}
    </div>
  )
}
