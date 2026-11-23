import { useState } from 'react'
import { Link } from 'react-router-dom'
import avatarIcon from '@/assets/icons/menu/avatar.svg'
import circlePlusIcon from '@/assets/icons/organization/circle-plus.svg'
import facePlusIcon from '@/assets/icons/organization/face-plus.svg'
import meatballIcon from '@/assets/icons/organization/meatball.svg'
import { useMyProfile } from '@/features/users/hooks'
import { getOrgRoleLabel } from '@/features/organizations/utils'
import type { OrgRole } from '@/types/common'
import { InfoPill, SearchField, SectionTitle, SoonButton } from './shared'

/** Кольори ролей з макета: власник — зелений, адміністратор — жовтий, учасник — блакитний */
const ROLE_TONE: Record<OrgRole, string> = {
  owner: 'bg-[#B5F291]',
  admin: 'bg-info',
  member: 'bg-main',
}

interface MemberCardData {
  name: string
  phone: string | null
  email: string | null
  role: OrgRole
  /** Дата вступу; бекенд її ще не віддає */
  joinedAt: string | null
}

/** Картка учасника за макетом Figma («Учасники організації») */
const MemberCard = ({ member }: { member: MemberCardData }) => (
  <li className="relative flex flex-col gap-3 rounded-[5px] border-2 border-[#DCECFF] bg-white p-3 sm:flex-row sm:items-center sm:gap-6">
    <div className="flex min-w-0 items-center gap-2 sm:w-[260px] sm:shrink-0">
      <img
        src={avatarIcon}
        alt=""
        width={54}
        height={54}
        className="size-[54px] shrink-0"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <InfoPill className="h-6 text-sm font-medium">{member.name}</InfoPill>
        <InfoPill className="h-5 text-xs">{member.phone ?? '—'}</InfoPill>
        <InfoPill className="h-5 text-xs">{member.email ?? '—'}</InfoPill>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <span
        className={`flex h-8 w-[165px] items-center justify-center rounded-[5px] text-base text-black ${ROLE_TONE[member.role]}`}
      >
        {getOrgRoleLabel(member.role)}
      </span>
      <span className="flex items-center gap-2 text-xs text-black">
        Приєднався
        <InfoPill
          className="h-5 text-[13px]"
          // Дату вступу бекенд почне віддавати разом зі списком учасників
        >
          {member.joinedAt ?? '—'}
        </InfoPill>
      </span>
    </div>

    {/* Керування учасником (роль, видалення) — разом із бекендом учасників */}
    <button
      type="button"
      disabled
      title="Керування учасником — незабаром"
      aria-label="Дії з учасником"
      className="absolute top-3 right-3 flex size-10 cursor-not-allowed items-center justify-center rounded-full opacity-60 sm:static sm:ml-auto"
    >
      <img src={meatballIcon} alt="" width={34} height={6} />
    </button>
  </li>
)

/**
 * Учасники організації за макетом Figma. Списку учасників бекенд поки не віддає
 * (задача наступного спринту), тож показуємо лише картку поточного користувача.
 */
export const MembersSection = ({
  role,
  canReview,
  requestsCount,
}: {
  role: OrgRole | undefined
  canReview: boolean
  requestsCount: number
}) => {
  const [search, setSearch] = useState('')
  const { data: profile } = useMyProfile()

  const me: MemberCardData | null =
    profile && role
      ? {
          name: `${profile.first_name} ${profile.last_name}`.trim(),
          phone: profile.phone,
          email: profile.email,
          role,
          joinedAt: null,
        }
      : null

  const query = search.trim().toLowerCase()
  const visible =
    me &&
    (!query ||
      [me.name, me.phone ?? '', me.email ?? ''].some((v) =>
        v.toLowerCase().includes(query),
      ))
      ? [me]
      : []

  return (
    <section aria-label="Учасники організації" className="flex flex-col">
      <SectionTitle>Учасники організації</SectionTitle>

      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-3 py-4">
        {/* Пошук ліворуч, «Вхідні запити» праворуч — як у макеті */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Пошук учасника"
          />
          {canReview && (
            <Link
              to="/organization/dashboard?tab=requests"
              className="relative flex h-8 w-fit shrink-0 items-center gap-2 rounded-[5px] bg-info px-3 text-base text-black no-underline transition hover:brightness-95 sm:w-[222px]"
            >
              <img src={facePlusIcon} alt="" width={20} height={20} />
              Вхідні запити
              {requestsCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E14848] px-1 text-[11px] text-white">
                  {requestsCount}
                </span>
              )}
            </Link>
          )}
        </div>

        <ul className="flex flex-col gap-5">
          {visible.map((member) => (
            <MemberCard key={member.email ?? member.name} member={member} />
          ))}
        </ul>
        {me && visible.length === 0 && (
          <p className="text-center text-sm text-[#8B99AA]">
            Нікого не знайдено
          </p>
        )}
        <p className="rounded-[5px] border-2 border-dashed border-[#DCECFF] bg-white px-4 py-3 text-center text-sm text-[#5F6F82]">
          Інші учасники з’являться тут незабаром.
        </p>

        <div className="flex justify-end">
          <SoonButton iconSrc={circlePlusIcon}>Запросити учасників</SoonButton>
        </div>
      </div>
    </section>
  )
}
