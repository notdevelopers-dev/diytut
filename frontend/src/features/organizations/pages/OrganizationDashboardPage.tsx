import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import circlePlusIcon from '@/assets/icons/organization/circle-plus.svg'
import { useAuth } from '@/features/auth/hooks'
import { useCities } from '@/features/cities/hooks'
import { MembersSection } from '@/features/organizations/components/dashboard/MembersSection'
import { RequestsSection } from '@/features/organizations/components/dashboard/RequestsSection'
import {
  EmptyState,
  SearchField,
  SectionTitle,
  SoonButton,
} from '@/features/organizations/components/dashboard/shared'
import {
  useIncomingJoinRequests,
  useMyOrganization,
  useOrganization,
} from '@/features/organizations/hooks'
import {
  ProjectCard,
  ProjectCardSkeleton,
} from '@/features/projects/components/ProjectCard'
import { useCategories } from '@/features/projects/hooks'

export type DashboardTab = 'projects' | 'members' | 'requests'

const TABS: DashboardTab[] = ['projects', 'members', 'requests']

/**
 * Панель організації (SCRUM-131, /organization/dashboard). Розділи «Проєкти»,
 * «Учасники» й «Вхідні запити» перемикають кнопки в шапці (?tab=… в URL); кожен
 * розділ — за своїм макетом Figma. Редагування організації — з її профілю.
 */
export const OrganizationDashboardPage = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as DashboardTab | null
  const tab: DashboardTab =
    tabParam && TABS.includes(tabParam) ? tabParam : 'projects'

  const membership = user?.organization
  const { data: myOrg, isLoading, isError } = useMyOrganization(true)
  const status = myOrg?.status ?? membership?.status
  const isApproved = status === 'approved'
  // У даних входу id може прийти рядком
  const orgId = myOrg?.id ?? (membership ? Number(membership.id) : undefined)
  // Опубліковані проєкти є лише в публічній картці схваленої організації
  const { data: detail, isLoading: isProjectsLoading } = useOrganization(
    isApproved && orgId ? orgId : 0,
  )
  const canReview = membership?.role === 'owner' || membership?.role === 'admin'
  const {
    data: requests = [],
    isLoading: isRequestsLoading,
    isError: isRequestsError,
  } = useIncomingJoinRequests(orgId, canReview)

  const { cities } = useCities()
  const { data: categoryItems = [] } = useCategories()
  const cityNames = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  )
  const categoryNames = useMemo(
    () => new Map(categoryItems.map((item) => [item.key, item.name])),
    [categoryItems],
  )
  const projects = useMemo(() => detail?.projects ?? [], [detail])
  const [projectSearch, setProjectSearch] = useState('')
  const visibleProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase()
    return q
      ? projects.filter((p) =>
          [p.title, p.description ?? '', ...(p.tags ?? [])].some((v) =>
            v.toLowerCase().includes(q),
          ),
        )
      : projects
  }, [projects, projectSearch])

  return (
    <div className="flex flex-col">
      {tab === 'members' && (
        <MembersSection
          role={membership?.role}
          canReview={canReview}
          requestsCount={requests.length}
        />
      )}

      {tab === 'requests' && (
        <RequestsSection
          requests={requests}
          canReview={canReview}
          isLoading={isRequestsLoading}
          isError={isRequestsError}
        />
      )}

      {tab === 'projects' && (
        <section aria-label="Проєкти організації" className="flex flex-col">
          <SectionTitle>Проєкти</SectionTitle>
          <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5 px-3 py-4 sm:px-6">
            {isError ? (
              <p className="rounded-[5px] border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
                Не вдалося завантажити дані організації. Оновіть сторінку.
              </p>
            ) : !isLoading && status === 'pending' ? (
              <p className="rounded-[5px] border border-info bg-[#FFF8E6] p-3 text-sm text-black">
                Організація на перевірці. Після схвалення адміністратором вона
                з’явиться в каталозі, а ви зможете публікувати проєкти.
              </p>
            ) : !isLoading && status === 'rejected' ? (
              <p className="rounded-[5px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Організацію відхилено. Виправте дані в профілі організації, щоб
                подати її на перевірку знову.
              </p>
            ) : null}
            {/* Пошук ліворуч, «Створити проєкт» праворуч — як у макеті */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SearchField
                value={projectSearch}
                onChange={setProjectSearch}
                placeholder="Пошук проєкту"
              />
              {/* Форма створення — FE-202 (SCRUM-132) */}
              <SoonButton iconSrc={circlePlusIcon}>Створити проєкт</SoonButton>
            </div>
            {!isApproved ? (
              <EmptyState
                title="Проєктів поки немає"
                text="Проєкти з’являться після схвалення організації адміністратором платформи."
              />
            ) : isProjectsLoading ? (
              <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {[0, 1, 2].map((i) => (
                  <li key={i}>
                    <ProjectCardSkeleton />
                  </li>
                ))}
              </ul>
            ) : projects.length > 0 && visibleProjects.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#8B99AA]">
                Нічого не знайдено
              </p>
            ) : projects.length === 0 ? (
              <EmptyState
                title="Ще немає опублікованих проєктів"
                text="Тут з’являться проєкти вашої організації. Чернетки, завершені й скасовані проєкти буде видно, щойно їх почне віддавати бекенд."
              />
            ) : (
              <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {visibleProjects.map((project) => (
                  <li key={project.id}>
                    <ProjectCard
                      project={project}
                      showOrganization={false}
                      categoryNames={categoryNames}
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
          </div>
        </section>
      )}
    </div>
  )
}

export default OrganizationDashboardPage
