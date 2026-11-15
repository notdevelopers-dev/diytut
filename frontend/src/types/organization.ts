import type { OrgStatus } from './common'

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
