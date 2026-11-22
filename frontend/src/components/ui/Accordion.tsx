import { useId, useState } from 'react'
import type { ReactNode } from 'react'

export interface AccordionItem {
  id: string
  title: string
  content: ReactNode
}

/**
 * Акордеон: кожен пункт розгортається окремо (кнопка з aria-expanded і
 * прив’язана панель), за замовчуванням усі згорнуті.
 */
export const Accordion = ({ items }: { items: AccordionItem[] }) => {
  const baseId = useId()
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const isOpen = openIds.has(item.id)
        const buttonId = `${baseId}-${item.id}-button`
        const panelId = `${baseId}-${item.id}-panel`
        return (
          <li
            key={item.id}
            className="overflow-hidden rounded-[5px] border-2 border-[#DCECFF] bg-white"
          >
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left text-base font-medium text-black transition-colors hover:bg-[#F3F8FF] sm:text-lg"
              >
                {item.title}
                <span
                  aria-hidden="true"
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full bg-[#DCECFF] text-lg text-main transition-transform ${
                    isOpen ? 'rotate-45' : ''
                  }`}
                >
                  +
                </span>
              </button>
            </h3>
            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="border-t border-[#DCECFF] px-4 py-3 text-sm leading-relaxed text-[#3B4A5C] sm:text-base"
              >
                {item.content}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
