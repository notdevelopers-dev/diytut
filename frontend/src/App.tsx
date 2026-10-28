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

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Public routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Registration questionnaire: requires authentication, but not yet completed profile */}
            <Route
              path="/register/complete"
              element={
                <ProtectedRoute requireProfileComplete={false}>
                  <RegistrationCompletePage />
                </ProtectedRoute>
              }
            />

            {/* Protected routes: require authentication AND completed profile */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute requireProfileComplete={true}>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            {/* Admin routes: require authenticated user with role 'admin' */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />

            {/* Fallback wildcard redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
