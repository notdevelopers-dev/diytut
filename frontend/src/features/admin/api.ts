import { apiClient } from '@/lib/api-client'
import type { OrgStatus } from '@/types/common'
import type {
  LoginEventPage,
  LoginStats,
  OrganizationRequest,
  OrganizationRequestPage,
  OrganizationReview,
} from './types'

export interface FetchOrganizationRequestsParams {
  /** Без статусу бекенд повертає заявки з будь-яким статусом */
  status?: OrgStatus
  /** Частина назви або ЄДРПОУ; порожній рядок бекенд ігнорує */
  search?: string
  limit?: number
  offset?: number
}

export const fetchOrganizationRequests = async (
  params: FetchOrganizationRequestsParams = {},
): Promise<OrganizationRequestPage> => {
  const { data } = await apiClient.get<OrganizationRequestPage>(
    '/admin/organizations',
    { params },
  )
  return data
}

export const reviewOrganizationRequest = async (
  id: number,
  review: OrganizationReview,
): Promise<OrganizationRequest> => {
  const { data } = await apiClient.post<OrganizationRequest>(
    `/admin/organizations/${id}/review`,
    review,
  )
  return data
}

/** Дати у форматі YYYY-MM-DD, обидві межі включно */
export const fetchLoginStats = async (
  dateFrom: string,
  dateTo: string,
): Promise<LoginStats> => {
  const { data } = await apiClient.get<LoginStats>('/admin/stats/logins', {
    params: { date_from: dateFrom, date_to: dateTo },
  })
  return data
}

/** Останні успішні входи, свіжіші першими */
export const fetchRecentLogins = async (params: {
  limit: number
  offset: number
}): Promise<LoginEventPage> => {
  const { data } = await apiClient.get<LoginEventPage>(
    '/admin/stats/logins/recent',
    {
      params,
    },
  )
  return data
}
