import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

interface ProtectedRouteProps {
  children?: ReactNode
  /**
   * Чи вимагається заповнена анкета (isProfileComplete).
   * За замовчуванням true: якщо анкету не заповнено, редиректить на /register/complete.
   * Для самого маршруту /register/complete слід передавати false, щоб уникнути циклічного редиректу.
   */
  requireProfileComplete?: boolean
}

/**
 * Охоронець маршрутів для захищених сторінок (наприклад, /profile).
 *
 * Логіка поведінки:
 * 1. Якщо користувач не увійшов у систему -> перенаправляє на /login із збереженням попередньої сторінки в state.from.
 * 2. Якщо користувач увійшов, але ще не заповнив обов'язкову анкету -> перенаправляє на /register/complete.
 * 3. Якщо все гаразд -> рендерить дочірні компоненти або `<Outlet />`.
 */
export const ProtectedRoute = ({
  children,
  requireProfileComplete = true,
}: ProtectedRouteProps) => {
  const { isAuthenticated, isProfileComplete } = useAuth()
  const location = useLocation()

  // 1. Не авторизований -> на /login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // 2. Авторизований, але анкета не завершена -> на /register/complete
  if (requireProfileComplete && !isProfileComplete) {
    return (
      <Navigate to="/register/complete" state={{ from: location }} replace />
    )
  }

  return children ? <>{children}</> : <Outlet />
}

export default ProtectedRoute
