import { useMemo, useState } from 'react'
import { inputClass } from '@/components/ui/formStyles'
import { CityCombobox } from '@/features/cities/components/CityCombobox'
import { useCities } from '@/features/cities/hooks'
import {
  ProjectCard,
  ProjectCardSkeleton,
} from '@/features/projects/components/ProjectCard'
import {
  PROJECTS_PAGE_SIZE,
  useOrganizationNames,
  useProjects,
} from '@/features/projects/hooks'
import { useDebounce } from '@/hooks/useDebounce'

export const ProjectsCatalogPage = () => {
  const [searchInput, setSearchInput] = useState('')
  const [cityId, setCityId] = useState<number | null>(null)

  // Запит до бекенду — лише після паузи в наборі, а не на кожну літеру
  const search = useDebounce(searchInput.trim(), 400)

  const { cities, isLoading: isCitiesLoading, error: citiesError } = useCities()
  const { data: organizationNames } = useOrganizationNames()
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isPlaceholderData,
  } = useProjects(search, cityId)

  const projects = data?.items ?? []

  const cityNames = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  )

  const hasFilters = searchInput.trim() !== '' || cityId !== null

  const resetFilters = () => {
    setSearchInput('')
    setCityId(null)
  }

  return (
    <div
      data-testid="projects-catalog-page"
      className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6"
    >
      <h1 className="mx-auto mb-5 w-full max-w-[569px] rounded-[5px] bg-info py-0.5 text-center text-2xl font-normal text-black">
        Актуальні проєкти
      </h1>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="block w-full sm:max-w-xs">
          <span className="sr-only">Пошук проєктів</span>
          <input
            type="search"
            data-testid="project-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Пошук за назвою чи описом"
            className={inputClass('md')}
          />
        </label>
        {/* label охоплює поле combobox, тож читач екрана чує «Місто» */}
        <label className="block w-full sm:max-w-xs" data-testid="project-city">
          <span className="sr-only">Місто</span>
          <CityCombobox
            cities={cities}
            value={cityId ?? ''}
            onChange={(value) => setCityId(value === '' ? null : value)}
            disabled={isCitiesLoading && cities.length === 0}
            placeholder="Усі міста"
            inputClassName={inputClass('md')}
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="cursor-pointer rounded-[5px] bg-[#DCECFF] px-3 py-1.5 text-xs text-black hover:bg-main"
          >
            ✕ Скинути фільтри
          </button>
        )}
        {citiesError && (
          <span className="text-xs text-red-600">{citiesError}</span>
        )}
      </div>

      {isError ? (
        <div
          data-testid="error-state"
          className="rounded-[5px] border border-red-300 bg-red-50 p-8 text-center"
        >
          <p className="mb-1 text-base font-bold text-black">
            Не вдалося завантажити проєкти
          </p>
          <p className="mb-4 text-sm text-black/70">
            Перевірте з’єднання й спробуйте ще раз.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="cursor-pointer rounded-[5px] bg-main px-4 py-2 text-sm text-black hover:bg-main-hover"
          >
            Спробувати знову
          </button>
        </div>
      ) : !isLoading && projects.length === 0 ? (
        <div
          data-testid="empty-state"
          className="rounded-[5px] border border-main bg-[#DCECFF] p-10 text-center"
        >
          <p className="mb-1 text-base font-bold text-black">
            Проєктів не знайдено
          </p>
          <p className="mb-4 text-sm text-black/70">
            {hasFilters
              ? 'Спробуйте змінити пошук або обрати інше місто.'
              : 'Зараз немає актуальних проєктів.'}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="cursor-pointer rounded-[5px] bg-info px-4 py-2 text-sm text-black hover:opacity-90"
            >
              Скинути фільтри
            </button>
          )}
        </div>
      ) : (
        <>
          <ul
            aria-busy={isPlaceholderData}
            className={`grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ${
              isPlaceholderData ? 'opacity-50' : ''
            }`}
          >
            {isLoading
              ? Array.from({ length: PROJECTS_PAGE_SIZE }, (_, i) => (
                  <li key={i}>
                    <ProjectCardSkeleton />
                  </li>
                ))
              : projects.map((project) => (
                  <li key={project.id}>
                    <ProjectCard
                      project={project}
                      organizationName={organizationNames?.get(
                        project.organization_id,
                      )}
                      cityName={
                        project.city_id !== null
                          ? cityNames.get(project.city_id)
                          : undefined
                      }
                    />
                  </li>
                ))}
          </ul>

          {hasNextPage && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                data-testid="load-more"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="cursor-pointer rounded-[5px] bg-main px-6 py-1.5 text-sm text-black transition-colors hover:bg-main-hover disabled:cursor-wait disabled:opacity-60"
              >
                {isFetchingNextPage ? 'Завантаження...' : 'Показати ще'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ProjectsCatalogPage
