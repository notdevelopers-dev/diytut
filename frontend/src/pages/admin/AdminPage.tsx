import React, { useState } from 'react';
import { Search, ChevronDown, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface OrgRequest {
  id: string;
  volunteerName: string;
  email: string;
  requestType: string;
  date: string;
  time: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'pending' | 'processed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
  ]);

  const handleDecision = (id: string, decision: 'approved' | 'rejected') => {
    setRequests(prev =>
      prev.map(req => (req.id === id ? { ...req, status: decision } : req))
    );
  };

  const filteredRequests = requests.filter(req => {
    // Таби (поки що "Непрочитані" = "На розгляді", бо окремого поля немає)
    const matchesTab =
      activeTab === 'all' ||
      ((activeTab === 'pending' || activeTab === 'unread') && req.status === 'pending') ||
      (activeTab === 'processed' && req.status !== 'pending');

    // Випадаючий список статусу
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;

    // Пошук за ім'ям, email або типом запиту
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      query === '' ||
      req.volunteerName.toLowerCase().includes(query) ||
      req.email.toLowerCase().includes(query) ||
      req.requestType.toLowerCase().includes(query);

    return matchesTab && matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#F7FBFF] text-black font-sans p-6">
      {/* Заголовок сторінки */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center bg-[#F1D387] px-4 py-2 rounded-lg shadow-sm">
            <h1 className="text-xl font-bold">Сповіщення організацій</h1>
          </div>
          <button className="text-sm font-bold hover:underline flex items-center space-x-1">
            <span>✔ Позначити все прочитаним</span>
          </button>
        </div>
        <p className="text-sm text-[#8B99AA] mt-2">2 нові запити чекають на ваш розгляд</p>
      </div>

      {/* Таби */}
      <div className="flex items-center space-x-3 mb-6 border-b border-[#DCECFF] pb-4">
        {[
          { key: 'all', label: 'Усі', count: 4 },
          { key: 'unread', label: 'Непрочитані', count: 2 },
          { key: 'pending', label: 'На розгляді', count: 2 },
          { key: 'processed', label: 'Опрацьовані', count: 2 },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === tab.key
                ? 'bg-[#79B7FF] text-black shadow-md'
                : 'bg-[#DCECFF] text-black hover:bg-[#79B7FF]/50'
            }`}
          >
            {tab.label}{' '}
            <span className="ml-1 px-1.5 py-0.5 bg-white/60 rounded-full text-xs">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Пошук та фільтр */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Поле пошуку: іконка в синьому квадраті, як у макеті */}
        <div className="flex-1 flex items-center bg-[#DCECFF] border border-[#79B7FF] rounded-lg p-0.5">
          <div className="bg-[#79B7FF] rounded-md w-8 h-8 flex items-center justify-center shrink-0">
            <Search className="w-4 h-4 text-white" />
          </div>
          <input
            type="text"
            placeholder="Пошук за ім'ям або запитом"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent px-3 text-sm font-bold placeholder:text-[#8B99AA] placeholder:font-bold focus:outline-none"
          />
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none bg-[#DCECFF] border border-[#79B7FF] rounded-lg px-4 py-2.5 pr-9 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#79B7FF]"
          >
            <option value="all">Статус: усі</option>
            <option value="pending">На розгляді</option>
            <option value="approved">Схвалено</option>
            <option value="rejected">Відхилено</option>
          </select>
          <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-[#8B99AA] pointer-events-none" />
        </div>
      </div>

      {/* Таблиця */}
      <div className="bg-white rounded-xl shadow-sm border border-[#DCECFF] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F1D387] text-sm font-bold">
              <th className="py-3 px-4">Волонтер / контакт</th>
              <th className="py-3 px-4">Запит</th>
              <th className="py-3 px-4">Дата подачі</th>
              <th className="py-3 px-4">Статус</th>
              <th className="py-3 px-4">Дії</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCECFF]">
            {filteredRequests.map(req => (
              <tr key={req.id} className="hover:bg-[#F7FBFF] transition">
                <td className="py-4 px-4">
                  <div className="font-bold">{req.volunteerName}</div>
                  <div className="text-xs text-[#8B99AA]">{req.email}</div>
                </td>
                <td className="py-4 px-4 text-sm">
                  <div className="whitespace-pre-line">{req.requestType}</div>
                </td>
                <td className="py-4 px-4 text-sm">
                  <div>{req.date}</div>
                  <div className="text-xs text-[#8B99AA]">{req.time}</div>
                </td>
                <td className="py-4 px-4">
                  {/* Статуси як чипи з кольоровою рамкою */}
                  {req.status === 'pending' && (
                    <span className="inline-block px-3 py-1 bg-[#F7FBFF] border-2 border-[#F1D387] text-black text-xs font-bold rounded-md">
                      У процесі
                    </span>
                  )}
                  {req.status === 'approved' && (
                    <span className="inline-block px-3 py-1 bg-[#F7FBFF] border-2 border-[#B5F291] text-black text-xs font-bold rounded-md">
                      Схвалено
                    </span>
                  )}
                  {req.status === 'rejected' && (
                    <span className="inline-block px-3 py-1 bg-[#F7FBFF] border-2 border-[#E14848] text-[#E14848] text-xs font-bold rounded-md">
                      Відхилено
                    </span>
                  )}
                </td>
                <td className="py-4 px-4">
                  {req.status === 'pending' ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleDecision(req.id, 'approved')}
                        className="px-3 py-1.5 bg-[#B5F291] text-black text-xs font-bold rounded-lg shadow-md hover:opacity-90 transition flex items-center space-x-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Схвалити</span>
                      </button>
                      <button
                        onClick={() => handleDecision(req.id, 'rejected')}
                        className="px-3 py-1.5 bg-[#E14848] text-white text-xs font-bold rounded-lg shadow-md hover:opacity-90 transition flex items-center space-x-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Відхилити</span>
                      </button>
                    </div>
                  ) : (
                    <button className="px-3 py-1.5 bg-[#79B7FF] text-black text-xs font-bold rounded-lg shadow-md hover:opacity-90 transition">
                      Переглянути
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Футер таблиці */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#F7FBFF] border-t border-[#DCECFF] text-sm">
          <span className="text-[#8B99AA]">Показано 1–4 із 4 запитів</span>
          <div className="flex items-center space-x-2">
            <button className="p-1.5 rounded-lg border border-[#C2D4EA] text-[#8B99AA] cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-[#79B7FF] text-black rounded-lg text-xs font-bold">1</span>
            <button className="p-1.5 rounded-lg border border-[#C2D4EA] text-[#8B99AA] cursor-not-allowed">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;