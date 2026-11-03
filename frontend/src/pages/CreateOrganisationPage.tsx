import { useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'

interface CityItem {
  id: number
  name: string
  region: string
}

export const CreateOrganizationPage = () => {
  const navigate = useNavigate()

  // 1. Список міст (мокап без потреби в бекенді)
  const cities: CityItem[] = [
    { id: 1, name: 'Київ', region: 'Київська' },
    { id: 2, name: 'Львів', region: 'Львівська' },
    { id: 3, name: 'Одеса', region: 'Одеська' },
    { id: 4, name: 'Харків', region: 'Харківська' },
    { id: 5, name: 'Дніпро', region: 'Дніпропетровська' },
  ]

  // 2. Стан полів за макетом Figma
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('+380')
  const [cityId, setCityId] = useState<number>(1)
  const [edrpou, setEdrpou] = useState('') // Необов'язковий
  const [description, setDescription] = useState('')

  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [edrpouError, setEdrpouError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 3. Валідація номера телефону
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value
    if (!input.startsWith('+380')) {
      input = '+380'
    }
    const cleaned = '+' + input.slice(1).replace(/\D/g, '').slice(0, 12)
    setPhone(cleaned)

    if (!/^\+380\d{9}$/.test(cleaned)) {
      setPhoneError('Формат: +380XXXXXXXXX (9 цифр після +380)')
    } else {
      setPhoneError(null)
    }
  }

  // 4. Валідація ЄДРПОУ (необов'язковий, але якщо введений — 8 цифр)
  const handleEdrpouChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8)
    setEdrpou(value)

    if (value.length > 0 && value.length !== 8) {
      setEdrpouError('Код ЄДРПОУ має містити рівно 8 цифр')
    } else {
      setEdrpouError(null)
    }
  }

  // 5. Збереження форми
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    if (!/^\+380\d{9}$/.test(phone)) {
      setPhoneError('Введіть коректний номер телефону (+380XXXXXXXXX)')
      return
    }

    if (edrpou.length > 0 && edrpou.length !== 8) {
      setEdrpouError('Код ЄДРПОУ має містити рівно 8 цифр')
      return
    }

    setIsSubmitting(true)

    setTimeout(() => {
      const savedOrg = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone,
        city_id: Number(cityId),
        description: description.trim(),
        edrpou: edrpou.trim() || null,
      }
      localStorage.setItem('user_organization', JSON.stringify(savedOrg))
      setIsSubmitting(false)
      navigate('/profile', { replace: true })
    }, 400)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col justify-between py-6 px-4">
      {/* Шапка форми за макетом */}
      <div className="mb-6 flex items-center justify-between border-b-2 border-[#70A5F9] pb-4">
        <h1 className="text-2xl font-bold text-[#5897FB] md:text-3xl">
          Створити організацію
        </h1>
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-[#F5E6BF] text-xl font-bold text-black transition-transform hover:scale-105 active:scale-95"
          title="Закрити"
        >
          ✕
        </button>
      </div>

      {/* Форма за макетом Figma */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Назва організації * */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black">
            Назва організації <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Волонтери"
            className="h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500"
          />
        </div>

        {/* Електронна пошта * */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black">
            Електронна пошта організації <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="organisation@example.com"
            className="h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500"
          />
        </div>

        {/* Телефон * */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black">
            Телефон <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            required
            value={phone}
            onChange={handlePhoneChange}
            placeholder="+380"
            className={`h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] ${
              phoneError
                ? 'outline-red-500 bg-red-50'
                : 'outline-sky-300 focus:outline-blue-500'
            }`}
          />
          {phoneError && (
            <span className="text-[10px] text-red-500">{phoneError}</span>
          )}
        </div>

        {/* Місто * */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black">
            Місто <span className="text-red-500">*</span>
          </label>
          <select
            value={cityId}
            onChange={(e) => setCityId(Number(e.target.value))}
            className="h-9 w-full rounded-[5px] bg-[#DCECFF] px-2 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500"
          >
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name} {city.region ? `(${city.region})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Код EDRPOU (необов'язковий) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black">Код EDRPOU</label>
          <input
            type="text"
            value={edrpou}
            onChange={handleEdrpouChange}
            placeholder="00000000 (8 цифр, якщо є)"
            className={`h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] ${
              edrpouError
                ? 'outline-red-500 bg-red-50'
                : 'outline-sky-300 focus:outline-blue-500'
            }`}
          />
          {edrpouError && (
            <span className="text-[10px] text-red-500">{edrpouError}</span>
          )}
        </div>

        {/* Опис організації * */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black">
            Опис організації <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Діяльність, місія та напрямки допомоги..."
            className="w-full rounded-[5px] bg-[#DCECFF] p-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500"
          />
        </div>

        {/* Кнопка "Зберегти" */}
        <div className="mt-4 flex justify-center">
          <button
            type="submit"
            disabled={
              isSubmitting || Boolean(phoneError) || Boolean(edrpouError)
            }
            className="h-11 w-56 cursor-pointer rounded-xl bg-[#70A5F9] text-sm font-medium text-black shadow-[0px_3px_4px_0px_rgba(26,44,74,0.25)] transition-all hover:bg-[#5b96ee] active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateOrganizationPage
