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

/** Статус заявки на вступ (app.models.JoinRequestStatusEnum) */
export type JoinRequestStatus = 'pending' | 'accepted' | 'rejected'

/** Рішення організації щодо заявки (app.schemas.join_requests.JoinRequestReview) */
export type JoinRequestDecision = Exclude<JoinRequestStatus, 'pending'>

/** Заявка на вступ до організації (app.schemas.join_requests.JoinRequestRead) */
export interface JoinRequest {
  id: number
  user_id: number
  organization_id: number
  message: string | null
  status: JoinRequestStatus
  reviewed_at: string | null
  created_at: string
}

/** Елемент GET /api/organizations/me/join-requests (OrganizationJoinRequestRead) */
export interface OrganizationJoinRequest extends JoinRequest {
  user: {
    id: number
    first_name: string | null
    last_name: string
    nickname: string | null
    city_id: number | null
  }
}

/** Елемент GET /api/users/me/organizations (OrganizationMembership) */
export interface OrganizationMembership {
  id: number
  name: string
  status: OrgStatus
  role: OrgRole
}
