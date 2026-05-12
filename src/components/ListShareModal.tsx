'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ListRecordView, ListRecord } from '@/types'

interface Props {
  list: ListRecordView
  showNumbers: boolean
  onClose: () => void
}

const COLS = 5
const GAP = 16
const HEADER_H = 72
const W = 1200
const CELL_W = (W - (COLS - 1) * GAP) / COLS
const CELL_H = Math.round(CELL_W * (4 / 3))

function canvasHeight(itemCount: number) {
  const rows = Math.max(1, Math.ceil(itemCount / COLS))
  return HEADER_H + rows * CELL_H + (rows - 1) * GAP
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const timeout = setTimeout(() => { img.src = ''; resolve(null) }, 10000)
    img.onload = () => { clearTimeout(timeout); resolve(img) }
    img.onerror = () => { clearTimeout(timeout); resolve(null) }
    img.src = src
  })
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number, y: number, w: number, h: number
) {
  if (!img) {
    ctx.fillStyle = '#212427'
    ctx.fillRect(x, y, w, h)
    return
  }
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const scale = Math.max(w / iw, h / ih)
  const srcW = w / scale
  const srcH = h / scale
  const srcX = (iw - srcW) / 2
  const srcY = (ih - srcH) / 2
  ctx.drawImage(img, srcX, srcY, srcW, srcH, x, y, w, h)
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 0 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

async function generateImage(list: ListRecord, showNumbers: boolean): Promise<Blob> {
  await document.fonts.ready

  const items = list.items
  const rows = Math.max(1, Math.ceil(items.length / COLS))
  const H = canvasHeight(items.length)

  const [coverImages, logoImg] = await Promise.all([
    Promise.all(
      items.map((item) =>
        item.coverUrl
          ? loadImage(`/api/proxy-image?url=${encodeURIComponent(item.coverUrl)}`)
          : Promise.resolve(null)
      )
    ),
    loadImage('/logo.png'),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Header
  ctx.fillStyle = '#080B0E'
  ctx.fillRect(0, 0, W, HEADER_H)

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 32px "Space Grotesk"'
  ctx.fillText(truncate(ctx, list.name, W * 0.6), 24, (HEADER_H + 28) / 2)

  if (logoImg) {
    const logoH = 20
    const logoW = logoImg.naturalWidth * (logoH / logoImg.naturalHeight)
    ctx.drawImage(logoImg, W - 24 - logoW, (HEADER_H - logoH) / 2, logoW, logoH)
  }

  ctx.fillStyle = '#2E3133'
  ctx.fillRect(0, HEADER_H - 1, W, 1)

  // Cover grid
  for (let i = 0; i < rows * COLS; i++) {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const x = col * (CELL_W + GAP)
    const y = HEADER_H + row * (CELL_H + GAP)
    const item = items[i]

    if (!item) {
      ctx.fillStyle = '#15181A'
      ctx.fillRect(x, y, CELL_W, CELL_H)
      continue
    }

    drawCover(ctx, coverImages[i] ?? null, x, y, CELL_W, CELL_H)

    const grad = ctx.createLinearGradient(x, y + CELL_H - 48, x, y + CELL_H)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y + CELL_H - 48, CELL_W, 48)

    const baselineY = y + CELL_H - 11
    ctx.fillStyle = 'rgba(255,255,255,0.92)'

    if (item.award) {
      if (showNumbers) {
        ctx.font = '700 15px "Space Grotesk"'
        ctx.textAlign = 'left'
        const rankText = `#${item.position}`
        ctx.fillText(rankText, x + 9, baselineY)
        const rankW = ctx.measureText(rankText).width
        ctx.font = '500 13px "Space Grotesk"'
        ctx.textAlign = 'right'
        ctx.fillText(truncate(ctx, item.award, CELL_W - rankW - 28), x + CELL_W - 9, baselineY)
        ctx.textAlign = 'left'
      } else {
        ctx.font = '500 13px "Space Grotesk"'
        ctx.textAlign = 'right'
        ctx.fillText(truncate(ctx, item.award, CELL_W - 18), x + CELL_W - 9, baselineY)
        ctx.textAlign = 'left'
      }
    } else if (showNumbers) {
      ctx.font = '700 15px "Space Grotesk"'
      ctx.fillText(`#${item.position}`, x + 9, baselineY)
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.93
    )
  })
}

export default function ListShareModal({ list, showNumbers, onClose }: Props) {
  const rkey = list.uri.split('/').pop()!
  const userHandle = typeof window !== 'undefined'
    ? window.location.pathname.split('/')[1] || null
    : null
  const listUrl = userHandle ? `${window.location.origin}/${userHandle}/lists/${rkey}` : null

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const blobRef = useRef<Blob | null>(null)
  const prevUrlRef = useRef<string | null>(null)

  const itemCount = list.value.items.length
  const H = canvasHeight(itemCount)

  useEffect(() => {
    generateImage(list.value, showNumbers)
      .then((blob) => {
        blobRef.current = blob
        const url = URL.createObjectURL(blob)
        prevUrlRef.current = url
        setPreviewUrl(url)
      })
      .catch((err) => {
        console.error('Failed to generate image:', err)
        setError('Failed to generate preview image.')
      })
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <h2 style={{ margin: 0 }}>Share</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="share-preview">
          {previewUrl ? (
            <img src={previewUrl} alt="Share preview" />
          ) : (
            <div style={{ width: '100%', aspectRatio: `${W} / ${H}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              {error ? 'Error' : 'Generating…'}
            </div>
          )}
        </div>

        {listUrl && (
          <div className="form-field" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ margin: 0 }}>Public link</label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.75rem', padding: '2px 0 2px 8px', border: 'none', color: 'var(--accent)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.textDecoration = 'underline' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.textDecoration = '' }}
                onClick={() => {
                  navigator.clipboard.writeText(listUrl).then(() => {
                    setLinkCopied(true)
                    setTimeout(() => setLinkCopied(false), 2000)
                  })
                }}
              >
                {linkCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="input share-link-field">
              <span className="share-link-text">{listUrl}</span>
            </div>
          </div>
        )}

        {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={!previewUrl}
          onClick={() => {
            if (!previewUrl) return
            const a = document.createElement('a')
            a.href = previewUrl
            a.download = `${list.value.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.jpg`
            a.click()
          }}
        >
          Download image
        </button>
      </div>
    </div>
  )
}
