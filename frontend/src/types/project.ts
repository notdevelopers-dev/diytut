/** Рівень досвіду (app.models.experience.ExperienceLevelEnum), від нижчого до вищого */
export type ExperienceLevel =
  'novice' | 'interested' | 'amateur' | 'experienced' | 'pro'

/** Статус проєкту (app.models.project.ProjectStatusEnum) */
export type ProjectStatus = 'draft' | 'published' | 'completed' | 'cancelled'

/** Елемент GET /api/projects (app.schemas.projects.ProjectListItem) */
export interface Project {
  id: number
  organization_id: number
  title: string
  description: string
  city_id: number | null
  status: ProjectStatus
  created_at: string
  starts_at: string | null
  ends_at: string | null
  is_online: boolean
  address: string | null
  capacity: number | null
  /** Decimal на бекенді приходить у JSON рядком, напр. "4.5" */
  volunteer_hours: string | null
  is_adult_only: boolean
  experience_level: ExperienceLevel
  tags: string[]
}
