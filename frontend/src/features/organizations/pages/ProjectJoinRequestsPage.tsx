import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import avatarIcon from '@/assets/icons/menu/avatar.svg'
import { useCities } from '@/features/cities/hooks'
import { ConfirmRejectDialog } from '@/features/organizations/components/dashboard/ConfirmRejectDialog'
import {
  applicantName,
  formatDateTime,
} from '@/features/organizations/components/dashboard/format'
import {
  EmptyState,
  InfoPill,
  SearchField,
  SectionTitle,
} from '@/features/organizations/components/dashboard/shared'
import {
  ProjectRequestCard,
  type PendingAction,
} from '@/features/organizations/components/project-requests/ProjectRequestCard'
import {
  applicantBlockReason,
  REQUEST_TABS,
  reviewErrorText,
  type RequestsTab,
} from '@/features/organizations/components/project-requests/utils'
import {
  useIgnoredUsers,
  useUnignoreUser,
} from '@/features/organizations/hooks'
import {
  useProject,
  useProjectJoinRequests,
  useReviewProjectJoinRequest,
} from '@/features/projects/hooks'
import { getErrorStatus } from '@/lib/errors'
import type { ProjectJoinRequest } from '@/types/project'

type Feedback = { tone: 'success' | 'error'; text: string }

const matches = (query: string, values: (string | null | undefined)[]) =>
  !query || values.some((value) => (value ?? '').toLowerCase().includes(query))

/**
 * Заявки на проєкт (SCRUM-164, /organization/projects/:id/join-requests — шлях зі
 * сповіщень бекенду). Місця x/y, «Прийняти» (не більше, ніж місць, R-24),
 * «Відхилити», «Відхилити й ігнорувати» та список ігнорованих зі зняттям ігнору.
 */
