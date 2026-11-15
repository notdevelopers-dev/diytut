import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/components/feedback'
import { useAuth } from '@/features/auth/hooks'
import { useCities } from '@/features/cities/hooks'
import { JoinButton } from '@/features/organizations/components/JoinButton'
import type { JoinState } from '@/features/organizations/components/JoinButton'
import { JoinRequestModal } from '@/features/organizations/components/JoinRequestModal'
import {
  useCreateJoinRequest,
  useMyJoinRequest,
  useMyOrganizations,
  useOrganization,
} from '@/features/organizations/hooks'
import { ProjectCard } from '@/features/projects/components/ProjectCard'
import { getErrorStatus } from '@/lib/errors'

/** Публічна сторінка організації за макетом Figma («Public org page»). */
export const OrganizationViewPage = () => {
  const { id } = useParams()
  const organizationId = Number(id)
  const navigate = useNavigate()
  const { showToast } = useToast()
  const {
    isAuthenticated,
    isProfileComplete,
    isLoading: isAuthLoading,
  } = useAuth()

  const [isModalOpen, setIsModalOpen] = useState(false)

  const {
    data: organization,
    isLoading,
    error,
    refetch,
  } = useOrganization(organizationId)
  const { cities } = useCities()

  // Заявки й членства має лише користувач із заповненою анкетою
  const canHaveRequests = isAuthenticated && isProfileComplete
  const { data: memberships, isLoading: isMembershipsLoading } =
    useMyOrganizations(canHaveRequests)
  const { data: joinRequest, isLoading: isJoinRequestLoading } =
    useMyJoinRequest(organizationId, canHaveRequests && Boolean(organization))
  const createJoinRequest = useCreateJoinRequest(organizationId)

  const cityNames = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  )

  const joinState: JoinState = (() => {
    if (memberships?.some((m) => m.id === organizationId)) return 'member'
    switch (joinRequest?.status) {
      case 'pending':
        return 'pending'
      case 'accepted':
        return 'member'
      case 'rejected':
        return 'rejected'
      default:
        return 'default'
    }
  })()

  const isJoinStateLoading =
    isAuthLoading ||
    (canHaveRequests && (isMembershipsLoading || isJoinRequestLoading))

  const handleJoinClick = () => {
    // Не увійшов — на сторінку входу; анкету не заповнив — спершу анкета
    if (!isAuthenticated) {
      void navigate('/login')
      return
    }
    if (!isProfileComplete) {
      void navigate('/register/complete')
      return
    }
    createJoinRequest.reset()
    setIsModalOpen(true)
  }

  const handleSubmit = (message: string) => {
    createJoinRequest.mutate(message, {
      onSuccess: () => {
        setIsModalOpen(false)
        showToast('Запит на приєднання надіслано')
      },
    })
  }

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        className="mx-auto w-full max-w-5xl animate-pulse px-3 py-4 sm:px-4 sm:py-6"
      >
        <div className="mx-auto mb-5 h-12 w-full max-w-[405px] rounded-[11px] bg-[#DCECFF]" />
        <div className="h-16 rounded-[5px] bg-[#DCECFF]" />
      </div>
    )
  }

  if (error || !organization) {
    const notFound = getErrorStatus(error) === 404 || !organizationId
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-8 sm:px-4">
        <div
          data-testid={notFound ? 'not-found-state' : 'error-state'}
          className={`rounded-[5px] border p-8 text-center ${
            notFound ? 'border-main bg-[#DCECFF]' : 'border-red-300 bg-red-50'
          }`}
        >
          <p className="mb-1 text-base font-bold text-black">
            {notFound
              ? 'Організацію не знайдено'
              : 'Не вдалося завантажити організацію'}
          </p>
          <p className="mb-4 text-sm text-black/70">
            {notFound
              ? 'Можливо, її ще не перевірено або посилання застаріло.'
              : 'Перевірте з’єднання й спробуйте ще раз.'}
          </p>
          {notFound ? (
            <Link
              to="/organizations"
              className="inline-block rounded-[5px] bg-main px-4 py-2 text-sm text-black no-underline hover:bg-main-hover"
            >
              До каталогу організацій
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void refetch()}
              className="cursor-pointer rounded-[5px] bg-main px-4 py-2 text-sm text-black hover:bg-main-hover"
            >
              Спробувати знову
            </button>
          )}
        </div>
      </div>
    )
  }

  const cityName = cityNames.get(organization.city_id)

  return (
    <div
      data-testid="organization-view-page"
      className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6"
    >
      {/* Профіль: назва, перевірка, місто, опис і кнопка вступу */}
      <section aria-labelledby="organization-name">
        <div className="mx-auto mb-4 w-full max-w-[405px] text-center">
          <h1
            id="organization-name"
            className="rounded-[11px] border border-[#DCECFF] px-4 py-1.5 font-head text-2xl font-normal break-words text-black"
          >
            {organization.name}
          </h1>
          {/* Сторінку бачать лише схвалені організації, тож статус завжди «перевірена» */}
          <p className="mt-1 inline-flex items-center gap-1 rounded-[5px] bg-[#B5F291] px-2 py-0.5 text-[11px] text-black">
            ✓ Перевірена організація
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex flex-col gap-3 sm:w-[192px] sm:shrink-0">
            <p className="rounded-[5px] border border-[#DCECFF] px-2 text-center text-[11px] text-black">
              {cityName ?? 'Місто не вказано'}
            </p>
            <div className="hidden sm:block">
              <JoinButton
                state={joinState}
                isLoading={isJoinStateLoading}
                onClick={handleJoinClick}
              />
            </div>
          </div>

          <p
            className={`min-h-[57px] flex-1 rounded-[5px] border border-[#DCECFF] px-2.5 py-1 text-xs break-words whitespace-pre-line ${
              organization.description ? 'text-black' : 'text-black/50'
            }`}
          >
            {organization.description || 'Опис відсутній'}
          </p>

          {/* На мобільному кнопка під описом, праворуч — як у макеті */}
          <div className="self-end sm:hidden">
            <JoinButton
              state={joinState}
              isLoading={isJoinStateLoading}
              onClick={handleJoinClick}
            />
          </div>
        </div>
      </section>

      {/* Проєкти організації */}
      <section
        aria-labelledby="organization-projects"
        className="mt-4 border-t-2 border-[#DCECFF] pt-1"
      >
        <h2
          id="organization-projects"
          className="mb-6 text-2xl font-normal text-black sm:text-center"
        >
          Проєкти
        </h2>

        {organization.projects.length === 0 ? (
          <p
            data-testid="projects-empty"
            className="rounded-[5px] border border-main bg-[#DCECFF] p-6 text-center text-sm text-black/70"
          >
            Організація ще не опублікувала проєктів.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {organization.projects.map((project) => (
              <li key={project.id}>
                <ProjectCard
                  project={project}
                  showOrganization={false}
                  cityName={
                    project.city_id !== null
                      ? cityNames.get(project.city_id)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Контакти: у макеті смуга внизу сторінки */}
      <section
        aria-label="Контакти"
        className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
      >
        <p className="rounded-[5px] border border-main bg-[#DCECFF] px-4 py-0.5 text-center text-xs font-medium text-black sm:w-[163px]">
          Контакти
        </p>
        <a
          href={`mailto:${organization.email}`}
          className="truncate rounded-[5px] border border-main bg-[#DCECFF] px-4 py-0.5 text-center text-xs font-medium text-black/70 no-underline hover:text-black sm:min-w-[275px]"
        >
          {organization.email}
        </a>
        <a
          href={`tel:${organization.phone}`}
          className="rounded-[5px] border border-main bg-[#DCECFF] px-4 py-0.5 text-center text-xs font-medium text-black/70 no-underline hover:text-black sm:min-w-[147px]"
        >
          {organization.phone}
        </a>
      </section>

      {isModalOpen && (
        <JoinRequestModal
          organizationName={organization.name}
          isSubmitting={createJoinRequest.isPending}
          error={createJoinRequest.error}
          onSubmit={handleSubmit}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  )
}

export default OrganizationViewPage
