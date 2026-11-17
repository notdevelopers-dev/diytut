import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks'
import { useCities } from '@/features/cities'
import { useMyOrganization } from '@/features/organizations/hooks'
import {
  canEditOrganization,
  getOrgRoleLabel,
  getOrgStatusLabel,
} from '@/features/organizations/utils'
import addOrganizationIcon from '@/assets/icons/menu/add-organization.svg'
import avatarIcon from '@/assets/icons/menu/avatar.svg'
import closeIcon from '@/assets/icons/menu/close.svg'
import logoutIcon from '@/assets/icons/menu/logout.svg'
import organizationIcon from '@/assets/icons/menu/organization.svg'
import profileIcon from '@/assets/icons/menu/profile.svg'
import settingsIcon from '@/assets/icons/menu/settings.svg'
import { getApiErrorMessage, getErrorStatus } from '@/lib/errors'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import type { Gender, VolunteerProfile } from '../api'
import { useMyProfile, useUpdateMyProfile } from '../hooks'
import {
  changeAccount,
  setProfileMode,
  useProfileMode,
  type ProfileMode,
} from '../profileMode'

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
    className={`inline-flex h-8 items-center rounded-full border px-4 text-sm ${
      tone === 'role'
        ? 'border-main bg-[#DCECFF] text-main'
        : 'border-[#DCECFF] bg-white text-black'
    }`}
  >
    {children}
  </span>
)

