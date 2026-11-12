export interface CityInfo {
  id: number
  name: string
  region?: string
}

export type OrgStatus = 'pending' | 'approved' | 'rejected' | 'blocked'

export interface OrganizationListItem {
  id: number
  name: string
  city_id: number
  city?: string | CityInfo | null
  description?: string | null
  logo?: string | null
  logo_url?: string | null
  status: OrgStatus
  is_verified?: boolean
  projects_count?: number
  projectsCount?: number
  email?: string | null
  phone?: string | null
  edrpou?: string | null
  created_at?: string
}

export interface OrganizationFilterState {
  cityId: number | null
  search?: string
}
