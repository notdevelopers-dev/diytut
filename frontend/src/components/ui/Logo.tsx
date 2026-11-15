import { Link } from 'react-router-dom'

/** Логотип «ДійТут»: завжди веде на головну сторінку. */
export const Logo = () => (
  <Link
    to="/"
    aria-label="ДійТут — на головну"
    className="font-logo text-3xl no-underline"
  >
    <span className="text-main">Дій</span>
    <span className="text-[#F4B840]">Тут</span>
  </Link>
)

export default Logo
