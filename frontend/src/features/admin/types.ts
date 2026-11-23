import type { OrgStatus } from '@/types/common'

/** Входи за один день (app.schemas.admin.DailyLogins) */
export interface DailyLogins {
  date: string
  logins: number
  unique_users: number
}

/** GET /api/admin/stats/logins (app.schemas.admin.LoginStats) */
export interface LoginStats {
  date_from: string
  date_to: string
  /** Часовий пояс, за яким бекенд ділить входи на дні */
  timezone: string
  total_logins: number
  unique_users: number
  /** Кожен день періоду, зокрема дні без входів */
  days: DailyLogins[]
}

/**
 * Заявка на створення організації (app.schemas.admin.OrganizationRequest),
 * лише поля, які показує адмін-панель
 */
export interface OrganizationRequest {
  id: number
  name: string
  edrpou: string | null
  status: OrgStatus
  created_at: string
  review_comment: string | null
  /** Хто подав заявку: щоб адміністратор міг зв'язатися з ним */
  creator: {
    email: string
    first_name: string | null
    last_name: string
    phone: string
  }
}

/** GET /api/admin/organizations (app.schemas.admin.OrganizationRequestPage) */
export interface OrganizationRequestPage {
  items: OrganizationRequest[]
  /** Скільки всього заявок під фільтром */
  total: number
}

/** Тіло POST /api/admin/organizations/:id/review; коментар обов'язковий при відхиленні */
export interface OrganizationReview {
  decision: 'approved' | 'rejected'
  comment: string | null
}

/** Спосіб входу (app.models.LoginMethodEnum) */
export type LoginMethod = 'google' | 'registration' | 'dev'

/**
 * Один успішний вхід (app.schemas.admin.LoginEventRead). Невдалі спроби бекенд
 * не записує, тож статусу немає: кожен запис — успішний вхід
 */
export interface LoginEvent {
  id: number
  created_at: string
  method: LoginMethod
  /** Порожній у входах до появи цього поля */
  ip: string | null
  /** null, якщо акаунт уже видалено */
  user: {
    id: number
    email: string
    first_name: string | null
    last_name: string
    platform_role: 'user' | 'admin'
  } | null
}

/** GET /api/admin/stats/logins/recent (app.schemas.admin.LoginEventPage) */
export interface LoginEventPage {
  items: LoginEvent[]
  total: number
}
