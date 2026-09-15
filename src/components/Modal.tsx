import { type ReactNode, useEffect } from 'react'

export function Modal({
  title,
  children,
  onClose,
  wide,
  xl,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  xl?: boolean
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${xl ? 'modal-xl' : wide ? 'modal-wide' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
