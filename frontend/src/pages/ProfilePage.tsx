import { useState, useEffect } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { apiClient } from '../api/client'
import { getApiErrorMessage, getErrorStatus } from '../api/errors'
import type { Gender, VolunteerProfile } from '../api/profile'
import { getMyProfile, updateMyProfile } from '../api/profile'
import { useCities } from '../hooks/useCities'
import { isValidPhone, normalizePhone } from '../utils/phone'
import {
  canEditOrganization,
  getOrgRoleLabel,
  getOrgStatusLabel,
} from '../utils/organization'

interface OrgProfileData {
  id: number
  name: string
  email: string
  phone: string
  city_id: number
  description: string | null
  edrpou: string | null
  status: string
  role: string
}

/** Дані форми редагування анкети (поля PATCH /api/users/me) */
interface ProfileForm {
  first_name: string
  last_name: string
  nickname: string
  phone: string
  birth_date: string
  gender: Gender
  city_id: number | ''
  bio: string
}

const GENDER_LABELS: Record<Gender, string> = {
  prefer_not_to_say: 'Волію не вказувати',
  female: 'Жіноча',
  male: 'Чоловіча',
}

/** Ті самі обмеження, що й у бекенду: 3–30 символів, латиниця, цифри, «_» і «.» */
const NICKNAME_PATTERN = /^[A-Za-z0-9_.]{3,30}$/

