export type ExperienceLevel = 'novice' | 'intermediate' | 'advanced'
export type ProjectStatus = 'draft' | 'published' | 'completed' | 'cancelled'

export interface OrganizationInfo {
  id?: number
  name: string
  avatar_url?: string
}

export interface CityInfo {
  id?: number
  name: string
  region?: string
}

export interface Project {
  id: number | string
  title: string
  description: string
  organization?: string | OrganizationInfo
  organization_name?: string
  organization_id?: number
  tags: string[]
  starts_at?: string
  ends_at?: string
  is_online?: boolean
  city_id?: number | null
  city?: string | CityInfo | null
  address?: string | null
  capacity?: number
  volunteer_hours?: number | string
  is_adult_only?: boolean
  experience_level?: ExperienceLevel
  status?: ProjectStatus
  created_at?: string
  updated_at?: string
  image_url?: string
}
