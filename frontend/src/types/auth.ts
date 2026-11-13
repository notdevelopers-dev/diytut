import type { OrgRole, OrgStatus } from '../utils/organization'

export type Role = 'volunteer' | 'organization' | 'admin'

export interface OrganizationData {
  id?: number | string
  name: string
  email?: string
  phone?: string
  cityId?: number
  cityName?: string
  edrpou?: string | null
  description?: string
  /** Роль користувача в організації (як її повертає бекенд) */
  role?: OrgRole
  status?: OrgStatus
}

export interface User {
  id?: string
  name?: string
  firstName?: string
  lastName?: string
  nickname?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  gender?: 'prefer_not_to_say' | 'prefer_not_to_tell' | 'female' | 'male'
  city?: string
  bio?: string
  role: Role
  isProfileComplete: boolean
  isProfileCompleted?: boolean
  organization?: OrganizationData | null
}
