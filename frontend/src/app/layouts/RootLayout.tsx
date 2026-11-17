import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import addOrganizationIcon from '@/assets/icons/menu/add-organization.svg'
import avatarIcon from '@/assets/icons/menu/avatar.svg'
import closeIcon from '@/assets/icons/menu/close.svg'
import logoutIcon from '@/assets/icons/menu/logout.svg'
import organizationIcon from '@/assets/icons/menu/organization.svg'
import profileIcon from '@/assets/icons/menu/profile.svg'
import settingsIcon from '@/assets/icons/menu/settings.svg'
import { Logo } from '@/components/ui/Logo'
import { useAuth } from '@/features/auth/hooks'

/** Пункт меню з макета: «пігулка» 195×22 з іконкою ліворуч */
const MenuItem = ({
  icon,
  label,
  onClick,
}: {
  icon: string
  label: string
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-[22px] w-[195px] cursor-pointer items-center gap-2 rounded-[11px] border border-[#DCECFF] px-2.5 text-left text-[11px] text-black transition-colors hover:bg-[#DCECFF]"
  >
    <img src={icon} alt="" width={16} height={16} />
    {label}
  </button>
)

export const RootLayout = () => {
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleLogout = () => {
    setIsMenuOpen(false)
    logout()
    void navigate('/login')
  }

  // Перехід із меню: закриваємо панель і відкриваємо сторінку
  const goTo = (path: string, state?: unknown) => {
    setIsMenuOpen(false)
    void navigate(path, state ? { state } : undefined)
  }

  // Організація користувача (для пункту «Моя організація»)
  const org = user?.organization

  return (
    <div className="relative flex min-h-screen flex-col justify-between bg-[#F7FBFF] overflow-x-hidden">
      {/* 1. Шапка за макетом із Figma: логотип ДійТут + жовта кнопка ☰ */}
      <header className="w-full bg-[#F7FBFF]">
        <div className="flex items-center justify-between px-8 pt-6 pb-4">
          <Logo />

          <div className="flex items-center gap-4">
            {/* Жовта кнопка трьох рисочок (☰) */}
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                className="flex h-10 w-12 cursor-pointer items-center justify-center rounded-xl bg-info shadow-sm transition-transform hover:scale-105 active:scale-95"
                aria-label="Відкрити меню"
              >
                <div className="flex flex-col gap-1">
                  <span className="h-0.5 w-6 bg-black rounded-full" />
                  <span className="h-0.5 w-6 bg-black rounded-full" />
                  <span className="h-0.5 w-6 bg-black rounded-full" />
                </div>
              </button>
            ) : (
              <Link
                to="/login"
                className="rounded-lg bg-main px-4 py-2 text-sm font-medium text-white no-underline"
              >
                Увійти
              </Link>
            )}
          </div>
        </div>
        <div className="h-[2px] w-full bg-main" />
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
            className="relative flex h-full w-full max-w-[440px] flex-col bg-[#F7FBFF] shadow-2xl"
          >
            {/* Шапка меню: «Меню» і помаранчевий хрестик */}
            <div className="flex items-center justify-between px-6 pt-6 pb-5">
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

            <div className="flex flex-1 flex-col justify-between px-6 py-8">
              {/* Картка користувача з пунктами меню */}
              <div className="flex flex-col gap-1 rounded-[15px] border-2 border-[#DCECFF] bg-[#F7FBFF] p-2.5">
                <div className="mb-1 flex items-center gap-1">
                  <img src={avatarIcon} alt="" width={40} height={40} />
                  <span className="max-w-[200px] truncate rounded-[3px] border border-[#DCECFF] px-1.5 text-[10px] text-black">
                    {user?.nickname ?? user?.name ?? 'Користувач'}
                  </span>
                </div>

                <MenuItem
                  icon={profileIcon}
                  label="Мій профіль"
                  onClick={() => goTo('/profile')}
                />
                {org && (
                  <MenuItem
                    icon={organizationIcon}
                    label="Моя організація"
                    onClick={() => goTo('/organization/edit')}
                  />
                )}
                <MenuItem
                  icon={settingsIcon}
                  label="Редагувати профіль"
                  onClick={() => goTo('/profile', { edit: true })}
                />
                {/* Сторінка створення поки пускає лише тих, у кого організації ще немає
                    (так само, як кнопка «Створити організацію» в профілі) */}
                {!org && (
                  <MenuItem
                    icon={addOrganizationIcon}
                    label="Додати організацію"
                    onClick={() => goTo('/organization/create')}
                  />
                )}

                {/* Перемикання в акаунт організації: на бекенді ще немає ендпоінта,
                    тож кнопка вимкнена (відкрите питання з SCRUM-27 / SCRUM-35) */}
                <button
                  type="button"
                  disabled
                  title="Перемикання в акаунт організації стане доступним, щойно бекенд додасть відповідний ендпоінт"
                  className="mt-0.5 w-fit cursor-not-allowed rounded-[11px] border border-[#DCECFF] px-1.5 text-[9px] text-black/50"
                >
                  Переключити профіль
                </button>

                <div className="my-2 h-px w-full bg-[#DCECFF]" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="ml-3 flex h-[21px] w-fit cursor-pointer items-center gap-1.5 border border-[#E14848] px-1.5 text-[11px] text-[#E14848] transition-colors hover:bg-red-50"
                >
                  <img src={logoutIcon} alt="" width={13} height={13} />
                  Вийти
                </button>
              </div>

              {/* Адмін-панель — унизу, лише для адміністраторів платформи */}
              {user?.role === 'admin' && (
                <MenuItem
                  icon={settingsIcon}
                  label="Адмін панель"
                  onClick={() => goTo('/admin')}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RootLayout
