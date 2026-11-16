export type OrgRole = 'owner' | 'admin' | 'member'
export type OrgStatus = 'pending' | 'approved' | 'rejected' | 'blocked'

/** Місто з GET /api/cities */
export interface CityItem {
  id: number
  name: string
  region: string
}
