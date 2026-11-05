import { useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiClient } from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { useCities } from '../hooks/useCities'
import { PHONE_PREFIX, isValidPhone, normalizePhone } from '../utils/phone'

export const RegistrationCompletePage = () => {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const { cities, error: citiesError } = useCities()

  // 1. Стан полів форми. Ім'я та прізвище від Google вже є в AuthContext (/auth/me),
  // решту користувач вводить сам — жодних тестових значень за замовчуванням
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [phone, setPhone] = useState(PHONE_PREFIX)
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [gender, setGender] = useState<'prefer_not_to_say' | 'female' | 'male'>(
    'prefer_not_to_say',
  )
  const [cityId, setCityId] = useState<number | ''>('')
  const [bio, setBio] = useState('')

  // Стан помилок
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Перше місто зі списку обираємо за замовчуванням
  if (cityId === '' && cities.length > 0) {
    setCityId(cities[0].id)
  }

  // 3. Форматування та валідація номера телефону (+380...)
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const cleaned = normalizePhone(e.target.value)
    setPhone(cleaned)
    setPhoneError(
      isValidPhone(cleaned)
        ? null
        : 'Формат: +380XXXXXXXXX (9 цифр після +380)',
    )
  }

  // 4. Відправка форми реєстрації
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!isValidPhone(phone)) {
      setPhoneError('Введіть коректний номер телефону (+380XXXXXXXXX)')
      return
    }

    if (!cityId) {
      setErrorMessage('Оберіть місто зі списку')
      return
    }

    setIsSubmitting(true)

    try {
      // Контракт запиту для бекенду (app.schemas.users.RegistrationRequest)
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nickname: nickname.trim() || null,
        phone,
        birth_date: dateOfBirth, // саме birth_date, як вимагає Pydantic!
        gender,
        city_id: Number(cityId),
        bio: bio.trim() || null,
      }

      await apiClient.post('/auth/register', payload)

      // Бекенд замінив cookie `registration` на `session`: оновлюємо стан із /auth/me
      await refresh()
      void navigate('/profile', { replace: true })
    } catch (err: unknown) {
      // Показуємо помилку бекенду (рядок або список помилок полів FastAPI)
      setErrorMessage(
        getApiErrorMessage(
          err,
          'Не вдалося завершити реєстрацію. Спробуйте ще раз.',
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between bg-[#F7FBFF] overflow-x-hidden">
      {/* Верхня панель: Логотип і синя роздільна смужка за макетом Figma */}
      <div className="w-full">
        <div className="px-8 pt-6 pb-4">
          <span className="text-3xl font-bold tracking-tight">
            <span className="text-[#5897FB]">Дій</span>
            <span className="text-[#F4B840]">Тут</span>
          </span>
        </div>
        <div className="h-[2px] w-full bg-[#70A5F9]" />
      </div>

      {/* Центральна частина: 2 колонки інпутів за макетом */}
      <div className="my-auto flex w-full justify-center px-4 py-8">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-3xl flex-col items-center"
        >
          {citiesError && (
            <div className="mb-4 w-full rounded bg-red-100 p-2 text-center text-xs text-red-700">
              {citiesError}
            </div>
          )}
          {errorMessage && (
            <div className="mb-4 w-full rounded bg-red-100 p-2 text-center text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="grid w-full grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
            {/* Ліва колонка */}
            <div className="flex flex-col gap-4">
              {/* Ім'я * */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                  Ім’я <span className="ml-1 text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Петро"
                  className="h-8 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
                />
              </div>

              {/* Прізвище * */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                  Прізвище <span className="ml-1 text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Петренко"
                  className="h-8 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
                />
              </div>

              {/* Телефон * */}
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
                  className={`h-8 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] font-['e-Ukraine'] ${
                    phoneError
                      ? 'outline-red-500 bg-red-50'
                      : 'outline-sky-300 focus:outline-blue-500'
                  }`}
                />
                {phoneError && (
                  <span className="text-[10px] text-red-500">{phoneError}</span>
                )}
              </div>

              {/* Місто * (Select із довідника міст бекенду) */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                  Місто <span className="ml-1 text-red-500">*</span>
                </label>
                <select
                  value={cityId}
                  onChange={(e) => setCityId(Number(e.target.value))}
                  className="h-8 w-full rounded-[5px] bg-[#DCECFF] px-2 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
                >
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name} {city.region ? `(${city.region})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Права колонка */}
            <div className="flex flex-col gap-4">
              {/* Нікнейм (без зірочки в макеті) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-black font-['e-Ukraine']">
                  Нікнейм
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="petrenkopetro111"
                  className="h-8 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
                />
              </div>

              {/* Дата народження * */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                  Дата народження <span className="ml-1 text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="h-8 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
                />
              </div>

              {/* Стать * (значення відповідають GenderEnum бекенду) */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center text-xs font-medium text-black font-['e-Ukraine']">
                  Стать <span className="ml-1 text-red-500">*</span>
                </label>
                <select
                  value={gender}
                  onChange={(e) =>
                    setGender(
                      e.target.value as 'prefer_not_to_say' | 'female' | 'male',
                    )
                  }
                  className="h-8 w-full rounded-[5px] bg-[#DCECFF] px-2 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
                >
                  <option value="prefer_not_to_say">Волію не вказувати</option>
                  <option value="female">Жіноча</option>
                  <option value="male">Чоловіча</option>
                </select>
              </div>

              {/* Біографія (без зірочки в макеті) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-black font-['e-Ukraine']">
                  Біографія
                </label>
                <input
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Біографія"
                  className="h-8 w-full rounded-[5px] bg-[#DCECFF] px-3 text-xs text-black outline outline-1 outline-offset-[-1px] outline-sky-300 focus:outline-blue-500 font-['e-Ukraine']"
                />
              </div>
            </div>
          </div>

          {/* Синя кнопка "Зареєструватись" за макетом Figma */}
          <button
            type="submit"
            disabled={
              isSubmitting || Boolean(phoneError) || cities.length === 0
            }
            className="mt-8 flex h-11 w-56 cursor-pointer items-center justify-center rounded-xl bg-[#70A5F9] text-sm font-medium text-black shadow-[0px_3px_4px_0px_rgba(26,44,74,0.25)] transition-all hover:bg-[#5b96ee] active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed font-['e-Ukraine']"
          >
            {isSubmitting ? 'Збереження...' : 'Зареєструватись'}
          </button>
        </form>
      </div>

      {/* Нижня смужка з макета Figma */}
      <div className="h-14 w-full bg-[#DCECFF] border-t-2 border-[#F1D387]" />
    </div>
  )
}

export default RegistrationCompletePage
