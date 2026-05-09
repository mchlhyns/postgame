'use client'
import { useEffect } from 'react'

const STORAGE_KEY = 'cta_accent'

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function luminance(r: number, g: number, b: number): number {
  return [r, g, b].reduce((acc, c, i) => {
    const s = c / 255
    const lin = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    return acc + lin * [0.2126, 0.7152, 0.0722][i]
  }, 0)
}

export function accentTextColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  return luminance(...rgb) > 0.179 ? '#08121D' : '#ffffff'
}

function accentHover(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return '#' + rgb.map(c => Math.round(c + (255 - c) * 0.5).toString(16).padStart(2, '0')).join('')
}

export function applyAccent(hex: string) {
  document.documentElement.style.setProperty('--accent', hex)
  document.documentElement.style.setProperty('--accent-hover', accentHover(hex))
  document.documentElement.style.setProperty('--accent-text', accentTextColor(hex))
}

export function saveAccent(hex: string) {
  localStorage.setItem(STORAGE_KEY, hex)
  applyAccent(hex)
}

export function loadStoredAccent(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export default function AccentColorApplier() {
  useEffect(() => {
    const saved = loadStoredAccent()
    if (saved) applyAccent(saved)
  }, [])
  return null
}
