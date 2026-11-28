import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import calendarIcon from '@/assets/icons/project/calendar.svg'
import lockIcon from '@/assets/icons/project/lock.svg'
import lockOpenIcon from '@/assets/icons/project/lock-open.svg'
import placeIcon from '@/assets/icons/project/place.svg'
import timeIcon from '@/assets/icons/project/time.svg'
import cameraIcon from '@/assets/icons/camera.svg'
import { useAuth } from '@/features/auth/hooks'
import { useCities } from '@/features/cities/hooks'
import {
  useMyOrganizations,
  useOrganization,
} from '@/features/organizations/hooks'
import { ProjectJoinAction } from '@/features/projects/components/ProjectJoinAction'
import {
  useCategories,
  useMyProjectRequestStatuses,
  useProject,
} from '@/features/projects/hooks'
import {
  EXPERIENCE_LABELS,
  formatEventDays,
  formatEventTime,
  formatWorkHours,
  projectsCatalogUrl,
} from '@/features/projects/utils'
import { getErrorStatus } from '@/lib/errors'
import type { ProjectDetail, ProjectStatus } from '@/types/project'

/**
 * Поля відповіді, які бекенд додає разом із приховуванням часу й місця (SCRUM-175,
 * R-22). Поки їх немає, дні беремо зі starts_at/ends_at, а приховуємо на фронтенді.
 */
type ProjectWithEventDays = ProjectDetail &
  Partial<{
    starts_on: string | null
    ends_on: string | null
    details_hidden: boolean
  }>

/** Позначка для проєкту, на який заявки вже не приймаються */
const STATUS_NOTES: Partial<Record<ProjectStatus, string>> = {
  draft: 'Чернетка: проєкт бачать лише учасники організації',
  completed: 'Проєкт завершено',
  cancelled: 'Проєкт скасовано',
}

const boxClass = 'rounded-[5px] border border-[#DCECFF]'

