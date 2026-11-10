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
import { EditOrganizationPage } from './pages/EditOrganizationPage'
import { ProjectsCatalogPage } from './pages/ProjectsCatalogPage'

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
            <Route path="/projects" element={<ProjectsCatalogPage />} />
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
