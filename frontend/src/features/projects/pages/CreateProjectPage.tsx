import { useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Camera } from 'lucide-react'
import { useToast } from '@/components/feedback/useToast'
import { CityCombobox } from '@/features/cities/components/CityCombobox'
import { useCities } from '@/features/cities/hooks'
import type { ExperienceLevel, ProjectCategory } from '@/types/project'
import { createProject } from '../api'
import type { ProjectPayload } from '../api'
import { useCategories } from '../hooks'

type SaveMode = 'draft' | 'published'

const TITLE_MIN = 5
const TITLE_MAX = 100
const DESCRIPTION_MIN = 20
const DESCRIPTION_MAX = 2000
const MAX_CATEGORIES = 2
const MAX_TAGS = 5
const MAX_TAG_LENGTH = 30
const MAX_CAPACITY = 100000
const MAX_HOURS = 999.99

// Слова з літер і цифр, розділені одним «_», «-» або апострофом (як на бекенді)
const TAG_PATTERN = /^[\p{L}\p{N}]+(?:[_\-ʼ'’][\p{L}\p{N}]+)*$/u

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string }[] = [
  { value: 'novice', label: 'Без досвіду (новачок)' },
  { value: 'interested', label: 'Зацікавлений' },
  { value: 'amateur', label: 'Базовий досвід (аматор)' },
  { value: 'experienced', label: 'Досвідчений' },
  { value: 'pro', label: 'Потрібен спеціальний досвід (профі)' },
]

interface FormValues {
  title: string
  description: string
  startsAt: string
  endsAt: string
  isOnline: boolean
  cityId: number | ''
  address: string
  capacity: string
  volunteerHours: string
  isAdultOnly: boolean
  experienceLevel: ExperienceLevel
  categories: ProjectCategory[]
  tags: string[]
}

type ErrorKey =
  | 'title'
  | 'description'
  | 'startsAt'
  | 'endsAt'
  | 'cityId'
  | 'address'
  | 'capacity'
  | 'volunteerHours'
  | 'categories'

type FormErrors = Partial<Record<ErrorKey, string>>

const INITIAL_VALUES: FormValues = {
  title: '',
  description: '',
  startsAt: '',
  endsAt: '',
  isOnline: false,
  cityId: '',
  address: '',
  capacity: '',
  volunteerHours: '',
  isAdultOnly: false,
  experienceLevel: 'novice',
  categories: [],
  tags: [],
}

const normalizeTag = (raw: string) =>
  raw.trim().replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '_')

const parseHours = (value: string) => Number(value.replace(',', '.'))

/**
 * Для чернетки обов'язкова лише назва, а заповнені поля мають бути коректними.
 * Для публікації обов'язкові всі поля, які вимагає бекенд.
 */
const validate = (values: FormValues, mode: SaveMode): FormErrors => {
  const errors: FormErrors = {}
  const isPublish = mode === 'published'

  const title = values.title.trim()
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    errors.title = `Назва: від ${TITLE_MIN} до ${TITLE_MAX} символів`
  }

  const description = values.description.trim()
  if (
    (isPublish || description) &&
    (description.length < DESCRIPTION_MIN ||
      description.length > DESCRIPTION_MAX)
  ) {
    errors.description = `Опис: від ${DESCRIPTION_MIN} до ${DESCRIPTION_MAX} символів`
  }

  if (isPublish && !values.startsAt) {
    errors.startsAt = 'Вкажіть дату й час початку'
  }
  if (isPublish && !values.endsAt) {
    errors.endsAt = 'Вкажіть дату й час завершення'
  }
  if (
    values.startsAt &&
    values.endsAt &&
    new Date(values.endsAt) <= new Date(values.startsAt)
  ) {
    errors.endsAt = 'Завершення має бути пізніше за початок'
  }

  if (isPublish || values.capacity) {
    const capacity = Number(values.capacity)
    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > MAX_CAPACITY
    ) {
      errors.capacity = `Кількість місць: ціле число від 1 до ${MAX_CAPACITY}`
    }
  }

  if (isPublish || values.volunteerHours) {
    const hours = parseHours(values.volunteerHours)
    if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_HOURS) {
      errors.volunteerHours = `Години волонтерства: число від 0,01 до ${MAX_HOURS}`
    }
  }

  if (isPublish && !values.isOnline) {
    if (values.cityId === '') errors.cityId = 'Оберіть місто'
    if (!values.address.trim()) errors.address = 'Вкажіть адресу'
  }

  if (isPublish && values.categories.length < 1) {
    errors.categories = 'Оберіть хоча б одну категорію'
  }

  return errors
}

