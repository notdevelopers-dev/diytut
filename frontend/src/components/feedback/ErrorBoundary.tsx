import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/** Ловить помилки рендеру, щоб замість білого екрана показати повідомлення. */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Помилка рендеру:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F7FBFF] p-6 text-center">
        <p className="text-lg font-bold text-black">Щось пішло не так</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="cursor-pointer rounded-lg bg-main px-4 py-2 text-sm font-medium text-white"
        >
          Оновити сторінку
        </button>
      </div>
    )
  }
}
