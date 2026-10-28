import { useAuth } from '../context/AuthContext.tsx'

export const AdminPage = () => {
  const { user } = useAuth()

  return (
    <div className="page-container">
      <header className="page-header">
        <div
          className="badge badge-admin"
          style={{ display: 'inline-block', marginBottom: '0.5rem' }}
        >
          Адміністративна зона
        </div>
        <h1>Панель керування платформою «ДійТут»</h1>
        <p className="page-subtitle">
          Сторінка захищена за допомогою <code>AdminRoute</code>. Доступ мають
          лише користувачі з роллю <strong>admin</strong>.
        </p>
      </header>

      <section className="admin-status card">
        <h3>Вітаємо, {user?.name}!</h3>
        <p>
          Звичайні волонтери та організації блокуються охоронцем маршруту та
          повертаються на головну сторінку.
        </p>
      </section>

      <section className="grid-3">
        <div className="card metric-card">
          <h4>Організації на верифікації</h4>
          <div className="metric-number">7</div>
          <p className="text-muted">Потребують перевірки документів</p>
        </div>
        <div className="card metric-card">
          <h4>Активні збори</h4>
          <div className="metric-number">42</div>
          <p className="text-muted">Опубліковано за останні 7 днів</p>
        </div>
        <div className="card metric-card">
          <h4>Зареєстровано волонтерів</h4>
          <div className="metric-number">1 280</div>
          <p className="text-muted">+54 за сьогодні</p>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Журнал дій адміністратора</h3>
        <ul className="admin-log">
          <li>✅ Верифіковано ГО «Крила Перемоги»</li>
          <li>🛡️ Оновлено налаштування безпеки API</li>
          <li>📝 Схвалено новий збір «Тепло для захисників»</li>
        </ul>
      </section>
    </div>
  )
}

export default AdminPage
