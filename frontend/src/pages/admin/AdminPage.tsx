import React, { useState } from 'react';
import { Search, ChevronDown, Check, X, Bell, User, Menu, ChevronLeft, ChevronRight } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-[#F7FBFF] text-gray-900 font-sans p-6">
      {/* Верхня навігаційна панель */}
      <header className="flex items-center justify-between pb-4 border-b border-[#DCECFF] mb-6">
        <div className="flex items-center space-x-2">
          <span className="text-2xl font-bold text-[#79B7FF]">ДійТут</span>
        </div>
        
        <div className="flex-1 max-w-md mx-8 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-[#DCECFF] text-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#79B7FF]"
            placeholder="Пошук"
          />
        </div>

        <div className="flex items-center space-x-4">
          <button className="relative p-2 bg-[#DCECFF] rounded-full hover:bg-[#79B7FF] hover:text-white transition">
            <Bell className="w-5 h-5" />
            <span className="absolute top-0 right-0 bg-[#E14848] text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
              2
            </span>
          </button>
          <div className="bg-[#DCECFF] p-2 rounded-full">
            <User className="w-5 h-5 text-gray-700" />
          </div>
          <div className="bg-[#F1D387] p-2 rounded-lg cursor-pointer">
            <Menu className="w-5 h-5 text-gray-800" />
          </div>
        </div>
      </header>

      {/* Заголовок сторінки з жовтою плашкою як у Figma */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center bg-[#F1D387] px-4 py-2 rounded-lg shadow-sm">
            <h1 className="text-xl font-bold text-gray-900">Сповіщення організацій</h1>
          </div>
          <button className="text-sm font-medium hover:underline flex items-center space-x-1">
            <span>✔ Позначити все прочитаним</span>
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">2 нові запити чекають на ваш розгляд</p>
      </div>

      {/* Таби / Фільтри */}
      <div className="flex items-center space-x-3 mb-6 border-b border-[#DCECFF] pb-4">
        {[
          { key: 'all', label: 'Усі', count: 4 },
          { key: 'unread', label: 'Непрочитані', count: 2 },
          { key: 'pending', label: 'На розгляді', count: 2 },
          { key: 'processed', label: 'Опрацьовані', count: 2 },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.key
                ? 'bg-[#79B7FF] text-white shadow'
                : 'bg-[#DCECFF] text-gray-700 hover:bg-[#79B7FF]/50'
            }`}
          >
            {tab.label} <span className="ml-1 px-1.5 py-0.5 bg-white/50 rounded-full text-xs">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Пошук та фільтри таблиці */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Пошук за ім'ям або запитом"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#DCECFF]/50 border border-[#79B7FF]/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#79B7FF]"
          />
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="appearance-none bg-[#DCECFF]/50 border border-[#79B7FF]/30 rounded-lg px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-[#79B7FF]"
            >
              <option value="all">Статус: усі</option>
              <option value="pending">На розгляді</option>
              <option value="approved">Схвалено</option>
              <option value="rejected">Відхилено</option>
            </select>
            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Таблиця */}
      <div className="bg-white rounded-xl shadow-sm border border-[#DCECFF] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F1D387] text-gray-900 text-sm font-semibold">
              <th className="py-3 px-4">Волонтер / контакт</th>
              <th className="py-3 px-4">Запит</th>
              <th className="py-3 px-4">Дата подачі</th>
              <th className="py-3 px-4">Статус</th>
              <th className="py-3 px-4">Дії</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCECFF]">
            {requests.map(req => (
              <tr key={req.id} className="hover:bg-[#F7FBFF] transition">
                <td className="py-4 px-4">
                  <div className="font-semibold text-gray-900">{req.volunteerName}</div>
                  <div className="text-xs text-[#8B99AA]">{req.email}</div>
                </td>
                <td className="py-4 px-4 text-sm">
                  <div className="whitespace-pre-line text-gray-800">{req.requestType}</div>
                </td>
                <td className="py-4 px-4 text-sm text-gray-600">
                  <div>{req.date}</div>
                  <div className="text-xs text-[#8B99AA]">{req.time}</div>
                </td>
                <td className="py-4 px-4">
                  {req.status === 'pending' && (
                    <span className="inline-block px-3 py-1 bg-[#F1D387] text-gray-900 text-xs font-medium rounded-md">
                      На розгляді
                    </span>
                  )}
                  {req.status === 'approved' && (
                    <span className="inline-block px-3 py-1 bg-[#B5F291] text-gray-900 text-xs font-medium rounded-md">
                      Схвалено
                    </span>
                  )}
                  {req.status === 'rejected' && (
                    <span className="inline-block px-3 py-1 bg-[#E14848] text-white text-xs font-medium rounded-md">
                      Відхилено
                    </span>
                  )}
                </td>
                <td className="py-4 px-4">
                  {req.status === 'pending' ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleDecision(req.id, 'approved')}
                        className="px-3 py-1 bg-[#B5F291] text-gray-900 text-xs font-semibold rounded-md hover:opacity-90 transition flex items-center space-x-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Схвалити</span>
                      </button>
                      <button
                        onClick={() => handleDecision(req.id, 'rejected')}
                        className="px-3 py-1 bg-[#E14848] text-white text-xs font-semibold rounded-md hover:opacity-90 transition flex items-center space-x-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Відхилити</span>
                      </button>
                    </div>
                  ) : (
                    <button className="px-3 py-1 border border-[#79B7FF] text-[#79B7FF] text-xs font-semibold rounded-md hover:bg-[#DCECFF]/30 transition">
                      Переглянути
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Футер таблиці */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#F7FBFF] border-t border-[#DCECFF] text-sm text-gray-600">
          <span>Показано 1–4 із 4 запитів</span>
          <div className="flex items-center space-x-2">
            <button className="p-1.5 rounded-lg border border-[#DCECFF] hover:bg-[#DCECFF] disabled:opacity-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-[#79B7FF] text-white rounded-lg text-xs font-medium">1</span>
            <button className="p-1.5 rounded-lg border border-[#DCECFF] hover:bg-[#DCECFF]">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;