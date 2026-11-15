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
  useCategories,
  useOrganizationNames,
  useProjects,
} from '@/features/projects/hooks'
import { useDebounce } from '@/hooks/useDebounce'
import type { ProjectCategory } from '@/types/project'

export const ProjectsCatalogPage = () => {
  const [searchInput, setSearchInput] = useState('')
  const [cityId, setCityId] = useState<number | null>(null)
  const [categories, setCategories] = useState<ProjectCategory[]>([])

  // Запит до бекенду — лише після паузи в наборі, а не на кожну літеру.
  // Слова з «#» на початку йдуть у фільтр хештегів, решта — у текстовий пошук
  const query = useDebounce(searchInput.trim(), 400)

  const { cities, isLoading: isCitiesLoading, error: citiesError } = useCities()
  const { data: organizationNames } = useOrganizationNames()
  const { data: categoryItems = [], isError: isCategoriesError } =
    useCategories()
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isPlaceholderData,
  } = useProjects({ query, cityId, categories })

  const projects = data?.items ?? []

  const cityNames = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  )

  const categoryNames = useMemo(
    () => new Map(categoryItems.map((item) => [item.key, item.name])),
    [categoryItems],
  )

  const hasFilters =
    searchInput.trim() !== '' || cityId !== null || categories.length > 0

  const toggleCategory = (key: ProjectCategory) =>
    setCategories((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    )

  const resetFilters = () => {
    setSearchInput('')
    setCityId(null)
    setCategories([])
  }

  return (
    <div
      data-testid="projects-catalog-page"
      className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6"
    >
      <h1 className="mx-auto mb-5 w-full max-w-[569px] rounded-[5px] bg-info py-0.5 text-center text-2xl font-normal text-black">
        Актуальні проєкти
      </h1>

      <div className="mb-5 flex flex-wrap items-start gap-3">
        <label className="block w-full sm:max-w-xs">
          <span className="sr-only">Пошук проєктів</span>
          <input
            type="search"
            data-testid="project-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Пошук або #хештег"
            aria-describedby="project-search-hint"
            className={inputClass('md')}
          />
          <span
            id="project-search-hint"
            className="mt-1 block text-[10px] text-[#8B99AA]"
          >
            Пошук за назвою й описом; #хештег шукає за тегами
          </span>
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
            className="cursor-pointer rounded-[5px] bg-[#DCECFF] px-3 py-1.5 text-xs text-black hover:bg-main sm:mt-1"
          >
            ✕ Скинути фільтри
          </button>
        )}
        {citiesError && (
          <span className="text-xs text-red-600">{citiesError}</span>
        )}
      </div>

      {/* Сфери: можна обрати кілька — покажемо проєкти з будь-якою з них */}
      {categoryItems.length > 0 && (
        <fieldset className="mb-5 min-w-0">
          <legend className="sr-only">Сфери проєктів</legend>
          {/* На телефоні — один ряд із горизонтальною прокруткою, щоб 21 сфера не
              займала пів екрана; від sm — переносяться на кілька рядів */}
          <ul
            className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            data-testid="category-filter"
          >
            {categoryItems.map((item) => {
              const isSelected = categories.includes(item.key)
              return (
                <li key={item.key} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleCategory(item.key)}
                    className={`cursor-pointer rounded-[5px] border px-2.5 py-1 text-xs whitespace-nowrap text-black transition-colors ${
                      isSelected
                        ? 'border-main bg-main'
                        : 'border-main bg-[#F7FBFF] hover:bg-[#DCECFF]'
                    }`}
                  >
                    {isSelected && <span aria-hidden="true">✓ </span>}
                    {item.name}
                  </button>
                </li>
              )
            })}
          </ul>
        </fieldset>
      )}
      {isCategoriesError && (
        <p className="mb-5 text-xs text-red-600">
          Не вдалося завантажити сфери проєктів.
        </p>
      )}

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
              ? 'Спробуйте змінити пошук, сфери або місто.'
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
                      categoryNames={categoryNames}
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
