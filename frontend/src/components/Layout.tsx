import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export const Layout = () => {
  const {
    isAuthenticated,
    user,
    activeMode,
    switchActiveMode,
    logout,
  } = useAuth()
  const navigate = useNavigate()

  // Стан відкриття/закриття висувного меню трьох рисочок
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleLogout = () => {
    setIsMenuOpen(false)
    logout()
    navigate('/login')
  }

  // Організація користувача (або дефолтна тестова)
  const org = user?.organization ?? {
    name: 'БО «Дій Разом»',
    roleInOrg: 'Власник',
  }

  return (
    <div className="relative flex min-h-screen flex-col justify-between bg-[#F7FBFF] overflow-x-hidden">
      {/* 1. Верхній Header за макетом із Figma: логотип ДійТут + жовта кнопка ☰ */}
      <header className="w-full bg-[#F7FBFF]">
        <div className="flex items-center justify-between px-8 pt-6 pb-4">
          <Link to="/" className="no-underline">
            <span className="text-3xl font-bold tracking-tight">
              <span className="text-[#5897FB]">Дій</span>
              <span className="text-[#F4B840]">Тут</span>
            </span>
          </Link>

          {/* Жовта кнопка трьох рисочок (☰) як у Figma (image_2e23ee.png) */}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="flex h-10 w-12 cursor-pointer items-center justify-center rounded-xl bg-[#F5E6BF] shadow-sm transition-transform hover:scale-105 active:scale-95"
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
              className="rounded-lg bg-[#5897FB] px-4 py-2 text-sm font-medium text-white no-underline hover:bg-[#4887eb]"
            >
              Увійти
            </Link>
          )}
        </div>
        {/* Синя горизонтальна лінія-розділювач під шапкою */}
        <div className="h-[2px] w-full bg-[#70A5F9]" />
      </header>

      {/* 2. Основний вміст поточної сторінки */}
      <main className="flex-1 w-full">
        <Outlet />
      </main>

      {/* 3. Нижня декоративна смужка за макетом */}
      <footer className="h-14 w-full bg-[#DCECFF] border-t-2 border-[#F1D387]" />

      {/* 4. ВИСУВНЕ ВІКНО «МЕНЮ» (Drawers із макетів 1 та 4) */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs transition-opacity">
          {/* Бічна панель за дизайном Figma */}
          <div className="relative flex h-full w-full max-w-sm flex-col justify-between bg-[#F7FBFF] shadow-2xl p-6 sm:p-8 animate-in slide-in-from-right duration-200">
            {/* Верх висувної панелі: Заголовок "Меню" та помаранчевий "✕" */}
            <div>
              <div className="flex items-center justify-between border-b-2 border-[#70A5F9] pb-4 mb-6">
                <h2 className="text-3xl font-bold text-[#5897FB]">Меню</h2>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-[#F5E6BF] text-2xl font-bold text-black transition-transform hover:scale-105 active:scale-95"
                  title="Закрити"
                >
                  ✕
                </button>
              </div>

              {/* КАРТКА МЕНЮ В СЕРЕДИНІ ПАНЕЛІ */}
              <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-xs flex flex-col gap-4">
                
                {/* ВАРІАНТ А: РЕЖИМ ОРГАНІЗАЦІЇ (image_2e19c8.png) */}
                {activeMode === 'organization' ? (
                  <>
                    <div>
                      <div className="text-xs text-gray-400">Організація</div>
                      <div className="text-base font-bold text-black truncate">
                        {org.name}
                      </div>
                      {/* Роль в організації за вимогою таски: View your role in the organization */}
                      <span className="inline-block mt-1 text-[11px] font-semibold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                        Роль: {org.roleInOrg ?? 'Власник'}
                      </span>
                    </div>

                    {/* Кнопка "Редагувати організацію" з шестернею ⚙️ */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        navigate('/organization/edit')
                      }}
                      className="flex items-center gap-2.5 w-full rounded-full border border-sky-200 bg-[#F0F7FF] px-4 py-2 text-xs font-medium text-black hover:bg-sky-100 transition-colors"
                    >
                      <span className="text-base">⚙️</span>
                      Редагувати організацію
                    </button>
                  </>
                ) : (
                  /* ВАРІАНТ Б: РЕЖИМ ВОЛОНТЕРА (image_2e242c.png) */
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white font-bold">
                        👤
                      </div>
                      <div className="text-sm font-semibold text-black truncate">
                        {user?.nickname ?? user?.name ?? 'Волонтер'}
                      </div>
                    </div>

                    {/* Редагувати профіль волонтера */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        navigate('/profile')
                      }}
                      className="flex items-center gap-2.5 w-full rounded-full border border-sky-200 bg-[#F0F7FF] px-4 py-2 text-xs font-medium text-black hover:bg-sky-100 transition-colors"
                    >
                      <span className="text-base">⚙️</span>
                      Редагувати профіль
                    </button>

                    {/* Додати організацію */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        navigate('/organization/create')
                      }}
                      className="flex items-center gap-2.5 w-full rounded-full border border-sky-200 bg-[#F0F7FF] px-4 py-2 text-xs font-medium text-black hover:bg-sky-100 transition-colors"
                    >
                      <span className="text-base">👥</span>
                      Додати організацію
                    </button>
                  </>
                )}

                {/* Посилання "Переключити профіль" із макета */}
                <button
                  type="button"
                  onClick={switchActiveMode}
                  className="text-left text-xs text-[#5897FB] hover:underline cursor-pointer pt-1"
                >
                  ⇄ Переключити профіль ({activeMode === 'organization' ? 'на Волонтера' : 'на Організацію'})
                </button>

                <div className="h-[1px] w-full bg-gray-100 my-1" />

                {/* Червона кнопка "Вийти" за макетом Figma */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-xs font-medium text-red-500 hover:text-red-700 cursor-pointer"
                >
                  <span className="border border-red-400 rounded px-1 text-sm font-bold">➔</span>
                  Вийти
                </button>
              </div>
            </div>

            {/* Низ висувної панелі */}
            <div className="text-[11px] text-gray-400 text-center">
              Платформа «ДійТут» • Меню профілю
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Layout