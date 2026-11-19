import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import organizationIcon from '@/assets/icons/menu/organization.svg'
import { useAuth } from '@/features/auth/hooks'
import { useCities } from '@/features/cities/hooks'
import {
  useIncomingJoinRequests,
  useMyOrganization,
  useOrganization,
} from '@/features/organizations/hooks'
import {
  canEditOrganization,
  getOrgRoleLabel,
  getOrgStatusLabel,
} from '@/features/organizations/utils'
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

/** Неактивна кнопка «скоро»: дія з’явиться разом із бекендом або своєю задачею */
const SoonButton = ({ children }: { children: ReactNode }) => (
  <button
    type="button"
    disabled
    title="Скоро"
    className="flex h-10 cursor-not-allowed items-center gap-2 rounded-full border border-main/40 bg-[#DCECFF] px-5 text-sm font-medium text-black opacity-60"
  >
    {children}
    <span className="rounded-full bg-white px-2 text-[11px] text-[#8B99AA]">
      скоро
    </span>
  </button>
)

/** Порожній стан / заглушка вкладки (DES-103: порожні стани для всіх вкладок) */
const EmptyState = ({
  title,
  text,
  children,
}: {
  title: string
  text: string
  children?: ReactNode
}) => (
  <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#DCECFF] bg-white px-6 py-12 text-center">
    <h3 className="text-lg font-semibold text-black">{title}</h3>
    <p className="max-w-md text-sm text-[#5F6F82]">{text}</p>
    {children}
  </div>
)

/**
 * Кабінет організації (SCRUM-131, /organization/dashboard): розділи «Проєкти»,
 * «Учасники» (кнопки в шапці) і «Вхідні запити» (кнопка в картці), ?tab=… в URL.
 * Бекенд поки віддає лише опубліковані проєкти схваленої організації й заявки,
 * що чекають розгляду; список учасників з’явиться з бекендом наступного спринту.
 */
export const OrganizationDashboardPage = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as DashboardTab | null
  const tab: DashboardTab =
    tabParam && TABS.includes(tabParam) ? tabParam : 'projects'

  const membership = user?.organization
  const { data: myOrg, isLoading, isError } = useMyOrganization(true)
  const isApproved = (myOrg?.status ?? membership?.status) === 'approved'
  // У даних входу id може прийти рядком
  const orgId = myOrg?.id ?? (membership ? Number(membership.id) : undefined)
  // Публічна картка зі списком опублікованих проєктів є лише у схваленої організації
  const { data: detail, isLoading: isProjectsLoading } = useOrganization(
    isApproved && orgId ? orgId : 0,
  )
  const canReview = membership?.role === 'owner' || membership?.role === 'admin'
  const { data: requests, isError: isRequestsError } = useIncomingJoinRequests(
    orgId,
    canReview,
  )

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
  const requestsCount = requests?.length ?? 0
  const status = myOrg?.status ?? membership?.status

  return (
    <div className="flex flex-col">
      <div className="border-y border-info bg-cream px-3 py-1 sm:px-8">
        <h1 className="text-3xl font-normal text-black">Панель організації</h1>
      </div>

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 sm:px-8">
        {/* Організація: назва, статус, роль */}
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-[#DCECFF] bg-white p-5 sm:flex-row sm:items-center">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-main">
            <img
              src={organizationIcon}
              alt=""
              width={34}
              height={34}
              className="brightness-0 invert"
            />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="truncate text-xl font-bold text-black">
              {myOrg?.name ?? membership?.name}
            </span>
            <div className="flex flex-wrap gap-2 text-xs">
              {getOrgStatusLabel(status) && (
                <span className="rounded-full border border-[#C2D4EA] bg-white px-3 py-0.5 text-black">
                  {getOrgStatusLabel(status)}
                </span>
              )}
              <span className="rounded-full border border-main bg-[#DCECFF] px-3 py-0.5 text-main">
                Ваша роль: {getOrgRoleLabel(membership?.role)}
              </span>
            </div>
          </div>
          {/* Розділи панелі перемикаються кнопками в шапці; заявки — окремою кнопкою */}
          {canReview && (
            <button
              type="button"
              onClick={() =>
                setSearchParams({ tab: 'requests' }, { replace: true })
              }
              aria-current={tab === 'requests' ? 'page' : undefined}
              className={`flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-5 text-sm font-medium transition-colors ${
                tab === 'requests'
                  ? 'border-main bg-main text-white'
                  : 'border-main/40 bg-[#DCECFF] text-black hover:bg-[#cde2fe]'
              }`}
            >
              Вхідні запити
              {requestsCount > 0 && (
                <span className="rounded-full bg-[#E14848] px-1.5 text-xs text-white">
                  {requestsCount}
                </span>
              )}
            </button>
          )}
          {canEditOrganization(membership) && (
            <button
              type="button"
              onClick={() => void navigate('/organization/edit')}
              className="h-10 shrink-0 cursor-pointer rounded-full border border-main/40 bg-[#DCECFF] px-5 text-sm font-medium text-black transition-colors hover:bg-[#cde2fe]"
            >
              Редагувати організацію
            </button>
          )}
        </div>

        {isError && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
            Не вдалося завантажити дані організації. Оновіть сторінку.
          </p>
        )}
        {!isLoading && status === 'pending' && (
          <p className="rounded-lg border border-info bg-[#FFF8E6] p-3 text-sm text-black">
            Організація на перевірці. Після схвалення адміністратором вона
            з’явиться в каталозі, а ви зможете публікувати проєкти.
          </p>
        )}
        {!isLoading && status === 'rejected' && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Організацію відхилено. Виправте дані в «Редагувати організацію», щоб
            подати її на перевірку знову.
          </p>
        )}

        {tab === 'projects' && (
          <section aria-label="Проєкти" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-black">
                Створені проєкти
              </h2>
              {/* Форма створення — FE-202 (SCRUM-132) */}
              <SoonButton>＋ Створити проєкт</SoonButton>
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
          </section>
        )}

        {tab === 'members' && (
          <section aria-label="Учасники" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-black">
                Учасники організації
              </h2>
              <SoonButton>＋ Запросити учасників</SoonButton>
            </div>
            <EmptyState
              title="Список учасників скоро з’явиться"
              text="Тут буде склад організації: ролі (власник, адміністратор, учасник), дата вступу, контакти й керування правами."
            >
              {membership && (
                <p className="rounded-full bg-[#DCECFF] px-4 py-1.5 text-sm text-black">
                  Ви в цій організації: {getOrgRoleLabel(membership.role)}
                </p>
              )}
            </EmptyState>
          </section>
        )}

        {tab === 'requests' && (
          <section aria-label="Вхідні запити" className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-black">Вхідні запити</h2>
            {!canReview ? (
              <EmptyState
                title="Розгляд заявок недоступний"
                text="Заявки на вступ розглядають власник і адміністратори організації."
              />
            ) : (
              <EmptyState
                title="Розгляд заявок скоро з’явиться"
                text={
                  isRequestsError
                    ? 'Не вдалося дізнатися кількість заявок.'
                    : requestsCount > 0
                      ? `Зараз на розгляд чекає заявок: ${requestsCount}. Скоро тут можна буде приймати й відхиляти їх.`
                      : 'Нових заявок на вступ немає. Скоро тут можна буде приймати й відхиляти їх.'
                }
              />
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default OrganizationDashboardPage
