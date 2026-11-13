import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.tsx'
import { ProtectedRoute } from './ProtectedRoute.tsx'

interface AdminRouteProps {
  children?: ReactNode
}

/**
 * Охоронець маршрутів для адміністративних сторінок (/admin).
 *
 * Автентифікацію і завершеність анкети перевіряє ProtectedRoute, тут лише роль:
 * не 'admin' (волонтер або організація) -> перенаправляє на головну '/'.
 */
export const AdminRoute = ({ children }: AdminRouteProps) => {
  const { role } = useAuth()

  return (
    <ProtectedRoute>
      {role === 'admin' ? (
        (children ?? <Outlet />)
      ) : (
        <Navigate to="/" replace />
      )}
    </ProtectedRoute>
  )
}

export default AdminRoute
