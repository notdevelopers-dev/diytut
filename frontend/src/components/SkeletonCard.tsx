export const SkeletonCard = () => {
  return (
    <div
      data-testid="skeleton-card"
      className="flex flex-col justify-between rounded-xl border border-border bg-white p-6 shadow-xs animate-pulse min-h-[260px]"
    >
      <div>
        {/* Header row: Organization pill and online/offline badge placeholder */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="h-5 w-32 rounded-md bg-gray-200" />
          <div className="h-5 w-16 rounded-full bg-gray-200" />
        </div>

        {/* Title placeholder */}
        <div className="space-y-2 mb-4">
          <div className="h-5 w-4/5 rounded bg-gray-200" />
          <div className="h-5 w-2/3 rounded bg-gray-200" />
        </div>

        {/* Description placeholder */}
        <div className="space-y-2">
          <div className="h-3.5 w-full rounded bg-gray-100" />
          <div className="h-3.5 w-11/12 rounded bg-gray-100" />
          <div className="h-3.5 w-4/5 rounded bg-gray-100" />
        </div>
      </div>

      {/* Badges placeholder */}
      <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-gray-100">
        <div className="h-6 w-16 rounded-full bg-gray-200" />
        <div className="h-6 w-20 rounded-full bg-gray-200" />
        <div className="h-6 w-14 rounded-full bg-gray-200" />
      </div>
    </div>
  )
}

export default SkeletonCard
