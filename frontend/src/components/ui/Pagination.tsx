interface PaginationProps {
  page: number
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}

const arrowButton =
  'flex h-7 w-10 cursor-pointer items-center justify-center rounded-md bg-[#C3D7F2] text-black transition-colors hover:bg-main disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#C3D7F2]'

const Arrow = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path
      d={
        direction === 'left' ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'
      }
    />
  </svg>
)

/** Стрілки «назад / вперед» з номером поточної сторінки (як у макеті). */
export const Pagination = ({
  page,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: PaginationProps) => (
  <nav className="flex items-center gap-2" aria-label="Пагінація">
    <button
      type="button"
      onClick={onPrev}
      disabled={!hasPrev}
      className={arrowButton}
      aria-label="Попередня сторінка"
    >
      <Arrow direction="left" />
    </button>
    <span
      className="flex h-7 min-w-8 items-center justify-center rounded-md bg-[#DCECFF] px-2 text-xs text-black"
      aria-current="page"
    >
      {page}
    </span>
    <button
      type="button"
      onClick={onNext}
      disabled={!hasNext}
      className={arrowButton}
      aria-label="Наступна сторінка"
    >
      <Arrow direction="right" />
    </button>
  </nav>
)
