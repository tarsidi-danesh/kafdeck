import { useEffect, useState } from 'react'

type Toast = { id: string; kind: 'ok' | 'error' | 'info'; text: string }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = (kind: Toast['kind'], text: string) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, kind, text }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4200)
  }

  return {
    toasts,
    ok: (text: string) => push('ok', text),
    error: (text: string) => push('error', text),
    info: (text: string) => push('info', text),
  }
}

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          {toast.text}
        </div>
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
