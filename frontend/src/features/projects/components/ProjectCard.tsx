import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import cameraIcon from '@/assets/icons/camera.svg'
import clockIcon from '@/assets/icons/clock.svg'
import memberCheckIcon from '@/assets/icons/member-check.svg'
import { useToast } from '@/components/feedback'
import { useAuth } from '@/features/auth/hooks'
import { JoinRequestModal } from '@/features/organizations/components/JoinRequestModal'
import {
  useCreateProjectJoinRequest,
  useMyProjectJoinRequest,
} from '@/features/projects/hooks'
import {
  projectJoinErrorText,
  projectsCatalogUrl,
} from '@/features/projects/utils'
import type { JoinRequestStatus } from '@/types/organization'
import type { ExperienceLevel, Project, ProjectCategory } from '@/types/project'

/** Назви рівнів досвіду з документа скоупу (R-27) */
const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  novice: 'Новачок',
  interested: 'Зацікавлений',
  amateur: 'Аматор',
  experienced: 'Досвідчений',
  pro: 'Профі',
}

const formatDate = (iso: string | null) => {
  if (!iso) return null
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return null
  return value.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** "4.50" → "4,5 год" */
const formatHours = (hours: string | null) => {
  const value = hours === null ? NaN : Number(hours)
  if (!Number.isFinite(value) || value <= 0) return null
  return `${value.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} год`
}

/** Стан кнопки на картці; скасована заявка — знову «Приєднатись» */
type ProjectJoinState = 'default' | 'pending' | 'member' | 'rejected'

const JOIN_STATES: Record<JoinRequestStatus, ProjectJoinState> = {
  pending: 'pending',
  accepted: 'member',
  rejected: 'rejected',
  cancelled: 'default',
}

const joinPillClass =
  'mx-auto flex items-center gap-1.5 rounded-[5px] px-4 py-1 text-xs'

const badgeClass = 'rounded-[5px] px-1.5 py-0.5 text-[10px] leading-tight'

const clickableBadge =
  'block cursor-pointer no-underline transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-blue-500'

interface ProjectCardProps {
  project: Project
  organizationName?: string
  cityName?: string
  /** На сторінці самої організації її назву в картці не показуємо (як у макеті) */
  showOrganization?: boolean
  /** Назви сфер з GET /api/categories; без них сфери не показуються */
  categoryNames?: Map<ProjectCategory, string>
  /**
   * Клік по хештегу чи сфері. У каталозі фільтр застосовується на місці; без
   * обробника (сторінка організації) бейдж веде в каталог із цим фільтром.
   */
  onTagClick?: (tag: string) => void
  onCategoryClick?: (category: ProjectCategory) => void
}

/** Картка проєкту за макетом Figma («Projects section») із бейджами з задачі. */
export const ProjectCard = ({
  project,
  organizationName,
  cityName,
  showOrganization = true,
  categoryNames,
  onTagClick,
  onCategoryClick,
}: ProjectCardProps) => {
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const {
    isAuthenticated,
    isProfileComplete,
    isLoading: isAuthLoading,
  } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const descriptionId = useId()

  // Заявки має лише користувач із заповненою анкетою
  const canHaveRequests = isAuthenticated && isProfileComplete
  const { data: joinRequest, isLoading: isJoinRequestLoading } =
    useMyProjectJoinRequest(project.id, canHaveRequests)
  const createJoinRequest = useCreateProjectJoinRequest(project.id)
  const joinState: ProjectJoinState = joinRequest
    ? JOIN_STATES[joinRequest.status]
    : 'default'
  const isJoinStateLoading =
    isAuthLoading || (canHaveRequests && isJoinRequestLoading)

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
        showToast('Запит на участь надіслано')
      },
    })
  }

  const date = formatDate(project.starts_at)
  const hours = formatHours(project.volunteer_hours)
  const location = project.is_online ? 'Онлайн' : cityName

  return (
    <article
      data-testid="project-card"
      className="flex h-full flex-col gap-2 rounded-[5px] border border-main bg-[#DCECFF] p-2"
    >
      {/* Фото проєкту: поки статична заглушка, бекенд ще не зберігає фото (R-13) */}
      <div className="flex aspect-[130/63] items-center justify-center rounded-[5px] border border-[#8B99AA] bg-[#C2D4EA]">
        <img src={cameraIcon} alt="" width={25} height={25} />
      </div>

      {showOrganization && (
        <Link
          to={`/organizations/${project.organization_id}`}
          title="Сторінка організації"
          className="block truncate rounded-[5px] bg-[#F7FBFF] px-2 py-0.5 text-center text-[11px] text-black no-underline transition-colors hover:bg-white hover:underline"
        >
          {organizationName ?? 'Організація'}
        </Link>
      )}

      <h2 className="rounded-[5px] bg-[#F7FBFF] px-2 py-0.5 text-center text-sm font-normal break-words text-black">
        {project.title}
      </h2>

      {categoryNames && project.categories.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Сфери">
          {project.categories.map((category) => (
            <li key={category}>
              <FilterBadge
                className={`${badgeClass} bg-main text-black`}
                label={categoryNames.get(category) ?? category}
                title="Показати проєкти цієї сфери"
                to={projectsCatalogUrl({ category })}
                onClick={onCategoryClick && (() => onCategoryClick(category))}
              />
            </li>
          ))}
        </ul>
      )}

      <ul className="flex flex-wrap gap-1" aria-label="Деталі проєкту">
        {project.is_adult_only && (
          <li className={`${badgeClass} bg-peach font-medium text-black`}>
            18+
          </li>
        )}
        <li className={`${badgeClass} bg-info text-black`}>
          {EXPERIENCE_LABELS[project.experience_level]}
        </li>
        {location && (
          <li className={`${badgeClass} bg-[#F7FBFF] text-black`}>
            {location}
          </li>
        )}
        {date && (
          <li className={`${badgeClass} bg-[#F7FBFF] text-black`}>{date}</li>
        )}
        {hours && (
          <li className={`${badgeClass} bg-[#F7FBFF] text-black`}>{hours}</li>
        )}
      </ul>

      {project.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Теги">
          {project.tags.map((tag) => (
            <li key={tag}>
              <FilterBadge
                className={`${badgeClass} border border-main bg-[#F7FBFF] text-black`}
                label={`#${tag}`}
                title="Показати проєкти з цим хештегом"
                to={projectsCatalogUrl({ tag })}
                onClick={onTagClick && (() => onTagClick(tag))}
              />
            </li>
          ))}
        </ul>
      )}

      {/* «Опис» за макетом: невелике посилання праворуч, що розгортає опис */}
      <div className="mt-auto flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setIsDescriptionOpen((open) => !open)}
          aria-expanded={isDescriptionOpen}
          aria-controls={descriptionId}
          className="ml-auto cursor-pointer border-b border-[#8B99AA] text-[10px] text-[#8B99AA] hover:text-black"
        >
          {isDescriptionOpen ? 'Сховати опис' : 'Опис'}
        </button>
        <p
          id={descriptionId}
          hidden={!isDescriptionOpen}
          // Висота обмежена, щоб відкритий опис не розтягував увесь ряд сітки
          className="max-h-32 overflow-y-auto rounded-[5px] bg-[#F7FBFF] px-2 py-1 text-[11px] break-words whitespace-pre-line text-black"
        >
          {project.description}
        </p>
      </div>

      {isJoinStateLoading ? (
        <div
          aria-hidden="true"
          className="mx-auto h-6 w-28 animate-pulse rounded-[5px] bg-[#C2D4EA]"
        />
      ) : joinState === 'pending' ? (
        <p
          data-testid="project-join"
          data-state="pending"
          className={`${joinPillClass} bg-[#C2D4EA] text-[#8B99AA]`}
        >
          <img src={clockIcon} alt="" width={14} height={14} />
          Запит очікує
        </p>
      ) : joinState === 'member' ? (
        <p
          data-testid="project-join"
          data-state="member"
          className={`${joinPillClass} bg-[#B5F291] text-black`}
        >
          <img src={memberCheckIcon} alt="" width={16} height={16} />
          Ви учасник
        </p>
      ) : joinState === 'rejected' ? (
        <p
          data-testid="project-join"
          data-state="rejected"
          className={`${joinPillClass} bg-[#C2D4EA] text-[#8B99AA]`}
        >
          Запит відхилено
        </p>
      ) : (
        <button
          type="button"
          data-testid="project-join"
          data-state="default"
          onClick={handleJoinClick}
          className="mx-auto block cursor-pointer rounded-[5px] bg-[#B5F291] px-5 py-1 text-center text-xs text-black transition-colors hover:bg-[#a3e47c]"
        >
          Приєднатись
        </button>
      )}

      {isModalOpen && (
        <JoinRequestModal
          title="Запит на участь у проєкті"
          subtitle={project.title}
          isSubmitting={createJoinRequest.isPending}
          error={createJoinRequest.error}
          describeError={projectJoinErrorText}
          onSubmit={handleSubmit}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </article>
  )
}

