import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext.tsx'

interface LoginStatsData {
  date_from: string
  date_to: string
  timezone: string
  total_logins: number
  unique_users: number
  days: Array<{ date: string; logins: number; unique_users: number }>
}

interface Organization {
  id: number
  name: string
  status: string
  [key: string]: any
}

export const AdminPage = () => {
  const { user } = useAuth()
  const [stats, setStats] = useState<LoginStatsData | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const statsRes = await fetch('/api/admin/stats/logins', {
        credentials: 'include',
      })
      if (!statsRes.ok) {
        throw new Error('Не вдалося завантажити статистику входів.')
      }
      const statsData: LoginStatsData = await statsRes.json()
      setStats(statsData)

      const orgsRes = await fetch('/api/admin/organizations?status=pending', {
        credentials: 'include',
      })
      if (!orgsRes.ok) {
        throw new Error('Не вдалося завантажити список організацій.')
      }
      const orgsData = await orgsRes.json()
      setOrganizations(orgsData.items || orgsData || [])
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Сталася помилка при завантаженні даних.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleReview = async (orgId: number, approve: boolean) => {
    try {
      const response = await fetch(`/api/admin/organizations/${orgId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          decision: approve ? 'approved' : 'rejected',
          comment: approve 
            ? 'Схвалено адміністратором платформи' 
            : 'Відхилено адміністратором через неповні або некоректні дані',
        }),
      })

      if (!response.ok) {
        throw new Error('Не вдалося оновити статус організації.')
      }

      setActionMessage(`Організацію ID ${orgId} успішно ${approve ? 'схвалено' : 'відхилено'}.`)
      fetchData()
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'Помилка виконання дії.')
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="badge badge-admin mb-2">Адміністративна зона</div>
        <h1>Панель керування платформою «ДійТут»</h1>
        <p className="page-subtitle">
          Сторінка захищена за допомогою <code>AdminRoute</code>. Доступ мають
          лише користувачі з роллю <strong>admin</strong>.
        </p>
      </header>

      <section className="admin-status card mb-6">
        <h3>Вітаємо, {user?.name || 'Адміністраторе'}!</h3>
        <p>
          Тут ви можете здійснювати перегляд та верифікацію запитів організацій і відстежувати статистику входів на платформу.
        </p>
        {actionMessage && <div className="mt-2 text-green-600 font-medium">{actionMessage}</div>}
        {error && <div className="mt-2 text-red-500 font-medium">{error}</div>}
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 mb-6">
        <div className="card p-5 text-center">
          <h4>Загальна кількість входів</h4>
          <div className="metric-number">
            {loading ? '...' : (stats?.total_logins ?? 0)}
          </div>
          <p className="text-ink-muted">За вибраний період</p>
        </div>
        <div className="card p-5 text-center">
          <h4>Унікальні користувачі</h4>
          <div className="metric-number">
            {loading ? '...' : (stats?.unique_users ?? 0)}
          </div>
          <p className="text-ink-muted">Активні на платформі</p>
        </div>
        <div className="card p-5 text-center">
          <h4>Організацій на перевірку</h4>
          <div className="metric-number">
            {loading ? '...' : organizations.length}
          </div>
          <p className="text-ink-muted">Очікують рішення</p>
        </div>
      </section>

      <section className="card">
        <h3>Запити на створення організацій</h3>
        {loading ? (
          <p className="py-4 text-center">Завантаження даних...</p>
        ) : organizations.length === 0 ? (
          <p className="py-4 text-ink-muted">Наразі немає нових запитів на верифікацію.</p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 px-3">ID</th>
                  <th className="py-2 px-3">Назва організації</th>
                  <th className="py-2 px-3">Статус</th>
                  <th className="py-2 px-3 text-right">Дії</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} className="border-b border-gray-100">
                    <td className="py-3 px-3">{org.id}</td>
                    <td className="py-3 px-3 font-medium">{org.name}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                        {org.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right space-x-2">
                      <button
                        onClick={() => handleReview(org.id, true)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition"
                      >
                        Схвалити
                      </button>
                      <button
                        onClick={() => handleReview(org.id, false)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition"
                      >
                        Відхилити
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminPage