import { apiClient } from './client'
import type {
  OrganizationDetails,
  JoinRequestResponse,
  JoinRequestStatusResponse,
} from '../types/organization'
import type { Project } from '../types/project'

export const MOCK_ORGANIZATIONS: OrganizationDetails[] = [
  {
    id: 1,
    name: 'Благодійний фонд «Повернись живим»',
    city_id: 1,
    city_name: 'Київ',
    email: 'contact@savelife.in.ua',
    phone: '+380671234567',
    description:
      'Один із найбільших благодійних фондів допомоги українським військовим. Забезпечуємо Сили оборони технологічною перевагою, навчаємо військових та аналізуємо безпекові виклики з 2014 року.',
    edrpou: '39609885',
    status: 'approved',
    is_verified: true,
    projects_count: 2,
    created_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 2,
    name: 'Благодійний фонд Сергія Притули',
    city_id: 1,
    city_name: 'Київ',
    email: 'help@prytulafoundation.org',
    phone: '+380679876543',
    description:
      'Фонд здійснює закупівлю бронетехніки, безпілотників, засобів звʼязку та тактичної медицини для сил оборони, а також надає гуманітарну допомогу цивільному населенню.',
    edrpou: '43720363',
    status: 'approved',
    is_verified: true,
    projects_count: 1,
    created_at: '2026-02-20T12:00:00Z',
  },
  {
    id: 3,
    name: 'Волонтерська сотня «Добра Справа»',
    city_id: 2,
    city_name: 'Львів',
    email: 'info@dobrasprava.lviv.ua',
    phone: '+380501112233',
    description:
      'Координаційний центр допомоги внутрішньо переміщеним особам, щоденне плетіння маскувальних сіток та організація гуманітарних рейсів у прифронтові райони.',
    edrpou: '41234567',
    status: 'approved',
    is_verified: true,
    projects_count: 1,
    created_at: '2026-03-05T09:30:00Z',
  },
]

export const MOCK_PROJECTS: Record<number, Project[]> = {
  1: [
    {
      id: 101,
      organization_id: 1,
      organization: 'Благодійний фонд «Повернись живим»',
      organization_name: 'Благодійний фонд «Повернись живим»',
      title: 'Навчання інструкторів з тактичної медицини',
      description:
        'Підготовка бойових медиків та забезпечення їх необхідними сертифікованими засобами надання першої невідкладної допомоги в зоні бойових дій.',
      tags: ['Медицина', 'Військові', 'Навчання'],
      is_online: false,
      city: 'Київ',
      city_id: 1,
      volunteer_hours: 12,
      is_adult_only: true,
      status: 'published',
    },
    {
      id: 102,
      organization_id: 1,
      organization: 'Благодійний фонд «Повернись живим»',
      organization_name: 'Благодійний фонд «Повернись живим»',
      title: 'Технічна підтримка аеророзвідки',
      description:
        'Збирання та налаштування компонентів безпілотних літальних апаратів, тестування платформ та підготовка до польових випробувань.',
      tags: ['IT', 'Дрони', 'Техніка'],
      is_online: true,
      volunteer_hours: 8,
      is_adult_only: false,
      status: 'published',
    },
  ],
  2: [
    {
      id: 201,
      organization_id: 2,
      organization: 'Благодійний фонд Сергія Притули',
      organization_name: 'Благодійний фонд Сергія Притули',
      title: 'Гуманітарне сортування на складі хабу',
      description:
        'Сортування та фасування продуктових і санітарних наборів для мешканців деокупованих територій та прифронтових населених пунктів.',
      tags: ['Гуманітарка', 'Склад', 'Допомога'],
      is_online: false,
      city: 'Київ',
      city_id: 1,
      volunteer_hours: 6,
      status: 'published',
    },
  ],
  3: [
    {
      id: 301,
      organization_id: 3,
      organization: 'Волонтерська сотня «Добра Справа»',
      organization_name: 'Волонтерська сотня «Добра Справа»',
      title: 'Плетіння маскувальних сіток для передової',
      description:
        'Щоденна спільна праця над сітками та «кікіморами» різних кольорових схем під сезонний ландшафт. Чекаємо на кожного помічника!',
      tags: ['Сітки', 'Львів', 'Військові'],
      is_online: false,
      city: 'Львів',
      city_id: 2,
      volunteer_hours: 4,
      status: 'published',
    },
  ],
}

/**
 * Отримати повний профіль організації за id
 */
export const fetchOrganizationById = async (
  id: string | number,
): Promise<OrganizationDetails> => {
  try {
    const response = await apiClient.get<OrganizationDetails>(
      `/organizations/${id}`,
    )
    return response.data
  } catch (err: unknown) {
    const numId = Number(id)
    const mock = MOCK_ORGANIZATIONS.find((o) => o.id === numId)
    if (mock) {
      return mock
    }
    throw err
  }
}

/**
 * Отримати опубліковані проєкти організації
 */
export const fetchOrganizationProjects = async (
  id: string | number,
): Promise<Project[]> => {
  try {
    const response = await apiClient.get<Project[]>(
      `/organizations/${id}/projects`,
    )
    if (Array.isArray(response.data)) {
      return response.data
    }
    return []
  } catch {
    const numId = Number(id)
    return MOCK_PROJECTS[numId] || []
  }
}

/**
 * Подати заявку на приєднання до організації
 */
export const createJoinRequest = async (
  organizationId: string | number,
  motivation: string,
): Promise<JoinRequestResponse> => {
  const response = await apiClient.post<JoinRequestResponse>(
    `/organizations/${organizationId}/join-requests`,
    {
      motivation,
      message: motivation,
    },
  )
  return response.data
}

/**
 * Перевірити статус заявки поточного авторизованого користувача
 */
export const fetchJoinRequestStatus = async (
  organizationId: string | number,
): Promise<JoinRequestStatusResponse> => {
  try {
    const response = await apiClient.get<JoinRequestStatusResponse>(
      `/organizations/${organizationId}/join-requests/me`,
    )
    return response.data
  } catch {
    return { status: null }
  }
}
