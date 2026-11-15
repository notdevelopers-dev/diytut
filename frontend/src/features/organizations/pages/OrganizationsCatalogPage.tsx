import { useMemo, useState } from 'react'
import { inputClass } from '@/components/ui/formStyles'
import { CityCombobox } from '@/features/cities/components/CityCombobox'
import { useCities } from '@/features/cities/hooks'
import {
  OrganizationCard,
  OrganizationCardSkeleton,
} from '@/features/organizations/components/OrganizationCard'
import {
  ORGANIZATIONS_PAGE_SIZE,
  useOrganizations,
} from '@/features/organizations/hooks'

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
  const handleCityChange = (value: number | '') =>
    setCityId(value === '' ? null : value)

  const resetFilter = () => setCityId(null)

  const selectedCityName = cityId !== null ? cityNames.get(cityId) : undefined

  return (
    <div
      data-testid="organizations-catalog-page"
      className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6"
    >
      <h1 className="mx-auto mb-5 w-full max-w-[569px] rounded-[5px] bg-main py-0.5 text-center text-2xl font-normal text-black">
        Організації
      </h1>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* label охоплює поле combobox, тож читач екрана чує «Місто» */}
        <label className="block w-full sm:max-w-xs" data-testid="city-filter">
          <span className="sr-only">Місто</span>
          <CityCombobox
            cities={cities}
            value={cityId ?? ''}
            onChange={handleCityChange}
            disabled={isCitiesLoading && cities.length === 0}
            placeholder="Усі міста"
            inputClassName={inputClass('md')}
          />
        </label>
        {cityId !== null && (
          <button
            type="button"
            onClick={resetFilter}
            className="cursor-pointer rounded-[5px] bg-[#DCECFF] px-3 py-1.5 text-xs text-black hover:bg-main"
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
          className="rounded-[5px] border border-red-300 bg-red-50 p-8 text-center"
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
            className="cursor-pointer rounded-[5px] bg-main px-4 py-2 text-sm text-black hover:bg-main-hover"
          >
            Спробувати знову
          </button>
        </div>
      ) : !isLoading && organizations.length === 0 ? (
        <div
          data-testid="empty-state"
          className="rounded-[5px] border border-main bg-[#DCECFF] p-10 text-center"
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
              className="cursor-pointer rounded-[5px] bg-info px-4 py-2 text-sm text-black hover:opacity-90"
            >
              Показати всі міста
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {isLoading
              ? Array.from({ length: ORGANIZATIONS_PAGE_SIZE }, (_, i) => (
                  <li key={i}>
                    <OrganizationCardSkeleton />
                  </li>
                ))
              : organizations.map((organization) => (
                  <li key={organization.id}>
                    <OrganizationCard
                      organization={organization}
                      cityName={cityNames.get(organization.city_id)}
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

export default OrganizationsCatalogPage
