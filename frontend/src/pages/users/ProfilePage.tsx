import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { apiClient } from '../api/client'
import {
  canEditOrganization,
  getOrgRoleLabel,
  getOrgStatusLabel,
} from '../utils/organization'

interface OrgProfileData {
  id: number
  name: string
  email: string
  phone: string
  city_id: number
  description: string | null
  edrpou: string | null
  status: string
  role: string
}

export const ProfilePage = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [orgData, setOrgData] = useState<OrgProfileData | null>(null)
  const [isOrgLoading, setIsOrgLoading] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    if (user?.organization) {
      // oxlint-disable-next-line react/set-state-in-effect
      setIsOrgLoading(true)
      setOrgError(null)
      apiClient
        .get<OrgProfileData>('/organizations/me')
        .then(({ data }) => {
          if (isMounted) setOrgData(data)
        })
        .catch((err: unknown) => {
          console.error('Не вдалося завантажити дані організації:', err)
          if (isMounted) {
            setOrgError(
              'Не вдалося завантажити дані організації. Оновіть сторінку.',
            )
          }
        })
        .finally(() => {
          if (isMounted) setIsOrgLoading(false)
        })
    } else {
      setOrgData(null)
    }
    return () => {
      isMounted = false
    }
  }, [user?.organization])

  const handleLogout = () => {
    logout()
    void navigate('/login')
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Особистий кабінет</h1>
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
        </div>

        <div className="button-group mt-6">
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleLogout}
          >
            Вийти з акаунта
          </button>
        </div>
      </div>

      {/* Картка організації */}
      {user?.organization ? (
        <div className="card profile-card mt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs text-ink-muted">Організація</div>
              <h2 className="text-xl font-bold text-ink">
                {orgData?.name ?? user.organization.name}
              </h2>
              <span className="inline-block mt-1 text-xs font-semibold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                Роль: {getOrgRoleLabel(user.organization.role)}
              </span>
              {getOrgStatusLabel(user.organization.status) && (
                <span className="ml-2 inline-block mt-1 text-xs font-semibold text-ink-muted bg-page px-2.5 py-0.5 rounded-full">
                  {getOrgStatusLabel(user.organization.status)}
                </span>
              )}
            </div>
            {canEditOrganization(user.organization) && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void navigate('/organization/edit')}
              >
                ⚙️ Редагувати організацію
              </button>
            )}
          </div>

          <hr className="my-6 h-px border-0 bg-border" />

          {isOrgLoading ? (
            <div className="text-xs text-ink-muted">
              Завантаження даних організації...
            </div>
          ) : orgError ? (
            <div className="rounded-lg bg-red-100 p-2.5 text-center text-xs text-red-700">
              {orgError}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="detail-item">
                <strong>Електронна пошта:</strong>{' '}
                <span>{orgData?.email ?? '—'}</span>
              </div>
              <div className="detail-item">
                <strong>Телефон:</strong> <span>{orgData?.phone ?? '—'}</span>
              </div>
              <div className="detail-item">
                <strong>Код ЄДРПОУ:</strong>{' '}
                <span>{orgData?.edrpou || 'Не вказано'}</span>
              </div>
              <div className="detail-item">
                <strong>Опис:</strong>{' '}
                <span className="whitespace-pre-wrap">
                  {orgData?.description || 'Опис відсутній'}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card profile-card mt-6 flex flex-col items-center text-center p-6 sm:p-8">
          <div className="text-3xl mb-2">🏢</div>
          <h2 className="text-lg font-bold">Організація</h2>
          <p className="text-xs text-ink-muted mt-1 max-w-md">
            Ви ще не зареєстрували організацію. Якщо ви є представником фонду чи
            ГО, зареєструйте її тут.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-4"
            onClick={() => void navigate('/organization/create')}
          >
            + Створити організацію
          </button>
        </div>
      )}
    </div>
  )
}

export default ProfilePage
