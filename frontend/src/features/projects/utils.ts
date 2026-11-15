import type { ProjectCategory } from '@/types/project'

/** Усі сфери бекенду (app.models.project.ProjectCategoryEnum), щоб відсіяти невідомі з URL */
export const PROJECT_CATEGORIES: readonly ProjectCategory[] = [
  'ecology',
  'education',
  'children',
  'idp',
  'military',
  'veterans',
  'medicine',
  'mental_health',
  'disability',
  'animals',
  'elderly',
  'social',
  'humanitarian',
  'fundraising',
  'legal',
  'culture',
  'sports',
  'tech',
  'media',
  'rebuild',
  'other',
]

export const isProjectCategory = (value: string): value is ProjectCategory =>
  (PROJECT_CATEGORIES as readonly string[]).includes(value)

/**
 * Посилання на каталог із фільтром: `/projects?q=%23толока` або
 * `/projects?categories=ecology`. Каталог читає ці параметри при відкритті.
 */
export const projectsCatalogUrl = (filter: {
  tag?: string
  category?: ProjectCategory
}) => {
  const params = new URLSearchParams()
  if (filter.tag) params.set('q', `#${filter.tag}`)
  if (filter.category) params.set('categories', filter.category)
  return `/projects?${params.toString()}`
}