const buildPayload = (values: FormValues, mode: SaveMode): ProjectPayload => {
  const description = values.description.trim()
  const address = values.address.trim()
  return {
    status: mode,
    title: values.title.trim(),
    ...(description ? { description } : {}),
    ...(values.startsAt
      ? { starts_at: new Date(values.startsAt).toISOString() }
      : {}),
    ...(values.endsAt
      ? { ends_at: new Date(values.endsAt).toISOString() }
      : {}),
    is_online: values.isOnline,
    ...(!values.isOnline && values.cityId !== ''
      ? { city_id: values.cityId }
      : {}),
    ...(!values.isOnline && address ? { address } : {}),
    ...(values.capacity ? { capacity: Number(values.capacity) } : {}),
    ...(values.volunteerHours
      ? { volunteer_hours: parseHours(values.volunteerHours) }
      : {}),
    is_adult_only: values.isAdultOnly,
    experience_level: values.experienceLevel,
    categories: values.categories,
    tags: values.tags,
  }
}

const getSubmitError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status === 401) return 'Увійдіть, щоб створити проєкт'
    if (status === 403 || status === 404) {
      return 'Створювати проєкти можуть лише учасники схваленої організації'
    }
    if (status === 422) {
      return 'Сервер відхилив дані. Перевірте заповнені поля'
    }
  }
  return 'Не вдалося зберегти проєкт. Спробуйте ще раз'
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-lg border bg-[#DCECFF] px-3 py-2 text-sm placeholder:text-[#8B99AA] focus:ring-2 focus:ring-[#79B7FF] focus:outline-none ${
    hasError ? 'border-[#E14848]' : 'border-[#79B7FF]'
  }`

interface FieldProps {
  label: string
  isRequired?: boolean
  error?: string
  hint?: string
  children: ReactNode
}

const Field = ({ label, isRequired, error, hint, children }: FieldProps) => (
  <label className="flex flex-col gap-1">
    <span className="text-sm font-bold">
      {label}
      {isRequired && <span className="text-[#E14848]"> *</span>}
    </span>
    {children}
    {hint && !error && <span className="text-xs text-[#8B99AA]">{hint}</span>}
    {error && (
      <span role="alert" className="text-xs font-bold text-[#E14848]">
        {error}
      </span>
    )}
  </label>
)

export const CreateProjectPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { cities, error: citiesError } = useCities()
  const { data: categoryItems = [], isError: isCategoriesError } =
    useCategories()

  const [values, setValues] = useState<FormValues>(INITIAL_VALUES)
  const [errors, setErrors] = useState<FormErrors>({})
  const [attemptedMode, setAttemptedMode] = useState<SaveMode | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [tagError, setTagError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations'] })
      showToast(
        project.status === 'draft'
          ? 'Чернетку збережено'
          : 'Проєкт опубліковано',
      )
      // Окремого дашборда організації ще немає: ведемо на її сторінку
      void navigate(`/organizations/${project.organization_id}`)
    },
    onError: (error: unknown) => setSubmitError(getSubmitError(error)),
  })

  const isSubmitting = mutation.isPending
  const submittingMode = mutation.variables?.status

  // Після першої спроби збереження помилки оновлюються під час введення
  const update = (patch: Partial<FormValues>) => {
    const next = { ...values, ...patch }
    setValues(next)
    if (attemptedMode) setErrors(validate(next, attemptedMode))
  }

  const submit = (mode: SaveMode) => {
    setAttemptedMode(mode)
    const found = validate(values, mode)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSubmitError(null)
    mutation.mutate(buildPayload(values, mode))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submit('published')
  }

  const toggleCategory = (key: ProjectCategory) => {
    if (values.categories.includes(key)) {
      update({ categories: values.categories.filter((item) => item !== key) })
    } else if (values.categories.length < MAX_CATEGORIES) {
      update({ categories: [...values.categories, key] })
    }
  }

  const addTag = () => {
    const tag = normalizeTag(tagInput)
    if (!tag) return
    if (tag.length > MAX_TAG_LENGTH || !TAG_PATTERN.test(tag)) {
      setTagError(
        `Тег: до ${MAX_TAG_LENGTH} символів, лише літери, цифри, «_» і «-»`,
      )
      return
    }
    if (values.tags.includes(tag)) {
      setTagInput('')
      return
    }
    if (values.tags.length >= MAX_TAGS) {
      setTagError(`Не більше ${MAX_TAGS} тегів`)
      return
    }
    update({ tags: [...values.tags, tag] })
    setTagInput('')
    setTagError(null)
  }

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTag()
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 text-black">
      <h1 className="mb-6 text-2xl font-bold text-[#79B7FF]">
        Створити проєкт
      </h1>

      <form noValidate onSubmit={handleSubmit}>
        <fieldset
          disabled={isSubmitting}
          className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0"
        >
          <div className="grid gap-6 md:grid-cols-2">
            {/* Ліва колонка */}
            <div className="flex flex-col gap-4">
              <Field
                label="Назва проєкту"
                isRequired
                error={errors.title}
                hint={`${values.title.trim().length}/${TITLE_MAX}`}
              >
                <input
                  type="text"
                  value={values.title}
                  maxLength={TITLE_MAX + 20}
                  aria-invalid={Boolean(errors.title)}
                  placeholder="Волонтери"
                  onChange={(e) => update({ title: e.target.value })}
                  className={inputClass(Boolean(errors.title))}
                />
              </Field>

              <Field
                label="Опис проєкту"
                isRequired
                error={errors.description}
                hint={`${values.description.trim().length}/${DESCRIPTION_MAX}`}
              >
                <textarea
                  rows={5}
                  value={values.description}
                  aria-invalid={Boolean(errors.description)}
                  placeholder="Діяльність"
                  onChange={(e) => update({ description: e.target.value })}
                  className={inputClass(Boolean(errors.description))}
                />
              </Field>

              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={values.isOnline}
                  onChange={(e) => update({ isOnline: e.target.checked })}
                />
                Проєкт онлайн
              </label>

              {!values.isOnline && (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-bold">
                      Локація (місто)
                      <span className="text-[#E14848]"> *</span>
                    </span>
                    <CityCombobox
                      cities={cities}
                      value={values.cityId}
                      onChange={(cityId) => update({ cityId })}
                      placeholder="Київ"
                      inputClassName={inputClass(Boolean(errors.cityId))}
                    />
                    {(errors.cityId ?? citiesError) && (
                      <span
                        role="alert"
                        className="text-xs font-bold text-[#E14848]"
                      >
                        {errors.cityId ?? citiesError}
                      </span>
                    )}
                  </div>
                  <Field label="Адреса" isRequired error={errors.address}>
                    <input
                      type="text"
                      value={values.address}
                      aria-invalid={Boolean(errors.address)}
                      placeholder="вул. Волонтерська, 1"
                      onChange={(e) => update({ address: e.target.value })}
                      className={inputClass(Boolean(errors.address))}
                    />
                  </Field>
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Початок" isRequired error={errors.startsAt}>
                  <input
                    type="datetime-local"
                    value={values.startsAt}
                    aria-invalid={Boolean(errors.startsAt)}
                    onChange={(e) => update({ startsAt: e.target.value })}
                    className={inputClass(Boolean(errors.startsAt))}
                  />
                </Field>
                <Field label="Завершення" isRequired error={errors.endsAt}>
                  <input
                    type="datetime-local"
                    value={values.endsAt}
                    aria-invalid={Boolean(errors.endsAt)}
                    onChange={(e) => update({ endsAt: e.target.value })}
                    className={inputClass(Boolean(errors.endsAt))}
                  />
                </Field>
                <Field
                  label="Кількість місць"
                  isRequired
                  error={errors.capacity}
                >
                  <input
                    type="number"
                    min={1}
                    value={values.capacity}
                    aria-invalid={Boolean(errors.capacity)}
                    placeholder="20"
                    onChange={(e) => update({ capacity: e.target.value })}
                    className={inputClass(Boolean(errors.capacity))}
                  />
                </Field>
                <Field
                  label="Години волонтерства"
                  isRequired
                  error={errors.volunteerHours}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    value={values.volunteerHours}
                    aria-invalid={Boolean(errors.volunteerHours)}
                    placeholder="4"
                    onChange={(e) => update({ volunteerHours: e.target.value })}
                    className={inputClass(Boolean(errors.volunteerHours))}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={values.isAdultOnly}
                  onChange={(e) => update({ isAdultOnly: e.target.checked })}
                />
                18+ (лише для повнолітніх)
              </label>
            </div>

            {/* Права колонка */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold">Фото проєкту</span>
                <div className="flex h-40 items-center justify-center rounded-lg bg-[#C2D4EA] text-[#8B99AA]">
                  <Camera className="h-10 w-10" aria-hidden="true" />
                </div>
                <span className="text-xs text-[#8B99AA]">
                  Завантаження фото з’явиться пізніше
                </span>
              </div>

              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1 text-sm font-bold">
                  Необхідний досвід волонтера
                  <span className="text-[#E14848]"> *</span>
                </legend>
                {EXPERIENCE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-lg border border-[#79B7FF] bg-[#DCECFF] px-3 py-2 text-sm font-bold"
                  >
                    <input
                      type="radio"
                      name="experience"
                      value={option.value}
                      checked={values.experienceLevel === option.value}
                      onChange={() => update({ experienceLevel: option.value })}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
            </div>
          </div>

          {/* Категорії */}
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-sm font-bold">
              Теги категорій (до {MAX_CATEGORIES})
              <span className="text-[#E14848]"> *</span>
            </legend>
            {isCategoriesError && (
              <p className="text-xs font-bold text-[#E14848]">
                Не вдалося завантажити категорії. Оновіть сторінку.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {categoryItems.map((item) => {
                const isSelected = values.categories.includes(item.key)
                const isBlocked =
                  !isSelected && values.categories.length >= MAX_CATEGORIES
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isBlocked}
                    onClick={() => toggleCategory(item.key)}
                    className={`rounded-md border border-[#79B7FF] px-3 py-1 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      isSelected
                        ? 'bg-[#79B7FF]'
                        : 'bg-white hover:bg-[#DCECFF]'
                    }`}
                  >
                    {item.name}
                  </button>
                )
              })}
            </div>
            {errors.categories && (
              <span role="alert" className="text-xs font-bold text-[#E14848]">
                {errors.categories}
              </span>
            )}
          </fieldset>

          {/* Хештеги */}
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold">Хештеги (до {MAX_TAGS})</span>
              <input
                type="text"
                value={tagInput}
                placeholder="Введіть тег і натисніть Enter"
                onChange={(e) => {
                  setTagInput(e.target.value)
                  setTagError(null)
                }}
                onKeyDown={handleTagKeyDown}
                className={inputClass(Boolean(tagError))}
              />
            </label>
            {tagError && (
              <span role="alert" className="text-xs font-bold text-[#E14848]">
                {tagError}
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              {values.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-md border border-[#79B7FF] bg-white px-2 py-1 text-xs"
                >
                  #{tag}
                  <button
                    type="button"
                    aria-label={`Прибрати тег ${tag}`}
                    onClick={() =>
                      update({ tags: values.tags.filter((t) => t !== tag) })
                    }
                    className="font-bold text-[#E14848]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {submitError && (
            <p role="alert" className="text-sm font-bold text-[#E14848]">
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl bg-[#79B7FF] px-6 py-3 text-sm font-bold shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting && submittingMode === 'published'
                ? 'Публікуємо...'
                : 'Опублікувати проєкт'}
            </button>
            <button
              type="button"
              onClick={() => submit('draft')}
              className="rounded-xl border border-[#79B7FF] bg-white px-6 py-3 text-sm font-bold shadow-md transition hover:bg-[#DCECFF] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting && submittingMode === 'draft'
                ? 'Зберігаємо...'
                : 'Зберегти як чернетку'}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  )
}

export default CreateProjectPage
