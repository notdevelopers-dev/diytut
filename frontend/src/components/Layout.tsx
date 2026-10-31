import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

const CURRENT_YEAR = new Date().getFullYear()

export const Layout = () => {
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    void navigate('/login')
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[100] border-b border-border bg-surface shadow-sm">
        <div className="mx-auto flex w-full max-w-[1024px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:gap-6 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold text-ink no-underline"
          >
            <span className="text-2xl">🇺🇦</span>
            <span className="tracking-tight">ДійТут</span>
          </Link>

          <nav className="flex items-center gap-4">
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              Головна
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  isActive ? 'nav-link active' : 'nav-link'
                }
              >
                Адмін-панель
              </NavLink>
            )}
          </nav>

          <div className="flex min-w-0 items-center gap-3">
            {isAuthenticated && user ? (
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  to="/profile"
                  className="flex min-w-0 items-center gap-2 rounded-sm px-[0.6rem] py-[0.35rem] text-ink no-underline transition-colors hover:bg-page"
                  title="Перейти до профілю"
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary"
                    aria-label="Іконка профілю"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  <span className="min-w-0 truncate text-[0.9rem] font-semibold">
                    {user.name}
                  </span>
                  <span
                    className={`badge badge-sm badge-${user.role} hidden shrink-0 sm:inline-block`}
                  >
                    {user.role}
                  </span>
                </Link>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={handleLogout}
                >
                  Вийти
                </button>
              </div>
            ) : (
              <div className="flex items-center">
                <Link to="/login" className="btn btn-sm btn-primary">
                  <span className="btn-icon">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                  </span>
                  Увійти
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1024px] flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="mt-auto border-t border-border bg-surface px-4 py-5 text-center text-[0.85rem] text-ink-muted sm:px-6">
        <div className="footer-container">
          <p>© {CURRENT_YEAR} Платформа «ДійТут». Разом до перемоги.</p>
        </div>
      </footer>
    </div>
  )
}

export default Layout
