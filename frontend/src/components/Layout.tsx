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
    <div className="app-shell">
      <header className="navbar">
        <div className="navbar-container">
          <Link to="/" className="navbar-brand">
            <span className="brand-logo">🇺🇦</span>
            <span className="brand-title">ДійТут</span>
          </Link>

          <nav className="navbar-nav">
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

          <div className="navbar-user">
            {isAuthenticated && user ? (
              <div className="user-menu">
                <Link
                  to="/profile"
                  className="profile-link"
                  title="Перейти до профілю"
                >
                  <span className="user-avatar" aria-label="Іконка профілю">
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
                  <span className="user-name">{user.name}</span>
                  <span className={`badge badge-sm badge-${user.role}`}>
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
              <div className="guest-menu">
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

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-container">
          <p>© {CURRENT_YEAR} Платформа «ДійТут». Разом до перемоги.</p>
        </div>
      </footer>
    </div>
  )
}

export default Layout
