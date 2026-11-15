import { apiClient } from '@/lib/api-client'
import type { OrgRole, OrgStatus } from '@/types/common'

// Відповідь GET /api/auth/me (app.routers.auth)
export type MeResponse =
  | {
      status: 'authenticated'
      user: {
        id: number
        email: string
        first_name: string
        last_name: string
        nickname: string
        phone: string
        birth_date: string
        gender: 'male' | 'female' | 'prefer_not_to_say'
        bio: string | null
        platform_role: 'user' | 'admin'
      }
      // Організація користувача або null
      organization?: {
        id: number
        name: string
        status: OrgStatus
        role: OrgRole
      } | null
    }
  | {
      status: 'registration_required'
      email: string
      first_name: string | null
      last_name: string | null
    }

/** Контракт запиту реєстрації (app.schemas.users.RegistrationRequest) */
export interface RegistrationPayload {
  first_name: string
  last_name: string
  nickname: string | null
  phone: string
  birth_date: string
  gender: 'prefer_not_to_say' | 'female' | 'male'
  city_id: number
  bio: string | null
}

export const fetchMe = async (): Promise<MeResponse> => {
  const { data } = await apiClient.get<MeResponse>('/auth/me')
  return data
}

export const registerUser = async (payload: RegistrationPayload) => {
  await apiClient.post('/auth/register', payload)
}

export const logoutRequest = async () => {
  await apiClient.post('/auth/logout')
}
