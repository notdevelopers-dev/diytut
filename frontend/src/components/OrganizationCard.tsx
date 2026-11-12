import { useState } from 'react'
import type { OrganizationListItem } from '../types/organization'
import { formatProjectsCount } from '../utils/organization'

export interface OrganizationCardProps {
  organization: OrganizationListItem
  cityName?: string
}

export const OrganizationCard = ({
  organization,
  cityName,
}: OrganizationCardProps) => {
  const [imageError, setImageError] = useState(false)

  const logoSrc = organization.logo || organization.logo_url
  const hasValidLogo = Boolean(logoSrc) && !imageError

  const resolvedCity =
    cityName ||
    (typeof organization.city === 'string'
      ? organization.city
      : organization.city?.name) ||
    'Місто не вказано'

  const projectsCount =
    organization.projects_count ?? organization.projectsCount ?? 0

  const initialLetter = organization.name
    ? organization.name.trim().charAt(0).toUpperCase()
    : 'O'

  return (
    <article
      data-testid="organization-card"
      className="card flex flex-col justify-between rounded-2xl border border-sky-100 bg-white p-6 shadow-xs hover:shadow-md hover:border-sky-300 transition-all duration-200"
    >
      <div>
        {/* Top bar: Logo + Name & Verification Badge */}
        <div className="flex items-start gap-4 mb-4">
          {/* Logo / Avatar */}
          <div className="relative shrink-0">
            {hasValidLogo ? (
              <img
                src={logoSrc!}
                alt={`Логотип ${organization.name}`}
                onError={() => setImageError(true)}
                className="h-14 w-14 rounded-xl object-cover border border-sky-100 shadow-xs"
              />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#5897FB] to-[#3b82f6] text-white font-bold text-xl shadow-xs"
                aria-label={`Аватар ${organization.name}`}
              >
                {initialLetter}
              </div>
            )}
          </div>

          {/* Name & verification */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {/* Verification badge */}
              <span
                data-testid="verification-badge"
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200"
                title="Організація пройшла перевірку"
              >
                <svg
                  className="h-3.5 w-3.5 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Підтверджена
              </span>
            </div>

            <h3
              className="text-lg font-bold text-ink leading-snug line-clamp-2"
              title={organization.name}
            >
              {organization.name}
            </h3>
          </div>
        </div>

        {/* Location / City info */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-muted mb-3">
          <span aria-hidden="true">📍</span>
          <span className="truncate">{resolvedCity}</span>
        </div>

        {/* Description */}
        <p className="text-sm text-ink-muted line-clamp-3 leading-relaxed mb-4">
          {organization.description || 'Опис організації ще не заповнено.'}
        </p>
      </div>

      {/* Card Footer: Projects Count */}
      <div className="pt-4 border-t border-sky-50 flex items-center justify-between">
        <div
          data-testid="projects-count"
          className="flex items-center gap-1.5 rounded-lg bg-sky-50/70 px-3 py-1.5 text-xs font-medium text-sky-800 border border-sky-100"
        >
          <span aria-hidden="true">📋</span>
          <span>{formatProjectsCount(projectsCount)}</span>
        </div>

        {organization.email && (
          <span
            className="text-xs text-ink-muted truncate max-w-[140px]"
            title={organization.email}
          >
            {organization.email}
          </span>
        )}
      </div>
    </article>
  )
}

export default OrganizationCard
