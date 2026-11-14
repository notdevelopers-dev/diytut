import type { ReactNode } from 'react'
import type { OrganizationListItem } from '@/features/organizations/types'
import { formatDateTime } from '@/features/organizations/utils'

interface OrganizationsTableProps {
  organizations: OrganizationListItem[]
  /** Назви міст за city_id: бекенд у списку віддає лише city_id */
  cityNames: Map<number, string>
  /** Рядок під таблицею: підсумок зліва і пагінація справа */
  footer?: ReactNode
  isLoading?: boolean
}

const headCell = 'px-4 py-2.5 text-left text-sm font-medium text-black'
const cell = 'px-4 py-3 align-top text-sm text-black'

const SKELETON_ROWS = 5
const COLUMNS = 5

/** Таблиця організацій у стилі макета: жовта шапка, синя рамка, підсумок унизу. */
export const OrganizationsTable = ({
  organizations,
  cityNames,
  footer,
  isLoading = false,
}: OrganizationsTableProps) => (
  <div
    data-testid="organizations-table"
    className="overflow-hidden rounded-lg border border-main bg-[#F7FBFF]"
  >
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead className="bg-info">
          <tr>
            <th scope="col" className={headCell}>
              Організація / контакт
            </th>
            <th scope="col" className={headCell}>
              Місто
            </th>
            <th scope="col" className={headCell}>
              Опис
            </th>
            <th scope="col" className={headCell}>
              Телефон
            </th>
            <th scope="col" className={headCell}>
              Дата реєстрації
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: SKELETON_ROWS }).map((_, row) => (
                <tr
                  key={row}
                  data-testid="skeleton-row"
                  className="animate-pulse border-t border-sky-100"
                >
                  {Array.from({ length: COLUMNS }).map((__, col) => (
                    <td key={col} className="px-4 py-4">
                      <div className="h-3.5 w-3/4 rounded bg-[#DCECFF]" />
                    </td>
                  ))}
                </tr>
              ))
            : organizations.map((org) => {
                const { date, time } = formatDateTime(org.created_at)
                return (
                  <tr
                    key={org.id}
                    data-testid="organization-row"
                    className="border-t border-sky-100 transition-colors hover:bg-[#DCECFF]/50"
                  >
                    <td className={cell}>
                      <div className="font-medium">{org.name}</div>
                      <div className="mt-1 break-all text-xs text-black/70">
                        {org.email}
                      </div>
                    </td>
                    <td className={cell}>
                      {cityNames.get(org.city_id) ?? '—'}
                    </td>
                    <td className={`${cell} max-w-xs`}>
                      <p className="line-clamp-2 text-black/80">
                        {org.description || 'Опис не заповнено'}
                      </p>
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>{org.phone}</td>
                    <td className={`${cell} whitespace-nowrap`}>
                      <div>{date}</div>
                      <div className="mt-1 text-xs text-black/70">{time}</div>
                    </td>
                  </tr>
                )
              })}
        </tbody>
      </table>
    </div>
    {footer && (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-100 px-4 py-2.5 text-xs text-black">
        {footer}
      </div>
    )}
  </div>
)
