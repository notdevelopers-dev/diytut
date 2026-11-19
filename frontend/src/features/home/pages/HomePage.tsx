import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Accordion } from '@/components/ui/Accordion'
import { useAuth } from '@/features/auth/hooks'
import { useCities } from '@/features/cities/hooks'
import { OrganizationCard } from '@/features/organizations/components/OrganizationCard'
import {
  ProjectCard,
  ProjectCardSkeleton,
} from '@/features/projects/components/ProjectCard'
import { useCategories, useOrganizationNames } from '@/features/projects/hooks'
import { FAQ_ITEMS } from '../faq'
import {
  SHOWCASE_SIZE,
  useShowcaseOrganizations,
  useShowcaseProjects,
  useStats,
} from '../hooks'

/** Кнопка героя за макетом: 325×54, тінь, текст 24px (на телефоні менше) */
const heroButtonClass =
  'flex h-[54px] w-full max-w-[325px] cursor-pointer items-center justify-center rounded-[5px] px-4 text-xl whitespace-nowrap text-black no-underline shadow-[0px_3px_4px_0px_rgba(26,44,74,0.25)] transition hover:brightness-95 lg:text-2xl'

/** Картка лічильника за макетом «Наша статистика»: рамка й зелене число */
const StatCard = ({
  title,
  value,
  frame,
}: {
  title: string
  value: number | undefined
  frame: string
}) => (
  <div
    className={`flex flex-col items-center gap-3 rounded-[5px] border-3 bg-white px-4 py-4 ${frame}`}
  >
    <h3 className="text-center text-lg text-black sm:text-2xl">{title}</h3>
    <span className="flex h-[46px] min-w-[173px] items-center justify-center rounded-[5px] bg-[#B5F291] px-6 text-2xl text-black">
      {value === undefined ? '…' : value.toLocaleString('uk-UA')}
    </span>
  </div>
)

/** Заголовок блоку вітрини з посиланням на весь каталог */
const ShowcaseHeader = ({
  title,
  to,
  linkLabel,
}: {
  title: string
  to: string
  linkLabel: string
}) => (
  <div className="flex flex-wrap items-end justify-between gap-2">
    <h2 className="font-head text-2xl font-normal text-black sm:text-3xl">
      {title}
    </h2>
    <Link
      to={to}
      className="text-sm font-medium text-main no-underline hover:text-main-hover sm:text-base"
    >
      {linkLabel} →
    </Link>
  </div>
)

const Section = ({ children }: { children: ReactNode }) => (
  <section className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 sm:px-8">
    {children}
  </section>
)

/**
 * Головна сторінка (SCRUM-134): відкривається першою й за кліком на логотип.
 * Гостям — герой із закликами (Figma «Hero Section»); далі для всіх — лічильники
 * (Figma «main menu»), вітрина з 3 проєктів і 3 організацій та FAQ.
 */
export const HomePage = () => {
  const navigate = useNavigate()
  const { isAuthenticated, isProfileComplete, user } = useAuth()
  const isRegistered = isAuthenticated && isProfileComplete

  const { data: stats, isError: isStatsError } = useStats()
  const projectsQuery = useShowcaseProjects()
  const organizationsQuery = useShowcaseOrganizations()
  const { data: organizationNames } = useOrganizationNames()
  const { cities } = useCities()
  const { data: categoryItems = [] } = useCategories()

  const cityNames = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities],
  )
  const categoryNames = useMemo(
    () => new Map(categoryItems.map((item) => [item.key, item.name])),
    [categoryItems],
  )

  // Куди ведуть заклики залежно від стану входу (критерій приймання):
  // гість — на вхід, анкету не заповнено — на завершення реєстрації
  const signUpTarget = isAuthenticated ? '/register/complete' : '/login'
  // «Створити організацію»: волонтер створює одразу; хто вже має організацію —
  // у профіль (форма створення таких не пускає); інші — спершу реєстрація
  const createOrganizationTarget = isRegistered
    ? user?.organization
      ? '/profile'
      : '/organization/create'
    : signUpTarget

  return (
    <div className="flex flex-col gap-10 pb-12">
      {/* Герой — лише для тих, хто ще не зареєструвався (Figma «Hero Section») */}
      {!isRegistered && (
        <section
          aria-label="Вітаємо"
          className="mt-8 bg-[#DCECFF] p-2 sm:mt-12 sm:p-[7px]"
        >
          <div className="flex flex-col items-center gap-8 bg-[#FAF2E0] px-4 py-10 sm:py-12">
            <h1 className="max-w-[760px] text-center font-head text-2xl font-normal text-black sm:text-[32px]">
              Твоя допомога потрібна зараз. Дій тут.
            </h1>
            <div className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8 lg:gap-[86px]">
              <button
                type="button"
                onClick={() => void navigate(signUpTarget)}
                className={`${heroButtonClass} bg-main`}
              >
                Стати волонтером
              </button>
              <button
                type="button"
                onClick={() => void navigate(createOrganizationTarget)}
                className={`${heroButtonClass} bg-info`}
              >
                Створити організацію
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Лічильники (Figma «main menu») */}
      <Section>
        <div
          className={`flex flex-col gap-6 ${isRegistered ? 'pt-8' : ''}`}
          aria-label="Статистика платформи"
        >
          <StatCard
            title="Кількість активних волонтерів"
            value={stats?.volunteers_count}
            frame="border-main"
          />
          <StatCard
            title="Кількість зареєстрованих організацій"
            value={stats?.organizations_count}
            frame="border-info"
          />
          {isStatsError && (
            <p className="text-center text-sm text-[#8B99AA]">
              Не вдалося завантажити статистику
            </p>
          )}
        </div>
      </Section>

      {/* Вітрина: свіжі проєкти */}
      <Section>
        <ShowcaseHeader
          title="Свіжі проєкти"
          to="/projects"
          linkLabel="Усі проєкти"
        />
        {projectsQuery.isLoading ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: SHOWCASE_SIZE }, (_, i) => (
              <li key={i}>
                <ProjectCardSkeleton />
              </li>
            ))}
          </ul>
        ) : projectsQuery.data && projectsQuery.data.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projectsQuery.data.map((project) => (
              <li key={project.id}>
                <ProjectCard
                  project={project}
                  organizationName={organizationNames?.get(
                    project.organization_id,
                  )}
                  categoryNames={categoryNames}
                  cityName={
                    project.city_id !== null
                      ? cityNames.get(project.city_id)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[5px] border-2 border-dashed border-[#DCECFF] bg-white px-4 py-6 text-center text-sm text-[#5F6F82]">
            {projectsQuery.isError
              ? 'Не вдалося завантажити проєкти'
              : 'Проєктів поки немає — вони з’являться тут щойно організації їх опублікують'}
          </p>
        )}
      </Section>

      {/* Вітрина: перевірені організації */}
      <Section>
        <ShowcaseHeader
          title="Організації"
          to="/organizations"
          linkLabel="Усі організації"
        />
        {organizationsQuery.data && organizationsQuery.data.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {organizationsQuery.data.map((organization) => (
              <li key={organization.id}>
                <OrganizationCard
                  organization={organization}
                  cityName={cityNames.get(organization.city_id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[5px] border-2 border-dashed border-[#DCECFF] bg-white px-4 py-6 text-center text-sm text-[#5F6F82]">
            {organizationsQuery.isLoading
              ? 'Завантаження організацій...'
              : organizationsQuery.isError
                ? 'Не вдалося завантажити організації'
                : 'Організацій поки немає'}
          </p>
        )}
      </Section>

      {/* Часті запитання (SCRUM-134, Could) */}
      <Section>
        <h2 className="font-head text-2xl font-normal text-black sm:text-3xl">
          Часті запитання
        </h2>
        <Accordion items={FAQ_ITEMS} />
      </Section>
    </div>
  )
}

export default HomePage
