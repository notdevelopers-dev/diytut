import type { ReactNode } from 'react'

interface TextProps {
  children: ReactNode
  className?: string
}

const join = (...parts: (string | undefined)[]) =>
  parts.filter(Boolean).join(' ')

/** Заголовок сторінки. */
export const Title = ({ children, className }: TextProps) => (
  <h1 className={join('text-2xl font-bold text-main md:text-3xl', className)}>
    {children}
  </h1>
)

/** Заголовок секції. */
export const Subtitle = ({ children, className }: TextProps) => (
  <h2 className={join('text-lg font-bold text-black', className)}>
    {children}
  </h2>
)

/** Основний текст. */
export const Body = ({ children, className }: TextProps) => (
  <p className={join('text-sm text-black', className)}>{children}</p>
)

/** Підпис поля форми. */
export const FieldLabel = ({ children, className }: TextProps) => (
  <label
    className={join(
      'flex items-center text-xs font-medium text-black',
      className,
    )}
  >
    {children}
  </label>
)

/** Червона зірочка обов'язкового поля. */
export const RequiredMark = () => <span className="ml-1 text-red-500">*</span>

/** Текст помилки під полем. */
export const FieldError = ({ children, className }: TextProps) => (
  <span className={join('text-[10px] text-red-500', className)}>
    {children}
  </span>
)
