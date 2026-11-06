import apiClient from './client'

export type Gender = 'prefer_not_to_say' | 'female' | 'male'

export interface ProfileCity {
  id: number
  name: string
  region: string
}

/** Відповідь GET /api/users/me — UserProfileRead із бекенду */
export interface VolunteerProfile {
  id: number
  email: string
  first_name: string
  last_name: string
  patronymic: string | null
  nickname: string
  phone: string
  birth_date: string
  gender: Gender
  city_id: number
  bio: string | null
  platform_role: 'user' | 'admin'
  city: ProfileCity | null
}

/**
 * Тіло PATCH /api/users/me — UserUpdate із бекенду: часткове оновлення,
 * але передані поля не можуть бути null (крім bio). Надсилаємо лише те,
 * що може змінити волонтер: електронна пошта та роль тут не редагуються.
 */
export interface VolunteerProfileUpdate {
  first_name: string
  last_name: string
  nickname: string
  phone: string
  birth_date: string
  gender: Gender
  city_id: number
  bio: string | null
}

export const getMyProfile = async (): Promise<VolunteerProfile> => {
  const response = await apiClient.get<VolunteerProfile>('/users/me')
  return response.data
}

export const updateMyProfile = async (
  data: VolunteerProfileUpdate,
): Promise<VolunteerProfile> => {
  const response = await apiClient.patch<VolunteerProfile>('/users/me', data)
  return response.data
}
