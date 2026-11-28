import clockIcon from '@/assets/icons/clock.svg'
import memberCheckIcon from '@/assets/icons/member-check.svg'

/** Стан кнопки за макетом Figma (Default / Pending / Member) + «відхилено» */
export type JoinState = 'default' | 'pending' | 'member' | 'rejected'

interface JoinButtonProps {
  state: JoinState
  isLoading?: boolean
  onClick: () => void
}

const base =
  'flex h-8 w-[185px] items-center justify-center gap-2 rounded-[11px] text-base'

/** Кнопка «Приєднатись» на сторінці організації та її стани після заявки. */
export const JoinButton = ({ state, isLoading, onClick }: JoinButtonProps) => {
  if (isLoading) {
    return (
      <div
        aria-hidden="true"
        className={`${base} animate-pulse bg-[#C2D4EA]`}
      />
    )
  }

  if (state === 'pending') {
    return (
      <div
        data-testid="join-state"
        data-state="pending"
        className={`${base} bg-[#C2D4EA] text-[#8B99AA]`}
      >
        <img src={clockIcon} alt="" width={21} height={21} />
        Запит очікує
      </div>
    )
  }

  if (state === 'member') {
    return (
      <div
        data-testid="join-state"
        data-state="member"
        className={`${base} bg-[#B5F291] text-black`}
      >
        <img src={memberCheckIcon} alt="" width={24} height={24} />
        Ви учасник
      </div>
    )
  }

  // Після відмови бекенд дозволяє подати нову заявку на вступ (паузи, як у
  // проєктів, тут немає), тож під позначкою — «Подати знову»
  if (state === 'rejected') {
    return (
      <div className="flex w-[185px] flex-col items-center gap-1">
        <div
          data-testid="join-state"
          data-state="rejected"
          className={`${base} bg-[#C2D4EA] text-[#8B99AA]`}
        >
          Запит відхилено
        </div>
        <button
          type="button"
          data-testid="join-reapply"
          onClick={onClick}
          className="cursor-pointer text-xs text-[#5F6F82] underline hover:text-black"
        >
          Подати знову
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      data-testid="join-state"
      data-state="default"
      onClick={onClick}
      className={`${base} cursor-pointer bg-main text-black transition-colors hover:bg-main-hover`}
    >
      Приєднатись
    </button>
  )
}
