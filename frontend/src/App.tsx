import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/layouts/ProtectedRoute'
import { AdminRoute } from './components/layouts/AdminRoute'
import { Layout } from './components/layouts/Layout'

import { LoginPage } from './pages/auth/LoginPage'
import { RegistrationCompletePage } from './pages/auth/RegistrationCompletePage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/users/ProfilePage'
import { AdminPage } from './pages/admin/AdminPage'
import { CreateOrganizationPage } from './pages/organizations/CreateOrganisationPage'
import { EditOrganizationPage } from './pages/organizations/EditOrganizationPage'

export const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Автономні сторінки без подвійних рамок і шапок */}
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/register/complete"
            element={
              <ProtectedRoute requireProfileComplete={false}>
                <RegistrationCompletePage />
              </ProtectedRoute>
            }
          />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/organization/create"
              element={<CreateOrganizationPage />}
            />
            <Route
              path="/organization/edit"
              element={<EditOrganizationPage />}
            />
          </Route>

          {/* Внутрішній сайт під спільним Layout */}
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
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
