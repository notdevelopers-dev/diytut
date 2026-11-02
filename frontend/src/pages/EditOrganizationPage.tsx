import { useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface CityItem {
  id: number
  name: string
  region: string
}

export const EditOrganizationPage = () => {
  const navigate = useNavigate()
  const { user, updateOrganization } = useAuth()

  // Підтягуємо щойно створені дані або дефолтні тестові
  const currentOrg = user?.organization ?? {
    name: 'Волонтери',
    email: 'organisation@example.com',
    phone: '+380971234567',
    cityId: 1,
    edrpou: '00000000',
    description: 'Діяльність',
    roleInOrg: 'Власник',
  }

  const [name, setName] = useState(currentOrg.name)
  const [email, setEmail] = useState(currentOrg.email)
  const [phone, setPhone] = useState(currentOrg.phone || '+380')
  const [cityId, setCityId] = useState<number>(currentOrg.cityId || 1)
  const [edrpou, setEdrpou] = useState(currentOrg.edrpou || '')
  const [description, setDescription] = useState(currentOrg.description)

  const cities: CityItem[] = [
    { id: 1, name: 'Київ', region: 'Київська' },
    { id: 2, name: 'Львів', region: 'Львівська' },
    { id: 3, name: 'Одеса', region: 'Одеська' },
    { id: 4, name: 'Харків', region: 'Харківська' },
    { id: 5, name: 'Дніпро', region: 'Дніпропетровська' },
  ]

  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [edrpouError, setEdrpouError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value
    if (!input.startsWith('+380')) {
      input = '+380'
    }
    const cleaned = '+' + input.slice(1).replace(/\D/g, '').slice(0, 12)
    setPhone(cleaned)

    if (!/^\+380\d{9}$/.test(cleaned)) {
      setPhoneError('Формат: +380XXXXXXXXX (9 цифр)')
    } else {
      setPhoneError(null)
    }
  }

  const handleEdrpouChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8)
    setEdrpou(value)

    if (value.length > 0 && value.length !== 8) {
      setEdrpouError('Код ЄДРПОУ має містити рівно 8 цифр')
    } else {
      setEdrpouError(null)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    if (!/^\+380\d{9}$/.test(phone)) {
      setPhoneError('Введіть коректний номер телефону')
      return
    }

    if (edrpou.length > 0 && edrpou.length !== 8) {
      setEdrpouError('Код ЄДРПОУ має містити рівно 8 цифр')
      return
    }

    setIsSubmitting(true)

    const updatedData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone,
      cityId: Number(cityId),
      description: description.trim(),
      edrpou: edrpou.trim() || null,
      roleInOrg: currentOrg.roleInOrg ?? 'Власник',
    }

    updateOrganization(updatedData)
    setIsSubmitting(false)
    setIsSuccess(true)

    setTimeout(() => {
      navigate('/profile')
    }, 500)
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between bg-[#F7FBFF] overflow-x-hidden">
      {/* Верхня панель: "Редагувати організацію" та помаранчевий хрестик за макетом */}
      <div className="w-full">
        <div className="flex items-center justify-between px-8 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-[#5897FB] md:text-3xl">
            Редагувати організацію
          </h1>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-[#F5E6BF] text-2xl font-bold text-black transition-transform hover:scale-105 active:scale-95"
            title="Закрити"
          >
            ✕
          </button>
        </div>
        <div className="h-[2px] w-full bg-[#70A5F9]" />
      </div>

      <div className="my-auto flex w-full justify-center px-4 py-8">
        <form onSubmit={handleSubmit} className="flex w-full max-w-xl flex-col items-center">
          {isSuccess && (
            <div className="mb-4 w-full rounded-lg bg-green-100 p-2.5 text-center text-xs text-green-700">
              Дані організації успішно збережено!
            </div>
          )}

          <div className="flex w-full flex-col gap-4">
            {/* Назва * */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black">
                Назва організації <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500"
              />
            </div>

            {/* Email * */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black">
                Електронна пошта організації <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                className={`h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] ${
                  phoneError ? 'outline-red-500 bg-red-50' : 'outline-sky-300 focus:outline-blue-500'
                }`}
              />
              {phoneError && <span className="text-[10px] text-red-500">{phoneError}</span>}
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

            {/* Код ЄДРПОУ */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black">
                Код EDRPOU
              </label>
              <input
                type="text"
                value={edrpou}
                onChange={handleEdrpouChange}
                placeholder="00000000"
                className={`h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] ${
                  edrpouError ? 'outline-red-500 bg-red-50' : 'outline-sky-300 focus:outline-blue-500'
                }`}
              />
              {edrpouError && <span className="text-[10px] text-red-500">{edrpouError}</span>}
            </div>

            {/* Опис * */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black">
                Опис організації <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-[5px] bg-[#DCECFF] p-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || Boolean(phoneError) || Boolean(edrpouError)}
            className="mt-8 flex h-11 w-56 cursor-pointer items-center justify-center rounded-xl bg-[#70A5F9] text-sm font-medium text-black shadow-[0px_3px_4px_0px_rgba(26,44,74,0.25)] transition-all hover:bg-[#5b96ee] active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Збереження...' : 'Зберегти'}
          </button>
        </form>
      </div>

      <div className="h-14 w-full bg-[#DCECFF] border-t-2 border-[#F1D387]" />
    </div>
  )
}

export default EditOrganizationPage