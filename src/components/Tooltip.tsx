'use client'

import { useId, useState } from 'react'

interface Props {
  text: string
  children: React.ReactNode
}

export default function Tooltip({ text, children }: Props) {
  const [visible, setVisible] = useState(false)
  const id = useId()

  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setVisible(false) }}
    >
      <span
        className="tooltip-trigger"
        tabIndex={0}
        aria-describedby={id}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        {children}
      </span>
      {/* Always rendered so aria-describedby stays valid; hidden until shown */}
      <span id={id} role="tooltip" className="tooltip-popover" style={visible ? undefined : { display: 'none' }}>
        {text}
      </span>
    </span>
  )
}
