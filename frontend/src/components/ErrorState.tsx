export interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export const ErrorState = ({
  message = 'Не вдалося завантажити список проєктів. Будь ласка, спробуйте оновити або повторити запит.',
  onRetry,
}: ErrorStateProps) => {
  return (
    <div
      data-testid="error-state"
      className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center my-6 w-full"
    >
      <div className="mb-3 text-3xl">⚠️</div>
      <h3 className="mb-1 text-lg font-bold text-red-800">
        Помилка завантаження
      </h3>
      <p className="mb-4 max-w-md text-sm text-red-600 leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-outline btn-sm border-red-300 text-red-700 hover:bg-red-100 cursor-pointer"
        >
          Спробувати знову
        </button>
      )}
    </div>
  )
}

export default ErrorState