/** Значення поля у режимі перегляду: «пігулка» фіксованої ширини, як у макеті (трохи більша). */
const ValuePill = ({
  children,
  multiline = false,
}: {
  children: ReactNode
  multiline?: boolean
}) => (
  <div
    className={`w-full max-w-[440px] border border-[#DCECFF] bg-white px-5 text-sm text-gray-700 ${
      multiline
        ? 'min-h-10 rounded-[20px] whitespace-pre-wrap py-2.5'
        : 'flex min-h-10 items-center rounded-full py-1.5'
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
  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-6">
    <label
      htmlFor={htmlFor}
      className="flex shrink-0 items-center text-base font-bold whitespace-nowrap text-black sm:h-10 sm:w-48"
    >
      {label}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
    <div className="flex w-full flex-col gap-1">
      {children}
      {hint && (
        <span
          className={`text-xs ${hintIsError ? 'text-red-500' : 'text-ink-muted'}`}
        >
          {hint}
        </span>
      )}
    </div>
  </div>
)

/** Поле форми редагування (макет «profile edit page», трохи збільшене): блакитне поле 40px висотою. */
const editFieldClass = (invalid = false) =>
  `w-full rounded-[7px] border bg-[#DCECFF] px-4 text-sm text-black focus:ring-2 focus:ring-main/40 focus:outline-none ${
    invalid ? 'border-red-500' : 'border-main'
  }`

/** Підпис над полем і підказка під ним. */
const EditField = ({
  label,
  htmlFor,
  hint,
  hintIsError = false,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string | null
  hintIsError?: boolean
  children: ReactNode
}) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={htmlFor} className="text-sm font-medium text-black">
      {label}
    </label>
    {children}
    {hint && (
      <span
        className={`text-xs ${hintIsError ? 'text-red-500' : 'text-ink-muted'}`}
      >
        {hint}
      </span>
    )}
  </div>
)

/** Аватар-заглушка (фото профілю бекенд поки не зберігає). */
// Іконка з макета (carbon:user-avatar-filled), блакитна, як у Figma
const ProfileAvatar = () => (
  <img
    src={avatarIcon}
    alt=""
    width={128}
    height={128}
    className="size-32 shrink-0"
  />
)

/** Блакитна кнопка дії з макета. */
const ActionButton = ({
  children,
  icon,
  iconSrc,
  type = 'button',
  onClick,
  disabled = false,
}: {
  children: ReactNode
  icon?: string
  iconSrc?: string
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className="flex h-11 min-w-[220px] cursor-pointer items-center gap-3 rounded-full border border-main/40 bg-[#DCECFF] px-5 text-sm font-medium text-black transition-colors hover:bg-[#cde2fe] disabled:cursor-not-allowed disabled:opacity-50"
  >
    {iconSrc && <img src={iconSrc} alt="" width={20} height={20} />}
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
  const location = useLocation()
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

  // Режим профілю (волонтер / організація) — перемикається в меню чи кнопкою тут
  const isOrgMode = useProfileMode() === 'organization'
  const switchMode = (mode: ProfileMode) => {
    setProfileMode(mode)
    window.scrollTo({ top: 0 })
  }

  // Режим редагування анкети
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<ProfileForm | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)

  const handleLogout = () => {
    setProfileMode('volunteer')
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

  // «Редагувати профіль» у меню відкриває сторінку одразу в режимі редагування:
  // navigate('/profile', { state: { edit: true } }). Вмикаємо його один раз на кожен
  // такий перехід, щойно є дані анкети (оновлення стану під час рендеру, без ефекту)
  const wantsEdit = Boolean((location.state as { edit?: boolean } | null)?.edit)
  const [handledEditKey, setHandledEditKey] = useState<string | null>(null)
  if (wantsEdit && profile && handledEditKey !== location.key) {
    setHandledEditKey(location.key)
    setForm(toForm(profile))
    setPhoneError(null)
    setFormError(null)
    setIsSaved(false)
    setIsEditing(true)
  }
  // Прибираємо прапорець з історії, щоб оновлення сторінки не відкривало форму знову
  useEffect(() => {
    if (wantsEdit && handledEditKey === location.key) {
      void navigate('/profile', { replace: true, state: null })
    }
  }, [wantsEdit, handledEditKey, location.key, navigate])

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
    if (!form.birth_date || form.birth_date > MAX_BIRTH_DATE) {
      setFormError('Платформою можуть користуватися особи від 18 років')
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

  // Режим редагування — окремий екран за макетом «profile edit page»
  if (isEditing && form) {
    return (
      <div className="flex flex-col">
        {/* Заголовок на всю ширину: назва під логотипом, ✕ під кнопкою меню */}
        <div className="flex w-full items-center justify-between gap-4 px-8 py-4">
          <h1 className="font-head text-2xl font-normal text-main sm:text-3xl">
            Редагувати профіль
          </h1>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={isSubmitting}
            aria-label="Скасувати редагування"
            title="Скасувати"
            className="flex h-[46px] w-[55px] shrink-0 cursor-pointer items-center justify-center rounded-[11px] bg-[#F8B26C] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <img src={closeIcon} alt="" width={35} height={35} />
          </button>
        </div>
        <div className="h-1 bg-main" />

        <form
          onSubmit={handleSubmit}
          noValidate
          className="mx-auto flex w-full max-w-[1040px] flex-col gap-8 px-4 py-8 sm:px-8"
        >
          <div className="flex justify-center">
            <ProfileAvatar />
          </div>

          {formError && (
            <div className="rounded-lg bg-red-100 p-3 text-center text-sm text-red-700">
              {formError}
            </div>
          )}
          {citiesError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm font-medium text-red-700">
              {citiesError}
            </div>
          )}

          <div className="mx-auto grid w-full max-w-[420px] gap-x-12 gap-y-5 lg:max-w-none lg:grid-cols-[minmax(0,320px)_1fr_minmax(0,320px)]">
            {/* Ліва колонка */}
            <div className="flex flex-col gap-5">
              <EditField label="Ім’я" htmlFor="profile-first-name">
                <input
                  id="profile-first-name"
                  type="text"
                  required
                  value={form.first_name}
                  onChange={(e) => updateForm({ first_name: e.target.value })}
                  className={`h-10 ${editFieldClass()}`}
                />
              </EditField>
              <EditField label="Прізвище" htmlFor="profile-last-name">
                <input
                  id="profile-last-name"
                  type="text"
                  required
                  value={form.last_name}
                  onChange={(e) => updateForm({ last_name: e.target.value })}
                  className={`h-10 ${editFieldClass()}`}
                />
              </EditField>
              <EditField label="Нікнейм" htmlFor="profile-nickname">
                <input
                  id="profile-nickname"
                  title="3–30 символів: латиниця, цифри, «_» і «.»"
                  type="text"
                  required
                  maxLength={30}
                  value={form.nickname}
                  onChange={(e) => updateForm({ nickname: e.target.value })}
                  className={`h-10 ${editFieldClass()}`}
                />
              </EditField>
              <EditField label="Дата народження" htmlFor="profile-birth-date">
                <input
                  id="profile-birth-date"
                  title="Платформою можуть користуватися особи від 18 років"
                  type="date"
                  required
                  max={MAX_BIRTH_DATE}
                  value={form.birth_date}
                  onChange={(e) => updateForm({ birth_date: e.target.value })}
                  className={`h-10 ${editFieldClass()}`}
                />
              </EditField>
            </div>

            {/* «Зберегти» посередині (на телефоні — під полями) */}
            <div className="order-last flex items-center justify-center pt-2 lg:order-none lg:pt-0">
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  Boolean(phoneError) ||
                  !form.city_id ||
                  cities.length === 0
                }
                className="h-[52px] w-[200px] cursor-pointer rounded-full bg-main text-base font-medium text-black shadow-[0px_3px_4px_0px_rgba(26,44,74,0.25)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>

            {/* Права колонка */}
            <div className="flex flex-col gap-5">
              {/* Значення відповідають GenderEnum бекенду */}
              <EditField label="Стать" htmlFor="profile-gender">
                <select
                  id="profile-gender"
                  value={form.gender}
                  onChange={(e) =>
                    updateForm({ gender: e.target.value as Gender })
                  }
                  className={`h-10 ${editFieldClass()}`}
                >
                  <option value="prefer_not_to_say">Волію не вказувати</option>
                  <option value="female">Жіноча</option>
                  <option value="male">Чоловіча</option>
                </select>
              </EditField>
              {/* Порожня біографія зберігається як null */}
              <EditField label="Біографія" htmlFor="profile-bio">
                <textarea
                  id="profile-bio"
                  rows={1}
                  maxLength={2000}
                  placeholder="Біографія"
                  value={form.bio}
                  onChange={(e) => updateForm({ bio: e.target.value })}
                  className={`min-h-10 resize-y py-2 ${editFieldClass()}`}
                />
              </EditField>
              <EditField
                label="Телефон"
                htmlFor="profile-phone"
                hint={phoneError}
                hintIsError
              >
                <input
                  id="profile-phone"
                  type="tel"
                  required
                  placeholder="+380"
                  value={form.phone}
                  onChange={handlePhoneChange}
                  className={`h-10 ${editFieldClass(Boolean(phoneError))}`}
                />
              </EditField>
              <EditField
                label="Місто"
                htmlFor="profile-city"
                hint={
                  cities.length === 0 && !citiesError
                    ? 'Список міст ще завантажується'
                    : null
                }
              >
                <select
                  id="profile-city"
                  value={form.city_id}
                  onChange={(e) =>
                    updateForm({
                      city_id: e.target.value ? Number(e.target.value) : '',
                    })
                  }
                  className={`h-10 ${editFieldClass()}`}
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
              </EditField>
            </div>
          </div>
        </form>
      </div>
    )
  }

  // Режим організації: та сама розмітка, але з даними організації з GET /organizations/me.
  // Списки проєктів і учасників — окрема задача (SCRUM-131)
  if (isOrgMode && user?.organization) {
    const org = user.organization
    const city = cities.find((c) => c.id === orgData?.city_id)
    return (
      <div className="flex flex-col">
        <div className="border-y border-info bg-cream px-3 py-1">
          <h1 className="text-3xl font-normal text-black">
            Кабінет організації
          </h1>
        </div>

        <div className="flex w-full flex-col gap-5 px-3 py-4">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="flex size-32 shrink-0 items-center justify-center rounded-full bg-main">
              <img
                src={organizationIcon}
                alt=""
                width={72}
                height={72}
                className="brightness-0 invert"
              />
            </div>
            <div className="flex flex-col items-start gap-3">
              <Chip>{orgData?.name ?? org.name}</Chip>
              {orgData?.email && <Chip>{orgData.email}</Chip>}
              <Chip tone="role">Організація</Chip>
            </div>
          </div>

          <div className="h-0.5 w-full bg-[#DCECFF]" />

          {isOrgLoading ? (
            <div className="text-sm text-ink-muted">
              Завантаження даних організації...
            </div>
          ) : orgError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm font-medium text-red-700">
              {orgError}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <FieldRow label="Назва">
                <ValuePill>{orgData?.name ?? org.name}</ValuePill>
              </FieldRow>
              <FieldRow label="Електронна пошта">
                <ValuePill>{orgData?.email ?? '—'}</ValuePill>
              </FieldRow>
              <FieldRow label="Телефон">
                <ValuePill>{orgData?.phone ?? '—'}</ValuePill>
              </FieldRow>
              <FieldRow label="Місто">
                <ValuePill>
                  {city
                    ? `${city.name}${city.region ? ` (${city.region})` : ''}`
                    : 'Не вказано'}
                </ValuePill>
              </FieldRow>
              <FieldRow label="Код ЄДРПОУ">
                <ValuePill>{orgData?.edrpou || 'Не вказано'}</ValuePill>
              </FieldRow>
              <FieldRow label="Статус">
                <ValuePill>
                  {getOrgStatusLabel(org.status) ?? 'Невідомий'}
                </ValuePill>
              </FieldRow>
              <FieldRow label="Ваша роль">
                <ValuePill>{getOrgRoleLabel(org.role)}</ValuePill>
              </FieldRow>
              <FieldRow label="Опис">
                <ValuePill multiline>
                  {orgData?.description || 'Опис відсутній'}
                </ValuePill>
              </FieldRow>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            {canEditOrganization(org) && (
              <ActionButton
                onClick={() => void navigate('/organization/edit')}
                iconSrc={settingsIcon}
              >
                Редагувати організацію
              </ActionButton>
            )}
            <ActionButton
              onClick={() => switchMode('volunteer')}
              iconSrc={profileIcon}
            >
              Переключити на волонтера
            </ActionButton>
            <ActionButton
              onClick={() => void changeAccount()}
              iconSrc={profileIcon}
            >
              Змінити профіль
            </ActionButton>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-[#E14848] bg-white px-5 text-sm font-medium text-[#E14848] transition-colors hover:bg-red-50"
            >
              <img src={logoutIcon} alt="" width={18} height={18} /> Вийти
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Жовта смуга із заголовком сторінки (макет «volunteer info page») */}
      <div className="border-y border-info bg-cream px-3 py-1">
        <h1 className="text-3xl font-normal text-black">Особистий кабінет</h1>
      </div>

      {/* Макет: увесь вміст притиснутий до лівого краю (відступ ~13px) */}
      <div className="flex w-full flex-col gap-5 px-3 py-4">
        {/* Аватар, ім’я, пошта й роль */}
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <ProfileAvatar />
          <div className="flex flex-col items-start gap-3">
            <Chip>{user?.name ?? 'Користувач'}</Chip>
            <Chip>{user?.email}</Chip>
            <Chip tone="role">{roleLabel}</Chip>
          </div>
        </div>

        <div className="h-0.5 w-full bg-[#DCECFF]" />

        {isSaved && !isEditing && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center text-sm font-medium text-green-700">
            Дані профілю збережено!
          </div>
        )}

        {isProfileLoading ? (
          <div className="text-sm text-ink-muted">
            Завантаження даних профілю...
          </div>
        ) : profileError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm font-medium text-red-700">
            {profileError}
          </div>
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
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <ActionButton
              onClick={startEditing}
              disabled={isProfileLoading || !profile}
              iconSrc={settingsIcon}
            >
              Редагувати профіль
            </ActionButton>
            {user?.organization ? (
              <ActionButton
                onClick={() => void navigate('/organization/edit')}
                iconSrc={organizationIcon}
              >
                Моя організація
              </ActionButton>
            ) : (
              <ActionButton
                onClick={() => void navigate('/organization/create')}
                iconSrc={addOrganizationIcon}
              >
                Створити організацію
              </ActionButton>
            )}
            {user?.organization && (
              <ActionButton
                onClick={() => switchMode('organization')}
                iconSrc={profileIcon}
              >
                Переключити на організацію
              </ActionButton>
            )}
            <ActionButton
              onClick={() => void changeAccount()}
              iconSrc={profileIcon}
            >
              Змінити профіль
            </ActionButton>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-[#E14848] bg-white px-5 text-sm font-medium text-[#E14848] transition-colors hover:bg-red-50"
            >
              <img src={logoutIcon} alt="" width={18} height={18} /> Вийти
            </button>
          </div>
        )}

        {/* Дані організації, якщо вона є */}
        {user?.organization && !isEditing && (
          <div className="flex flex-col gap-3 rounded-lg border border-[#DCECFF] bg-[#F7FBFF] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-bold">
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
              <div className="text-sm text-ink-muted">
                Завантаження даних організації...
              </div>
            ) : orgError ? (
              <div className="text-sm text-red-700">{orgError}</div>
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
