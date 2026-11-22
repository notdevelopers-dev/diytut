import type { OrgRole, OrgStatus } from './common'
import type { Project } from './project'

/** Елемент GET /api/organizations (app.schemas.organizations.OrganizationListItem) */
export interface OrganizationListItem {
  id: number
  name: string
  email: string
  phone: string
  city_id: number
  description: string | null
  status: OrgStatus
  created_at: string
}

/** GET /api/organizations/:id (app.schemas.organizations.OrganizationDetailRead) */
export interface OrganizationDetail extends OrganizationListItem {
  edrpou: string | null
  /** Опубліковані проєкти організації */
  projects: Project[]
}

/**
 * Статус заявки (app.models.JoinRequestStatusEnum). `cancelled` буває лише в заявки
 * на проєкт: волонтер відкликав її до початку події
 */
export type JoinRequestStatus =
  'pending' | 'accepted' | 'rejected' | 'cancelled'

/** На що подано заявку (app.models.JoinRequestTargetEnum) */
export type JoinRequestTarget = 'organization' | 'project'

/** Заявка на вступ до організації чи на проєкт (app.schemas.join_requests.JoinRequestRead) */
export interface JoinRequest {
  id: number
  user_id: number
  target: JoinRequestTarget
  organization_id: number
  /** Лише для заявки на проєкт */
  project_id: number | null
  message: string | null
  status: JoinRequestStatus
  reviewed_at: string | null
  created_at: string
}

/** Елемент GET /api/users/me/organizations (OrganizationMembership) */
export interface OrganizationMembership {
  id: number
  name: string
  status: OrgStatus
  role: OrgRole
}