/** Сторінка проєкту /projects/:id за макетом Figma «Project public page» (SCRUM-147). */
export const ProjectViewPage = () => {
  const { id } = useParams()
  const projectId = Number(id)
  const {
    isAuthenticated,
    isProfileComplete,
    isLoading: isAuthLoading,
  } = useAuth()
  const canHaveRequests = isAuthenticated && isProfileComplete

  const {
    data: fetchedProject,
    isLoading,
    error,
    refetch,
  } = useProject(Number.isInteger(projectId) ? projectId : 0)
  const project = fetchedProject as ProjectWithEventDays | undefined
  const { data: organization } = useOrganization(project?.organization_id ?? 0)
  const { cities } = useCities()
  const { data: categoryItems = [] } = useCategories()
  const { data: memberships, isLoading: isMembershipsLoading } =
    useMyOrganizations(canHaveRequests)
  const joinStatuses = useMyProjectRequestStatuses(project ? [project.id] : [])

  const categoryNames = useMemo(
    () => new Map(categoryItems.map((item) => [item.key, item.name])),
    [categoryItems],
  )

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        className="mx-auto w-full max-w-5xl animate-pulse px-3 py-4 sm:px-4 sm:py-6"
      >
        <div className="grid gap-4 md:grid-cols-[213px_1fr_223px]">
          <div className="h-[216px] rounded-[5px] bg-[#DCECFF]" />
          <div className="h-[139px] rounded-[5px] bg-[#DCECFF]" />
          <div className="h-[216px] rounded-[5px] bg-[#DCECFF]" />
        </div>
      </div>
    )
  }

  if (error || !project) {
    // Чернетку чужої організації бекенд віддає як 404, як і неіснуючий проєкт
    const notFound = getErrorStatus(error) === 404 || !(projectId > 0)
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-8 sm:px-4">
        <div
          data-testid={notFound ? 'not-found-state' : 'error-state'}
          className={`rounded-[5px] border p-8 text-center ${
            notFound ? 'border-main bg-[#DCECFF]' : 'border-red-300 bg-red-50'
          }`}
        >
          <p className="mb-1 text-base font-bold text-black">
            {notFound ? 'Проєкт не знайдено' : 'Не вдалося завантажити проєкт'}
          </p>
          <p className="mb-4 text-sm text-black/70">
            {notFound
              ? 'Можливо, його ще не опубліковано або посилання застаріло.'
              : 'Перевірте з’єднання й спробуйте ще раз.'}
          </p>
          {notFound ? (
            <Link
              to="/projects"
              className="inline-block rounded-[5px] bg-main px-4 py-2 text-sm text-black no-underline hover:bg-main-hover"
            >
              До каталогу проєктів
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

  const membership = canHaveRequests
    ? memberships?.find((m) => m.id === project.organization_id)
    : undefined
  const joinStatus = joinStatuses.statuses.get(project.id) ?? null
  // Точні час і місце (R-22) бачать учасники організації й прийняті волонтери; так
  // само їх приховує бекенд (details_hidden), коли повертає null
  const showDetails =
    project.details_hidden === undefined
      ? Boolean(membership) || joinStatus?.status === 'accepted'
      : !project.details_hidden
  const isOrganizer =
    membership?.role === 'owner' || membership?.role === 'admin'
  const statusNote = STATUS_NOTES[project.status]
  const isJoinLoading =
    isAuthLoading ||
    (canHaveRequests && (isMembershipsLoading || joinStatuses.isLoading))

  const days = formatEventDays(
    project.starts_on ?? project.starts_at,
    project.ends_on ?? project.ends_at,
  )
  const time = formatEventTime(project.starts_at, project.ends_at)
  const workHours = formatWorkHours(project.volunteer_hours)
  const cityName = cities.find((city) => city.id === project.city_id)?.name
  const place = project.is_online
    ? 'Онлайн'
    : [cityName, project.address].filter(Boolean).join(', ')
  const organizationName = organization?.name

  const joinAction = (() => {
    if (statusNote) return null
    // Організатори не подають заявок на свій проєкт (бекенд відповідає 409)
    if (isOrganizer) {
      return (
        <p className="mx-auto flex h-8 w-full max-w-[185px] items-center justify-center rounded-[11px] bg-[#B5F291] text-sm text-black">
          Ви організатор
        </p>
      )
    }
    return (
      <ProjectJoinAction
        projectId={project.id}
        projectTitle={project.title}
        status={joinStatus}
        isLoading={isJoinLoading}
        variant="page"
      />
    )
  })()

  return (
    <div
      data-testid="project-view-page"
      className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6"
    >
      {statusNote && (
        <p
          data-testid="project-status-note"
          className="rounded-[5px] border border-main bg-[#DCECFF] px-3 py-2 text-center text-sm text-black"
        >
          {statusNote}
        </p>
      )}

      <section
        aria-labelledby="project-title"
        className="grid gap-4 md:grid-cols-[213px_minmax(0,1fr)_223px] md:items-start"
      >
        {/* Ліва колонка: назва, організація, дата, тривалість, вимоги й сфери */}
        <div className="flex min-w-0 flex-col gap-2">
          <h1
            id="project-title"
            className="rounded-[5px] bg-[#DCECFF] px-3 py-1 text-center text-xl font-normal break-words text-black"
          >
            {project.title}
          </h1>
          <Link
            to={`/organizations/${project.organization_id}`}
            title="Сторінка організації"
            className={`${boxClass} truncate px-2 py-0.5 text-center text-base text-black no-underline hover:bg-white hover:underline`}
          >
            {organizationName ?? 'Організація'}
          </Link>
          {days && (
            <p
              className={`${boxClass} flex items-center gap-2 px-2 py-0.5 text-[15px] text-black`}
            >
              <img src={calendarIcon} alt="" width={24} height={24} />
              <span className="min-w-0 flex-1 text-center">{days}</span>
            </p>
          )}
          {workHours && (
            <p className="flex items-center justify-between gap-2 text-[10px] text-black">
              Тривалість роботи
              <span className={`${boxClass} px-3`}>{workHours}</span>
            </p>
          )}
          <ul className="flex flex-wrap gap-2" aria-label="Вимоги">
            {project.is_adult_only && (
              <li className="rounded-[5px] border border-[#E14848] px-7 text-base leading-[19px] text-black">
                18+
              </li>
            )}
            <li
              className={`${boxClass} px-3 text-xs leading-[19px] text-black`}
            >
              Рівень: {EXPERIENCE_LABELS[project.experience_level]}
            </li>
          </ul>
        </div>

        {/* Фото: поки статична заглушка, завантаження фото ще в розробці (SCRUM-172) */}
        <div className="flex h-[139px] items-center justify-center rounded-[5px] border border-[#8B99AA] bg-[#C2D4EA] md:mt-[37px]">
          <img src={cameraIcon} alt="" width={75} height={75} />
        </div>

        {/* Час і місце: замок для всіх, крім учасників (R-22), і кнопка участі */}
        <aside
          aria-label="Час і місце"
          data-testid="project-details"
          data-state={showDetails ? 'visible' : 'hidden'}
          className="flex flex-col items-center gap-3 rounded-[5px] border border-main bg-[#DCECFF] px-[18px] py-3"
        >
          <img
            src={showDetails ? lockOpenIcon : lockIcon}
            alt=""
            width={showDetails ? 62 : 59}
            height={showDetails ? 62 : 59}
          />
          {showDetails ? (
            <div className="flex w-full flex-col gap-2 text-sm text-black">
              {time && (
                <p className="flex items-center gap-3 rounded-[5px] bg-[#F7FBFF] px-1.5 py-1">
                  <img src={timeIcon} alt="" width={19} height={19} />
                  {time}
                </p>
              )}
              {place && (
                <p className="flex items-start gap-2 rounded-[5px] bg-[#F7FBFF] px-1.5 py-1 break-words">
                  <img
                    src={placeIcon}
                    alt=""
                    width={16}
                    height={16}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0">{place}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-center text-[15px] text-black">
              Точний час та місце після підтвердження
              {!project.is_online && cityName && (
                <span className="mt-1 block text-xs text-[#5F6F82]">
                  {cityName}
                </span>
              )}
              {project.is_online && (
                <span className="mt-1 block text-xs text-[#5F6F82]">
                  Онлайн
                </span>
              )}
            </p>
          )}
          {joinAction && <div className="w-full">{joinAction}</div>}
        </aside>

        {/* Сфери під фото, як у макеті */}
        {project.categories.length > 0 && (
          <ul className="flex flex-wrap gap-2 md:col-span-2" aria-label="Сфери">
            {project.categories.map((category) => (
              <li key={category}>
                <Link
                  to={projectsCatalogUrl({ category })}
                  title="Показати проєкти цієї сфери"
                  className={`${boxClass} block px-6 py-1 text-xs font-medium text-black no-underline hover:bg-white`}
                >
                  {categoryNames.get(category) ?? category}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="-mx-3 border-0 border-t-2 border-[#DCECFF] sm:-mx-4" />

      <section
        aria-label="Опис"
        className="flex flex-col gap-1 md:max-w-[673px]"
      >
        <div
          className={`${boxClass} min-h-[57px] px-2.5 py-1 text-[11px] break-words whitespace-pre-line text-black`}
        >
          {project.description || (
            <span className="text-[#8B99AA]">Опису ще немає</span>
          )}
        </div>
        {project.tags.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Хештеги">
            {project.tags.map((tag) => (
              <li key={tag}>
                <Link
                  to={projectsCatalogUrl({ tag })}
                  title="Показати проєкти з цим хештегом"
                  className="text-xs text-[#8B99AA] no-underline hover:text-black hover:underline"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Контакти організації внизу сторінки */}
      {organization && (
        <section
          aria-label="Контакти"
          className="-mx-3 -mb-4 flex flex-col gap-2 border-t-2 border-info bg-[#DCECFF] px-3 py-3 sm:-mx-4 sm:-mb-6 sm:flex-row sm:items-center sm:gap-3 sm:px-[51px]"
        >
          <p className="rounded-[5px] border border-main px-4 text-center text-xs leading-[20px] text-black sm:w-[163px]">
            Контакти
          </p>
          <a
            href={`mailto:${organization.email}`}
            className="truncate rounded-[5px] border border-main px-4 text-xs leading-[20px] font-medium text-[#5F6F82] no-underline hover:text-black sm:w-[275px]"
          >
            {organization.email}
          </a>
          <a
            href={`tel:${organization.phone}`}
            className="truncate rounded-[5px] border border-main px-4 text-xs leading-[20px] font-medium text-[#5F6F82] no-underline hover:text-black sm:w-[147px]"
          >
            {organization.phone}
          </a>
        </section>
      )}
    </div>
  )
}

export default ProjectViewPage
