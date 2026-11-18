import type { ProfileMode } from '@/features/users/profileMode'
import type { AppNotification } from './api'

/**
 * Сповіщення належать користувачеві, а не режиму, тож ділимо їх за типом:
 * у режимі організації — те, що стосується організації, у профілі — решта.
 */
const ORGANIZATION_TYPES = new Set<string>([
  'join_request_received',
  'join_request_cancelled',
  'organization_approved',
  'organization_rejected',
])

export const isOrganizationNotification = (n: AppNotification) =>
  ORGANIZATION_TYPES.has(n.type)

/**
 * Сповіщення для поточного режиму. Без організації режим завжди «волонтер»,
 * тож тоді показуємо все (напр. «організацію відхилено» творцю, якого бекенд
 * уже не вважає учасником).
 */
export const filterByMode = (
  items: AppNotification[],
  mode: ProfileMode,
  hasOrganization: boolean,
): AppNotification[] => {
  if (!hasOrganization) return items
  return items.filter((n) =>
    mode === 'organization'
      ? isOrganizationNotification(n)
      : !isOrganizationNotification(n),
  )
}

type Tone = 'info' | 'success' | 'danger' | 'neutral'

/** Коротка позначка й колір для кожного типу; невідомий тип — «Сповіщення» */
const TYPE_META: Record<string, { label: string; tone: Tone }> = {
  join_request_received: { label: 'Нова заявка', tone: 'info' },
  join_request_cancelled: { label: 'Заявку скасовано', tone: 'neutral' },
  join_request_accepted: { label: 'Прийнято', tone: 'success' },
  join_request_rejected: { label: 'Відхилено', tone: 'danger' },
  project_cancelled: { label: 'Проєкт скасовано', tone: 'danger' },
  hours_credited: { label: 'Години', tone: 'success' },
  level_up: { label: 'Новий рівень', tone: 'success' },
  review_available: { label: 'Відгук', tone: 'info' },
  organization_approved: { label: 'Схвалено', tone: 'success' },
  organization_rejected: { label: 'Відхилено', tone: 'danger' },
}

const TONE_CLASSES: Record<Tone, string> = {
  info: 'border-main bg-[#DCECFF] text-[#2f6fb8]',
  success: 'border-[#7BC74D] bg-[#E9F9DD] text-[#3E7A1C]',
  danger: 'border-[#E14848] bg-[#FDECEC] text-[#B42323]',
  neutral: 'border-[#C2D4EA] bg-white text-[#5F6F82]',
}

export const getTypeMeta = (type: string) => {
  const meta = TYPE_META[type] ?? { label: 'Сповіщення', tone: 'neutral' }
  return { label: meta.label, className: TONE_CLASSES[meta.tone] }
}

/**
 * Посилання, сторінки для яких уже є. Решта (кабінет організації FE-201,
 * розгляд заявок FE-203) поки не клікабельні: клік лише позначає прочитаним.
 */
const OPENABLE_LINKS = [/^\/organizations\/\d+$/, /^\/organization\/edit(\?|$)/]

export const getOpenableLink = (link: string | null): string | null =>
  link && OPENABLE_LINKS.some((re) => re.test(link)) ? link : null

/** 2026-11-18T10:42:00Z → «18.11.2026» і «12:42» (час користувача) */
export const formatNotificationDate = (iso: string) => {
  const date = new Date(iso)
  return {
    date: date.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    time: date.toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}
