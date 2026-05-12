export default function DividerPattern({ color = 'currentColor', opacity = 0.15 }: { color?: string; opacity?: number }) {
  return (
    <svg width="100%" height="4" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flex: 1 }}>
      <defs>
        <pattern id="divider-checker" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect y="2" width="2" height="2" fill={color} fillOpacity={opacity} />
          <rect x="2" width="2" height="2" fill={color} fillOpacity={opacity} />
        </pattern>
      </defs>
      <rect width="100%" height="4" fill="url(#divider-checker)" />
    </svg>
  )
}
