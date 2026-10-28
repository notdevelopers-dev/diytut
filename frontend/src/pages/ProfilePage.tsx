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
        <div className="profile-header">
          <div className="profile-avatar-large">
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
            <p className="text-muted">{user?.email}</p>
            <span className={`badge badge-${user?.role}`}>{user?.role}</span>
          </div>
        </div>

        <hr className="divider" />

        <div className="profile-details">
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
                user?.isProfileComplete ? 'text-success' : 'text-danger'
              }
            >
              {user?.isProfileComplete ? 'Заповнено ✅' : 'Не заповнено ❌'}
            </span>
          </div>
          <div className="detail-item">
            <strong>Токен сесії (localStorage):</strong>
            <pre className="token-preview">{token ?? '—'}</pre>
          </div>
        </div>

        <div className="button-group" style={{ marginTop: '1.5rem' }}>
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
