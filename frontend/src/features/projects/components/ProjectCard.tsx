import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import cameraIcon from '@/assets/icons/camera.svg'
import { projectsCatalogUrl } from '@/features/projects/utils'
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
  const descriptionId = useId()

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
        <p className="truncate rounded-[5px] bg-[#F7FBFF] px-2 py-0.5 text-center text-[11px] text-black">
          {organizationName ?? 'Організація'}
        </p>
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

      <Link
        to={`/projects/${project.id}`}
        className="mx-auto block rounded-[5px] bg-[#B5F291] px-5 py-1 text-center text-xs text-black no-underline transition-colors hover:bg-[#a3e47c]"
      >
        Приєднатись
      </Link>
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
