import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { Layout } from './components/Layout'

import { LoginPage } from './pages/LoginPage'
import { RegistrationCompletePage } from './pages/RegistrationCompletePage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { AdminPage } from './pages/AdminPage'
import { CreateOrganizationPage } from './pages/CreateOrganisationPage'

export const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Повноекранні сторінки без рамочок і без глобального меню */}
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/register/complete"
            element={
              <ProtectedRoute requireProfileComplete={false}>
                <RegistrationCompletePage />
              </ProtectedRoute>
            }
          />

          {/* Внутрішній сайт з шапкою та навігацією */}
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/organization/create"
              element={<CreateOrganizationPage />}
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
