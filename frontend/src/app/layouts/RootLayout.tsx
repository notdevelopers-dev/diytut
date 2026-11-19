import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import addOrganizationIcon from '@/assets/icons/menu/add-organization.svg'
import avatarIcon from '@/assets/icons/menu/avatar.svg'
import closeIcon from '@/assets/icons/menu/close.svg'
import logoutIcon from '@/assets/icons/menu/logout.svg'
import organizationIcon from '@/assets/icons/menu/organization.svg'
import profileIcon from '@/assets/icons/menu/profile.svg'
import settingsIcon from '@/assets/icons/menu/settings.svg'
import { HeaderSearch } from '@/app/layouts/HeaderSearch'
import { Logo } from '@/components/ui/Logo'
import { NotificationBell } from '@/features/notifications'
import { useAuth } from '@/features/auth/hooks'
import { useIncomingJoinRequests } from '@/features/organizations/hooks'
import {
  canEditOrganization,
  getOrgRoleLabel,
  getOrgStatusLabel,
} from '@/features/organizations/utils'
import {
  changeAccount,
  setProfileMode,
  useProfileMode,
  type ProfileMode,
} from '@/features/users/profileMode'

/** Пункт меню: широка кнопка з іконкою в блакитному квадратику й стрілкою праворуч */
const MenuItem = ({
  icon,
  label,
  onClick,
  isActive = false,
  disabled = false,
  note,
  title,
}: {
  icon: string
  label: string
  onClick?: () => void
  isActive?: boolean
  disabled?: boolean
  note?: string
  title?: string
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-current={isActive ? 'page' : undefined}
    className={`group flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left text-base transition-colors ${
      isActive
        ? 'border-main bg-[#DCECFF] text-black'
        : 'border-transparent text-black hover:border-[#DCECFF] hover:bg-white'
    } ${disabled ? 'cursor-not-allowed opacity-50 hover:border-transparent hover:bg-transparent' : 'cursor-pointer'}`}
  >
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#DCECFF]">
      <img src={icon} alt="" width={22} height={22} />
    </span>
    <span className="flex flex-1 flex-col">
      <span className="font-medium">{label}</span>
      {note && <span className="text-xs text-ink-muted">{note}</span>}
    </span>
    {!disabled && (
      <span
        aria-hidden="true"
        className="text-2xl leading-none text-main transition-transform group-hover:translate-x-0.5"
      >
        ›
      </span>
    )}
  </button>
)

/** Підпис групи пунктів меню */
const MenuSection = ({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) => (
  <section className="flex flex-col gap-1">
    <h3 className="px-3 pb-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">
      {title}
    </h3>
    {children}
  </section>
)

/** Розділи під шапкою: шлях, назва (коротка — для телефона) і колір з Figma (заливка чи рамка) */
interface Section {
  to: string | null
  label: string
  shortLabel: string
  tone: string
  /** Лише для власника й адміністраторів організації (розгляд заявок) */
  reviewersOnly?: boolean
  /** Непарна кнопка: на телефоні й планшеті займає весь ряд */
  wide?: boolean
}

const SITE_SECTIONS: Section[] = [
  {
    to: '/projects',
    label: 'Актуальні проєкти',
    shortLabel: 'Актуальні проєкти',
    tone: 'bg-info',
  },
  {
    to: '/organizations',
    label: 'Організації',
    shortLabel: 'Організації',
    tone: 'bg-main',
  },
]

// Режим організації: вкладки панелі організації (FE-201)
const ORGANIZATION_SECTIONS: Section[] = [
  {
    to: '/organization/dashboard',
    label: 'Проєкти організації',
    shortLabel: 'Наші проєкти',
    tone: 'border-main',
  },
  {
    to: '/organization/dashboard?tab=members',
    label: 'Учасники організації',
    shortLabel: 'Учасники',
    tone: 'border-info',
  },
  {
    to: '/organization/dashboard?tab=requests',
    label: 'Вхідні запити',
    shortLabel: 'Вхідні запити',
    tone: 'border-peach',
    reviewersOnly: true,
    wide: true,
  },
]

export const RootLayout = () => {
  const { isAuthenticated, isProfileComplete, user, logout } = useAuth()
  // Увійшов через Google, але анкету ще не заповнив: профіль, меню й сповіщення
  // йому ще недоступні, тож у шапці лише кнопка завершення реєстрації
  const isRegistered = isAuthenticated && isProfileComplete
  const navigate = useNavigate()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Esc закриває меню
  useEffect(() => {
    if (!isMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMenuOpen])

  const handleLogout = () => {
    setIsMenuOpen(false)
    // Наступний вхід завжди починається з профілю волонтера
    setProfileMode('volunteer')
    logout()
    void navigate('/login')
  }

  // Режим профілю (волонтер / організація) — лише інтерфейс
  const isOrgMode = useProfileMode() === 'organization'
  const switchMode = (mode: ProfileMode) => {
    setProfileMode(mode)
    goTo('/profile')
  }

  // Перехід із меню: закриваємо панель і відкриваємо сторінку
  const goTo = (path: string, state?: unknown) => {
    setIsMenuOpen(false)
    void navigate(path, state ? { state } : undefined)
  }

  // Організація користувача (для режиму організації та перемикання)
  const org = user?.organization
  // Заявки на вступ, що чекають розгляду: лічильник на кнопці «Вхідні запити»
  const canReviewRequests = org?.role === 'owner' || org?.role === 'admin'
  const { data: incomingRequests } = useIncomingJoinRequests(
    org ? Number(org.id) : undefined,
    isRegistered && isOrgMode && canReviewRequests,
  )
  const incomingCount = incomingRequests?.length ?? 0

  return (
    <div className="relative flex min-h-screen flex-col justify-between bg-[#F7FBFF] overflow-x-hidden">
      {/* 1. Шапка за макетом із Figma: логотип ДійТут + жовта кнопка ☰ */}
      <header className="w-full bg-[#F7FBFF]">
        {/* Шапка за макетом Figma: логотип, пошук, дзвіночок, аватар, меню.
            На телефоні пошук переходить на другий рядок */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 px-3 pt-5 pb-4 sm:flex-nowrap sm:gap-x-6 sm:px-8">
          <Logo />

          <HeaderSearch className="order-last w-full sm:order-none sm:mx-auto sm:max-w-[360px] sm:flex-1" />

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            {/* Дзвіночок сповіщень — лише для тих, хто увійшов */}
            <NotificationBell />
            {isRegistered ? (
              <>
                {/* Іконка профілю з макета: відкриває профіль чи кабінет організації */}
                <Link
                  to="/profile"
                  aria-label={isOrgMode ? 'Кабінет організації' : 'Мій профіль'}
                  title={isOrgMode ? 'Кабінет організації' : 'Мій профіль'}
                  className="flex shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95"
                >
                  <img
                    src={avatarIcon}
                    alt=""
                    width={54}
                    height={54}
                    className="size-11 sm:size-[54px]"
                  />
                </Link>
                {/* Жовта кнопка трьох рисочок (☰) */}
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(true)}
                  className="flex h-10 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-info shadow-sm transition-transform hover:scale-105 active:scale-95 sm:h-[46px] sm:w-[58px]"
                  aria-label="Відкрити меню"
                >
                  <div className="flex flex-col gap-1.5">
                    <span className="h-0.5 w-6 rounded-full bg-black" />
                    <span className="h-0.5 w-6 rounded-full bg-black" />
                    <span className="h-0.5 w-6 rounded-full bg-black" />
                  </div>
                </button>
              </>
            ) : isAuthenticated ? (
              <Link
                to="/register/complete"
                className="shrink-0 rounded-lg bg-main px-3 py-2 text-sm font-medium text-white no-underline sm:px-4"
              >
                Завершити реєстрацію
              </Link>
            ) : (
              <Link
                to="/login"
                className="shrink-0 rounded-lg bg-main px-3 py-2 text-sm font-medium text-white no-underline sm:px-4"
              >
                Увійти
              </Link>
            )}
          </div>
        </div>

        {/* Розділи сайту — невеликий список по центру під шапкою (Figma).
            У режимі організації до каталогів додаються її власні розділи */}
        <nav
          aria-label="Розділи"
          className="mx-auto grid w-full max-w-[480px] grid-cols-2 gap-2 px-3 pt-1 pb-4 sm:gap-3 lg:flex lg:max-w-none lg:flex-wrap lg:justify-center lg:gap-4"
        >
          {(isOrgMode && org
            ? [
                ...SITE_SECTIONS,
                ...ORGANIZATION_SECTIONS.filter(
                  (section) =>
                    !section.reviewersOnly ||
                    org.role === 'owner' ||
                    org.role === 'admin',
                ),
              ]
            : SITE_SECTIONS
          ).map((item) => {
            const pillClass = `flex h-8 min-w-0 items-center justify-center gap-2 rounded-[5px] px-3 text-sm whitespace-nowrap text-black no-underline sm:text-base lg:w-[200px] ${
              item.wide ? 'col-span-2' : ''
            }`
            // Кнопка без сторінки — заглушка
            if (!item.to) {
              return (
                <span
                  key={item.label}
                  aria-disabled="true"
                  title="Сторінка з’явиться незабаром"
                  className={`${pillClass} cursor-default border-2 bg-white ${item.tone}`}
                >
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              )
            }
            // Шлях разом із ?tab=…: «Учасники» і «Проєкти» — вкладки однієї сторінки
            const [itemPath, itemQuery = ''] = item.to.split('?')
            const currentTab = new URLSearchParams(location.search).get('tab')
            const itemTab = new URLSearchParams(itemQuery).get('tab')
            // Без ?tab — перша вкладка («Проєкти»): кнопки панелі не світяться разом
            const isActive =
              location.pathname.startsWith(itemPath) &&
              (currentTab ?? 'projects') === (itemTab ?? 'projects')
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={`${pillClass} transition hover:brightness-95 ${item.tone} ${
                  // Розділи організації — біла кнопка з кольоровою рамкою
                  item.tone.startsWith('border') ? 'border-2 bg-white' : ''
                } ${isActive ? 'font-semibold ring-2 ring-black/15' : ''}`}
              >
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
                {/* Кількість заявок, що чекають розгляду */}
                {item.reviewersOnly && incomingCount > 0 && (
                  <span className="rounded-full bg-[#E14848] px-1.5 text-xs leading-5 font-medium text-white">
                    {incomingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        {/* Блакитна лінія під розділами: відділяє шапку від вмісту сторінки */}
        <div className="h-1 w-full bg-main shadow-[0_3px_8px_rgba(121,183,255,0.35)]" />
      </header>

      {/* 2. Основний вміст сайту */}
      <main className="flex-1 w-full">
        <Outlet />
      </main>

      {/* 3. Нижня декоративна смужка */}
      <footer className="h-14 w-full bg-[#DCECFF] border-t-2 border-info" />

      {/* 4. Бургер-меню за макетом Figma («burger profile») */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMenuOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-title"
            className="relative flex h-dvh w-full max-w-[420px] flex-col bg-[#F7FBFF] shadow-2xl"
          >
            {/* Шапка меню: «Меню» і помаранчевий хрестик */}
            <div className="flex items-center justify-between px-5 pt-6 pb-5">
              <h2
                id="menu-title"
                className="font-head text-[32px] font-normal text-main"
              >
                Меню
              </h2>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Закрити меню"
                className="flex h-[46px] w-[55px] cursor-pointer items-center justify-center rounded-[11px] bg-peach"
              >
                <img src={closeIcon} alt="" width={35} height={35} />
              </button>
            </div>
            <div className="h-1 w-full bg-main" />

            {/* Вміст прокручується, «Вийти» завжди видно внизу */}
            {isOrgMode && org ? (
              <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
                {/* Картка організації */}
                <div className="flex items-center gap-4 rounded-2xl border-2 border-[#DCECFF] bg-white p-4">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-main">
                    <img
                      src={organizationIcon}
                      alt=""
                      width={30}
                      height={30}
                      className="brightness-0 invert"
                    />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-lg font-semibold text-black">
                      {org.name}
                    </span>
                    <span className="truncate text-sm text-ink-muted">
                      {getOrgRoleLabel(org.role)}
                      {getOrgStatusLabel(org.status) &&
                        ` · ${getOrgStatusLabel(org.status)}`}
                    </span>
                    <span className="w-fit rounded-full border border-main bg-[#DCECFF] px-3 py-0.5 text-xs text-main">
                      Організація
                    </span>
                  </div>
                </div>

                <MenuSection title="Профіль">
                  <MenuItem
                    icon={organizationIcon}
                    label="Профіль організації"
                    isActive={location.pathname === '/profile'}
                    onClick={() => goTo('/profile')}
                  />
                  {canEditOrganization(org) && (
                    <MenuItem
                      icon={settingsIcon}
                      label="Редагувати організацію"
                      isActive={location.pathname === '/organization/edit'}
                      onClick={() => goTo('/organization/edit')}
                    />
                  )}
                </MenuSection>

                <MenuSection title="Акаунт">
                  <MenuItem
                    icon={profileIcon}
                    label="Переключити на волонтера"
                    note={user?.name}
                    onClick={() => switchMode('volunteer')}
                  />
                  <MenuItem
                    icon={profileIcon}
                    label="Змінити профіль"
                    note="Увійти іншим Google-акаунтом"
                    onClick={() => void changeAccount()}
                  />
                </MenuSection>

                {user?.role === 'admin' && (
                  <MenuSection title="Адміністрування">
                    <MenuItem
                      icon={settingsIcon}
                      label="Адмін панель"
                      isActive={location.pathname.startsWith('/admin')}
                      onClick={() => goTo('/admin')}
                    />
                  </MenuSection>
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
                {/* Картка користувача */}
                <div className="flex items-center gap-4 rounded-2xl border-2 border-[#DCECFF] bg-white p-4">
                  <img
                    src={avatarIcon}
                    alt=""
                    width={56}
                    height={56}
                    className="shrink-0"
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-lg font-semibold text-black">
                      {user?.name ?? 'Користувач'}
                    </span>
                    {user?.nickname && (
                      <span className="truncate text-sm text-ink-muted">
                        @{user.nickname}
                      </span>
                    )}
                    <span className="w-fit rounded-full border border-main bg-[#DCECFF] px-3 py-0.5 text-xs text-main">
                      {user?.role === 'admin' ? 'Адміністратор' : 'Волонтер'}
                    </span>
                  </div>
                </div>

                <MenuSection title="Профіль">
                  <MenuItem
                    icon={profileIcon}
                    label="Мій профіль"
                    isActive={location.pathname === '/profile'}
                    onClick={() => goTo('/profile')}
                  />
                  <MenuItem
                    icon={settingsIcon}
                    label="Редагувати профіль"
                    onClick={() => goTo('/profile', { edit: true })}
                  />
                </MenuSection>

                <MenuSection title="Організація">
                  {/* Сторінка організації — у режимі організації, тут лише створення */}
                  {!org && (
                    // Сторінка створення пускає лише тих, у кого організації ще немає
                    <MenuItem
                      icon={addOrganizationIcon}
                      label="Додати організацію"
                      isActive={location.pathname === '/organization/create'}
                      onClick={() => goTo('/organization/create')}
                    />
                  )}
                  {/* Перемикання в акаунт організації — лише інтерфейс: бекенд працює
                    з тією самою сесією, якщо користувач є учасником організації */}
                  <MenuItem
                    icon={organizationIcon}
                    label="Переключити на організацію"
                    note={org ? org.name : 'Спершу додайте організацію'}
                    disabled={!org}
                    onClick={() => switchMode('organization')}
                  />
                </MenuSection>

                <MenuSection title="Акаунт">
                  {/* Вийти й одразу відкрити вхід через Google */}
                  <MenuItem
                    icon={profileIcon}
                    label="Змінити профіль"
                    note="Увійти іншим Google-акаунтом"
                    onClick={() => void changeAccount()}
                  />
                </MenuSection>

                {/* Адмін-панель — лише для адміністраторів платформи */}
                {user?.role === 'admin' && (
                  <MenuSection title="Адміністрування">
                    <MenuItem
                      icon={settingsIcon}
                      label="Адмін панель"
                      isActive={location.pathname.startsWith('/admin')}
                      onClick={() => goTo('/admin')}
                    />
                  </MenuSection>
                )}
              </div>
            )}

            <div className="border-t-2 border-[#DCECFF] px-5 py-5">
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-[#E14848] bg-white text-base font-medium text-[#E14848] transition-colors hover:bg-red-50"
              >
                <img src={logoutIcon} alt="" width={20} height={20} />
                Вийти
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RootLayout
