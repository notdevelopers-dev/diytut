import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import searchIcon from '@/assets/icons/menu/search.svg'

/**
 * Пошук у шапці (Figma «Frame 7»). Веде в каталог проєктів: каталог читає ?q=,
 * тож працює й пошук за хештегами («#толока»).
 */
export const HeaderSearch = ({ className = '' }: { className?: string }) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    void navigate(q ? `/projects?q=${encodeURIComponent(q)}` : '/projects')
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={className}>
      <label className="flex h-9 w-full items-center gap-2 rounded-[5px] border border-main bg-[#DCECFF] pr-3 pl-1 focus-within:ring-2 focus-within:ring-main/40">
        <img src={searchIcon} alt="" width={28} height={28} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук"
          aria-label="Пошук проєктів"
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-black placeholder:text-black focus:outline-none"
        />
      </label>
    </form>
  )
}
