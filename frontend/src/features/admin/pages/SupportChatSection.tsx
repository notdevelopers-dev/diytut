import React, { useState } from 'react'
import { Send } from 'lucide-react'

interface Message {
  id: number
  from: 'user' | 'admin'
  text: string
  time: string
}

const formatTime = () =>
  new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })

export const SupportChatSection: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      from: 'user',
      text: 'Доброго дня! Не можу завершити реєстрацію організації.',
      time: '10:42',
    },
  ])
  const [draft, setDraft] = useState('')

  const handleSend = () => {
    const text = draft.trim()
    if (text === '') return
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), from: 'admin', text, time: formatTime() },
    ])
    setDraft('')
  }

  return (
    <div>
      <h1 className="mb-6 inline-block rounded-lg bg-[#F1D387] px-4 py-2 text-xl font-bold shadow-sm">
        Чат підтримки
      </h1>

      <div className="flex h-[28rem] flex-col rounded-lg border border-[#79B7FF] bg-white">
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[75%] rounded-xl px-4 py-2 text-sm ${
                message.from === 'admin'
                  ? 'self-end bg-[#79B7FF]'
                  : 'self-start bg-[#DCECFF]'
              }`}
            >
              <div>{message.text}</div>
              <div className="mt-1 text-right text-xs text-[#8B99AA]">
                {message.time}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-[#DCECFF] p-3">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend()
            }}
            placeholder="Напишіть повідомлення"
            className="flex-1 rounded-lg border border-[#79B7FF] bg-[#DCECFF] px-3 py-2 text-sm font-bold placeholder:font-bold placeholder:text-[#8B99AA] focus:outline-none"
          />
          <button
            onClick={handleSend}
            aria-label="Надіслати"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#79B7FF] shadow-md transition hover:opacity-90"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default SupportChatSection
