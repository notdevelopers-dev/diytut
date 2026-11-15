import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

export const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center gap-2 py-10 text-center">
    <p className="text-base font-bold text-black">{title}</p>
    {description && <p className="text-sm text-gray-500">{description}</p>}
    {action}
  </div>
)
