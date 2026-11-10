import { useState, useEffect, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import { fetchProjects } from '../api/projects'
import type { Project } from '../types/project'
import {
  ProjectCard,
  SkeletonCard,
  EmptyState,
  ErrorState,
} from '../components'

export interface ProjectsCatalogPageProps {
  initialProjects?: Project[]
  initialLoading?: boolean
  initialError?: string | null
}

export const ProjectsCatalogPage = ({
  initialProjects,
  initialLoading = false,
  initialError = null,
}: ProjectsCatalogPageProps) => {
  const [projects, setProjects] = useState<Project[]>(initialProjects || [])
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading || !initialProjects,
  )
  const [error, setError] = useState<string | null>(initialError)
  const [retryCount, setRetryCount] = useState(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  useEffect(() => {
    if (initialProjects) return

    let isMounted = true
    fetchProjects()
      .then((data) => {
        if (isMounted) {
          setProjects(data)
          setError(null)
        }
      })
      .catch(() => {
        if (isMounted) {
          setError(
            'Не вдалося завантажити список проєктів. Будь ласка, перевірте зʼєднання або спробуйте знову.',
          )
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [initialProjects, retryCount])

  const handleRetry = () => {
    setIsLoading(true)
    setError(null)
    setRetryCount((c) => c + 1)
  }

  // Extract all unique tags across all available projects
  const availableTags = useMemo(() => {
    const tagCountMap: Record<string, number> = {}
    projects.forEach((p) => {
      p.tags?.forEach((tag) => {
        tagCountMap[tag] = (tagCountMap[tag] || 0) + 1
      })
    })

    return Object.entries(tagCountMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [projects])

  // Filter projects based on search query and selected tags
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      // 1. Tag filtering (AND condition: project must contain all selected tags)
      if (selectedTags.length > 0) {
        const hasAllSelectedTags = selectedTags.every((tag) =>
          project.tags?.includes(tag),
        )
        if (!hasAllSelectedTags) return false
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const orgName =
          typeof project.organization === 'string'
            ? project.organization
            : project.organization?.name || project.organization_name || ''
        const cityName =
          typeof project.city === 'string'
            ? project.city
            : project.city?.name || ''

        const matchesTitle = project.title.toLowerCase().includes(query)
        const matchesDescription = project.description
          .toLowerCase()
          .includes(query)
        const matchesOrg = orgName.toLowerCase().includes(query)
        const matchesCity = cityName.toLowerCase().includes(query)
        const matchesTag = project.tags?.some((tag) =>
          tag.toLowerCase().includes(query),
        )

        if (
          !matchesTitle &&
          !matchesDescription &&
          !matchesOrg &&
          !matchesCity &&
          !matchesTag
        ) {
          return false
        }
      }

      return true
    })
  }, [projects, selectedTags, searchQuery])

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const handleResetFilters = () => {
    setSearchQuery('')
    setSelectedTags([])
  }

  const isFiltered = searchQuery.trim().length > 0 || selectedTags.length > 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Title & Intro */}
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-ink tracking-tight sm:text-4xl">
          Каталог волонтерських проєктів
        </h1>
        <p className="mt-2 text-base text-ink-muted sm:text-lg">
          Знаходьте перевірені ініціативи, долучайтеся до допомоги та творить
          зміни разом з однодумцями.
        </p>
      </header>

      {/* Search and Filters Section */}
      <section className="mb-8 rounded-2xl border border-sky-100 bg-white p-5 shadow-xs sm:p-6">
        {/* Search bar */}
        <div className="relative mb-5">
          <label htmlFor="project-search" className="sr-only">
            Пошук проєктів
          </label>
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
            🔍
          </div>
          <input
            id="project-search"
            type="text"
            value={searchQuery}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            placeholder="Пошук проєктів за назвою, організацією, описом чи тегом..."
            className="w-full rounded-xl border border-border bg-page py-3 pr-10 pl-11 text-sm text-ink placeholder-gray-400 transition-colors focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-base"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-gray-400 hover:text-ink cursor-pointer"
              aria-label="Очистити поле пошуку"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tag Filters */}
        {availableTags.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Фільтр за тегами:
              </span>
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  Скинути всі фільтри
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  selectedTags.length === 0
                    ? 'bg-[#5897FB] text-white shadow-xs font-semibold'
                    : 'bg-page text-ink-muted hover:bg-sky-50 hover:text-sky-800 border border-border'
                }`}
              >
                Всі напрями ({projects.length})
              </button>

              {availableTags.map(({ name, count }) => {
                const isSelected = selectedTags.includes(name)
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleToggleTag(name)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#5897FB] text-white shadow-xs font-semibold'
                        : 'bg-page text-ink-muted hover:bg-sky-50 hover:text-sky-800 border border-border'
                    }`}
                    aria-pressed={isSelected}
                  >
                    #{name}{' '}
                    <span
                      className={`ml-1 text-[11px] ${
                        isSelected ? 'text-blue-100' : 'text-gray-400'
                      }`}
                    >
                      ({count})
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Results summary (only when not loading or error) */}
      {!isLoading && !error && (
        <div className="mb-4 flex items-center justify-between text-xs sm:text-sm text-ink-muted px-1">
          <span>
            Знайдено проєктів:{' '}
            <strong className="text-ink">{filteredProjects.length}</strong>
            {projects.length !== filteredProjects.length && (
              <span> (із {projects.length})</span>
            )}
          </span>
          {isFiltered && (
            <span className="text-primary font-medium">
              Застосовано фільтри
            </span>
          )}
        </div>
      )}

      {/* Content States */}
      {isLoading ? (
        /* Loading skeleton responsive grid */
        <div
          data-testid="skeleton-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : error ? (
        /* Error state */
        <ErrorState message={error} onRetry={handleRetry} />
      ) : filteredProjects.length === 0 ? (
        /* Empty results state */
        <EmptyState
          title="No projects found"
          description={
            isFiltered
              ? 'За вашим запитом не знайдено жодного проєкту. Спробуйте змінити критерії пошуку або обрати інші теги.'
              : 'Наразі немає активних волонтерських проєктів у каталозі.'
          }
          onReset={isFiltered ? handleResetFilters : undefined}
        />
      ) : (
        /* Responsive Grid: 1 column on mobile, 2-3 columns on desktop */
        <div
          data-testid="projects-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              selectedTags={selectedTags}
              onTagClick={handleToggleTag}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default ProjectsCatalogPage
