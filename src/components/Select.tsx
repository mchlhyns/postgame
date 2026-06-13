'use client'

import { useState, useRef, useEffect, useId } from 'react'

export interface SelectOption {
  value: string
  label: string
  indent?: boolean
  header?: boolean
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  variant?: 'filter' | 'sort' | 'input'
  ariaLabel?: string
}

export default function Select({ value, onChange, options, variant = 'input', ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const selected = options.find((o) => o.value === value)
  const selectable = options.filter((o) => !o.header)

  const optionId = (index: number) => `${listboxId}-option-${index}`
  const activeId = open && activeIndex >= 0 ? optionId(activeIndex) : undefined

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  useEffect(() => {
    if (open && activeIndex >= 0) {
      document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex])

  function openMenu() {
    const idx = selectable.findIndex((o) => o.value === value)
    setActiveIndex(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  function commit(index: number) {
    const option = selectable[index]
    if (option) onChange(option.value)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(activeIndex); return }
    if (e.key === 'Tab') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, selectable.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0) }
    if (e.key === 'End') { e.preventDefault(); setActiveIndex(selectable.length - 1) }
  }

  const chevron = (
    <svg
      className={`select-arrow${open ? ' open' : ''}`}
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )

  return (
    <div ref={ref} className={`select select-${variant}`}>
      <button
        type="button"
        className="select-trigger"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.label ?? ''}</span>
        {chevron}
      </button>
      {open && (
        <div className="select-menu" role="listbox" id={listboxId}>
          {options.map((option) => option.header ? (
            <div key={option.value} className="select-option-header" role="presentation">
              {option.label}
            </div>
          ) : (
            <div
              key={option.value}
              id={optionId(selectable.findIndex((o) => o.value === option.value))}
              role="option"
              aria-selected={option.value === value}
              className={`select-option${option.indent ? ' select-option--indent' : ''}${option.value === value ? ' selected' : ''}${selectable[activeIndex]?.value === option.value ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(option.value); setOpen(false) }}
              onMouseEnter={() => setActiveIndex(selectable.findIndex((o) => o.value === option.value))}
            >
              {option.indent && <span style={{ marginRight: 6, opacity: 0.4 }} aria-hidden="true">↳</span>}{option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