/** Заглушка картки, поки список завантажується. */
export const ProjectCardSkeleton = () => (
  <div
    aria-hidden="true"
    className="flex h-full animate-pulse flex-col gap-2 rounded-[5px] border border-main bg-[#DCECFF] p-2"
  >
    <div className="aspect-[130/63] rounded-[5px] bg-[#C2D4EA]" />
    <div className="h-[18px] rounded-[5px] bg-[#F7FBFF]" />
    <div className="h-[22px] rounded-[5px] bg-[#F7FBFF]" />
    <div className="flex gap-1">
      <div className="h-4 w-14 rounded-[5px] bg-[#F7FBFF]" />
      <div className="h-4 w-16 rounded-[5px] bg-[#F7FBFF]" />
    </div>
    <div className="mx-auto mt-auto h-6 w-28 rounded-[5px] bg-[#B5F291]/60" />
  </div>
)

interface FilterBadgeProps {
  className: string
  label: string
  title: string
  to: string
  onClick?: () => void
}

/** Бейдж-фільтр: кнопка в каталозі, посилання на каталог деінде. */
const FilterBadge = ({
  className,
  label,
  title,
  to,
  onClick,
}: FilterBadgeProps) =>
  onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`${className} ${clickableBadge}`}
    >
      {label}
    </button>
  ) : (
    <Link to={to} title={title} className={`${className} ${clickableBadge}`}>
      {label}
    </Link>
  )
