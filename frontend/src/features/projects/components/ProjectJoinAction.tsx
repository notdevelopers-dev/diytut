import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clockIcon from '@/assets/icons/clock.svg'
import memberCheckIcon from '@/assets/icons/member-check.svg'
import { useToast } from '@/components/feedback'
import { useAuth } from '@/features/auth/hooks'
import { JoinRequestModal } from '@/features/organizations/components/JoinRequestModal'
import {
  useCancelProjectJoinRequest,
  useCreateProjectJoinRequest,
} from '@/features/projects/hooks'
import {
  formatRetryAfter,
  projectCancelErrorText,
  projectJoinErrorText,
} from '@/features/projects/utils'
import type { ProjectJoinRequestStatus } from '@/types/project'

/** Найдовша затримка setTimeout; пауза бекенду (до тижня) у неї вміщається */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/** Поточний час, що оновлюється в момент `iso`: кнопка з'являється сама, коли пауза минула */
const useNowUntil = (iso: string | null) => {
  const target = iso ? Date.parse(iso) : NaN
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!Number.isFinite(target) || target <= now) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(target - now + 100, MAX_TIMEOUT_MS),
    )
    return () => clearTimeout(timer)
  }, [target, now])
  return { now, target }
}

const pillClass =
  'mx-auto flex items-center gap-1.5 rounded-[5px] px-4 py-1 text-xs'
const greenButtonClass =
  'mx-auto block cursor-pointer rounded-[5px] bg-[#B5F291] px-5 py-1 text-center text-xs text-black transition-colors hover:bg-[#a3e47c]'
const linkButtonClass =
  'mx-auto block cursor-pointer text-[10px] text-[#8B99AA] underline hover:text-black disabled:cursor-wait'

interface ProjectJoinActionProps {
  projectId: number
  projectTitle: string
  /** Остання заявка користувача на проєкт; `null` чи `undefined` — заявки немає */
  status?: ProjectJoinRequestStatus | null
  isLoading?: boolean
}

/**
 * Кнопка «Приєднатись» на картці проєкту та її стани: «Запит очікує», «Ви учасник»,
 * «Запит відхилено» (після паузи — «Подати знову»). Скасувати можна заявку в очікуванні
 * чи схвалену (R-23).
 */
export const ProjectJoinAction = ({
  projectId,
  projectTitle,
  status,
  isLoading,
}: ProjectJoinActionProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { isAuthenticated, isProfileComplete } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const createJoinRequest = useCreateProjectJoinRequest(projectId)
  const cancelJoinRequest = useCancelProjectJoinRequest(projectId)
  const { now, target: reapplyAt } = useNowUntil(status?.can_reapply_at ?? null)

  const openModal = () => {
    // Не увійшов — на сторінку входу; анкету не заповнив — спершу анкета
    if (!isAuthenticated) {
      void navigate('/login')
      return
    }
    if (!isProfileComplete) {
      void navigate('/register/complete')
      return
    }
    createJoinRequest.reset()
    setIsModalOpen(true)
  }

  const handleSubmit = (message: string) => {
    createJoinRequest.mutate(message, {
      onSuccess: () => {
        setIsModalOpen(false)
        showToast('Запит на участь надіслано')
      },
    })
  }

  const handleCancel = () => {
    if (!window.confirm('Скасувати запит на участь у проєкті?')) return
    cancelJoinRequest.mutate(undefined, {
      onSuccess: () => showToast('Запит скасовано'),
      onError: (error) => showToast(projectCancelErrorText(error), 'error'),
    })
  }

  const cancelButton = (label: string) => (
    <button
      type="button"
      data-testid="project-join-cancel"
      onClick={handleCancel}
      disabled={cancelJoinRequest.isPending}
      className={linkButtonClass}
    >
      {label}
    </button>
  )

  const content = (() => {
    if (isLoading) {
      return (
        <div
          aria-hidden="true"
          className="mx-auto h-6 w-28 animate-pulse rounded-[5px] bg-[#C2D4EA]"
        />
      )
    }
    switch (status?.status) {
      case 'pending':
        return (
          <>
            <p
              data-testid="project-join"
              data-state="pending"
              className={`${pillClass} bg-[#C2D4EA] text-[#8B99AA]`}
            >
              <img src={clockIcon} alt="" width={14} height={14} />
              Запит очікує
            </p>
            {cancelButton('Скасувати запит')}
          </>
        )
      case 'accepted':
        return (
          <>
            <p
              data-testid="project-join"
              data-state="member"
              className={`${pillClass} bg-[#B5F291] text-black`}
            >
              <img src={memberCheckIcon} alt="" width={16} height={16} />
              Ви учасник
            </p>
            {cancelButton('Скасувати участь')}
          </>
        )
      case 'rejected': {
        // Без часу повторної заявки (ігнор, проєкт почався) — лише «Запит відхилено»
        if (Number.isFinite(reapplyAt) && reapplyAt <= now) {
          return (
            <button
              type="button"
              data-testid="project-join"
              data-state="reapply"
              onClick={openModal}
              className={greenButtonClass}
            >
              Подати знову
            </button>
          )
        }
        return (
          <>
            <p
              data-testid="project-join"
              data-state="rejected"
              className={`${pillClass} bg-[#C2D4EA] text-[#8B99AA]`}
            >
              Запит відхилено
            </p>
            {Number.isFinite(reapplyAt) && (
              <p className="text-center text-[10px] text-[#8B99AA]">
                Подати знову можна через{' '}
                {formatRetryAfter(Math.ceil((reapplyAt - now) / 1000))}
              </p>
            )}
          </>
        )
      }
      // Заявки немає або волонтер її скасував
      default:
        return (
          <button
            type="button"
            data-testid="project-join"
            data-state="default"
            onClick={openModal}
            className={greenButtonClass}
          >
            Приєднатись
          </button>
        )
    }
  })()

  return (
    <div className="flex flex-col gap-1">
      {content}
      {isModalOpen && (
        <JoinRequestModal
          title="Запит на участь у проєкті"
          subtitle={projectTitle}
          isSubmitting={createJoinRequest.isPending}
          error={createJoinRequest.error}
          describeError={projectJoinErrorText}
          onSubmit={handleSubmit}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  )
}
