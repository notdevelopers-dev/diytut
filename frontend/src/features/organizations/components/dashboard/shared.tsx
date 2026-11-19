import type { ReactNode } from 'react'
import searchIcon from '@/assets/icons/menu/search.svg'

/** Жовта смуга з назвою розділу по центру (Figma «Учасники організації») */
export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <div className="border-y border-info bg-cream px-3 py-2">
    <h1 className="text-center text-3xl font-normal text-black sm:text-4xl">
      {children}
    </h1>
  </div>
)

/** Неактивна кнопка «скоро»: дія з’явиться разом із бекендом або своєю задачею */
export const SoonButton = ({
  children,
  iconSrc,
  title = 'Незабаром',
}: {
  children: ReactNode
  iconSrc?: string
  title?: string
}) => (
  <button
    type="button"
    disabled
    title={title}
    className="flex h-8 w-fit cursor-not-allowed items-center gap-2 rounded-[5px] bg-[#DCECFF] px-3 text-base text-black opacity-70"
  >
    {iconSrc && <img src={iconSrc} alt="" width={19} height={19} />}
    {children}
    <span className="rounded-full bg-white px-2 text-[11px] text-[#8B99AA]">
      скоро
    </span>
  </button>
)

/** Порожній стан розділу (DES-103: порожні стани для всіх вкладок) */
export const EmptyState = ({
  title,
  text,
  children,
}: {
  title: string
  text: string
  children?: ReactNode
}) => (
  <div className="flex flex-col items-center gap-3 rounded-[5px] border-2 border-dashed border-[#DCECFF] bg-white px-6 py-10 text-center">
    <h3 className="text-lg font-semibold text-black">{title}</h3>
    <p className="max-w-md text-sm text-[#5F6F82]">{text}</p>
    {children}
  </div>
)

/** Поле пошуку з макета (блакитне, іконка ліворуч) */
export const SearchField = ({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) => (
  <label className="flex h-8 w-full max-w-[360px] items-center gap-2 rounded-[5px] border border-main bg-[#DCECFF] pr-3 pl-0.5 focus-within:ring-2 focus-within:ring-main/40">
    <img src={searchIcon} alt="" width={26} height={26} />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-black placeholder:text-black focus:outline-none"
    />
  </label>
)

/** Невелика «пігулка» зі значенням, як у картці учасника (Figma) */
export const InfoPill = ({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) => (
  <span
    className={`inline-flex min-w-0 items-center truncate rounded-[11px] border border-[#DCECFF] bg-[#F7FBFF] px-4 text-black ${className}`}
  >
    {children}
  </span>
)
