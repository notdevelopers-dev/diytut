export interface EmptyStateProps {
  title?: string
  description?: string
  onReset?: () => void
}

export const EmptyState = ({
  title = 'No projects found',
  description = 'Не знайдено жодного проєкту, що відповідає обраним критеріям. Спробуйте змінити пошуковий запит або скинути фільтри.',
  onReset,
}: EmptyStateProps) => {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center shadow-xs my-6 w-full"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-3xl text-[#5897FB]">
        🔍
      </div>
      <h3 className="mb-2 text-xl font-bold text-ink">{title}</h3>
      <p className="mb-6 max-w-md text-sm text-ink-muted leading-relaxed">
        {description}
      </p>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="btn btn-primary btn-sm cursor-pointer"
        >
          Скинути фільтри
        </button>
      )}
    </div>
  )
}

export default EmptyState
