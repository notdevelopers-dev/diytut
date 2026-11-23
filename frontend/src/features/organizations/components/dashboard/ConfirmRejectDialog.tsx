import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

/**
 * Підтвердження відхилення заявки (спільне вікно сайту ConfirmDialog).
 * `withIgnore` — «Відхилити й ігнорувати» для заявки на проєкт (SCRUM-164).
 */
export const ConfirmRejectDialog = ({
  applicantName,
  withIgnore = false,
  isPending,
  onConfirm,
  onCancel,
}: {
  applicantName: string
  withIgnore?: boolean
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) => (
  <ConfirmDialog
    title={withIgnore ? 'Відхилити й ігнорувати?' : 'Відхилити заявку?'}
    confirmLabel={withIgnore ? 'Відхилити й ігнорувати' : 'Відхилити'}
    pendingLabel="Відхилення…"
    isPending={isPending}
    onConfirm={onConfirm}
    onCancel={onCancel}
  >
    Заявку <strong className="font-semibold">{applicantName}</strong> буде
    відхилено, а волонтер отримає сповіщення. Скасувати це рішення не можна.
    {withIgnore &&
      ' Волонтер також не зможе подавати заявки на проєкти вашої організації, доки ви не знімете ігнор.'}
  </ConfirmDialog>
)
