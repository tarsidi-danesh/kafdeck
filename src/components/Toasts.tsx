import { useEffect, useRef, useState } from 'react'

type Toast = { id: string; kind: 'ok' | 'error' | 'info'; text: string }

// Errors are worth reading and often long, so they linger; anything can be
// dismissed early by clicking it.
const LIFETIME: Record<Toast['kind'], number> = { ok: 4200, info: 4200, error: 12000 }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, number>())

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer))
      timers.current.clear()
    },
    [],
  )

  const dismiss = (id: string) => {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((item) => item.id !== id))
  }

  const push = (kind: Toast['kind'], text: string) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, kind, text }])
    timers.current.set(id, window.setTimeout(() => dismiss(id), LIFETIME[kind]))
  }

  return {
    toasts,
    dismiss,
    ok: (text: string) => push('ok', text),
    error: (text: string) => push('error', text),
    info: (text: string) => push('info', text),
  }
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          onClick={() => onDismiss(toast.id)}
          title="Dismiss"
        >
          {toast.text}
        </button>
      ))}
    </div>
  )
}

export function usePlatform() {
  const [platform, setPlatform] = useState('darwin')
  useEffect(() => {
    void window.kafdeck?.platform().then(setPlatform)
  }, [])
  return platform
}