/** Найпізніша дата народження, за якої вже виповнилося 18 років (вимога бекенду) */
const MAX_BIRTH_DATE = (() => {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear() - 18}-${month}-${day}`
})()

/** 2026-11-05 → 05.11.2026 */
const formatDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split('-')
  return year && month && day ? `${day}.${month}.${year}` : isoDate
}

const toForm = (profile: VolunteerProfile): ProfileForm => ({
  first_name: profile.first_name,
  last_name: profile.last_name,
  nickname: profile.nickname,
  phone: profile.phone,
  birth_date: profile.birth_date,
  gender: profile.gender,
  city_id: profile.city_id,
  bio: profile.bio ?? '',
})

export const ProfilePage = () => {
  const { user, refresh, logout } = useAuth()
  const navigate = useNavigate()
  const { cities, error: citiesError } = useCities()

  const [orgData, setOrgData] = useState<OrgProfileData | null>(null)
  const [isOrgLoading, setIsOrgLoading] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)

  // Повні дані анкети: у /auth/me немає міста, тому тягнемо їх з GET /users/me
  const [profile, setProfile] = useState<VolunteerProfile | null>(null)
  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Режим редагування анкети
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<ProfileForm | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    let isMounted = true
    getMyProfile()
      .then((data) => {
        if (!isMounted) return
        setProfile(data)
        setForm(toForm(data))
      })
      .catch((err: unknown) => {
        console.error('Не вдалося завантажити дані профілю:', err)
        if (isMounted) {
          setProfileError(
            'Не вдалося завантажити дані профілю. Оновіть сторінку.',
          )
        }
      })
      .finally(() => {
        if (isMounted) setIsProfileLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    if (user?.organization) {
      // oxlint-disable-next-line react/set-state-in-effect
      setIsOrgLoading(true)
      setOrgError(null)
      apiClient
        .get<OrgProfileData>('/organizations/me')
        .then(({ data }) => {
          if (isMounted) setOrgData(data)
        })
        .catch((err: unknown) => {
          console.error('Не вдалося завантажити дані організації:', err)
          if (isMounted) {
            setOrgError(
              'Не вдалося завантажити дані організації. Оновіть сторінку.',
            )
          }
        })
        .finally(() => {
          if (isMounted) setIsOrgLoading(false)
        })
    } else {
      setOrgData(null)
    }
    return () => {
      isMounted = false
    }
  }, [user?.organization])

  const handleLogout = () => {
    logout()
    void navigate('/login')
  }

  const startEditing = () => {
    if (!profile) return
    // Скидаємо форму до збережених даних, щоб «Скасувати» повертав попередній вигляд
    setForm(toForm(profile))
    setPhoneError(null)
    setFormError(null)
    setIsSaved(false)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    if (profile) setForm(toForm(profile))
    setPhoneError(null)
    setFormError(null)
    setIsEditing(false)
  }

  const updateForm = (patch: Partial<ProfileForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const cleaned = normalizePhone(e.target.value)
    updateForm({ phone: cleaned })
    setPhoneError(
      isValidPhone(cleaned) ? null : 'Формат: +380XXXXXXXXX (9 цифр)',
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!form) return

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setFormError('Ім’я та прізвище не можуть бути порожніми')
      return
    }
    if (!NICKNAME_PATTERN.test(form.nickname.trim())) {
      setFormError('Нікнейм: від 3 до 30 символів — латиниця, цифри, «_» і «.»')
      return
    }
    if (!isValidPhone(form.phone)) {
      setPhoneError('Введіть коректний номер телефону (+380XXXXXXXXX)')
      return
    }
    if (!form.city_id) {
      setFormError('Оберіть місто зі списку')
      return
    }

    setIsSubmitting(true)
    try {
      // Контракт PATCH /api/users/me (app.schemas.users.UserUpdate)
      const updated = await updateMyProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        nickname: form.nickname.trim(),
        phone: form.phone,
        birth_date: form.birth_date,
        gender: form.gender,
        city_id: Number(form.city_id),
        // Порожній опис бекенд зберігає як null, тобто біографію можна прибрати
        bio: form.bio.trim() || null,
      })
      setProfile(updated)
      setForm(toForm(updated))
      setIsEditing(false)
      setIsSaved(true)
      // Ім’я в шапці та меню беруться з /auth/me — оновлюємо контекст
      await refresh()
    } catch (err: unknown) {
      setFormError(
        getErrorStatus(err) === 409
          ? 'Цей нікнейм уже зайнято. Оберіть інший.'
          : getApiErrorMessage(
              err,
              'Не вдалося зберегти зміни. Спробуйте ще раз.',
            ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Особистий кабінет</h1>
      </header>

      <div className="card profile-card">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary-light text-primary">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <h2>{user?.name ?? 'Користувач'}</h2>
            <p className="text-ink-muted">{user?.email}</p>
            <span className={`badge badge-${user?.role}`}>{user?.role}</span>
          </div>
        </div>

        <hr className="my-6 h-px border-0 bg-border" />

        {isSaved && !isEditing && (
          <div className="mb-4 rounded-lg bg-green-100 p-2.5 text-center text-xs text-green-700">
            Дані профілю збережено!
          </div>
        )}

        {citiesError && isEditing && (
          <div className="mb-4 rounded-lg bg-red-100 p-2.5 text-center text-xs text-red-700">
            {citiesError}
          </div>
        )}

        {/* Дані анкети: перегляд або форма редагування */}
        {isProfileLoading ? (
          <div className="text-sm text-ink-muted">
            Завантаження даних профілю...
          </div>
        ) : profileError ? (
          <div className="rounded-lg bg-red-100 p-2.5 text-center text-xs text-red-700">
            {profileError}
          </div>
        ) : isEditing && form ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {formError && (
              <div className="rounded-lg bg-red-100 p-2.5 text-center text-xs text-red-700">
                {formError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Електронна пошта не редагується: її дає обліковий запис Google */}
              <div className="form-group sm:col-span-2">
                <label htmlFor="profile-email">Електронна пошта</label>
                <input
                  id="profile-email"
                  type="email"
                  disabled
                  value={profile?.email ?? ''}
                  className="form-input cursor-not-allowed bg-page text-ink-muted"
                  title="Пошта пов’язана з обліковим записом Google, змінити її тут не можна"
                />
                <span className="text-xs text-ink-muted">
                  Пошта надходить із Google-акаунта, змінити її тут не можна
                </span>
              </div>

              {/* Ім'я * */}
              <div className="form-group">
                <label htmlFor="profile-first-name">
                  Ім’я <span className="text-danger">*</span>
                </label>
                <input
                  id="profile-first-name"
                  type="text"
                  required
                  value={form.first_name}
                  onChange={(e) => updateForm({ first_name: e.target.value })}
                  className="form-input"
                />
              </div>

              {/* Прізвище * */}
              <div className="form-group">
                <label htmlFor="profile-last-name">
                  Прізвище <span className="text-danger">*</span>
                </label>
                <input
                  id="profile-last-name"
                  type="text"
                  required
                  value={form.last_name}
                  onChange={(e) => updateForm({ last_name: e.target.value })}
                  className="form-input"
                />
              </div>

              {/* Нікнейм * */}
              <div className="form-group">
                <label htmlFor="profile-nickname">
                  Нікнейм <span className="text-danger">*</span>
                </label>
                <input
                  id="profile-nickname"
                  type="text"
                  required
                  maxLength={30}
                  value={form.nickname}
                  onChange={(e) => updateForm({ nickname: e.target.value })}
                  className="form-input"
                />
                <span className="text-xs text-ink-muted">
                  3–30 символів: латиниця, цифри, «_» і «.»
                </span>
              </div>

              {/* Телефон * */}
              <div className="form-group">
                <label htmlFor="profile-phone">
                  Телефон <span className="text-danger">*</span>
                </label>
                <input
                  id="profile-phone"
                  type="tel"
                  required
                  value={form.phone}
                  onChange={handlePhoneChange}
                  className={`form-input ${phoneError ? 'border-danger' : ''}`}
                />
                {phoneError && (
                  <span className="text-xs text-danger">{phoneError}</span>
                )}
              </div>

              {/* Дата народження * */}
              <div className="form-group">
                <label htmlFor="profile-birth-date">
                  Дата народження <span className="text-danger">*</span>
                </label>
                <input
                  id="profile-birth-date"
                  type="date"
                  required
                  max={MAX_BIRTH_DATE}
                  value={form.birth_date}
                  onChange={(e) => updateForm({ birth_date: e.target.value })}
                  className="form-input"
                />
                <span className="text-xs text-ink-muted">
                  Платформою можуть користуватися особи від 18 років
                </span>
              </div>

              {/* Стать (значення відповідають GenderEnum бекенду) */}
              <div className="form-group">
                <label htmlFor="profile-gender">Стать</label>
                <select
                  id="profile-gender"
                  value={form.gender}
                  onChange={(e) =>
                    updateForm({ gender: e.target.value as Gender })
                  }
                  className="form-select"
                >
                  <option value="prefer_not_to_say">Волію не вказувати</option>
                  <option value="female">Жіноча</option>
                  <option value="male">Чоловіча</option>
                </select>
              </div>

              {/* Місто * */}
              <div className="form-group sm:col-span-2">
                <label htmlFor="profile-city">
                  Місто <span className="text-danger">*</span>
                </label>
                <select
                  id="profile-city"
                  value={form.city_id}
                  onChange={(e) =>
                    updateForm({
                      city_id: e.target.value ? Number(e.target.value) : '',
                    })
                  }
                  className="form-select"
                >
                  {form.city_id === '' && (
                    <option value="" disabled>
                      {cities.length > 0
                        ? 'Оберіть місто'
                        : 'Завантаження міст...'}
                    </option>
                  )}
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name} {city.region ? `(${city.region})` : ''}
                    </option>
                  ))}
                </select>
                {cities.length === 0 && !citiesError && (
                  <span className="text-xs text-ink-muted">
                    Список міст ще завантажується
                  </span>
                )}
              </div>

              {/* Біографія (необов’язкова) */}
              <div className="form-group sm:col-span-2">
                <label htmlFor="profile-bio">Біографія</label>
                <textarea
                  id="profile-bio"
                  rows={4}
                  maxLength={2000}
                  value={form.bio}
                  onChange={(e) => updateForm({ bio: e.target.value })}
                  className="form-textarea"
                />
                <span className="text-xs text-ink-muted">
                  До 2000 символів; порожнє поле прибирає біографію
                </span>
              </div>
            </div>

            <div className="button-group">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  isSubmitting ||
                  Boolean(phoneError) ||
                  !form.city_id ||
                  cities.length === 0
                }
              >
                {isSubmitting ? 'Збереження...' : 'Зберегти зміни'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={cancelEditing}
                disabled={isSubmitting}
              >
                Скасувати
              </button>
            </div>
          </form>
        ) : profile ? (
          <div className="flex flex-col gap-3">
            <div className="detail-item">
              <strong>Електронна пошта:</strong> <span>{profile.email}</span>
            </div>
            <div className="detail-item">
              <strong>Ім’я:</strong> <span>{profile.first_name}</span>
            </div>
            <div className="detail-item">
              <strong>Прізвище:</strong> <span>{profile.last_name}</span>
            </div>
            <div className="detail-item">
              <strong>Нікнейм:</strong> <span>{profile.nickname}</span>
            </div>
            <div className="detail-item">
              <strong>Телефон:</strong> <span>{profile.phone}</span>
            </div>
            <div className="detail-item">
              <strong>Дата народження:</strong>{' '}
              <span>{formatDate(profile.birth_date)}</span>
            </div>
            <div className="detail-item">
              <strong>Стать:</strong>{' '}
              <span>{GENDER_LABELS[profile.gender]}</span>
            </div>
            <div className="detail-item">
              <strong>Місто:</strong>{' '}
              <span>
                {profile.city
                  ? `${profile.city.name} (${profile.city.region})`
                  : 'Не вказано'}
              </span>
            </div>
            <div className="detail-item">
              <strong>Біографія:</strong>{' '}
              <span className="whitespace-pre-wrap">
                {profile.bio || 'Не вказано'}
              </span>
            </div>
          </div>
        ) : null}

        <div className="button-group mt-6">
          {!isEditing && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={startEditing}
              disabled={isProfileLoading || !profile}
            >
              ✏️ Редагувати профіль
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleLogout}
          >
            Вийти з акаунта
          </button>
        </div>
      </div>

      {/* Картка організації */}
      {user?.organization ? (
        <div className="card profile-card mt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs text-ink-muted">Організація</div>
              <h2 className="text-xl font-bold text-ink">
                {orgData?.name ?? user.organization.name}
              </h2>
              <span className="inline-block mt-1 text-xs font-semibold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                Роль: {getOrgRoleLabel(user.organization.role)}
              </span>
              {getOrgStatusLabel(user.organization.status) && (
                <span className="ml-2 inline-block mt-1 text-xs font-semibold text-ink-muted bg-page px-2.5 py-0.5 rounded-full">
                  {getOrgStatusLabel(user.organization.status)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-outline"
                disabled
                title="Бекенд ще не реалізував перемикання сесії в акаунт організації"
              >
                🔁 Перейти в акаунт організації
              </button>
              {canEditOrganization(user.organization) && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void navigate('/organization/edit')}
                >
                  ⚙️ Редагувати організацію
                </button>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-muted">
            Перемикання в акаунт організації стане доступним, щойно бекенд
            додасть відповідний ендпоінт.
          </p>

          <hr className="my-6 h-px border-0 bg-border" />

          {isOrgLoading ? (
            <div className="text-xs text-ink-muted">
              Завантаження даних організації...
            </div>
          ) : orgError ? (
            <div className="rounded-lg bg-red-100 p-2.5 text-center text-xs text-red-700">
              {orgError}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="detail-item">
                <strong>Електронна пошта:</strong>{' '}
                <span>{orgData?.email ?? '—'}</span>
              </div>
              <div className="detail-item">
                <strong>Телефон:</strong> <span>{orgData?.phone ?? '—'}</span>
              </div>
              <div className="detail-item">
                <strong>Код ЄДРПОУ:</strong>{' '}
                <span>{orgData?.edrpou || 'Не вказано'}</span>
              </div>
              <div className="detail-item">
                <strong>Опис:</strong>{' '}
                <span className="whitespace-pre-wrap">
                  {orgData?.description || 'Опис відсутній'}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card profile-card mt-6 flex flex-col items-center text-center p-6 sm:p-8">
          <div className="text-3xl mb-2">🏢</div>
          <h2 className="text-lg font-bold">Організація</h2>
          <p className="text-xs text-ink-muted mt-1 max-w-md">
            Ви ще не зареєстрували організацію. Якщо ви є представником фонду чи
            ГО, зареєструйте її тут.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-4"
            onClick={() => void navigate('/organization/create')}
          >
            + Створити організацію
          </button>
        </div>
      )}
    </div>
  )
}

export default ProfilePage
