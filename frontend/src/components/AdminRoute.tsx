import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

interface AdminRouteProps {
  children?: ReactNode
}

/**
 * Охоронець маршрутів для адміністративних сторінок (/admin).
 *
 * Логіка поведінки:
 * 1. Якщо користувач не увійшов у систему -> перенаправляє на /login.
 * 2. Якщо користувач увійшов, але має іншу роль (волонтер або організація) ->
 *    блокує доступ та перенаправляє на головну сторінку '/'.
 * 3. Якщо роль 'admin' -> відкриває доступ до адмін-панелі.
 */
export const AdminRoute = ({ children }: AdminRouteProps) => {
  const { isAuthenticated, role } = useAuth()
  const location = useLocation()

  // 1. Якщо не авторизований -> на /login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // 2. Якщо роль не 'admin' (наприклад, звичайний волонтер чи організація) -> блокуємо на '/'
  if (role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return children ? <>{children}</> : <Outlet />
}

export default AdminRoute