export const ProjectJoinRequestsPage = () => {
  const projectId = Number(useParams().id) || 0
  const { cities } = useCities()
  const cityNames = useMemo(
    () => new Map(cities.map((c) => [c.id, c.name])),
    [cities],
  )

  const [tab, setTab] = useState<RequestsTab>('pending')
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{
    request: ProjectJoinRequest
    ignore: boolean
  } | null>(null)

  const {
    data: project,
    isLoading: isProjectLoading,
    error: projectError,
  } = useProject(projectId)
  const organizationId = project?.organization_id
  const requestsQuery = useProjectJoinRequests(
    projectId,
    tab === 'ignored' ? 'pending' : tab,
    tab !== 'ignored' && Boolean(project),
  )
  const ignoredQuery = useIgnoredUsers(organizationId, tab === 'ignored')
  const review = useReviewProjectJoinRequest(projectId)
  const unignore = useUnignoreUser(organizationId)

  const query = search.trim().toLowerCase()
  const requests = useMemo(
    () =>
      (requestsQuery.data?.pages.flat() ?? []).filter((r) =>
        matches(query, [applicantName(r), r.user.nickname, r.message]),
      ),
    [requestsQuery.data, query],
  )
  const ignored = useMemo(
    () =>
      (ignoredQuery.data ?? []).filter((item) =>
        matches(query, [
          [item.user.first_name, item.user.last_name].filter(Boolean).join(' '),
          item.user.nickname,
        ]),
      ),
    [ignoredQuery.data, query],
  )

  const decide = (
    request: ProjectJoinRequest,
    action: Exclude<PendingAction, null>,
  ) => {
    setFeedback(null)
    const name = applicantName(request)
    review.mutate(
      {
        id: request.id,
        status: action === 'accept' ? 'accepted' : 'rejected',
        ignore: action === 'ignore',
      },
      {
        onSuccess: () =>
          setFeedback({
            tone: 'success',
            text:
              action === 'accept'
                ? `${name} — учасник проєкту`
                : action === 'ignore'
                  ? `Заявку ${name} відхилено, волонтера додано до ігнорованих`
                  : `Заявку ${name} відхилено`,
          }),
        onError: (err) =>
          setFeedback({ tone: 'error', text: reviewErrorText(err) }),
        onSettled: () => setRejectTarget(null),
      },
    )
  }
  const closeDialog = useCallback(() => setRejectTarget(null), [])

  const pendingActionFor = (id: number): PendingAction => {
    if (!review.isPending || review.variables?.id !== id) return null
    if (review.variables.status === 'accepted') return 'accept'
    return review.variables.ignore ? 'ignore' : 'reject'
  }

  const removeIgnore = (userId: number, name: string) => {
    setFeedback(null)
    unignore.mutate(userId, {
      onSuccess: () =>
        setFeedback({
          tone: 'success',
          text: `Ігнор знято: ${name} знову може подавати заявки`,
        }),
      onError: () =>
        setFeedback({
          tone: 'error',
          text: 'Не вдалося зняти ігнор. Спробуйте ще раз.',
        }),
    })
  }

  // Проєкт не знайдено або він чужий: бекенд відповідає 404
  if (!isProjectLoading && (projectError || !project)) {
    const status = getErrorStatus(projectError)
    return (
      <div className="flex flex-col">
        <SectionTitle>Вхідні запити</SectionTitle>
        <div className="mx-auto w-full max-w-[860px] px-3 py-6">
          <EmptyState
            title={
              status === 404
                ? 'Проєкт не знайдено'
                : 'Не вдалося завантажити проєкт'
            }
            text={
              status === 404
                ? 'Можливо, його видалено або він належить іншій організації.'
                : 'Оновіть сторінку або спробуйте пізніше.'
            }
          >
            <Link
              to="/organization/dashboard"
              className="text-sm text-black underline"
            >
              До панелі організації
            </Link>
          </EmptyState>
        </div>
      </div>
    )
  }

  const listError = tab === 'ignored' ? ignoredQuery.error : requestsQuery.error
  const isListLoading =
    isProjectLoading ||
    (tab === 'ignored' ? ignoredQuery.isLoading : requestsQuery.isLoading)

  return (
    <div className="flex flex-col">
      <SectionTitle>Вхідні запити</SectionTitle>

      <section
        aria-label="Заявки на проєкт"
        className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-3 py-5"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              to="/organization/dashboard"
              className="w-fit text-xs text-[#5F6F82] hover:text-black"
            >
              ← Проєкти організації
            </Link>
            <h2 className="text-xl font-normal break-words text-black">
              {project?.title ?? 'Завантаження…'}
            </h2>
          </div>
          {project && (
            <span
              className={`inline-flex h-7 w-fit shrink-0 items-center rounded-[5px] px-3 text-sm text-black ${
                project.capacity !== null &&
                project.accepted_count >= project.capacity
                  ? 'bg-[#E14848]/20'
                  : 'bg-[#DCECFF]'
              }`}
            >
              Місця: {project.accepted_count} / {project.capacity ?? '—'}
            </span>
          )}
        </div>

        {feedback && (
          <p
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={`rounded-[5px] px-3 py-2 text-sm text-black ${
              feedback.tone === 'success'
                ? 'bg-[#B5F291]/60'
                : 'bg-[#E14848]/15'
            }`}
          >
            {feedback.text}
          </p>
        )}

        <div
          role="tablist"
          aria-label="Заявки за статусом"
          className="flex flex-wrap gap-2 border-b border-[#DCECFF]"
        >
          {REQUEST_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-sm text-black ${
                tab === t.id
                  ? 'border-main bg-[#DCECFF]'
                  : 'border-transparent hover:bg-[#F3F8FF]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Пошук учасника"
        />

        {isListLoading ? (
          <p className="py-8 text-center text-sm text-[#8B99AA]">
            Завантаження…
          </p>
        ) : listError ? (
          <EmptyState
            title={
              getErrorStatus(listError) === 403
                ? 'Розгляд заявок недоступний'
                : 'Не вдалося завантажити'
            }
            text={
              getErrorStatus(listError) === 403
                ? 'Заявки на проєкти розглядають власник і адміністратори організації.'
                : 'Оновіть сторінку або спробуйте пізніше.'
            }
          />
        ) : tab === 'ignored' ? (
          ignored.length === 0 ? (
            <EmptyState
              title={query ? 'Нічого не знайдено' : 'Ігнорованих немає'}
              text="Сюди потрапляють волонтери, чиї заявки відхилено з ігнором. Вони не можуть подавати заявки на проєкти вашої організації."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {ignored.map((item) => {
                const name = [item.user.first_name, item.user.last_name]
                  .filter(Boolean)
                  .join(' ')
                const since = formatDateTime(item.created_at)
                const isThis =
                  unignore.isPending && unignore.variables === item.user.id
                return (
                  <li
                    key={item.user.id}
                    className="flex flex-col gap-2 rounded-[5px] border border-[#DCECFF] bg-[#F7FBFF] p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <img src={avatarIcon} alt="" width={40} height={40} />
                      <div className="flex min-w-0 flex-col gap-1">
                        <InfoPill className="h-6 text-sm">{name}</InfoPill>
                        <span className="px-1 text-xs text-[#5F6F82]">
                          {item.user.nickname
                            ? `@${item.user.nickname} · `
                            : ''}
                          в ігнорі з {since.date}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeIgnore(item.user.id, name)}
                      disabled={unignore.isPending}
                      className="h-7 cursor-pointer rounded-[5px] border border-main bg-white px-3 text-sm text-black hover:bg-[#F3F8FF] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isThis ? 'Зняття…' : 'Зняти ігнор'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        ) : requests.length === 0 ? (
          <EmptyState
            title={
              query
                ? 'Нічого не знайдено'
                : tab === 'pending'
                  ? 'Нових заявок немає'
                  : tab === 'accepted'
                    ? 'Прийнятих заявок ще немає'
                    : 'Відхилених заявок немає'
            }
            text={
              tab === 'pending'
                ? 'Коли волонтер подасть заявку на цей проєкт, ви отримаєте сповіщення, а заявка з’явиться тут.'
                : 'Тут показуються заявки з цим статусом.'
            }
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {requests.map((r) => (
                <ProjectRequestCard
                  key={r.id}
                  request={r}
                  cityName={
                    r.user.city_id !== null
                      ? cityNames.get(r.user.city_id)
                      : undefined
                  }
                  acceptHint={project ? applicantBlockReason(project, r) : null}
                  pendingAction={pendingActionFor(r.id)}
                  isBusy={review.isPending}
                  onAccept={() => decide(r, 'accept')}
                  onReject={() =>
                    setRejectTarget({ request: r, ignore: false })
                  }
                  onIgnore={() => setRejectTarget({ request: r, ignore: true })}
                />
              ))}
            </ul>
            {requestsQuery.hasNextPage && (
              <button
                type="button"
                onClick={() => void requestsQuery.fetchNextPage()}
                disabled={requestsQuery.isFetchingNextPage}
                className="mx-auto h-8 cursor-pointer rounded-[5px] border border-main bg-white px-4 text-sm text-black hover:bg-[#F3F8FF] disabled:opacity-60"
              >
                {requestsQuery.isFetchingNextPage
                  ? 'Завантаження…'
                  : 'Показати ще'}
              </button>
            )}
          </>
        )}
      </section>

      {rejectTarget && (
        <ConfirmRejectDialog
          applicantName={applicantName(rejectTarget.request)}
          withIgnore={rejectTarget.ignore}
          isPending={review.isPending}
          onConfirm={() =>
            decide(
              rejectTarget.request,
              rejectTarget.ignore ? 'ignore' : 'reject',
            )
          }
          onCancel={closeDialog}
        />
      )}
    </div>
  )
}

export default ProjectJoinRequestsPage
