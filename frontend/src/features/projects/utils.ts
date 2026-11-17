import { isAxiosError } from 'axios'
import { getApiErrorMessage, getErrorStatus } from '@/lib/errors'
import type { ProjectCategory } from '@/types/project'

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
const formatRetryAfter = (seconds: number) => {
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
