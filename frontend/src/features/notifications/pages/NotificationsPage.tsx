import { useMemo, useState } from 'react'
import { useMarkAllRead, useNotifications } from '../hooks'
import { NotificationItem } from '../components/NotificationItem'

type Tab = 'all' | 'unread'
type Sort = 'newest' | 'oldest'

/** «1 нове», «2 нові», «5 нових» */
const pluralNew = (n: number) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} нове сповіщення`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return `${n} нові сповіщення`
  return `${n} нових сповіщень`
}

/**
 * Усі сповіщення поточного режиму (/notifications). Вигляд — за макетом Figma
 * «Сповіщення організації»: заголовок, вкладки, пошук і сортування. Кнопок
 * «Схвалити» / «Відхилити» тут немає — це розгляд заявок (FE-203).
 */
export const NotificationsPage = () => {
  const {
    items,
    unreadCount,
    mode,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useNotifications()
  const { mutate: markAllRead, isPending } = useMarkAllRead()
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('newest')

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = items.filter(
      (n) =>
        (tab === 'all' || !n.is_read) &&
        (!query ||
          n.title.toLowerCase().includes(query) ||
          n.message.toLowerCase().includes(query)),
    )
    // Бекенд віддає нові спершу
    return sort === 'newest' ? filtered : [...filtered].reverse()
  }, [items, tab, search, sort])

  const title =
    mode === 'organization' ? 'Сповіщення організації' : 'Сповіщення'

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'Усі', count: items.length },
    { id: 'unread', label: 'Непрочитані', count: unreadCount },
  ]

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-6 sm:px-8">
      {/* Заголовок і «Позначити все прочитаним» */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="w-fit rounded-xl bg-info px-4 py-1.5 text-2xl font-normal text-black">
            {title}
          </h1>
          <p className="text-sm text-[#5F6F82]">
            {unreadCount > 0
              ? `${pluralNew(unreadCount)} чекають на вас`
              : 'Нових сповіщень немає'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => markAllRead(items)}
          disabled={unreadCount === 0 || isPending}
          className="cursor-pointer text-sm font-medium text-black hover:text-main disabled:cursor-default disabled:text-[#8B99AA]"
        >
          ✓ Позначити все прочитаним
        </button>
      </div>

      {/* Вкладки */}
      <div role="tablist" className="flex gap-2 border-b border-[#DCECFF] pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-main text-white'
                : 'bg-[#DCECFF] text-black hover:bg-[#cde2fe]'
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 text-xs ${
                tab === t.id ? 'bg-white text-main' : 'bg-white text-black'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Пошук і сортування */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук у сповіщеннях"
          aria-label="Пошук у сповіщеннях"
          className="h-10 w-full rounded-full border border-main bg-[#DCECFF] px-5 text-sm text-black placeholder:text-[#8B99AA] focus:ring-2 focus:ring-main/40 focus:outline-none sm:flex-1"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Сортування"
          className="h-10 rounded-full border border-main bg-white px-4 text-sm text-black focus:ring-2 focus:ring-main/40 focus:outline-none"
        >
          <option value="newest">Спочатку нові</option>
          <option value="oldest">Спочатку старі</option>
        </select>
      </div>

      {/* Список */}
      <div className="overflow-hidden rounded-2xl border-2 border-[#DCECFF] bg-white">
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-[#8B99AA]">
            Завантаження сповіщень...
          </p>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <p className="text-sm text-red-700">
              Не вдалося завантажити сповіщення
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="cursor-pointer rounded-full bg-main px-5 py-2 text-sm font-medium text-white"
            >
              Спробувати знову
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#8B99AA]">
            {search.trim()
              ? 'Нічого не знайдено'
              : tab === 'unread'
                ? 'Усі сповіщення прочитано'
                : 'Сповіщень поки немає'}
          </p>
        ) : (
          <div className="divide-y divide-[#EEF4FB]">
            {visible.map((n) => (
              <NotificationItem key={n.id} notification={n} />
            ))}
          </div>
        )}
      </div>

      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mx-auto cursor-pointer rounded-full border border-main bg-white px-6 py-2 text-sm font-medium text-main hover:bg-[#F3F8FF] disabled:opacity-60"
        >
          {isFetchingNextPage ? 'Завантаження...' : 'Показати ще'}
        </button>
      )}
    </div>
  )
}

export default NotificationsPage
