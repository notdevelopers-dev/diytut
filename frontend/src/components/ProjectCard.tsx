import type { Project } from '../types/project'

export interface ProjectCardProps {
  project: Project
  selectedTags?: string[]
  onTagClick?: (tag: string) => void
}

export const ProjectCard = ({
  project,
  selectedTags = [],
  onTagClick,
}: ProjectCardProps) => {
  const orgName =
    typeof project.organization === 'string'
      ? project.organization
      : project.organization?.name || project.organization_name || 'Організація'

  const cityName =
    typeof project.city === 'string' ? project.city : project.city?.name || null

  return (
    <article
      data-testid="project-card"
      className="card flex flex-col justify-between rounded-xl border border-border bg-white p-6 shadow-xs hover:shadow-md hover:border-sky-300 transition-all duration-200"
    >
      <div>
        {/* Header: Organization and Location / Format */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div
            className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-100 max-w-[70%] truncate"
            title={orgName}
          >
            <span aria-hidden="true">🏛️</span>
            <span className="truncate">{orgName}</span>
          </div>

          <div>
            {project.is_online ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Онлайн
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200 truncate max-w-[140px]">
                <span>📍</span>
                <span className="truncate">{cityName || 'Офлайн'}</span>
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-ink leading-snug mb-2 line-clamp-2">
          {project.title}
        </h3>

        {/* Description */}
        <p className="text-sm text-ink-muted line-clamp-3 leading-relaxed mb-4">
          {project.description}
        </p>
      </div>

      {/* Badges footer */}
      <div className="pt-4 border-t border-gray-100 flex flex-col gap-2.5">
        {/* Optional metadata badges: hours, age restriction, etc. */}
        {project.volunteer_hours && (
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 font-medium border border-blue-100">
              ⏱️ {project.volunteer_hours} год
            </span>
            {project.is_adult_only && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-red-600 font-medium border border-red-100">
                18+
              </span>
            )}
          </div>
        )}

        {/* Tag Badges */}
        {project.tags && project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((tag) => {
              const isSelected = selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onTagClick?.(tag)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-white font-semibold shadow-xs'
                      : 'bg-page text-ink-muted hover:bg-primary-light hover:text-primary cursor-pointer border border-transparent hover:border-sky-200'
                  }`}
                  aria-pressed={isSelected}
                >
                  #{tag}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}

export default ProjectCard
