import { Navigate, Route, Routes } from 'react-router-dom'
import { RootLayout } from '@/app/layouts/RootLayout'
import { AdminPage } from '@/features/admin'
import {
  AdminRoute,
  OrgRoute,
  LoginPage,
  ProtectedRoute,
  RegistrationCompletePage,
} from '@/features/auth'
import { HomePage } from '@/features/home'
import {
  CreateOrganizationPage,
  EditOrganizationPage,
  OrganizationDashboardPage,
  OrganizationsCatalogPage,
  OrganizationViewPage,
} from '@/features/organizations'
import {
  CreateProjectPage,
  ProjectsCatalogPage,
  ProjectViewPage,
} from '@/features/projects'
import { NotificationsPage } from '@/features/notifications'
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
      {/* Кабінет організації (SCRUM-131); старі посилання сповіщень /organization?… ведуть сюди */}
      <Route
        path="/organization/dashboard"
        element={
          <OrgRoute>
            <OrganizationDashboardPage />
          </OrgRoute>
        }
      />
      <Route
        path="/organization"
        element={<Navigate to="/organization/dashboard" replace />}
      />
      <Route path="/organizations" element={<OrganizationsCatalogPage />} />
      <Route path="/organizations/:id" element={<OrganizationViewPage />} />
      <Route path="/projects" element={<ProjectsCatalogPage />} />
      <Route path="/projects/:id" element={<ProjectViewPage />} />
      <Route
        path="/organization/projects/create"
        element={
          <ProtectedRoute>
            <CreateProjectPage />
          </ProtectedRoute>
        }
      />
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
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
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
