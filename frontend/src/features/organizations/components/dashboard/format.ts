import type { OrganizationJoinRequest } from '@/types/organization'

/** 2026-11-18T10:42:00Z → { date: «18.11.2026», time: «12:42» } */
export const formatDateTime = (iso: string) => {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
  }
}

/** Ім’я волонтера із заявки: «Марія Коваль» */
export const applicantName = (r: OrganizationJoinRequest) =>
  [r.user.first_name, r.user.last_name].filter(Boolean).join(' ')

/** Колонки заявки: табличний рядок на десктопі й картка на телефоні (Figma «Сповіщення організації») */
export const JOIN_REQUEST_GRID =
  'md:grid-cols-[1.4fr_1.4fr_1fr_1fr_1.4fr] md:items-center md:gap-3'
