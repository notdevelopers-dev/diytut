export type OrgRole = 'owner' | 'admin' | 'member'
export type OrgStatus = 'pending' | 'approved' | 'rejected' | 'blocked'

/** Місто з GET /api/cities */
export interface CityItem {
  id: number
  name: string
  region: string
}

/** Сторінка списку з бекенду: елементи та їх загальна кількість під фільтром */
export interface Page<T> {
  items: T[]
  total: number
}
