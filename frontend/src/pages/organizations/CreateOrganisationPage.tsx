import { useState, useEffect, useRef } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { getApiErrorMessage, getErrorStatus } from '../../api/errors'
import { useAuth } from '../../context/AuthContext'
import { CityCombobox } from '../../components/ui/CityCombobox'
import {
  FieldError,
  FieldLabel,
  RequiredMark,
} from '../../components/ui/Typography'
import { inputClass, textareaClass } from '../../components/ui/formStyles'
import { useCities } from '../../hooks/useCities'
import { PHONE_PREFIX, isValidPhone, normalizePhone } from '../../utils/phone'

export const CreateOrganizationPage = () => {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const { cities, error: citiesError } = useCities()

  // Поля форми
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState(PHONE_PREFIX)
  const [cityId, setCityId] = useState<number | ''>('')
  const [edrpou, setEdrpou] = useState('')
  const [description, setDescription] = useState('')

  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [edrpouError, setEdrpouError] = useState<string | null>(null)

  // Стан для гарних сповіщень
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Організацію щойно створили на цій сторінці: у профіль веде таймер, а не редирект нижче
  const justCreatedRef = useRef(false)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Організація вже є — створювати другу не можна (бекенд поверне 409)
  const hasOrganization = Boolean(user?.organization)
  useEffect(() => {
    if (hasOrganization && !justCreatedRef.current) {
      void navigate('/profile', { replace: true })
    }
  }, [hasOrganization, navigate])

  // 2. Валідація телефону
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const cleaned = normalizePhone(e.target.value)
    setPhone(cleaned)
    setPhoneError(
      isValidPhone(cleaned)
        ? null
        : 'Формат: +380XXXXXXXXX (9 цифр після +380)',
    )
  }

  // 3. Валідація ЄДРПОУ (контрольну цифру перевіряє бекенд)
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

    if (!isValidPhone(phone)) {
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
      justCreatedRef.current = true
      // Організація з'являється в /auth/me
      await refresh()

      // Якщо бекенд зберіг успішно:
      setSuccessMessage('Організацію успішно створено! Переходимо в кабінет...')
      // isSubmitting лишається true до переходу, щоб не можна було відправити форму вдруге
      timerRef.current = setTimeout(() => {
        void navigate('/profile', { replace: true })
      }, 1200)
    } catch (err: unknown) {
      setIsSubmitting(false)
      // 401 сюди не доходить: його обробляє interceptor в api/client.ts
      const status = getErrorStatus(err)
      const message = getApiErrorMessage(err, '')

      // Форма залишається на екрані, а юзер бачить точну причину:
      if (status === 409) {
        setErrorMessage(
          message.toLowerCase().includes('already belongs')
            ? 'Ви вже створили організацію або належите до неї.'
            : 'Помилка: організація з таким кодом ЄДРПОУ вже зареєстрована.',
        )
      } else if (status === 422) {
        setErrorMessage(
          message
            ? `Помилка у полях форми: ${message}`
            : 'Помилка: перевірте правильність заповнення всіх полів.',
        )
      } else {
        console.error('Не вдалося зв’язатися з сервером:', err)
        setErrorMessage(
          'Не вдалося зв’язатися з сервером. Будь ласка, перевірте з’єднання та спробуйте ще раз пізніше.',
        )
      }
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between bg-[#F7FBFF] overflow-x-hidden">
      {/* Шапка за макетом Figma */}
      <div className="w-full">
        <div className="flex items-center justify-between px-8 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-main md:text-3xl">
            Створити організацію
          </h1>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-peach text-2xl font-bold text-black transition-transform hover:scale-105 active:scale-95"
            title="Закрити"
          >
            ✕
          </button>
        </div>
        <div className="h-[2px] w-full bg-main" />
      </div>

      <div className="my-auto flex w-full justify-center px-4 py-8">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-xl flex-col items-center"
        >
          {/* ЧЕРВОНА ПЛАШКА ПОМИЛКИ (якщо щось пішло не так) */}
          {citiesError && (
            <div className="mb-5 w-full rounded-lg border border-red-200 bg-red-50 p-3.5 text-center text-xs font-medium text-red-700">
              {citiesError}
            </div>
          )}
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
              <FieldLabel>
                Назва організації <RequiredMark />
              </FieldLabel>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Наприклад: БО «Дій Разом»"
                className={inputClass('md')}
              />
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel>
                Електронна пошта організації <RequiredMark />
              </FieldLabel>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="organisation@example.com"
                className={inputClass('md')}
              />
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel>
                Телефон <RequiredMark />
              </FieldLabel>
              <input
                type="tel"
                required
                value={phone}
                onChange={handlePhoneChange}
                placeholder="+380"
                className={inputClass('md', Boolean(phoneError))}
              />
              {phoneError && <FieldError>{phoneError}</FieldError>}
            </div>

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

            <div className="flex flex-col gap-1">
              <FieldLabel>Код ЄДРПОУ</FieldLabel>
              <input
                type="text"
                value={edrpou}
                onChange={handleEdrpouChange}
                placeholder="00000000 (8 цифр, якщо зареєстрована ГО)"
                className={inputClass('md', Boolean(edrpouError))}
              />
              {edrpouError && <FieldError>{edrpouError}</FieldError>}
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel>
                Опис організації <RequiredMark />
              </FieldLabel>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Діяльність, місія та напрямки допомоги організації..."
                className={textareaClass}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              Boolean(phoneError) ||
              Boolean(edrpouError) ||
              cities.length === 0
            }
            className="mt-8 flex h-11 w-56 cursor-pointer items-center justify-center rounded-xl bg-main text-sm font-medium text-black shadow-[0px_3px_4px_0px_rgba(26,44,74,0.25)] transition-all hover:bg-main-hover active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Збереження...' : 'Зберегти'}
          </button>
        </form>
      </div>

      <div className="h-14 w-full bg-[#DCECFF] border-t-2 border-info" />
    </div>
  )
}

export default CreateOrganizationPage
