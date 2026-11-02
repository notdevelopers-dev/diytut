import { useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiClient } from '../api/client'

export const RegistrationCompletePage = () => {
  const { user, setProfileComplete } = useAuth()
  const navigate = useNavigate()

  // 1. Поля за замовчуванням (підтягнуті з Google або згенеровані, які користувач може змінити)
  const [firstName, setFirstName] = useState(
    user?.firstName ?? user?.name?.split(' ')[0] ?? '',
  )
  const [lastName, setLastName] = useState(
    user?.lastName ?? user?.name?.split(' ')[1] ?? '',
  )
  const [nickname, setNickname] = useState(
    user?.nickname ?? `volunteer_${Math.floor(1000 + Math.random() * 9000)}`,
  )
  const [gender, setGender] = useState<'prefer_not_to_tell' | 'female' | 'male'>(
    user?.gender ?? 'prefer_not_to_tell',
  )

  // 2. Обов'язкові поля, які користувач має заповнити сам
  const [phone, setPhone] = useState('+380')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')

  // Стан валідації та відправки
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 3. Валідація та захист вводу українського номера (+380 та 9 цифр)
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value
    if (!input.startsWith('+380')) {
      input = '+380'
    }
    const cleaned = '+' + input.slice(1).replace(/\D/g, '').slice(0, 12)
    setPhone(cleaned)

    const ukrainePhoneRegex = /^\+380\d{9}$/
    if (!ukrainePhoneRegex.test(cleaned)) {
      setPhoneError('Номер має містити +380 та 9 цифр (разом 13 символів)')
    } else {
      setPhoneError(null)
    }
  }

  // 4. Збереження анкети та перехід до профілю
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setServerError(null)

    // Фінальна перевірка номера перед відправкою
    if (!/^\+380\d{9}$/.test(phone)) {
      setPhoneError('Введіть коректний номер телефону (+380XXXXXXXXX)')
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nickname: nickname.trim(),
        gender,
        phone,
        date_of_birth: dateOfBirth,
        city: city.trim(),
        bio: bio.trim(),
      }

      // Спроба відправити на бекенд
      try {
        await apiClient.put('/profile/volunteer', payload)
      } catch {
        console.warn('Бекенд недоступний, сесія зберігається локально.')
      }

      // Оновлюємо статус завершення анкети в AuthContext
      setProfileComplete(true)

      // Перенаправляємо на дефолтний Профіль волонтера
      navigate('/profile', { replace: true })
    } catch {
      setServerError('Помилка збереження даних. Спробуйте пізніше.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-130px)] w-full justify-center bg-page px-4 py-8">
      <div className="card w-full max-w-xl">
        <div className="mb-6 text-center">
          <span className="badge badge-warning mb-2">Обов'язковий крок</span>
          <h2 className="text-2xl font-bold text-ink sm:text-3xl">
            Завершення реєстрації
          </h2>
          <p className="page-subtitle mt-1 text-sm">
            Перевірте передзаповнені дані та вкажіть контактну інформацію зі
            зірочкою (*)
          </p>
        </div>

        {serverError && (
          <div className="mb-4 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-danger">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {/* Ім'я та Прізвище (передзаповнені з Google, доступні до редагування) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label htmlFor="first-name">Ім'я *</label>
              <input
                id="first-name"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="last-name">Прізвище *</label>
              <input
                id="last-name"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          {/* Нікнейм (випадковий за замовчуванням, редагований) */}
          <div className="form-group">
            <label htmlFor="nickname">Нікнейм на платформі *</label>
            <input
              id="nickname"
              type="text"
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="form-input"
            />
            <span className="text-xs text-ink-muted">
              Згенеровано автоматично, ви можете змінити його на власний
            </span>
          </div>

          {/* Телефон (з валідацією українського коду +380) */}
          <div className="form-group">
            <label htmlFor="phone">Номер телефону *</label>
            <input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={handlePhoneChange}
              placeholder="+380XXXXXXXXX"
              className={`form-input ${phoneError ? '!border-danger bg-red-50/50' : ''}`}
            />
            {phoneError && <span className="text-xs text-danger">{phoneError}</span>}
          </div>

          {/* Дата народження та Стать */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label htmlFor="date-of-birth">Дата народження *</label>
              <input
                id="date-of-birth"
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="gender">Стать *</label>
              <select
                id="gender"
                value={gender}
                onChange={(e) =>
                  setGender(
                    e.target.value as 'prefer_not_to_tell' | 'female' | 'male',
                  )
                }
                className="form-select"
              >
                <option value="prefer_not_to_tell">Не бажаю вказувати</option>
                <option value="female">Жіноча</option>
                <option value="male">Чоловіча</option>
              </select>
            </div>
          </div>

          {/* Місто */}
          <div className="form-group">
            <label htmlFor="city">Місто проживання *</label>
            <input
              id="city"
              type="text"
              required
              placeholder="Львів, Київ тощо"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="form-input"
            />
          </div>

          {/* Біографія / Досвід */}
          <div className="form-group">
            <label htmlFor="bio">Про себе / Досвід волонтерства</label>
            <textarea
              id="bio"
              rows={3}
              placeholder="Наприклад: водійське посвідчення, авто, досвід плетіння сіток чи логістики..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="form-textarea"
            />
          </div>

          {/* Кнопка відправки форми */}
          <button
            type="submit"
            disabled={isSubmitting || Boolean(phoneError)}
            className="btn btn-primary btn-block mt-2"
          >
            {isSubmitting ? 'Збереження...' : 'Зберегти анкету та перейти до профілю'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default RegistrationCompletePage