import fs from 'fs'
import path from 'path'

let _fustatRegular: Buffer | undefined
let _fustatVariable: Buffer | undefined

export function getOgFonts() {
  if (!_fustatRegular) _fustatRegular = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Fustat/Fustat-Regular.ttf'))
  if (!_fustatVariable) _fustatVariable = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Fustat/Fustat-VariableFont_wght.ttf'))
  return [
    { name: 'Fustat', data: _fustatRegular as Buffer, weight: 400 as const, style: 'normal' as const },
    { name: 'Fustat', data: _fustatVariable as Buffer, weight: 900 as const, style: 'normal' as const },
  ]
}

let _logo: string | undefined

export function getLogoDataUrl(): string {
  if (!_logo) {
    const buf = fs.readFileSync(path.join(process.cwd(), 'public/logo.png'))
    _logo = `data:image/png;base64,${buf.toString('base64')}`
  }
  return _logo
}

// Satori only supports JPEG, PNG, and GIF — WebP/AVIF will crash the renderer.
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/gif'])

export async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!SUPPORTED.has(mimeType)) return undefined
    const buffer = await res.arrayBuffer()
    return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`
  } catch {
    return undefined
  }
}
