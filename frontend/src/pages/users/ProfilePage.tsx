import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

export const ProfilePage = () => {
  const { user, token, logout, setProfileComplete } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    void navigate('/login')
  }

  const handleResetProfile = () => {
    setProfileComplete(false)
    void navigate('/register/complete')
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Особистий кабінет</h1>
        <p className="page-subtitle">
          Сторінка захищена за допомогою <code>ProtectedRoute</code>.
        </p>
      </header>

      <div className="card profile-card">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary-light text-primary">
            <svg
              width="48"
              height="48"
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
          </div>
          <div>
            <h2>{user?.name ?? 'Користувач'}</h2>
            <p className="text-ink-muted">{user?.email}</p>
            <span className={`badge badge-${user?.role}`}>{user?.role}</span>
          </div>
        </div>

        <hr className="my-6 h-px border-0 bg-border" />

        <div className="flex flex-col gap-3">
          <div className="detail-item">
            <strong>ID користувача:</strong> <code>{user?.id}</code>
          </div>
          <div className="detail-item">
            <strong>Роль у системі:</strong> <code>{user?.role}</code>
          </div>
          <div className="detail-item">
            <strong>Статус анкети:</strong>{' '}
            <span
              className={
                user?.isProfileComplete
                  ? 'font-semibold text-success'
                  : 'font-semibold text-danger'
              }
            >
              {user?.isProfileComplete ? 'Заповнено ✅' : 'Не заповнено ❌'}
            </span>
          </div>
          <div className="detail-item">
            <strong>Токен сесії (localStorage):</strong>
            <pre className="max-w-full break-all rounded-sm border border-border bg-page px-[0.6rem] py-[0.4rem] text-[0.8rem]">
              {token ?? '—'}
            </pre>
          </div>
        </div>

        <div className="button-group mt-6">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleResetProfile}
          >
            Скинути анкету (тест редиректу на /register/complete)
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleLogout}
          >
            Вийти з акаунта
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
