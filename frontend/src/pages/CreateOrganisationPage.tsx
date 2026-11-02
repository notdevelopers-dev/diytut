import { useState, useEffect } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'

interface CityItem {
  id: number
  name: string
  region: string
}

export const CreateOrganizationPage = () => {
  const navigate = useNavigate()

  // Поля форми
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('+380')
  const [cityId, setCityId] = useState<number | ''>('')
  const [edrpou, setEdrpou] = useState('')
  const [description, setDescription] = useState('')

  const [cities, setCities] = useState<CityItem[]>([])
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [edrpouError, setEdrpouError] = useState<string | null>(null)
  
  // Стан для гарних сповіщень
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 1. Завантаження міст із бекенду
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const res = await apiClient.get<CityItem[]>('/cities')
        if (res.data?.length) {
          setCities(res.data)
          setCityId(res.data[0].id)
        }
      } catch {
        // Якщо бекенд ще не піднятий — показуємо міста для попереднього перегляду
        setCities([
          { id: 1, name: 'Київ', region: 'Київська' },
          { id: 2, name: 'Львів', region: 'Львівська' },
          { id: 3, name: 'Одеса', region: 'Одеська' },
          { id: 4, name: 'Харків', region: 'Харківська' },
          { id: 5, name: 'Дніпро', region: 'Дніпропетровська' },
        ])
        setCityId(1)
      }
    }
    void fetchCities()
  }, [])

  // 2. Валідація телефону
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

  // 3. Валідація ЄДРПОУ
  const handleEdrpouChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8)
    setEdrpou(value)

    if (value.length > 0 && value.length !== 8) {
      setEdrpouError('Код ЄДРПОУ має складатись рівно з 8 цифр')
    } else {
      setEdrpouError(null)
    }
  }

  // 4. Відправка форми: нікуди не викидає при помилці, а показує текст!
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!/^\+380\d{9}$/.test(phone)) {
      setPhoneError('Введіть коректний номер телефону (+380XXXXXXXXX)')
      return
    }

    if (edrpou.length > 0 && edrpou.length !== 8) {
      setEdrpouError('Код ЄДРПОУ має складатись рівно з 8 цифр')
      return
    }

    if (!cityId) {
      setErrorMessage('Оберіть місто зі списку')
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone,
        city_id: Number(cityId),
        description: description.trim(),
        edrpou: edrpou.trim() || null,
      }

      await apiClient.post('/organizations', payload)

      // Якщо бекенд зберіг успішно:
      setSuccessMessage('Організацію успішно створено! Переходимо в кабінет...')
      setTimeout(() => {
        navigate('/profile', { replace: true })
      }, 1200)
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status: number; data?: { detail?: string } }
      }

      // Форма залишається на екрані, а юзер бачить точну причину:
      if (axiosErr.response?.status === 409) {
        setErrorMessage('Помилка: організація з таким ЄДРПОУ вже зареєстрована.')
      } else if (axiosErr.response?.status === 401) {
        setErrorMessage('Помилка авторизації: ваша сесія минула. Будь ласка, увійдіть знову.')
      } else if (axiosErr.response?.status === 422) {
        setErrorMessage('Помилка: перевірте правильність заповнення всіх полів.')
      } else {
        setErrorMessage('Помилка сервера: не вдалося зв’язатися з бекендом. Перевірте, чи запущено Docker/API.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between bg-[#F7FBFF] overflow-x-hidden">
      {/* Шапка за макетом Figma */}
      <div className="w-full">
        <div className="flex items-center justify-between px-8 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-[#5897FB] md:text-3xl">
            Створити організацію
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
          
          {/* ЧЕРВОНА ПЛАШКА ПОМИЛКИ (якщо щось пішло не так) */}
          {errorMessage && (
            <div className="mb-5 w-full rounded-lg border border-red-200 bg-red-50 p-3.5 text-center text-xs font-medium text-red-700 animate-in fade-in">
              {errorMessage}
            </div>
          )}

          {/* ЗЕЛЕНА ПЛАШКА УСПІХУ (коли все збереглося) */}
          {successMessage && (
            <div className="mb-5 w-full rounded-lg border border-green-200 bg-green-50 p-3.5 text-center text-xs font-medium text-green-700 animate-in fade-in">
              {successMessage}
            </div>
          )}

          <div className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                Назва організації <span className="ml-1 text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Наприклад: БО «Дій Разом»"
                className="h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                Електронна пошта організації <span className="ml-1 text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="organisation@example.com"
                className="h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                Телефон <span className="ml-1 text-red-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={handlePhoneChange}
                placeholder="+380"
                className={`h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] font-['e-Ukraine'] ${
                  phoneError ? 'outline-red-500 bg-red-50' : 'outline-sky-300 focus:outline-blue-500'
                }`}
              />
              {phoneError && <span className="text-[10px] text-red-500">{phoneError}</span>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                Місто <span className="ml-1 text-red-500">*</span>
              </label>
              <select
                required
                value={cityId}
                onChange={(e) => setCityId(Number(e.target.value))}
                className="h-9 w-full rounded-[5px] bg-[#DCECFF] px-2 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
              >
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} {city.region ? `(${city.region})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black font-['e-Ukraine']">
                Код EDRPOU
              </label>
              <input
                type="text"
                value={edrpou}
                onChange={handleEdrpouChange}
                placeholder="00000000 (8 цифр, якщо зареєстрована ГО)"
                className={`h-9 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] font-['e-Ukraine'] ${
                  edrpouError ? 'outline-red-500 bg-red-50' : 'outline-sky-300 focus:outline-blue-500'
                }`}
              />
              {edrpouError && <span className="text-[10px] text-red-500">{edrpouError}</span>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                Опис організації <span className="ml-1 text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Діяльність, місія та напрямки допомоги організації..."
                className="w-full rounded-[5px] bg-[#DCECFF] p-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || Boolean(phoneError) || Boolean(edrpouError)}
            className="mt-8 flex h-11 w-56 cursor-pointer items-center justify-center rounded-xl bg-[#70A5F9] text-sm font-medium text-black shadow-[0px_3px_4px_0px_rgba(26,44,74,0.25)] transition-all hover:bg-[#5b96ee] active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed font-['e-Ukraine']"
          >
            {isSubmitting ? 'Збереження...' : 'Зберегти'}
          </button>
        </form>
      </div>

      <div className="h-14 w-full bg-[#DCECFF] border-t-2 border-[#F1D387]" />
    </div>
  )
}

export default CreateOrganizationPage