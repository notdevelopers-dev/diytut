import type { OrganizationData } from '@/features/auth/types'
import type { OrgRole, OrgStatus } from '@/types/common'

const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Власник',
  admin: 'Адміністратор',
  member: 'Учасник',
}

const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  pending: 'На перевірці',
  approved: 'Підтверджена',
  rejected: 'Відхилена',
  blocked: 'Заблокована',
}

/** Підпис ролі; для невідомої ролі не вигадуємо «Власник» */
export const getOrgRoleLabel = (role: string | undefined): string =>
  (role && ORG_ROLE_LABELS[role as OrgRole]) || 'Невідома роль'

export const getOrgStatusLabel = (status: string | undefined): string | null =>
  (status && ORG_STATUS_LABELS[status as OrgStatus]) || null

/**
 * Чи можна редагувати профіль організації. Повторює перевірку бекенду
 * (PATCH /organizations/me): лише owner чи admin і лише не заблокована організація.
 */
export const canEditOrganization = (
  org: OrganizationData | null | undefined,
): boolean =>
  Boolean(org) &&
  (org?.role === 'owner' || org?.role === 'admin') &&
  org?.status !== 'blocked'

/** Правильне відмінювання слова «проєкт» для української мови */
export const formatProjectsCount = (count: number): string => {
  const abs = Math.abs(count) % 100
  const rem = abs % 10

  if (abs > 10 && abs < 20) {
    return `${count} проєктів`
  }
  if (rem > 1 && rem < 5) {
    return `${count} проєкти`
  }
  if (rem === 1) {
    return `${count} проєкт`
  }
  return `${count} проєктів`
}

/** Дата й час реєстрації для таблиці: «13.11.2026» і «10:42» окремими рядками. */
export const formatDateTime = (iso: string): { date: string; time: string } => {
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return { date: '—', time: '' }
  return {
    date: value.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    time: value.toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}
