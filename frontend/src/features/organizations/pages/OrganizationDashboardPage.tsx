import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import circlePlusIcon from '@/assets/icons/organization/circle-plus.svg'
import { useAuth } from '@/features/auth/hooks'
import { useCities } from '@/features/cities/hooks'
import { MembersSection } from '@/features/organizations/components/dashboard/MembersSection'
import { RequestsSection } from '@/features/organizations/components/dashboard/RequestsSection'
import {
  EmptyState,
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
import type { ProjectStatus } from '@/types/project'

export type DashboardTab = 'projects' | 'members' | 'requests'

const TABS: DashboardTab[] = ['projects', 'members', 'requests']

const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: string }> = {
  draft: { label: 'Чернетка', tone: 'border-[#C2D4EA] text-[#5F6F82]' },
  published: {
    label: 'Опубліковано',
    tone: 'border-[#7BC74D] bg-[#E9F9DD] text-[#3E7A1C]',
  },
  completed: {
    label: 'Завершено',
    tone: 'border-main bg-[#DCECFF] text-[#2f6fb8]',
  },
  cancelled: {
    label: 'Скасовано',
    tone: 'border-[#E14848] bg-[#FDECEC] text-[#B42323]',
  },
}

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
  const projects = detail?.projects ?? []

  return (
    <div className="flex flex-col">
      {tab === 'members' && <MembersSection role={membership?.role} />}

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
          <SectionTitle>Проєкти організації</SectionTitle>
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-3 py-4 sm:px-6">
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
            <div className="flex justify-end">
              {/* Форма створення — FE-202 (SCRUM-132) */}
              <SoonButton iconSrc={circlePlusIcon}>Створити проєкт</SoonButton>
            </div>
            {!isApproved ? (
              <EmptyState
                title="Проєктів поки немає"
                text="Проєкти з’являться після схвалення організації адміністратором платформи."
              />
            ) : isProjectsLoading ? (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <li key={i}>
                    <ProjectCardSkeleton />
                  </li>
                ))}
              </ul>
            ) : projects.length === 0 ? (
              <EmptyState
                title="Ще немає опублікованих проєктів"
                text="Тут з’являться проєкти вашої організації. Чернетки, завершені й скасовані проєкти буде видно, щойно їх почне віддавати бекенд."
              />
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => {
                  const projectStatus =
                    PROJECT_STATUS[project.status] ?? PROJECT_STATUS.published
                  return (
                    <li key={project.id} className="flex flex-col gap-2">
                      <span
                        className={`w-fit rounded-full border px-3 py-0.5 text-xs font-medium ${projectStatus.tone}`}
                      >
                        {projectStatus.label}
                      </span>
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
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default OrganizationDashboardPage
