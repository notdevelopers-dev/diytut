import { apiClient } from '@/lib/api-client'

/** Тіло POST /organizations (app.schemas.organizations.OrganizationCreate) */
export interface OrganizationPayload {
  name: string
  email: string
  phone: string
  city_id: number
  description: string
  edrpou: string | null
}

/** Тіло PATCH /organizations/me: назву й ЄДРПОУ змінювати не можна */
export interface OrganizationUpdatePayload {
  email: string
  phone: string
  city_id: number
  description: string | null
}

/** Профіль власної організації з GET /organizations/me */
export interface MyOrganization {
  id: number
  name: string
  email: string
  phone: string
  city_id: number
  description: string | null
  edrpou: string | null
  status: string
  role: string
}

export const fetchMyOrganization = async (): Promise<MyOrganization> => {
  const { data } = await apiClient.get<MyOrganization>('/organizations/me')
  return data
}

export const createOrganization = async (payload: OrganizationPayload) => {
  await apiClient.post('/organizations', payload)
}

export const updateMyOrganization = async (
  payload: OrganizationUpdatePayload,
) => {
  await apiClient.patch('/organizations/me', payload)
}
