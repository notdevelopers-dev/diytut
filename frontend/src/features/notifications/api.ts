import { apiClient } from '@/lib/api-client'

/** Типи сповіщень бекенду (NotificationTypeEnum) */
export type NotificationType =
  | 'join_request_received'
  | 'join_request_cancelled'
  | 'join_request_accepted'
  | 'join_request_rejected'
  | 'project_cancelled'
  | 'hours_credited'
  | 'level_up'
  | 'review_available'
  | 'organization_approved'
  | 'organization_rejected'

/** NotificationRead з бекенду */
export interface AppNotification {
  id: number
  // Бекенд може додати нові типи: невідомий тип показуємо з типовою позначкою
  type: NotificationType | (string & {})
  title: string
  message: string
  is_read: boolean
  /** Відносний шлях на фронтенді, куди веде сповіщення */
  link: string | null
  created_at: string
}

/** Максимум, який бекенд віддає за раз */
export const NOTIFICATIONS_PAGE_SIZE = 50

export const fetchNotifications = async (
  offset = 0,
): Promise<AppNotification[]> => {
  const { data } = await apiClient.get<AppNotification[]>('/notifications', {
    params: { limit: NOTIFICATIONS_PAGE_SIZE, offset },
  })
  return data
}

export const markNotificationRead = async (
  id: number,
): Promise<AppNotification> => {
  const { data } = await apiClient.patch<AppNotification>(
    `/notifications/${id}/read`,
  )
  return data
}
