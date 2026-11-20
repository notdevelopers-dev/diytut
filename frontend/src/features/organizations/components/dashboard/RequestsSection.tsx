import { useCallback, useMemo, useState } from 'react'
import { useCities } from '@/features/cities/hooks'
import { useReviewJoinRequest } from '@/features/organizations/hooks'
import { getApiErrorMessage, getErrorStatus } from '@/lib/errors'
import type {
  JoinRequestDecision,
  OrganizationJoinRequest,
} from '@/types/organization'
import { ConfirmRejectDialog } from './ConfirmRejectDialog'
import { applicantName, JOIN_REQUEST_GRID } from './format'
import { JoinRequestCard } from './JoinRequestCard'
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

type Feedback = { tone: 'success' | 'error'; text: string }

/** Зрозумілі пояснення відмов бекенду (PATCH /api/join-requests/{id}) */
const reviewErrorText = (err: unknown): string => {
  const detail = getApiErrorMessage(err, '')
  if (detail.includes('already been reviewed'))
    return 'Цю заявку вже розглянув інший адміністратор. Список оновлено.'
  if (detail.includes('already a member'))
    return 'Волонтер уже є учасником організації. Список оновлено.'
  if (detail.includes('blocked'))
    return 'Організацію заблоковано, розглядати заявки не можна.'
  const status = getErrorStatus(err)
  if (status === 403)
    return 'Розглядати заявки можуть лише власник і адміністратори.'
  if (status === 404) return 'Заявку не знайдено. Список оновлено.'
  return 'Не вдалося зберегти рішення. Спробуйте ще раз.'
}

/**
 * Вхідні запити за макетом Figma «Сповіщення організації»: вкладки, пошук,
 * сортування й таблиця заявок. Бекенд віддає лише заявки на розгляді, тож
 * «Опрацьовані» поки порожні. «Схвалити» додає волонтера до організації,
 * «Відхилити» — після підтвердження; розглянута заявка зникає зі списку (FE-203).
 */
export const RequestsSection = ({
  organizationId,
  requests,
  canReview,
  isLoading,
  isError,
}: {
  organizationId: number | undefined
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
  const [rejectTarget, setRejectTarget] =
    useState<OrganizationJoinRequest | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const review = useReviewJoinRequest(organizationId)

  const decide = (
    request: OrganizationJoinRequest,
    status: JoinRequestDecision,
  ) => {
    setFeedback(null)
    review.mutate(
      { id: request.id, status },
      {
        onSuccess: () => {
          const name = applicantName(request)
          setFeedback({
            tone: 'success',
            text:
              status === 'accepted'
                ? `${name} тепер учасник вашої організації`
                : `Заявку ${name} відхилено`,
          })
        },
        onError: (err) =>
          setFeedback({ tone: 'error', text: reviewErrorText(err) }),
        onSettled: () => setRejectTarget(null),
      },
    )
  }
  const closeRejectDialog = useCallback(() => setRejectTarget(null), [])

  /** Яка дія виконується для заявки (кнопки цієї заявки неактивні) */
  const pendingActionFor = (id: number) =>
    review.isPending && review.variables?.id === id
      ? review.variables.status
      : null

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

      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-[5px] px-3 py-2 text-sm text-black ${
            feedback.tone === 'success' ? 'bg-[#B5F291]/60' : 'bg-[#E14848]/15'
          }`}
        >
          {feedback.text}
        </p>
      )}

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
        <div
          className={`hidden gap-3 bg-info px-3 py-2 text-sm text-black md:grid ${JOIN_REQUEST_GRID}`}
        >
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
            {visible.map((r) => (
              <JoinRequestCard
                key={r.id}
                request={r}
                cityName={
                  r.user.city_id !== null
                    ? cityNames.get(r.user.city_id)
                    : undefined
                }
                isMessageOpen={openId === r.id}
                onToggleMessage={() => setOpenId(openId === r.id ? null : r.id)}
                onAccept={() => decide(r, 'accepted')}
                onReject={() => setRejectTarget(r)}
                pendingAction={pendingActionFor(r.id)}
              />
            ))}
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

      {rejectTarget && (
        <ConfirmRejectDialog
          applicantName={applicantName(rejectTarget)}
          isPending={review.isPending}
          onConfirm={() => decide(rejectTarget, 'rejected')}
          onCancel={closeRejectDialog}
        />
      )}
    </section>
  )
}
