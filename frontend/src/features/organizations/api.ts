import { apiClient } from '@/lib/api-client'
import { getErrorStatus } from '@/lib/errors'
import type {
  JoinRequest,
  OrganizationDetail,
  OrganizationListItem,
  OrganizationJoinRequest,
  OrganizationMembership,
} from '@/types/organization'

export interface FetchOrganizationsParams {
  city_id?: number | null
  limit?: number
  offset?: number
}

export const fetchOrganizations = async (
  params?: FetchOrganizationsParams,
): Promise<OrganizationListItem[]> => {
  const { data } = await apiClient.get<OrganizationListItem[]>(
    '/organizations',
    {
      params: {
        ...(params?.city_id ? { city_id: params.city_id } : {}),
        ...(params?.limit ? { limit: params.limit } : {}),
        ...(params?.offset ? { offset: params.offset } : {}),
      },
    },
  )
  return data
}

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

/** Публічна сторінка схваленої організації разом з її опублікованими проєктами */
export const fetchOrganization = async (
  organizationId: number,
): Promise<OrganizationDetail> => {
  const { data } = await apiClient.get<OrganizationDetail>(
    `/organizations/${organizationId}`,
  )
  return data
}

/** Усі організації, учасником яких є поточний користувач */
export const fetchMyOrganizations = async (): Promise<
  OrganizationMembership[]
> => {
  const { data } = await apiClient.get<OrganizationMembership[]>(
    '/users/me/organizations',
  )
  return data
}

/** Остання заявка користувача до організації; `null`, якщо заявок ще не було (404) */
export const fetchMyJoinRequest = async (
  organizationId: number,
): Promise<JoinRequest | null> => {
  try {
    const { data } = await apiClient.get<JoinRequest>(
      `/organizations/${organizationId}/my-request-status`,
    )
    return data
  } catch (err: unknown) {
    if (getErrorStatus(err) === 404) return null
    throw err
  }
}

/** Заявка на вступ; супровідний лист необов'язковий (до 1000 символів) */
export const createJoinRequest = async (
  organizationId: number,
  message: string,
): Promise<JoinRequest> => {
  const { data } = await apiClient.post<JoinRequest>(
    `/organizations/${organizationId}/join-requests`,
    { message: message.trim() || null },
  )
  return data
}

/** Максимум заявок за раз (ліміт бекенду) */
export const INCOMING_REQUESTS_LIMIT = 100

/**
 * Заявки на вступ, що чекають розгляду (лише pending; доступно owner і admin).
 * organization_id — бо користувач може бути в кількох організаціях.
 */
export const fetchIncomingJoinRequests = async (
  organizationId: number,
): Promise<OrganizationJoinRequest[]> => {
  const { data } = await apiClient.get<OrganizationJoinRequest[]>(
    '/organizations/me/join-requests',
    {
      params: {
        organization_id: organizationId,
        limit: INCOMING_REQUESTS_LIMIT,
      },
    },
  )
  return data
}
