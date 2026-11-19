import { Navigate, Route, Routes } from 'react-router-dom'
import { RootLayout } from '@/app/layouts/RootLayout'
import { AdminPage } from '@/features/admin'
import {
  AdminRoute,
  LoginPage,
  ProtectedRoute,
  RegistrationCompletePage,
} from '@/features/auth'
import { HomePage } from '@/features/home'
import {
  CreateOrganizationPage,
  EditOrganizationPage,
  OrganizationsCatalogPage,
  OrganizationViewPage,
} from '@/features/organizations'
import { ProjectsCatalogPage, ProjectViewPage } from '@/features/projects'
import { StaticPage } from '@/features/static-pages'
import { ProfilePage } from '@/features/users'
import { STATIC_PAGES } from '@/content/staticPages'

/** Усі маршрути застосунку в одному місці. */
export const AppRoutes = () => (
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
      <Route path="/organization/create" element={<CreateOrganizationPage />} />
      <Route path="/organization/edit" element={<EditOrganizationPage />} />
    </Route>

    {/* Внутрішній сайт під спільним RootLayout */}
    <Route element={<RootLayout />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/organizations" element={<OrganizationsCatalogPage />} />
      <Route path="/organizations/:id" element={<OrganizationViewPage />} />
      <Route path="/projects" element={<ProjectsCatalogPage />} />
      <Route path="/projects/:id" element={<ProjectViewPage />} />
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
      {/* Статичні інформаційні сторінки з футера (публічні) */}
      {STATIC_PAGES.map((page) => (
        <Route
          key={page.path}
          path={page.path}
          element={<StaticPage path={page.path} />}
        />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
)
