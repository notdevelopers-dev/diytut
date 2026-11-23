import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getStaticPage } from '@/content/staticPages'

/**
 * Шаблон текстової сторінки (SCRUM-135): жовта смуга із заголовком, як на інших
 * сторінках, і вміст із src/content/staticPages.ts.
 */
export const StaticPage = ({ path }: { path: string }) => {
  const page = getStaticPage(path)

  // Посилання у футері ведуть сюди з низу сторінки: відкриваємо нову сторінку з початку
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [path])

  if (!page) {
    return (
      <div className="flex flex-col items-start gap-3 px-8 py-10">
        <h1 className="text-2xl text-black">Сторінку не знайдено</h1>
        <Link to="/" className="text-main underline">
          На головну
        </Link>
      </div>
    )
  }

  return (
    <article className="flex flex-col">
      <div className="border-y border-info bg-cream px-8 py-1">
        <h1 className="text-3xl font-normal text-black">{page.title}</h1>
      </div>

      <div className="flex w-full max-w-3xl flex-col gap-8 px-8 py-8">
        <p className="text-lg text-black">{page.lead}</p>

        {page.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="font-head text-2xl font-normal text-main">
              {section.heading}
            </h2>
            {section.paragraphs?.map((text) => (
              <p key={text} className="text-base leading-relaxed text-black">
                {text}
              </p>
            ))}
            {section.items && (
              <ul className="flex flex-col gap-2">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-base leading-relaxed text-black"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2.5 size-2 shrink-0 rounded-full bg-main"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}

export default StaticPage
