export type OrgStatus = 'pending' | 'approved' | 'rejected' | 'blocked'
export type JoinRequestStatus = 'pending' | 'accepted' | 'rejected'

export interface CityInfo {
  id: number
  name: string
  region?: string
}

export interface OrganizationDetails {
  id: number
  name: string
  email: string
  phone: string
  city_id: number
  city?: string | CityInfo | null
  city_name?: string | null
  description?: string | null
  edrpou?: string | null
  status: OrgStatus
  is_verified?: boolean
  created_at?: string
  projects_count?: number
  user_request_status?: JoinRequestStatus | null
  is_user_member?: boolean
}

export interface JoinRequestCreatePayload {
  message?: string
  motivation?: string
}

export interface JoinRequestResponse {
  id: number
  organization_id: number
  user_id: number
  message?: string | null
  status: JoinRequestStatus
  created_at: string
}

export interface JoinRequestStatusResponse {
  status: JoinRequestStatus | null
  id?: number | null
  created_at?: string | null
}
