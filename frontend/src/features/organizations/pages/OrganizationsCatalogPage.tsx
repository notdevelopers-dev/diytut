import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Pagination } from '@/components/ui/Pagination'
import { Body, PageTitle } from '@/components/ui/Typography'
import { selectClass } from '@/components/ui/formStyles'
import { useCities } from '@/features/cities/hooks'
import { OrganizationsTable } from '@/features/organizations/components/OrganizationsTable'
import {
  ORGANIZATIONS_PAGE_SIZE,
  useOrganizations,
} from '@/features/organizations/hooks'

export const OrganizationsCatalogPage = () => {
  const [cityId, setCityId] = useState<number | null>(null)
  const [page, setPage] = useState(1)

  const { cities, isLoading: isCitiesLoading, error: citiesError } = useCities()
  const { data, isLoading, isError, refetch } = useOrganizations(cityId, page)

  const organizations = data?.items ?? []
  const hasNext = data?.hasNext ?? false

  const cityNames = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  )

  // Зміна міста завжди повертає на першу сторінку
  const handleCityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setCityId(e.target.value ? Number(e.target.value) : null)
    setPage(1)
  }

  const resetFilter = () => {
    setCityId(null)
    setPage(1)
  }

  const from = (page - 1) * ORGANIZATIONS_PAGE_SIZE + 1
  const to = from + organizations.length - 1
  const selectedCityName = cityId !== null ? cityNames.get(cityId) : undefined

  const summary =
    organizations.length > 0
      ? `Показано ${from}–${to} організацій`
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
          {(cityId !== null || page > 1) && (
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
              <Pagination
                page={page}
                hasPrev={page > 1}
                hasNext={hasNext}
                onPrev={() => setPage((p) => p - 1)}
                onNext={() => setPage((p) => p + 1)}
              />
            </>
          }
        />
      )}
    </div>
  )
}

export default OrganizationsCatalogPage
