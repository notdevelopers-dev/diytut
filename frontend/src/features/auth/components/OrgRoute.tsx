import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'

/**
 * Охоронець сторінок організації (кабінет /organization/dashboard, SCRUM-131).
 *
 * Вхід і заповнену анкету перевіряє ProtectedRoute; тут лише членство в організації:
 * волонтера без організації перенаправляємо на головну (критерій приймання).
 */
export const OrgRoute = ({ children }: { children?: ReactNode }) => {
  const { user } = useAuth()

  return (
    <ProtectedRoute>
      {user?.organization ? (
        (children ?? <Outlet />)
      ) : (
        <Navigate to="/" replace />
      )}
    </ProtectedRoute>
  )
}

export default OrgRoute
