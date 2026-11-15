export const Spinner = ({ label = 'Завантаження...' }: { label?: string }) => (
  <div
    role="status"
    className="flex items-center justify-center gap-3 py-10 text-sm text-gray-500"
  >
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-main border-t-transparent" />
    {label}
  </div>
)
