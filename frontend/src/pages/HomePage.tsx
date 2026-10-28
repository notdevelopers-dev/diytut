import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

export const HomePage = () => {
  const { isAuthenticated, user } = useAuth()

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Ласкаво просимо до «ДійТут»</h1>
        <p className="page-subtitle">
          Платформа, що обʼєднує волонтерів, громадські ініціативи та
          організації для спільних дій.
        </p>
      </header>

      <section className="card status-card">
        <h2>Поточний статус сесії</h2>
        {isAuthenticated && user ? (
          <div>
            <p>
              Ви увійшли як: <strong>{user.name}</strong> (роль:{' '}
              <span className={`badge badge-${user.role}`}>{user.role}</span>)
            </p>
            <p>
              Статус заповнення анкети:{' '}
              <strong>
                {user.isProfileComplete ? 'Заповнено ✅' : 'Не заповнено ⚠️'}
              </strong>
            </p>
            <div className="button-group">
              <Link to="/profile" className="btn btn-primary">
                Перейти до профілю
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="btn btn-secondary">
                  Адмін-панель
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p>
              Ви зараз не авторизовані. Щоб протестувати роботу каркасу,
              увійдіть у систему.
            </p>
            <Link to="/login" className="btn btn-primary">
              Увійти в акаунт
            </Link>
          </div>
        )}
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Для волонтерів</h3>
          <p>
            Знаходьте перевірені збори, допомогу військовим, відбудову та
            локальні ініціативи у вашому місті.
          </p>
        </div>
        <div className="card">
          <h3>Для організацій</h3>
          <p>
            Публікуйте потреби, залучайте мотивованих волонтерів та координуйте
            спільні проєкти.
          </p>
        </div>
      </section>
    </div>
  )
}

export default HomePage
