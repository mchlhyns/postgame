import fs from 'fs'
import path from 'path'

let _monoRegular: Buffer | undefined
let _monoBold: Buffer | undefined
let _fustatRegular: Buffer | undefined
let _fustatBold: Buffer | undefined

export function getOgFonts() {
  if (!_monoRegular) _monoRegular = fs.readFileSync(path.join(process.cwd(), 'public/fonts/SpaceMono/SpaceMono-Regular.ttf'))
  if (!_monoBold) _monoBold = fs.readFileSync(path.join(process.cwd(), 'public/fonts/SpaceMono/SpaceMono-Bold.ttf'))
  if (!_fustatRegular) _fustatRegular = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Fustat/Fustat-Regular.ttf'))
  if (!_fustatBold) _fustatBold = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Fustat/Fustat-Bold.ttf'))
  return [
    { name: 'SpaceMono', data: _monoRegular as Buffer, weight: 400 as const, style: 'normal' as const },
    { name: 'SpaceMono', data: _monoBold as Buffer, weight: 700 as const, style: 'normal' as const },
    { name: 'Fustat', data: _fustatRegular as Buffer, weight: 400 as const, style: 'normal' as const },
    { name: 'Fustat', data: _fustatBold as Buffer, weight: 700 as const, style: 'normal' as const },
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
