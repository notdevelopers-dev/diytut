import React, { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { apiClient } from '../../api/client'

type OrgStatus = 'pending' | 'approved' | 'rejected' | 'blocked'

interface OrgRequest {
  id: number
  name: string
  edrpou: string | null
  status: OrgStatus
  created_at: string
  review_comment: string | null
  creator: {
    email: string
    first_name: string | null
    last_name: string
    phone: string
  }
}

interface OrgRequestPage {
  items: OrgRequest[]
  total: number
}

const PAGE_SIZE = 10

const STATUS_STYLES: Record<OrgStatus, { label: string; className: string }> = {
  approved: { label: 'Схвалено', className: 'bg-[#B5F291] text-black' },
  pending: { label: 'На розгляді', className: 'bg-[#F1D387] text-black' },
  rejected: { label: 'Відхилено', className: 'bg-[#E14848] text-white' },
  blocked: { label: 'Заблоковано', className: 'bg-[#8B99AA] text-white' },
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('uk-UA')

const contactName = (req: OrgRequest) =>
  [req.creator.first_name, req.creator.last_name].filter(Boolean).join(' ')

export const OrgRequestsSection: React.FC = () => {
  const [items, setItems] = useState<OrgRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [viewing, setViewing] = useState<OrgRequest | null>(null)
  const [rejecting, setRejecting] = useState<OrgRequest | null>(null)
  const [rejectComment, setRejectComment] = useState('')

  useEffect(() => {
    let isCancelled = false
    apiClient
      .get<OrgRequestPage>('/admin/organizations', { params: { limit: 100 } })
      .then((response) => {
        if (isCancelled) return
        setItems(response.data.items)
        setHasError(false)
      })
      .catch((error: unknown) => {
        console.error('Не вдалося завантажити заявки організацій:', error)
        if (!isCancelled) setHasError(true)
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [reloadKey])

  const submitReview = useCallback(
    async (id: number, decision: 'approved' | 'rejected', comment?: string) => {
      setIsSaving(true)
      setActionError(null)
      try {
        await apiClient.post(`/admin/organizations/${id}/review`, {
          decision,
          comment: comment ?? null,
        })
        setRejecting(null)
        setRejectComment('')
        setReloadKey((key) => key + 1)
      } catch (error: unknown) {
        console.error('Не вдалося опрацювати заявку:', error)
        setActionError('Не вдалося зберегти рішення. Спробуйте ще раз.')
      } finally {
        setIsSaving(false)
      }
    },
    [],
  )

  const query = searchQuery.trim().toLowerCase()
  const filtered = items.filter(
    (req) =>
      query === '' ||
      req.name.toLowerCase().includes(query) ||
      (req.edrpou ?? '').includes(query),
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  return (
    <div>
      <h1 className="mb-6 inline-block rounded-lg bg-[#F1D387] px-4 py-2 text-xl font-bold shadow-sm">
        Запити на створення організації
      </h1>

      {/* Пошук */}
      <div className="mb-4 flex items-center rounded-lg border border-[#79B7FF] bg-[#DCECFF] p-0.5 md:max-w-md">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#79B7FF]">
          <Search className="h-4 w-4 text-white" />
        </div>
        <input
          type="text"
          placeholder="Пошук за назвою / ЄДРПОУ"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setPage(1)
          }}
          className="flex-1 bg-transparent px-3 text-sm font-bold placeholder:font-bold placeholder:text-[#8B99AA] focus:outline-none"
        />
      </div>

      {actionError && (
        <p className="mb-3 text-sm font-bold text-[#E14848]">{actionError}</p>
      )}

      {/* Таблиця */}
      <div className="overflow-x-auto rounded-lg border border-[#79B7FF] bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#F1D387]/60 text-xs font-bold">
              <th className="px-4 py-3">Назва організації / ЄДРПОУ</th>
              <th className="px-4 py-3">Контактна особа</th>
              <th className="px-4 py-3">Дата подачі</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Дії</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCECFF]">
            {isLoading && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[#8B99AA]"
                >
                  Завантаження...
                </td>
              </tr>
            )}
            {!isLoading && hasError && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center font-bold text-[#E14848]"
                >
                  Не вдалося завантажити запити
                </td>
              </tr>
            )}
            {!isLoading && !hasError && pageItems.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center font-bold text-[#8B99AA]"
                >
                  Запитів не знайдено
                </td>
              </tr>
            )}
            {pageItems.map((req) => (
              <tr key={req.id} className="transition hover:bg-[#F7FBFF]">
                <td className="px-4 py-3">
                  <div className="font-bold">{req.name}</div>
                  <div className="text-xs text-[#8B99AA]">
                    {req.edrpou ?? '—'}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-bold">{contactName(req)}</div>
                  <div>{req.creator.email}</div>
                  <div>{req.creator.phone}</div>
                </td>
                <td className="px-4 py-3 text-xs">
                  {formatDate(req.created_at)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-md px-3 py-1 text-xs font-bold ${STATUS_STYLES[req.status].className}`}
                  >
                    {STATUS_STYLES[req.status].label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {req.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        disabled={isSaving}
                        onClick={() => void submitReview(req.id, 'approved')}
                        className="rounded-md bg-[#B5F291] px-3 py-1 text-xs font-bold shadow-md transition hover:opacity-90 disabled:opacity-50"
                      >
                        Схвалити
                      </button>
                      <button
                        disabled={isSaving}
                        onClick={() => {
                          setActionError(null)
                          setRejecting(req)
                        }}
                        className="rounded-md bg-[#E14848] px-3 py-1 text-xs font-bold text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
                      >
                        Відхилити
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setViewing(req)}
                      className="rounded-md border border-[#79B7FF] bg-white px-3 py-1 text-xs font-bold transition hover:bg-[#DCECFF]"
                    >
                      Переглянути
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Футер таблиці */}
        <div className="flex items-center justify-between border-t border-[#DCECFF] px-4 py-3 text-xs">
          <span>
            {filtered.length === 0
              ? 'Показано 0 з 0'
              : `Показано ${startIndex + 1}-${startIndex + pageItems.length} з ${filtered.length}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Попередня сторінка"
              className="flex h-6 w-9 items-center justify-center rounded bg-[#79B7FF] disabled:cursor-not-allowed disabled:bg-[#C2D4EA]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label="Наступна сторінка"
              className="flex h-6 w-9 items-center justify-center rounded bg-[#79B7FF] disabled:cursor-not-allowed disabled:bg-[#C2D4EA]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Вікно відхилення: коментар обов'язковий */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h2 className="mb-2 text-lg font-bold">Відхилити запит</h2>
            <p className="mb-3 text-sm">
              {rejecting.name}. Вкажіть, що потрібно виправити (обов’язково).
            </p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              maxLength={2000}
              rows={4}
              className="mb-3 w-full rounded-lg border border-[#79B7FF] bg-[#DCECFF] p-2 text-sm focus:outline-none"
            />
            {actionError && (
              <p className="mb-2 text-sm font-bold text-[#E14848]">
                {actionError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejecting(null)
                  setRejectComment('')
                  setActionError(null)
                }}
                className="rounded-lg border border-[#79B7FF] px-4 py-2 text-sm font-bold"
              >
                Скасувати
              </button>
              <button
                disabled={isSaving || rejectComment.trim() === ''}
                onClick={() =>
                  void submitReview(
                    rejecting.id,
                    'rejected',
                    rejectComment.trim(),
                  )
                }
                className="rounded-lg bg-[#E14848] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Відхилити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Перегляд опрацьованої заявки */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h2 className="mb-2 text-lg font-bold">{viewing.name}</h2>
            <dl className="mb-4 space-y-1 text-sm">
              <div>
                <dt className="inline font-bold">ЄДРПОУ: </dt>
                <dd className="inline">{viewing.edrpou ?? '—'}</dd>
              </div>
              <div>
                <dt className="inline font-bold">Контакт: </dt>
                <dd className="inline">
                  {contactName(viewing)}, {viewing.creator.email},{' '}
                  {viewing.creator.phone}
                </dd>
              </div>
              <div>
                <dt className="inline font-bold">Статус: </dt>
                <dd className="inline">
                  {STATUS_STYLES[viewing.status].label}
                </dd>
              </div>
              <div>
                <dt className="inline font-bold">Коментар: </dt>
                <dd className="inline">{viewing.review_comment ?? '—'}</dd>
              </div>
            </dl>
            <div className="flex justify-end">
              <button
                onClick={() => setViewing(null)}
                className="rounded-lg bg-[#79B7FF] px-4 py-2 text-sm font-bold"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrgRequestsSection
