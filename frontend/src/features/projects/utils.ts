import { isAxiosError } from 'axios'
import { getApiErrorMessage, getErrorStatus } from '@/lib/errors'
import type { ExperienceLevel, ProjectCategory } from '@/types/project'

/** Назви рівнів досвіду з документа скоупу (R-27) */
export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  novice: 'Новачок',
  interested: 'Зацікавлений',
  amateur: 'Аматор',
  experienced: 'Досвідчений',
  pro: 'Профі',
}

/** Усі сфери бекенду (app.models.project.ProjectCategoryEnum), щоб відсіяти невідомі з URL */
export const PROJECT_CATEGORIES: readonly ProjectCategory[] = [
  'ecology',
  'education',
  'children',
  'idp',
  'military',
  'veterans',
  'medicine',
  'mental_health',
  'disability',
  'animals',
  'elderly',
  'social',
  'humanitarian',
  'fundraising',
  'legal',
  'culture',
  'sports',
  'tech',
  'media',
  'rebuild',
  'other',
]

export const isProjectCategory = (value: string): value is ProjectCategory =>
  (PROJECT_CATEGORIES as readonly string[]).includes(value)

/**
 * Посилання на каталог із фільтром: `/projects?q=%23толока` або
 * `/projects?categories=ecology`. Каталог читає ці параметри при відкритті.
 */
export const projectsCatalogUrl = (filter: {
  tag?: string
  category?: ProjectCategory
}) => {
  const params = new URLSearchParams()
  if (filter.tag) params.set('q', `#${filter.tag}`)
  if (filter.category) params.set('categories', filter.category)
  return `/projects?${params.toString()}`
}

/** «Через 17 хв» тощо для заголовка Retry-After (секунди) */
export const formatRetryAfter = (seconds: number) => {
  if (seconds < 60) return `${seconds} с`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} хв`
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)} год`
  return `${Math.ceil(seconds / 86400)} дн`
}

/** Тексти для відповідей бекенду на заявку на проєкт (app.errors) */
export const projectJoinErrorText = (error: unknown) => {
  const detail = getApiErrorMessage(error, '')
  switch (getErrorStatus(error)) {
    case 409:
      if (detail.includes('free places'))
        return 'На проєкті не лишилося вільних місць.'
      if (detail.includes('already started')) return 'Проєкт уже розпочався.'
      if (detail.includes('owner or admin'))
        return 'Організатори не можуть подати запит на власний проєкт.'
      return 'Ви вже надіслали запит на цей проєкт.'
    case 403:
      if (detail.includes('adults only')) return 'Проєкт лише для повнолітніх.'
      if (detail.includes('Experience level'))
        return 'Ваш рівень досвіду поки замалий для цього проєкту.'
      return 'Організація не приймає ваших запитів.'
    case 429: {
      const seconds = isAxiosError(error)
        ? Number(error.response?.headers['retry-after'])
        : NaN
      return Number.isFinite(seconds) && seconds > 0
        ? `Повторний запит можна надіслати через ${formatRetryAfter(seconds)}.`
        : 'Повторний запит можна надіслати пізніше.'
    }
    case 401:
      return 'Сесія завершилась. Увійдіть знову.'
    case 404:
      return 'Проєкт не знайдено.'
    default:
      return 'Не вдалося надіслати запит. Спробуйте ще раз.'
  }
}

/** Тексти для помилок скасування заявки */
export const projectCancelErrorText = (error: unknown) => {
  switch (getErrorStatus(error)) {
    case 409:
      return 'Проєкт уже розпочався: скасувати запит не можна.'
    case 404:
      return 'Активного запиту вже немає.'
    default:
      return 'Не вдалося скасувати запит. Спробуйте ще раз.'
  }
}

/** Події відбуваються в Україні: дні й час показуємо за київським часом, як бекенд */
const EVENT_TIME_ZONE = 'Europe/Kyiv'

/** День події: «2026-11-30» (starts_on) чи ISO-момент (starts_at) → Date для формату */
const toEventDate = (value: string) =>
  // Дата без часу — це вже київський день: беремо полудень UTC, щоб пояс не зсунув
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value)

const dayFormat = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'long',
  timeZone: EVENT_TIME_ZONE,
})

const timeFormat = new Intl.DateTimeFormat('uk-UA', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: EVENT_TIME_ZONE,
})

/** «30 листопада» або «30 листопада – 2 грудня» для багатоденної події */
export const formatEventDays = (start: string | null, end: string | null) => {
  if (!start) return null
  const from = toEventDate(start)
  if (Number.isNaN(from.getTime())) return null
  const fromText = dayFormat.format(from)
  const to = end ? toEventDate(end) : null
  const toText =
    to && !Number.isNaN(to.getTime()) ? dayFormat.format(to) : fromText
  return toText === fromText ? fromText : `${fromText} – ${toText}`
}

/** «з 10:00 до 14:00»; якщо подія триває кілька днів — з датами */
export const formatEventTime = (start: string | null, end: string | null) => {
  if (!start) return null
  const from = new Date(start)
  if (Number.isNaN(from.getTime())) return null
  const to = end ? new Date(end) : null
  if (!to || Number.isNaN(to.getTime())) return `з ${timeFormat.format(from)}`
  if (dayFormat.format(from) === dayFormat.format(to)) {
    return `з ${timeFormat.format(from)} до ${timeFormat.format(to)}`
  }
  return `з ${dayFormat.format(from)}, ${timeFormat.format(from)} до ${dayFormat.format(to)}, ${timeFormat.format(to)}`
}

/** "4.00" → «4 години», "1.5" → «1,5 години», "5" → «5 годин» */
export const formatWorkHours = (hours: string | null) => {
  const value = hours === null ? NaN : Number(hours)
  if (!Number.isFinite(value) || value <= 0) return null
  const text = value.toLocaleString('uk-UA', { maximumFractionDigits: 2 })
  if (!Number.isInteger(value)) return `${text} години`
  const lastTwo = value % 100
  const last = value % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${text} годин`
  if (last === 1) return `${text} година`
  if (last >= 2 && last <= 4) return `${text} години`
  return `${text} годин`
}
