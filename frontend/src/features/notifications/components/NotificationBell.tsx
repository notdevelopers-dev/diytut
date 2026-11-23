import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import bellIcon from '@/assets/icons/notifications/bell.svg'
import { useAuth } from '@/features/auth/hooks'
import { useNotifications } from '../hooks'
import { NotificationsDropdown } from './NotificationsDropdown'

/** Ширина списку й відступ від країв екрана */
const DROPDOWN_WIDTH = 400
const EDGE = 12

/**
 * Список прив’язуємо до дзвіночка, але не даємо йому вилізти за край екрана
 * (на телефоні дзвіночок не біля правого краю: праворуч аватар і меню).
 */
const getDropdownStyle = (button: HTMLElement): CSSProperties => {
  const rect = button.getBoundingClientRect()
  const width = Math.min(DROPDOWN_WIDTH, window.innerWidth - EDGE * 2)
  const left = Math.min(
    Math.max(EDGE, rect.right - width),
    window.innerWidth - EDGE - width,
  )
  return { top: rect.bottom + 8, left, width }
}

/**
 * Дзвіночок у шапці з лічильником непрочитаних (SCRUM-136).
 * Вигляд — з Figma («Сповіщення — 2 непрочитані»).
 */
export const NotificationBell = () => {
  const { isAuthenticated, isProfileComplete } = useAuth()
  const { unreadCount } = useNotifications()
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const isOpen = dropdownStyle !== null

  // Закриваємо кліком поза компонентом, Esc або зміною розміру вікна
  useEffect(() => {
    if (!isOpen) return
    const close = () => setDropdownStyle(null)
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    // Список закріплений на екрані, тож прокручування сторінки теж його закриває
    window.addEventListener('scroll', close, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close)
    }
  }, [isOpen])

  // Лише для тих, хто увійшов (критерій приймання)
  // (і з заповненою анкетою: без неї бекенд сповіщень не віддає)
  if (!isAuthenticated || !isProfileComplete) return null

  const toggle = () =>
    setDropdownStyle((current) =>
      current || !buttonRef.current
        ? null
        : getDropdownStyle(buttonRef.current),
    )

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={
          unreadCount > 0
            ? `Сповіщення: ${unreadCount} непрочитаних`
            : 'Сповіщення'
        }
        aria-expanded={isOpen}
        className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-main bg-[#DCECFF] transition-transform hover:scale-105 active:scale-95 sm:size-10"
      >
        <img src={bellIcon} alt="" width={22} height={22} />
        {/* Лічильник ховаємо, коли непрочитаних немає (критерій приймання) */}
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E14848] px-1 text-[11px] leading-none font-medium text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {dropdownStyle && (
        <NotificationsDropdown
          style={dropdownStyle}
          onClose={() => setDropdownStyle(null)}
        />
      )}
    </div>
  )
}
