import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export const Layout = () => {
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleLogout = () => {
    setIsMenuOpen(false)
    logout()
    void navigate('/login')
  }

  // Організація користувача
  const org = user?.organization

  return (
    <div className="relative flex min-h-screen flex-col justify-between bg-[#F7FBFF] overflow-x-hidden">
      {/* 1. Шапка за макетом із Figma: логотип ДійТут + жовта кнопка ☰ */}
      <header className="w-full bg-[#F7FBFF]">
        <div className="flex items-center justify-between px-8 pt-6 pb-4">
          <Link to="/" className="no-underline">
            <span className="text-3xl font-bold tracking-tight">
              <span className="text-[#5897FB]">Дій</span>
              <span className="text-[#F4B840]">Тут</span>
            </span>
          </Link>

          {/* Жовта кнопка трьох рисочок (☰) */}
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
              className="rounded-lg bg-[#5897FB] px-4 py-2 text-sm font-medium text-white no-underline"
            >
              Увійти
            </Link>
          )}
        </div>
        <div className="h-[2px] w-full bg-[#70A5F9]" />
      </header>

      {/* 2. Основний вміст сайту */}
      <main className="flex-1 w-full">
        <Outlet />
      </main>

      {/* 3. Нижня декоративна смужка */}
      <footer className="h-14 w-full bg-[#DCECFF] border-t-2 border-[#F1D387]" />

      {/* 4. ВИСУВНЕ МЕНЮ ОРГАНІЗАЦІЇ (image_2e19c8.png) */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs">
          <div className="relative flex h-full w-full max-w-sm flex-col justify-between bg-[#F7FBFF] shadow-2xl p-6 sm:p-8">
            <div>
              {/* Шапка меню з помаранчевим хрестиком */}
              <div className="flex items-center justify-between border-b-2 border-[#70A5F9] pb-4 mb-6">
                <h2 className="text-3xl font-bold text-[#5897FB]">Меню</h2>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-[#F5E6BF] text-2xl font-bold text-black"
                >
                  ✕
                </button>
              </div>

              {/* Картка організації або профілю користувача */}
              <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-xs flex flex-col gap-4">
                {org ? (
                  <>
                    <div>
                      <div className="text-xs text-gray-400">
                        Назва організації
                      </div>
                      <div className="text-base font-bold text-black truncate">
                        {org.name}
                      </div>
                      <span className="inline-block mt-1 text-[11px] font-semibold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                        Роль: {org.roleInOrg ?? 'Власник'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        void navigate('/organization/edit')
                      }}
                      className="flex items-center gap-2.5 w-full rounded-full border border-sky-200 bg-[#F0F7FF] px-4 py-2 text-xs font-medium text-black hover:bg-sky-100 cursor-pointer"
                    >
                      <span className="text-base">⚙️</span>
                      Редагувати організацію
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-base font-bold text-black truncate">
                        {user?.name ?? 'Користувач'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {user?.email ?? 'Волонтер'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        void navigate('/organization/create')
                      }}
                      className="flex items-center justify-center gap-2 w-full rounded-full bg-[#5897FB] px-4 py-2 text-xs font-medium text-white hover:bg-[#4782e0] cursor-pointer"
                    >
                      + Створити організацію
                    </button>
                  </>
                )}

                <div className="h-[1px] w-full bg-gray-100 my-1" />

                {/* Червона кнопка "Вийти" */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-xs font-medium text-red-500 hover:text-red-700 cursor-pointer"
                >
                  <span className="border border-red-400 rounded px-1 text-sm font-bold">
                    ➔
                  </span>
                  Вийти
                </button>
              </div>
            </div>

            <div className="text-[11px] text-gray-400 text-center">
              Платформа «ДійТут»
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Layout
