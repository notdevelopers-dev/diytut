import { useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks'
import { useCities } from '@/features/cities'
import { useMyOrganization } from '@/features/organizations/hooks'
import {
  canEditOrganization,
  getOrgRoleLabel,
  getOrgStatusLabel,
} from '@/features/organizations/utils'
import {
  inputClass,
  selectClass,
  textareaClass,
} from '@/components/ui/formStyles'
import { getApiErrorMessage, getErrorStatus } from '@/lib/errors'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import type { Gender, VolunteerProfile } from '../api'
import { useMyProfile, useUpdateMyProfile } from '../hooks'

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

/** Заокруглена «пігулка» із макета: ім’я, пошта, роль. */
const Chip = ({
  children,
  tone = 'plain',
}: {
  children: ReactNode
  tone?: 'plain' | 'role'
}) => (
  <span
    className={`inline-flex h-6 items-center rounded-full border px-4 text-xs ${
      tone === 'role'
        ? 'border-main bg-[#DCECFF] text-main'
        : 'border-[#DCECFF] bg-white text-black'
    }`}
  >
    {children}
  </span>
)

/** Значення поля у режимі перегляду. */
const ValuePill = ({
  children,
  multiline = false,
}: {
  children: ReactNode
  multiline?: boolean
}) => (
  <div
    className={`w-full rounded-[5px] border border-[#DCECFF] bg-white px-3 text-xs text-gray-500 ${
      multiline ? 'min-h-8 whitespace-pre-wrap py-2' : 'flex h-8 items-center'
    }`}
  >
    {children}
  </div>
)

/** Підпис ліворуч, значення або поле праворуч (на вузькому екрані — стовпчиком). */
const FieldRow = ({
  label,
  htmlFor,
  required = false,
  hint,
  hintIsError = false,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: string
  hintIsError?: boolean
  children: ReactNode
}) => (
  <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-start sm:gap-4">
    <label
      htmlFor={htmlFor}
      className="flex h-8 items-center text-xs font-bold text-black"
    >
      {label}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
    <div className="flex flex-col gap-1">
      {children}
      {hint && (
        <span
          className={`text-[10px] ${hintIsError ? 'text-red-500' : 'text-ink-muted'}`}
        >
          {hint}
        </span>
      )}
    </div>
  </div>
)

/** Блакитна кнопка дії з макета. */
const ActionButton = ({
  children,
  icon,
  type = 'button',
  onClick,
  disabled = false,
}: {
  children: ReactNode
  icon?: string
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className="flex h-7 min-w-44 cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#DCECFF] px-4 text-xs font-medium text-black transition-colors hover:bg-[#cde2fe] disabled:cursor-not-allowed disabled:opacity-50"
  >
    {icon && (
      <span aria-hidden="true" className="text-main">
        {icon}
      </span>
    )}
    {children}
  </button>
)

export const ProfilePage = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { cities, error: citiesError } = useCities()

  // Повні дані анкети: у /auth/me немає міста, тому тягнемо їх з GET /users/me
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
  } = useMyProfile()
  const profileError = isProfileError
    ? 'Не вдалося завантажити дані профілю. Оновіть сторінку.'
    : null
  const { mutateAsync: saveProfile, isPending: isSubmitting } =
    useUpdateMyProfile()

  // Профіль організації запитуємо лише якщо вона в користувача є
  const hasOrganization = Boolean(user?.organization)
  const {
    data,
    isLoading: isOrgLoading,
    isError: isOrgError,
  } = useMyOrganization(hasOrganization)
  const orgData = hasOrganization ? (data ?? null) : null
  const orgError = isOrgError
    ? 'Не вдалося завантажити дані організації. Оновіть сторінку.'
    : null

  // Режим редагування анкети
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<ProfileForm | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)

  const handleLogout = () => {
    logout()
    void navigate('/login')
  }

  const startEditing = () => {
    if (!profile) return
    // Форма береться зі збережених даних, щоб «Скасувати» повертав попередній вигляд
    setForm(toForm(profile))
    setPhoneError(null)
    setFormError(null)
    setIsSaved(false)
    setIsEditing(true)
  }

  const cancelEditing = () => {
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

    try {
      // Контракт PATCH /api/users/me (app.schemas.users.UserUpdate)
      await saveProfile({
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
      setIsEditing(false)
      setIsSaved(true)
    } catch (err: unknown) {
      setFormError(
        getErrorStatus(err) === 409
          ? 'Цей нікнейм уже зайнято. Оберіть інший.'
          : getApiErrorMessage(
              err,
              'Не вдалося зберегти зміни. Спробуйте ще раз.',
            ),
      )
    }
  }

  const roleLabel = user?.role === 'admin' ? 'Адміністратор' : 'Волонтер'

  return (
    <div className="flex flex-col">
      {/* Жовта смуга із заголовком сторінки (макет «volunteer info page») */}
      <div className="border-y border-info bg-cream px-4 py-2 sm:px-8">
        <h1 className="text-3xl font-normal text-black">Особистий кабінет</h1>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
        {/* Аватар, ім’я, пошта й роль */}
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <div className="flex size-32 shrink-0 items-center justify-center rounded-full bg-main text-white">
            <svg
              width="96"
              height="96"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4.5" />
              <path d="M3.5 21c0-4.2 3.8-7 8.5-7s8.5 2.8 8.5 7z" />
            </svg>
          </div>
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <Chip>{user?.name ?? 'Користувач'}</Chip>
            <Chip>{user?.email}</Chip>
            <Chip tone="role">{roleLabel}</Chip>
          </div>
        </div>

        <div className="h-0.5 w-full bg-[#DCECFF]" />

        {isSaved && !isEditing && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center text-xs font-medium text-green-700">
            Дані профілю збережено!
          </div>
        )}
        {citiesError && isEditing && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs font-medium text-red-700">
            {citiesError}
          </div>
        )}

        {isProfileLoading ? (
          <div className="text-sm text-ink-muted">
            Завантаження даних профілю...
          </div>
        ) : profileError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs font-medium text-red-700">
            {profileError}
          </div>
        ) : isEditing && form ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs font-medium text-red-700">
                {formError}
              </div>
            )}

            <FieldRow label="Електронна пошта" htmlFor="profile-email">
              <input
                id="profile-email"
                type="email"
                disabled
                value={profile?.email ?? ''}
                title="Пошта пов’язана з обліковим записом Google, змінити її тут не можна"
                className={`${inputClass()} cursor-not-allowed text-gray-500 opacity-70`}
              />
            </FieldRow>

            <FieldRow label="Ім’я" htmlFor="profile-first-name" required>
              <input
                id="profile-first-name"
                type="text"
                required
                value={form.first_name}
                onChange={(e) => updateForm({ first_name: e.target.value })}
                className={inputClass()}
              />
            </FieldRow>

            <FieldRow label="Прізвище" htmlFor="profile-last-name" required>
              <input
                id="profile-last-name"
                type="text"
                required
                value={form.last_name}
                onChange={(e) => updateForm({ last_name: e.target.value })}
                className={inputClass()}
              />
            </FieldRow>

            <FieldRow
              label="Нікнейм"
              htmlFor="profile-nickname"
              required
              hint="3–30 символів: латиниця, цифри, «_» і «.»"
            >
              <input
                id="profile-nickname"
                type="text"
                required
                maxLength={30}
                value={form.nickname}
                onChange={(e) => updateForm({ nickname: e.target.value })}
                className={inputClass()}
              />
            </FieldRow>

            <FieldRow
              label="Дата народження"
              htmlFor="profile-birth-date"
              required
              hint="Платформою можуть користуватися особи від 18 років"
            >
              <input
                id="profile-birth-date"
                type="date"
                required
                max={MAX_BIRTH_DATE}
                value={form.birth_date}
                onChange={(e) => updateForm({ birth_date: e.target.value })}
                className={inputClass()}
              />
            </FieldRow>

            <FieldRow label="Стать" htmlFor="profile-gender">
              <select
                id="profile-gender"
                value={form.gender}
                onChange={(e) =>
                  updateForm({ gender: e.target.value as Gender })
                }
                className={selectClass()}
              >
                <option value="prefer_not_to_say">Волію не вказувати</option>
                <option value="female">Жіноча</option>
                <option value="male">Чоловіча</option>
              </select>
            </FieldRow>

            <FieldRow
              label="Телефон"
              htmlFor="profile-phone"
              required
              hint={phoneError ?? undefined}
              hintIsError={Boolean(phoneError)}
            >
              <input
                id="profile-phone"
                type="tel"
                required
                value={form.phone}
                onChange={handlePhoneChange}
                className={inputClass('sm', Boolean(phoneError))}
              />
            </FieldRow>

            <FieldRow label="Місто" htmlFor="profile-city" required>
              <select
                id="profile-city"
                value={form.city_id}
                onChange={(e) =>
                  updateForm({
                    city_id: e.target.value ? Number(e.target.value) : '',
                  })
                }
                className={selectClass()}
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
            </FieldRow>

            <FieldRow
              label="Біографія"
              htmlFor="profile-bio"
              hint="До 2000 символів; порожнє поле прибирає біографію"
            >
              <textarea
                id="profile-bio"
                rows={4}
                maxLength={2000}
                value={form.bio}
                onChange={(e) => updateForm({ bio: e.target.value })}
                className={textareaClass}
              />
            </FieldRow>

            <div className="mt-4 flex flex-wrap gap-4">
              <ActionButton
                type="submit"
                disabled={
                  isSubmitting ||
                  Boolean(phoneError) ||
                  !form.city_id ||
                  cities.length === 0
                }
              >
                {isSubmitting ? 'Збереження...' : 'Зберегти зміни'}
              </ActionButton>
              <ActionButton onClick={cancelEditing} disabled={isSubmitting}>
                Скасувати
              </ActionButton>
            </div>
          </form>
        ) : profile ? (
          <div className="flex flex-col gap-3">
            <FieldRow label="Електронна пошта">
              <ValuePill>{profile.email}</ValuePill>
            </FieldRow>
            <FieldRow label="Ім’я">
              <ValuePill>{profile.first_name}</ValuePill>
            </FieldRow>
            <FieldRow label="Прізвище">
              <ValuePill>{profile.last_name}</ValuePill>
            </FieldRow>
            <FieldRow label="Нікнейм">
              <ValuePill>{profile.nickname}</ValuePill>
            </FieldRow>
            <FieldRow label="Дата народження">
              <ValuePill>{formatDate(profile.birth_date)}</ValuePill>
            </FieldRow>
            <FieldRow label="Стать">
              <ValuePill>{GENDER_LABELS[profile.gender]}</ValuePill>
            </FieldRow>
            <FieldRow label="Телефон">
              <ValuePill>{profile.phone}</ValuePill>
            </FieldRow>
            <FieldRow label="Місто">
              <ValuePill>
                {profile.city
                  ? `${profile.city.name} (${profile.city.region})`
                  : 'Не вказано'}
              </ValuePill>
            </FieldRow>
            <FieldRow label="Біографія">
              <ValuePill multiline>{profile.bio || 'Не вказано'}</ValuePill>
            </FieldRow>
          </div>
        ) : null}

        {/* Кнопки дій: редагувати, організація, вийти */}
        {!isEditing && (
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <ActionButton
              onClick={startEditing}
              disabled={isProfileLoading || !profile}
              icon="⚙"
            >
              Редагувати профіль
            </ActionButton>
            {user?.organization ? (
              <ActionButton
                onClick={() =>
                  void navigate(`/organizations/${user.organization?.id}`)
                }
                icon="🏢"
              >
                Моя організація
              </ActionButton>
            ) : (
              <ActionButton
                onClick={() => void navigate('/organization/create')}
                icon="＋"
              >
                Створити організацію
              </ActionButton>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="ml-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border border-red-500 bg-white px-3 text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
            >
              <span aria-hidden="true">⇥</span> Вийти
            </button>
          </div>
        )}

        {/* Дані організації, якщо вона є */}
        {user?.organization && !isEditing && (
          <div className="flex flex-col gap-3 rounded-lg border border-[#DCECFF] bg-[#F7FBFF] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold">
                {orgData?.name ?? user.organization.name}
              </span>
              <Chip tone="role">
                Роль: {getOrgRoleLabel(user.organization.role)}
              </Chip>
              {getOrgStatusLabel(user.organization.status) && (
                <Chip>{getOrgStatusLabel(user.organization.status)}</Chip>
              )}
              {canEditOrganization(user.organization) && (
                <ActionButton
                  onClick={() => void navigate('/organization/edit')}
                >
                  Редагувати організацію
                </ActionButton>
              )}
            </div>
            {isOrgLoading ? (
              <div className="text-xs text-ink-muted">
                Завантаження даних організації...
              </div>
            ) : orgError ? (
              <div className="text-xs text-red-700">{orgError}</div>
            ) : (
              <>
                <FieldRow label="Електронна пошта">
                  <ValuePill>{orgData?.email ?? '—'}</ValuePill>
                </FieldRow>
                <FieldRow label="Телефон">
                  <ValuePill>{orgData?.phone ?? '—'}</ValuePill>
                </FieldRow>
                <FieldRow label="Код ЄДРПОУ">
                  <ValuePill>{orgData?.edrpou || 'Не вказано'}</ValuePill>
                </FieldRow>
                <FieldRow label="Опис">
                  <ValuePill multiline>
                    {orgData?.description || 'Опис відсутній'}
                  </ValuePill>
                </FieldRow>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfilePage
