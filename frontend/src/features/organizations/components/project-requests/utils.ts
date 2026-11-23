import { getApiErrorMessage, getErrorStatus } from '@/lib/errors'
import type { JoinRequestStatus } from '@/types/organization'
import { EXPERIENCE_LABELS } from '@/features/projects/utils'
import type {
  ExperienceLevel,
  ProjectDetail,
  ProjectJoinRequest,
} from '@/types/project'

/** Вкладки сторінки заявок: три статуси заявок і список ігнору */
export type RequestsTab = 'pending' | 'accepted' | 'rejected' | 'ignored'

export const REQUEST_TABS: { id: RequestsTab; label: string }[] = [
  { id: 'pending', label: 'На розгляді' },
  { id: 'accepted', label: 'Прийняті' },
  { id: 'rejected', label: 'Відхилені' },
  { id: 'ignored', label: 'Ігноровані' },
]

export const REQUEST_STATUS_META: Record<
  JoinRequestStatus,
  { label: string; className: string }
> = {
  pending: { label: 'На розгляді', className: 'bg-info' },
  accepted: { label: 'Прийнято', className: 'bg-[#B5F291]' },
  rejected: { label: 'Відхилено', className: 'bg-[#E14848]/20' },
  cancelled: { label: 'Скасовано', className: 'bg-[#DCECFF]' },
}

/** "12.50" → «12,5 год» (Decimal з бекенду приходить рядком) */
export const formatHours = (value: string) => {
  const hours = Number(value)
  return `${Number.isFinite(hours) ? hours.toLocaleString('uk-UA') : '0'} год`
}

/**
 * Чому «Прийняти» зараз неактивна, або null. Бекенд перевіряє те саме (R-24),
 * тут лише пояснюємо заздалегідь.
 */
export const acceptBlockReason = (project: ProjectDetail): string | null => {
  if (project.status !== 'published')
    return 'Приймати заявки можна лише в опублікованому проєкті.'
  if (project.starts_at && new Date(project.starts_at) <= new Date())
    return 'Проєкт уже почався: нових учасників прийняти не можна.'
  if (project.capacity !== null && project.accepted_count >= project.capacity)
    return 'Вільних місць немає. Щоб прийняти ще когось, збільште кількість місць у проєкті.'
  return null
}

/** Зрозумілі пояснення відмов бекенду (PATCH /api/join-requests/{id}) */
export const reviewErrorText = (err: unknown): string => {
  const detail = getApiErrorMessage(err, '')
  if (detail.includes('no free places'))
    return 'Вільних місць немає: заявку не прийнято. Список і місця оновлено.'
  if (detail.includes('not open for applications'))
    return 'Проєкт уже не приймає учасників (почався, скасований або ще чернетка).'
  if (detail.includes('under 18'))
    return 'Волонтерові на день проєкту ще не буде 18 років, а проєкт лише для повнолітніх.'
  if (detail.includes('level is too low'))
    return 'Рівень досвіду волонтера нижчий, ніж вимагає проєкт.'
  if (detail.includes('cancelled by the volunteer'))
    return 'Волонтер уже скасував цю заявку. Список оновлено.'
  if (detail.includes('already been reviewed'))
    return 'Цю заявку вже розглянув інший адміністратор. Список оновлено.'
  if (detail.includes('blocked'))
    return 'Організацію заблоковано, розглядати заявки не можна.'
  const status = getErrorStatus(err)
  if (status === 403)
    return 'Розглядати заявки можуть лише власник і адміністратори.'
  if (status === 404) return 'Заявку не знайдено. Список оновлено.'
  return 'Не вдалося зберегти рішення. Спробуйте ще раз.'
}

const LEVEL_ORDER: ExperienceLevel[] = [
  'novice',
  'interested',
  'amateur',
  'experienced',
  'pro',
]

/**
 * Чому саме цього волонтера не можна прийняти, або null: спершу обмеження
 * проєкту (місця, статус), потім рівень досвіду. Вік бекенд не віддає, тож
 * «лише 18+» перевіряє тільки він.
 */
export const applicantBlockReason = (
  project: ProjectDetail,
  request: ProjectJoinRequest,
): string | null => {
  const projectReason = acceptBlockReason(project)
  if (projectReason) return projectReason
  const required = project.experience_level
  if (
    LEVEL_ORDER.indexOf(request.user.experience_level) <
    LEVEL_ORDER.indexOf(required)
  )
    return `Рівень волонтера нижчий, ніж потрібно для проєкту («${EXPERIENCE_LABELS[required]}»).`
  return null
}
