<<<<<<< HEAD
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { Layout } from './components/Layout'
=======
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
import { CreateOrganizationPage } from './pages/CreateOrganisationPage.tsx'
import { EditOrganizationPage } from './pages/EditOrganizationPage.tsx'
>>>>>>> 2eceb65 (changing code left, creating temp mockups for testing)

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
<<<<<<< HEAD
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
=======
          {/* Автономні сторінки без подвійних рамок і шапок */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register/complete" element={<RegistrationCompletePage />} />
          <Route path="/organization/create" element={<CreateOrganizationPage />} />
          <Route path="/organization/edit" element={<EditOrganizationPage />} />

          {/* Внутрішні сторінки під спільною шапкою з кнопкою ☰ */}
>>>>>>> 2eceb65 (changing code left, creating temp mockups for testing)
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/profile"
              element={
<<<<<<< HEAD
                <ProtectedRoute>
=======
                <ProtectedRoute requireProfileComplete={false}>
>>>>>>> 2eceb65 (changing code left, creating temp mockups for testing)
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
<<<<<<< HEAD
            <Route
              path="/organization/create"
              element={<CreateOrganizationPage />}
            />
=======
>>>>>>> 2eceb65 (changing code left, creating temp mockups for testing)
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
<<<<<<< HEAD
=======
            <Route path="*" element={<Navigate to="/" replace />} />
>>>>>>> 2eceb65 (changing code left, creating temp mockups for testing)
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App