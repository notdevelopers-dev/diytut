import React, { useState } from 'react'
import {
  Search,
  ChevronDown,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { LoginStatsCard } from './LoginStatsCard'

interface OrgRequest {
  id: string
  volunteerName: string
  email: string
  requestType: string
  date: string
  time: string
  status: 'pending' | 'approved' | 'rejected'
}

type TabKey = 'all' | 'unread' | 'pending' | 'processed'

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Початкові дані (або заміна на виклик API бекенду)
  const [requests, setRequests] = useState<OrgRequest[]>([
    {
      id: '1',
      volunteerName: 'Марія Коваль',
      email: 'maria.koval@ukr.net',
      requestType: 'Вступ до організації\nПереглянути',
      date: '13.11.2026',
      time: '10:42',
      status: 'pending',
    },
    {
      id: '2',
      volunteerName: 'Андрій Мельник',
      email: 'andrii.m@ukr.net',
      requestType: 'Участь у події\nПереглянути',
      date: '13.11.2026',
      time: '09:15',
      status: 'pending',
    },
    {
      id: '3',
      volunteerName: 'Олена Бондар',
      email: 'olena.b@ukr.net',
      requestType: 'Вступ до організації\nВолонтерська допомога',
      date: '12.11.2026',
      time: '16:30',
      status: 'approved',
    },
    {
      id: '4',
      volunteerName: 'Дмитро Шевченко',
      email: 'dmytro.sh@ukr.net',
      requestType: 'Участь у події\nПакування допомоги',
      date: '11.11.2026',
      time: '14:05',
      status: 'rejected',
    },
  ])

  const handleDecision = (id: string, decision: 'approved' | 'rejected') => {
    setRequests((prev) =>
      prev.map((req) => (req.id === id ? { ...req, status: decision } : req)),
    )
  }

  // Лічильники рахуються з даних
  const pendingCount = requests.filter((r) => r.status === 'pending').length
  const processedCount = requests.length - pendingCount

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'all', label: 'Усі', count: requests.length },
    // Поки що "Непрочитані" = "На розгляді", бо окремого поля немає
    { key: 'unread', label: 'Непрочитані', count: pendingCount },
    { key: 'pending', label: 'На розгляді', count: pendingCount },
    { key: 'processed', label: 'Опрацьовані', count: processedCount },
  ]

  const filteredRequests = requests.filter((req) => {
    const matchesTab =
      activeTab === 'all' ||
      ((activeTab === 'pending' || activeTab === 'unread') &&
        req.status === 'pending') ||
      (activeTab === 'processed' && req.status !== 'pending')

    const matchesStatus = statusFilter === 'all' || req.status === statusFilter

    const query = searchQuery.trim().toLowerCase()
    const matchesSearch =
      query === '' ||
      req.volunteerName.toLowerCase().includes(query) ||
      req.email.toLowerCase().includes(query) ||
      req.requestType.toLowerCase().includes(query)

    return matchesTab && matchesStatus && matchesSearch
  })

  return (
    <div className="min-h-screen bg-[#F7FBFF] p-6 font-sans text-black">
      {/* Заголовок сторінки */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center rounded-lg bg-[#F1D387] px-4 py-2 shadow-sm">
            <h1 className="text-xl font-bold">Сповіщення організацій</h1>
          </div>
          <button className="flex items-center space-x-1 text-sm font-bold hover:underline">
            <span>✔ Позначити все прочитаним</span>
          </button>
        </div>
        <p className="mt-2 text-sm text-[#8B99AA]">
          {pendingCount > 0
            ? `Запитів на розгляді: ${pendingCount}`
            : 'Нових запитів немає'}
        </p>
      </div>

      {/* Статистика входів на сайт */}
      <LoginStatsCard />

      {/* Таби */}
      <div className="mb-6 flex items-center space-x-3 border-b border-[#DCECFF] pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              activeTab === tab.key
                ? 'bg-[#79B7FF] text-black shadow-md'
                : 'bg-[#DCECFF] text-black hover:bg-[#79B7FF]/50'
            }`}
          >
            {tab.label}{' '}
            <span className="ml-1 rounded-full bg-white/60 px-1.5 py-0.5 text-xs">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Пошук та фільтр */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row">
        <div className="flex flex-1 items-center rounded-lg border border-[#79B7FF] bg-[#DCECFF] p-0.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#79B7FF]">
            <Search className="h-4 w-4 text-white" />
          </div>
          <input
            type="text"
            placeholder="Пошук за ім'ям або запитом"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent px-3 text-sm font-bold placeholder:font-bold placeholder:text-[#8B99AA] focus:outline-none"
          />
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none rounded-lg border border-[#79B7FF] bg-[#DCECFF] px-4 py-2.5 pr-9 text-sm font-bold focus:ring-2 focus:ring-[#79B7FF] focus:outline-none"
          >
            <option value="all">Статус: усі</option>
            <option value="pending">На розгляді</option>
            <option value="approved">Схвалено</option>
            <option value="rejected">Відхилено</option>
          </select>
          <ChevronDown className="pointer-events-none absolute top-3 right-3 h-4 w-4 text-[#8B99AA]" />
        </div>
      </div>

      {/* Таблиця */}
      <div className="overflow-hidden rounded-xl border border-[#DCECFF] bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#F1D387] text-sm font-bold">
              <th className="px-4 py-3">Волонтер / контакт</th>
              <th className="px-4 py-3">Запит</th>
              <th className="px-4 py-3">Дата подачі</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Дії</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCECFF]">
            {filteredRequests.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm font-bold text-[#8B99AA]"
                >
                  Запитів не знайдено
                </td>
              </tr>
            )}
            {filteredRequests.map((req) => (
              <tr key={req.id} className="transition hover:bg-[#F7FBFF]">
                <td className="px-4 py-4">
                  <div className="font-bold">{req.volunteerName}</div>
                  <div className="text-xs text-[#8B99AA]">{req.email}</div>
                </td>
                <td className="px-4 py-4 text-sm">
                  <div className="whitespace-pre-line">{req.requestType}</div>
                </td>
                <td className="px-4 py-4 text-sm">
                  <div>{req.date}</div>
                  <div className="text-xs text-[#8B99AA]">{req.time}</div>
                </td>
                <td className="px-4 py-4">
                  {req.status === 'pending' && (
                    <span className="inline-block rounded-md border-2 border-[#F1D387] bg-[#F7FBFF] px-3 py-1 text-xs font-bold text-black">
                      У процесі
                    </span>
                  )}
                  {req.status === 'approved' && (
                    <span className="inline-block rounded-md border-2 border-[#B5F291] bg-[#F7FBFF] px-3 py-1 text-xs font-bold text-black">
                      Схвалено
                    </span>
                  )}
                  {req.status === 'rejected' && (
                    <span className="inline-block rounded-md border-2 border-[#E14848] bg-[#F7FBFF] px-3 py-1 text-xs font-bold text-[#E14848]">
                      Відхилено
                    </span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {req.status === 'pending' ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleDecision(req.id, 'approved')}
                        className="flex items-center space-x-1 rounded-lg bg-[#B5F291] px-3 py-1.5 text-xs font-bold text-black shadow-md transition hover:opacity-90"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Схвалити</span>
                      </button>
                      <button
                        onClick={() => handleDecision(req.id, 'rejected')}
                        className="flex items-center space-x-1 rounded-lg bg-[#E14848] px-3 py-1.5 text-xs font-bold text-white shadow-md transition hover:opacity-90"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Відхилити</span>
                      </button>
                    </div>
                  ) : (
                    <button className="rounded-lg bg-[#79B7FF] px-3 py-1.5 text-xs font-bold text-black shadow-md transition hover:opacity-90">
                      Переглянути
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Футер таблиці */}
        <div className="flex items-center justify-between border-t border-[#DCECFF] bg-[#F7FBFF] px-4 py-3 text-sm">
          <span className="text-[#8B99AA]">
            Показано {filteredRequests.length} із {requests.length} запитів
          </span>
          <div className="flex items-center space-x-2">
            <button className="cursor-not-allowed rounded-lg border border-[#C2D4EA] p-1.5 text-[#8B99AA]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="rounded-lg bg-[#79B7FF] px-3 py-1 text-xs font-bold text-black">
              1
            </span>
            <button className="cursor-not-allowed rounded-lg border border-[#C2D4EA] p-1.5 text-[#8B99AA]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminPage
