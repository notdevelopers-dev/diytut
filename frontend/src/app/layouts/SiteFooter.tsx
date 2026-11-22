import { Link } from 'react-router-dom'
import { getStaticPage } from '@/content/staticPages'

/**
 * Багатоколонковий футер (SCRUM-135). Назви колонок і кольори — з макета Figma
 * (світло-блакитна смуга, жовта лінія зверху, сірий текст); посилання — із задачі.
 */
const FOOTER_COLUMNS: { title: string; paths: string[] }[] = [
  { title: 'Про платформу', paths: ['/guide', '/about', '/how-it-works'] },
  {
    title: 'Спільнота',
    paths: ['/about-volunteering', '/about-organizations'],
  },
  { title: 'Юридична інформація', paths: ['/terms'] },
]

// Рік для рядка про авторські права (рахуємо один раз, не під час кожного рендеру)
const CURRENT_YEAR = new Date().getFullYear()

export const SiteFooter = () => (
  <footer className="w-full border-t-2 border-info bg-[#DCECFF]">
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 px-8 py-8 min-[400px]:grid-cols-2 lg:grid-cols-4">
      {FOOTER_COLUMNS.map((column) => (
        <nav
          key={column.title}
          aria-label={column.title}
          className="flex flex-col gap-2"
        >
          <h2 className="text-base font-medium text-[#8B99AA]">
            {column.title}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {column.paths.map((path) => (
              <li key={path}>
                <Link
                  to={path}
                  className="text-sm text-[#5F6F82] no-underline transition-colors hover:text-main"
                >
                  {getStaticPage(path)?.linkLabel ?? path}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-medium text-[#8B99AA]">
          Авторські права
        </h2>
        <p className="text-sm text-[#5F6F82]">
          © {CURRENT_YEAR} ДійТут. Усі права захищено.
        </p>
      </div>
    </div>
  </footer>
)

export default SiteFooter
