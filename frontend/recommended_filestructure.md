frontend/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── public/
├── решта барахла
└── src/
    ├── main.tsx              # точка входу: render, провайдери
    ├── app/
    │   ├── App.tsx
    │   ├── router.tsx        # маршрути (React Router / TanStack Router)
    │   ├── providers.tsx     # QueryClient, Auth, Theme
    │   └── layouts/
    │       ├── RootLayout.tsx
    │       └── AuthLayout.tsx
    ├── features/
    │   ├── auth/
    │   │   ├── api.ts        # запити до /api/auth/* –– use ReactQuery
    │   │   ├── hooks.ts      # useCurrentUser, useLogout
    │   │   ├── components/
    │   │   ├── ProtectedRoute.tsx
    │   │   └── index.ts      # публічний API фічі
    │   ├── organizations/
    │   │   ├── api.ts
    │   │   ├── hooks.ts
    │   │   ├── types.ts
    │   │   ├── components/
    │   │   └── pages/
    │   │       ├── OrganizationsPage.tsx
    │   │       └── OrganizationDetailPage.tsx
    │   └── users/
    │       └── ...
    ├── components/           # спільні UI-компоненти без бізнес-логіки
    │   ├── ui/               # Button, Input, Modal, Table
    │   └── feedback/         # Spinner, ErrorBoundary, EmptyState
    ├── hooks/                # спільні хуки (useDebounce, useDisclosure)
    ├── lib/
    │   ├── api-client.ts     # fetch/axios обгортка, обробка 401
    │   ├── query-client.ts   # для react Query -- use ReactQuery
    │   └── utils.ts
    ├── config/
    │   └── env.ts            # типізований доступ до import.meta.env
    ├── types/                # глобальні типи (або згенеровані з OpenAPI)
    ├── styles/
    │   └── globals.css
    └── assets/