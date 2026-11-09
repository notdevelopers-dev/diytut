import type { OrganizationData } from '../types/auth'

export type OrgRole = 'owner' | 'admin' | 'member'
export type OrgStatus = 'pending' | 'approved' | 'rejected' | 'blocked'

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
