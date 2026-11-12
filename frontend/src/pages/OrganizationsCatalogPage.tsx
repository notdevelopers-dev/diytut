import { useState, useEffect, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import { fetchOrganizations } from '../api/organizations'
import { useCities } from '../hooks/useCities'
import type { OrganizationListItem } from '../types/organization'
import { OrganizationCard } from '../components/OrganizationCard'

export interface OrganizationsCatalogPageProps {
  initialOrganizations?: OrganizationListItem[]
  initialLoading?: boolean
  initialError?: string | null
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 6

export const OrganizationsCatalogPage = ({
  initialOrganizations,
  initialLoading = false,
  initialError = null,
  pageSize = DEFAULT_PAGE_SIZE,
}: OrganizationsCatalogPageProps) => {
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>(
    initialOrganizations || [],
  )
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading || !initialOrganizations,
  )
  const [error, setError] = useState<string | null>(initialError)
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState<number>(pageSize)
  const [retryCount, setRetryCount] = useState(0)

  // Інтеграція з GET /api/cities через хук useCities
  const { cities, isLoading: isCitiesLoading, error: citiesError } = useCities()

  useEffect(() => {
    if (initialOrganizations) return

    let isMounted = true

    fetchOrganizations()
      .then((data) => {
        if (isMounted) {
          setOrganizations(data)
          setError(null)
        }
      })
      .catch(() => {
        if (isMounted) {
          setError(
            'Не вдалося завантажити каталог організацій. Будь ласка, перевірте зʼєднання або спробуйте знову.',
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
  }, [initialOrganizations, retryCount])

  // Критерій приймання: Відображаються лише схвалені/підтверджені організації
  const verifiedOrganizations = useMemo(() => {
    return organizations.filter(
      (org) => org.status === 'approved' || org.is_verified === true,
    )
  }, [organizations])

  // Отримуємо назву обраного міста
  const selectedCity = useMemo(() => {
    if (selectedCityId === null) return null
    return cities.find((c) => c.id === selectedCityId) || null
  }, [selectedCityId, cities])

  // Критерій приймання: Вибір міста оновлює відображені картки організацій
  const filteredOrganizations = useMemo(() => {
    if (selectedCityId === null) {
      return verifiedOrganizations
    }

    return verifiedOrganizations.filter((org) => {
      // 1. Пряме співпадіння за city_id
      if (org.city_id === selectedCityId) {
        return true
      }

      // 2. Якщо city є об'єктом з id
      if (
        typeof org.city === 'object' &&
        org.city !== null &&
        org.city.id === selectedCityId
      ) {
        return true
      }

      // 3. Співпадіння за назвою міста, якщо id не співпав
      if (
        selectedCity &&
        typeof org.city === 'string' &&
        org.city.trim().toLowerCase() === selectedCity.name.trim().toLowerCase()
      ) {
        return true
      }

      return false
    })
  }, [verifiedOrganizations, selectedCityId, selectedCity])

  // Зміна фільтра міста скидає пагінацію на першу сторінку
  const handleCityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setSelectedCityId(value ? Number(value) : null)
    setVisibleCount(pageSize)
  }

  const handleResetCityFilter = () => {
    setSelectedCityId(null)
    setVisibleCount(pageSize)
  }

  // Кнопка пагінації "Завантажити ще"
  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + pageSize)
  }

  const handleRetry = () => {
    setRetryCount((c) => c + 1)
  }

  // Зріз організацій відповідно до "Load More" пагінації
  const displayedOrganizations = useMemo(() => {
    return filteredOrganizations.slice(0, visibleCount)
  }, [filteredOrganizations, visibleCount])

  const hasMore = visibleCount < filteredOrganizations.length

  // Допоміжна мапа назв міст для відображення в картці
  const cityNameMap = useMemo(() => {
    const map = new Map<number, string>()
    cities.forEach((city) => map.set(city.id, city.name))
    return map
  }, [cities])

  return (
    <div
      data-testid="organizations-catalog-page"
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
    >
      {/* Заголовок сторінки */}
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-ink tracking-tight sm:text-4xl">
          Каталог організацій
        </h1>
        <p className="mt-2 text-base text-ink-muted sm:text-lg">
          Знаходьте перевірені благодійні фонди та громадські організації у
          вашому місті та долучайтеся до їхніх ініціатив.
        </p>
      </header>

      {/* Панель фільтрів: фільтрація за містом */}
      <section className="mb-8 rounded-2xl border border-sky-100 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1 max-w-md">
            <label
              htmlFor="city-filter"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              Оберіть місто для пошуку організацій:
            </label>
            <div className="relative">
              <select
                id="city-filter"
                data-testid="city-filter"
                value={selectedCityId !== null ? String(selectedCityId) : ''}
                onChange={handleCityChange}
                disabled={isCitiesLoading && cities.length === 0}
                className="w-full appearance-none rounded-xl border border-sky-200 bg-[#F7FBFF] px-4 py-2.5 pr-10 text-sm font-medium text-ink focus:border-[#5897FB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5897FB]/20 transition-all cursor-pointer"
              >
                <option value="">Всі міста</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} {city.region ? `(${city.region})` : ''}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
            {citiesError && (
              <p className="mt-1 text-xs text-amber-600">{citiesError}</p>
            )}
          </div>

          {/* Індикатор застосованого фільтра та кнопка скидання */}
          {selectedCityId !== null && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs font-medium text-ink-muted">
                Фільтр:{' '}
                <strong className="text-ink">
                  {selectedCity?.name || 'Місто'}
                </strong>
              </span>
              <button
                type="button"
                onClick={handleResetCityFilter}
                className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-[#5897FB] hover:bg-sky-100 hover:text-blue-700 transition-colors cursor-pointer"
              >
                ✕ Скинути
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Підсумок кількості знайдених організацій */}
      {!isLoading && !error && (
        <div className="mb-6 flex items-center justify-between text-xs sm:text-sm text-ink-muted px-1">
          <span>
            Знайдено підтверджених організацій:{' '}
            <strong className="text-ink">{filteredOrganizations.length}</strong>
            {selectedCityId !== null && (
              <span> у місті {selectedCity?.name}</span>
            )}
          </span>
          {filteredOrganizations.length > 0 && (
            <span>
              Показано {displayedOrganizations.length} із{' '}
              {filteredOrganizations.length}
            </span>
          )}
        </div>
      )}

      {/* Основний контент */}
      {isLoading ? (
        /* Скелетони завантаження */
        <div
          data-testid="skeleton-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="card animate-pulse rounded-2xl border border-sky-100 bg-white p-6 shadow-xs"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="h-14 w-14 rounded-xl bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-gray-200 rounded-full" />
                  <div className="h-5 w-3/4 bg-gray-200 rounded" />
                </div>
              </div>
              <div className="h-3 w-1/3 bg-gray-200 rounded mb-3" />
              <div className="space-y-2 mb-4">
                <div className="h-3.5 bg-gray-200 rounded" />
                <div className="h-3.5 bg-gray-200 rounded w-5/6" />
                <div className="h-3.5 bg-gray-200 rounded w-2/3" />
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-between">
                <div className="h-6 w-24 bg-gray-200 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        /* Стан помилки */
        <div
          data-testid="error-state"
          className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center my-6"
        >
          <div className="mb-3 text-3xl">⚠️</div>
          <h3 className="text-lg font-bold text-red-900 mb-1">
            Помилка завантаження
          </h3>
          <p className="max-w-md text-sm text-red-700 mb-4">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="btn btn-primary btn-sm cursor-pointer"
          >
            Спробувати знову
          </button>
        </div>
      ) : filteredOrganizations.length === 0 ? (
        /* Порожній результат фільтрації */
        <div
          data-testid="empty-state"
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-white p-12 text-center shadow-xs my-6 w-full"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-3xl text-[#5897FB]">
            🏢
          </div>
          <h3 className="mb-2 text-xl font-bold text-ink">
            Організацій не знайдено
          </h3>
          <p className="mb-6 max-w-md text-sm text-ink-muted leading-relaxed">
            {selectedCityId !== null
              ? `У місті ${selectedCity?.name || ''} наразі немає підтверджених організацій. Спробуйте обрати інше місто або скинути фільтр.`
              : 'Наразі в каталозі немає підтверджених організацій.'}
          </p>
          {selectedCityId !== null && (
            <button
              type="button"
              onClick={handleResetCityFilter}
              className="btn btn-primary btn-sm cursor-pointer"
            >
              Показати всі міста
            </button>
          )}
        </div>
      ) : (
        /* Сітка карток організацій */
        <>
          <div
            data-testid="organizations-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {displayedOrganizations.map((org) => {
              const cityName =
                typeof org.city === 'string'
                  ? org.city
                  : org.city?.name || cityNameMap.get(org.city_id)

              return (
                <OrganizationCard
                  key={org.id}
                  organization={org}
                  cityName={cityName}
                />
              )
            })}
          </div>

          {/* Кнопка пагінації "Завантажити ще" (Load More) */}
          {hasMore && (
            <div className="mt-10 flex flex-col items-center justify-center gap-2">
              <button
                type="button"
                data-testid="load-more-btn"
                onClick={handleLoadMore}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#5897FB] px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#4782e0] active:scale-98 transition-all cursor-pointer"
              >
                <span>Завантажити ще</span>
                <span aria-hidden="true">↓</span>
              </button>
              <span className="text-xs text-ink-muted">
                Залишилося {filteredOrganizations.length - visibleCount} з{' '}
                {filteredOrganizations.length}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default OrganizationsCatalogPage
