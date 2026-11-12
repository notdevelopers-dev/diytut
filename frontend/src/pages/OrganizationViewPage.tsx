import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  fetchOrganizationById,
  fetchOrganizationProjects,
  createJoinRequest,
  fetchJoinRequestStatus,
} from '../api/organizations'
import { formatPhone } from '../utils/phone'
import { formatProjectsCount } from '../utils/organization'
import { ProjectCard } from '../components/ProjectCard'
import { JoinRequestModal } from '../components/JoinRequestModal'
import type { OrganizationDetails, JoinRequestStatus } from '../types/organization'
import type { Project } from '../types/project'

export const OrganizationViewPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, user } = useAuth()
  const { showToast } = useToast()

  const [organization, setOrganization] = useState<OrganizationDetails | null>(
    null,
  )
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Join modal & request status
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [requestStatus, setRequestStatus] = useState<JoinRequestStatus | null>(
    null,
  )

  const loadData = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)

    try {
      const [orgData, projectsData] = await Promise.all([
        fetchOrganizationById(id),
        fetchOrganizationProjects(id),
      ])

      setOrganization(orgData)
      setProjects(projectsData)

      // Set initial request status if provided by backend view
      if (orgData.user_request_status) {
        setRequestStatus(orgData.user_request_status)
      } else if (isAuthenticated) {
        // Otherwise query status endpoint if authenticated
        const statusRes = await fetchJoinRequestStatus(id)
        if (statusRes?.status) {
          setRequestStatus(statusRes.status)
        }
      }
    } catch (err: unknown) {
      console.error('Помилка завантаження організації:', err)
      setError('Не вдалося завантажити профіль організації')
    } finally {
      setIsLoading(false)
    }
  }, [id, isAuthenticated])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Check if current user is owner or member of this organization
  const isMember =
    Boolean(
      organization &&
        user?.organization?.id &&
        String(user.organization.id) === String(organization.id),
    ) || Boolean(organization?.is_user_member)

  const isPending = requestStatus === 'pending'

  // Handle Join button click
  const handleJoinClick = () => {
    if (!isAuthenticated) {
      // Volunteer is not logged in: navigate to login page
      void navigate('/login', { state: { from: location.pathname } })
      return
    }

    if (isPending || isMember) {
      return
    }

    setModalError(null)
    setIsModalOpen(true)
  }

  // Handle modal submit
  const handleJoinSubmit = async (motivation: string) => {
    if (!id) return
    setIsSubmitting(true)
    setModalError(null)

    try {
      await createJoinRequest(id, motivation)
      setRequestStatus('pending')
      setIsModalOpen(false)
      showToast(
        'Заявку на приєднання успішно надіслано! Організація розгляне її найближчим часом.',
        'success',
      )
    } catch (err: unknown) {
      console.error('Помилка подання заявки на приєднання:', err)
      const errorMsg =
        err && typeof err === 'object' && 'response' in err
          ? (
              err as {
                response?: { data?: { detail?: string } | string }
              }
            ).response?.data?.detail ||
            'Не вдалося надіслати заявку. Спробуйте пізніше.'
          : 'Не вдалося надіслати заявку. Спробуйте пізніше.'
      setModalError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-primary" />
        <p className="mt-4 text-sm font-medium text-ink-muted">
          Завантаження профілю організації...
        </p>
      </div>
    )
  }

  if (error || !organization) {
    return (
      <div className="mx-auto max-w-4xl p-6 sm:p-8">
        <div className="rounded-2xl border border-red-100 bg-white p-8 text-center shadow-xs">
          <span className="text-4xl">🏛️</span>
          <h2 className="mt-3 text-xl font-bold text-ink">
            {error || 'Організацію не знайдено'}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Можливо, профіль було видалено або посилання містить помилку.
          </p>
          <div className="mt-6">
            <Link to="/" className="btn btn-primary inline-flex">
              Повернутися на головну
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const cityName =
    organization.city_name ||
    (typeof organization.city === 'string'
      ? organization.city
      : organization.city?.name) ||
    'Місто не вказано'

  const isVerified =
    organization.is_verified || organization.status === 'approved'

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* 1. Навігаційне посилання назад */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-primary transition-colors no-underline"
        >
          <span>←</span>
          <span>На головну</span>
        </Link>
      </div>

      {/* 2. Шапка профілю організації (Header Card) */}
      <section
        data-testid="organization-profile-header"
        className="relative overflow-hidden rounded-2xl border border-sky-100 bg-white p-6 sm:p-8 shadow-xs mb-8"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          {/* Ліва колонка: логотип/аватар та інформація */}
          <div className="flex flex-1 items-start gap-5">
            {/* Аватар організації */}
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5897FB] to-[#3b82f6] text-white font-extrabold text-3xl shadow-sm border border-sky-200"
              aria-label={`Аватар ${organization.name}`}
            >
              {organization.name.trim().charAt(0).toUpperCase()}
            </div>

            {/* Заголовок та метадані */}
            <div className="flex-1">
              {/* Статус верифікації та місто */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {isVerified ? (
                  <span
                    data-testid="verification-status"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200"
                    title="Організація підтверджена модератором"
                  >
                    <svg
                      className="h-3.5 w-3.5 text-emerald-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Верифікована
                  </span>
                ) : organization.status === 'pending' ? (
                  <span
                    data-testid="verification-status"
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200"
                  >
                    На перевірці
                  </span>
                ) : (
                  <span
                    data-testid="verification-status"
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700"
                  >
                    {organization.status}
                  </span>
                )}

                {/* Місто */}
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 border border-sky-100">
                  <span aria-hidden="true">📍</span>
                  <span>{cityName}</span>
                </span>
              </div>

              {/* Назва організації */}
              <h1 className="text-2xl font-bold text-ink sm:text-3xl leading-tight mb-3">
                {organization.name}
              </h1>

              {/* Контакти */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
                {organization.email && (
                  <a
                    href={`mailto:${organization.email}`}
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                    title="Написати email"
                  >
                    <span aria-hidden="true">✉️</span>
                    <span>{organization.email}</span>
                  </a>
                )}
                {organization.phone && (
                  <a
                    href={`tel:${organization.phone}`}
                    className="inline-flex items-center gap-1.5 text-ink hover:text-primary transition-colors"
                    title="Зателефонувати"
                  >
                    <span aria-hidden="true">📞</span>
                    <span>{formatPhone(organization.phone)}</span>
                  </a>
                )}
                {organization.edrpou && (
                  <span className="inline-flex items-center gap-1 text-gray-500 text-xs">
                    <span aria-hidden="true">🏢</span>
                    <span>ЄДРПОУ: {organization.edrpou}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Права колонка: Кнопка дії "Join" / "Request Sent" */}
          <div className="shrink-0 flex items-center md:items-start pt-2 md:pt-0">
            {isMember ? (
              <button
                type="button"
                disabled
                className="rounded-xl bg-gray-100 border border-gray-200 px-6 py-2.5 text-sm font-semibold text-gray-500 cursor-not-allowed"
                title="Ви вже є учасником цієї організації"
              >
                Ви є учасником
              </button>
            ) : isPending ? (
              <button
                type="button"
                disabled
                data-testid="join-button"
                aria-label="Request Sent"
                className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-300 px-6 py-2.5 text-sm font-semibold text-emerald-800 shadow-xs cursor-not-allowed"
              >
                <svg
                  className="h-4 w-4 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Request Sent</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleJoinClick}
                data-testid="join-button"
                aria-label="Join"
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover active:scale-95 transition-all cursor-pointer"
              >
                <span aria-hidden="true">🤝</span>
                <span>Join</span>
              </button>
            )}
          </div>
        </div>

        {/* Опис організації */}
        <div className="mt-6 pt-6 border-t border-sky-100">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-2">
            Про організацію
          </h2>
          <p className="text-base text-ink leading-relaxed whitespace-pre-line">
            {organization.description ||
              'Організація ще не додала детального опису своєї діяльності.'}
          </p>
        </div>
      </section>

      {/* 3. Секція "Проєкти організації" (reusing ProjectCard) */}
      <section data-testid="organization-projects-section" className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-ink sm:text-2xl">
              Проєкти організації
            </h2>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
              {formatProjectsCount(projects.length)}
            </span>
          </div>
        </div>

        {projects.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={{
                  ...project,
                  organization: project.organization || organization.name,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 p-8 text-center">
            <span className="text-3xl" aria-hidden="true">
              📋
            </span>
            <h3 className="mt-2 text-base font-semibold text-ink">
              У цієї організації поки немає відкритих проєктів
            </h3>
            <p className="mt-1 text-sm text-ink-muted max-w-md mx-auto">
              Організація ще не опублікувала актуальних волонтерських потреб. Ви
              можете подати заявку на вступ, щоб долучитися до майбутніх ініціатив.
            </p>
          </div>
        )}
      </section>

      {/* 4. Модальне вікно подання заявки */}
      <JoinRequestModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleJoinSubmit}
        organizationName={organization.name}
        isSubmitting={isSubmitting}
        error={modalError}
      />
    </div>
  )
}

export default OrganizationViewPage
