import { useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import type { CityItem } from '../hooks/useCities'

interface CityComboboxProps {
  cities: CityItem[]
  /** id обраного міста або '' */
  value: number | ''
  onChange: (cityId: number | '') => void
  disabled?: boolean
  placeholder?: string
  inputClassName?: string
}

// Скільки варіантів показуємо одразу: повний список міст надто довгий для DOM
const MAX_VISIBLE = 50

const normalize = (text: string) => text.toLowerCase().replace(/’|'|ʼ/g, '’')

const cityLabel = (city: CityItem) =>
  city.region ? `${city.name} (${city.region})` : city.name

/**
 * Combobox міста: місто можна вписати з клавіатури, список фільтрується під час
 * введення, а значення — це завжди існуюче місто зі списку (або порожньо).
 */
export const CityCombobox = ({
  cities,
  value,
  onChange,
  disabled = false,
  placeholder = 'Почніть вводити назву міста',
  inputClassName = '',
}: CityComboboxProps) => {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = useMemo(
    () => cities.find((city) => city.id === value) ?? null,
    [cities, value],
  )

  // Текст у полі: поки користувач друкує — його запит, інакше назва обраного міста
  const [query, setQuery] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const inputText = query ?? (selected ? cityLabel(selected) : '')

  const options = useMemo(() => {
    const needle = normalize((query ?? '').trim())
    if (!needle) return cities
    const startsWith: CityItem[] = []
    const contains: CityItem[] = []
    for (const city of cities) {
      const name = normalize(city.name)
      if (name.startsWith(needle)) startsWith.push(city)
      else if (normalize(cityLabel(city)).includes(needle)) contains.push(city)
    }
    return [...startsWith, ...contains]
  }, [cities, query])

  const visible = options.slice(0, MAX_VISIBLE)

  const select = (city: CityItem) => {
    onChange(city.id)
    setQuery(null)
    setIsOpen(false)
  }

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setActiveIndex(0)
    setIsOpen(true)
    // Змінений текст більше не відповідає обраному місту
    if (value !== '') onChange('')
  }

  const handleBlur = () => {
    setIsOpen(false)
    // Якщо текст збігається з назвою єдиного міста — обираємо його, інакше скидаємо запит
    if (query !== null && value === '') {
      const exact = cities.filter(
        (city) => normalize(city.name) === normalize(query.trim()),
      )
      if (exact.length === 1) onChange(exact[0].id)
    }
    setQuery(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIsOpen(true)
      setActiveIndex((i) => Math.min(i + 1, visible.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && isOpen) {
      // Enter у відкритому списку обирає місто, а не відправляє форму
      e.preventDefault()
      if (visible[activeIndex]) select(visible[activeIndex])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setQuery(null)
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={inputText}
        placeholder={placeholder}
        onChange={handleInput}
        onFocus={(e) => {
          e.target.select()
          setIsOpen(true)
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={inputClassName}
      />
      {/* Приховане поле робить `required` валідним лише коли місто обрано зі списку */}
      <input
        tabIndex={-1}
        aria-hidden="true"
        required
        value={value === '' ? '' : String(value)}
        onChange={() => undefined}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0 opacity-0"
      />
      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[5px] border border-sky-300 bg-white py-1 text-xs shadow-lg"
        >
          {visible.length === 0 ? (
            <li className="px-3 py-2 text-gray-500">Міста не знайдено</li>
          ) : (
            visible.map((city, index) => (
              <li
                key={city.id}
                role="option"
                aria-selected={city.id === value}
                // mousedown, а не click: інакше blur поля закриє список раніше
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(city)
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer px-3 py-1.5 ${
                  index === activeIndex ? 'bg-[#DCECFF]' : ''
                }`}
              >
                {city.name}
                {city.region && (
                  <span className="text-gray-400"> ({city.region})</span>
                )}
              </li>
            ))
          )}
          {options.length > MAX_VISIBLE && (
            <li className="px-3 py-1.5 text-[10px] text-gray-400">
              Показано {MAX_VISIBLE} із {options.length}. Уточніть запит.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default CityCombobox
