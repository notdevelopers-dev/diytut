import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminRoute } from './components/AdminRoute.tsx'
import { Layout } from './components/Layout.tsx'
import { ProtectedRoute } from './components/ProtectedRoute.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { AdminPage } from './pages/AdminPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'
import { RegistrationCompletePage } from './pages/RegistrationCompletePage.tsx'
// 👉 1. ДОДАЙ ЦЕЙ ІМПОРТ:
import { CreateOrganizationPage } from './pages/CreateOrganisationPage.tsx'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Публічні сторінки */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Анкета реєстрації */}
            <Route
              path="/register/complete"
              element={
                <ProtectedRoute requireProfileComplete={false}>
                  <RegistrationCompletePage />
                </ProtectedRoute>
              }
            />

            {/* Захищені сторінки */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute requireProfileComplete={true}>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            {/* 👉 2. ДОДАЙ ЦЕЙ МАРШРУТ СТВОРЕННЯ ОРГАНІЗАЦІЇ: */}
            <Route
              path="/organization/create"
              element={<CreateOrganizationPage />}
            />

            {/* Адмінка */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />

            {/* Редірект на головну */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
