import { useState, useEffect, useRef } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiClient } from '../../api/client'
import { getApiErrorMessage, getErrorStatus } from '../../api/errors'
import { CityCombobox } from '../../components/ui/CityCombobox'
import {
  FieldError,
  FieldLabel,
  RequiredMark,
} from '../../components/ui/Typography'
import { inputClass, textareaClass } from '../../components/ui/formStyles'
import { useCities } from '../../hooks/useCities'
import { canEditOrganization } from '../../utils/organization'
import { PHONE_PREFIX, isValidPhone, normalizePhone } from '../../utils/phone'

export const EditOrganizationPage = () => {
  const navigate = useNavigate()
  const { user, isLoading, refresh } = useAuth()
  const { cities, error: citiesError } = useCities()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState(PHONE_PREFIX)
  const [cityId, setCityId] = useState<number | ''>('')
  const [edrpou, setEdrpou] = useState('')
  const [description, setDescription] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Поки дані організації не завантажені, зберігати не можна: інакше PATCH затре їх порожніми
  const [isOrgLoaded, setIsOrgLoaded] = useState(false)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Без організації — на створення; без права редагування (учасник, заблокована) — у профіль
  const organization = user?.organization
  useEffect(() => {
    if (isLoading || !user) return
    if (!organization) {
      void navigate('/organization/create', { replace: true })
    } else if (!canEditOrganization(organization)) {
      void navigate('/profile', { replace: true })
    }
  }, [user, organization, isLoading, navigate])

  // Поточні дані організації з бекенду
  useEffect(() => {
    let isMounted = true
    apiClient
      .get<{
        name: string
        email: string
        phone: string
        city_id: number
        edrpou: string | null
        description: string | null
      }>('/organizations/me')
      .then(({ data }) => {
        if (!isMounted) return
        setName(data.name)
        setEmail(data.email)
        setPhone(data.phone)
        setCityId(data.city_id)
        setEdrpou(data.edrpou ?? '')
        setDescription(data.description ?? '')
        setIsOrgLoaded(true)
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        if (getErrorStatus(err) === 404) {
          void navigate('/organization/create', { replace: true })
        } else {
          setErrorMessage(
            'Не вдалося завантажити дані організації. Оновіть сторінку.',
          )
        }
      })
    return () => {
      isMounted = false
    }
  }, [navigate])

  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const cleaned = normalizePhone(e.target.value)
    setPhone(cleaned)
    setPhoneError(
      isValidPhone(cleaned) ? null : 'Формат: +380XXXXXXXXX (9 цифр)',
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!isOrgLoaded) return

    if (!isValidPhone(phone)) {
      setPhoneError('Введіть коректний номер телефону')
      return
    }

    if (!cityId) {
      setErrorMessage('Оберіть місто зі списку')
      return
    }

    setIsSubmitting(true)

    // Назву та ЄДРПОУ бекенд змінювати не дозволяє (PATCH поверне 422), тож їх не відправляємо.
    // Порожній опис бекенд зберігає як null, тобто опис можна прибрати.
    const updatedData = {
      email: email.trim().toLowerCase(),
      phone,
      city_id: Number(cityId),
      description: description.trim() || null,
    }

    try {
      await apiClient.patch('/organizations/me', updatedData)
      await refresh()
      setIsSuccess(true)
      // isSubmitting лишається true до переходу, щоб не можна було відправити форму вдруге
      timerRef.current = setTimeout(() => {
        void navigate('/profile')
      }, 1200)
    } catch (err: unknown) {
      setIsSubmitting(false)
      setErrorMessage(
        getErrorStatus(err) === 403
          ? 'Редагувати організацію може лише власник або адміністратор, а заблоковану організацію змінювати не можна.'
          : getApiErrorMessage(
              err,
              'Не вдалося зберегти зміни. Спробуйте ще раз.',
            ),
      )
    }
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
            onClick={() => void navigate('/profile')}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-[#F5E6BF] text-2xl font-bold text-black transition-transform hover:scale-105 active:scale-95"
            title="Закрити"
          >
            ✕
          </button>
        </div>
        <div className="h-[2px] w-full bg-[#70A5F9]" />
      </div>

      <div className="my-auto flex w-full justify-center px-4 py-8">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-xl flex-col items-center"
        >
          {citiesError && (
            <div className="mb-4 w-full rounded-lg bg-red-100 p-2.5 text-center text-xs text-red-700">
              {citiesError}
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 w-full rounded-lg bg-red-100 p-2.5 text-center text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          {isSuccess && (
            <div className="mb-4 w-full rounded-lg bg-green-100 p-2.5 text-center text-xs text-green-700">
              Дані організації успішно збережено!
            </div>
          )}

          <div className="flex w-full flex-col gap-4">
            {/* Назва (не редагується) */}
            <div className="flex flex-col gap-1">
              <FieldLabel>Назва організації</FieldLabel>
              <input
                type="text"
                disabled
                value={name}
                className="h-9 w-full rounded-[5px] bg-[#DCECFF]/60 px-3 text-xs text-gray-700 outline outline-1 outline-offset-[-1px] outline-sky-200 cursor-not-allowed"
                title="Назва організації фіксується при створенні та перевіряється адміністратором"
              />
              <span className="text-[10px] text-gray-500">
                Назву перевіряє адміністратор, її не можна редагувати
              </span>
            </div>

            {/* Email * */}
            <div className="flex flex-col gap-1">
              <FieldLabel>
                Електронна пошта організації <RequiredMark />
              </FieldLabel>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass('md')}
              />
            </div>

            {/* Телефон * */}
            <div className="flex flex-col gap-1">
              <FieldLabel>
                Телефон <RequiredMark />
              </FieldLabel>
              <input
                type="tel"
                required
                value={phone}
                onChange={handlePhoneChange}
                className={inputClass('md', Boolean(phoneError))}
              />
              {phoneError && <FieldError>{phoneError}</FieldError>}
            </div>

            {/* Місто * */}
            <div className="flex flex-col gap-1">
              <FieldLabel>
                Місто <RequiredMark />
              </FieldLabel>
              <CityCombobox
                cities={cities}
                value={cityId}
                onChange={setCityId}
                disabled={cities.length === 0}
                inputClassName={inputClass('md')}
              />
            </div>

            {/* Код ЄДРПОУ (не редагується) */}
            <div className="flex flex-col gap-1">
              <FieldLabel>Код ЄДРПОУ</FieldLabel>
              <input
                type="text"
                disabled
                value={edrpou || 'Не вказано'}
                className="h-9 w-full rounded-[5px] bg-[#DCECFF]/60 px-3 text-xs text-gray-700 outline outline-1 outline-offset-[-1px] outline-sky-200 cursor-not-allowed"
                title="Код ЄДРПОУ не можна змінити після реєстрації"
              />
            </div>

            {/* Опис (необов’язковий) */}
            <div className="flex flex-col gap-1">
              <FieldLabel>Опис організації</FieldLabel>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={textareaClass}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !isOrgLoaded ||
              Boolean(phoneError) ||
              cities.length === 0
            }
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
