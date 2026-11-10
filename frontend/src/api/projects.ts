import axios from 'axios'
import { apiClient } from './client'
import type { Project } from '../types/project'

export const MOCK_PROJECTS: Project[] = [
  {
    id: 1,
    title: 'Плетіння маскувальних сіток для захисників',
    organization: 'Волонтерська сотня «Добра Справа»',
    description:
      'Запрошуємо небайдужих долучитися до плетіння зимових маскувальних сіток для передової. Навчаємо на місці, досвід не потрібен. Працюємо щодня у затишному волонтерському штабі.',
    tags: ['Військові', 'Плетіння сіток', 'Терміново'],
    is_online: false,
    city: 'Київ',
    address: 'вул. Хрещатик, 22',
    capacity: 25,
    volunteer_hours: 3,
    experience_level: 'novice',
    status: 'published',
  },
  {
    id: 2,
    title: 'Онлайн-репетиторство для дітей із прифронтових зон',
    organization: 'ГО «Освіта майбутнього»',
    description:
      'Допомога школярам 5–9 класів у вивченні математики, української та англійської мов. Заняття проходять у Zoom у зручний для вас час.',
    tags: ['Освіта', 'Діти', 'Онлайн'],
    is_online: true,
    capacity: 50,
    volunteer_hours: 2,
    experience_level: 'intermediate',
    status: 'published',
  },
  {
    id: 3,
    title: 'Догляд за підопічними у притулку для тварин',
    organization: 'Благодійний фонд «Лапа допомоги»',
    description:
      'Шукаємо волонтерів для вигулу собак, прибирання вольєрів та допомоги ветеринарам. Подаруйте тепло та турботу чотирилапим друзям!',
    tags: ['Тварини', 'Притулок', 'Екологія'],
    is_online: false,
    city: 'Львів',
    address: 'вул. Стрийська, 108',
    capacity: 15,
    volunteer_hours: 4,
    experience_level: 'novice',
    status: 'published',
  },
  {
    id: 4,
    title: 'Сортування та фасування гуманітарної допомоги',
    organization: 'Гуманітарний Хаб «Єдність»',
    description:
      'Розвантаження фур із продовольством, формування продуктових та гігієнічних наборів для внутрішньо переміщених осіб.',
    tags: ['Гуманітарна допомога', 'ВПО', 'Логістика'],
    is_online: false,
    city: 'Дніпро',
    address: 'просп. Дмитра Яворницького, 45',
    capacity: 30,
    volunteer_hours: 5,
    experience_level: 'novice',
    status: 'published',
  },
  {
    id: 5,
    title: 'Відновлення пошкоджених домівок після обстрілів',
    organization: 'Будівельний десант «Добробат»',
    description:
      'Прибирання завалів, забивання вікон OSB-плитами, лагодження покрівель для літніх людей та постраждалих родин.',
    tags: ['Відбудова', 'Терміново', 'Фізична праця'],
    is_online: false,
    city: 'Харків',
    address: 'вул. Сумська, 12',
    capacity: 20,
    volunteer_hours: 6,
    experience_level: 'intermediate',
    status: 'published',
  },
  {
    id: 6,
    title: 'Digital-підтримка: дизайн та SMM для благодійних ініціатив',
    organization: 'Центр громадських комунікацій',
    description:
      'Створення візуалів, монтаж коротких відео для Reels/TikTok та написання постів про діяльність волонтерських зборів.',
    tags: ['IT / Медіа', 'Дизайн', 'Онлайн'],
    is_online: true,
    capacity: 10,
    volunteer_hours: 2.5,
    experience_level: 'intermediate',
    status: 'published',
  },
]

export const fetchProjects = async (): Promise<Project[]> => {
  try {
    const response = await apiClient.get<Project[]>('/projects')
    if (Array.isArray(response.data) && response.data.length > 0) {
      return response.data
    }
    return response.data || []
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return MOCK_PROJECTS
    }
    throw err
  }
}
