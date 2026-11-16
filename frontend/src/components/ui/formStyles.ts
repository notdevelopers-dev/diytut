const base =
  'w-full rounded-[5px] text-xs text-black outline outline-1 outline-offset-[-1px]'

/** Класи текстового поля; invalid підсвічує помилку червоним. */
export const inputClass = (size: 'sm' | 'md' = 'sm', invalid = false) =>
  [
    base,
    size === 'sm' ? 'h-8' : 'h-9',
    'px-3',
    invalid
      ? 'bg-red-50 outline-red-500'
      : 'bg-[#DCECFF] outline-sky-300 focus:outline-blue-500',
  ].join(' ')

/** Класи для <select> (менші горизонтальні відступи). */
export const selectClass = (size: 'sm' | 'md' = 'sm') =>
  inputClass(size).replace('px-3', 'px-2')

export const textareaClass = `${base} bg-[#DCECFF] p-3 outline-sky-300 focus:outline-blue-500`
