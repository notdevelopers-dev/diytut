import { Fragment, useMemo, useState } from 'react'
import { useCities } from '@/features/cities/hooks'
import type { OrganizationJoinRequest } from '@/types/organization'
import { formatDateTime } from './format'
import { EmptyState, SearchField } from './shared'

type Tab = 'all' | 'pending' | 'processed'
type Sort = 'newest' | 'oldest'

const PAGE_SIZE = 10

/** «1 новий запит», «2 нові запити», «5 нових запитів» */
const pluralRequests = (n: number) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} новий запит чекає`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return `${n} нові запити чекають`
  return `${n} нових запитів чекають`
}

const applicantName = (r: OrganizationJoinRequest) =>
  [r.user.first_name, r.user.last_name].filter(Boolean).join(' ')

/** Кнопки розгляду — у FE-203; тут видно, але не активні */
const ReviewButtons = () => (
  <div className="flex gap-2">
    <button
      type="button"
      disabled
      title="Розгляд заявок — незабаром"
      className="h-6 cursor-not-allowed rounded-[5px] bg-[#B5F291] px-3 text-xs text-black opacity-70"
    >
      Схвалити
    </button>
    <button
      type="button"
      disabled
      title="Розгляд заявок — незабаром"
      className="h-6 cursor-not-allowed rounded-[5px] bg-[#E14848] px-3 text-xs text-white opacity-70"
    >
      Відхилити
    </button>
  </div>
)

const StatusChip = () => (
  <span className="inline-flex h-6 items-center rounded-[5px] bg-info px-3 text-xs text-black">
    На розгляді
  </span>
)

/**
 * Вхідні запити за макетом Figma «Сповіщення організації»: вкладки, пошук,
 * сортування й таблиця заявок. Бекенд віддає лише заявки на розгляді, тож
 * «Опрацьовані» поки порожні; схвалення й відхилення — у FE-203.
 */
export const RequestsSection = ({
  requests,
  canReview,
  isLoading,
  isError,
}: {
  requests: OrganizationJoinRequest[]
  canReview: boolean
  isLoading: boolean
  isError: boolean
}) => {
  const { cities } = useCities()
  const cityNames = useMemo(
    () => new Map(cities.map((c) => [c.id, c.name])),
    [cities],
  )
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = requests.filter(
      (r) =>
        tab !== 'processed' &&
        (!q ||
          applicantName(r).toLowerCase().includes(q) ||
          (r.user.nickname ?? '').toLowerCase().includes(q) ||
          (r.message ?? '').toLowerCase().includes(q)),
    )
    return [...list].sort((a, b) =>
      sort === 'newest'
        ? b.created_at.localeCompare(a.created_at)
        : a.created_at.localeCompare(b.created_at),
    )
  }, [requests, tab, search, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  )

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'Усі', count: requests.length },
    { id: 'pending', label: 'На розгляді', count: requests.length },
    { id: 'processed', label: 'Опрацьовані', count: 0 },
  ]

  if (!canReview) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-3 py-6">
        <EmptyState
          title="Розгляд заявок недоступний"
          text="Заявки на вступ розглядають власник і адміністратори організації."
        />
      </div>
    )
  }

  return (
    <section
      aria-label="Вхідні запити"
      className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-3 py-5"
    >
      <div className="flex flex-col gap-1">
        <h1 className="w-fit rounded-[5px] bg-info px-3 py-1 text-3xl font-normal text-black">
          Вхідні запити
        </h1>
        <p className="text-sm text-black">
          {requests.length > 0
            ? `${pluralRequests(requests.length)} на ваш розгляд`
            : 'Нових запитів немає'}
        </p>
      </div>

      {/* Вкладки з лічильниками */}
      <div
        role="tablist"
        aria-label="Фільтр запитів"
        className="flex flex-wrap gap-2 border-b border-[#DCECFF]"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id)
              setPage(0)
            }}
            className={`-mb-px flex cursor-pointer items-center gap-3 border-b-2 px-3 py-1.5 text-sm text-black ${
              tab === t.id
                ? 'border-main bg-[#DCECFF]'
                : 'border-transparent hover:bg-[#F3F8FF]'
            }`}
          >
            {t.label}
            <span className="rounded-[5px] bg-[#DCECFF] px-1.5 text-xs">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(0)
          }}
          placeholder="Пошук за ім'ям або запитом"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Сортування"
          className="h-8 rounded-[5px] border border-main bg-[#DCECFF] px-3 text-sm text-black focus:ring-2 focus:ring-main/40 focus:outline-none sm:w-[205px]"
        >
          <option value="newest">Спочатку нові</option>
          <option value="oldest">Спочатку старі</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-[5px] border border-main bg-white">
        {/* Заголовки таблиці (на телефоні — картки) */}
        <div className="hidden grid-cols-[1.4fr_1.4fr_1fr_1fr_1.4fr] gap-3 bg-info px-3 py-2 text-sm text-black md:grid">
          <span>Волонтер / контакт</span>
          <span>Запит</span>
          <span>Дата подачі</span>
          <span>Статус</span>
          <span>Дії</span>
        </div>

        {isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-[#8B99AA]">
            Завантаження запитів...
          </p>
        ) : isError ? (
          <p className="px-4 py-8 text-center text-sm text-red-700">
            Не вдалося завантажити запити
          </p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#8B99AA]">
            {tab === 'processed'
              ? 'Опрацьовані запити з’являться тут незабаром'
              : search.trim()
                ? 'Нічого не знайдено'
                : 'Запитів на вступ поки немає'}
          </p>
        ) : (
          <ul className="divide-y divide-[#DCECFF]">
            {visible.map((r) => {
              const { date, time } = formatDateTime(r.created_at)
              const city =
                r.user.city_id !== null
                  ? cityNames.get(r.user.city_id)
                  : undefined
              const contact = [
                r.user.nickname ? `@${r.user.nickname}` : null,
                city,
              ]
                .filter(Boolean)
                .join(' · ')
              const isOpen = openId === r.id
              return (
                <Fragment key={r.id}>
                  <li className="relative grid grid-cols-1 gap-2 bg-[#F3F8FF] px-3 py-3 text-sm md:grid-cols-[1.4fr_1.4fr_1fr_1fr_1.4fr] md:items-center md:gap-3">
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[3px] bg-main"
                    />
                    <div className="flex flex-col">
                      <span className="text-black">{applicantName(r)}</span>
                      <span className="text-xs text-black">
                        {contact || '—'}
                      </span>
                    </div>
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-black">Вступ до організації</span>
                      {r.message && (
                        <button
                          type="button"
                          onClick={() => setOpenId(isOpen ? null : r.id)}
                          aria-expanded={isOpen}
                          className="h-5 cursor-pointer rounded-[5px] border border-main bg-white px-3 text-xs text-black hover:bg-[#F3F8FF]"
                        >
                          {isOpen ? 'Сховати' : 'Переглянути'}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 text-black md:flex-col md:gap-0">
                      <span>{date}</span>
                      <span>{time}</span>
                    </div>
                    <div>
                      <StatusChip />
                    </div>
                    <ReviewButtons />
                  </li>
                  {isOpen && r.message && (
                    <li className="bg-white px-3 py-3 text-sm whitespace-pre-wrap text-black">
                      <span className="font-semibold">Мотивація: </span>
                      {r.message}
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[#DCECFF] px-3 py-2 text-xs text-black">
          <span>
            {filtered.length > 0
              ? `Показано ${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + visible.length} із ${filtered.length} запитів`
              : 'Показано 0 запитів'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 0}
              aria-label="Попередня сторінка"
              className="h-6 w-8 cursor-pointer rounded-[5px] bg-[#C2D4EA] text-sm disabled:cursor-default disabled:opacity-50"
            >
              ←
            </button>
            <span className="flex h-6 min-w-7 items-center justify-center rounded-[5px] bg-[#DCECFF] px-2">
              {currentPage + 1}
            </span>
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= pageCount - 1}
              aria-label="Наступна сторінка"
              className="h-6 w-8 cursor-pointer rounded-[5px] bg-[#C2D4EA] text-sm disabled:cursor-default disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
