import { Link } from 'react-router-dom'

/** Логотип «ДійТут»: завжди веде на головну сторінку. */
export const Logo = () => (
  <Link
    to="/"
    aria-label="ДійТут — на головну"
    className="text-3xl font-bold tracking-tight no-underline"
  >
    <span className="text-[#5897FB]">Дій</span>
    <span className="text-[#F4B840]">Тут</span>
  </Link>
)

export default Logo
