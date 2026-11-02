import apiClient from './client'

export interface RegistrationProfileData {
  firstName: string
  lastName: string
  nickname: string
  phone: string
  dateOfBirth: string
  gender: string
  city: string
  bio: string
}

// Відправка даних анкети реєстрації на бекенд
export const submitRegistrationProfile = async (
  data: RegistrationProfileData,
): Promise<RegistrationProfileData> => {
  const response = await apiClient.put<RegistrationProfileData>(
    '/profile/volunteer',
    data,
  )
  return response.data
}
