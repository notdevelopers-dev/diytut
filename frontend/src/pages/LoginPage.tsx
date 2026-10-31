import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import type { Role } from '../context/AuthContext.tsx'

interface LocationState {
  from?: {
    pathname: string
  }
}

export const LoginPage = () => {
  const { isAuthenticated, user, login, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | undefined

  const [selectedRole, setSelectedRole] = useState<Role>('volunteer')
  const [isProfileComplete, setIsProfileComplete] = useState<boolean>(true)
  const [email, setEmail] = useState<string>('')

  const redirectPath =
    state?.from?.pathname ??
    (isProfileComplete ? '/profile' : '/register/complete')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const mockToken = `mock_jwt_${selectedRole}_${Date.now()}`
    login(mockToken, selectedRole, isProfileComplete, {
      email: email || `${selectedRole}@diytut.org`,
      name:
        selectedRole === 'admin'
          ? 'Адміністратор платформи'
          : selectedRole === 'organization'
            ? 'БО «Дій Разом»'
            : 'Волонтер Тарас',
    })
    void navigate(redirectPath, { replace: true })
  }

  const handleQuickLogin = (role: Role, profileCompleted: boolean) => {
    const mockToken = `mock_jwt_${role}_${Date.now()}`
    login(mockToken, role, profileCompleted, {
      email: `${role}@diytut.org`,
      name:
        role === 'admin'
          ? 'Адміністратор'
          : role === 'organization'
            ? 'ГО «Дій Твори»'
            : 'Волонтер Анна',
    })
    const target =
      state?.from?.pathname ??
      (profileCompleted ? '/profile' : '/register/complete')
    void navigate(target, { replace: true })
  }

  return (
    <div className="page-container page-auth">
      <div className="card auth-card">
        <h1>Вхід у систему</h1>
        <p className="page-subtitle">
          Увійдіть або скористайтеся швидкими кнопками для тестування ролей
          каркасу.
        </p>

        {isAuthenticated && user ? (
          <div className="alert alert-info">
            <p>
              Ви вже увійшли як <strong>{user.name}</strong> ({user.role}).
            </p>
            <div className="button-group">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void navigate('/profile')
                }}
              >
                Перейти до профілю
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={logout}
              >
                Вийти
              </button>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="email-input">Електронна пошта</label>
                <input
                  id="email-input"
                  type="email"
                  placeholder="Введіть email або залиште порожнім"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="role-select">Оберіть роль</label>
                <select
                  id="role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                  className="form-select"
                >
                  <option value="volunteer">Волонтер (volunteer)</option>
                  <option value="organization">
                    Організація (organization)
                  </option>
                  <option value="admin">Адміністратор (admin)</option>
                </select>
              </div>

              <div className="form-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={isProfileComplete}
                    onChange={(e) => setIsProfileComplete(e.target.checked)}
                  />{' '}
                  Анкета вже заповнена (isProfileComplete:{' '}
                  {isProfileComplete ? 'true' : 'false'})
                </label>
                <small className="help-text">
                  Якщо зняти галочку — ProtectedRoute автоматично спрямує на
                  /register/complete.
                </small>
              </div>

              <button type="submit" className="btn btn-primary btn-block">
                Увійти з обраними параметрами
              </button>
            </form>

            <div className="quick-test-section">
              <h3>Швидкий вхід для тестування ролей:</h3>
              <div className="quick-buttons-grid">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleQuickLogin('volunteer', true)}
                >
                  👤 Волонтер (анкета заповнена)
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleQuickLogin('volunteer', false)}
                >
                  ⚠️ Волонтер (анкета НЕ заповнена)
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleQuickLogin('organization', true)}
                >
                  🏢 Організація (анкета заповнена)
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleQuickLogin('admin', true)}
                >
                  👑 Адміністратор (доступ до /admin)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default LoginPage
