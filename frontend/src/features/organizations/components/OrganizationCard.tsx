import type { OrganizationListItem } from '@/features/organizations/types'

export interface OrganizationCardProps {
  organization: OrganizationListItem
  cityName?: string
}

export const OrganizationCard = ({
  organization,
  cityName,
}: OrganizationCardProps) => {
  const initialLetter = organization.name.trim().charAt(0).toUpperCase() || 'О'

  return (
    <article
      data-testid="organization-card"
      className="card flex flex-col justify-between rounded-2xl border border-sky-100 bg-white p-6 shadow-xs hover:shadow-md hover:border-sky-300 transition-all duration-200"
    >
      <div>
        <div className="mb-4 flex items-start gap-4">
          {/* Бекенд поки не віддає логотип у списку, тож завжди літера */}
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-main text-xl font-bold text-white shadow-xs"
            aria-hidden="true"
          >
            {initialLetter}
          </div>

          <h3
            className="min-w-0 flex-1 text-lg font-bold leading-snug text-ink line-clamp-2"
            title={organization.name}
          >
            {organization.name}
          </h3>
        </div>

        {cityName && (
          <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <span aria-hidden="true">📍</span>
            <span className="truncate">{cityName}</span>
          </div>
        )}

        <p className="mb-4 text-sm leading-relaxed text-ink-muted line-clamp-3">
          {organization.description || 'Опис організації ще не заповнено.'}
        </p>
      </div>

      <div className="flex flex-col gap-1 border-t border-sky-50 pt-4 text-xs text-ink-muted">
        <span className="truncate" title={organization.email}>
          {organization.email}
        </span>
        <span>{organization.phone}</span>
      </div>
    </article>
  )
}

export default OrganizationCard
