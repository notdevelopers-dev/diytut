import { Link } from 'react-router-dom'
import type { OrganizationListItem } from '@/types/organization'

interface OrganizationCardProps {
  organization: OrganizationListItem
  cityName?: string
}

/** Картка організації в каталозі за макетом Figma («Organisation section»). */
export const OrganizationCard = ({
  organization,
  cityName,
}: OrganizationCardProps) => (
  <article
    data-testid="organization-card"
    className="flex h-full flex-col gap-2 rounded-[5px] border border-main bg-[#DCECFF] p-3 sm:p-[15px]"
  >
    <h2 className="rounded-[5px] bg-[#F7FBFF] px-2 py-0.5 text-sm font-normal break-words text-black sm:text-center sm:text-base">
      {organization.name}
    </h2>

    <p className="mx-0 truncate rounded-[5px] bg-[#F7FBFF] px-2 text-center text-[10px] text-black sm:mx-[17px]">
      {cityName ?? 'Місто не вказано'}
    </p>

    {/* Обрізаємо внутрішній текст, а не саму рамку: рамка розтягується до висоти
        сусідніх карток, і тоді з-під «…» виглядав би шматок наступного рядка */}
    <div className="mt-2 min-h-[81px] flex-1 rounded-[5px] bg-[#F7FBFF] px-1.5 py-1">
      <p
        className={`line-clamp-5 text-[10px] break-words ${
          organization.description ? 'text-black' : 'text-black/50'
        }`}
      >
        {organization.description || 'Опис відсутній'}
      </p>
    </div>

    <Link
      to={`/organizations/${organization.id}`}
      className="mt-2 block rounded-[5px] bg-[#B5F291] py-0.5 text-center text-xs text-black no-underline transition-colors hover:bg-[#a3e47c] sm:text-[15px]"
    >
      Переглянути
    </Link>
  </article>
)

/** Заглушка картки, поки список завантажується. */
export const OrganizationCardSkeleton = () => (
  <div
    aria-hidden="true"
    className="flex h-full animate-pulse flex-col gap-2 rounded-[5px] border border-main bg-[#DCECFF] p-3 sm:p-[15px]"
  >
    <div className="h-[21px] rounded-[5px] bg-[#F7FBFF]" />
    <div className="mx-0 h-[11px] rounded-[5px] bg-[#F7FBFF] sm:mx-[17px]" />
    <div className="mt-2 h-[81px] rounded-[5px] bg-[#F7FBFF]" />
    <div className="mt-2 h-[22px] rounded-[5px] bg-[#B5F291]/60" />
  </div>
)
