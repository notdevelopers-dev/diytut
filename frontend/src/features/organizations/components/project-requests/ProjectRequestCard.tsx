import avatarIcon from '@/assets/icons/menu/avatar.svg'
import { EXPERIENCE_LABELS } from '@/features/projects/utils'
import type { ProjectJoinRequest } from '@/types/project'
import { applicantName, formatDateTime } from '../dashboard/format'
import { InfoPill } from '../dashboard/shared'
import { formatHours, REQUEST_STATUS_META } from './utils'

export type PendingAction = 'accept' | 'reject' | 'ignore' | null

/**
 * Заявка на проєкт за макетом Figma «Requests»: аватар, ім’я, нікнейм і місто,
 * рівень і години (R-27) та супровідний лист праворуч — там, де в макеті
 * «Біографія». Контактів організатор не бачить (бекенд їх не віддає).
 * Кнопки — лише для заявок на розгляді.
 */
export const ProjectRequestCard = ({
  request,
  cityName,
  acceptHint,
  pendingAction,
  isBusy,
  onAccept,
  onReject,
  onIgnore,
}: {
  request: ProjectJoinRequest
  cityName?: string
  /** Чому «Прийняти» неактивна (місць немає, проєкт закритий, рівень); null — можна */
  acceptHint: string | null
  /** Яка дія зараз виконується саме для цієї заявки */
  pendingAction: PendingAction
  /** Триває будь-яке рішення на сторінці: інші кнопки теж чекають */
  isBusy: boolean
  onAccept: () => void
  onReject: () => void
  onIgnore: () => void
}) => {
  const name = applicantName(request)
  const created = formatDateTime(request.created_at)
  const reviewed = request.reviewed_at
    ? formatDateTime(request.reviewed_at)
    : null
  const meta = REQUEST_STATUS_META[request.status]
  const subtitle = [
    request.user.nickname ? `@${request.user.nickname}` : null,
    cityName,
  ]
    .filter(Boolean)
    .join(' · ')
  const isPending = request.status === 'pending'
  const canAccept = acceptHint === null

  return (
    <li className="flex flex-col gap-3 rounded-[5px] border border-[#DCECFF] bg-[#F7FBFF] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:flex-row md:items-stretch md:gap-4">
      {/* Волонтер: аватар і «пігулки», як у макеті */}
      <div className="flex min-w-0 flex-col gap-1.5 md:w-[250px] md:shrink-0">
        <div className="flex items-center gap-2">
          <img
            src={avatarIcon}
            alt=""
            width={54}
            height={54}
            className="shrink-0"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <InfoPill className="h-6 text-sm">{name}</InfoPill>
            <InfoPill className="h-5 text-xs">{subtitle || '—'}</InfoPill>
          </div>
        </div>
        <InfoPill className="h-5 justify-center text-xs">
          {EXPERIENCE_LABELS[request.user.experience_level]} ·{' '}
          {formatHours(request.user.confirmed_hours)}
        </InfoPill>
      </div>

      {/* Супровідний лист на місці «Біографії» з макета */}
      <div className="min-h-[68px] min-w-0 flex-1 rounded-[5px] border border-[#DCECFF] bg-white px-2 py-1 text-xs break-words whitespace-pre-wrap text-black">
        {request.message ? (
          request.message
        ) : (
          <span className="text-[#8B99AA]">Без супровідного листа</span>
        )}
      </div>

      <div className="flex flex-col justify-between gap-2 md:w-[300px] md:shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5F6F82]">
          <span>
            Подано {created.date}, {created.time}
          </span>
          {!isPending && (
            <span
              className={`inline-flex h-6 items-center rounded-[5px] px-3 text-black ${meta.className}`}
            >
              {meta.label}
              {reviewed && ` · ${reviewed.date}`}
            </span>
          )}
        </div>

        {isPending && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onAccept}
                disabled={isBusy || !canAccept}
                title={acceptHint ?? undefined}
                aria-label={`Прийняти заявку: ${name}`}
                className="h-6 cursor-pointer rounded-[5px] bg-[#B5F291] px-3 text-sm text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === 'accept' ? 'Прийняття…' : 'Прийняти'}
              </button>
              <button
                type="button"
                onClick={onReject}
                disabled={isBusy}
                aria-label={`Відхилити заявку: ${name}`}
                className="h-6 cursor-pointer rounded-[5px] bg-[#E14848] px-3 text-sm text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === 'reject' ? 'Відхилення…' : 'Відхилити'}
              </button>
            </div>
            <button
              type="button"
              onClick={onIgnore}
              disabled={isBusy}
              aria-label={`Відхилити й ігнорувати: ${name}`}
              className="h-6 cursor-pointer rounded-[5px] border border-[#E14848] bg-white px-3 text-xs text-[#B42323] hover:bg-[#FDECEC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === 'ignore'
                ? 'Відхилення…'
                : 'Відхилити й ігнорувати'}
            </button>
            {acceptHint && (
              <p className="text-[11px] text-[#5F6F82]">{acceptHint}</p>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
