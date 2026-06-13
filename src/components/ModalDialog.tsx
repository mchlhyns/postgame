'use client'

import { useEffect, useRef } from 'react'

interface Props {
  onClose: () => void
  label: string
  overlayClassName?: string
  className?: string
  children: React.ReactNode
}

/**
 * Shared accessible modal shell: dialog semantics, focus trap, Escape to
 * close, body scroll lock, and focus restore to the opening element.
 * Clicking the overlay closes; clicks inside the card do not propagate.
 */
export default function ModalDialog({
  onClose,
  label,
  overlayClassName = 'modal-fullscreen-overlay',
  className = 'modal modal-fullscreen',
  children,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    // Move focus into the dialog unless a child (e.g. an autoFocus input)
    // already took it
    if (!cardRef.current?.contains(document.activeElement)) {
      cardRef.current?.focus()
    }
    return () => {
      document.body.style.overflow = ''
      prevFocusRef.current?.focus()
    }
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !cardRef.current) return
    const focusable = Array.from(
      cardRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select, a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.getClientRects().length > 0)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={overlayClassName} onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        ref={cardRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
