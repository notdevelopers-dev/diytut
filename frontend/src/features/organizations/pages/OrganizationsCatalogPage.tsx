import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Body, PageTitle } from '@/components/ui/Typography'
import { selectClass } from '@/components/ui/formStyles'
import { useCities } from '@/features/cities/hooks'
import { OrganizationsTable } from '@/features/organizations/components/OrganizationsTable'
import { useOrganizations } from '@/features/organizations/hooks'

export const OrganizationsCatalogPage = () => {
  const [cityId, setCityId] = useState<number | null>(null)

  const { cities, isLoading: isCitiesLoading, error: citiesError } = useCities()
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useOrganizations(cityId)

  const organizations = data?.items ?? []

  const cityNames = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  )

  // Зміна міста завантажує список із початку
  const handleCityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setCityId(e.target.value ? Number(e.target.value) : null)
  }

  const resetFilter = () => setCityId(null)

  const selectedCityName = cityId !== null ? cityNames.get(cityId) : undefined

  const summary =
    organizations.length > 0
      ? `Показано організацій: ${organizations.length}`
      : 'Організацій не знайдено'

  return (
    <div
      data-testid="organizations-catalog-page"
      className="mx-auto max-w-6xl px-4 py-8 sm:px-8"
    >
      <header className="mb-6">
        <PageTitle>Організації</PageTitle>
        <Body className="mt-2">
          Підтверджені благодійні фонди та громадські організації, які приймають
          волонтерів.
        </Body>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <label htmlFor="city-filter" className="sr-only">
            Місто
          </label>
          <select
            id="city-filter"
            data-testid="city-filter"
            value={cityId ?? ''}
            onChange={handleCityChange}
            disabled={isCitiesLoading && cities.length === 0}
            className={`${selectClass('md')} cursor-pointer`}
          >
            <option value="">Усі міста</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
                {city.region ? ` (${city.region})` : ''}
              </option>
            ))}
          </select>
        </div>
        {cityId !== null && (
          <button
            type="button"
            onClick={resetFilter}
            className="cursor-pointer rounded-md bg-[#DCECFF] px-3 py-1.5 text-xs text-black hover:bg-main"
          >
            ✕ Скинути фільтр
          </button>
        )}
        {citiesError && (
          <span className="text-xs text-red-600">{citiesError}</span>
        )}
      </div>

      {isError ? (
        <div
          data-testid="error-state"
          className="rounded-lg border border-red-300 bg-red-50 p-8 text-center"
        >
          <p className="mb-1 text-base font-bold text-black">
            Не вдалося завантажити організації
          </p>
          <p className="mb-4 text-sm text-black/70">
            Перевірте з’єднання й спробуйте ще раз.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="cursor-pointer rounded-lg bg-main px-4 py-2 text-sm font-medium text-black hover:bg-main-hover"
          >
            Спробувати знову
          </button>
        </div>
      ) : !isLoading && organizations.length === 0 ? (
        <div
          data-testid="empty-state"
          className="rounded-lg border border-main bg-[#F7FBFF] p-10 text-center"
        >
          <p className="mb-1 text-base font-bold text-black">
            Організацій не знайдено
          </p>
          <p className="mb-4 text-sm text-black/70">
            {selectedCityName
              ? `У місті ${selectedCityName} поки немає підтверджених організацій.`
              : 'У каталозі поки немає підтверджених організацій.'}
          </p>
          {cityId !== null && (
            <button
              type="button"
              onClick={resetFilter}
              className="cursor-pointer rounded-lg bg-info px-4 py-2 text-sm font-medium text-black hover:opacity-90"
            >
              Показати всі міста
            </button>
          )}
        </div>
      ) : (
        <OrganizationsTable
          organizations={organizations}
          cityNames={cityNames}
          isLoading={isLoading}
          footer={
            <>
              <span>{isLoading ? 'Завантаження...' : summary}</span>
              {hasNextPage && (
                <button
                  type="button"
                  data-testid="load-more"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="cursor-pointer rounded-md bg-[#C3D7F2] px-4 py-1.5 text-xs text-black transition-colors hover:bg-main disabled:cursor-wait disabled:opacity-60"
                >
                  {isFetchingNextPage ? 'Завантаження...' : 'Показати ще'}
                </button>
              )}
            </>
          }
        />
      )}
    </div>
  )
}

export default OrganizationsCatalogPage
