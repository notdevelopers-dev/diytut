import { apiClient } from './client'
import type { OrganizationListItem } from '../types/organization'

export const MOCK_ORGANIZATIONS: OrganizationListItem[] = [
  {
    id: 1,
    name: 'Благодійний фонд «Повернись живим»',
    city_id: 1,
    city: 'Київ',
    description:
      'Один із найбільших благодійних фондів допомоги українським військовим. Забезпечуємо Сили оборони технологічною перевагою, навчаємо військових та аналізуємо безпекові виклики.',
    logo: 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb7?w=128&auto=format&fit=crop&q=80',
    status: 'approved',
    is_verified: true,
    projects_count: 14,
    email: 'contact@savelife.in.ua',
  },
  {
    id: 2,
    name: 'Благодійний фонд Сергія Притули',
    city_id: 1,
    city: 'Київ',
    description:
      'Фонд здійснює закупівлю бронетехніки, безпілотників, засобів звʼязку та тактичної медицини для сил оборони, а також надає гуманітарну допомогу цивільному населенню.',
    logo: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=128&auto=format&fit=crop&q=80',
    status: 'approved',
    is_verified: true,
    projects_count: 11,
    email: 'help@prytulafoundation.org',
  },
  {
    id: 3,
    name: 'Волонтерська сотня «Добра Справа»',
    city_id: 2,
    city: 'Львів',
    description:
      'Координаційний центр допомоги внутрішньо переміщеним особам, щоденне плетіння маскувальних сіток та організація гуманітарних рейсів у прифронтові райони.',
    logo: null,
    status: 'approved',
    is_verified: true,
    projects_count: 6,
    email: 'info@dobrasprava.lviv.ua',
  },
  {
    id: 4,
    name: 'Гуманітарний Хаб «Єдність»',
    city_id: 3,
    city: 'Дніпро',
    description:
      'Потужний логістичний осередок Придніпровʼя. Формування та доставка продуктових і гігієнічних наборів для родин із зони бойових дій.',
    logo: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=128&auto=format&fit=crop&q=80',
    status: 'approved',
    is_verified: true,
    projects_count: 8,
    email: 'hub.yednist@dnipro.ua',
  },
  {
    id: 5,
    name: 'Будівельний десант «Добробат»',
    city_id: 1,
    city: 'Київ',
    description:
      'Добровольчий будівельний батальйон, який допомагає відновлювати житлові будинки, школи та лікарні, зруйновані внаслідок бойових дій.',
    logo: null,
    status: 'approved',
    is_verified: true,
    projects_count: 9,
    email: 'team@dobrobat.in.ua',
  },
  {
    id: 6,
    name: 'Харківська правозахисна група',
    city_id: 4,
    city: 'Харків',
    description:
      'Правовий захист та всебічна гуманітарна допомога потерпілим від обстрілів, фіксація воєнних злочинів і юридичний супровід постраждалих родин.',
    logo: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=128&auto=format&fit=crop&q=80',
    status: 'approved',
    is_verified: true,
    projects_count: 5,
    email: 'khpg@khpg.org',
  },
  {
    id: 7,
    name: 'Одеський волонтерський центр «Південь»',
    city_id: 5,
    city: 'Одеса',
    description:
      'Матеріально-технічне забезпечення військових шпиталів, допомога пораненим бійцям та опіка над сімʼями переселенців з Херсонщини та Миколаївщини.',
    logo: null,
    status: 'approved',
    is_verified: true,
    projects_count: 4,
    email: 'pivden.odesa@gmail.com',
  },
  {
    id: 8,
    name: 'ГО «Освіта майбутнього»',
    city_id: 2,
    city: 'Львів',
    description:
      'Освітні онлайн-програми, безкоштовні репетиторські курси та психологічна адаптація для школярів із прифронтових міст.',
    logo: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=128&auto=format&fit=crop&q=80',
    status: 'approved',
    is_verified: true,
    projects_count: 7,
    email: 'contact@osvita-future.org.ua',
  },
  {
    id: 9,
    name: 'Благодійний фонд «Лапа допомоги»',
    city_id: 2,
    city: 'Львів',
    description:
      'Порятунок, евакуація, лікування та пошук нових родин для чотирилапих, постраждалих від війни. Підтримка притулків кормами та медикаментами.',
    logo: null,
    status: 'approved',
    is_verified: true,
    projects_count: 3,
    email: 'lapadopomohy@ukr.net',
  },
  {
    id: 10,
    name: 'Запорізька молодіжна ліга',
    city_id: 6,
    city: 'Запоріжжя',
    description:
      'Мобільні групи екстреної допомоги самотнім літнім людям та сімʼям з малюками у прифронтових громадах Запорізького району.',
    logo: null,
    status: 'approved',
    is_verified: true,
    projects_count: 4,
    email: 'zp.molod@gmail.com',
  },
  {
    id: 11,
    name: 'Вінницький хаб турботи',
    city_id: 7,
    city: 'Вінниця',
    description:
      'Комплексна соціальна та психологічна реабілітація ветеранів, арт-терапевтичні заняття для дітей та мовні клуби для переселенців.',
    logo: null,
    status: 'approved',
    is_verified: true,
    projects_count: 2,
    email: 'vin.hub@gmail.com',
  },
  {
    id: 12,
    name: 'Непідтверджена волонтерська ініціатива',
    city_id: 1,
    city: 'Київ',
    description:
      'Ця організація перебуває на розгляді модератора і не повинна відображатися волонтерам.',
    logo: null,
    status: 'pending',
    is_verified: false,
    projects_count: 0,
  },
  {
    id: 13,
    name: 'Відхилена тестова організація',
    city_id: 2,
    city: 'Львів',
    description:
      'Ця організація була відхилена модератором і не повинна відображатися у каталозі.',
    logo: null,
    status: 'rejected',
    is_verified: false,
    projects_count: 0,
  },
]

export interface FetchOrganizationsParams {
  city_id?: number | null
  limit?: number
  offset?: number
}

export const fetchOrganizations = async (
  params?: FetchOrganizationsParams,
): Promise<OrganizationListItem[]> => {
  try {
    const response = await apiClient.get<OrganizationListItem[]>(
      '/organizations',
      {
        params: {
          ...(params?.city_id ? { city_id: params.city_id } : {}),
          ...(params?.limit ? { limit: params.limit } : {}),
          ...(params?.offset ? { offset: params.offset } : {}),
        },
      },
    )
    if (Array.isArray(response.data) && response.data.length > 0) {
      return response.data
    }
    if (Array.isArray(response.data)) {
      return response.data
    }
    return MOCK_ORGANIZATIONS
  } catch {
    return MOCK_ORGANIZATIONS
  }
}
