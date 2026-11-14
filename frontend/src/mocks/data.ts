import type { OrganizationListItem } from '@/features/organizations/types'
import type { CityItem, OrgRole } from '@/types/common'

/*
 * Тестові дані для режиму без бекенду (`npm run dev:mock`).
 * Усе вигадане: імена, пошти, телефони й організації не належать реальним людям.
 */

export const MOCK_CITIES: CityItem[] = [
  { id: 1, name: 'Київ', region: 'Київська' },
  { id: 2, name: 'Львів', region: 'Львівська' },
  { id: 3, name: 'Дніпро', region: 'Дніпропетровська' },
  { id: 4, name: 'Харків', region: 'Харківська' },
  { id: 5, name: 'Одеса', region: 'Одеська' },
  { id: 6, name: 'Запоріжжя', region: 'Запорізька' },
  { id: 7, name: 'Вінниця', region: 'Вінницька' },
  { id: 8, name: 'Чернівці', region: 'Чернівецька' },
]

export interface MockUser {
  id: number
  email: string
  first_name: string
  last_name: string
  nickname: string
  phone: string
  birth_date: string
  gender: 'male' | 'female' | 'prefer_not_to_say'
  bio: string | null
  platform_role: 'user' | 'admin'
}

export interface MockOrganization extends OrganizationListItem {
  edrpou: string | null
}

export interface MockMembership {
  user_id: number
  organization_id: number
  role: OrgRole
}

export interface MockDb {
  users: MockUser[]
  organizations: MockOrganization[]
  memberships: MockMembership[]
  nextUserId: number
  nextOrganizationId: number
}

/** Тестові облікові записи, між якими можна перемикатися на сторінці входу. */
export const MOCK_ACCOUNTS = [
  {
    id: 'volunteer',
    label: 'Волонтер',
    description: 'Анкета заповнена, організації немає',
  },
  {
    id: 'owner',
    label: 'Власник організації',
    description: 'Власник схваленої організації',
  },
  {
    id: 'admin',
    label: 'Адміністратор платформи',
    description: 'Бачить адмін-панель',
  },
  {
    id: 'new',
    label: 'Новий користувач',
    description: 'Увійшов через Google, анкети ще немає',
  },
] as const

export type MockAccountId = (typeof MOCK_ACCOUNTS)[number]['id']

/** Дані Google для «нового користувача» (форма реєстрації підставляє їх). */
export const MOCK_NEW_USER = {
  email: 'new.user@example.com',
  first_name: 'Ілона',
  last_name: 'Тестова',
}

const seedUsers: MockUser[] = [
  {
    id: 1,
    email: 'volunteer@example.com',
    first_name: 'Марія',
    last_name: 'Коваль',
    nickname: 'maria_koval',
    phone: '+380501112233',
    birth_date: '1998-04-12',
    gender: 'female',
    bio: 'Тестовий волонтер.',
    platform_role: 'user',
  },
  {
    id: 2,
    email: 'owner@example.com',
    first_name: 'Андрій',
    last_name: 'Мельник',
    nickname: 'andrii_melnyk',
    phone: '+380672223344',
    birth_date: '1990-09-03',
    gender: 'male',
    bio: null,
    platform_role: 'user',
  },
  {
    id: 3,
    email: 'admin@example.com',
    first_name: 'Олена',
    last_name: 'Бондар',
    nickname: 'olena_admin',
    phone: '+380933334455',
    birth_date: '1987-01-25',
    gender: 'female',
    bio: null,
    platform_role: 'admin',
  },
]

const ORG_NAMES = [
  'Благодійний фонд «Світанок»',
  'Волонтерська сотня «Добра Справа»',
  'ГО «Освіта майбутнього»',
  'Гуманітарний хаб «Єдність»',
  'Фонд «Лапа допомоги»',
  'Молодіжна ліга «Крок»',
  'Центр турботи «Прихисток»',
  'Будівельний десант «Відбудова»',
  'Медична група «Перша допомога»',
  'ГО «Тепло родини»',
  'Фонд «Книга для кожного»',
  'Екоініціатива «Чисте місто»',
]

const seedOrganizations = (): MockOrganization[] => {
  const organizations: MockOrganization[] = Array.from(
    { length: 22 },
    (_, index) => {
      const number = index + 2
      const name = ORG_NAMES[index % ORG_NAMES.length] ?? 'Тестова організація'
      return {
        id: number,
        name: index < ORG_NAMES.length ? name : `${name} ${number}`,
        email: `org${number}@example.com`,
        phone: `+3806700000${String(number).padStart(2, '0')}`,
        city_id: (index % MOCK_CITIES.length) + 1,
        description:
          index % 4 === 3
            ? null
            : 'Допомагаємо тим, хто цього потребує: збираємо речі, організовуємо виїзди та підтримуємо місцеві громади.',
        status: index === 5 ? 'pending' : 'approved',
        created_at: new Date(
          Date.UTC(2026, 10, 13 - Math.floor(index / 2), 12 - (index % 8), 30),
        ).toISOString(),
        edrpou: null,
      }
    },
  )

  // Організація, якою володіє тестовий «власник»
  organizations.unshift({
    id: 1,
    name: 'Благодійний фонд «Тестовий»',
    email: 'fund@example.com',
    phone: '+380442223344',
    city_id: 1,
    description: 'Організація тестового власника: її можна редагувати.',
    status: 'approved',
    created_at: new Date(Date.UTC(2026, 10, 14, 9, 15)).toISOString(),
    edrpou: '12345678',
  })
  return organizations
}

export const createSeedDb = (): MockDb => ({
  users: seedUsers,
  organizations: seedOrganizations(),
  memberships: [{ user_id: 2, organization_id: 1, role: 'owner' }],
  nextUserId: 100,
  nextOrganizationId: 1000,
})
